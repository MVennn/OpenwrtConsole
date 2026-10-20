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

/** Live DHCP leases from /tmp/dhcp.leases. */
export async function readLeases(): Promise<SysLease[]> {
  const data = await cgiGet<{ leases?: SysLease[] }>('/cgi-bin/modern-read?what=leases')
  return data?.leases ?? []
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
}

/** Rates a password and explains what is missing. */
export function scorePassword(password: string): SysPasswordStrength {
  if (!password) {
    return { score: 0, label: '未设置', tone: 'danger', hint: '留空表示不修改密码' }
  }

  let points = 0
  if (password.length >= 8) points += 1
  if (password.length >= 12) points += 1
  if (/[a-z]/.test(password) && /[A-Z]/.test(password)) points += 1
  if (/\d/.test(password)) points += 1
  if (/[^\w\s]/.test(password)) points += 1

  const hints: string[] = []
  if (password.length < 8) hints.push('至少 8 位')
  if (!(/[a-z]/.test(password) && /[A-Z]/.test(password))) hints.push('包含大小写字母')
  if (!/\d/.test(password)) hints.push('包含数字')
  if (!/[^\w\s]/.test(password)) hints.push('包含符号')

  // The score is normalized to 0 … 3 so the UI can draw it directly.
  const score = points <= 1 ? 0 : points <= 3 ? 1 : points <= 4 ? 2 : 3

  if (score === 0) {
    return { score, label: '强度弱', tone: 'danger', hint: `建议：${hints.join('、')}` }
  }
  if (score <= 2) {
    return { score, label: '强度中', tone: 'warning', hint: `可再加强：${hints.join('、')}` }
  }
  return { score, label: '强度高', tone: 'success', hint: '密码强度足够' }
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
