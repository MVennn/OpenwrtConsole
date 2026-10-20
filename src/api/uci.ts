import { ubusCall } from './ubus'

/** One UCI section as returned by `uci.get`. */
export interface UciSection {
  '.type': string
  '.name': string
  '.index': number
  [key: string]: unknown
}

export type UciValues = Record<string, string | number | boolean | undefined | null>

export interface UciChange {
  op: 'set' | 'delete' | 'add' | 'rename' | 'move'
  section: string
  option?: string
  value?: string
  type?: string
}

/**
 * The console may only touch the standard OpenWrt config files: rpcd grants
 * UCI access per config name, anything else is rejected with "Invalid argument".
 */
export const UCI_CONFIGS = [
  'dhcp',
  'firewall',
  'network',
  'system',
  'wireless',
  'dropbear',
  'luci',
  'opkg',
  'ntp',
  'timeserver'
] as const

export type UciConfig = (typeof UCI_CONFIGS)[number]

/** Reads a whole config file. */
export async function uciGet(config: UciConfig): Promise<Record<string, UciSection>> {
  const data = await ubusCall<{ values?: Record<string, UciSection> }>('uci', 'get', { config })
  return data?.values ?? {}
}

/** Reads one section of a config file. */
export async function uciGetSection(
  config: UciConfig,
  section: string
): Promise<UciSection | undefined> {
  const data = await ubusCall<{ values?: Record<string, UciSection> }>('uci', 'get', {
    config,
    section
  })
  return data?.values?.[section]
}

/** Stages a set of options on a section. `undefined` removes the option. */
export async function uciSet(
  config: UciConfig,
  section: string,
  values: UciValues
): Promise<void> {
  const payload: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(values)) {
    if (value === undefined || value === null) continue
    payload[key] = String(value)
  }
  await ubusCall('uci', 'set', { config, section, values: payload })
}

/** Removes a whole section or a single option. */
export async function uciDelete(
  config: UciConfig,
  section: string,
  option?: string
): Promise<void> {
  if (option) {
    await ubusCall('uci', 'delete', { config, section, option })
  } else {
    await ubusCall('uci', 'delete', { config, section })
  }
}

/** Adds a new section and returns its generated name. */
export async function uciAdd(
  config: UciConfig,
  type: string,
  values: UciValues = {},
  name?: string
): Promise<string> {
  const payload: Record<string, unknown> = { type }
  if (name) payload.name = name
  const stringValues: Record<string, string> = {}
  for (const [key, value] of Object.entries(values)) {
    if (value === undefined || value === null) continue
    stringValues[key] = String(value)
  }
  if (Object.keys(stringValues).length) payload.values = stringValues
  const data = await ubusCall<{ section?: string }>('uci', 'add', { config, ...payload })
  return data?.section ?? name ?? ''
}

/** Writes the staged changes of a config file to /etc/config. */
export async function uciCommit(config: UciConfig): Promise<void> {
  await ubusCall('uci', 'commit', { config })
}

/** Lists the staged (not yet committed) changes of a config file. */
export async function uciChanges(config: UciConfig): Promise<UciChange[]> {
  const data = await ubusCall<{ changes?: UciChange[] }>('uci', 'changes', { config })
  return data?.changes ?? []
}

/* ------------------------------------------------------------------ helpers */

/** Reads a string option with a fallback. */
export function uciString(section: UciSection | undefined, key: string, fallback = ''): string {
  const value = section?.[key]
  if (value === undefined || value === null) return fallback
  return String(value)
}

/** Reads a numeric option with a fallback. */
export function uciNumber(section: UciSection | undefined, key: string, fallback = 0): number {
  const value = Number(section?.[key])
  return Number.isFinite(value) ? value : fallback
}

/** Reads a boolean option ("1"/"true"/"yes" are true). */
export function uciBool(section: UciSection | undefined, key: string, fallback = false): boolean {
  const value = section?.[key]
  if (value === undefined || value === null) return fallback
  return value === true || value === 1 || value === '1' || value === 'true' || value === 'yes'
}

/**
 * UCI stores lists either as a real array or as a space separated string.
 * Both shapes have to be supported.
 */
export function uciList(section: UciSection | undefined, key: string): string[] {
  const value = section?.[key]
  if (value === undefined || value === null) return []
  if (Array.isArray(value)) return value.map((item) => String(item)).filter(Boolean)
  return String(value)
    .split(/[\s,]+/)
    .map((item) => item.trim())
    .filter(Boolean)
}

/** Groups the sections of a config file by their `.type`. */
export function uciByType(
  sections: Record<string, UciSection>,
  type: string
): UciSection[] {
  return Object.values(sections).filter((section) => section['.type'] === type)
}
