import type { DhcpLease, HostHint, Station, WirelessRadio } from '@/api/types'
import { bandLabel } from './format'

export interface ClientRow {
  mac: string
  hostname: string
  ip: string
  wireless: boolean
  /**
   * The device is associated with a radio right now. A lease alone does not
   * prove that a wired device is online, so lease-only rows are `false`.
   */
  online: boolean
  band?: string
  bandLabel?: string
  signal?: number
  rate?: number
  connected?: number
  inactive?: number
  lease?: number
}

export interface WifiMeta {
  band: string
  ssid: string
}

export function buildWifiMeta(
  wireless: Record<string, WirelessRadio>
): Record<string, WifiMeta> {
  const meta: Record<string, WifiMeta> = {}
  for (const radio of Object.values(wireless)) {
    for (const iface of radio.interfaces) {
      if (iface.ifname) {
        meta[iface.ifname] = { band: radio.config?.band || '', ssid: iface.config?.ssid || '' }
      }
    }
  }
  return meta
}

/**
 * DHCP leases are the source of identity (hostname + IP); the wireless station
 * table adds band/signal/rate and proves that the device is online. A device
 * that appears in both is merged on MAC.
 */
export function mergeClients(
  leases: DhcpLease[],
  stations: Record<string, Station[]>,
  hints: Record<string, HostHint>,
  wifiMeta: Record<string, WifiMeta>
): ClientRow[] {
  const map = new Map<string, ClientRow>()
  const now = Date.now() / 1000

  for (const lease of leases) {
    if (lease.expires > 0 && lease.expires < now) continue
    const key = lease.macaddr.toUpperCase()
    map.set(key, {
      mac: lease.macaddr,
      hostname: lease.hostname || '未知设备',
      ip: lease.ipaddr,
      wireless: false,
      online: false,
      lease: lease.expires
    })
  }

  for (const [ifname, list] of Object.entries(stations)) {
    const meta = wifiMeta[ifname]
    for (const station of list) {
      const key = station.mac.toUpperCase()
      const existing = map.get(key)
      const hint = hints[key]
      map.set(key, {
        mac: station.mac,
        hostname: existing?.hostname || hint?.name || '无线设备',
        ip: existing?.ip || hint?.ipaddrs?.[0] || '—',
        wireless: true,
        online: true,
        band: meta?.band,
        bandLabel: bandLabel(meta?.band),
        signal: station.signal,
        rate: Math.max(station.rx?.rate || 0, station.tx?.rate || 0),
        connected: station.connected_time,
        inactive: station.inactive,
        lease: existing?.lease
      })
    }
  }

  return [...map.values()]
}

export function countWirelessClients(stations: Record<string, Station[]>): number {
  const unique = new Set<string>()
  for (const list of Object.values(stations)) {
    for (const station of list) unique.add(station.mac.toUpperCase())
  }
  return unique.size
}
