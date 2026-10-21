#!/usr/bin/lua
-- Device fingerprint helper for modern-identify.
--
-- Usage: probe.lua <ipv4>
-- Prints one JSON object with the raw signals collected from the target.
-- Classification is done by the frontend; this helper only reports facts.
--
-- Requires nixio (shipped with LuCI) for UDP/TCP access. It is deliberately
-- read-only: a handful of small packets per call, no scans of whole subnets.

io.stdout:setvbuf("no")

local nixio = require "nixio"

local ip = arg and arg[1] or ""
local function valid_ip(value)
	if type(value) ~= "string" or not value:match("^%d+%.%d+%.%d+%.%d+$") then
		return false
	end
	for part in value:gmatch("%d+") do
		if tonumber(part) > 255 then return false end
	end
	return true
end

if not valid_ip(ip) then
	io.write('{"error":"invalid ip"}')
	os.exit(0)
end

local function now()
	return nixio.gettimeofday()
end

-- Sends every UDP probe first, then collects replies in one loop. The whole
-- batch shares a single timeout, so five probes cost one wait instead of five.
local function udp_batch(specs, timeout_ms)
	local results = {}
	local live = {}
	for _, spec in ipairs(specs) do
		local sock = nixio.socket("inet", "dgram")
		if sock then
			sock:sendto(spec.payload, ip, spec.port)
			sock:setblocking(false)
			live[#live + 1] = { key = spec.key, fd = sock }
		end
	end
	local deadline = now() + timeout_ms / 1000
	while now() < deadline and #live > 0 do
		local still = {}
		for _, item in ipairs(live) do
			local data = item.fd:recvfrom(4096)
			if data then
				results[item.key] = data
				item.fd:close()
			else
				still[#still + 1] = item
			end
		end
		live = still
		if #live > 0 then nixio.nanosleep(0, 10000000) end
	end
	for _, item in ipairs(live) do item.fd:close() end
	return results
end

-- Opens every port in parallel: non-blocking connect, one poll for the whole
-- batch. Returns the sorted list of ports that accepted the connection.
local function tcp_scan(ports, timeout_ms)
	local open = {}
	local pending = {}
	local pfds = {}
	for _, port in ipairs(ports) do
		local sock = nixio.socket("inet", "stream")
		if sock then
			sock:setblocking(false)
			if sock:connect(ip, port) then
				open[#open + 1] = port
				sock:close()
			else
				pending[#pending + 1] = { port = port, fd = sock }
				pfds[#pfds + 1] = {
					fd = sock,
					events = nixio.poll_flags("out", "err", "hup")
				}
			end
		end
	end
	if #pfds > 0 then
		nixio.poll(pfds, timeout_ms)
		for index, entry in ipairs(pfds) do
			local item = pending[index]
			if entry.revents and entry.revents > 0 and item then
				local ok, peer = pcall(function() return item.fd:getpeername() end)
				if ok and peer then open[#open + 1] = item.port end
			end
		end
	end
	for _, item in ipairs(pending) do item.fd:close() end
	table.sort(open)
	return open
end

-- DNS name encoding for the mDNS query.
local function dns_name(name)
	local parts = {}
	for label in name:gmatch("[^.]+") do
		parts[#parts + 1] = string.char(#label) .. label
	end
	return table.concat(parts) .. "\0"
end

-- Reads one DNS name, following compression pointers. Returns the name and
-- the position right after it in the original buffer.
local function read_dns_name(data, pos)
	local labels = {}
	local next_pos = pos
	local jumped = false
	local hops = 0
	while true do
		local length = data:byte(pos)
		if not length or hops > 20 then break end
		if length == 0 then
			pos = pos + 1
			break
		end
		if length >= 192 then
			local low = data:byte(pos + 1) or 0
			if not jumped then next_pos = pos + 2 end
			jumped = true
			pos = ((length - 192) * 256 + low) + 1
			hops = hops + 1
		else
			labels[#labels + 1] = data:sub(pos + 1, pos + length)
			pos = pos + 1 + length
		end
	end
	if not jumped then next_pos = pos end
	return table.concat(labels, "."), next_pos
end

-- Collects PTR targets from an mDNS response.
local function parse_mdns(data)
	local services = {}
	if not data or #data < 12 then return services end
	local questions = data:byte(5) * 256 + data:byte(6)
	local answers = data:byte(7) * 256 + data:byte(8)
	local pos = 13
	for _ = 1, questions do
		local _, next_pos = read_dns_name(data, pos)
		pos = next_pos + 4
	end
	for _ = 1, answers do
		local _, next_pos = read_dns_name(data, pos)
		if next_pos + 9 > #data then break end
		local rtype = data:byte(next_pos) * 256 + data:byte(next_pos + 1)
		local rdlength = data:byte(next_pos + 8) * 256 + data:byte(next_pos + 9)
		local rdata = next_pos + 10
		if rtype == 12 then
			local target = read_dns_name(data, rdata)
			if target and #target > 0 then services[#services + 1] = target end
		end
		pos = rdata + rdlength
		if pos > #data then break end
	end
	return services
end

local function json_string(value)
	if value == nil then return "null" end
	value = tostring(value)
	value = value:gsub('[%z\1-\31\\"]', function(char)
		if char == '"' then return '\\"' end
		if char == "\\" then return "\\\\" end
		if char == "\n" then return "\\n" end
		if char == "\r" then return "\\r" end
		if char == "\t" then return "\\t" end
		return string.format("\\u%04x", char:byte())
	end)
	return '"' .. value .. '"'
end

-- Ports chosen for consumer-device fingerprints rather than a full scan.
local PORTS = {
	22, 80, 443, 445, 515, 548, 554, 631, 1883, 3389, 5000, 5357,
	5555, 5900, 6668, 7000, 8008, 8009, 8080, 8443, 9100, 32400, 62078
}

local tcp = tcp_scan(PORTS, 450)

-- miIO discovery: the canonical handshake uses 0xFF for the DID field, so
-- every device answers with its own DID.
local miio_packet = string.char(0x21, 0x31, 0x00, 0x20) .. string.rep(string.char(0xff), 28)
local mitv_packet = '{"method":"isalive","params":{"did":"1","token":"1","data":"{}"}}'
local gateway_packet = '{"cmd":"whoami"}'
local ssdp_packet = "M-SEARCH * HTTP/1.1\r\n"
	.. "HOST: 239.255.255.250:1900\r\n"
	.. "MAN: \"ssdp:discover\"\r\n"
	.. "MX: 1\r\n"
	.. "ST: ssdp:all\r\n\r\n"
local mdns_packet = string.char(0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0)
	.. dns_name("_services._dns-sd._udp.local")
	.. string.char(0, 12, 0x80, 0x01)

local udp = udp_batch({
	{ key = "miio", port = 54321, payload = miio_packet },
	{ key = "mitv", port = 6095, payload = mitv_packet },
	{ key = "gateway", port = 9898, payload = gateway_packet },
	{ key = "ssdp", port = 1900, payload = ssdp_packet },
	{ key = "mdns", port = 5353, payload = mdns_packet }
}, 700)

local miio = "null"
local miio_raw = udp.miio
if miio_raw and #miio_raw >= 12 and miio_raw:byte(1) == 0x21 and miio_raw:byte(2) == 0x31 then
	local did = miio_raw:byte(9) * 16777216 + miio_raw:byte(10) * 65536
		+ miio_raw:byte(11) * 256 + miio_raw:byte(12)
	miio = '{"did":' .. did .. "}"
end

local mitv_model = udp.mitv and udp.mitv:match('"model"%s*:%s*"([^"]+)"')
local gateway_model = udp.gateway and udp.gateway:match('"model"%s*:%s*"([^"]+)"')

local ssdp_parts = {}
if udp.ssdp then
	local headers = {}
	for line in udp.ssdp:gmatch("[^\r\n]+") do
		local key, value = line:match("^([%w%-]+):%s*(.+)$")
		if key then headers[key:lower()] = value end
	end
	if headers.server then ssdp_parts[#ssdp_parts + 1] = '"server":' .. json_string(headers.server) end
	if headers.st then ssdp_parts[#ssdp_parts + 1] = '"st":' .. json_string(headers.st) end
	if headers.usn then ssdp_parts[#ssdp_parts + 1] = '"usn":' .. json_string(headers.usn) end
	if headers.location then ssdp_parts[#ssdp_parts + 1] = '"location":' .. json_string(headers.location) end
end

local services = {}
local seen = {}
for _, name in ipairs(parse_mdns(udp.mdns)) do
	if #services < 20 and not seen[name] then
		seen[name] = true
		services[#services + 1] = json_string(name)
	end
end

local output = {
	'"ip":' .. json_string(ip),
	'"tcp":[' .. table.concat(tcp, ",") .. "]",
	'"miio":' .. miio,
	'"mitv":' .. (mitv_model and ('{"model":' .. json_string(mitv_model) .. "}") or "null"),
	'"gateway":' .. (gateway_model and ('{"model":' .. json_string(gateway_model) .. "}") or "null"),
	'"ssdp":' .. (#ssdp_parts > 0 and ("{" .. table.concat(ssdp_parts, ",") .. "}") or "null"),
	'"mdns":[' .. table.concat(services, ",") .. "]"
}

io.write("{" .. table.concat(output, ",") .. "}")
