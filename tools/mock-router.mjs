#!/usr/bin/env node
/**
 * Mock router for local UI development.
 *
 * The console talks to a real router through two channels: the uhttpd `/ubus`
 * JSON-RPC endpoint and the `/cgi-bin/modern-*` helpers. This server answers
 * both with a small, completely synthetic network so the whole UI can be
 * exercised without a router, a root password or a login session.
 *
 * Run it next to `npm run dev`:
 *
 *   node tools/mock-router.mjs
 *   ROUTER_URL=http://127.0.0.1:5199 npm run dev
 *
 * The data is intentionally fake: documentation address ranges (RFC 5737),
 * locally administered MAC addresses and generic hostnames. Never point the
 * dev server at this process in production, and never expose the port on the
 * LAN — the mock accepts any login.
 */

import { createServer } from 'node:http'
import { URL } from 'node:url'

const HOST = '127.0.0.1'
const PORT = Number(process.env.MOCK_PORT || 5199)
const NOW = Math.floor(Date.now() / 1000)
const START_MS = Date.now()

const json = (value) => JSON.stringify(value)
const mac = (n) => `02:00:00:00:00:${String(n).padStart(2, '0')}`
const at = (minutes) => NOW + minutes * 60

/* ------------------------------------------------------------------ *
 * Identity and system
 * ------------------------------------------------------------------ */

const board = {
  kernel: '6.12.0-mock',
  hostname: 'MockRouter',
  system: 'ARMv8 Processor rev 4',
  model: 'Mock Router AX3000T',
  board_name: 'mock,router-ax3000t',
  rootfs_type: 'squashfs',
  release: {
    distribution: 'OpenWrt',
    version: '25.12.6',
    revision: 'r0-mock',
    target: 'mediatek/filogic',
    description: 'OpenWrt 25.12.6 r0-mock (mock)',
    builddate: String(NOW)
  }
}

const systemInfo = {
  localtime: NOW,
  uptime: 86400,
  load: [6553, 9830, 13107],
  memory: {
    total: 256 * 1024 * 1024,
    free: 96 * 1024 * 1024,
    shared: 4 * 1024 * 1024,
    buffered: 0,
    available: 148 * 1024 * 1024,
    cached: 52 * 1024 * 1024
  },
  root: { total: 60 * 1024, free: 40 * 1024, used: 20 * 1024, avail: 38 * 1024 },
  tmp: { total: 48 * 1024, free: 42 * 1024, used: 6 * 1024, avail: 42 * 1024 },
  swap: { total: 0, free: 0 }
}

/* ------------------------------------------------------------------ *
 * Network interfaces and devices
 * ------------------------------------------------------------------ */

const interfaces = [
  {
    interface: 'loopback',
    up: true,
    pending: false,
    available: true,
    autostart: true,
    dynamic: false,
    uptime: 86400,
    proto: 'static',
    device: 'lo',
    l3_device: 'lo',
    'ipv4-address': [{ address: '127.0.0.1', mask: 8 }],
    'ipv6-address': [{ address: '::1', mask: 128 }],
    'ipv6-prefix-assignment': [],
    route: [],
    'dns-server': [],
    'dns-search': [],
    data: {}
  },
  {
    interface: 'lan',
    up: true,
    pending: false,
    available: true,
    autostart: true,
    dynamic: false,
    uptime: 86340,
    proto: 'static',
    device: 'br-lan',
    l3_device: 'br-lan',
    'ipv4-address': [{ address: '192.0.2.1', mask: 24 }],
    'ipv6-address': [{ address: '2001:db8:1::1', mask: 64 }],
    'ipv6-prefix-assignment': [{ address: '2001:db8:1::', mask: 64 }],
    route: [{ target: '192.0.2.0', mask: 24, nexthop: '', source: '192.0.2.1/32' }],
    'dns-server': [],
    'dns-search': ['lan'],
    data: { dhcpserver: '192.0.2.1', leasetime: 43200 }
  },
  {
    interface: 'wan',
    up: true,
    pending: false,
    available: true,
    autostart: true,
    dynamic: false,
    uptime: 86100,
    proto: 'dhcp',
    device: 'wan',
    l3_device: 'wan',
    'ipv4-address': [{ address: '198.51.100.2', mask: 24 }],
    'ipv6-address': [],
    'ipv6-prefix-assignment': [],
    route: [{ target: '0.0.0.0', mask: 0, nexthop: '198.51.100.1', source: '198.51.100.2/32' }],
    'dns-server': ['198.51.100.1'],
    'dns-search': [],
    data: { dhcpserver: '198.51.100.1', leasetime: 3600 }
  },
  {
    interface: 'wan6',
    up: true,
    pending: false,
    available: true,
    autostart: true,
    dynamic: true,
    uptime: 86000,
    proto: 'dhcpv6',
    device: 'wan',
    l3_device: 'wan',
    'ipv4-address': [],
    'ipv6-address': [{ address: '2001:db8:100::2', mask: 64 }],
    'ipv6-prefix-assignment': [{ address: '2001:db8:200::', mask: 56 }],
    route: [{ target: '::', mask: 0, nexthop: 'fe80::1', source: '2001:db8:100::2/64' }],
    'dns-server': ['2001:db8:100::1'],
    'dns-search': [],
    data: {}
  }
]

const deviceStats = (rx, tx) => ({
  rx_bytes: rx,
  tx_bytes: tx,
  rx_packets: Math.floor(rx / 1200),
  tx_packets: Math.floor(tx / 1200),
  rx_errors: 0,
  tx_errors: 0,
  rx_dropped: 0,
  tx_dropped: 0,
  multicast: 12,
  collisions: 0
})

const devices = {
  lo: {
    name: 'lo',
    wireless: false,
    up: true,
    master: null,
    stats: deviceStats(12 * 1024 * 1024, 12 * 1024 * 1024),
    ipaddrs: [{ address: '127.0.0.1', netmask: '255.0.0.0' }],
    mtu: 65536,
    devtype: 'loopback'
  },
  eth0: {
    name: 'eth0',
    wireless: false,
    up: true,
    master: null,
    stats: deviceStats(3.2 * 1024 * 1024 * 1024, 420 * 1024 * 1024),
    ipaddrs: [],
    mtu: 1504,
    devtype: 'ethernet',
    mac: mac(1)
  },
  wan: {
    name: 'wan',
    wireless: false,
    up: true,
    master: null,
    stats: deviceStats(2.9 * 1024 * 1024 * 1024, 380 * 1024 * 1024),
    ipaddrs: [{ address: '198.51.100.2', netmask: '255.255.255.0' }],
    mtu: 1500,
    devtype: 'ethernet',
    mac: mac(2)
  },
  'br-lan': {
    name: 'br-lan',
    wireless: false,
    up: true,
    master: null,
    stats: deviceStats(1.4 * 1024 * 1024 * 1024, 210 * 1024 * 1024),
    ipaddrs: [{ address: '192.0.2.1', netmask: '255.255.255.0' }],
    mtu: 1500,
    devtype: 'bridge',
    mac: mac(3)
  },
  lan1: {
    name: 'lan1',
    wireless: false,
    up: true,
    master: 'br-lan',
    stats: deviceStats(640 * 1024 * 1024, 82 * 1024 * 1024),
    ipaddrs: [],
    mtu: 1500,
    devtype: 'ethernet',
    mac: mac(4)
  },
  lan2: {
    name: 'lan2',
    wireless: false,
    up: true,
    master: 'br-lan',
    stats: deviceStats(420 * 1024 * 1024, 51 * 1024 * 1024),
    ipaddrs: [],
    mtu: 1500,
    devtype: 'ethernet',
    mac: mac(5)
  },
  lan3: {
    name: 'lan3',
    wireless: false,
    up: false,
    master: 'br-lan',
    stats: deviceStats(0, 0),
    ipaddrs: [],
    mtu: 1500,
    devtype: 'ethernet',
    mac: mac(6)
  },
  lan4: {
    name: 'lan4',
    wireless: false,
    up: false,
    master: 'br-lan',
    stats: deviceStats(0, 0),
    ipaddrs: [],
    mtu: 1500,
    devtype: 'ethernet',
    mac: mac(7)
  },
  'phy0-ap0': {
    name: 'phy0-ap0',
    wireless: true,
    up: true,
    master: 'br-lan',
    stats: deviceStats(180 * 1024 * 1024, 24 * 1024 * 1024),
    ipaddrs: [],
    mtu: 1500,
    devtype: 'wlan',
    mac: mac(8)
  },
  'phy1-ap0': {
    name: 'phy1-ap0',
    wireless: true,
    up: true,
    master: 'br-lan',
    stats: deviceStats(620 * 1024 * 1024, 96 * 1024 * 1024),
    ipaddrs: [],
    mtu: 1500,
    devtype: 'wlan',
    mac: mac(9)
  },
  'phy2-ap0': {
    name: 'phy2-ap0',
    wireless: true,
    up: true,
    master: 'br-lan',
    stats: deviceStats(260 * 1024 * 1024, 18 * 1024 * 1024),
    ipaddrs: [],
    mtu: 1500,
    devtype: 'wlan',
    mac: mac(10)
  },
  wg0: {
    name: 'wg0',
    wireless: false,
    up: false,
    master: null,
    stats: deviceStats(0, 0),
    ipaddrs: [],
    mtu: 1420,
    devtype: 'wireguard'
  }
}

/** Bytes per second each device carries, so the live charts move. */
const deviceRates = {
  eth0: [220 * 1024, 34 * 1024],
  wan: [190 * 1024, 28 * 1024],
  'br-lan': [140 * 1024, 22 * 1024],
  lan1: [64 * 1024, 8 * 1024],
  lan2: [42 * 1024, 6 * 1024],
  lan3: [0, 0],
  lan4: [0, 0],
  'phy0-ap0': [10 * 1024, 2 * 1024],
  'phy1-ap0': [38 * 1024, 5 * 1024],
  'phy2-ap0': [16 * 1024, 3 * 1024],
  wg0: [0, 0],
  lo: [0, 0]
}

/**
 * The device table with counters that keep growing, so the dashboard and the
 * monitor page draw a real rate instead of a flat zero line.
 */
function devicesSnapshot() {
  const elapsed = Math.max(0, Math.floor((Date.now() - START_MS) / 1000))
  const result = {}
  for (const [name, device] of Object.entries(devices)) {
    const [rxRate, txRate] = deviceRates[name] || [0, 0]
    const rx = device.stats.rx_bytes + rxRate * elapsed
    const tx = device.stats.tx_bytes + txRate * elapsed
    result[name] = {
      ...device,
      stats: {
        ...device.stats,
        rx_bytes: rx,
        tx_bytes: tx,
        rx_packets: Math.floor(rx / 1200),
        tx_packets: Math.floor(tx / 1200)
      }
    }
  }
  return result
}

const deviceStatus = {}
for (const [name, device] of Object.entries(devices)) {
  deviceStatus[name] = {
    name,
    up: device.up,
    carrier: device.up && device.devtype !== 'wireguard',
    speed: device.devtype === 'ethernet' ? 1000 : 0,
    type: device.devtype
  }
}

/* ------------------------------------------------------------------ *
 * Wireless
 * ------------------------------------------------------------------ */

const station = (index, signal) => ({
  mac: mac(index),
  signal,
  signal_avg: signal - 2,
  noise: -92,
  inactive: 12,
  connected_time: 3600 + index * 60,
  thr: 65000,
  rx: { rate: 650000, bytes: 18 * 1024 * 1024, packets: 24000, mcs: 7, nss: 2, mhz: 80 },
  tx: { rate: 433000, bytes: 4 * 1024 * 1024, packets: 8200, mcs: 6, nss: 2, mhz: 80 }
})

const stations = {
  'phy0-ap0': [station(20, -48)],
  'phy1-ap0': [station(21, -55)],
  'phy2-ap0': [station(22, -61)]
}

const radio = (key, band, channel, frequency, htmode, ifname, ssid, index) => ({
  up: true,
  pending: false,
  autostart: true,
  disabled: false,
  retry_setup_failed: false,
  config: {
    disabled: false,
    type: 'mac80211',
    band,
    cell_density: 0,
    channel: String(channel),
    country: 'US',
    htmode,
    path: `platform/soc/${index}000000.wifi`
  },
  interfaces: [
    {
      section: `default_${key}`,
      ifname,
      config: {
        network: ['lan'],
        device: [key],
        mode: 'ap',
        encryption: 'psk2',
        ieee80211k: true,
        ieee80211w: 1,
        ssid,
        radios: []
      },
      vlans: [],
      stations: [],
      iwinfo: {
        signal: -48,
        noise: -92,
        channel,
        country: 'US',
        phy: `phy${index}`,
        txpower: 20,
        txpower_offset: 0,
        frequency,
        frequency_offset: 0,
        hwmodes: band === '2g' ? ['b', 'g', 'n', 'ax'] : ['a', 'n', 'ac', 'ax'],
        hwmodes_text: band === '2g' ? 'ax/b/g/n' : 'ax/ac/n/a',
        htmodes: band === '2g' ? ['HT20', 'HT40', 'HE20', 'HE40'] : ['HT20', 'HT40', 'VHT80', 'HE80'],
        hardware: { id: [0, 0, 0, 0], name: `MediaTek MT7981 (mock ${band})` },
        quality: 70,
        quality_max: 70,
        bitrate: 650000,
        mode: 'Master',
        ssid,
        bssid: mac(30 + index),
        encryption: { enabled: true, wpa: [2], authentication: ['psk'], ciphers: ['ccmp'] }
      }
    }
  ]
})

const wireless = {
  radio0: radio('radio0', '2g', 6, 2437, 'HE20', 'phy0-ap0', 'MockNet-2G', 0),
  radio1: radio('radio1', '5g', 149, 5745, 'HE80', 'phy1-ap0', 'MockNet-5G', 1),
  radio2: radio('radio2', '6g', 37, 6135, 'HE160', 'phy2-ap0', 'MockNet-6G', 2)
}

/* ------------------------------------------------------------------ *
 * DHCP, hosts and neighbours
 * ------------------------------------------------------------------ */

const leases = [
  { expires: at(600), hostname: 'mock-laptop', macaddr: mac(20), ipaddr: '192.0.2.100' },
  { expires: at(720), hostname: 'mock-phone', macaddr: mac(21), ipaddr: '192.0.2.101' },
  { expires: at(480), hostname: 'mock-tv', macaddr: mac(22), ipaddr: '192.0.2.102' },
  { expires: at(900), hostname: 'mock-nas', macaddr: mac(23), ipaddr: '192.0.2.103' }
]

const hints = {
  [mac(20)]: { ipaddrs: ['192.0.2.100'], ip6addrs: ['2001:db8:1::100'], name: 'mock-laptop' },
  [mac(21)]: { ipaddrs: ['192.0.2.101'], ip6addrs: ['2001:db8:1::101'], name: 'mock-phone' },
  [mac(22)]: { ipaddrs: ['192.0.2.102'], ip6addrs: ['2001:db8:1::102'], name: 'mock-tv' },
  [mac(23)]: { ipaddrs: ['192.0.2.103'], ip6addrs: [], name: 'mock-nas' }
}

const neighbors = [
  { ip: '192.0.2.100', mac: mac(20), device: 'br-lan', state: 'REACHABLE' },
  { ip: '192.0.2.101', mac: mac(21), device: 'br-lan', state: 'REACHABLE' },
  { ip: '192.0.2.102', mac: mac(22), device: 'br-lan', state: 'STALE' },
  { ip: '192.0.2.103', mac: mac(23), device: 'br-lan', state: 'REACHABLE' },
  { ip: '198.51.100.1', mac: mac(24), device: 'wan', state: 'REACHABLE' }
]

/* ------------------------------------------------------------------ *
 * UCI configuration
 * ------------------------------------------------------------------ */

const uci = {
  system: {
    system: {
      '.type': 'system',
      '.name': 'system',
      '.index': 0,
      hostname: 'MockRouter',
      timezone: 'UTC',
      zonename: 'UTC',
      log_size: '64',
      ttylogin: '1',
      ntp: ['0.openwrt.pool.ntp.org', '1.openwrt.pool.ntp.org']
    }
  },
  network: {
    loopback: {
      '.type': 'interface',
      '.name': 'loopback',
      '.index': 0,
      ifname: 'lo',
      proto: 'static',
      ipaddr: '127.0.0.1',
      netmask: '255.0.0.0'
    },
    lan: {
      '.type': 'interface',
      '.name': 'lan',
      '.index': 1,
      type: 'bridge',
      ifname: ['lan1', 'lan2', 'lan3', 'lan4'],
      proto: 'static',
      ipaddr: '192.0.2.1',
      netmask: '255.255.255.0',
      ip6assign: '60'
    },
    wan: {
      '.type': 'interface',
      '.name': 'wan',
      '.index': 2,
      device: 'wan',
      proto: 'dhcp'
    },
    wan6: {
      '.type': 'interface',
      '.name': 'wan6',
      '.index': 3,
      device: 'wan',
      proto: 'dhcpv6'
    },
    route_lab: {
      '.type': 'route',
      '.name': 'route_lab',
      '.index': 4,
      interface: 'lan',
      target: '203.0.113.0',
      netmask: '255.255.255.0',
      gateway: '192.0.2.254',
      metric: '10'
    }
  },
  wireless: {
    radio0: {
      '.type': 'wifi-device',
      '.name': 'radio0',
      '.index': 0,
      type: 'mac80211',
      band: '2g',
      channel: '6',
      htmode: 'HE20',
      country: 'US',
      cell_density: '0',
      disabled: '0'
    },
    radio1: {
      '.type': 'wifi-device',
      '.name': 'radio1',
      '.index': 1,
      type: 'mac80211',
      band: '5g',
      channel: '149',
      htmode: 'HE80',
      country: 'US',
      cell_density: '0',
      disabled: '0'
    },
    radio2: {
      '.type': 'wifi-device',
      '.name': 'radio2',
      '.index': 2,
      type: 'mac80211',
      band: '6g',
      channel: '37',
      htmode: 'HE160',
      country: 'US',
      cell_density: '0',
      disabled: '0'
    },
    default_radio0: {
      '.type': 'wifi-iface',
      '.name': 'default_radio0',
      '.index': 3,
      device: 'radio0',
      network: 'lan',
      mode: 'ap',
      ssid: 'MockNet-2G',
      encryption: 'psk2',
      key: '',
      disabled: '0'
    },
    default_radio1: {
      '.type': 'wifi-iface',
      '.name': 'default_radio1',
      '.index': 4,
      device: 'radio1',
      network: 'lan',
      mode: 'ap',
      ssid: 'MockNet-5G',
      encryption: 'psk2',
      key: '',
      disabled: '0'
    },
    default_radio2: {
      '.type': 'wifi-iface',
      '.name': 'default_radio2',
      '.index': 5,
      device: 'radio2',
      network: 'lan',
      mode: 'ap',
      ssid: 'MockNet-6G',
      encryption: 'psk2+sae',
      key: '',
      disabled: '0'
    }
  },
  dhcp: {
    dnsmasq: {
      '.type': 'dnsmasq',
      '.name': 'dnsmasq',
      '.index': 0,
      domainneeded: '1',
      boguspriv: '1',
      filterwin2k: '0',
      localise_queries: '1',
      rebind_protection: '1',
      local: '/lan/',
      domain: 'lan',
      expandhosts: '1',
      nonegcache: '0',
      authoritative: '1',
      readethers: '1',
      leasefile: '/tmp/dhcp.leases',
      resolvfile: '/tmp/resolv.conf.d/resolv.conf.auto',
      nonwildcard: '1',
      localservice: '1',
      ednspacket_max: '1232',
      server: ['192.0.2.53', '198.51.100.53'],
      cachesize: '1000'
    },
    lan: {
      '.type': 'dhcp',
      '.name': 'lan',
      '.index': 1,
      interface: 'lan',
      start: '100',
      limit: '100',
      leasetime: '12h',
      dhcpv6: 'server',
      ra: 'server'
    },
    host0: {
      '.type': 'host',
      '.name': 'host0',
      '.index': 2,
      name: 'mock-nas',
      mac: mac(23),
      ip: '192.0.2.103'
    }
  },
  firewall: {
    defaults: {
      '.type': 'defaults',
      '.name': 'defaults',
      '.index': 0,
      input: 'REJECT',
      output: 'ACCEPT',
      forward: 'REJECT',
      synflood_protect: '1',
      flow_offloading: '0',
      flow_offloading_hw: '0'
    },
    lan: {
      '.type': 'zone',
      '.name': 'lan',
      '.index': 1,
      name: 'lan',
      network: ['lan'],
      input: 'ACCEPT',
      output: 'ACCEPT',
      forward: 'ACCEPT'
    },
    wan: {
      '.type': 'zone',
      '.name': 'wan',
      '.index': 2,
      name: 'wan',
      network: ['wan', 'wan6'],
      input: 'REJECT',
      output: 'ACCEPT',
      forward: 'REJECT',
      masq: '1',
      mtu_fix: '1'
    },
    lan_wan: {
      '.type': 'forwarding',
      '.name': 'lan_wan',
      '.index': 3,
      src: 'lan',
      dest: 'wan'
    },
    web: {
      '.type': 'redirect',
      '.name': 'web',
      '.index': 4,
      name: 'Mock Web',
      src: 'wan',
      src_dport: '8080',
      dest_ip: '192.0.2.100',
      dest_port: '80',
      proto: 'tcp',
      target: 'DNAT',
      enabled: '1'
    },
    dns: {
      '.type': 'rule',
      '.name': 'dns',
      '.index': 5,
      name: 'Allow DNS',
      src: 'lan',
      dest: 'wan',
      proto: 'udp',
      dest_port: '53',
      target: 'ACCEPT',
      enabled: '1'
    }
  },
  luci: {},
  opkg: {}
}

/* ------------------------------------------------------------------ *
 * Operations data
 * ------------------------------------------------------------------ */

const mount = (device, mountpoint, total, avail) => ({
  device,
  mount: mountpoint,
  size: total,
  avail,
  free: avail
})

const mounts = [
  mount('/dev/root', '/rom', 12 * 1024 * 1024, 0),
  mount('tmpfs', '/tmp', 48 * 1024 * 1024, 42 * 1024 * 1024),
  mount('/dev/ubi0_1', '/overlay', 60 * 1024 * 1024, 38 * 1024 * 1024),
  mount('overlayfs:/overlay', '/', 60 * 1024 * 1024, 38 * 1024 * 1024),
  mount('tmpfs', '/dev', 512 * 1024, 512 * 1024)
]

const processes = [
  { PID: 1, PPID: 0, USER: 'root', STAT: 'S', 'VSZ': 1820, '%CPU': 0.1, '%MEM': 0.6, COMMAND: '/sbin/procd' },
  { PID: 812, PPID: 1, USER: 'root', STAT: 'S', 'VSZ': 6200, '%CPU': 0.4, '%MEM': 1.8, COMMAND: '/usr/sbin/ubusd' },
  { PID: 1204, PPID: 1, USER: 'root', STAT: 'S', 'VSZ': 18400, '%CPU': 0.8, '%MEM': 4.2, COMMAND: '/usr/sbin/uhttpd' },
  { PID: 1500, PPID: 1, USER: 'root', STAT: 'S', 'VSZ': 24800, '%CPU': 0.6, '%MEM': 5.1, COMMAND: '/usr/sbin/dnsmasq' },
  { PID: 2100, PPID: 1, USER: 'root', STAT: 'S', 'VSZ': 139000, '%CPU': 3.2, '%MEM': 18.4, COMMAND: '/etc/ShellCrash/CrashCore' }
]

const conntrack = [
  {
    bytes: 5254,
    packets: 18,
    layer3: 'ipv4',
    layer4: 'tcp',
    timeout: 4388,
    src: '192.0.2.100',
    dst: '203.0.113.10',
    sport: 3924,
    dport: 443,
    mark: '0',
    zone: '0',
    use: '2'
  },
  {
    bytes: 265519,
    packets: 845,
    layer3: 'ipv4',
    layer4: 'tcp',
    timeout: 0,
    src: '192.0.2.101',
    dst: '203.0.113.20',
    sport: 2151,
    dport: 8080,
    mark: '0',
    zone: '0',
    use: '3'
  },
  {
    bytes: 66262,
    packets: 584,
    layer3: 'ipv4',
    layer4: 'udp',
    timeout: 169,
    src: '192.0.2.102',
    dst: '192.0.2.1',
    sport: 63444,
    dport: 53,
    mark: '0',
    zone: '0',
    use: '2'
  },
  {
    bytes: 12000,
    packets: 40,
    layer3: 'ipv6',
    layer4: 'tcp',
    timeout: 120,
    src: '2001:db8:1::100',
    dst: '2001:db8:100::20',
    sport: 51000,
    dport: 443,
    mark: '0',
    zone: '0',
    use: '2'
  }
]

const leds = {
  'mock:green:status': { brightness: 1, max_brightness: 1, active_trigger: 'default-on' },
  'mock:green:wan': { brightness: 1, max_brightness: 1, active_trigger: 'netdev' },
  'mock:amber:wlan': { brightness: 0, max_brightness: 1, active_trigger: 'phy0tpt' }
}

const initList = {
  'apk-index': { index: 8, stop: null, enabled: true },
  boot: { index: 10, stop: 90, enabled: true },
  cron: { index: 50, stop: null, enabled: true },
  dnsmasq: { index: 19, stop: 90, enabled: true },
  dropbear: { index: 20, stop: 90, enabled: true },
  firewall: { index: 21, stop: 90, enabled: true },
  network: { index: 30, stop: 90, enabled: true },
  system: { index: 40, stop: 90, enabled: true },
  uhttpd: { index: 90, stop: 10, enabled: true }
}

const serviceList = {
  cron: { instances: { instance1: { running: true, pid: 1600 } } },
  dnsmasq: { instances: { instance1: { running: true, pid: 1500 } } },
  dropbear: { instances: { instance1: { running: true, pid: 1700 } } },
  firewall: { instances: { instance1: { running: true, pid: 1800 } } },
  network: { instances: { instance1: { running: true, pid: 1900 } } },
  system: { instances: { instance1: { running: true, pid: 2000 } } },
  uhttpd: { instances: { instance1: { running: true, pid: 1204 } } }
}

/* ------------------------------------------------------------------ *
 * Proxy and ShellCrash
 * ------------------------------------------------------------------ */

const proxies = {
  Proxy: { name: 'Proxy', type: 'Selector', now: 'Auto', all: ['Auto', 'Node A', 'Node B'] },
  Auto: { name: 'Auto', type: 'URLTest', now: 'Node A', all: ['Node A', 'Node B'] },
  AI: { name: 'AI', type: 'Selector', now: 'Node A', all: ['Node A', 'Node B'] },
  'Node A': {
    name: 'Node A',
    type: 'Shadowsocks',
    udp: true,
    history: [
      { time: new Date((NOW - 60) * 1000).toISOString(), delay: 42 },
      { time: new Date((NOW - 120) * 1000).toISOString(), delay: 45 }
    ]
  },
  'Node B': {
    name: 'Node B',
    type: 'Shadowsocks',
    udp: true,
    history: [{ time: new Date((NOW - 90) * 1000).toISOString(), delay: 88 }]
  }
}

const connections = [1, 2].map((index) => ({
  id: `mock-connection-${index}`,
  upload: 12000 * index,
  download: 240000 * index,
  rule: 'MATCH',
  rulePayload: '',
  chains: ['Proxy', 'Auto', index === 1 ? 'Node A' : 'Node B'],
  start: new Date((NOW - 300 * index) * 1000).toISOString(),
  metadata: {
    host: index === 1 ? 'mock.example' : 'api.example',
    destinationIP: index === 1 ? '203.0.113.10' : '203.0.113.20',
    sourceIP: '192.0.2.100',
    network: 'tcp',
    type: 'HTTP'
  }
}))

const shellCrashStatus = {
  ok: true,
  installed: true,
  running: true,
  service_status: 'inactive',
  pid: 2100,
  core_version: 'v1.19.28-mock',
  shellcrash_version: '1.9.5-mock',
  redir_mod: 'Redir',
  dns_mod: 'mix',
  firewall_mod: 'nftables',
  ports: { mixed: 7890, redir: 7892, tproxy: 7893, socks: 0, dns: 1053, controller: 9999 },
  subs_count: 2,
  autostart: true,
  last_action: `restart 0 ${NOW}`
}

const shellCrashConfigValues = {
  redir_mod: 'Redir',
  dns_mod: 'mix',
  firewall_mod: 'nftables',
  cn_ip_route: 'ON',
  cn_ipv6_route: 'ON',
  ipv6_support: 'ON',
  ipv6_redir: 'OFF',
  ipv6_dns: 'OFF',
  hosts_opt: 'ON',
  dns_protect: 'ON',
  sniffer: 'OFF',
  quic_rj: 'ON',
  my_alias: 'sc',
  ecs_subnet: 'OFF',
  firewall_area: '3',
  core_v: 'v1.19.28-mock',
  crashcore: 'meta',
  url_id: '1',
  release_type: 'stable',
  hostdir: ':9999/ui',
  disoverride: '0'
}

const shellCrashOverrides = {
  ok: true,
  global_disabled: false,
  files: [
    ['config.yaml', 'active', 'Base runtime overrides'],
    ['proxies.yaml', 'active', 'Proxy definitions'],
    ['proxy-groups.yaml', 'active', 'Proxy groups'],
    ['rules.yaml', 'active', 'Routing rules'],
    ['user.yaml', 'disabled', 'User customisations']
  ].map(([name, state, summary], index) => ({
    name,
    enabled: state === 'active',
    state,
    size: 1200 + index * 300,
    mtime: new Date((NOW - index * 3600) * 1000).toISOString().replace('T', ' ').slice(0, 19),
    mtime_epoch: NOW - index * 3600,
    summary,
    description: summary,
    lines: 40 + index * 10
  }))
}

const shellCrashSubs = {
  ok: true,
  count: 2,
  url_count: 1,
  provider_count: 1,
  url_id: '1',
  update_source: 'Mock Provider',
  update_url: 'https://sub.example.com',
  alias: 'Mock Sub',
  node_count: 12,
  custom_count: 2,
  subs: [
    {
      index: 1,
      alias: 'Mock Sub',
      source: 'Mock Provider',
      source_url: 'https://sub.example.com',
      url_id: '1',
      host: 'sub.example.com',
      masked: 'https://sub.example.com/***',
      enabled: true,
      entries: 12
    }
  ],
  providers: [
    {
      name: 'Mock Pool',
      host: 'sub.example.com',
      masked: 'https://sub.example.com/***',
      entries: 12,
      enabled: true
    }
  ]
}

const shellCrashCrash = {
  ok: true,
  running: true,
  pid: 2100,
  core_version: 'v1.19.28-mock',
  start_time: NOW - 7200,
  uptime: 7200,
  alive_ts: NOW - 10,
  alive_age: 10,
  probe_ts: NOW - 30,
  last_fallback_heal: 0,
  start_error: false,
  guardian_cron: '*/5 * * * *',
  guardian_log: [
    `${new Date((NOW - 7200) * 1000).toISOString().slice(0, 19).replace('T', ' ')} INFO: CrashCore 已拉起`,
    `${new Date((NOW - 3600) * 1000).toISOString().slice(0, 19).replace('T', ' ')} INFO: 核心探活正常`
  ]
}

const shellCrashPorts = {
  ok: true,
  ports: [7890, 7892, 7893, 1053, 9999].map((port) => ({
    port,
    listening: true,
    pid: 2100,
    process: 'CrashCore'
  }))
}

const shellCrashHeal = {
  ok: true,
  entries: [
    { time: NOW - 7200, level: 'success', message: 'CrashCore 核心拉起', source: 'crash_start_time' },
    { time: NOW - 3600, level: 'info', message: '核心探活记录', source: '.proxy_alive' },
    { time: NOW - 1800, level: 'warning', message: '运行配置缺少策略组，守护已修复', source: '.last_fallback_heal' }
  ]
}

/* ------------------------------------------------------------------ *
 * Packages and firmware
 * ------------------------------------------------------------------ */

const installedPackages = [
  { name: 'base-files', version: '1718~mock', description: 'Mock base files', installed: true },
  { name: 'busybox', version: '1.37.0-mock', description: 'Mock BusyBox', installed: true },
  { name: 'dnsmasq', version: '2.90-mock', description: 'Mock DNS/DHCP server', installed: true },
  { name: 'dropbear', version: '2024.86-mock', description: 'Mock SSH server', installed: true },
  { name: 'uhttpd', version: '2024.11-mock', description: 'Mock web server', installed: true }
].map((pkg) => ({ ...pkg, arch: 'aarch64_cortex-a53', license: 'MIT', origin: 'mock', installedSize: 120000 }))

const availablePackages = [
  ['curl', '8.10.0-mock', 'Mock HTTP client'],
  ['nano', '8.0-mock', 'Mock text editor'],
  ['htop', '3.3.0-mock', 'Mock process viewer'],
  ['tcpdump', '4.99.4-mock', 'Mock packet capture'],
  ['mtr', '0.95-mock', 'Mock network diagnostic']
].map(([name, version, description], index) => ({
  name,
  version,
  description,
  arch: 'aarch64_cortex-a53',
  license: 'MIT',
  origin: 'mock',
  installed: name === 'curl',
  fileSize: 24000 + index * 1000,
  depends: index === 0 ? ['libcurl'] : []
}))

const firmwareInfo = {
  ok: true,
  board: {
    kernel: board.kernel,
    hostname: board.hostname,
    system: board.system,
    model: board.model,
    board_name: board.board_name,
    rootfs_type: board.rootfs_type
  },
  release: {
    distribution: board.release.distribution,
    version: board.release.version,
    revision: board.release.revision,
    target: board.release.target,
    description: board.release.description,
    firmware_url: 'https://downloads.openwrt.org/'
  },
  files: [
    {
      name: 'mock-firmware.bin',
      path: '/tmp/mock-firmware.bin',
      size: 8 * 1024 * 1024,
      mtime: NOW - 600
    }
  ],
  backups: [
    {
      name: 'mock-backup.tar.gz',
      path: '/tmp/mock-backup.tar.gz',
      size: 96 * 1024,
      mtime: NOW - 1200
    }
  ],
  update: null,
  update_checked_at: 0
}

const updateCheck = {
  ok: true,
  current_version: board.release.version,
  latest_version: board.release.version,
  target: board.release.target,
  id: board.board_name,
  model: board.model,
  device: board.board_name.replace(',', '_'),
  published_at: '',
  published_at_raw: '',
  published_at_ts: 0,
  size: 0,
  sha256: '',
  download_url: '',
  changelog_url: '',
  notes: [],
  upgradable: false,
  file_name: '',
  file_date: '',
  warning: ''
}

/* ------------------------------------------------------------------ *
 * Helpers
 * ------------------------------------------------------------------ */

function responseHeaders(extra = {}) {
  return {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    ...extra
  }
}

function sendJson(res, status, payload) {
  const body = json(payload)
  res.writeHead(status, responseHeaders())
  res.end(body)
}

function readBody(req) {
  return new Promise((resolve) => {
    let body = ''
    req.on('data', (chunk) => {
      body += chunk
    })
    req.on('end', () => resolve(body))
  })
}

function parseBody(body) {
  if (!body) return {}
  try {
    return JSON.parse(body)
  } catch {
    return {}
  }
}

function ubusOk(id, payload) {
  return { jsonrpc: '2.0', id, result: [0, payload] }
}

function ubusError(id, code, message) {
  return { jsonrpc: '2.0', id, error: { code, message } }
}

/* ------------------------------------------------------------------ *
 * /ubus
 * ------------------------------------------------------------------ */

function handleUbus(call) {
  const id = call?.id ?? 1
  const params = call?.params
  if (!Array.isArray(params) || params.length < 3) {
    return ubusError(id, -32602, 'Invalid params')
  }
  const [, object, method, args] = params

  if (object === 'system' && method === 'board') return ubusOk(id, board)
  if (object === 'system' && method === 'info') return ubusOk(id, systemInfo)
  if (object === 'system' && method === 'reboot') return ubusOk(id, {})

  if (object === 'network.interface' && method === 'dump') {
    return ubusOk(id, { interface: interfaces })
  }
  if (object === 'network.device' && method === 'status') {
    const name = String(args?.name || '')
    const status = deviceStatus[name] || { name, up: true, carrier: true, speed: 1000, type: 'ethernet' }
    return ubusOk(id, status)
  }
  // Deliberately missing: the console falls back to the interface dump, and
  // README documents that `network route` is not available on current builds.
  if (object === 'network' && method === 'route') {
    return ubusError(id, -32601, 'Method not found')
  }

  if (object === 'luci-rpc' && method === 'getNetworkDevices') return ubusOk(id, devicesSnapshot())
  if (object === 'luci-rpc' && method === 'getWirelessDevices') return ubusOk(id, wireless)
  if (object === 'luci-rpc' && method === 'getDHCPLeases') return ubusOk(id, { dhcp_leases: leases })
  if (object === 'luci-rpc' && method === 'getHostHints') return ubusOk(id, hints)
  if (object === 'luci-rpc' && method === 'getBoardJSON') return ubusOk(id, board)

  if (object === 'luci' && method === 'getProcessList') return ubusOk(id, { result: processes })
  if (object === 'luci' && method === 'getConntrackList') return ubusOk(id, { result: conntrack })
  if (object === 'luci' && method === 'getMountPoints') return ubusOk(id, { result: mounts })
  if (object === 'luci' && method === 'getBlockDevices') {
    return ubusOk(id, {
      result: [
        {
          device: '/dev/mmcblk0',
          size: 8 * 1024 * 1024 * 1024,
          type: 'disk',
          model: 'Mock Storage',
          removable: false,
          mounted: ''
        }
      ]
    })
  }
  if (object === 'luci' && method === 'getLEDs') return ubusOk(id, { leds })
  if (object === 'luci' && method === 'getTimezones') {
    return ubusOk(id, {
      timezones: [
        'UTC',
        'Asia/Shanghai',
        'Asia/Hong_Kong',
        'Asia/Singapore',
        'Asia/Tokyo',
        'Europe/London',
        'Europe/Berlin',
        'America/New_York',
        'America/Los_Angeles'
      ]
    })
  }
  if (object === 'luci' && method === 'getInitList') return ubusOk(id, initList)
  if (object === 'luci' && method === 'getVersion') return ubusOk(id, { version: 'mock' })
  if (object === 'luci' && method === 'getUnixtime') return ubusOk(id, { localtime: NOW })

  if (object === 'service' && method === 'list') return ubusOk(id, serviceList)

  if (object === 'uci') {
    if (method === 'get') {
      const config = String(args?.config || '')
      const values = uci[config] || {}
      const section = String(args?.section || '')
      if (!section) return ubusOk(id, { values })
      return ubusOk(id, { values: values[section] ? { [section]: values[section] } : {} })
    }
    if (method === 'add') return ubusOk(id, { section: 'cfg0mock' })
    if (method === 'changes') return ubusOk(id, { changes: [] })
    return ubusOk(id, {})
  }

  if (object === 'session') {
    if (method === 'get') return ubusOk(id, { values: { username: 'root' } })
    if (method === 'destroy') return ubusOk(id, {})
    return ubusOk(id, {})
  }

  return ubusOk(id, {})
}

/* ------------------------------------------------------------------ *
 * /cgi-bin/modern-*
 * ------------------------------------------------------------------ */

function diagnosticResult(body) {
  const tool = String(body.tool || 'ping')
  const target = String(body.target || 'mock.example')
  const params = {
    count: Number(body.count || 5),
    size: Number(body.size || 56),
    wait: Number(body.wait || 3),
    hops: Number(body.hops || 15),
    twait: Number(body.twait || 1),
    probes: Number(body.probes || 3)
  }
  if (tool === 'ping') {
    return {
      tool,
      target,
      command: `ping -c ${params.count} -s ${params.size} -W ${params.wait} ${target}`,
      params: { count: params.count, size: params.size, wait: params.wait },
      output: [
        `PING ${target} (192.0.2.10): ${params.size} data bytes`,
        `64 bytes from 192.0.2.10: seq=0 ttl=64 time=12.3 ms`,
        `64 bytes from 192.0.2.10: seq=1 ttl=64 time=11.8 ms`,
        `--- ${target} ping statistics ---`,
        `3 packets transmitted, 3 packets received, 0% packet loss`,
        `round-trip min/avg/max = 11.8/12.1/12.3 ms`
      ].join('\n'),
      exit_code: 0,
      duration_ms: 3050,
      truncated: false
    }
  }
  if (tool === 'dns') {
    return {
      tool,
      target,
      command: `nslookup ${target}`,
      params: {},
      output: [
        'Server:\t\t192.0.2.53',
        'Address:\t192.0.2.53:53',
        '',
        'Name:\t' + target,
        'Address: 192.0.2.10'
      ].join('\n'),
      exit_code: 0,
      duration_ms: 1200,
      truncated: false
    }
  }
  if (tool === 'trace') {
    return {
      tool,
      target,
      command: `traceroute -n -w 1 -q 3 -m ${params.hops} ${target}`,
      params: { hops: params.hops, twait: params.twait, probes: params.probes },
      output: [
        `traceroute to ${target} (192.0.2.10), 15 hops max, 46 byte packets`,
        ' 1  198.51.100.1  1.234 ms  1.456 ms  1.678 ms',
        ' 2  203.0.113.1   8.901 ms  9.012 ms  9.234 ms',
        ' 3  192.0.2.10    12.345 ms 12.456 ms 12.678 ms'
      ].join('\n'),
      exit_code: 0,
      duration_ms: 8200,
      truncated: false
    }
  }
  if (tool === 'routes') {
    return {
      tool,
      target: '',
      command: 'ip route show',
      params: {},
      output: [
        'default via 198.51.100.1 dev wan proto static src 198.51.100.2',
        '192.0.2.0/24 dev br-lan proto kernel scope link src 192.0.2.1',
        '198.51.100.0/24 dev wan proto kernel scope link src 198.51.100.2'
      ].join('\n'),
      exit_code: 0,
      duration_ms: 400,
      truncated: false
    }
  }
  return {
    tool,
    target: '',
    command: 'netstat -lntup',
    params: {},
    output: [
      'tcp  0 0 0.0.0.0:80 0.0.0.0:* LISTEN 1204/uhttpd',
      'tcp  0 0 0.0.0.0:53 0.0.0.0:* LISTEN 1500/dnsmasq',
      'tcp  0 0 :::7890 :::* LISTEN 2100/CrashCore',
      'tcp  0 0 :::9999 :::* LISTEN 2100/CrashCore'
    ].join('\n'),
    exit_code: 0,
    duration_ms: 600,
    truncated: false
  }
}

function handleShellCrash(body) {
  const action = String(body.action || '')
  const params = body.params || {}
  if (action === 'status') return shellCrashStatus
  if (action === 'config') {
    return {
      ok: true,
      values: shellCrashConfigValues,
      url_host: 'sub.example.com',
      secret_set: true
    }
  }
  if (action === 'overrides') return shellCrashOverrides
  if (action === 'subs') return shellCrashSubs
  if (action === 'crash') return shellCrashCrash
  if (action === 'ports') return shellCrashPorts
  if (action === 'heal') return shellCrashHeal
  if (action === 'log') {
    return {
      ok: true,
      file: 'mock.log',
      files: [{ name: 'mock.log', path: '/tmp/ShellCrash/mock.log', size: 2048 }],
      lines: [
        '[mock] ShellCrash started',
        '[mock] core v1.19.28-mock',
        '[mock] guardian: core alive'
      ]
    }
  }
  if (action === 'sub-update-state') {
    return {
      ok: true,
      started: true,
      running: false,
      done: true,
      success: true,
      rc: 0,
      started_at: NOW - 30,
      finished_at: NOW - 20,
      lines: ['[mock] subscription updated']
    }
  }
  if (action === 'sub-update') {
    return { ok: true, started: true, running: true }
  }
  if (action === 'service') {
    return { ok: true, action: String(params.action || 'restart'), started: true, autostart: true }
  }
  if (action === 'config-write') {
    return { ok: true, changed: ['mock=value'], backup: '/etc/ShellCrash/configs/ShellCrash.cfg.bak-mock' }
  }
  if (action === 'override-toggle') {
    return { ok: true, changed: [`${params.file || 'mock.yaml'}=${params.enable || 'yes'}`] }
  }
  return { ok: true }
}

function handlePackages(body) {
  const action = String(body.action || '')
  const params = body.params || {}
  if (action === 'stats') {
    return {
      ok: true,
      installedCount: installedPackages.length,
      availableCount: 100,
      matchedCount: 100 + installedPackages.length,
      upgradableCount: 0,
      indexUpdatedAt: NOW - 3600
    }
  }
  if (action === 'list') {
    return { ok: true, packages: installedPackages, installedCount: installedPackages.length }
  }
  if (action === 'available') {
    return { ok: true, packages: availablePackages, availableCount: 100 }
  }
  if (action === 'search') {
    const keyword = String(params.keyword || '').toLowerCase()
    const packages = [...installedPackages, ...availablePackages].filter((pkg) =>
      `${pkg.name} ${pkg.description || ''}`.toLowerCase().includes(keyword)
    )
    return { ok: true, packages, matchedCount: packages.length }
  }
  if (action === 'status') {
    return { ok: true, status: 'done', exitCode: 0, output: 'mock job finished' }
  }
  return { ok: true, jobId: 'mock-job', status: 'running' }
}

function handleFirmware(body) {
  const action = String(body.action || '')
  if (action === 'info') return firmwareInfo
  if (action === 'list-backups') return { ok: true, backups: firmwareInfo.backups }
  if (action === 'verify') {
    return { ok: true, exists: false, path: '/tmp/openwrt-firmware.bin', size: 0, sha256: '' }
  }
  if (action === 'check-update') return updateCheck
  if (action === 'download') return { ok: true, started: true }
  if (action === 'upload') {
    return { ok: true, path: '/tmp/openwrt-firmware.bin', size: 1024, filename: 'mock-firmware.bin' }
  }
  if (action === 'backup') {
    return { ok: true, path: '/tmp/openwrt-backup.tar.gz', size: 2048 }
  }
  if (action === 'restore' || action === 'upgrade') return { ok: true, started: true }
  return { ok: true }
}

function handleUciCgi(body) {
  const action = String(body.action || '')
  if (action === 'token') return { token: 'mock-token', expires_in: 120 }
  if (action === 'svc-list') return initList
  return { ok: true }
}

function handleCgi(pathname, query, body, method) {
  if (pathname === '/cgi-bin/modern-login') {
    return { sid: 'mock-session', expires: 3600 }
  }
  if (pathname === '/cgi-bin/modern-read') {
    const what = query.get('what') || 'leases'
    if (what === 'leases') {
      return {
        leases: leases.map((lease) => ({
          expiry: lease.expires,
          mac: lease.macaddr,
          ip: lease.ipaddr,
          hostname: lease.hostname
        }))
      }
    }
    if (what === 'hosts') {
      return { hosts: [{ ip: '192.0.2.103', names: ['mock-nas', 'nas'] }] }
    }
    if (what === 'resolv') {
      return { nameservers: ['198.51.100.1'], search: ['lan'] }
    }
    if (what === 'neighbors') return { neighbors }
    return { error: 'unknown action' }
  }
  if (pathname === '/cgi-bin/modern-data') {
    const what = query.get('what') || 'stations'
    if (what === 'stations') return { stations }
    if (what === 'logs') {
      return {
        lines: [
          'mock: uhttpd started',
          'mock: dnsmasq started',
          'mock: ShellCrash core v1.19.28-mock',
          'mock: firewall reloaded'
        ]
      }
    }
    return { error: 'unknown action' }
  }
  if (pathname === '/cgi-bin/modern-proxy') {
    if (method === 'POST') return { ok: true }
    const path = query.get('path') || '/version'
    if (path === '/version') return { meta: true, version: 'v1.19.28-mock' }
    if (path === '/configs') {
      return {
        port: 0,
        'socks-port': 0,
        'redir-port': 7892,
        'tproxy-port': 7893,
        'mixed-port': 7890,
        tun: { enable: false, stack: 'system' },
        mode: 'rule',
        'log-level': 'info'
      }
    }
    if (path === '/connections') {
      return {
        downloadTotal: 1234567,
        uploadTotal: 234567,
        memory: 48 * 1024 * 1024,
        connections
      }
    }
    if (path === '/proxies') return { proxies }
    if (path.startsWith('/proxies/')) {
      const rest = decodeURIComponent(path.slice('/proxies/'.length))
      if (rest.endsWith('/delay')) return { delay: 42 }
      const proxy = proxies[rest]
      return proxy || { name: rest, type: 'Direct' }
    }
    return { ok: true }
  }
  if (pathname === '/cgi-bin/modern-exec') return diagnosticResult(body)
  if (pathname === '/cgi-bin/modern-shellcrash') return handleShellCrash(body)
  if (pathname === '/cgi-bin/modern-pkg') return handlePackages(body)
  if (pathname === '/cgi-bin/modern-sysupgrade') return handleFirmware(body)
  if (pathname === '/cgi-bin/modern-uci') return handleUciCgi(body)
  return { error: 'unknown action' }
}

/* ------------------------------------------------------------------ *
 * Server
 * ------------------------------------------------------------------ */

const server = createServer(async (req, res) => {
  const url = new URL(req.url || '/', `http://${req.headers.host || `${HOST}:${PORT}`}`)
  const pathname = url.pathname

  if (pathname === '/health') {
    sendJson(res, 200, { ok: true, now: NOW })
    return
  }

  // The console probes this path to decide whether to offer the LuCI
  // emergency entry. A real LuCI answers 403 to an unauthenticated HEAD, so
  // that is the default here; MOCK_NO_LUCI=1 simulates a minimal image.
  if (pathname === '/cgi-bin/luci/') {
    if (process.env.MOCK_NO_LUCI === '1') {
      sendJson(res, 404, { error: 'not installed' })
    } else {
      res.writeHead(403, { 'Content-Type': 'text/html; charset=utf-8' })
      res.end('LuCI login required (mock)')
    }
    return
  }

  if (pathname === '/ubus') {
    const body = parseBody(await readBody(req))
    const payload = handleUbus(body)
    sendJson(res, 200, payload)
    return
  }

  if (pathname.startsWith('/cgi-bin/modern-')) {
    const body = parseBody(await readBody(req))
    const payload = handleCgi(pathname, url.searchParams, body, req.method || 'GET')
    sendJson(res, 200, payload)
    return
  }

  sendJson(res, 404, { error: 'not found' })
})

server.listen(PORT, HOST, () => {
  console.log(`mock router listening on http://${HOST}:${PORT}`)
  console.log(`  ROUTER_URL=http://${HOST}:${PORT} npm run dev`)
  console.log('  login with any username/password (mock only)')
})
