import { cgiGet, ubusCall } from './ubus'

/**
 * DNS / hostname module.
 *
 * Configuration comes from `uci.get { config: 'dhcp' }` (dnsmasq settings,
 * address pool and static leases), runtime state comes from the read-only
 * `modern-read` CGI, which can read files that ubus refuses to expose.
 *
 * This module is read-only: nothing here writes to the router.
 */

/** A single UCI section as returned by `uci.get`. */
export interface UciSection {
  '.type'?: string
  '.name'?: string
  '.index'?: number
  [key: string]: unknown
}

export interface DnsUciResponse {
  values?: Record<string, UciSection>
}

/** An address pool taken from the `dhcp_option` list. */
export interface DhcpRange {
  /** First address of the pool. */
  start: string
  /** Last address of the pool. */
  end: string
  /** Netmask or extra limit that followed the range in the option value. */
  limit: string
}

/**
 * A pool described by a `dhcp` section (`start` offset + `limit` count),
 * the classic OpenWrt way of describing the pool.
 */
export interface DhcpPoolSpec {
  interface: string
  /** Offset of the first address, counted from the network address. */
  start: number
  /** Number of addresses in the pool. */
  limit: number
  leasetime: string
}

/** A resolved address pool. */
export interface DhcpPool {
  /** Owning interface, empty for a raw `dhcp_option` range. */
  interface: string
  start: string
  end: string
  /** Address count, or the netmask when the option carried one. */
  limit: string
  /** Number of addresses covered by the pool. */
  capacity: number
  source: 'option' | 'section'
}

/** A `host` section of /etc/config/dhcp, i.e. a static lease. */
export interface StaticLease {
  name: string
  mac: string
  ip: string
  duid: string
}

export interface DhcpSettings {
  /** Upstream resolvers configured with `list server`. */
  servers: string[]
  /** Maximum number of cached DNS answers (0 disables the cache). */
  cacheSize: number
  /** dnsmasq ignores /etc/resolv.conf and only uses `servers`. */
  noresolv: boolean
  /** Port dnsmasq listens on. */
  port: number
  /** dnsmasq only answers clients from the local networks. */
  localservice: boolean
  /** Raw `dhcp_option` values, kept for display. */
  options: string[]
  /** Ranges taken from the `dhcp_option` list. */
  optionRanges: DhcpRange[]
  /** Pools described by `dhcp` sections. */
  poolSpecs: DhcpPoolSpec[]
  /** Static leases (`host` sections). */
  staticLeases: StaticLease[]
}

/** A live DHCP lease read from /tmp/dhcp.leases. */
export interface Lease {
  /** Absolute expiry as a unix timestamp in seconds. */
  expiry: number
  mac: string
  ip: string
  hostname: string
}

/** A dnsmasq hosts entry read from /tmp/hosts/dhcp.*. */
export interface HostEntry {
  ip: string
  names: string[]
}

/** Contents of /etc/resolv.conf.auto. */
export interface ResolvConfig {
  nameservers: string[]
  search: string[]
}

/** IPv4 address of a network interface, with its prefix length. */
export interface InterfaceAddress {
  address: string
  mask: number
}

function toText(value: unknown): string {
  if (typeof value === 'string') return value
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  return ''
}

function toList(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map((item) => toText(item).trim()).filter((item) => item.length > 0)
  }
  if (typeof value === 'string') {
    return value
      .split(/\s+/)
      .map((item) => item.trim())
      .filter((item) => item.length > 0)
  }
  return []
}

function toNumber(value: unknown, fallback = 0): number {
  const parsed = Number.parseInt(toText(value).trim(), 10)
  return Number.isFinite(parsed) ? parsed : fallback
}

function toFlag(value: unknown): boolean {
  const text = toText(value).trim().toLowerCase()
  return text === '1' || text === 'true' || text === 'on' || text === 'yes'
}

/**
 * Parses a dnsmasq range option. Both the numeric form
 * (`100,192.168.1.100,192.168.1.200,255.255.255.0`) and the named form
 * (`option:range,100,192.168.1.100,192.168.1.200`) are accepted.
 */
export function parseRangeOption(option: string): DhcpRange | null {
  const parts = option
    .split(',')
    .map((part) => part.trim())
    .filter((part, index) => index === 0 || part.length > 0)

  if (parts[0] === 'option:range') {
    // option:range,<code>,<start>,<end>[,<limit>]
    if (parts.length < 4) return null
    return { start: parts[2], end: parts[3], limit: parts[4] ?? '' }
  }

  if (parts[0] === '100' && parts.length >= 3) {
    // 100,<start>,<end>[,<netmask>]
    return { start: parts[1], end: parts[2], limit: parts[3] ?? '' }
  }

  return null
}

function ipToNumber(ip: string): number | null {
  const parts = ip.split('.')
  if (parts.length !== 4) return null
  let value = 0
  for (const part of parts) {
    const octet = Number.parseInt(part, 10)
    if (!Number.isFinite(octet) || octet < 0 || octet > 255) return null
    value = value * 256 + octet
  }
  return value
}

function numberToIp(value: number): string {
  const octets = [(value >>> 24) & 255, (value >>> 16) & 255, (value >>> 8) & 255, value & 255]
  return octets.join('.')
}

/** Number of addresses covered by a range; 0 when the range is unusable. */
export function rangeCapacity(range: DhcpRange | undefined | null): number {
  if (!range) return 0
  const start = ipToNumber(range.start)
  const end = ipToNumber(range.end)
  if (start === null || end === null || end < start) return 0
  return end - start + 1
}

/** Reads the dnsmasq settings, address pool and static leases from UCI. */
export async function getDhcpSettings(): Promise<DhcpSettings> {
  const data = await ubusCall<DnsUciResponse>('uci', 'get', { config: 'dhcp' })
  const values = data?.values ?? {}
  const sections = Object.values(values)

  const dnsmasq = sections.find((section) => section['.type'] === 'dnsmasq')

  const options = toList(dnsmasq?.dhcp_option)
  const optionRanges = options
    .map((option) => parseRangeOption(option))
    .filter((range): range is DhcpRange => range !== null)

  const poolSpecs: DhcpPoolSpec[] = sections
    .filter((section) => section['.type'] === 'dhcp')
    .filter((section) => !toFlag(section.ignore))
    .map((section) => ({
      interface: toText(section.interface),
      start: toNumber(section.start, 100),
      limit: toNumber(section.limit, 150),
      leasetime: toText(section.leasetime)
    }))
    .filter((spec) => spec.limit > 0)

  const staticLeases: StaticLease[] = sections
    .filter((section) => section['.type'] === 'host')
    .map((section) => ({
      name: toText(section.name),
      mac: toText(section.mac),
      ip: toText(section.ip),
      duid: toText(section.duid)
    }))
    .filter((lease) => lease.name || lease.mac || lease.ip)

  return {
    servers: toList(dnsmasq?.server),
    cacheSize: toNumber(dnsmasq?.cachesize, 0),
    noresolv: toFlag(dnsmasq?.noresolv),
    port: toNumber(dnsmasq?.port, 53),
    localservice: toFlag(dnsmasq?.localservice),
    options,
    optionRanges,
    poolSpecs,
    staticLeases
  }
}

/** Runtime IPv4 addresses of the network interfaces. */
export async function getInterfaceAddresses(): Promise<Record<string, InterfaceAddress>> {
  const data = await ubusCall<{
    interface?: Array<{ interface: string; 'ipv4-address'?: Array<{ address: string; mask: number }> }>
  }>('network.interface', 'dump')

  const addresses: Record<string, InterfaceAddress> = {}
  for (const item of data?.interface ?? []) {
    const first = item['ipv4-address']?.[0]
    if (!first?.address) continue
    addresses[item.interface] = { address: first.address, mask: first.mask ?? 24 }
  }
  return addresses
}

/**
 * Turns the configured pools into concrete address ranges. A `dhcp` section
 * describes the pool relative to the network address of its interface, so the
 * interface address is needed to resolve the first and the last address.
 */
export function resolvePools(
  settings: DhcpSettings,
  addresses: Record<string, InterfaceAddress>
): DhcpPool[] {
  const pools: DhcpPool[] = settings.optionRanges.map((range) => ({
    interface: '',
    start: range.start,
    end: range.end,
    limit: range.limit,
    capacity: rangeCapacity(range),
    source: 'option'
  }))

  for (const spec of settings.poolSpecs) {
    const address = addresses[spec.interface]
    if (!address) continue
    const base = ipToNumber(address.address)
    if (base === null) continue

    // The offset counts from the network address, not from the host address.
    const mask = address.mask >= 0 && address.mask <= 32 ? address.mask : 24
    const network = mask === 0 ? 0 : (base & (0xffffffff << (32 - mask))) >>> 0
    const start = network + spec.start
    const end = start + spec.limit - 1

    pools.push({
      interface: spec.interface,
      start: numberToIp(start),
      end: numberToIp(end),
      limit: `${spec.limit} 个地址`,
      capacity: spec.limit,
      source: 'section'
    })
  }

  return pools
}

/** Live DHCP leases from /tmp/dhcp.leases. */
export async function getLeases(): Promise<Lease[]> {
  const data = await cgiGet<{ leases?: Lease[] }>('/cgi-bin/modern-read?what=leases')
  return data?.leases ?? []
}

/** Custom host names from /tmp/hosts/dhcp.*. */
export async function getHosts(): Promise<HostEntry[]> {
  const data = await cgiGet<{ hosts?: HostEntry[] }>('/cgi-bin/modern-read?what=hosts')
  return data?.hosts ?? []
}

/** System resolver configuration from /etc/resolv.conf.auto. */
export async function getResolvConfig(): Promise<ResolvConfig> {
  const data = await cgiGet<{ nameservers?: string[]; search?: string[] }>(
    '/cgi-bin/modern-read?what=resolv'
  )
  return {
    nameservers: data?.nameservers ?? [],
    search: data?.search ?? []
  }
}

export const dnsApi = {
  settings: getDhcpSettings,
  interfaceAddresses: getInterfaceAddresses,
  leases: getLeases,
  hosts: getHosts,
  resolv: getResolvConfig
}
