export interface OpenWrtRelease {
  distribution: string
  version: string
  revision: string
  target: string
  description: string
}

export interface BoardInfo {
  kernel: string
  hostname: string
  system: string
  model: string
  board_name: string
  rootfs_type: string
  release: OpenWrtRelease
}

export interface MemoryInfo {
  total: number
  free: number
  shared: number
  buffered: number
  available: number
  cached: number
}

export interface SystemInfo {
  localtime: number
  uptime: number
  load: number[]
  memory: MemoryInfo
  root: { total: number; free: number; used: number; avail: number }
  tmp: { total: number; free: number; used: number; avail: number }
  swap: { total: number; free: number }
}

export interface UciAddress {
  address: string
  mask: number
}

export interface UciRoute {
  target: string
  mask: number
  nexthop?: string
  source?: string
  metric?: number
  valid?: number
}

export interface NetworkInterface {
  interface: string
  up: boolean
  pending: boolean
  available: boolean
  autostart: boolean
  dynamic: boolean
  uptime: number
  proto: string
  device: string
  l3_device: string
  'ipv4-address': UciAddress[]
  'ipv6-address': UciAddress[]
  'ipv6-prefix-assignment': Array<{ address: string; mask: number }>
  route: UciRoute[]
  'dns-server': string[]
  'dns-search': string[]
  data: Record<string, unknown>
}

export interface DeviceStats {
  rx_bytes: number
  tx_bytes: number
  rx_packets: number
  tx_packets: number
  rx_errors: number
  tx_errors: number
  rx_dropped: number
  tx_dropped: number
  multicast: number
  collisions: number
}

export interface NetworkDevice {
  name: string
  wireless: boolean
  up: boolean
  master: string | null
  stats: DeviceStats
  ipaddrs: Array<{ address: string; netmask: string; broadcast?: string }>
  ip6addrs?: Array<{ address: string; netmask: string }>
  mtu?: number
  devtype?: string
  mac?: string
}

export interface IwinfoInfo {
  signal: number
  noise: number
  channel: number
  country: string
  phy: string
  txpower: number
  frequency: number
  hwmodes: string[]
  hwmodes_text: string
  htmodes: string[]
  hardware: { id: number[]; name: string }
  quality: number
  quality_max: number
  bitrate: number
  mode: string
  ssid?: string
  encryption?: string
}

export interface WirelessInterface {
  section: string
  ifname: string
  config: {
    network: string[]
    device: string[]
    mode: string
    encryption: string
    ssid: string
    key?: string
    ieee80211k?: boolean
    ieee80211w?: number
    radios?: string[]
    disabled?: boolean
  }
  vlans: unknown[]
  stations: unknown[]
  iwinfo?: IwinfoInfo
}

export interface WirelessRadio {
  up: boolean
  pending: boolean
  autostart: boolean
  disabled: boolean
  retry_setup_failed: boolean
  config: {
    disabled: boolean
    type: string
    band: string
    cell_density: number
    channel: string
    country: string
    htmode: string
    path: string
  }
  interfaces: WirelessInterface[]
}

export interface DhcpLease {
  expires: number
  hostname: string
  macaddr: string
  ipaddr: string
}

export interface HostHint {
  ipaddrs: string[]
  ip6addrs: string[]
  name?: string
}

export interface StationRxTx {
  rate: number
  bytes: number
  packets: number
  mcs?: number
  nss?: number
  mhz?: number
  he?: boolean
  vht?: boolean
  ht?: boolean
  failed?: number
}

export interface Station {
  mac: string
  signal: number
  signal_avg: number
  noise: number
  inactive: number
  connected_time: number
  thr: number
  rx: StationRxTx
  tx: StationRxTx
}

export interface ShellCrashProxy {
  name: string
  type: string
  now?: string
  all?: string[]
  alive?: boolean
  history?: Array<{ time: string; delay: number }>
  udp?: boolean
}

export interface ShellCrashConnection {
  id: string
  upload: number
  download: number
  rule: string
  rulePayload?: string
  chains: string[]
  start: string
  metadata: {
    host?: string
    destinationIP?: string
    sourceIP?: string
    network?: string
    type?: string
  }
}

export interface ShellCrashConnections {
  downloadTotal: number
  uploadTotal: number
  connections: ShellCrashConnection[]
  memory?: number
}

export interface ShellCrashConfigs {
  port: number
  'socks-port': number
  'redir-port': number
  'tproxy-port': number
  'mixed-port': number
  tun: {
    enable: boolean
    stack: string
    'auto-route'?: boolean
  }
  mode?: string
  'log-level'?: string
}
