import {
  uciCommit,
  uciDelete,
  uciGet,
  uciList,
  uciSet,
  uciString,
  uciBool,
  type UciSection,
  type UciValues
} from '@/api/uci'
import { systemOps } from '@/api/systemOps'
import { api } from '@/api/openwrt'

/**
 * Wireless configuration module (writable).
 *
 * Everything the page edits lives in the UCI config `wireless`:
 *
 *  - `wifi-device` sections describe the radios (band, channel, htmode, …)
 *  - `wifi-iface` sections describe the SSIDs (ssid, encryption, key, …)
 *
 * The runtime facts (is the radio up, which clients are associated) are read
 * from the read-only `luci-rpc getWirelessDevices` ubus object and from the
 * `modern-data?what=stations` CGI. Only the `wireless` config is ever
 * written: `uci.set` → `uci.commit` → `wifi reload`.
 */

/* ------------------------------------------------------------------ *
 * Options offered by the editor
 * ------------------------------------------------------------------ */

export interface SelectOption {
  value: string
  label: string
}

/** Encryption presets. `psk2+sae` is OpenWrt's WPA2/WPA3 mixed mode. */
export const ENCRYPTION_OPTIONS: SelectOption[] = [
  { value: 'none', label: '开放网络（无密码）' },
  { value: 'psk2', label: 'WPA2-PSK' },
  { value: 'sae', label: 'WPA3-SAE' },
  { value: 'psk2+sae', label: 'WPA2 / WPA3 混合' }
]

/** Working modes of a `wifi-iface`. */
export const IFACE_MODE_OPTIONS: SelectOption[] = [
  { value: 'ap', label: '接入点（AP）' },
  { value: 'sta', label: '客户端（STA）' },
  { value: 'mesh', label: '网状（Mesh）' },
  { value: 'adhoc', label: '点对点（Adhoc）' }
]

/** `macfilter` values: off, allow list, deny list. */
export const MAC_FILTER_OPTIONS: SelectOption[] = [
  { value: '0', label: '关闭' },
  { value: '1', label: '白名单（仅允许列表内设备）' },
  { value: '2', label: '黑名单（拒绝列表内设备）' }
]

/** Bandwidth presets (`htmode`). */
export const HTMODE_OPTIONS: string[] = [
  'HE20',
  'HE40',
  'HE80',
  'HE80+80',
  'HT20',
  'HT40',
  'HT40+',
  'VHT80',
  'NOHT'
]

/** 2.4 GHz channels. */
export const CHANNELS_2G: number[] = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]

/** 5 GHz channels (the ones usable in most regulatory domains). */
export const CHANNELS_5G: number[] = [36, 40, 44, 48, 149, 153, 157, 161, 165]

/** 6 GHz channels. */
export const CHANNELS_6G: number[] = [
  1, 5, 9, 13, 17, 21, 25, 29, 33, 37, 41, 45, 49, 53, 57, 61, 65, 69, 73, 77, 81, 85, 89, 93,
  97, 101, 105, 109, 113, 117, 121, 125
]

/* ------------------------------------------------------------------ *
 * Model
 * ------------------------------------------------------------------ */

/** A `wifi-device` section of /etc/config/wireless. */
export interface WifiRadioConfig {
  /** UCI section name (`radio0`, `radio1`, …). Empty for orphan pseudo radios. */
  section: string
  type: string
  band: string
  /** `auto` or a channel number, empty when the option is absent. */
  channel: string
  htmode: string
  country: string
  /** Raw `txpower` option: a number in dBm or a vendor specific keyword. */
  txpower: string
  disabled: boolean
  path: string
  /** Runtime state of the radio (from `luci-rpc getWirelessDevices`). */
  up: boolean
  /** True for the pseudo radio that collects SSIDs without a `device`. */
  orphan: boolean
  interfaces: WifiIfaceConfig[]
}

/** A `wifi-iface` section of /etc/config/wireless. */
export interface WifiIfaceConfig {
  /** UCI section name (`default_radio0`, `guest_radio0`, …). */
  section: string
  /** UCI section name of the `wifi-device` this SSID belongs to. */
  radio: string
  ssid: string
  encryption: string
  /**
   * True when a key is stored on the router. The key itself is never read
   * into the UI — it is write-only.
   */
  keySet: boolean
  mode: string
  network: string
  hidden: boolean
  /** `macfilter` mode: `0` off, `1` allow list, `2` deny list. */
  macfilter: string
  /** MAC addresses of the filter list. */
  maclist: string[]
  /** Guest network — isolates the clients of this SSID from each other. */
  guest: boolean
  disabled: boolean
  /** Runtime interface name (`wlan0`, `phy0-ap0`, …). */
  ifname: string
  /** Runtime state of the interface. */
  up: boolean
  /** Number of associated clients. */
  clients: number
}

export interface WirelessConfigModel {
  radios: WifiRadioConfig[]
  /** Network names an SSID may be bound to (from /etc/config/network). */
  networks: string[]
  /** Total number of associated clients. */
  clients: number
}

/* ------------------------------------------------------------------ *
 * Runtime shapes (luci-rpc / CGI payloads are only loosely typed)
 * ------------------------------------------------------------------ */

interface RuntimeIface {
  section?: string
  ifname?: string
  up?: boolean
  config?: Record<string, unknown>
  iwinfo?: Record<string, unknown>
}

interface RuntimeRadio {
  up?: boolean
  disabled?: boolean
  config?: Record<string, unknown>
  interfaces?: unknown
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

/** `luci-rpc` returns the interfaces as a map, older builds as an array. */
function toArray<T>(value: unknown): T[] {
  if (Array.isArray(value)) return value as T[]
  if (isRecord(value)) return Object.values(value) as T[]
  return []
}

/** Same as {@link toArray}, but keeps the map key (the UCI section name). */
function toEntries<T>(value: unknown): Array<{ key: string; item: T }> {
  if (Array.isArray(value)) {
    return value.map((item, index) => ({ key: String(index), item: item as T }))
  }
  if (isRecord(value)) {
    return Object.entries(value).map(([key, item]) => ({ key, item: item as T }))
  }
  return []
}

/**
 * The UCI section name of a runtime interface. `luci-rpc` keys the map by the
 * section name, but some builds only carry it inside the config table.
 */
function runtimeSectionName(key: string, iface: RuntimeIface): string {
  if (iface?.section) return iface.section
  const fromConfig = iface?.config?.section
  if (typeof fromConfig === 'string' && fromConfig) return fromConfig
  return /^\d+$/.test(key) ? '' : key
}

function sectionName(section: UciSection, key: string): string {
  return uciString(section, '.name') || key
}

function optionPresent(section: UciSection, key: string): boolean {
  const value = section[key]
  if (value === undefined || value === null) return false
  return String(value).trim() !== ''
}

/** Splits a `maclist` option into single addresses. */
function parseMacList(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map((item) => String(item).trim()).filter(Boolean)
  }
  return String(value ?? '')
    .split(/[\s,]+/)
    .map((item) => item.trim())
    .filter(Boolean)
}

function countStations(value: unknown): number {
  return toArray<unknown>(value).length
}

/* ------------------------------------------------------------------ *
 * Reading
 * ------------------------------------------------------------------ */

/**
 * Reads the wireless configuration and the matching runtime state.
 * Read-only: nothing is written to the router.
 */
export async function readWirelessConfig(): Promise<WirelessConfigModel> {
  const [wireless, networkRaw, runtimeRaw, stationsRaw] = await Promise.all([
    uciGet('wireless'),
    uciGet('network').catch(() => ({})),
    api.wireless().catch(() => ({})),
    api.stations().catch(() => ({}))
  ])

  const network = (networkRaw ?? {}) as Record<string, UciSection>
  const runtime = (runtimeRaw ?? {}) as unknown as Record<string, RuntimeRadio>
  const stationMap = (stationsRaw ?? {}) as unknown as Record<string, unknown>

  // Index the runtime interfaces by their UCI section name. `luci-rpc` returns
  // them as a map keyed by the UCI section, older builds as an array.
  const runtimeIfaces = new Map<string, RuntimeIface>()
  for (const radio of Object.values(runtime)) {
    for (const { key, item } of toEntries<RuntimeIface>(radio?.interfaces)) {
      const name = runtimeSectionName(key, item)
      if (name) runtimeIfaces.set(name, item)
    }
  }

  // The radios are keyed by their UCI section name as well.
  const runtimeRadios = new Map<string, RuntimeRadio>()
  for (const [key, radio] of Object.entries(runtime)) {
    runtimeRadios.set(key, radio)
    const section = radio?.config?.section
    if (typeof section === 'string' && section) runtimeRadios.set(section, radio)
  }

  const networks = Object.entries(network)
    .filter(([, section]) => section?.['.type'] === 'interface')
    .map(([key, section]) => uciString(section, 'name') || key)
    .filter(Boolean)

  const ifaceEntries = Object.entries(wireless).filter(
    ([, section]) => section?.['.type'] === 'wifi-iface'
  )

  const ifaces: WifiIfaceConfig[] = ifaceEntries.map(([key, section]) => {
    const name = sectionName(section, key)
    const runtimeIface = runtimeIfaces.get(name)
    const ifname = runtimeIface?.ifname || ''
    const device =
      uciString(section, 'device') ||
      uciString(runtimeIface?.config as UciSection | undefined, 'device')

    return {
      section: name,
      radio: device,
      ssid: uciString(section, 'ssid'),
      encryption: uciString(section, 'encryption') || 'none',
      keySet: optionPresent(section, 'key'),
      mode: uciString(section, 'mode') || 'ap',
      network: uciList(section, 'network').join(' '),
      hidden: uciBool(section, 'hidden'),
      macfilter: uciString(section, 'macfilter') || '0',
      maclist: parseMacList(section.maclist),
      guest: uciBool(section, 'isolate'),
      disabled: uciBool(section, 'disabled'),
      ifname,
      up: runtimeIface ? Boolean(runtimeIface.up ?? runtimeIface.iwinfo) : false,
      clients: ifname ? countStations(stationMap[ifname]) : 0
    }
  })

  const radioEntries = Object.entries(wireless).filter(
    ([, section]) => section?.['.type'] === 'wifi-device'
  )

  const radios: WifiRadioConfig[] = radioEntries.map(([key, section]) => {
    const name = sectionName(section, key)
    const runtimeRadio = runtimeRadios.get(name)
    const disabled = uciBool(section, 'disabled')

    return {
      section: name,
      type: uciString(section, 'type'),
      band: uciString(section, 'band'),
      channel: uciString(section, 'channel'),
      htmode: uciString(section, 'htmode'),
      country: uciString(section, 'country'),
      txpower: uciString(section, 'txpower'),
      disabled,
      path: uciString(section, 'path'),
      up: runtimeRadio ? Boolean(runtimeRadio.up) : !disabled,
      orphan: false,
      interfaces: ifaces.filter((iface) => iface.radio === name)
    }
  })

  // SSIDs without a matching `wifi-device` still deserve a card.
  const attached = new Set(radios.flatMap((radio) => radio.interfaces.map((i) => i.section)))
  const orphans = ifaces.filter((iface) => !attached.has(iface.section))
  if (orphans.length) {
    radios.push({
      section: '',
      type: '',
      band: '',
      channel: '',
      htmode: '',
      country: '',
      txpower: '',
      disabled: false,
      path: '',
      up: orphans.some((iface) => iface.up),
      orphan: true,
      interfaces: orphans
    })
  }

  return {
    radios,
    networks,
    clients: ifaces.reduce((sum, iface) => sum + iface.clients, 0)
  }
}

/* ------------------------------------------------------------------ *
 * Writing
 * ------------------------------------------------------------------ */

/** One staged change of the `wireless` config. */
export interface WirelessWriteOperation {
  /** UCI section the change applies to. */
  section: string
  /** Options to set (values are stringified by the UCI layer). */
  values?: UciValues
  /** Options to remove. */
  remove?: string[]
}

/**
 * Removes an option and tolerates the "not there" case — the goal is only
 * that the option is gone.
 */
async function removeOption(section: string, option: string): Promise<void> {
  try {
    await uciDelete('wireless', section, option)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    if (!/not found|不存在|Invalid|invalid/i.test(message)) throw err
  }
}

/**
 * The write path every change of this page uses:
 * stage the options (`uci.set`), write them to disk (`uci.commit`) and apply
 * them by reloading the wireless service.
 */
export async function applyWirelessConfig(operations: WirelessWriteOperation[]): Promise<void> {
  for (const operation of operations) {
    for (const option of operation.remove ?? []) {
      await removeOption(operation.section, option)
    }
    if (operation.values && Object.keys(operation.values).length) {
      await uciSet('wireless', operation.section, operation.values)
    }
  }
  await uciCommit('wireless')
  await systemOps.reloadWifi()
}

/** Discards staged (not yet committed) changes of the wireless config. */
export async function discardWirelessChanges(): Promise<void> {
  await systemOps.revertConfig('wireless')
}

/** Enables or disables a radio (`wifi-device` section). */
export async function setRadioEnabled(section: string, enabled: boolean): Promise<void> {
  await applyWirelessConfig([{ section, values: { disabled: enabled ? '0' : '1' } }])
}

/** Enables or disables a single SSID (`wifi-iface` section). */
export async function setIfaceEnabled(section: string, enabled: boolean): Promise<void> {
  await applyWirelessConfig([{ section, values: { disabled: enabled ? '0' : '1' } }])
}

/* ------------------------------------------------------------------ *
 * Display helpers
 * ------------------------------------------------------------------ */

/** Human readable label of an encryption value. */
export function encryptionText(encryption: string | undefined): string {
  if (!encryption || encryption === 'none') return '开放网络'
  if (encryption.includes('sae')) return 'WPA3-SAE'
  if (encryption.includes('psk2')) return 'WPA2-PSK'
  if (encryption.includes('psk')) return 'WPA-PSK'
  return encryption.toUpperCase()
}

/** Human readable label of a `macfilter` value. */
export function macFilterText(macfilter: string | undefined): string {
  const option = MAC_FILTER_OPTIONS.find((item) => item.value === (macfilter || '0'))
  return option ? option.label : macfilter || '关闭'
}

/** Human readable label of a `mode` value. */
export function modeText(mode: string | undefined): string {
  const option = IFACE_MODE_OPTIONS.find((item) => item.value === (mode || 'ap'))
  return option ? option.label : mode || '接入点（AP）'
}

/** Band label of a radio. */
export function bandText(band: string | undefined): string {
  if (!band) return '—'
  const value = band.toLowerCase()
  if (value.startsWith('2')) return '2.4 GHz'
  if (value.startsWith('5')) return '5 GHz'
  if (value.startsWith('6')) return '6 GHz'
  return band
}

/** The channels offered for a band. */
export function channelsForBand(band: string | undefined): number[] {
  const value = (band || '').toLowerCase()
  if (value.startsWith('2')) return CHANNELS_2G
  if (value.startsWith('6')) return CHANNELS_6G
  if (value.startsWith('5')) return CHANNELS_5G
  return [...CHANNELS_2G, ...CHANNELS_5G]
}
