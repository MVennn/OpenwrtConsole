import type { IdentifyProbe } from '@/api/identify'
import { vendorOf } from './oui'

/** Coarse device classes the client list can show. */
export type DeviceKind =
  | 'phone'
  | 'tablet'
  | 'computer'
  | 'tv'
  | 'camera'
  | 'printer'
  | 'nas'
  | 'router'
  | 'console'
  | 'iot'
  | 'unknown'

export interface DeviceIdentity {
  kind: DeviceKind
  /** Short label shown in the type column. */
  label: string
  /** Curated OUI vendor, or 未知厂商. */
  vendor: string
  /** Model name when the device advertises one (gateway / TV). */
  model?: string
  /** Human-readable reasons, strongest first. */
  evidence: string[]
  confidence: 'high' | 'medium' | 'low'
}

export interface IdentifyInput {
  mac: string
  hostname: string
  band?: string
  ht?: boolean
  vht?: boolean
  he?: boolean
  probe?: IdentifyProbe | null
}

function result(
  input: IdentifyInput,
  kind: DeviceKind,
  label: string,
  confidence: DeviceIdentity['confidence'],
  evidence: string[],
  model?: string
): DeviceIdentity {
  return {
    kind,
    label,
    vendor: vendorOf(input.mac) ?? '未知厂商',
    model,
    evidence,
    confidence
  }
}

/**
 * Combines passive signals (OUI, hostname, Wi-Fi capabilities) with the
 * active probe. Active evidence wins; the passive fallback never claims more
 * than it can prove.
 */
export function identify(input: IdentifyInput): DeviceIdentity {
  const probe = input.probe
  const host = (input.hostname || '').toLowerCase()
  const ports = new Set(probe?.tcp ?? [])
  const mdns = (probe?.mdns ?? []).map((name) => name.toLowerCase())
  const hasMdns = (needle: string) => mdns.some((name) => name.includes(needle))
  const ssdp = probe?.ssdp
  const ssdpText = [ssdp?.server, ssdp?.st, ssdp?.usn]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()

  // Xiaomi devices answer with a model on their own protocols; that is the
  // strongest evidence available without a Mi Home token.
  if (probe?.gateway?.model) {
    return result(
      input,
      'iot',
      '智能家居',
      'high',
      [`小米网关应答：${probe.gateway.model}`],
      probe.gateway.model
    )
  }
  if (probe?.mitv?.model) {
    return result(
      input,
      'tv',
      '电视 / 盒子',
      'high',
      [`mitv 应答：${probe.mitv.model}`],
      probe.mitv.model
    )
  }
  if (probe?.miio) {
    return result(input, 'iot', '智能家居', 'high', [
      `miIO 握手成功（DID ${probe.miio.did}）`
    ])
  }

  if (hasMdns('_googlecast._tcp')) {
    return result(input, 'tv', '电视 / 盒子', 'high', ['mDNS: Google Cast'])
  }
  if (hasMdns('_airplay._tcp') || hasMdns('_raop._tcp')) {
    return result(input, 'tv', '电视 / 音箱', 'high', ['mDNS: AirPlay'])
  }
  if (
    hasMdns('_ipp._tcp') ||
    hasMdns('_printer._tcp') ||
    hasMdns('_pdl-datastream._tcp')
  ) {
    return result(input, 'printer', '打印机', 'high', ['mDNS: 打印服务'])
  }
  if (hasMdns('_hap._tcp')) {
    return result(input, 'iot', '智能家居', 'high', ['mDNS: HomeKit'])
  }
  if (hasMdns('_sonos._tcp') || hasMdns('_spotify-connect._tcp')) {
    return result(input, 'tv', '音箱', 'medium', ['mDNS: 音频服务'])
  }

  if (/printer|ipp/.test(ssdpText)) {
    return result(input, 'printer', '打印机', 'high', ['SSDP: 打印服务'])
  }
  if (/dial-multiscreen|mediarenderer|roku|chromecast|googletv/.test(ssdpText)) {
    return result(input, 'tv', '电视 / 盒子', 'high', ['SSDP: 媒体渲染器'])
  }
  if (/sonos/.test(ssdpText)) {
    return result(input, 'tv', '音箱', 'high', ['SSDP: Sonos'])
  }

  if (ports.has(62078)) {
    return result(input, 'phone', '手机', 'high', ['TCP 62078（iOS 同步）'])
  }
  if (ports.has(5555)) {
    return result(input, 'phone', '手机', 'medium', ['TCP 5555（Android ADB）'])
  }
  if (ports.has(9100) || ports.has(631) || ports.has(515) || ports.has(5357)) {
    return result(input, 'printer', '打印机', 'high', ['TCP 打印端口'])
  }
  if (ports.has(554) || ports.has(8554)) {
    return result(input, 'camera', '摄像头', 'high', ['TCP 554（RTSP）'])
  }
  if (ports.has(8008) || ports.has(8009)) {
    return result(input, 'tv', '电视 / 盒子', 'high', ['TCP 8009（Cast）'])
  }
  if (ports.has(32400)) {
    return result(input, 'nas', 'NAS', 'high', ['TCP 32400（Plex）'])
  }
  if (ports.has(445) || ports.has(3389) || ports.has(548) || ports.has(5900)) {
    return result(input, 'computer', '电脑', 'medium', ['TCP 文件 / 远程桌面端口'])
  }
  if (ports.has(1883) || ports.has(8883) || ports.has(6668)) {
    return result(input, 'iot', '智能家居', 'medium', ['TCP MQTT / 涂鸦端口'])
  }

  if (/iphone|ipod/.test(host)) {
    return result(input, 'phone', '手机', 'high', ['主机名含 iPhone'])
  }
  if (/ipad|tablet|\bpad\b|pad-|-pad|tab-/.test(host)) {
    return result(input, 'tablet', '平板', 'high', ['主机名含 Pad / Tablet'])
  }
  if (/macbook|imac|mac-mini/.test(host)) {
    return result(input, 'computer', '电脑', 'high', ['主机名含 Mac'])
  }
  if (/-pc$|^pc-|desktop-|laptop-|thinkpad|surface/.test(host)) {
    return result(input, 'computer', '电脑', 'high', ['主机名为 Windows 电脑'])
  }
  if (/printer|epson|canon|brother/.test(host)) {
    return result(input, 'printer', '打印机', 'medium', ['主机名含打印机型号'])
  }
  if (/camera|ipc|doorbell/.test(host)) {
    return result(input, 'camera', '摄像头', 'medium', ['主机名含摄像头关键词'])
  }
  if (/nas|diskstation|synology|qnap/.test(host)) {
    return result(input, 'nas', 'NAS', 'medium', ['主机名含 NAS 关键词'])
  }
  if (/esp_|esp32|tuya|shelly|sonoff/.test(host)) {
    return result(input, 'iot', '智能家居', 'medium', ['主机名为 IoT 模块'])
  }
  // Xiaomi-17-Pro / Redmi-K70 / MEIZU-20 are phone names; "xiaomi-plug" is
  // not matched because the pattern requires a model number after the dash.
  if (/xiaomi-?\d|redmi|poco|\bmi-?\d|meizu|oneplus|oppo|vivo|huawei|honor|pixel|android/.test(host)) {
    return result(input, 'phone', '手机', 'medium', ['主机名含手机型号'])
  }

  // A 2.4 GHz-only 802.11n client without VHT/HE is almost always a small
  // appliance rather than a phone or computer.
  if (input.ht && !input.vht && !input.he && (input.band === '2g' || !input.band)) {
    return result(input, 'iot', '智能家居', 'low', ['仅 2.4G / 802.11n，无 VHT/HE'])
  }

  const vendor = vendorOf(input.mac)
  return result(
    input,
    'unknown',
    '未知设备',
    'low',
    vendor ? [`厂商 OUI：${vendor}`] : ['没有可用的识别信号']
  )
}
