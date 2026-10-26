import { ubusCall } from '@/api/ubus'
import { requestToken, runSystemOp, systemOps } from '@/api/systemOps'

/**
 * Operational data for the services / system operations page.
 *
 * Two kinds of sources live here:
 *
 *  - read-only ubus calls against the `luci` object that rpcd ships
 *    (process list, conntrack, mounts, block devices, LEDs) plus the `service`
 *    object for the running state of every init script;
 *  - privileged actions that go through the root CGI (`modern-uci`), because
 *    the rpcd session may not start, stop, enable or disable services.
 *
 * The router is not consistent about the answer shape: the list methods wrap
 * their payload in `{ "result": [...] }` while `getInitList` and `getLEDs`
 * answer with a plain map. Every parser below therefore accepts both.
 */

export const BACKUP_PATH = '/tmp/openwrt-backup.tar.gz'

export type OpsServiceAction = 'start' | 'stop' | 'restart' | 'enable' | 'disable'

export interface OpsService {
  /** Init script name, e.g. `dnsmasq`. */
  name: string
  /** Whether at least one instance of the service is running. */
  running: boolean
  /** Whether the service starts on boot; `null` when the router does not say. */
  enabled: boolean | null
  /** Number of running instances. */
  instances: number
}

export interface OpsProcess {
  pid: number
  ppid: number
  user: string
  /** Kernel process state, e.g. `S`. */
  stat: string
  /** CPU share in percent. */
  cpu: number
  /** Resident memory share in percent. */
  memoryPercent: number
  /** Virtual memory size in bytes (the router reports VSZ in KiB). */
  memoryBytes: number
  command: string
}

export interface OpsConntrack {
  /** Transport protocol, upper case, e.g. `TCP`. */
  protocol: string
  /** Address family, e.g. `ipv4`. */
  layer3: string
  source: string
  destination: string
  state: string
  /** Remaining lifetime in seconds. */
  timeout: number
  bytes: number
  packets: number
}

export interface OpsMount {
  device: string
  mountpoint: string
  totalBytes: number
  usedBytes: number
  availableBytes: number
  freeBytes: number
}

export interface OpsBlockDevice {
  device: string
  sizeBytes: number
  type: string
  model: string
  removable: boolean
  mounted: string
}

export interface OpsLed {
  name: string
  on: boolean
  brightness: number
  maxBrightness: number
  /** Trigger that currently drives the LED, e.g. `phy0tpt`. */
  trigger: string
}

/* ------------------------------------------------------------------ utils */

type RawRecord = Record<string, unknown>

function asRecord(value: unknown): RawRecord {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as RawRecord)
    : {}
}

function isRecord(value: unknown): value is RawRecord {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

/**
 * Finds the first array in the payload. The `luci` list methods answer with
 * `{ "result": [...] }`, older builds answer with a bare array.
 */
function pickArray(payload: unknown, keys: string[]): unknown[] {
  if (Array.isArray(payload)) return payload
  const record = asRecord(payload)
  for (const key of keys) {
    const value = record[key]
    if (Array.isArray(value)) return value
  }
  for (const key of keys) {
    const value = record[key]
    if (isRecord(value)) {
      const nested = pickArray(value, keys)
      if (nested.length) return nested
    }
  }
  return []
}

/**
 * Finds the map in the payload. `getInitList` and `getLEDs` answer with
 * `{ "<name>": { ... } }`, a wrapper object is accepted as well.
 */
function pickMap(payload: unknown, keys: string[]): RawRecord {
  if (Array.isArray(payload)) {
    const out: RawRecord = {}
    for (const item of payload) {
      const record = asRecord(item)
      const name = stringOf(record, ['name', 'service', 'id'])
      if (name) out[name] = record
    }
    return out
  }
  const record = asRecord(payload)
  for (const key of keys) {
    const value = record[key]
    if (isRecord(value)) return value
  }
  return record
}

function stringOf(record: RawRecord, keys: string[]): string {
  for (const key of keys) {
    const value = record[key]
    if (typeof value === 'string' && value.trim()) return value.trim()
    if (typeof value === 'number' && Number.isFinite(value)) return String(value)
  }
  return ''
}

function numberOf(record: RawRecord, keys: string[]): number {
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

function percentOf(record: RawRecord, keys: string[]): number {
  for (const key of keys) {
    const value = record[key]
    if (typeof value === 'number' && Number.isFinite(value)) return value
    if (typeof value === 'string') {
      const parsed = Number.parseFloat(value.replace('%', '').trim())
      if (Number.isFinite(parsed)) return parsed
    }
  }
  return 0
}

function boolOf(record: RawRecord, keys: string[]): boolean | null {
  for (const key of keys) {
    const value = record[key]
    if (typeof value === 'boolean') return value
    if (typeof value === 'number' && Number.isFinite(value)) return value !== 0
    if (typeof value === 'string') {
      const text = value.trim().toLowerCase()
      if (['1', 'true', 'yes', 'on', 'enabled', 'running'].includes(text)) return true
      if (['0', 'false', 'no', 'off', 'disabled', 'stopped'].includes(text)) return false
    }
  }
  return null
}

const SIZE_SUFFIX: Record<string, number> = {
  '': 1024,
  k: 1024,
  m: 1024 ** 2,
  g: 1024 ** 3,
  t: 1024 ** 4
}

/**
 * Parses a size the way `ps` prints it: `4960` (KiB), `1357m` (MiB), `2g`.
 */
export function parseSizeText(value: string | undefined): number {
  if (!value) return 0
  const match = /^\s*([0-9]*\.?[0-9]+)\s*([kmgt]?)b?\s*$/i.exec(value)
  if (!match) return 0
  const amount = Number.parseFloat(match[1])
  if (!Number.isFinite(amount)) return 0
  const unit = SIZE_SUFFIX[match[2].toLowerCase()] ?? 1024
  return Math.round(amount * unit)
}

function formatEndpoint(record: RawRecord, hostKeys: string[], portKeys: string[]): string {
  const host = stringOf(record, hostKeys)
  if (!host) return '—'
  const port = numberOf(record, portKeys)
  return port ? `${host}:${port}` : host
}

/**
 * The conntrack table of the router does not carry the TCP state machine, so
 * the state is derived from the reference count: an established flow is
 * referenced twice (request and reply direction).
 */
function inferConntrackState(layer4: string, use: number): string {
  if (!layer4) return '—'
  if (layer4 === 'tcp') return use >= 2 ? '已建立' : '建立中'
  return '无状态'
}

/* ----------------------------------------------------------------- reads */

/** All processes known to the router. */
export async function fetchProcesses(): Promise<OpsProcess[]> {
  const payload = await ubusCall<unknown>('luci', 'getProcessList', {})
  return pickArray(payload, ['result', 'processes'])
    .map((item) => {
      const row = asRecord(item)
      return {
        pid: numberOf(row, ['PID', 'pid']),
        ppid: numberOf(row, ['PPID', 'ppid']),
        user: stringOf(row, ['USER', 'user']) || '—',
        stat: stringOf(row, ['STAT', 'stat']),
        cpu: percentOf(row, ['%CPU', 'cpu']),
        memoryPercent: percentOf(row, ['%MEM', 'memory', 'mem']),
        memoryBytes: parseSizeText(stringOf(row, ['VSZ', 'vsz'])),
        command: stringOf(row, ['COMMAND', 'command'])
      }
    })
    .sort((a, b) => a.pid - b.pid)
}

/** The current connection tracking table. */
export async function fetchConntrack(): Promise<OpsConntrack[]> {
  const payload = await ubusCall<unknown>('luci', 'getConntrackList', {})
  return pickArray(payload, ['result', 'conntrack']).map((item) => {
    const row = asRecord(item)
    const layer4 = stringOf(row, ['layer4', 'proto', 'protocol']).toLowerCase()
    const use = numberOf(row, ['use'])
    const reported = stringOf(row, ['state', 'status', 'tcp_state'])
    return {
      protocol: layer4.toUpperCase() || '—',
      layer3: stringOf(row, ['layer3', 'family']),
      source: formatEndpoint(row, ['src', 'source'], ['sport']),
      destination: formatEndpoint(row, ['dst', 'destination', 'dest'], ['dport']),
      state: reported || inferConntrackState(layer4, use),
      timeout: numberOf(row, ['timeout']),
      bytes: numberOf(row, ['bytes']),
      packets: numberOf(row, ['packets'])
    }
  })
}

/** Mounted file systems with their usage. Sizes are bytes. */
export async function fetchMounts(): Promise<OpsMount[]> {
  const payload = await ubusCall<unknown>('luci', 'getMountPoints', {})
  return pickArray(payload, ['result', 'mounts']).map((item) => {
    const row = asRecord(item)
    const total = numberOf(row, ['size', 'total'])
    const available = numberOf(row, ['avail', 'available'])
    return {
      device: stringOf(row, ['device', 'source']),
      mountpoint: stringOf(row, ['mount', 'mountpoint', 'path']),
      totalBytes: total,
      usedBytes: Math.max(0, total - available),
      availableBytes: available,
      freeBytes: numberOf(row, ['free'])
    }
  })
}

/** Block devices. The size unit is normalised by `calibrateBlockSizes`. */
export async function fetchBlockDevices(): Promise<OpsBlockDevice[]> {
  const payload = await ubusCall<unknown>('luci', 'getBlockDevices', {})
  return pickArray(payload, ['result', 'block']).map((item) => {
    const row = asRecord(item)
    return {
      device: stringOf(row, ['device', 'name', 'path']),
      sizeBytes: numberOf(row, ['size', 'bytes']),
      type: stringOf(row, ['type', 'device_type']),
      model: stringOf(row, ['model', 'vendor']),
      removable: boolOf(row, ['removable']) ?? false,
      mounted: stringOf(row, ['mounted', 'mountpoint', 'mount'])
    }
  })
}

/**
 * Block sizes arrive in bytes, in 512 byte sectors or in 1 KiB units. A
 * partition is about as large as the file system mounted on it, so the mount
 * totals tell us which unit the router used.
 */
export function calibrateBlockSizes(
  blocks: OpsBlockDevice[],
  mounts: OpsMount[]
): OpsBlockDevice[] {
  if (!blocks.length || !mounts.length) return blocks
  const largest = Math.max(...mounts.map((mount) => mount.totalBytes))
  return blocks.map((block) => {
    if (!block.sizeBytes) return block
    const match = mounts.find((mount) => sameDevice(mount.device, block.device))
    const reference = match ? match.totalBytes : largest
    if (!reference) return block
    // The reported value is measured in `unit` bytes (1 / 512 / 1024), so the
    // reference divided by it equals that unit. The inverse ratio is either
    // ~1/512 or ~1/1024 and never matches any bracket, leaving the size wrong.
    const unit = closestUnit(reference / block.sizeBytes)
    return { ...block, sizeBytes: Math.round(block.sizeBytes * unit) }
  })
}

function closestUnit(ratio: number): number {
  for (const unit of [1, 512, 1024]) {
    if (ratio >= unit / 1.5 && ratio <= unit * 1.5) return unit
  }
  return 1
}

function sameDevice(a: string, b: string): boolean {
  const left = a.split('/').pop() ?? a
  const right = b.split('/').pop() ?? b
  return Boolean(left) && left === right
}

/** Status LEDs of the device. */
export async function fetchLeds(): Promise<OpsLed[]> {
  const payload = await ubusCall<unknown>('luci', 'getLEDs', {})
  return Object.entries(pickMap(payload, ['leds'])).map(([name, raw]) => {
    const row = asRecord(raw)
    const brightness = numberOf(row, ['brightness'])
    return {
      name,
      on: brightness > 0,
      brightness,
      maxBrightness: numberOf(row, ['max_brightness']),
      trigger: stringOf(row, ['active_trigger', 'trigger'])
    }
  })
}

/**
 * The init scripts of the router with their boot flag. The list itself comes
 * from the root CGI, because the rpcd session may not read it.
 */
async function fetchInitList(): Promise<RawRecord> {
  const payload = await runSystemOp<unknown>('svc-list')
  return pickMap(payload, ['services', 'init'])
}

/** Running state of every service, taken from the `service` ubus object. */
async function fetchRunningState(): Promise<Map<string, { running: boolean; instances: number }>> {
  const state = new Map<string, { running: boolean; instances: number }>()
  try {
    const payload = await ubusCall<unknown>('service', 'list', {})
    for (const [name, raw] of Object.entries(pickMap(payload, ['services']))) {
      const entry = asRecord(raw)
      const instances = entry.instances
      const list = Array.isArray(instances) ? instances : Object.values(asRecord(instances))
      const running = list.some((item) => boolOf(asRecord(item), ['running']) === true)
      state.set(name, { running, instances: list.length })
    }
  } catch {
    // The running state is an extra: the service list is still useful without it.
  }
  return state
}

/**
 * Every service the router knows: the init scripts (which can be started,
 * stopped and enabled) merged with the running instances.
 */
export async function fetchServices(): Promise<OpsService[]> {
  const [initList, running] = await Promise.all([fetchInitList(), fetchRunningState()])
  const names = new Set([...Object.keys(initList), ...running.keys()])
  const services: OpsService[] = []
  for (const name of names) {
    const entry = asRecord(initList[name])
    const state = running.get(name)
    services.push({
      name,
      enabled: boolOf(entry, ['enabled']),
      running: state?.running ?? false,
      instances: state?.instances ?? 0
    })
  }
  return services.sort((a, b) => a.name.localeCompare(b.name))
}

/* ---------------------------------------------------------------- writes */

/** Starts, stops or restarts a service through the root CGI. */
export async function runServiceAction(service: string, action: OpsServiceAction): Promise<void> {
  await systemOps.serviceAction(service, action)
}

/** Creates a configuration backup and returns the path on the router. */
export async function createBackup(path: string = BACKUP_PATH): Promise<string> {
  const result = (await systemOps.createBackup(path)) as { path?: string } | undefined
  return result?.path || path
}

/** Restores a backup. The token is single use and lives for 120 seconds. */
export async function restoreBackup(path: string): Promise<void> {
  const token = await requestToken('backup-restore')
  await systemOps.restoreBackup(path, token)
}

/** Reboots the router. */
export async function rebootRouter(): Promise<void> {
  const token = await requestToken('reboot')
  await systemOps.reboot(token)
}

/** Resets the router to the factory defaults. */
export async function factoryResetRouter(): Promise<void> {
  const token = await requestToken('factory-reset')
  await systemOps.factoryReset(token)
}
