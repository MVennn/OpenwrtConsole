import { ubusCall } from '@/api/ubus'
import {
  uciAdd,
  uciBool,
  uciChanges,
  uciCommit,
  uciDelete,
  uciGet,
  uciGetSection,
  uciList,
  uciSet,
  uciString,
  type UciChange,
  type UciSection,
  type UciValues
} from '@/api/uci'
import { systemOps } from '@/api/systemOps'
import { api } from '@/api/openwrt'
import type { StagedEdit } from '@/api/configPending'

/**
 * Writable firewall configuration (`/etc/config/firewall`).
 *
 * Every read and every write of this module goes through the shared UCI layer
 * (`@/api/uci`); the only exception is the zone member list, see
 * `writeNetworkList` for the details.
 *
 * The module never commits on its own: the page stages the changes
 * (`uci.set` / `uci.add` / `uci.delete`), shows them and only commits plus
 * reloads the firewall service when the user presses "保存并应用".
 */

export const FW_CONFIG = 'firewall'

/** Zone policies and rule actions understood by fw3/fw4. */
export const FW_POLICIES = ['ACCEPT', 'REJECT', 'DROP'] as const
export const FW_PROTOCOLS = ['tcp', 'udp', 'tcp udp', 'icmp', 'all'] as const
export const FW_FAMILIES = ['any', 'ipv4', 'ipv6'] as const
export const FW_RULE_ACTIONS = ['ACCEPT', 'REJECT', 'DROP'] as const

export type FwPolicy = (typeof FW_POLICIES)[number]

/* ------------------------------------------------------------------ *
 * Model
 * ------------------------------------------------------------------ */

/** The `defaults` section. */
export interface FwDefaults {
  /** UCI section name (`defaults`, `cfg01e63d`). */
  id: string
  input: string
  output: string
  forward: string
  synfloodProtect: boolean | null
  dropInvalid: boolean | null
  flowOffloading: boolean
  flowOffloadingHw: boolean
}

/** A `forwarding` section: traffic from one zone into another. */
export interface FwForwarding {
  id: string
  src: string
  dest: string
}

/** A `zone` section. */
export interface FwZone {
  /** UCI section name (`zone_lan`, `cfg01e63d`) — stable across reloads. */
  id: string
  /** Zone name as shown in LuCI (`lan`). */
  name: string
  networks: string[]
  input: string
  output: string
  forward: string
  masq: boolean
  mtuFix: boolean
  family: string
  /** Forwarding sections that start in this zone. */
  forwardings: FwForwarding[]
  /** Zones this zone forwards to. */
  forwardTargets: string[]
}

/** A `redirect` section: a port forwarding rule. */
export interface FwRedirect {
  id: string
  name: string
  src: string
  srcIp: string
  srcDport: string
  destIp: string
  destPort: string
  proto: string
  target: string
  enabled: boolean
  family: string
}

/** A `rule` section: an outbound traffic rule. */
export interface FwRule {
  id: string
  name: string
  src: string
  dest: string
  proto: string
  target: string
  enabled: boolean
  family: string
}

export interface FirewallModel {
  defaults: FwDefaults
  zones: FwZone[]
  forwardings: FwForwarding[]
  redirects: FwRedirect[]
  rules: FwRule[]
}

/* ------------------------------------------------------------------ *
 * Runtime traffic
 * ------------------------------------------------------------------ */

/** One entry of the kernel connection tracking table. */
export interface FwConntrackEntry {
  /** Transport protocol in upper case (`TCP`, `UDP`, …). */
  protocol: string
  /** Source address, without the port. */
  source: string
  /** Destination address, without the port. */
  destination: string
  /** Destination port. */
  destinationPort: number
  /** Bytes that passed the connection. */
  bytes: number
  /** Packets that passed the connection. */
  packets: number
}

/** The traffic of a security zone. */
export interface FwZoneTraffic {
  /** Connections whose source is inside the zone. */
  connections: number
  /** Connections whose destination is inside the zone. */
  incoming: number
  /** Bytes of the counted connections. */
  bytes: number
}

/** The traffic that hit a port forwarding rule. */
export interface FwRedirectTraffic {
  /** Number of connections that matched the rule. */
  connections: number
  bytes: number
  packets: number
}

/* ------------------------------------------------------------------ *
 * Drafts (what the dialogs collect)
 * ------------------------------------------------------------------ */

export interface FwZoneDraft {
  /** Absent when a new zone is created. */
  id?: string
  name: string
  networks: string[]
  input: string
  output: string
  forward: string
  masq: boolean
  mtuFix: boolean
  family: string
}

export interface FwRedirectDraft {
  id?: string
  name: string
  src: string
  srcIp: string
  srcDport: string
  destIp: string
  destPort: string
  proto: string
  target: string
  enabled: boolean
}

export interface FwRuleDraft {
  id?: string
  name: string
  src: string
  dest: string
  proto: string
  target: string
  enabled: boolean
  family: string
}

export interface FwForwardingDraft {
  id?: string
  src: string
  dest: string
}

/* ------------------------------------------------------------------ *
 * Parsing
 * ------------------------------------------------------------------ */

/**
 * The `enabled` option is opt-out: a missing (or empty) option means the
 * rule is active, only an explicit `0` disables it.
 */
function enabledFlag(value: unknown): boolean {
  if (value === undefined || value === null) return true
  if (typeof value === 'boolean') return value
  if (typeof value === 'number') return value !== 0
  const text = String(value).trim().toLowerCase()
  if (!text) return true
  return text !== '0' && text !== 'false' && text !== 'no' && text !== 'off'
}

/** Reads a tri-state flag: `null` when the option is not set at all. */
function optionalFlag(value: unknown): boolean | null {
  if (value === undefined || value === null) return null
  if (typeof value === 'string' && !value.trim()) return null
  if (typeof value === 'boolean') return value
  if (typeof value === 'number') return value !== 0
  const text = String(value).trim().toLowerCase()
  return text === '1' || text === 'true' || text === 'yes' || text === 'on'
}

function parseDefaults(id: string, section: UciSection): FwDefaults {
  return {
    id,
    input: uciString(section, 'input'),
    output: uciString(section, 'output'),
    forward: uciString(section, 'forward'),
    synfloodProtect: optionalFlag(section.synflood_protect),
    dropInvalid: optionalFlag(section.drop_invalid),
    flowOffloading: uciBool(section, 'flow_offloading'),
    flowOffloadingHw: uciBool(section, 'flow_offloading_hw')
  }
}

function parseZone(id: string, section: UciSection): FwZone {
  return {
    id,
    name: uciString(section, 'name') || id,
    networks: uciList(section, 'network'),
    input: uciString(section, 'input'),
    output: uciString(section, 'output'),
    forward: uciString(section, 'forward'),
    masq: uciBool(section, 'masq'),
    mtuFix: uciBool(section, 'mtu_fix'),
    family: uciString(section, 'family'),
    forwardings: [],
    forwardTargets: []
  }
}

function parseForwarding(id: string, section: UciSection): FwForwarding {
  return {
    id,
    src: uciString(section, 'src'),
    dest: uciString(section, 'dest')
  }
}

function parseRedirect(id: string, section: UciSection): FwRedirect {
  return {
    id,
    name: uciString(section, 'name'),
    src: uciString(section, 'src'),
    srcIp: uciString(section, 'src_ip'),
    srcDport: uciString(section, 'src_dport'),
    destIp: uciString(section, 'dest_ip'),
    destPort: uciString(section, 'dest_port'),
    proto: uciString(section, 'proto'),
    target: uciString(section, 'target'),
    enabled: enabledFlag(section.enabled),
    family: uciString(section, 'family')
  }
}

function parseRule(id: string, section: UciSection): FwRule {
  return {
    id,
    name: uciString(section, 'name'),
    src: uciString(section, 'src'),
    dest: uciString(section, 'dest'),
    proto: uciString(section, 'proto'),
    target: uciString(section, 'target'),
    enabled: enabledFlag(section.enabled),
    family: uciString(section, 'family')
  }
}

/** Turns the raw `uci.get` map into the typed firewall model. */
export function parseFirewallModel(values: Record<string, UciSection>): FirewallModel {
  const entries = Object.entries(values ?? {})
  const ofType = (type: string) => entries.filter(([, section]) => section['.type'] === type)

  const defaultsEntry = ofType('defaults')[0]
  const forwardings = ofType('forwarding').map(([id, section]) => parseForwarding(id, section))
  const zones = ofType('zone').map(([id, section]) => parseZone(id, section))

  // Link every forwarding section back to the zone it originates from.
  for (const zone of zones) {
    zone.forwardings = forwardings.filter((item) => item.src === zone.name)
    zone.forwardTargets = zone.forwardings.map((item) => item.dest).filter(Boolean)
  }

  return {
    defaults: defaultsEntry
      ? parseDefaults(defaultsEntry[0], defaultsEntry[1])
      : {
          id: '',
          input: '',
          output: '',
          forward: '',
          synfloodProtect: null,
          dropInvalid: null,
          flowOffloading: false,
          flowOffloadingHw: false
        },
    zones,
    forwardings,
    redirects: ofType('redirect').map(([id, section]) => parseRedirect(id, section)),
    rules: ofType('rule').map(([id, section]) => parseRule(id, section))
  }
}

export function createEmptyFirewallModel(): FirewallModel {
  return parseFirewallModel({})
}

/* ------------------------------------------------------------------ *
 * Reading
 * ------------------------------------------------------------------ */

/**
 * Reads `/etc/config/firewall`.
 *
 * `values` may carry the effective configuration (the committed one plus the
 * staged edits), so the page can show what will be applied.
 *
 * Read-only.
 */
export async function fetchFirewallModel(
  values?: Record<string, UciSection>
): Promise<FirewallModel> {
  const raw = values ?? (await uciGet('firewall'))
  return parseFirewallModel(raw)
}

/** Lists the interface names of the `network` config, used by the zone picker. */
export async function fetchNetworkNames(): Promise<string[]> {
  const values = await uciGet('network')
  const names = Object.entries(values)
    .filter(([, section]) => section['.type'] === 'interface')
    .map(([id]) => id)
  return [...new Set(names)].sort((a, b) => a.localeCompare(b))
}

/** The staged (not yet committed) changes of the firewall config. */
export async function fetchPendingChanges(): Promise<UciChange[]> {
  return uciChanges('firewall')
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

/**
 * Writes a set of options to a section. An option whose new value is empty
 * is removed from the section instead of being written as an empty string.
 *
 * Returns the staged edits.
 */
async function applyOptions(
  section: string,
  values: Record<string, string | undefined>
): Promise<StagedEdit[]> {
  const current = await uciGetSection('firewall', section)
  const payload: UciValues = {}
  const edits: StagedEdit[] = []

  for (const [key, value] of Object.entries(values)) {
    const text = value === undefined || value === null ? '' : String(value).trim()
    if (!text) {
      const previous = current?.[key]
      const existed =
        previous !== undefined &&
        previous !== null &&
        !(Array.isArray(previous) && previous.length === 0) &&
        String(previous).trim() !== ''
      if (existed) {
        await uciDelete('firewall', section, key)
        edits.push({ op: 'delete', section, option: key, before: '' })
      }
      continue
    }
    payload[key] = text
  }

  if (Object.keys(payload).length) {
    await uciSet('firewall', section, payload)
    for (const [key, value] of Object.entries(payload)) {
      edits.push({ op: 'set', section, option: key, value: String(value), before: '' })
    }
  }

  return edits
}

/**
 * Writes the member networks of a zone.
 *
 * `network` is a UCI *list*. The shared `uciSet` stringifies every value and
 * would therefore create a scalar option, which fw4 ignores when it binds a
 * zone to its networks. rpcd keeps the list shape when the value arrives as
 * an array, so the list is written through the very same ubus transport with
 * an array payload; every other option uses the shared helpers.
 *
 * Returns a warning when the router refused the array and the value had to be
 * written as a space separated scalar.
 */
async function writeNetworkList(
  section: string,
  networks: string[]
): Promise<{ edits: StagedEdit[]; warning?: string }> {
  const list = networks.map((item) => item.trim()).filter(Boolean)
  const current = await uciGetSection('firewall', section)
  const previous = current?.network
  const previousList = Array.isArray(previous)
    ? previous.map((item) => String(item)).filter(Boolean)
    : previous === undefined || previous === null
      ? []
      : String(previous).split(/\s+/).filter(Boolean)

  const edits: StagedEdit[] = []

  // Start from a clean list so a removed network really disappears.
  if (previousList.length) await uciDelete('firewall', section, 'network')
  if (!list.length) {
    if (previousList.length) {
      edits.push({ op: 'delete', section, option: 'network', before: previousList.join(' ') })
    }
    return { edits }
  }

  try {
    await ubusCall('uci', 'set', {
      config: FW_CONFIG,
      section,
      values: { network: list }
    })
    edits.push({ op: 'set', section, option: 'network', value: list.join(' '), before: '' })
    return { edits }
  } catch {
    // Older rpcd builds only understand strings — fall back to a space
    // separated option. fw3 still reads it, fw4 ignores it.
    await uciSet('firewall', section, { network: list.join(' ') })
    edits.push({ op: 'set', section, option: 'network', value: list.join(' '), before: '' })
    return {
      edits,
      warning:
        '路由器拒绝了列表写法，成员网络已按空格分隔保存，部分防火墙版本可能无法绑定这些网络'
    }
  }
}

/**
 * Adds a section and returns its generated name. rpcd generates an anonymous
 * name (`cfgXXXXXX`) when no name is passed.
 */
async function addSection(type: string, values: UciValues): Promise<string> {
  const name = await uciAdd('firewall', type, values)
  if (!name) throw new Error(`路由器没有返回新建 ${type} 段的段名`)
  return name
}

/** Creates or updates a zone section. */
export async function saveZone(
  draft: FwZoneDraft
): Promise<{ id: string; edits: StagedEdit[]; warning?: string }> {
  const values: Record<string, string | undefined> = {
    name: draft.name.trim(),
    input: draft.input,
    output: draft.output,
    forward: draft.forward,
    masq: draft.masq ? '1' : '0',
    mtu_fix: draft.mtuFix ? '1' : '0',
    family: draft.family
  }

  let id = draft.id ?? ''
  const edits: StagedEdit[] = []

  if (!id) {
    // No name is passed: rpcd generates an anonymous section name (cfgXXXXXX).
    id = await addSection('zone', compact(values))
    edits.push({ op: 'add', section: id, type: 'zone', before: '' })
    for (const [key, value] of Object.entries(compact(values))) {
      edits.push({ op: 'set', section: id, option: key, value: String(value), before: '' })
    }
  } else {
    edits.push(...(await applyOptions(id, values)))
  }

  const networks = await writeNetworkList(id, draft.networks)
  edits.push(...networks.edits)

  return networks.warning
    ? { id, edits, warning: networks.warning }
    : { id, edits }
}

/** Removes a zone section. */
export async function deleteZoneSection(id: string): Promise<{ edits: StagedEdit[] }> {
  await uciDelete('firewall', id)
  return { edits: [{ op: 'delete', section: id, before: '' }] }
}

/** Creates or updates a redirect (port forwarding) section. */
export async function saveRedirect(
  draft: FwRedirectDraft
): Promise<{ id: string; edits: StagedEdit[] }> {
  const values: Record<string, string | undefined> = {
    name: draft.name.trim(),
    src: draft.src.trim(),
    src_ip: draft.srcIp.trim(),
    src_dport: draft.srcDport.trim(),
    dest_ip: draft.destIp.trim(),
    dest_port: draft.destPort.trim(),
    proto: draft.proto.trim(),
    target: draft.target.trim(),
    enabled: draft.enabled ? '1' : '0'
  }

  if (!draft.id) {
    const id = await addSection('redirect', compact(values))
    const edits: StagedEdit[] = [{ op: 'add', section: id, type: 'redirect', before: '' }]
    for (const [key, value] of Object.entries(compact(values))) {
      edits.push({ op: 'set', section: id, option: key, value: String(value), before: '' })
    }
    return { id, edits }
  }

  const edits = await applyOptions(draft.id, values)
  return { id: draft.id, edits }
}

/** Removes a redirect section. */
export async function deleteRedirectSection(id: string): Promise<{ edits: StagedEdit[] }> {
  await uciDelete('firewall', id)
  return { edits: [{ op: 'delete', section: id, before: '' }] }
}

/** Creates or updates a rule (outbound traffic rule) section. */
export async function saveRule(draft: FwRuleDraft): Promise<{ id: string; edits: StagedEdit[] }> {
  const src = draft.src.trim()
  const values: Record<string, string | undefined> = {
    name: draft.name.trim(),
    // "any" is not a zone name; fw4 skips a rule whose src zone is unknown.
    // Leave the option out (new rule) / delete it (edit) instead.
    src: src && src !== 'any' ? src : undefined,
    dest: draft.dest.trim(),
    proto: draft.proto.trim(),
    target: draft.target.trim(),
    enabled: draft.enabled ? '1' : '0',
    family: draft.family.trim()
  }

  if (!draft.id) {
    const id = await addSection('rule', compact(values))
    const edits: StagedEdit[] = [{ op: 'add', section: id, type: 'rule', before: '' }]
    for (const [key, value] of Object.entries(compact(values))) {
      edits.push({ op: 'set', section: id, option: key, value: String(value), before: '' })
    }
    return { id, edits }
  }

  const edits = await applyOptions(draft.id, values)
  return { id: draft.id, edits }
}

/** Removes a rule section. */
export async function deleteRuleSection(id: string): Promise<{ edits: StagedEdit[] }> {
  await uciDelete('firewall', id)
  return { edits: [{ op: 'delete', section: id, before: '' }] }
}

/** Creates or updates a forwarding (zone to zone) section. */
export async function saveForwarding(
  draft: FwForwardingDraft
): Promise<{ id: string; edits: StagedEdit[] }> {
  const values: Record<string, string | undefined> = {
    src: draft.src.trim(),
    dest: draft.dest.trim()
  }

  if (!draft.id) {
    const id = await addSection('forwarding', compact(values))
    const edits: StagedEdit[] = [{ op: 'add', section: id, type: 'forwarding', before: '' }]
    for (const [key, value] of Object.entries(compact(values))) {
      edits.push({ op: 'set', section: id, option: key, value: String(value), before: '' })
    }
    return { id, edits }
  }

  const edits = await applyOptions(draft.id, values)
  return { id: draft.id, edits }
}

/** Removes a forwarding section. */
export async function deleteForwardingSection(id: string): Promise<{ edits: StagedEdit[] }> {
  await uciDelete('firewall', id)
  return { edits: [{ op: 'delete', section: id, before: '' }] }
}

/**
 * Toggles the software / hardware flow offloading of the `defaults` section.
 */
export async function setFlowOffloading(
  software: boolean,
  hardware: boolean
): Promise<{ edits: StagedEdit[] }> {
  const values = await uciGet('firewall')
  const entry = Object.entries(values).find(([, section]) => section['.type'] === 'defaults')
  if (!entry) throw new Error('防火墙配置中缺少 defaults 段，无法设置流量卸载')

  // fw4 only honours flow_offloading_hw when flow_offloading is on.
  const hw = software && hardware
  await uciSet('firewall', entry[0], {
    flow_offloading: software ? '1' : '0',
    flow_offloading_hw: hw ? '1' : '0'
  })

  return {
    edits: [
      { op: 'set', section: entry[0], option: 'flow_offloading', value: software ? '1' : '0', before: '' },
      {
        op: 'set',
        section: entry[0],
        option: 'flow_offloading_hw',
        value: hardware ? '1' : '0',
        before: ''
      }
    ]
  }
}

/* ------------------------------------------------------------------ *
 * Commit / apply / rollback
 * ------------------------------------------------------------------ */

/** Writes the staged changes to /etc/config/firewall. */
export async function commitFirewall(): Promise<void> {
  await uciCommit('firewall')
}

/** Commits the staged changes and reloads the firewall service. */
export async function applyFirewall(): Promise<void> {
  await uciCommit('firewall')
  await systemOps.reloadFirewall()
}

/** Discards every staged change of the firewall config (`uci revert`). */
export async function revertFirewall(): Promise<void> {
  await systemOps.revertConfig('firewall')
}

/* ------------------------------------------------------------------ *
 * Runtime traffic
 * ------------------------------------------------------------------ */

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}
}

function pickArray(payload: unknown, keys: string[]): unknown[] {
  if (Array.isArray(payload)) return payload
  const record = asRecord(payload)
  for (const key of keys) {
    const value = record[key]
    if (Array.isArray(value)) return value
  }
  return []
}

function textOf(record: Record<string, unknown>, keys: string[]): string {
  for (const key of keys) {
    const value = record[key]
    if (typeof value === 'string' && value.trim()) return value.trim()
    if (typeof value === 'number' && Number.isFinite(value)) return String(value)
  }
  return ''
}

function numberOf(record: Record<string, unknown>, keys: string[]): number {
  for (const key of keys) {
    const value = record[key]
    if (typeof value === 'number' && Number.isFinite(value)) return value
    if (typeof value === 'string' && value.trim()) {
      const parsed = Number(value)
      if (Number.isFinite(parsed)) return parsed
    }
  }
  return 0
}

/**
 * Reads the kernel connection tracking table (`luci getConntrackList`).
 *
 * The list methods of the `luci` object answer with `{ "result": [...] }`,
 * older builds with a bare array — both are accepted.
 */
export async function fetchConntrackEntries(): Promise<FwConntrackEntry[]> {
  let payload: unknown
  try {
    payload = await ubusCall<unknown>('luci', 'getConntrackList', {})
  } catch {
    return []
  }

  return pickArray(payload, ['result', 'conntrack']).map((item) => {
    const row = asRecord(item)
    const source = textOf(row, ['src', 'source'])
    const destination = textOf(row, ['dst', 'destination', 'dest'])
    return {
      protocol: textOf(row, ['layer4', 'proto', 'protocol']).toUpperCase(),
      source: source.replace(/:\d+$/, ''),
      destination: destination.replace(/:\d+$/, ''),
      destinationPort: numberOf(row, ['dport', 'dest_port']),
      bytes: numberOf(row, ['bytes']),
      packets: numberOf(row, ['packets'])
    }
  })
}

/**
 * The IPv4 networks of the configured interfaces, keyed by the network name
 * and by the device name.
 */
export async function fetchNetworkSubnets(): Promise<Record<string, string>> {
  const [networkValues, interfaces] = await Promise.all([
    uciGet('network').catch(() => ({}) as Record<string, UciSection>),
    api.interfaces().catch(() => [])
  ])

  const subnets: Record<string, string> = {}
  for (const item of interfaces) {
    const address = item['ipv4-address']?.[0]
    if (!address?.address) continue
    subnets[item.interface] = `${address.address}/${address.mask ?? 24}`
  }

  for (const [key, section] of Object.entries(networkValues)) {
    const device = uciString(section, 'device') || uciString(section, 'ifname')
    const address = subnets[key]
    if (device && address) subnets[device] = address
  }

  return subnets
}

/** Converts an IPv4 address into its numeric representation. */
function ipToNumber(ip: string): number | null {
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

/** True when the address lies inside the CIDR block. */
export function ipInCidr(ip: string, cidr: string): boolean {
  const value = ipToNumber(ip)
  if (value === null) return false
  const [network, maskText] = cidr.split('/')
  const base = ipToNumber(network ?? '')
  const mask = Number(maskText ?? '24')
  if (base === null || !Number.isFinite(mask)) return false
  const bits = mask === 0 ? 0 : (0xffffffff << (32 - mask)) >>> 0
  return ((value & bits) >>> 0) === ((base & bits) >>> 0)
}

/**
 * Counts the connections of a zone.
 *
 * A connection belongs to the zone when its source address lies inside one
 * of the networks the zone is bound to — that is the traffic the zone
 * produces. Connections whose destination is inside the zone are counted as
 * incoming traffic.
 */
export function zoneTraffic(
  zone: FwZone,
  subnets: Record<string, string>,
  entries: FwConntrackEntry[]
): FwZoneTraffic {
  const cidrs = zone.networks.map((name) => subnets[name]).filter(Boolean)
  if (!cidrs.length) return { connections: 0, incoming: 0, bytes: 0 }

  let connections = 0
  let incoming = 0
  let bytes = 0

  for (const entry of entries) {
    const inside = (ip: string): boolean => cidrs.some((cidr) => ipInCidr(ip, cidr))
    if (entry.source && inside(entry.source)) {
      connections += 1
      bytes += entry.bytes
    } else if (entry.destination && inside(entry.destination)) {
      incoming += 1
    }
  }

  return { connections, incoming, bytes }
}

/** True when the protocol of a connection matches the protocol of a rule. */
function protoMatches(rule: string, protocol: string): boolean {
  const wanted = rule.trim().toLowerCase()
  if (!wanted || wanted === 'all') return true
  const actual = protocol.trim().toLowerCase()
  if (!actual) return true
  return wanted.split(/\s+/).includes(actual)
}

/** An inclusive port range; `null` means "any port". */
interface PortRange {
  start: number
  end: number
}

/**
 * Parses the `src_dport` option of a redirect.
 *
 * fw3/fw4 accept a single port (`443`) as well as a range written with a dash
 * (`1000-2000`) or a colon (`1000:2000`). An empty value means the rule does
 * not restrict the external port. An unparsable value yields `undefined`, so
 * the caller can report "cannot determine" instead of matching everything.
 */
function parseSrcDport(value: string): PortRange | null | undefined {
  const text = value.trim()
  if (!text) return null

  const match = /^(\d+)(?:[-:](\d+))?$/.exec(text)
  if (!match) return undefined

  const first = Number.parseInt(match[1], 10)
  const second = match[2] === undefined ? first : Number.parseInt(match[2], 10)
  if (!Number.isFinite(first) || !Number.isFinite(second) || first <= 0 || second <= 0) {
    return undefined
  }
  return { start: Math.min(first, second), end: Math.max(first, second) }
}

/**
 * The traffic that hit a port forwarding rule.
 *
 * The connection tracking table keeps the original destination of a
 * connection, so the external port of the rule (`src_dport`) is the one to
 * match. The internal `dest_ip` cannot be used here: in a DNAT flow the
 * tracked destination is the address the client sent the packet to (the
 * router's WAN address), not the host the rule forwards to. A rule without an
 * external port restriction cannot be attributed to a tracked connection and
 * reports zero instead of guessing.
 */
export function redirectTraffic(
  redirect: FwRedirect,
  entries: FwConntrackEntry[]
): FwRedirectTraffic {
  const range = parseSrcDport(redirect.srcDport)
  if (range === undefined || range === null) {
    return { connections: 0, bytes: 0, packets: 0 }
  }

  let connections = 0
  let bytes = 0
  let packets = 0

  for (const entry of entries) {
    if (entry.destinationPort < range.start || entry.destinationPort > range.end) continue
    if (!protoMatches(redirect.proto, entry.protocol)) continue
    connections += 1
    bytes += entry.bytes
    packets += entry.packets
  }

  return { connections, bytes, packets }
}

/* ------------------------------------------------------------------ *
 * Display helpers
 * ------------------------------------------------------------------ */

/** Maps a zone policy to the semantic colour of a status badge. */
export function policyTone(policy: string): 'success' | 'danger' | 'neutral' {
  const value = policy.trim().toUpperCase()
  if (value === 'ACCEPT') return 'success'
  if (value === 'REJECT' || value === 'DROP') return 'danger'
  return 'neutral'
}

/** `IPv4 / IPv6` for an empty family. */
export function familyText(family: string): string {
  const value = family.trim().toLowerCase()
  if (!value || value === 'any') return 'IPv4 / IPv6'
  if (value === 'ipv4') return 'IPv4'
  if (value === 'ipv6') return 'IPv6'
  return family
}

/** Renders a protocol list (`tcp udp` → `TCP / UDP`). */
export function protoText(proto: string): string {
  if (!proto) return '—'
  return proto
    .split(/\s+/)
    .filter(Boolean)
    .map((item) => item.toUpperCase())
    .join(' / ')
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
