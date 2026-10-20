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

/** Reads `/etc/config/firewall`. Read-only. */
export async function fetchFirewallModel(): Promise<FirewallModel> {
  const values = await uciGet('firewall')
  return parseFirewallModel(values)
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
 */
async function applyOptions(
  section: string,
  values: Record<string, string | undefined>
): Promise<void> {
  const current = await uciGetSection('firewall', section)
  const payload: UciValues = {}

  for (const [key, value] of Object.entries(values)) {
    const text = value === undefined || value === null ? '' : String(value).trim()
    if (!text) {
      const previous = current?.[key]
      const existed =
        previous !== undefined &&
        previous !== null &&
        !(Array.isArray(previous) && previous.length === 0) &&
        String(previous).trim() !== ''
      if (existed) await uciDelete('firewall', section, key)
      continue
    }
    payload[key] = text
  }

  if (Object.keys(payload).length) await uciSet('firewall', section, payload)
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
): Promise<string | undefined> {
  const list = networks.map((item) => item.trim()).filter(Boolean)
  const current = await uciGetSection('firewall', section)
  const previous = current?.network
  const previousList = Array.isArray(previous)
    ? previous.map((item) => String(item)).filter(Boolean)
    : previous === undefined || previous === null
      ? []
      : String(previous).split(/\s+/).filter(Boolean)

  // Start from a clean list so a removed network really disappears.
  if (previousList.length) await uciDelete('firewall', section, 'network')
  if (!list.length) return undefined

  try {
    await ubusCall('uci', 'set', {
      config: FW_CONFIG,
      section,
      values: { network: list }
    })
    return undefined
  } catch {
    // Older rpcd builds only understand strings — fall back to a space
    // separated option. fw3 still reads it, fw4 ignores it.
    await uciSet('firewall', section, { network: list.join(' ') })
    return '路由器拒绝了列表写法，成员网络已按空格分隔保存，部分防火墙版本可能无法绑定这些网络'
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
export async function saveZone(draft: FwZoneDraft): Promise<{ id: string; warning?: string }> {
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
  if (!id) {
    // No name is passed: rpcd generates an anonymous section name (cfgXXXXXX).
    id = await addSection('zone', compact(values))
  } else {
    await applyOptions(id, values)
  }

  const warning = await writeNetworkList(id, draft.networks)
  return warning ? { id, warning } : { id }
}

/** Removes a zone section. */
export async function deleteZoneSection(id: string): Promise<void> {
  await uciDelete('firewall', id)
}

/** Creates or updates a redirect (port forwarding) section. */
export async function saveRedirect(draft: FwRedirectDraft): Promise<string> {
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

  if (!draft.id) return addSection('redirect', compact(values))
  await applyOptions(draft.id, values)
  return draft.id
}

/** Removes a redirect section. */
export async function deleteRedirectSection(id: string): Promise<void> {
  await uciDelete('firewall', id)
}

/** Creates or updates a rule (outbound traffic rule) section. */
export async function saveRule(draft: FwRuleDraft): Promise<string> {
  const values: Record<string, string | undefined> = {
    name: draft.name.trim(),
    src: draft.src.trim(),
    dest: draft.dest.trim(),
    proto: draft.proto.trim(),
    target: draft.target.trim(),
    enabled: draft.enabled ? '1' : '0',
    family: draft.family.trim()
  }

  if (!draft.id) return addSection('rule', compact(values))
  await applyOptions(draft.id, values)
  return draft.id
}

/** Removes a rule section. */
export async function deleteRuleSection(id: string): Promise<void> {
  await uciDelete('firewall', id)
}

/** Creates or updates a forwarding (zone to zone) section. */
export async function saveForwarding(draft: FwForwardingDraft): Promise<string> {
  const values: Record<string, string | undefined> = {
    src: draft.src.trim(),
    dest: draft.dest.trim()
  }

  if (!draft.id) return addSection('forwarding', compact(values))
  await applyOptions(draft.id, values)
  return draft.id
}

/** Removes a forwarding section. */
export async function deleteForwardingSection(id: string): Promise<void> {
  await uciDelete('firewall', id)
}

/** Toggles the software / hardware flow offloading of the `defaults` section. */
export async function setFlowOffloading(software: boolean, hardware: boolean): Promise<void> {
  const values = await uciGet('firewall')
  const entry = Object.entries(values).find(([, section]) => section['.type'] === 'defaults')
  if (!entry) throw new Error('防火墙配置中缺少 defaults 段，无法设置流量卸载')

  await uciSet('firewall', entry[0], {
    flow_offloading: software ? '1' : '0',
    flow_offloading_hw: hardware ? '1' : '0'
  })
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
