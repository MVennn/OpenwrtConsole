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

export const api = {
  board: () => ubusCall<BoardInfo>('system', 'board'),
  systemInfo: () => ubusCall<SystemInfo>('system', 'info'),
  interfaces: async () => {
    const data = await ubusCall<{ interface: NetworkInterface[] }>('network.interface', 'dump')
    return data?.interface ?? []
  },
  networkDevices: async () => {
    const data = await ubusCall<Record<string, NetworkDevice>>('luci-rpc', 'getNetworkDevices')
    return Object.values(data ?? {})
  },
  wireless: async () => {
    const data = await ubusCall<Record<string, WirelessRadio>>('luci-rpc', 'getWirelessDevices')
    return data ?? {}
  },
  dhcpLeases: async () => {
    const data = await ubusCall<{ dhcp_leases: DhcpLease[] }>('luci-rpc', 'getDHCPLeases')
    return data?.dhcp_leases ?? []
  },
  hostHints: async () => {
    const data = await ubusCall<Record<string, HostHint>>('luci-rpc', 'getHostHints')
    return data ?? {}
  },
  stations: async () => {
    const data = await cgiGet<{ stations: Record<string, Station[]> }>(
      '/cgi-bin/modern-data?what=stations'
    )
    return data?.stations ?? {}
  },
  logs: async (lines = 120) => {
    const data = await cgiGet<{ lines: string[] }>(
      `/cgi-bin/modern-data?what=logs&lines=${lines}`
    )
    return data?.lines ?? []
  },
  shellcrash: {
    version: () => cgiGet<{ meta: boolean; version: string }>('/cgi-bin/modern-proxy?path=/version'),
    configs: () => cgiGet<ShellCrashConfigs>('/cgi-bin/modern-proxy?path=/configs'),
    connections: () =>
      cgiGet<ShellCrashConnections>('/cgi-bin/modern-proxy?path=/connections'),
    proxies: async () => {
      const data = await cgiGet<{ proxies: Record<string, ShellCrashProxy> }>(
        '/cgi-bin/modern-proxy?path=/proxies'
      )
      return data?.proxies ?? {}
    }
  }
}
