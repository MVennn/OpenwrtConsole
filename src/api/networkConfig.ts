import {
  uciAdd,
  uciBool,
  uciChanges,
  uciCommit,
  uciDelete,
  uciGet,
  uciGetSection,
  uciList,
  uciNumber,
  uciSet,
  uciString,
  type UciChange,
  type UciSection,
  type UciValues
} from '@/api/uci'
import { ubusCall } from '@/api/ubus'
import { systemOps } from '@/api/systemOps'
import { api } from '@/api/openwrt'

/**
 * Writable network configuration (`/etc/config/network`).
 *
 * The page edits exactly one UCI config file:
 *
 *  - `config interface` sections describe the logical interfaces (protocol,
 *    device, address, gateway, DNS, MTU, disabled flag)
 *  - `config route` sections describe the static routes, the default route
 *    included
 *
 * The wireless segments (`config wifi-iface`) live in `/etc/config/wireless`
 * and are only *read* here — they are shown so the user can see which network
 * a SSID is attached to.
 *
 * Write path: `uci.set` → `uci.commit` → `network reload`
 * (`systemOps.reloadNetwork()`). Every change is staged first, so it can be
 * reviewed and discarded with `uci revert` before it is applied.
 */

/** The UCI config file this module owns. */
export const NET_CONFIG = 'network'

/** Protocols the editor offers. `dhcpv6` is kept for the IPv6 WAN. */
export type NetProtocol = 'static' | 'dhcp' | 'dhcpv6' | 'none' | 'other'

/* ------------------------------------------------------------------ *
 * Model
 * ------------------------------------------------------------------ */

/** A `config interface` section of /etc/config/network. */
export interface NetInterface {
  /** UCI section name (`lan`, `wan`, `wan6`). */
  id: string
  /** Logical interface name — the `ifname` option or the section name. */
  name: string
  /** Raw `proto` value (`static`, `dhcp`, `dhcpv6`, …). */
  protocol: string
  /** Device the interface is bound to (`br-lan`, `wan`, …). */
  device: string
  /** Primary IPv4 address without the mask. */
  address: string
  /** Prefix length of the primary address, `null` when unknown. */
  prefix: number | null
  /** Dotted netmask as stored in the `netmask` option. */
  netmask: string
  /** Every stored address (a UCI list may carry more than one). */
  addresses: string[]
  /** Default gateway of the interface (`gateway` option). */
  gateway: string
  /** Custom DNS servers of the interface. */
  dns: string[]
  /** MTU override, `null` when the option is absent. */
  mtu: number | null
  /** The interface is administratively disabled. */
  disabled: boolean
  /** The interface belongs to the LAN network. */
  isLan: boolean
  /** Raw `type` option (`lan`, `wan`, …), empty when it is not set. */
  type: string
  /** The interface address is stored as `address/prefix`. */
  usesCidr: boolean
}

/** A `config route` section of /etc/config/network. */
export interface NetRoute {
  /** UCI section name (`route_1`, `cfg01e63d`). */
  id: string
  /** Target network (`0.0.0.0` for the default route). */
  target: string
  /** Dotted netmask of the target. */
  netmask: string
  /** Next hop. */
  gateway: string
  /** Interface the route is bound to. */
  iface: string
  /** Metric ("跃点"), `null` when the option is absent. */
  metric: number | null
  /** The route is the default route (0.0.0.0/0). */
  isDefault: boolean
}

/** A read-only `config wifi-iface` section of /etc/config/wireless. */
export interface NetWirelessIface {
  /** UCI section name (`default_radio0`). */
  id: string
  /** SSID of the radio the segment belongs to. */
  ssid: string
  /** Radio the segment belongs to. */
  radio: string
  /** Networks the segment is attached to. */
  networks: string[]
  /** Working mode (`ap`, `sta`, …). */
  mode: string
  /** The segment is disabled. */
  disabled: boolean
}

/** Runtime state of an interface (from `network.interface.dump`). */
export interface NetRuntimeState {
  up: boolean
  l3Device: string
  address: string
}

/** Everything the network configuration page needs. */
export interface NetworkModel {
  interfaces: NetInterface[]
  routes: NetRoute[]
  /** Wireless segments (read-only). */
  wireless: NetWirelessIface[]
  /** Runtime state per interface name. */
  runtime: Record<string, NetRuntimeState>
  /** Known device names for the device picker. */
  devices: string[]
  /** Number of known hosts (`luci-rpc getHostHints`). */
  hostCount: number
  /**
   * Every `interface` section name, including `loopback` and the ones that
   * are not listed in the table. Used to keep a new section name unique.
   */
  sectionNames: string[]
}

/* ------------------------------------------------------------------ *
 * Drafts (what the dialogs collect)
 * ------------------------------------------------------------------ */

export interface NetInterfaceDraft {
  /** Absent when a new interface is created. */
  id?: string
  /** Section name of a new interface. */
  name?: string
  /** Raw `proto` value (`static`, `dhcp`, `dhcpv6`, …). */
  protocol: string
  device: string
  /** Primary address, may carry a `/prefix`. */
  address: string
  /** Prefix length chosen in the mask field. */
  prefix: number | null
  /** Dotted netmask derived from the prefix. */
  netmask: string
  gateway: string
  dns: string[]
  mtu: number | null
  disabled: boolean
  isLan: boolean
  /** The stored configuration already uses the `address/prefix` notation. */
  usesCidr: boolean
  /** Addresses the dialog does not edit — they are written back unchanged. */
  extraAddresses: string[]
  /** LAN flag of the stored configuration. */
  originalIsLan: boolean
  /** Raw `type` option of the stored configuration. */
  originalType: string
  /** Disabled flag of the stored configuration. */
  originalDisabled: boolean
}

export interface NetRouteDraft {
  /** Absent when a new route is created. */
  id?: string
  target: string
  netmask: string
  gateway: string
  iface: string
  metric: number | null
}

/* ------------------------------------------------------------------ *
 * Address helpers
 * ------------------------------------------------------------------ */

/** True for a plain IPv4 address. */
export function isValidIpv4(value: string): boolean {
  const text = value.trim()
  if (!/^\d{1,3}(\.\d{1,3}){3}$/.test(text)) return false
  return text.split('.').every((part) => {
    const number = Number(part)
    return number >= 0 && number <= 255 && (part === '0' || !part.startsWith('0'))
  })
}

/** True for a dotted IPv4 netmask with a continuous bit range. */
export function isValidNetmask(value: string): boolean {
  const text = value.trim()
  if (!/^\d{1,3}(\.\d{1,3}){3}$/.test(text)) return false
  const parts = text.split('.').map(Number)
  if (parts.some((part) => part < 0 || part > 255)) return false
  let bits = ''
  for (const part of parts) bits += part.toString(2).padStart(8, '0')
  return /^1*0*$/.test(bits)
}

/** Converts a dotted netmask into a prefix length. */
export function maskToPrefix(mask: string): number | null {
  if (!isValidNetmask(mask)) return null
  return mask
    .split('.')
    .map((part) => Number(part).toString(2).padStart(8, '0'))
    .join('')
    .split('1').length - 1
}

/** Converts a prefix length into a dotted netmask. */
export function prefixToMask(prefix: number): string {
  const value = Math.min(32, Math.max(0, Math.round(prefix)))
  const bits = value === 0 ? 0 : (0xffffffff << (32 - value)) >>> 0
  return [24, 16, 8, 0].map((shift) => (bits >>> shift) & 0xff).join('.')
}

/** Splits `10.0.0.1/24` into its address and its prefix. */
export function splitCidr(value: string): { address: string; prefix: number | null } {
  const text = value.trim()
  const slash = text.lastIndexOf('/')
  if (slash < 0) return { address: text, prefix: null }
  const address = text.slice(0, slash).trim()
  const suffix = text.slice(slash + 1).trim()
  if (!/^\d{1,2}$/.test(suffix)) return { address: text, prefix: null }
  const prefix = Number(suffix)
  if (prefix < 0 || prefix > 32) return { address: text, prefix: null }
  return { address, prefix }
}

/** Renders `address/prefix` (or just the address when there is no prefix). */
export function formatCidr(address: string, prefix: number | null): string {
  if (!address) return ''
  return prefix === null ? address : `${address}/${prefix}`
}

/* ------------------------------------------------------------------ *
 * Parsing
 * ------------------------------------------------------------------ */

function sectionName(section: UciSection, key: string): string {
  return uciString(section, '.name') || key
}

/**
 * The LAN flag: an explicit `type 'lan'` option wins, otherwise the section
 * name `lan` is treated as the LAN network.
 */
function deriveIsLan(id: string, type: string): boolean {
  if (type) return type === 'lan'
  return id === 'lan'
}

function parseInterface(id: string, section: UciSection): NetInterface {
  const addresses = uciList(section, 'ipaddr')
  const primary = addresses[0] ?? ''
  const { address, prefix } = splitCidr(primary)
  const netmask = uciString(section, 'netmask')
  const type = uciString(section, 'type')
  const mtu = uciNumber(section, 'mtu', 0)

  return {
    id,
    name: uciString(section, 'ifname') || id,
    protocol: uciString(section, 'proto') || 'none',
    device: uciString(section, 'device'),
    address,
    prefix: prefix ?? maskToPrefix(netmask),
    netmask,
    addresses,
    gateway: uciString(section, 'gateway'),
    dns: uciList(section, 'dns'),
    mtu: mtu > 0 ? mtu : null,
    disabled: uciBool(section, 'disabled'),
    isLan: deriveIsLan(id, type),
    type,
    usesCidr: addresses.some((item) => item.includes('/'))
  }
}

/** True for the routes that define the default gateway. */
export function isDefaultTarget(target: string, netmask: string): boolean {
  const value = target.trim()
  if (value === '0.0.0.0' || value === '0.0.0.0/0') return true
  if (value === '::' || value === '::/0') return true
  return value === '' && netmask.trim() === '0.0.0.0'
}

function parseRoute(id: string, section: UciSection): NetRoute {
  const target = uciString(section, 'target')
  const netmask = uciString(section, 'netmask')
  const metric = uciNumber(section, 'metric', 0)

  return {
    id,
    target,
    netmask,
    gateway: uciString(section, 'gateway'),
    iface: uciString(section, 'interface'),
    metric: metric > 0 ? metric : null,
    isDefault: isDefaultTarget(target, netmask)
  }
}

/** Turns the raw `uci.get` map into the typed network model. */
export function parseNetworkModel(
  values: Record<string, UciSection>
): Pick<NetworkModel, 'interfaces' | 'routes' | 'sectionNames'> {
  const entries = Object.entries(values ?? {})
  const ofType = (type: string) => entries.filter(([, section]) => section['.type'] === type)

  const allInterfaces = ofType('interface')
    .map(([key, section]) => parseInterface(sectionName(section, key), section))

  const interfaces = allInterfaces.filter((item) => item.id !== 'loopback')

  const routes = ofType('route')
    .map(([key, section]) => parseRoute(sectionName(section, key), section))
    .sort((a, b) => {
      if (a.isDefault !== b.isDefault) return a.isDefault ? -1 : 1
      return a.target.localeCompare(b.target)
    })

  return { interfaces, routes, sectionNames: allInterfaces.map((item) => item.id) }
}

export function createEmptyNetworkModel(): NetworkModel {
  return {
    interfaces: [],
    routes: [],
    wireless: [],
    runtime: {},
    devices: [],
    hostCount: 0,
    sectionNames: []
  }
}

/* ------------------------------------------------------------------ *
 * Reading
 * ------------------------------------------------------------------ */

/** Reads the wireless segments (read-only, they live in another config). */
async function readWirelessSegments(): Promise<NetWirelessIface[]> {
  let values: Record<string, UciSection> = {}
  try {
    values = await uciGet('wireless')
  } catch {
    return []
  }

  const entries = Object.entries(values)
  const ssidOf = new Map<string, string>()
  for (const [key, section] of entries) {
    if (section['.type'] !== 'wifi-device') continue
    ssidOf.set(sectionName(section, key), uciString(section, 'ssid'))
  }

  const segments: NetWirelessIface[] = []
  for (const [key, section] of entries) {
    if (section['.type'] !== 'wifi-iface') continue
    const radio = uciString(section, 'device')
    segments.push({
      id: sectionName(section, key),
      ssid: ssidOf.get(radio) || '',
      radio,
      networks: uciList(section, 'network'),
      mode: uciString(section, 'mode') || 'ap',
      disabled: uciBool(section, 'disabled')
    })
  }
  return segments
}

/**
 * Reads the network configuration plus the runtime state.
 * Read-only: nothing is written to the router.
 */
export async function fetchNetworkModel(): Promise<NetworkModel> {
  const [values, wireless, runtime, devices, hints] = await Promise.all([
    uciGet(NET_CONFIG),
    readWirelessSegments(),
    api.interfaces().catch(() => []),
    api.networkDevices().catch(() => []),
    api.hostHints().catch(() => ({} as Record<string, unknown>))
  ])

  const parsed = parseNetworkModel(values)

  const runtimeMap: Record<string, NetRuntimeState> = {}
  for (const item of runtime) {
    const address = item['ipv4-address']?.[0]
    runtimeMap[item.interface] = {
      up: Boolean(item.up),
      l3Device: item.l3_device || '',
      address: address ? `${address.address}/${address.mask}` : ''
    }
  }

  const deviceNames = new Set<string>()
  for (const device of devices) deviceNames.add(device.name)
  for (const iface of parsed.interfaces) if (iface.device) deviceNames.add(iface.device)

  return {
    ...parsed,
    wireless,
    runtime: runtimeMap,
    devices: [...deviceNames].sort((a, b) => a.localeCompare(b)),
    hostCount: Object.keys(hints ?? {}).length
  }
}

/** The staged (not yet committed) changes of the network config. */
export async function fetchPendingChanges(): Promise<UciChange[]> {
  return uciChanges(NET_CONFIG)
}

/* ------------------------------------------------------------------ *
 * Writing
 * ------------------------------------------------------------------ */

/** Drops empty values so they are never written as empty options. */
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

/** Removes an option and tolerates the "not there" case. */
async function removeOption(section: string, option: string): Promise<void> {
  try {
    await uciDelete(NET_CONFIG, section, option)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    if (!/not found|不存在|invalid|entry/i.test(message)) throw err
  }
}

/** Writes a set of options and removes the listed ones. */
async function applyOptions(
  section: string,
  values: Record<string, string | undefined>,
  remove: string[] = []
): Promise<void> {
  const payload = compact(values)
  if (Object.keys(payload).length) await uciSet(NET_CONFIG, section, payload)
  for (const option of remove) await removeOption(section, option)
}

/**
 * Writes a UCI *list* option.
 *
 * The shared `uciSet` stringifies every value, so a list would become a
 * scalar option ("a,b") that netifd does not understand. rpcd keeps the list
 * shape when the value arrives as an array, so the list is written through
 * the same ubus transport with an array payload. The result is verified and
 * falls back to a space separated option when the router refuses the array.
 *
 * Returns a warning when the fallback was used.
 */
async function writeListOption(
  section: string,
  option: string,
  values: string[]
): Promise<string | undefined> {
  const list = values.map((item) => item.trim()).filter(Boolean)

  // Start from a clean list so removed entries really disappear.
  const current = await uciGetSection(NET_CONFIG, section)
  const previous = current?.[option]
  const previousList = Array.isArray(previous)
    ? previous.map((item) => String(item)).filter(Boolean)
    : previous === undefined || previous === null
      ? []
      : String(previous)
          .split(/[\s,]+/)
          .filter(Boolean)
  if (previousList.length) await uciDelete(NET_CONFIG, section, option)
  if (!list.length) return undefined

  try {
    await ubusCall('uci', 'set', {
      config: NET_CONFIG,
      section,
      values: { [option]: list }
    })
    const check = await uciGetSection(NET_CONFIG, section)
    const raw = check?.[option]
    if (
      Array.isArray(raw) &&
      raw.length === list.length &&
      raw.every((item, index) => String(item) === list[index])
    ) {
      return undefined
    }
    // rpcd stored a scalar (or appended) — fall back to the plain option.
    await uciDelete(NET_CONFIG, section, option)
  } catch {
    // Older rpcd builds only understand strings.
  }

  await uciSet(NET_CONFIG, section, { [option]: list.join(' ') })
  return `路由器拒绝了列表写法，${option} 已按空格分隔保存`
}

/** Writes the addresses of an interface (one scalar or a UCI list). */
async function writeAddresses(
  section: string,
  addresses: string[],
  usesCidr: boolean,
  netmask: string
): Promise<void> {
  const list = addresses.map((item) => item.trim()).filter(Boolean)

  await removeOption(section, 'ipaddr')
  await removeOption(section, 'netmask')
  if (!list.length) return

  if (list.length === 1) {
    await uciSet(NET_CONFIG, section, { ipaddr: list[0] })
  } else {
    await writeListOption(section, 'ipaddr', list)
  }

  if (!usesCidr && netmask) await uciSet(NET_CONFIG, section, { netmask })
}

/**
 * Stages the changes of an interface section. Nothing is committed here — the
 * page decides when the configuration is applied.
 *
 * Returns the UCI section name and an optional warning.
 */
export async function stageInterface(
  draft: NetInterfaceDraft
): Promise<{ id: string; warning?: string }> {
  const isNew = !draft.id
  const section = draft.id ?? ''

  const values: Record<string, string | undefined> = {}
  const remove: string[] = []

  values.proto = draft.protocol
  values.device = draft.device.trim() || undefined

  let addresses: string[] = []
  let netmask = ''
  if (draft.protocol === 'static') {
    const { address, prefix } = splitCidr(draft.address)
    const effectivePrefix = prefix ?? draft.prefix
    netmask = effectivePrefix !== null ? prefixToMask(effectivePrefix) : draft.netmask
    const primary = draft.usesCidr
      ? effectivePrefix !== null
        ? `${address}/${effectivePrefix}`
        : address
      : address
    addresses = [primary, ...draft.extraAddresses].filter(Boolean)
  } else {
    remove.push('ipaddr', 'netmask')
  }

  values.gateway = draft.gateway.trim() || undefined
  if (!values.gateway) remove.push('gateway')

  values.mtu = draft.mtu ? String(draft.mtu) : undefined
  if (!values.mtu) remove.push('mtu')

  // The disabled flag is only written when it actually changed — an absent
  // option means "enabled" and should stay absent.
  if (draft.disabled !== draft.originalDisabled) {
    values.disabled = draft.disabled ? '1' : '0'
  }

  // The LAN flag is only written when it actually changed.
  if (draft.isLan !== draft.originalIsLan) {
    if (draft.isLan) values.type = 'lan'
    else if (!draft.originalType || draft.originalType === 'lan') remove.push('type')
  }

  let target = section
  if (isNew) {
    target = await uciAdd(NET_CONFIG, 'interface', compact(values), draft.name?.trim())
  } else {
    await applyOptions(section, values, remove)
  }

  if (draft.protocol === 'static') {
    await writeAddresses(target, addresses, draft.usesCidr, netmask)
  }

  const warning = await writeListOption(target, 'dns', draft.dns)
  return warning ? { id: target, warning } : { id: target }
}

/** Stages the deletion of an interface section. */
export async function stageInterfaceRemoval(id: string): Promise<void> {
  await uciDelete(NET_CONFIG, id)
}

/** Enables or disables an interface (staged). */
export async function stageInterfaceEnabled(id: string, enabled: boolean): Promise<void> {
  await uciSet(NET_CONFIG, id, { disabled: enabled ? '0' : '1' })
}

/**
 * A free section name for a new static route (`route_1`, `route_2`, …).
 *
 * Sections that are staged for deletion are skipped as well — they still exist
 * in /etc/config/network, so reusing their name would collide.
 */
async function nextRouteName(): Promise<string> {
  const values = await uciGet(NET_CONFIG)
  const names = new Set(Object.keys(values))

  const changes = await uciChanges(NET_CONFIG).catch(() => [] as UciChange[])
  for (const change of changes) {
    if (change.op === 'delete' && !change.option) names.add(change.section)
  }

  let index = 1
  while (names.has(`route_${index}`)) index += 1
  return `route_${index}`
}

/** Stages a static route. Returns the UCI section name. */
export async function stageRoute(draft: NetRouteDraft): Promise<string> {
  const values: Record<string, string | undefined> = {
    target: draft.target,
    netmask: draft.netmask,
    gateway: draft.gateway,
    interface: draft.iface,
    metric: draft.metric !== null && draft.metric > 0 ? String(draft.metric) : undefined
  }

  if (draft.id) {
    await applyOptions(draft.id, values, draft.metric === null ? ['metric'] : [])
    return draft.id
  }
  return uciAdd(NET_CONFIG, 'route', compact(values), await nextRouteName())
}

/** Stages the deletion of a static route. */
export async function stageRouteRemoval(id: string): Promise<void> {
  await uciDelete(NET_CONFIG, id)
}

/* ------------------------------------------------------------------ *
 * Commit / apply / rollback
 * ------------------------------------------------------------------ */

/** Writes the staged changes to /etc/config/network. */
export async function commitNetwork(): Promise<void> {
  await uciCommit(NET_CONFIG)
}

/** Commits the staged changes and reloads the network service. */
export async function applyNetwork(): Promise<void> {
  await uciCommit(NET_CONFIG)
  await systemOps.reloadNetwork()
}

/** Discards every staged change of the network config (`uci revert`). */
export async function revertNetwork(): Promise<void> {
  await systemOps.revertConfig(NET_CONFIG)
}

/* ------------------------------------------------------------------ *
 * Display helpers
 * ------------------------------------------------------------------ */

/** Human readable label of a protocol value. */
export function protocolText(protocol: string | undefined): string {
  const value = (protocol || '').trim()
  if (!value) return '—'
  if (value === 'static') return '静态地址'
  if (value === 'dhcp') return 'DHCP 客户端'
  if (value === 'dhcpv6') return 'DHCPv6 客户端'
  if (value === 'none') return '无协议'
  return value.toUpperCase()
}

/** `10.0.0.1` for the address column, with a marker for extra addresses. */
export function addressText(iface: NetInterface): string {
  if (!iface.address) return '—'
  const extra = iface.addresses.length - 1
  return extra > 0 ? `${iface.address}（+${extra}）` : iface.address
}

/** The netmask of an interface (`255.255.255.0` or `/24`). */
export function netmaskText(iface: NetInterface): string {
  if (iface.netmask) return iface.netmask
  if (iface.prefix !== null) return `/${iface.prefix}`
  return '—'
}

/** The target of a route (`0.0.0.0/0` for the default route). */
export function routeTargetText(route: NetRoute): string {
  if (route.isDefault) return '0.0.0.0/0（默认）'
  if (route.target && route.netmask) return `${route.target}/${route.netmask}`
  return route.target || '—'
}

/** A readable one-liner for a staged change. */
export function changeText(change: UciChange): string {
  const section = change.section || '—'
  if (change.op === 'add') return `新增段 ${section}${change.type ? `（${change.type}）` : ''}`
  if (change.op === 'delete') {
    return change.option ? `删除 ${section}.${change.option}` : `删除段 ${section}`
  }
  if (change.op === 'set') {
    return change.option
      ? `设置 ${section}.${change.option} = ${change.value ?? ''}`
      : `设置 ${section}`
  }
  return `${change.op} ${section}${change.option ? `.${change.option}` : ''}`
}
