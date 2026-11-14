import { ubusCall, cgiGet } from './ubus'
import type {
  BoardInfo,
  DhcpLease,
  HostHint,
  NetworkDevice,
  NetworkInterface,
  ShellCrashConfigs,
  ShellCrashConnections,
  ShellCrashProxy,
  Station,
  SystemInfo,
  WirelessRadio
} from './types'

/**
 * Every read the console polls accepts an optional abort signal. The polling
 * composable passes the signal of its own round, so navigating away cancels the
 * requests instead of leaving them running against the router.
 */
type Abort = AbortSignal | undefined

export const api = {
  board: (signal?: Abort) => ubusCall<BoardInfo>('system', 'board', {}, signal),
  systemInfo: (signal?: Abort) => ubusCall<SystemInfo>('system', 'info', {}, signal),
  interfaces: async (signal?: Abort) => {
    const data = await ubusCall<{ interface: NetworkInterface[] }>(
      'network.interface',
      'dump',
      {},
      signal
    )
    return data?.interface ?? []
  },
  networkDevices: async (signal?: Abort) => {
    const data = await ubusCall<Record<string, NetworkDevice>>(
      'luci-rpc',
      'getNetworkDevices',
      {},
      signal
    )
    return Object.values(data ?? {})
  },
  wireless: async (signal?: Abort) => {
    const data = await ubusCall<Record<string, WirelessRadio>>(
      'luci-rpc',
      'getWirelessDevices',
      {},
      signal
    )
    return data ?? {}
  },
  dhcpLeases: async (signal?: Abort) => {
    const data = await ubusCall<{ dhcp_leases: DhcpLease[] }>(
      'luci-rpc',
      'getDHCPLeases',
      {},
      signal
    )
    return data?.dhcp_leases ?? []
  },
  hostHints: async (signal?: Abort) => {
    const data = await ubusCall<Record<string, HostHint>>('luci-rpc', 'getHostHints', {}, signal)
    return data ?? {}
  },
  stations: async (signal?: Abort) => {
    const data = await cgiGet<{ stations: Record<string, Station[]> }>(
      '/cgi-bin/modern-data?what=stations',
      signal
    )
    return data?.stations ?? {}
  },
  logs: async (lines = 120, signal?: Abort) => {
    const data = await cgiGet<{ lines: string[] }>(
      `/cgi-bin/modern-data?what=logs&lines=${lines}`,
      signal
    )
    return data?.lines ?? []
  },
  shellcrash: {
    version: (signal?: Abort) =>
      cgiGet<{ meta: boolean; version: string }>('/cgi-bin/modern-proxy?path=/version', signal),
    configs: (signal?: Abort) =>
      cgiGet<ShellCrashConfigs>('/cgi-bin/modern-proxy?path=/configs', signal),
    connections: (signal?: Abort) =>
      cgiGet<ShellCrashConnections>('/cgi-bin/modern-proxy?path=/connections', signal),
    proxies: async (signal?: Abort) => {
      const data = await cgiGet<{ proxies: Record<string, ShellCrashProxy> }>(
        '/cgi-bin/modern-proxy?path=/proxies',
        signal
      )
      return data?.proxies ?? {}
    }
  }
}
