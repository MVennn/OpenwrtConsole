import {
  uciAdd,
  uciBool,
  uciByType,
  uciCommit,
  uciDelete,
  uciGet,
  uciList,
  uciNumber,
  uciSet,
  uciString,
  type UciConfig,
  type UciSection
} from '@/api/uci'
import { requestToken, systemOps } from '@/api/systemOps'
import { cgiGet, ubusCall } from '@/api/ubus'
import { api } from '@/api/openwrt'

/**
 * DHCP, hostname and the basic system settings.
 *
 * Every read goes through the shared UCI helpers (`@/api/uci`) or the
 * read-only `modern-read` CGI, every write follows the shared paradigm:
 * stage with `uciSet` / `uciAdd` / `uciDelete`, persist with `uciCommit` and
 * finally apply the change. Only the `dhcp` and the `system` config file are
 * ever touched.
 */

/* ------------------------------------------------------------------ *
 * Types
 * ------------------------------------------------------------------ */

/** A static lease (`host` section) of /etc/config/dhcp. */
export interface SysStaticLease {
  /** UCI section name — the stable key of the lease. */
  section: string
  name: string
  mac: string
  ip: string
}

/** A DHCP address pool (`dhcp` section) of /etc/config/dhcp. */
export interface SysDhcpPool {
  section: string
  interface: string
  /** Offset of the first address, counted from the network address. */
  start: number
  /** Number of addresses in the pool. */
  limit: number
  /** Lease duration, e.g. "12h". */
  leasetime: string
}

/** The dnsmasq server settings of /etc/config/dhcp. */
export interface SysDnsmasq {
  section: string
  /** Upstream resolvers. */
  servers: string[]
  /** Maximum number of cached answers, 0 means no limit. */
  cachesize: number
  /** dnsmasq ignores /etc/resolv.conf and only uses `servers`. */
  noresolv: boolean
  /** dnsmasq only answers clients from the local networks. */
  localservice: boolean
}

/** The main section of /etc/config/system. */
export interface SysIdentity {
  section: string
  hostname: string
  timezone: string
  /** Size of the syslog buffer in KB. */
  logSize: number
  /** Whether the serial console asks for a login. */
  ttylogin: boolean
  ntpServers: string[]
}

/** Everything the page reads from the router. */
export interface SysSnapshot {
  dnsmasq: SysDnsmasq
  pools: SysDhcpPool[]
  leases: SysStaticLease[]
  identity: SysIdentity
}

/** A live DHCP lease read from /tmp/dhcp.leases. */
export interface SysLease {
  expiry: number
  mac: string
  ip: string
  hostname: string
}

/** IPv4 address of a network interface. */
export interface SysInterfaceAddress {
  address: string
  mask: number
}

/** A pool with its absolute address range resolved. */
export interface SysResolvedPool extends SysDhcpPool {
  /** Absolute first address, empty when the interface is unknown. */
  startIp: string
  /** Absolute last address, empty when the interface is unknown. */
  endIp: string
}

/** A pending change between the loaded and the edited state. */
export interface SysChange {
  config: 'dhcp' | 'system'
  section: string
  option: string
  /** Human readable name of the option. */
  label: string
  /** Value shown before the change. */
  before: string
  /** Value shown after the change. */
  after: string
  /** Raw UCI value before the change. */
  rawBefore: string
  /** Raw UCI value after the change. */
  rawAfter: string
}

/** Which part of the configuration a save touches. */
export type SysSaveScope = 'system' | 'dns' | 'pool' | 'all'

/* ------------------------------------------------------------------ *
 * Online devices
 * ------------------------------------------------------------------ */

/** A device that is currently online. */
export interface SysOnlineDevice {
  ip: string
  mac: string
  hostname: string
  /** The device is connected over Wi-Fi. */
  wireless: boolean
  /** Signal strength in dBm, 0 for a wired device. */
  signal: number
}

/** The online state of a static lease. */
export interface SysLeaseState {
  /** The address of the lease is in use right now. */
  online: boolean
  /** The device that uses the address. */
  device: SysOnlineDevice | null
}

/** The raw UCI values of the two config files this page edits. */
export interface SysRawConfigs {
  dhcp: Record<string, UciSection>
  system: Record<string, UciSection>
}

/**
 * The part of the configuration the page edits.
 *
 * The static leases are not part of it: they are written to the router right
 * away, so there is nothing to keep in a draft.
 */
export interface SysDraft {
  identity: SysIdentity
  dnsmasq: SysDnsmasq
  pools: SysDhcpPool[]
}

/** An empty draft, used as the initial value of the draft store. */
export function emptyDraft(): SysDraft {
  return {
    identity: {
      section: 'system',
      hostname: '',
      timezone: '',
      logSize: 64,
      ttylogin: true,
      ntpServers: []
    },
    dnsmasq: {
      section: 'dnsmasq',
      servers: [],
      cachesize: 0,
      noresolv: false,
      localservice: false
    },
    pools: []
  }
}

/** Copies the editable part of a snapshot into a draft. */
export function draftFromSnapshot(snapshot: SysSnapshot): SysDraft {
  return {
    identity: { ...snapshot.identity, ntpServers: [...snapshot.identity.ntpServers] },
    dnsmasq: { ...snapshot.dnsmasq, servers: [...snapshot.dnsmasq.servers] },
    pools: snapshot.pools.map((pool) => ({ ...pool }))
  }
}

/** Deep copy of a draft. */
export function cloneDraft(draft: SysDraft): SysDraft {
  return {
    identity: { ...draft.identity, ntpServers: [...draft.identity.ntpServers] },
    dnsmasq: { ...draft.dnsmasq, servers: [...draft.dnsmasq.servers] },
    pools: draft.pools.map((pool) => ({ ...pool }))
  }
}

/* ------------------------------------------------------------------ *
 * Helpers
 * ------------------------------------------------------------------ */

const MAC_PATTERN = /^([0-9a-f]{2}:){5}[0-9a-f]{2}$/i
const HOSTNAME_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,62}$/

/** Converts an IPv4 address into its numeric representation. */
export function ipToNumber(ip: string): number | null {
  const parts = ip.trim().split('.')
  if (parts.length !== 4) return null
  let value = 0
  for (const part of parts) {
    const octet = Number.parseInt(part, 10)
    if (!Number.isFinite(octet) || octet < 0 || octet > 255) return null
    value = value * 256 + octet
  }
  return value
}

/** Converts a numeric IPv4 address back into its dotted form. */
export function numberToIp(value: number): string {
  const octets = [(value >>> 24) & 255, (value >>> 16) & 255, (value >>> 8) & 255, value & 255]
  return octets.join('.')
}

/** True when the value is a dotted quad IPv4 address. */
export function isValidIpv4(value: string): boolean {
  const parts = value.trim().split('.')
  if (parts.length !== 4) return false
  return parts.every((part) => {
    if (!/^\d{1,3}$/.test(part)) return false
    const octet = Number.parseInt(part, 10)
    return octet >= 0 && octet <= 255
  })
}

/** True when the value looks like a MAC address. */
export function isValidMac(value: string): boolean {
  return MAC_PATTERN.test(value.trim())
}

/** True when the value looks like a host name. */
export function isValidHostname(value: string): boolean {
  return HOSTNAME_PATTERN.test(value.trim())
}

/** Splits a whitespace or comma separated list into single entries. */
export function splitList(value: string): string[] {
  return value
    .split(/[\s,]+/)
    .map((item) => item.trim())
    .filter(Boolean)
}

/* ------------------------------------------------------------------ *
 * Reading
 * ------------------------------------------------------------------ */

function parseDnsmasq(values: Record<string, UciSection>): SysDnsmasq {
  const section = uciByType(values, 'dnsmasq')[0]
  return {
    section: section?.['.name'] ?? 'dnsmasq',
    servers: uciList(section, 'server'),
    cachesize: uciNumber(section, 'cachesize', 0),
    noresolv: uciBool(section, 'noresolv', false),
    localservice: uciBool(section, 'localservice', false)
  }
}

function parsePools(values: Record<string, UciSection>): SysDhcpPool[] {
  return uciByType(values, 'dhcp')
    .filter((section) => !uciBool(section, 'ignore', false))
    .map((section) => ({
      section: section['.name'] ?? '',
      interface: uciString(section, 'interface'),
      start: uciNumber(section, 'start', 100),
      limit: uciNumber(section, 'limit', 150),
      leasetime: uciString(section, 'leasetime', '12h')
    }))
}

function parseLeases(values: Record<string, UciSection>): SysStaticLease[] {
  return uciByType(values, 'host').map((section) => ({
    section: section['.name'] ?? '',
    name: uciString(section, 'name'),
    mac: uciString(section, 'mac'),
    ip: uciString(section, 'ip')
  }))
}

function parseIdentity(values: Record<string, UciSection>): SysIdentity {
  const section = uciByType(values, 'system')[0]
  return {
    section: section?.['.name'] ?? 'system',
    hostname: uciString(section, 'hostname'),
    timezone: uciString(section, 'timezone'),
    logSize: uciNumber(section, 'log_size', 64),
    ttylogin: uciBool(section, 'ttylogin', true),
    ntpServers: uciList(section, 'ntp')
  }
}

/** Reads the `dhcp` and the `system` config file. */
export async function readSnapshot(): Promise<SysSnapshot> {
  const [dhcp, system] = await Promise.all([uciGet('dhcp'), uciGet('system')])
  return {
    dnsmasq: parseDnsmasq(dhcp),
    pools: parsePools(dhcp),
    leases: parseLeases(dhcp),
    identity: parseIdentity(system)
  }
}

/**
 * Reads the raw UCI values of the two config files.
 *
 * They are the base for the "old value → new value" list of the changes the
 * router reports for the staging area.
 */
export async function readRawConfigs(): Promise<SysRawConfigs> {
  const [dhcp, system] = await Promise.all([uciGet('dhcp'), uciGet('system')])
  return { dhcp, system }
}

/** A neighbor table entry (`ip neigh show`) read from the read-only CGI. */
export interface SysNeighbor {
  ip: string
  mac: string
  device: string
  state: string
}

/**
 * The devices that are online right now.
 *
 * The DHCP leases carry the address ↔ MAC mapping, the host hints the names
 * of the devices. A lease alone does not prove that a device is online: a
 * wireless device must be associated with a radio, a wired one must have a
 * neighbor table entry that is not FAILED. Leases that appear in neither set
 * are left out, so the online state of a static lease is accurate.
 */
export async function readOnlineDevices(): Promise<SysOnlineDevice[]> {
  const [leases, hints, stations, neighbors] = await Promise.all([
    api.dhcpLeases().catch(() => []),
    api.hostHints().catch(() => ({}) as Record<string, unknown>),
    api.stations().catch(() => ({}) as Record<string, unknown>),
    readNeighbors().catch(() => [] as SysNeighbor[])
  ])

  const stationMacs = new Set<string>()
  const stationSignal = new Map<string, number>()
  for (const list of Object.values(stations ?? {})) {
    if (!Array.isArray(list)) continue
    for (const item of list) {
      const raw = item as Record<string, unknown>
      const mac = String(raw?.mac ?? '').toLowerCase()
      if (!mac) continue
      stationMacs.add(mac)
      const signal = Number(raw?.signal ?? 0)
      stationSignal.set(mac, Number.isFinite(signal) ? signal : 0)
    }
  }

  const neighborMacs = new Set<string>()
  const neighborIps = new Set<string>()
  for (const neighbor of neighbors) {
    if (String(neighbor.state ?? '').trim().toUpperCase() === 'FAILED') continue
    const mac = String(neighbor.mac ?? '').toLowerCase()
    if (mac) neighborMacs.add(mac)
    const ip = String(neighbor.ip ?? '').trim()
    if (ip) neighborIps.add(ip)
  }

  const nameByIp = new Map<string, string>()
  for (const [key, hint] of Object.entries(hints ?? {})) {
    const raw = hint as { ipaddrs?: string[]; name?: string }
    const name = raw?.name?.trim()
    if (!name) continue
    for (const ip of raw?.ipaddrs ?? []) nameByIp.set(ip, name)
    nameByIp.set(key, name)
  }

  const devices: SysOnlineDevice[] = []
  const seenMacs = new Set<string>()
  const seenIps = new Set<string>()

  for (const lease of leases ?? []) {
    const mac = String(lease.macaddr ?? '').toLowerCase()
    const ip = lease.ipaddr ?? ''
    const wireless = stationMacs.has(mac)
    const wired = neighborMacs.has(mac) || neighborIps.has(ip)
    if (!wireless && !wired) continue

    devices.push({
      ip,
      mac,
      hostname: lease.hostname || nameByIp.get(ip) || '',
      wireless,
      signal: stationSignal.get(mac) ?? 0
    })
    if (mac) seenMacs.add(mac)
    if (ip) seenIps.add(ip)
  }

  // A device with a static address outside the DHCP pool never gets a lease;
  // its neighbor entry is the only proof that it is online.
  for (const neighbor of neighbors) {
    if (String(neighbor.state ?? '').trim().toUpperCase() === 'FAILED') continue
    const mac = String(neighbor.mac ?? '').toLowerCase()
    const ip = String(neighbor.ip ?? '').trim()
    if (!mac || !ip) continue
    if (seenMacs.has(mac) || seenIps.has(ip)) continue
    devices.push({
      ip,
      mac,
      hostname: nameByIp.get(ip) || '',
      wireless: stationMacs.has(mac),
      signal: stationSignal.get(mac) ?? 0
    })
    seenMacs.add(mac)
    seenIps.add(ip)
  }

  return devices
}

/**
 * Looks for the device that uses the address of a static lease.
 *
 * The address is the primary key, the MAC address is the fallback — a device
 * can have a different address than the one that was reserved for it.
 */
export function matchLeaseOnline(
  lease: SysStaticLease,
  devices: SysOnlineDevice[]
): SysLeaseState {
  const ip = lease.ip.trim()
  const mac = lease.mac.trim().toLowerCase()
  if (!ip && !mac) return { online: false, device: null }

  const byIp = devices.find((device) => device.ip === ip)
  if (byIp) return { online: true, device: byIp }

  const byMac = devices.find((device) => device.mac && device.mac.toLowerCase() === mac)
  if (byMac) return { online: true, device: byMac }

  return { online: false, device: null }
}

/** Live DHCP leases from /tmp/dhcp.leases. */
export async function readLeases(): Promise<SysLease[]> {
  const data = await cgiGet<{ leases?: SysLease[] }>('/cgi-bin/modern-read?what=leases')
  return data?.leases ?? []
}

/**
 * Live neighbor table entries (ARP for IPv4, NDP for IPv6).
 *
 * A neighbor entry proves that the address was seen on the link recently, so
 * the entry set is the wired counterpart of the wireless station list.
 */
export async function readNeighbors(): Promise<SysNeighbor[]> {
  const data = await cgiGet<{ neighbors?: SysNeighbor[] }>(
    '/cgi-bin/modern-read?what=neighbors'
  )
  return data?.neighbors ?? []
}

/** Runtime IPv4 addresses of the network interfaces. */
export async function readInterfaceAddresses(): Promise<Record<string, SysInterfaceAddress>> {
  const data = await ubusCall<{
    interface?: Array<{
      interface: string
      'ipv4-address'?: Array<{ address: string; mask: number }>
    }>
  }>('network.interface', 'dump')

  const addresses: Record<string, SysInterfaceAddress> = {}
  for (const item of data?.interface ?? []) {
    const first = item['ipv4-address']?.[0]
    if (!first?.address) continue
    addresses[item.interface] = { address: first.address, mask: first.mask ?? 24 }
  }
  return addresses
}

/** Names of the network interfaces, used when a new pool is created. */
export async function readNetworkInterfaces(): Promise<string[]> {
  const values = await uciGet('network')
  return uciByType(values, 'interface')
    .map((section) => {
      const name = section['.name'] ?? ''
      return uciString(section, 'device') || uciString(section, 'ifname') || name
    })
    .filter(Boolean)
}

/**
 * Normalises the reply of `luci.getTimezones`. Depending on the rpcd build
 * the list arrives as a plain array or wrapped into an object.
 */
export function parseTimezones(data: unknown): string[] {
  const found: string[] = []

  const push = (value: unknown): void => {
    if (typeof value === 'string' && value.trim()) found.push(value.trim())
  }

  const visit = (value: unknown): void => {
    if (Array.isArray(value)) {
      for (const item of value) {
        if (typeof item === 'string') {
          push(item)
        } else if (item && typeof item === 'object') {
          const entry = item as Record<string, unknown>
          push(entry.name ?? entry.zone ?? entry.tz ?? entry.value)
        }
      }
      return
    }
    if (value && typeof value === 'object') {
      const wrapper = value as Record<string, unknown>
      for (const key of ['timezones', 'zones', 'timezone', 'tz', 'list']) {
        if (wrapper[key] !== undefined) {
          visit(wrapper[key])
          return
        }
      }
    }
  }

  visit(data)
  return [...new Set(found)].sort((a, b) => a.localeCompare(b))
}

/**
 * The list of the time zones the router knows about. Falls back to the given
 * list when the router does not answer (older rpcd builds).
 */
export async function readTimezones(fallback: string[] = []): Promise<string[]> {
  try {
    const data = await ubusCall<unknown>('luci', 'getTimezones', {})
    const list = parseTimezones(data)
    return list.length ? list : fallback
  } catch {
    return fallback
  }
}

/**
 * Turns the configured pools into concrete address ranges. A `dhcp` section
 * describes the pool relative to the network address of its interface.
 */
export function resolvePools(
  pools: SysDhcpPool[],
  addresses: Record<string, SysInterfaceAddress>
): SysResolvedPool[] {
  return pools.map((pool) => {
    const address = addresses[pool.interface]
    const base = address ? ipToNumber(address.address) : null
    if (base === null) return { ...pool, startIp: '', endIp: '' }

    const mask = address && address.mask >= 0 && address.mask <= 32 ? address.mask : 24
    const network = mask === 0 ? 0 : (base & (0xffffffff << (32 - mask))) >>> 0
    const start = network + pool.start
    return { ...pool, startIp: numberToIp(start), endIp: numberToIp(start + pool.limit - 1) }
  })
}

/* ------------------------------------------------------------------ *
 * Diffing
 * ------------------------------------------------------------------ */

function pushChange(
  changes: SysChange[],
  config: 'dhcp' | 'system',
  section: string,
  option: string,
  label: string,
  before: string,
  after: string,
  rawBefore: string,
  rawAfter: string
): void {
  if (rawBefore === rawAfter) return
  changes.push({ config, section, option, label, before, after, rawBefore, rawAfter })
}

/** Changes of the `system` section. */
export function diffIdentity(next: SysIdentity, previous: SysIdentity): SysChange[] {
  const changes: SysChange[] = []
  const section = next.section || previous.section
  pushChange(changes, 'system', section, 'hostname', '主机名', previous.hostname, next.hostname, previous.hostname, next.hostname)
  pushChange(changes, 'system', section, 'timezone', '时区', previous.timezone, next.timezone, previous.timezone, next.timezone)
  pushChange(
    changes,
    'system',
    section,
    'log_size',
    '日志大小',
    `${previous.logSize} KB`,
    `${next.logSize} KB`,
    String(previous.logSize),
    String(next.logSize)
  )
  pushChange(
    changes,
    'system',
    section,
    'ttylogin',
    '串口登录',
    previous.ttylogin ? '开启' : '关闭',
    next.ttylogin ? '开启' : '关闭',
    previous.ttylogin ? '1' : '0',
    next.ttylogin ? '1' : '0'
  )
  pushChange(
    changes,
    'system',
    section,
    'ntp',
    'NTP 服务器',
    previous.ntpServers.join(' '),
    next.ntpServers.join(' '),
    previous.ntpServers.join(' '),
    next.ntpServers.join(' ')
  )
  return changes
}

/** Changes of the `dnsmasq` section. */
export function diffDnsmasq(next: SysDnsmasq, previous: SysDnsmasq): SysChange[] {
  const changes: SysChange[] = []
  const section = next.section || previous.section
  pushChange(
    changes,
    'dhcp',
    section,
    'server',
    '上游 DNS 服务器',
    previous.servers.join(' '),
    next.servers.join(' '),
    previous.servers.join(' '),
    next.servers.join(' ')
  )
  pushChange(
    changes,
    'dhcp',
    section,
    'cachesize',
    'DNS 缓存条数',
    String(previous.cachesize),
    String(next.cachesize),
    String(previous.cachesize),
    String(next.cachesize)
  )
  pushChange(
    changes,
    'dhcp',
    section,
    'noresolv',
    '忽略系统解析器',
    previous.noresolv ? '开启' : '关闭',
    next.noresolv ? '开启' : '关闭',
    previous.noresolv ? '1' : '0',
    next.noresolv ? '1' : '0'
  )
  pushChange(
    changes,
    'dhcp',
    section,
    'localservice',
    '只服务本地网络',
    previous.localservice ? '开启' : '关闭',
    next.localservice ? '开启' : '关闭',
    previous.localservice ? '1' : '0',
    next.localservice ? '1' : '0'
  )
  return changes
}

/** Changes of every `dhcp` section that describes an address pool. */
export function diffPools(next: SysDhcpPool[], previous: SysDhcpPool[]): SysChange[] {
  const changes: SysChange[] = []
  for (const pool of next) {
    const before = previous.find((item) => item.section === pool.section)
    if (!before) continue
    pushChange(changes, 'dhcp', pool.section, 'start', '起始地址', String(before.start), String(pool.start), String(before.start), String(pool.start))
    pushChange(changes, 'dhcp', pool.section, 'limit', '地址数量', String(before.limit), String(pool.limit), String(before.limit), String(pool.limit))
    pushChange(changes, 'dhcp', pool.section, 'leasetime', '租期', before.leasetime, pool.leasetime, before.leasetime, pool.leasetime)
  }
  return changes
}

/** All pending changes of a snapshot pair. */
export function diffSnapshots(next: SysSnapshot, previous: SysSnapshot): SysChange[] {
  return [
    ...diffIdentity(next.identity, previous.identity),
    ...diffDnsmasq(next.dnsmasq, previous.dnsmasq),
    ...diffPools(next.pools, previous.pools)
  ]
}

/** Deep copy of a snapshot, used to keep the draft apart from the source. */
export function cloneSnapshot(snapshot: SysSnapshot): SysSnapshot {
  return {
    dnsmasq: { ...snapshot.dnsmasq, servers: [...snapshot.dnsmasq.servers] },
    pools: snapshot.pools.map((pool) => ({ ...pool })),
    leases: snapshot.leases.map((lease) => ({ ...lease })),
    identity: { ...snapshot.identity, ntpServers: [...snapshot.identity.ntpServers] }
  }
}

/* ------------------------------------------------------------------ *
 * Writing
 * ------------------------------------------------------------------ */

/** Splits the changes into the options to write and the options to remove. */
function changeValues(changes: SysChange[]): {
  values: Record<string, string>
  removals: string[]
} {
  const values: Record<string, string> = {}
  const removals: string[] = []
  for (const change of changes) {
    if (change.rawAfter === '') {
      // An empty value means the option is removed again.
      if (change.rawBefore !== '') removals.push(change.option)
      continue
    }
    values[change.option] = change.rawAfter
  }
  return { values, removals }
}

/** The same split, but with the previous values — used for the rollback. */
function rollbackValuesOf(changes: SysChange[]): {
  values: Record<string, string>
  removals: string[]
} {
  const values: Record<string, string> = {}
  const removals: string[] = []
  for (const change of changes) {
    if (change.rawBefore === '') {
      if (change.rawAfter !== '') removals.push(change.option)
      continue
    }
    values[change.option] = change.rawBefore
  }
  return { values, removals }
}

/** Stages the values of a section and persists them. */
async function writeSection(
  config: UciConfig,
  section: string,
  values: Record<string, string>,
  removals: string[]
): Promise<void> {
  if (Object.keys(values).length) await uciSet(config, section, values)
  for (const option of removals) await uciDelete(config, section, option)
  await uciCommit(config)
}

/** Restores the previous values of a section after a failed apply. */
async function rollbackSection(
  config: UciConfig,
  section: string,
  changes: SysChange[]
): Promise<void> {
  try {
    const { values, removals } = rollbackValuesOf(changes)
    await writeSection(config, section, values, removals)
    await systemOps.applyChanges()
  } catch {
    // Best effort only: the original error is the one the user has to see.
  }
}

/** Writes the changed options of one section and persists them. */
async function commitSection(
  config: UciConfig,
  section: string,
  changes: SysChange[]
): Promise<void> {
  if (!changes.length) return
  const { values, removals } = changeValues(changes)
  await writeSection(config, section, values, removals)
}

/**
 * Applies a config file. `uci apply` reloads the services that depend on it
 * (dnsmasq for the dhcp file); the address pool is announced by the network
 * stack as well, so the network is reloaded on top of it.
 */
async function applyConfig(config: 'dhcp' | 'system', poolChanged: boolean): Promise<void> {
  await systemOps.applyChanges()
  if (config === 'dhcp' && poolChanged) {
    await systemOps.reloadNetwork()
  }
}

/**
 * Saves the edited settings.
 *
 * Only the options that actually changed are staged, so an untouched list
 * option keeps its original shape in the config file. When the apply fails the
 * previous values are written back, so the router never keeps a half applied
 * configuration.
 */
export async function saveSettings(
  next: SysSnapshot,
  previous: SysSnapshot,
  scope: SysSaveScope = 'all'
): Promise<number> {
  const systemChanges = scope === 'system' || scope === 'all'
    ? diffIdentity(next.identity, previous.identity)
    : []
  const dnsmasqChanges = scope === 'dns' || scope === 'all'
    ? diffDnsmasq(next.dnsmasq, previous.dnsmasq)
    : []
  const poolChanges = scope === 'pool' || scope === 'all'
    ? diffPools(next.pools, previous.pools)
    : []

  const systemSection = next.identity.section || previous.identity.section
  const dnsmasqSection = next.dnsmasq.section || previous.dnsmasq.section

  // Group the pool changes by their section, every pool is a separate one.
  const poolBySection = new Map<string, SysChange[]>()
  for (const change of poolChanges) {
    const list = poolBySection.get(change.section) ?? []
    list.push(change)
    poolBySection.set(change.section, list)
  }

  try {
    if (systemChanges.length) {
      await commitSection('system', systemSection, systemChanges)
    }
    if (dnsmasqChanges.length) {
      await commitSection('dhcp', dnsmasqSection, dnsmasqChanges)
    }
    for (const [section, changes] of poolBySection) {
      await commitSection('dhcp', section, changes)
    }

    if (systemChanges.length) {
      await applyConfig('system', false)
    }
    if (dnsmasqChanges.length || poolChanges.length) {
      await applyConfig('dhcp', poolChanges.length > 0)
    }
  } catch (err) {
    if (systemChanges.length) {
      await rollbackSection('system', systemSection, systemChanges)
    }
    if (dnsmasqChanges.length) {
      await rollbackSection('dhcp', dnsmasqSection, dnsmasqChanges)
    }
    for (const [section, changes] of poolBySection) {
      await rollbackSection('dhcp', section, changes)
    }
    throw err
  }

  return systemChanges.length + dnsmasqChanges.length + poolChanges.length
}

/** Adds a new static lease and applies the change. */
export async function addStaticLease(lease: {
  name: string
  mac: string
  ip: string
}): Promise<string> {
  const section = await uciAdd('dhcp', 'host', {
    name: lease.name.trim(),
    mac: lease.mac.trim(),
    ip: lease.ip.trim()
  })
  await uciCommit('dhcp')
  await systemOps.applyChanges()
  return section
}

/** Updates an existing static lease and applies the change. */
export async function updateStaticLease(lease: SysStaticLease): Promise<void> {
  await uciSet('dhcp', lease.section, {
    name: lease.name.trim(),
    mac: lease.mac.trim(),
    ip: lease.ip.trim()
  })
  await uciCommit('dhcp')
  await systemOps.applyChanges()
}

/** Removes a static lease and applies the change. */
export async function deleteStaticLease(section: string): Promise<void> {
  await uciDelete('dhcp', section)
  await uciCommit('dhcp')
  await systemOps.applyChanges()
}

/** Creates a new address pool and applies the change. */
export async function addDhcpPool(pool: {
  interface: string
  start: number
  limit: number
  leasetime: string
}): Promise<string> {
  const section = await uciAdd('dhcp', 'dhcp', {
    interface: pool.interface,
    start: pool.start,
    limit: pool.limit,
    leasetime: pool.leasetime
  })
  await uciCommit('dhcp')
  await systemOps.applyChanges()
  await systemOps.reloadNetwork()
  return section
}

/* ------------------------------------------------------------------ *
 * Validation
 * ------------------------------------------------------------------ */

/** The result of a local validation. */
export interface SysValidation {
  ok: boolean
  /** The field the message belongs to. */
  field: 'name' | 'mac' | 'ip' | ''
  message: string
}

const VALID_OK: SysValidation = { ok: true, field: '', message: '' }

/**
 * Validates a static lease locally. The address must not collide with another
 * static lease and must not sit inside the dynamic pool, otherwise dnsmasq
 * could hand the same address to a second device.
 */
export function validateStaticLease(
  input: { name: string; mac: string; ip: string },
  context: {
    leases: SysStaticLease[]
    pools: SysResolvedPool[]
    /** Section of the lease that is being edited, it is skipped. */
    editingSection?: string
  }
): SysValidation {
  const name = input.name.trim()
  const mac = input.mac.trim()
  const ip = input.ip.trim()

  if (!name) return { ok: false, field: 'name', message: '请填写主机名' }
  if (!isValidHostname(name)) {
    return {
      ok: false,
      field: 'name',
      message: '主机名只能包含字母、数字、点、短横线和下划线，且需以字母或数字开头'
    }
  }
  if (!mac) return { ok: false, field: 'mac', message: '请填写 MAC 地址' }
  if (!isValidMac(mac)) {
    return { ok: false, field: 'mac', message: 'MAC 地址格式应为 aa:bb:cc:dd:ee:ff' }
  }
  if (!ip) return { ok: false, field: 'ip', message: '请填写 IP 地址' }
  if (!isValidIpv4(ip)) return { ok: false, field: 'ip', message: 'IP 地址格式不正确' }

  const others = context.leases.filter((lease) => lease.section !== context.editingSection)
  if (others.some((lease) => lease.mac.trim().toLowerCase() === mac.toLowerCase())) {
    return { ok: false, field: 'mac', message: '该 MAC 地址已经存在静态租约' }
  }
  if (others.some((lease) => lease.ip.trim() === ip)) {
    return { ok: false, field: 'ip', message: '该 IP 地址已经存在静态租约' }
  }

  const value = ipToNumber(ip)
  for (const pool of context.pools) {
    if (!pool.startIp || !pool.endIp) continue
    const start = ipToNumber(pool.startIp)
    const end = ipToNumber(pool.endIp)
    if (value === null || start === null || end === null) continue
    if (value >= start && value <= end) {
      return {
        ok: false,
        field: 'ip',
        message: `该地址位于动态地址池 ${pool.startIp} – ${pool.endIp} 内，会与动态分配冲突`
      }
    }
  }

  return VALID_OK
}

/** The strength of a password. */
export interface SysPasswordStrength {
  /** 0 = too weak, 1 = weak, 2 = fair, 3 = strong. */
  score: number
  label: string
  tone: 'danger' | 'warning' | 'success'
  hint: string
  /** Concrete advice on how to improve the password. */
  suggestions: string[]
}

/** Passwords that are used by nearly everybody — they are never a good idea. */
const WEAK_PASSWORDS = [
  'admin',
  'root',
  'password',
  'passwd',
  '123456',
  '12345678',
  '123456789',
  'qwerty',
  'abc123',
  'letmein',
  'openwrt',
  'default',
  'guest'
]

/** Rates a password and explains what is missing. */
export function scorePassword(password: string): SysPasswordStrength {
  if (!password) {
    return {
      score: 0,
      label: '未设置',
      tone: 'danger',
      hint: '留空表示不修改密码',
      suggestions: []
    }
  }

  const lower = password.toLowerCase()
  let points = 0
  if (password.length >= 8) points += 1
  if (password.length >= 12) points += 1
  if (/[a-z]/.test(password) && /[A-Z]/.test(password)) points += 1
  if (/\d/.test(password)) points += 1
  if (/[^\w\s]/.test(password)) points += 1

  const suggestions: string[] = []
  if (password.length < 8) suggestions.push('长度至少 8 位')
  else if (password.length < 12) suggestions.push('加长到 12 位以上，可抵抗暴力破解')
  if (!/[a-z]/.test(password)) suggestions.push('加入小写字母')
  if (!/[A-Z]/.test(password)) suggestions.push('加入大写字母')
  if (!/\d/.test(password)) suggestions.push('加入数字')
  if (!/[^\w\s]/.test(password)) suggestions.push('加入符号（例如 ! @ # $）')

  if (WEAK_PASSWORDS.some((weak) => lower === weak || lower.includes(`${weak}123`))) {
    suggestions.push('避免使用常见弱口令（admin / 123456 / password 等）')
  }
  if (/(.)\1{3,}/.test(password)) {
    suggestions.push('避免连续重复同一个字符')
  }
  if (/(0123|1234|2345|3456|4567|5678|6789|abcd|bcde|cdef)/.test(lower)) {
    suggestions.push('避免使用连续的数字或字母')
  }
  if (/^\d+$/.test(password)) {
    suggestions.push('不要只使用数字')
  }

  // The score is normalized to 0 … 3 so the UI can draw it directly.
  const score = points <= 1 ? 0 : points <= 3 ? 1 : points <= 4 ? 2 : 3

  if (score === 0) {
    return {
      score,
      label: '强度弱',
      tone: 'danger',
      hint: suggestions.length ? `建议：${suggestions[0]}` : '这个密码太弱了',
      suggestions
    }
  }
  if (score <= 2) {
    return {
      score,
      label: '强度中',
      tone: 'warning',
      hint: suggestions.length ? `可再加强：${suggestions[0]}` : '还能再强一些',
      suggestions
    }
  }
  return {
    score,
    label: '强度高',
    tone: 'success',
    hint: '密码强度足够',
    suggestions
  }
}

/* ------------------------------------------------------------------ *
 * Administrator password
 * ------------------------------------------------------------------ */

/**
 * Changes the administrator password. The privileged operation needs a single
 * use token, so the token is requested right before the change is sent.
 */
export async function changeAdminPassword(username: string, password: string): Promise<void> {
  const token = await requestToken('set-password')
  await systemOps.setPassword(username, password, token)
}
