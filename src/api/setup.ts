import {
  uciAdd,
  uciBool,
  uciByType,
  uciCommit,
  uciDelete,
  uciGet,
  uciGetSection,
  uciList,
  uciSet,
  uciString,
  type UciSection,
  type UciValues
} from '@/api/uci'
import { requestToken, systemOps } from '@/api/systemOps'
import { ubusCall } from '@/api/ubus'

/**
 * First run wizard.
 *
 * Three jobs:
 *
 *  1. Detect whether the router was flashed but never configured (default
 *     hostname, no `wifi-iface` section, no LAN/WAN interface).
 *  2. Stage the configuration the wizard collects — the changes stay in the
 *     UCI delta until the user presses "完成设置".
 *  3. Commit and apply the staged changes, and roll them back if the apply
 *     fails.
 *
 * The write path follows the shared paradigm: read the current state → stage
 * the change (`uci.set` / `uci.add`) → commit (`uci.commit`) → apply
 * (`uci apply` / reload the service). Only the `system`, `wireless` and
 * `network` config files are touched. The administrator password cannot be
 * staged — it goes through the privileged `set-password` action, which needs a
 * single use token.
 */

/* ------------------------------------------------------------------ *
 * Types
 * ------------------------------------------------------------------ */

/** The config files the wizard owns. */
export type SetupConfig = 'system' | 'wireless' | 'network'

/** One item of the "what is still missing" list. */
export interface SetupCheck {
  key: 'hostname' | 'timezone' | 'wireless' | 'network'
  /** Short name of the item. */
  label: string
  /** The item is already taken care of. */
  done: boolean
  /** What the router currently looks like. */
  detail: string
}

/** The result of the state detection. */
export interface SetupStatus {
  /** The router is usable: the LAN and the wireless are configured. */
  configured: boolean
  /** The hostname of the `system` config. */
  hostname: string
  /** The hostname is still the factory default ("OpenWrt"). */
  hostnameIsDefault: boolean
  /** The timezone of the `system` config. */
  timezone: string
  /** Number of `wifi-iface` sections. */
  wifiIfaceCount: number
  /** The LAN interface carries an address. */
  hasLan: boolean
  /** A WAN interface exists. */
  hasWan: boolean
  checks: SetupCheck[]
  /** How many checks are still open. */
  pending: number
}

/** The identity of the device (`system` config). */
export interface SetupIdentity {
  /** UCI section of the `system` section, usually "system". */
  section: string
  hostname: string
  /** The POSIX timezone string the router stores ("CST-8"). */
  timezone: string
  /** The IANA zone name ("Asia/Shanghai"). */
  zonename: string
}

/** What the wizard collected for the identity step. */
export interface SetupIdentityDraft {
  /** UCI section of the `system` section, empty when it has to be created. */
  section?: string
  hostname: string
  /** The IANA zone name; empty keeps the current one. */
  zone: string
  /** The POSIX string of the zone; empty keeps the current one. */
  tzstring: string
}

/** One time zone of the router. */
export interface SetupTimezone {
  /** The IANA zone name, e.g. "Asia/Shanghai". */
  zone: string
  /** The POSIX string the router stores, e.g. "CST-8". */
  tzstring: string
}

/** The band of a radio. */
export type SetupBand = '2g' | '5g' | '6g'

/** One radio of the wireless config with its SSID. */
export interface SetupWifiRadio {
  /** UCI section of the `wifi-device`. */
  section: string
  band: SetupBand
  bandLabel: string
  /** The radio is administratively disabled. */
  disabled: boolean
  channel: string
  /** UCI section of the `wifi-iface`, empty when it still has to be created. */
  iface: string
  ssid: string
  encryption: string
  /** A password is stored on the router (the value itself is never read). */
  keySet: boolean
  /** The `wifi-iface` is disabled. */
  ifaceDisabled: boolean
}

/** The wireless config of the router. */
export interface SetupWirelessModel {
  radios: SetupWifiRadio[]
}

/** The WAN interface of the router. */
export interface SetupWanModel {
  /** UCI section of the WAN interface, empty when it still has to be created. */
  section: string
  /** The device the interface is bound to (`wan`, `eth0`, …). */
  device: string
  protocol: 'dhcp' | 'static'
  ipaddr: string
  netmask: string
  gateway: string
  dns: string[]
  /** The interface is administratively disabled. */
  disabled: boolean
  /** Devices that may be used as the WAN port. */
  devices: string[]
}

/** What the wizard collected for the wireless step. */
export interface SetupWifiDraft {
  /** UCI section of the `wifi-device`. */
  radio: string
  /** UCI section of the `wifi-iface`, empty when it has to be created. */
  iface: string
  ssid: string
  encryption: string
  /** Empty keeps the password that is already stored on the router. */
  key: string
  /** The radio and its SSID are switched on. */
  enabled: boolean
}

/** What the wizard collected for the WAN step. */
export interface SetupWanDraft {
  /** UCI section of the WAN interface, empty when it has to be created. */
  section: string
  device: string
  protocol: 'dhcp' | 'static'
  ipaddr: string
  netmask: string
  gateway: string
  dns: string[]
}

/** One pending change of the wizard. */
export interface SetupChange {
  /** Short name of the changed option. */
  label: string
  /** Value before the change. */
  before: string
  /** Value after the change. */
  after: string
}

/** What the wizard is going to write. */
export interface SetupApplyPlan {
  system: boolean
  wireless: boolean
  network: boolean
}

/** The outcome of the apply step. */
export interface SetupApplyReport {
  /** Human readable list of what has been applied. */
  applied: string[]
  /** Things that did not work but did not break the rest. */
  warnings: string[]
}

/** The state of the router before the wizard started — the rollback base. */
export interface SetupBaseline {
  identity: SetupIdentity
  wireless: SetupWirelessModel
  wan: SetupWanModel
}

/* ------------------------------------------------------------------ *
 * Constants
 * ------------------------------------------------------------------ */

/** The factory default hostname of OpenWrt. */
const DEFAULT_HOSTNAME = /^openwrt/i

/** The encryption presets the wizard offers. */
export const SETUP_ENCRYPTION_OPTIONS = [
  { value: 'none', label: '开放网络（无密码）' },
  { value: 'psk2', label: 'WPA2-PSK' },
  { value: 'sae', label: 'WPA3-SAE' },
  { value: 'psk2+sae', label: 'WPA2 / WPA3 混合' }
]

/** The netmasks the wizard offers for a static WAN. */
export const SETUP_NETMASK_OPTIONS = [
  { value: '255.255.255.0', label: '255.255.255.0（/24）' },
  { value: '255.255.255.128', label: '255.255.255.128（/25）' },
  { value: '255.255.0.0', label: '255.255.0.0（/16）' },
  { value: '255.0.0.0', label: '255.0.0.0（/8）' }
]

const BAND_LABELS: Record<SetupBand, string> = {
  '2g': '2.4 GHz',
  '5g': '5 GHz',
  '6g': '6 GHz'
}

const FALLBACK_TIMEZONES: SetupTimezone[] = [
  { zone: 'Asia/Shanghai', tzstring: 'CST-8' },
  { zone: 'Asia/Hong_Kong', tzstring: 'HKT-8' },
  { zone: 'Asia/Tokyo', tzstring: 'JST-9' },
  { zone: 'UTC', tzstring: 'UTC0' }
]

/* ------------------------------------------------------------------ *
 * Helpers
 * ------------------------------------------------------------------ */

/** True when the section carries a non empty option. */
function hasOption(section: UciSection | undefined, option: string): boolean {
  const value = section?.[option]
  if (value === undefined || value === null) return false
  return String(value).trim() !== ''
}

/** Drops empty values so they never end up in the config file. */
function compact(values: Record<string, string | undefined>): UciValues {
  const result: UciValues = {}
  for (const [key, value] of Object.entries(values)) {
    if (value === undefined || value === null) continue
    const text = String(value).trim()
    if (!text) continue
    result[key] = text
  }
  return result
}

/** Removes an option (or the whole section) and tolerates the "not there" case. */
async function removeOption(
  config: SetupConfig,
  section: string,
  option?: string
): Promise<void> {
  try {
    await uciDelete(config, section, option)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    if (!/not found|不存在|invalid|entry|no such/i.test(message)) throw err
  }
}

/** The name of an interface: the `name` option or the UCI section name. */
function interfaceName(section: UciSection, key: string): string {
  return uciString(section, 'name') || uciString(section, '.name') || key
}

/** The band of a radio, guessed from `band`, `hwmode` or the position. */
function detectBand(radio: UciSection, index: number): SetupBand {
  const band = uciString(radio, 'band').toLowerCase()
  if (band.startsWith('2')) return '2g'
  if (band.startsWith('5')) return '5g'
  if (band.startsWith('6')) return '6g'

  const hwmode = uciString(radio, 'hwmode').toLowerCase()
  if (hwmode.startsWith('11a') || hwmode.startsWith('11ac')) return '5g'
  if (hwmode.startsWith('11g') || hwmode.startsWith('11b')) return '2g'

  return index === 0 ? '2g' : '5g'
}

/** The `wifi-iface` that belongs to a radio. */
function findIface(
  ifaces: UciSection[],
  radio: string,
  index: number
): UciSection | undefined {
  const byDevice = ifaces.find((iface) => uciString(iface, 'device') === radio)
  if (byDevice) return byDevice

  // Configs without a `device` option keep the order of the radios.
  const unbound = ifaces.filter((iface) => !uciString(iface, 'device'))
  return unbound[index]
}

/** Converts a prefix length into a dotted netmask. */
function prefixToMask(prefix: number): string {
  const value = Math.min(32, Math.max(0, Math.round(prefix)))
  const bits = value === 0 ? 0 : (0xffffffff << (32 - value)) >>> 0
  return [24, 16, 8, 0].map((shift) => (bits >>> shift) & 0xff).join('.')
}

/** Splits "192.168.1.2/24" into the address and the prefix. */
function splitAddress(value: string): { address: string; prefix: number | null } {
  const text = value.trim()
  const slash = text.lastIndexOf('/')
  if (slash < 0) return { address: text, prefix: null }
  const suffix = text.slice(slash + 1).trim()
  const prefix = /^\d{1,2}$/.test(suffix) ? Number(suffix) : null
  return { address: text.slice(0, slash).trim(), prefix }
}

/** True when the value is a dotted quad IPv4 address. */
export function isValidSetupIpv4(value: string): boolean {
  const text = value.trim()
  if (!/^\d{1,3}(\.\d{1,3}){3}$/.test(text)) return false
  return text.split('.').every((part) => {
    const number = Number(part)
    return number >= 0 && number <= 255
  })
}

/** True when the value looks like a host name. */
export function isValidSetupHostname(value: string): boolean {
  return /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,62}$/.test(value.trim())
}

/* ------------------------------------------------------------------ *
 * State detection
 * ------------------------------------------------------------------ */

/**
 * Reads `system`, `wireless` and `network` and decides whether the router
 * was flashed but never configured.
 *
 * The rules are the ones LuCI uses: the factory default hostname, a missing
 * `wifi-iface` section and a missing LAN interface all mean "not configured".
 */
export async function readSetupStatus(): Promise<SetupStatus> {
  const [systemRaw, wirelessRaw, networkRaw] = await Promise.all([
    uciGet('system'),
    uciGet('wireless'),
    uciGet('network')
  ])

  const systemSection = uciByType(systemRaw, 'system')[0]
  const hostname = uciString(systemSection, 'hostname')
  const timezone = uciString(systemSection, 'timezone')
  const zonename = uciString(systemSection, 'zonename')
  const hostnameIsDefault = !hostname.trim() || DEFAULT_HOSTNAME.test(hostname.trim())

  const ifaces = uciByType(wirelessRaw, 'wifi-iface')
  // A `wifi-iface` that is switched off does not broadcast anything, so only
  // the enabled ones count as "the wireless is set up".
  const activeIfaces = ifaces.filter(
    (iface) => !uciBool(iface, 'disabled') && uciString(iface, 'ssid').trim()
  )

  const interfaces = uciByType(networkRaw, 'interface')
  const lan = interfaces.find((section) => interfaceName(section, 'lan') === 'lan')
  const wan = interfaces.find((section) => interfaceName(section, 'wan') === 'wan')
  const hasLan = Boolean(
    lan && (uciString(lan, 'ipaddr') || uciString(lan, 'address'))
  )
  const hasWan = Boolean(wan)

  const checks: SetupCheck[] = [
    {
      key: 'hostname',
      label: '主机名',
      done: Boolean(hostname.trim()) && !hostnameIsDefault,
      detail: hostname.trim()
        ? hostnameIsDefault
          ? `仍是出厂默认值 ${hostname}`
          : `当前：${hostname}`
        : '尚未设置主机名'
    },
    {
      key: 'timezone',
      label: '时区',
      done: Boolean(timezone.trim() || zonename.trim()),
      detail:
        zonename.trim() || timezone.trim()
          ? `当前：${zonename.trim() || timezone.trim()}`
          : '尚未设置时区'
    },
    {
      key: 'wireless',
      label: '无线网络',
      done: activeIfaces.length > 0,
      detail: !ifaces.length
        ? '没有 wifi-iface 段，设备不会广播 Wi-Fi'
        : activeIfaces.length
          ? `${activeIfaces.length} 个 SSID 正在广播（共 ${ifaces.length} 个）`
          : `${ifaces.length} 个 SSID 均已禁用`
    },
    {
      key: 'network',
      label: '网络接口',
      done: hasLan,
      detail: hasLan
        ? hasWan
          ? 'LAN 与 WAN 均已配置'
          : 'LAN 已配置，WAN 待设置'
        : '缺少 LAN 接口配置'
    }
  ]

  return {
    configured: hasLan && activeIfaces.length > 0,
    hostname,
    hostnameIsDefault,
    timezone,
    wifiIfaceCount: ifaces.length,
    hasLan,
    hasWan,
    checks,
    pending: checks.filter((check) => !check.done).length
  }
}

/* ------------------------------------------------------------------ *
 * Identity
 * ------------------------------------------------------------------ */

/** Reads the hostname and the timezone of the `system` config. */
export async function readSetupIdentity(): Promise<SetupIdentity> {
  const values = await uciGet('system')
  const section = uciByType(values, 'system')[0]
  return {
    section: section?.['.name'] ?? 'system',
    hostname: uciString(section, 'hostname'),
    timezone: uciString(section, 'timezone'),
    zonename: uciString(section, 'zonename')
  }
}

/**
 * Stages the hostname and the timezone of the `system` config.
 *
 * The router keeps two options for the time zone: `zonename` (the IANA name,
 * e.g. "Asia/Shanghai") and `timezone` (the POSIX string, e.g. "CST-8").
 * `/etc/init.d/system` needs both, so they are written together.
 */
export async function stageSetupIdentity(draft: SetupIdentityDraft): Promise<void> {
  const values = compact({ hostname: draft.hostname })
  if (draft.zone) {
    values.zonename = draft.zone
    values.timezone = draft.tzstring || draft.zone
  }
  if (!Object.keys(values).length) return

  if (draft.section) {
    await uciSet('system', draft.section, values)
    return
  }

  const existing = await uciGet('system')
  const section = uciByType(existing, 'system')[0]
  if (section?.['.name']) {
    await uciSet('system', section['.name'], values)
    return
  }
  await uciAdd('system', 'system', values, 'system')
}

/* ------------------------------------------------------------------ *
 * Time zones
 * ------------------------------------------------------------------ */

/**
 * Normalises the reply of `luci.getTimezones`.
 *
 * The router answers with a map of "zone name" → `{ tzstring, active }`, older
 * builds use a plain list. Both shapes are supported.
 */
export function parseSetupTimezones(data: unknown): SetupTimezone[] {
  const found = new Map<string, SetupTimezone>()

  const push = (zone: unknown, tzstring?: unknown): void => {
    if (typeof zone !== 'string') return
    const name = zone.trim()
    if (!name || found.has(name)) return
    found.set(name, {
      zone: name,
      tzstring: typeof tzstring === 'string' ? tzstring.trim() : ''
    })
  }

  const visit = (value: unknown): void => {
    if (Array.isArray(value)) {
      for (const item of value) {
        if (typeof item === 'string') {
          push(item)
        } else if (item && typeof item === 'object') {
          const entry = item as Record<string, unknown>
          push(
            entry.name ?? entry.zone ?? entry.tz ?? entry.value,
            entry.tzstring ?? entry.string
          )
        }
      }
      return
    }

    if (!value || typeof value !== 'object') return
    const wrapper = value as Record<string, unknown>

    for (const key of ['timezones', 'zones', 'timezone', 'tz', 'list']) {
      if (wrapper[key] !== undefined) {
        visit(wrapper[key])
        return
      }
    }

    // A map of "zone name" → { tzstring: "…" }.
    for (const [zone, meta] of Object.entries(wrapper)) {
      if (meta && typeof meta === 'object') {
        const tzstring = (meta as Record<string, unknown>).tzstring
        push(zone, typeof tzstring === 'string' ? tzstring : '')
      } else {
        push(zone, typeof meta === 'string' ? meta : undefined)
      }
    }
  }

  visit(data)
  return [...found.values()].sort((a, b) => a.zone.localeCompare(b.zone))
}

/** The time zones the router knows about. */
export async function readSetupTimezones(
  fallback: SetupTimezone[] = FALLBACK_TIMEZONES
): Promise<SetupTimezone[]> {
  try {
    const data = await ubusCall<unknown>('luci', 'getTimezones', {})
    const list = parseSetupTimezones(data)
    return list.length ? list : fallback
  } catch {
    return fallback
  }
}

/* ------------------------------------------------------------------ *
 * Wireless
 * ------------------------------------------------------------------ */

/** Reads the radios and their SSIDs. */
export async function readSetupWireless(): Promise<SetupWirelessModel> {
  const values = await uciGet('wireless')
  const ifaces = uciByType(values, 'wifi-iface')
  const radios = uciByType(values, 'wifi-device')

  const models = radios.map((radio, index) => {
    const section = uciString(radio, '.name')
    const band = detectBand(radio, index)
    const iface = findIface(ifaces, section, index)

    return {
      section,
      band,
      bandLabel: BAND_LABELS[band],
      disabled: uciBool(radio, 'disabled'),
      channel: uciString(radio, 'channel'),
      iface: iface ? uciString(iface, '.name') : '',
      ssid: uciString(iface, 'ssid'),
      encryption: uciString(iface, 'encryption') || 'none',
      keySet: hasOption(iface, 'key'),
      ifaceDisabled: uciBool(iface, 'disabled')
    }
  })

  return { radios: models }
}

/** A free UCI section name for a new `wifi-iface`. */
async function nextIfaceName(radio: string): Promise<string> {
  const values = await uciGet('wireless')
  const taken = new Set(Object.keys(values))
  const base = `default_${radio}`
  if (!taken.has(base)) return base

  let index = 1
  while (taken.has(`${base}_${index}`)) index += 1
  return `${base}_${index}`
}

/**
 * Stages the SSID, the encryption and the password of every radio.
 *
 * A radio without a `wifi-iface` gets a new one; an existing SSID keeps its
 * password unless a new one was typed in.
 */
export async function stageSetupWireless(drafts: SetupWifiDraft[]): Promise<void> {
  for (const draft of drafts) {
    if (!draft.radio) continue

    await uciSet('wireless', draft.radio, { disabled: draft.enabled ? '0' : '1' })

    const existing = draft.iface ? await uciGetSection('wireless', draft.iface) : undefined
    const values: UciValues = compact({
      ssid: draft.ssid,
      encryption: draft.encryption,
      disabled: draft.enabled ? '0' : '1'
    })

    if (!existing) {
      values.device = draft.radio
      values.mode = 'ap'
      values.network = 'lan'
    }

    if (draft.key) values.key = draft.key

    if (existing) {
      await uciSet('wireless', draft.iface, values)
    } else {
      const name = await nextIfaceName(draft.radio)
      try {
        await uciAdd('wireless', 'wifi-iface', values, name)
      } catch {
        // The name was taken after all — let the router pick one.
        await uciAdd('wireless', 'wifi-iface', values)
      }
    }

    if (existing && draft.encryption === 'none') {
      await removeOption('wireless', draft.iface, 'key')
    }
  }
}

/* ------------------------------------------------------------------ *
 * WAN
 * ------------------------------------------------------------------ */

/** Device name prefixes that never serve as a WAN port. */
const NON_WAN_DEVICE = /^(lo$|br-|wg|ppp|tun|tap|ifb|teql|gre|ip6|sit|bond|vlan|ath|ra)/

/** The devices that may be used as the WAN port. */
async function readWanDevices(): Promise<string[]> {
  try {
    const data = await ubusCall<Record<string, unknown>>('luci-rpc', 'getNetworkDevices')
    const names = new Set<string>()
    for (const device of Object.values(data ?? {})) {
      const entry = device as {
        name?: string
        wireless?: boolean
        master?: string | null
      }
      const name = entry?.name || ''
      if (!name) continue
      if (entry.wireless) continue
      if (entry.master) continue
      if (NON_WAN_DEVICE.test(name)) continue
      names.add(name)
    }
    return [...names].sort((a, b) => a.localeCompare(b))
  } catch {
    return []
  }
}

/** Reads the WAN interface and the devices it may be bound to. */
export async function readSetupWan(): Promise<SetupWanModel> {
  const [values, devices] = await Promise.all([uciGet('network'), readWanDevices()])

  const interfaces = uciByType(values, 'interface')
  const section =
    interfaces.find((item) => interfaceName(item, 'wan') === 'wan') ??
    interfaces.find((item) => uciString(item, 'type') === 'wan')

  const protocol = uciString(section, 'proto')
  const rawAddress = uciList(section, 'ipaddr')[0] ?? uciString(section, 'address')
  const { address, prefix } = splitAddress(rawAddress)
  const netmask = uciString(section, 'netmask') || (prefix === null ? '' : prefixToMask(prefix))

  return {
    section: section ? uciString(section, '.name') : '',
    device: uciString(section, 'device') || uciString(section, 'ifname'),
    protocol: protocol === 'static' ? 'static' : 'dhcp',
    ipaddr: address,
    netmask,
    gateway: uciString(section, 'gateway'),
    dns: uciList(section, 'dns'),
    disabled: uciBool(section, 'disabled'),
    devices
  }
}

/** Stages the WAN interface. */
export async function stageSetupWan(draft: SetupWanDraft): Promise<void> {
  const existing = draft.section ? await uciGetSection('network', draft.section) : undefined
  // Older configurations bind the interface with `ifname` instead of `device`.
  const deviceOption =
    existing && !uciString(existing, 'device') && uciString(existing, 'ifname')
      ? 'ifname'
      : 'device'

  const values: UciValues = compact({
    proto: draft.protocol,
    [deviceOption]: draft.device,
    ipaddr: draft.protocol === 'static' ? draft.ipaddr : undefined,
    netmask: draft.protocol === 'static' ? draft.netmask : undefined,
    gateway: draft.protocol === 'static' ? draft.gateway : undefined,
    dns: draft.protocol === 'static' && draft.dns.length ? draft.dns.join(' ') : undefined
  })

  if (!draft.section) {
    try {
      await uciAdd('network', 'interface', values, 'wan')
    } catch {
      // The name was taken after all — let the router pick one.
      await uciAdd('network', 'interface', values)
    }
    return
  }

  await uciSet('network', draft.section, values)

  if (draft.protocol !== 'static') {
    for (const option of ['ipaddr', 'netmask', 'gateway', 'dns']) {
      await removeOption('network', draft.section, option)
    }
  }
}

/* ------------------------------------------------------------------ *
 * Diffs
 * ------------------------------------------------------------------ */

/** The pending changes of the identity step. */
export function diffSetupIdentity(
  base: SetupIdentity,
  next: { hostname: string; zone: string }
): SetupChange[] {
  const changes: SetupChange[] = []
  if (base.hostname !== next.hostname) {
    changes.push({
      label: '主机名',
      before: base.hostname || '（空）',
      after: next.hostname || '（空）'
    })
  }
  const before = base.zonename || base.timezone
  if (before !== next.zone) {
    changes.push({
      label: '时区',
      before: before || '（空）',
      after: next.zone || '（空）'
    })
  }
  return changes
}

/** A readable label for an encryption value. */
export function setupEncryptionText(encryption: string | undefined): string {
  const option = SETUP_ENCRYPTION_OPTIONS.find((item) => item.value === encryption)
  if (option) return option.label
  if (!encryption) return '开放网络'
  return encryption
}

/** The pending changes of the wireless step. */
export function diffSetupWireless(
  base: SetupWirelessModel,
  drafts: SetupWifiDraft[]
): SetupChange[] {
  const changes: SetupChange[] = []

  for (const draft of drafts) {
    const radio = base.radios.find((item) => item.section === draft.radio)
    if (!radio) continue

    if (radio.ssid !== draft.ssid) {
      changes.push({
        label: `${radio.bandLabel} SSID`,
        before: radio.ssid || '（空）',
        after: draft.ssid || '（空）'
      })
    }
    if (radio.encryption !== draft.encryption) {
      changes.push({
        label: `${radio.bandLabel} 加密`,
        before: setupEncryptionText(radio.encryption),
        after: setupEncryptionText(draft.encryption)
      })
    }
    if (draft.key) {
      changes.push({
        label: `${radio.bandLabel} 密码`,
        before: radio.keySet ? '（已设置，不修改）' : '（未设置）',
        after: '（新密码）'
      })
    }
    const wasEnabled = !radio.disabled && !radio.ifaceDisabled
    if (wasEnabled !== draft.enabled) {
      changes.push({
        label: `${radio.bandLabel} 无线`,
        before: wasEnabled ? '已启用' : '已禁用',
        after: draft.enabled ? '已启用' : '已禁用'
      })
    }
  }

  return changes
}

/** The pending changes of the WAN step. */
export function diffSetupWan(base: SetupWanModel, draft: SetupWanDraft): SetupChange[] {
  const changes: SetupChange[] = []

  if (base.protocol !== draft.protocol) {
    changes.push({
      label: '上网方式',
      before: base.protocol === 'dhcp' ? 'DHCP 客户端' : '静态地址',
      after: draft.protocol === 'dhcp' ? 'DHCP 客户端' : '静态地址'
    })
  }
  if (base.device !== draft.device) {
    changes.push({ label: 'WAN 接口', before: base.device || '（空）', after: draft.device })
  }
  if (draft.protocol === 'static') {
    if (base.ipaddr !== draft.ipaddr) {
      changes.push({ label: 'WAN IP', before: base.ipaddr || '（空）', after: draft.ipaddr })
    }
    if (base.netmask !== draft.netmask) {
      changes.push({
        label: '子网掩码',
        before: base.netmask || '（空）',
        after: draft.netmask
      })
    }
    if (base.gateway !== draft.gateway) {
      changes.push({
        label: '网关',
        before: base.gateway || '（空）',
        after: draft.gateway
      })
    }
    if (base.dns.join(' ') !== draft.dns.join(' ')) {
      changes.push({
        label: 'DNS',
        before: base.dns.join(' ') || '（空）',
        after: draft.dns.join(' ') || '（空）'
      })
    }
  }

  return changes
}

/* ------------------------------------------------------------------ *
 * Commit / apply / rollback
 * ------------------------------------------------------------------ */

/** Throws away the staged changes of the given config files. */
export async function discardSetupChanges(configs: SetupConfig[]): Promise<void> {
  for (const config of configs) {
    try {
      await systemOps.revertConfig(config)
    } catch {
      // Nothing staged — that is fine.
    }
  }
}

/**
 * Commits the staged changes and applies them.
 *
 * The password is changed before the services are reloaded: a new WAN
 * configuration may interrupt the connection, and the token is only valid for
 * 120 seconds.
 */
export async function applySetupChanges(
  plan: SetupApplyPlan,
  password?: { username: string; password: string }
): Promise<SetupApplyReport> {
  const applied: string[] = []
  const warnings: string[] = []

  if (plan.system) await uciCommit('system')
  if (plan.wireless) await uciCommit('wireless')
  if (plan.network) await uciCommit('network')

  try {
    await systemOps.applyChanges()
    applied.push('配置已写入路由器')
  } catch (err) {
    warnings.push(
      `统一应用失败：${err instanceof Error ? err.message : '未知错误'}，已改为逐项重载服务`
    )
  }

  if (password?.password) {
    const token = await requestToken('set-password')
    await systemOps.setPassword(password.username, password.password, token)
    applied.push(`管理员密码 ${password.username} 已更新`)
  }

  if (plan.system) {
    // The hostname and the timezone are applied by the system init script.
    try {
      await systemOps.serviceAction('system', 'reload')
      applied.push('主机名与时区已生效')
    } catch {
      warnings.push('系统设置已保存，但重载 system 服务失败，重启后生效')
    }
  }

  if (plan.wireless) {
    await systemOps.reloadWifi()
    applied.push('无线服务已重载')
  }

  if (plan.network) {
    await systemOps.reloadNetwork()
    applied.push('网络服务已重载')
  }

  return { applied, warnings }
}

/**
 * Writes the state of the router back — the rollback after a failed apply.
 *
 * The wireless password cannot be restored: it is write only on the router.
 */
export async function restoreSetupBaseline(baseline: SetupBaseline): Promise<void> {
  await restoreIdentity(baseline.identity)

  const drafts: SetupWifiDraft[] = baseline.wireless.radios.map((radio) => ({
    radio: radio.section,
    iface: radio.iface,
    ssid: radio.ssid,
    encryption: radio.encryption,
    key: '',
    enabled: !radio.disabled && !radio.ifaceDisabled
  }))
  await stageSetupWireless(drafts)

  if (baseline.wan.section) {
    await stageSetupWan({
      section: baseline.wan.section,
      device: baseline.wan.device,
      protocol: baseline.wan.protocol,
      ipaddr: baseline.wan.ipaddr,
      netmask: baseline.wan.netmask,
      gateway: baseline.wan.gateway,
      dns: baseline.wan.dns
    })
  } else {
    // The wizard created the WAN interface — remove it again.
    await removeOption('network', 'wan')
  }

  await uciCommit('system')
  await uciCommit('wireless')
  await uciCommit('network')

  try {
    await systemOps.applyChanges()
  } catch {
    // The rollback of the rollback is not worth an error dialog.
  }
  try {
    await systemOps.reloadWifi()
  } catch {
    // Ignored on purpose.
  }
  try {
    await systemOps.reloadNetwork()
  } catch {
    // Ignored on purpose.
  }
}

/** Writes the hostname and the timezone back — empty means "remove". */
async function restoreIdentity(identity: SetupIdentity): Promise<void> {
  const section = identity.section
  if (!section) return

  if (identity.hostname) {
    await uciSet('system', section, { hostname: identity.hostname })
  } else {
    await removeOption('system', section, 'hostname')
  }

  if (identity.timezone) {
    await uciSet('system', section, { timezone: identity.timezone })
  } else {
    await removeOption('system', section, 'timezone')
  }

  if (identity.zonename) {
    await uciSet('system', section, { zonename: identity.zonename })
  } else {
    await removeOption('system', section, 'zonename')
  }
}
