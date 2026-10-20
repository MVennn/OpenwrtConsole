export function formatBytes(bytes: number | undefined | null, decimals = 1): string {
  if (bytes === undefined || bytes === null || Number.isNaN(bytes)) return '—'
  if (bytes === 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB', 'TB', 'PB']
  const index = Math.min(Math.floor(Math.log(Math.abs(bytes)) / Math.log(1024)), units.length - 1)
  const value = bytes / 1024 ** index
  return `${value.toFixed(index === 0 ? 0 : decimals)} ${units[index]}`
}

/** Formats bits per second, the unit used by interface counters in the UI. */
export function formatBitrate(bytesPerSecond: number | undefined | null): string {
  if (bytesPerSecond === undefined || bytesPerSecond === null || Number.isNaN(bytesPerSecond)) {
    return '—'
  }
  const bits = Math.max(0, bytesPerSecond) * 8
  if (bits < 1000) return `${bits.toFixed(0)} bps`
  if (bits < 1000 ** 2) return `${(bits / 1000).toFixed(1)} Kbps`
  if (bits < 1000 ** 3) return `${(bits / 1000 ** 2).toFixed(1)} Mbps`
  return `${(bits / 1000 ** 3).toFixed(2)} Gbps`
}

/** iwinfo assoclist reports link rates in Kbit/s, e.g. 1200900 = 1.2 Gbps. */
export function formatLinkRate(kbps: number | undefined | null): string {
  if (!kbps) return '—'
  const mbps = kbps / 1000
  if (mbps >= 1000) return `${(mbps / 1000).toFixed(1)} Gbps`
  return `${mbps.toFixed(0)} Mbps`
}

export function formatUptime(seconds: number | undefined | null): string {
  if (!seconds || seconds < 0) return '—'
  const days = Math.floor(seconds / 86400)
  const hours = Math.floor((seconds % 86400) / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)

  if (days > 0) return `${days} 天 ${hours} 小时`
  if (hours > 0) return `${hours} 小时 ${minutes} 分`
  if (minutes > 0) return `${minutes} 分`
  return `${Math.floor(seconds)} 秒`
}

export function formatDurationShort(seconds: number | undefined | null): string {
  if (!seconds || seconds < 0) return '—'
  const days = Math.floor(seconds / 86400)
  const hours = Math.floor((seconds % 86400) / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  if (days > 0) return `${days}天${hours}时`
  if (hours > 0) return `${hours}时${minutes}分`
  return `${minutes}分`
}

export function formatAgo(seconds: number | undefined | null): string {
  if (seconds === undefined || seconds === null) return '—'
  if (seconds < 60) return '刚刚'
  if (seconds < 3600) return `${Math.floor(seconds / 60)} 分钟前`
  if (seconds < 86400) return `${Math.floor(seconds / 3600)} 小时前`
  return `${Math.floor(seconds / 86400)} 天前`
}

export function formatPercent(used: number, total: number, decimals = 0): number {
  if (!total) return 0
  return Math.min(100, Math.max(0, (used / total) * 100))
}

export function formatNumber(value: number | undefined | null, decimals = 0): string {
  if (value === undefined || value === null || Number.isNaN(value)) return '—'
  return value.toLocaleString('zh-CN', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals
  })
}

export function formatClock(timestamp: number | undefined | null): string {
  if (!timestamp) return '—'
  return new Date(timestamp * 1000).toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  })
}

export function signalLevel(dbm: number | undefined | null): number {
  if (dbm === undefined || dbm === null) return 0
  if (dbm >= -50) return 4
  if (dbm >= -60) return 3
  if (dbm >= -70) return 2
  return 1
}

export function signalLabel(dbm: number | undefined | null): string {
  switch (signalLevel(dbm)) {
    case 4:
      return '极佳'
    case 3:
      return '良好'
    case 2:
      return '一般'
    case 1:
      return '较弱'
    default:
      return '未知'
  }
}

export function bandLabel(band: string | undefined): string {
  if (!band) return '—'
  const value = band.toLowerCase()
  if (value.startsWith('2')) return '2.4 GHz'
  if (value.startsWith('5')) return '5 GHz'
  if (value.startsWith('6')) return '6 GHz'
  return band
}

export function encryptionLabel(encryption: string | undefined): string {
  if (!encryption || encryption === 'none') return '开放网络'
  if (encryption.includes('sae')) return 'WPA3'
  if (encryption.includes('psk2')) return 'WPA2'
  if (encryption.includes('psk')) return 'WPA'
  if (encryption.includes('wpa3')) return 'WPA3'
  return encryption.toUpperCase()
}

export function protoLabel(proto: string | undefined): string {
  const map: Record<string, string> = {
    static: '静态地址',
    dhcp: 'DHCP 客户端',
    dhcpv6: 'DHCPv6',
    pppoe: 'PPPoE',
    none: '无',
    relay: '中继'
  }
  return proto ? map[proto] || proto.toUpperCase() : '—'
}

export function ipv4Of(
  iface: { 'ipv4-address'?: Array<{ address: string; mask: number }> } | undefined
): string {
  const first = iface?.['ipv4-address']?.[0]
  return first ? `${first.address}/${first.mask}` : '—'
}

export function ipv6Of(
  iface: { 'ipv6-address'?: Array<{ address: string; mask: number }> } | undefined
): string {
  const first = iface?.['ipv6-address']?.[0]
  return first ? `${first.address}/${first.mask}` : '—'
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

/** Adds transparency to the hex colors used by the chart tokens. */
export function withAlpha(color: string, alpha: number): string {
  const hex = color.replace('#', '').trim()
  if (hex.length !== 6 || !/^[0-9a-f]{6}$/i.test(hex)) return color
  const r = Number.parseInt(hex.slice(0, 2), 16)
  const g = Number.parseInt(hex.slice(2, 4), 16)
  const b = Number.parseInt(hex.slice(4, 6), 16)
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}
