import { api } from '@/api/openwrt'
import type {
  DhcpLease,
  HostHint,
  NetworkDevice,
  NetworkInterface,
  Station,
  SystemInfo,
  WirelessRadio
} from '@/api/types'

/**
 * Read-only data layer of the monitoring page.
 *
 * Everything in here is a thin, typed wrapper around the shared `api` object
 * plus the pure helpers the view needs to turn the cumulative byte counters of
 * the router into rates and to slice the front-end ring buffers down to the
 * selected time range. Nothing here writes to the router.
 */

/** Sampling cadence of the page, in milliseconds. */
export const SAMPLE_INTERVAL = 3000

/** Ring buffer capacity: 15 minutes of samples at SAMPLE_INTERVAL. */
export const MAX_SAMPLES = 300

/** Upper bound of the points drawn in one chart, no matter the time range. */
export const MAX_CHART_POINTS = 60

/** Points kept for the inline sparklines of the interface rows. */
export const SPARK_POINTS = 40

export type MonitorRange = '1m' | '5m' | '15m'

export interface MonitorRangeOption {
  key: MonitorRange
  label: string
  /** Length of the window in milliseconds. */
  ms: number
}

export const MONITOR_RANGES: MonitorRangeOption[] = [
  { key: '1m', label: '1 分钟', ms: 60_000 },
  { key: '5m', label: '5 分钟', ms: 5 * 60_000 },
  { key: '15m', label: '15 分钟', ms: 15 * 60_000 }
]

/** The metrics the resource curve can show. */
export type MonitorMetric = 'cpu' | 'memory' | 'network'

export interface MonitorMetricOption {
  key: MonitorMetric
  label: string
  /** Shown in the legend; it names the source of the value. */
  hint: string
}

export const MONITOR_METRICS: MonitorMetricOption[] = [
  {
    key: 'cpu',
    label: 'CPU',
    hint: 'CPU 由 1 分钟负载折算，路由器未开放真实占用计数'
  },
  {
    key: 'memory',
    label: '内存',
    hint: '内存占用来自 ubus system info'
  },
  {
    key: 'network',
    label: '网络速率',
    hint: '网络速率为 WAN 接口速率，无 WAN 时取全部接口合计'
  }
]

/** One point of the resource curve. */
export interface ResourceSample {
  time: number
  /** 1 minute load average. */
  load: number
  /** Memory usage in percent. */
  memory: number
  /** CPU utilisation estimate in percent (derived from the load average). */
  cpu: number
  /** Downlink rate of the external interface, in bytes per second. */
  netRx: number
  /** Uplink rate of the external interface, in bytes per second. */
  netTx: number
}

/** One point of a rate curve, in bytes per second. */
export interface RateSample {
  time: number
  rx: number
  tx: number
}

/** Live state of a single network interface. */
export interface InterfaceStat {
  name: string
  up: boolean
  wireless: boolean
  /** Cumulative counters since boot. */
  rxBytes: number
  txBytes: number
  /** Current rate in bytes per second. */
  rxRate: number
  txRate: number
  history: RateSample[]
}

/** Live state of a single client. */
export interface ClientStat {
  mac: string
  hostname: string
  ip: string
  wireless: boolean
  bandLabel?: string
  signal?: number
  /** Link rate reported by the station table, in kbit/s. */
  linkRate?: number
  /** Seconds the station has been associated. */
  connected?: number
  /** Cumulative counters since the station associated. */
  rxBytes: number
  txBytes: number
  /** Current throughput in bytes per second. */
  rxRate: number
  txRate: number
  history: RateSample[]
}

/** The metadata part of the page, refreshed far less often than the counters. */
export interface MonitorTopology {
  interfaces: NetworkInterface[]
  wireless: Record<string, WirelessRadio>
  hints: Record<string, HostHint>
  leases: DhcpLease[]
}

/** The fast moving part of the page: system counters and device counters. */
export interface MonitorCounters {
  info: SystemInfo
  devices: NetworkDevice[]
}

/** The 1 / 5 / 15 minute load averages of the router. */
export function loadAverages(info: SystemInfo | undefined): number[] {
  return (info?.load ?? [0, 0, 0]).map((value) => value / 65536)
}

/** Used, total and percentage of the router memory. */
export function memoryUsage(info: SystemInfo | undefined): {
  used: number
  total: number
  percent: number
} {
  const memory = info?.memory
  const total = memory?.total ?? 0
  const used = memory ? Math.max(0, memory.total - memory.available) : 0
  return { used, total, percent: total ? Math.round((used / total) * 100) : 0 }
}

/**
 * CPU utilisation estimate.
 *
 * The router does not expose a CPU utilisation counter through ubus, so the
 * busy share is derived from the 1 minute load average: a load of 1.0 means
 * one core is fully booked. The value is capped at 100 %.
 */
export function cpuEstimate(load: number): number {
  if (!Number.isFinite(load) || load <= 0) return 0
  return Math.min(100, Math.round(load * 100))
}

/** Cumulative traffic counters, with the scope they were read from. */
export interface TotalTraffic {
  rx: number
  tx: number
  total: number
  /** `wan` = WAN device only, `all` = every interface (may double count). */
  scope: 'wan' | 'all'
}

/**
 * Cumulative traffic since boot.
 *
 * Bridge, VLAN and physical devices all carry the same packets, so summing
 * every interface double counts the traffic. The WAN device is therefore
 * preferred: first the stock `wan` netdev, then an L3 device whose name
 * contains `wan` (`pppoe-wan`, `br-wan`, …). A router without one (a pure
 * access point) falls back to the sum of all non-loopback devices and marks
 * the result as such so the page can label it.
 */
export function totalTraffic(devices: NetworkDevice[]): TotalTraffic {
  const wan =
    devices.find((device) => device.name === 'wan') ??
    devices.find((device) => device.name !== 'lo' && device.name.includes('wan'))

  if (wan) {
    const rx = wan.stats?.rx_bytes ?? 0
    const tx = wan.stats?.tx_bytes ?? 0
    return { rx, tx, total: rx + tx, scope: 'wan' }
  }

  let rx = 0
  let tx = 0
  for (const device of devices) {
    if (device.name === 'lo') continue
    rx += device.stats?.rx_bytes ?? 0
    tx += device.stats?.tx_bytes ?? 0
  }
  return { rx, tx, total: rx + tx, scope: 'all' }
}

/**
 * The rate of the external traffic.
 *
 * The WAN interface carries the traffic of the internet, so it is preferred.
 * A router without a WAN interface (a pure access point) falls back to the
 * sum of all interfaces, which is what the page shows in that case.
 */
export function externalRate(rows: InterfaceStat[]): { rx: number; tx: number } {
  const wan = rows.find((row) => row.name === 'wan')
  if (wan) return { rx: wan.rxRate, tx: wan.txRate }

  let rx = 0
  let tx = 0
  for (const row of rows) {
    rx += row.rxRate
    tx += row.txRate
  }
  return { rx, tx }
}

/** Difference of two cumulative counters, converted to bytes per second. */
export function toRate(current: number, previous: number, elapsedMs: number): number {
  if (!Number.isFinite(elapsedMs) || elapsedMs <= 0) return 0
  const delta = current - previous
  if (!Number.isFinite(delta) || delta <= 0) return 0
  return delta / (elapsedMs / 1000)
}

/** Appends a sample and keeps the ring buffer at its fixed capacity. */
export function pushSample<T>(buffer: T[], sample: T, capacity = MAX_SAMPLES): void {
  buffer.push(sample)
  if (buffer.length > capacity) buffer.splice(0, buffer.length - capacity)
}

/**
 * Keeps the samples of the selected window and downsamples them to at most
 * `maxPoints` entries. Every bucket keeps the most recent sample, so the
 * shape of the curve survives the reduction.
 */
export function windowSamples<T extends { time: number }>(
  samples: T[],
  windowMs: number,
  maxPoints = MAX_CHART_POINTS,
  now = Date.now()
): T[] {
  const cutoff = now - windowMs
  const slice = samples.filter((sample) => sample.time >= cutoff)
  if (slice.length <= maxPoints) return slice

  const bucketSize = Math.ceil(slice.length / maxPoints)
  const reduced: T[] = []
  for (let index = 0; index < slice.length; index += bucketSize) {
    const bucket = slice.slice(index, index + bucketSize)
    if (bucket.length) reduced.push(bucket[bucket.length - 1])
  }
  return reduced
}

/** Reads the system counters and the per device byte counters. */
export async function fetchCounters(): Promise<MonitorCounters> {
  const [info, devices] = await Promise.all([api.systemInfo(), api.networkDevices()])
  return { info, devices }
}

/** Reads the wireless station table (signal, link rate, per station bytes). */
export async function fetchStations(): Promise<Record<string, Station[]>> {
  return api.stations()
}

/** Reads the rarely changing topology: interfaces, radios, hosts and leases. */
export async function fetchTopology(): Promise<MonitorTopology> {
  const [interfaces, wireless, hints, leases] = await Promise.all([
    api.interfaces(),
    api.wireless(),
    api.hostHints(),
    api.dhcpLeases()
  ])
  return { interfaces, wireless, hints, leases }
}
