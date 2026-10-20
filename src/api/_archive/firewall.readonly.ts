import { UbusError, ubusCall } from '../ubus'

/* ------------------------------------------------------------------ *
 * Raw UCI payloads
 * ------------------------------------------------------------------ */

/** A raw UCI option value. Lists come back as arrays, scalars as strings. */
export type UciValue =
  | string
  | number
  | boolean
  | Array<string | number | boolean>
  | null
  | undefined

/** A raw UCI section. Anonymous sections are keyed by their `.name`. */
export interface UciSection {
  '.type'?: string
  '.name'?: string
  '.index'?: number
  [key: string]: UciValue
}

export interface UciGetResult {
  values?: Record<string, UciSection>
}

/* ------------------------------------------------------------------ *
 * Normalised firewall model
 * ------------------------------------------------------------------ */

export interface FirewallDefaults {
  input: string
  output: string
  forward: string
  /** `null` means the option is absent, so the packaged default applies. */
  synfloodProtect: boolean | null
  dropInvalid: boolean | null
  flowOffloading: boolean
  flowOffloadingHw: boolean
}

export interface FirewallZone {
  /** UCI section name (`zone_lan`, `cfg01e63d`) — stable across reloads. */
  id: string
  /** Zone name as LuCI shows it (`lan`). */
  name: string
  networks: string[]
  input: string
  output: string
  forward: string
  masq: boolean
  mtuFix: boolean
  family: string
  /** Zones this zone forwards to, resolved from the `forwarding` sections. */
  forwardTo: string[]
}

export interface FirewallRedirect {
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

export interface FirewallRule {
  id: string
  name: string
  src: string
  dest: string
  proto: string
  target: string
  enabled: boolean
  family: string
}

export interface FirewallForwarding {
  id: string
  src: string
  dest: string
}

export interface FirewallConfig {
  defaults: FirewallDefaults
  zones: FirewallZone[]
  redirects: FirewallRedirect[]
  rules: FirewallRule[]
  forwardings: FirewallForwarding[]
}

/* ------------------------------------------------------------------ *
 * UCI value helpers
 * ------------------------------------------------------------------ */

/** Renders a scalar option; arrays are joined for display. */
export function uciText(value: UciValue): string {
  if (value === undefined || value === null) return ''
  if (Array.isArray(value)) return value.map((item) => String(item).trim()).filter(Boolean).join(', ')
  return String(value).trim()
}

/**
 * Normalises a list option. UCI stores `list network 'lan'` as an array and
 * `option network 'lan wan'` as a string, so both shapes must be accepted.
 */
export function uciList(value: UciValue): string[] {
  if (value === undefined || value === null) return []
  if (Array.isArray(value)) {
    return value.map((item) => String(item).trim()).filter(Boolean)
  }
  return String(value)
    .split(/[\s,]+/)
    .map((item) => item.trim())
    .filter(Boolean)
}

/** Strict truthiness for UCI flags (`1`, `true`, `yes`, `on`). */
function uciFlag(value: UciValue): boolean {
  if (value === undefined || value === null) return false
  if (typeof value === 'boolean') return value
  if (typeof value === 'number') return value !== 0
  const text = String(value).trim().toLowerCase()
  return text === '1' || text === 'true' || text === 'yes' || text === 'on'
}

/**
 * The `enabled` option is opt-out: a missing (or empty) option means the
 * rule is active, only an explicit `0` disables it.
 */
export function uciEnabled(value: UciValue): boolean {
  if (value === undefined || value === null) return true
  if (typeof value === 'string' && value.trim() === '') return true
  return uciFlag(value)
}

/** Reads a tri-state flag: `null` when the option is not set at all. */
function uciOptionalFlag(value: UciValue): boolean | null {
  if (value === undefined || value === null) return null
  if (typeof value === 'string' && value.trim() === '') return null
  return uciFlag(value)
}

/* ------------------------------------------------------------------ *
 * Domain helpers
 * ------------------------------------------------------------------ */

export type PolicyTone = 'success' | 'warning' | 'danger' | 'neutral'

/** Maps a zone/default policy to the semantic colour used by StatusBadge. */
export function policyTone(policy: string): PolicyTone {
  const value = policy.trim().toUpperCase()
  if (value === 'ACCEPT') return 'success'
  if (value === 'REJECT' || value === 'DROP') return 'danger'
  return 'neutral'
}

/** True when the policy blocks traffic from the zone. */
export function isBlockingPolicy(policy: string): boolean {
  const value = policy.trim().toUpperCase()
  return value === 'REJECT' || value === 'DROP'
}

/* ------------------------------------------------------------------ *
 * Parsing
 * ------------------------------------------------------------------ */

function sectionId(section: UciSection, fallback: string): string {
  return section['.name'] || fallback
}

function parseDefaults(section: UciSection): FirewallDefaults {
  return {
    input: uciText(section.input),
    output: uciText(section.output),
    forward: uciText(section.forward),
    synfloodProtect: uciOptionalFlag(section.synflood_protect ?? section.syn_flood),
    dropInvalid: uciOptionalFlag(section.drop_invalid),
    flowOffloading: uciFlag(section.flow_offloading),
    flowOffloadingHw: uciFlag(section.flow_offloading_hw)
  }
}

function parseZone(section: UciSection, key: string): FirewallZone {
  const id = sectionId(section, key)
  return {
    id,
    name: uciText(section.name) || id,
    networks: uciList(section.network),
    input: uciText(section.input),
    output: uciText(section.output),
    forward: uciText(section.forward),
    masq: uciFlag(section.masq),
    mtuFix: uciFlag(section.mtu_fix),
    family: uciText(section.family),
    forwardTo: []
  }
}

function parseRedirect(section: UciSection, key: string): FirewallRedirect {
  return {
    id: sectionId(section, key),
    name: uciText(section.name),
    src: uciText(section.src),
    srcIp: uciText(section.src_ip),
    srcDport: uciText(section.src_dport),
    destIp: uciText(section.dest_ip),
    destPort: uciText(section.dest_port),
    proto: uciText(section.proto),
    target: uciText(section.target),
    enabled: uciEnabled(section.enabled),
    family: uciText(section.family)
  }
}

function parseRule(section: UciSection, key: string): FirewallRule {
  return {
    id: sectionId(section, key),
    name: uciText(section.name),
    src: uciText(section.src),
    dest: uciText(section.dest),
    proto: uciText(section.proto),
    target: uciText(section.target),
    enabled: uciEnabled(section.enabled),
    family: uciText(section.family)
  }
}

function parseForwarding(section: UciSection, key: string): FirewallForwarding {
  return {
    id: sectionId(section, key),
    src: uciText(section.src),
    dest: uciText(section.dest)
  }
}

/**
 * Turns the raw `uci.get` map into a typed firewall model. Sections are
 * matched by their `.type`, never by position, and anonymous sections keep
 * their `.name` as the stable key.
 */
export function parseFirewallConfig(values: Record<string, UciSection>): FirewallConfig {
  const entries = Object.entries(values ?? {})
  const ofType = (type: string) =>
    entries.filter(([, section]) => section?.['.type'] === type)

  const defaultsSection = ofType('defaults')[0]?.[1] ?? {}
  const forwardings = ofType('forwarding').map(([key, section]) => parseForwarding(section, key))
  const zones = ofType('zone').map(([key, section]) => parseZone(section, key))

  // Link every forwarding section back to the zone it originates from.
  for (const zone of zones) {
    zone.forwardTo = forwardings
      .filter((item) => item.src === zone.name)
      .map((item) => item.dest)
      .filter(Boolean)
  }

  return {
    defaults: parseDefaults(defaultsSection),
    zones,
    redirects: ofType('redirect').map(([key, section]) => parseRedirect(section, key)),
    rules: ofType('rule').map(([key, section]) => parseRule(section, key)),
    forwardings
  }
}

export function createEmptyFirewallConfig(): FirewallConfig {
  return {
    defaults: {
      input: '',
      output: '',
      forward: '',
      synfloodProtect: null,
      dropInvalid: null,
      flowOffloading: false,
      flowOffloadingHw: false
    },
    zones: [],
    redirects: [],
    rules: [],
    forwardings: []
  }
}

/**
 * Reads `/etc/config/firewall` through ubus. Read-only: nothing is ever
 * written back to the router.
 */
export async function fetchFirewallConfig(): Promise<FirewallConfig> {
  let values: Record<string, UciSection> = {}
  try {
    const data = await ubusCall<UciGetResult>('uci', 'get', { config: 'firewall' })
    values = data?.values ?? {}
  } catch (err) {
    // A router without a firewall package answers "not found"; show an empty
    // configuration instead of a hard error. Everything else is a real fault.
    if (err instanceof UbusError && err.code === 4) return createEmptyFirewallConfig()
    throw err
  }
  return parseFirewallConfig(values)
}
