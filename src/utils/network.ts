import type { NetworkInterface } from '@/api/types'

export interface WanInterfaceSet {
  wan: NetworkInterface | undefined
  wan6: NetworkInterface | undefined
  lan: NetworkInterface | undefined
}

/** The netdev behind a logical interface, e.g. `pppoe-wan` for `wan`. */
export function wanDeviceName(iface: NetworkInterface | undefined): string {
  if (!iface) return ''
  return iface.l3_device || iface.device || ''
}

function hasDefaultRoute(iface: NetworkInterface, target: string): boolean {
  return Boolean(
    iface.route?.some((route) => route.target === target && Number(route.mask) === 0)
  )
}

function hasWanDeviceName(iface: NetworkInterface): boolean {
  return /wan/i.test(`${iface.l3_device || ''} ${iface.device || ''}`)
}

/**
 * Resolves the interfaces the console reports as WAN / WAN6 / LAN.
 *
 * A custom network configuration does not have to call its uplink `wan`, so
 * each slot falls back to the default route and then to the netdev name
 * instead of trusting the hard-coded interface names.
 */
export function pickWanInterfaces(interfaces: NetworkInterface[]): WanInterfaceSet {
  const byName = (name: string) => interfaces.find((iface) => iface.interface === name)

  const wan6 =
    byName('wan6') ?? interfaces.find((iface) => hasDefaultRoute(iface, '::'))

  const wan =
    byName('wan') ??
    interfaces.find(
      (iface) =>
        iface !== wan6 &&
        iface.interface !== 'loopback' &&
        hasDefaultRoute(iface, '0.0.0.0')
    ) ??
    interfaces.find(
      (iface) =>
        iface !== wan6 &&
        iface.interface !== 'loopback' &&
        iface.proto !== 'none' &&
        hasWanDeviceName(iface)
    )

  const lan =
    byName('lan') ??
    interfaces.find(
      (iface) =>
        iface !== wan &&
        iface !== wan6 &&
        iface.interface !== 'loopback' &&
        Boolean(iface['ipv4-address']?.length)
    )

  return { wan, wan6, lan }
}
