<template>
  <div class="page">
    <PageHeader title="概览" description="路由器运行状态、网络流量与在线设备">
      <el-button :icon="RefreshCw" :loading="refreshing" @click="refresh">刷新</el-button>
      <el-button type="primary" @click="goNetworkConfig">网络配置</el-button>
    </PageHeader>

    <el-alert
      v-if="error"
      type="error"
      :title="error?.message || '操作失败'"
      :closable="false"
      show-icon
      class="error-alert"
    />

    <template v-if="loaded">
      <section class="card hero">
        <div class="hero-main">
          <div class="hero-icon">
            <RouterIcon :size="24" :stroke-width="1.8" />
          </div>
          <div class="hero-copy">
            <div class="hero-title-row">
              <h2 class="hero-title">{{ board?.hostname || 'OpenWrt' }}</h2>
              <StatusBadge
                :tone="wanUp ? 'success' : 'danger'"
                :label="wanUp ? '网络在线' : 'WAN 断开'"
              />
            </div>
            <p class="hero-sub">
              {{ board?.model || 'OpenWrt 路由器' }}
              <span class="hero-sep">·</span>
              {{ board?.release?.description || 'OpenWrt' }}
            </p>
          </div>
        </div>

        <div class="hero-stats">
          <div class="hero-stat">
            <span class="hero-stat-label">WAN 地址</span>
            <strong class="hero-stat-value mono">{{ wanIp }}</strong>
          </div>
          <div class="hero-stat">
            <span class="hero-stat-label">运行时间</span>
            <strong class="hero-stat-value">{{ formatUptime(info?.uptime) }}</strong>
          </div>
          <div class="hero-stat">
            <span class="hero-stat-label">局域网</span>
            <strong class="hero-stat-value mono">{{ lanIp }}</strong>
          </div>
          <div class="hero-stat">
            <span class="hero-stat-label">客户端</span>
            <strong class="hero-stat-value">{{ clients.length }}</strong>
          </div>
        </div>
      </section>

      <div class="grid grid-4">
        <StatCard
          label="系统负载"
          :value="loads[0].toFixed(2)"
          :meta="`5 分钟 ${loads[1].toFixed(2)} · 15 分钟 ${loads[2].toFixed(2)}`"
          badge="1 分钟"
          tone="neutral"
          :icon="Activity"
        />
        <StatCard
          label="内存使用"
          :value="memoryPercent"
          suffix="%"
          :meta="`已用 ${formatBytes(memoryUsed)} / ${formatBytes(info?.memory?.total)}`"
          :tone="memoryTone"
          :progress="memoryPercent"
          :icon="MemoryStick"
        />
        <StatCard
          label="存储空间"
          :value="storagePercent"
          suffix="%"
          :meta="`可用 ${formatBytes((info?.root?.avail || 0) * 1024)} / ${formatBytes((info?.root?.total || 0) * 1024)}`"
          :tone="storageTone"
          :progress="storagePercent"
          :icon="HardDrive"
        />
        <StatCard
          label="客户端"
          :value="clients.length"
          :meta="`${wirelessCount} 台无线 · ${otherCount} 台其他`"
          badge="实时"
          tone="brand"
          :icon="Users"
        />
      </div>

      <div class="grid grid-main">
        <PanelCard
          class="traffic-card"
          title="实时流量"
          subtitle="WAN 接口，最近 3 分钟"
        >
          <template #actions>
            <div class="traffic-legend">
              <span class="legend-item">
                <i class="legend-dot rx" />
                下行 <strong class="num">{{ formatBitrate(lastRx) }}</strong>
              </span>
              <span class="legend-item">
                <i class="legend-dot tx" />
                上行 <strong class="num">{{ formatBitrate(lastTx) }}</strong>
              </span>
            </div>
          </template>
          <BaseChart v-if="traffic.length > 1" :option="trafficOption" :height="264" />
          <div v-else class="chart-placeholder">
            <Activity :size="22" :stroke-width="1.6" />
            <p>正在采集流量样本…</p>
            <span>约 5 秒后显示实时曲线</span>
          </div>
        </PanelCard>

        <PanelCard title="网络接口" subtitle="WAN / IPv6 / LAN">
          <template #actions>
            <RouterLink class="link-btn" :to="{ name: 'network' }">
              全部
              <ChevronRight :size="14" />
            </RouterLink>
          </template>
          <div class="iface-list">
            <div v-for="iface in shownInterfaces" :key="iface.interface" class="iface-row">
              <span class="iface-dot" :class="{ up: iface.up }" />
              <div class="iface-main">
                <div class="iface-title">
                  {{ iface.interface.toUpperCase() }}
                  <span class="iface-proto">{{ protoLabel(iface.proto) }}</span>
                </div>
                <div class="iface-ip mono truncate" :title="iface.interface === wan6?.interface ? ipv6Of(iface) : ipv4Of(iface)">
                  {{ iface.interface === wan6?.interface ? ipv6Of(iface) : ipv4Of(iface) }}
                </div>
              </div>
              <div v-if="iface.interface === wan6?.interface" class="iface-traffic">
                <span class="iface-flag">IPv6 已启用</span>
              </div>
              <div v-else class="iface-traffic num">
                <span>↓ {{ formatBytes(deviceStats(iface)?.rx_bytes) }}</span>
                <span>↑ {{ formatBytes(deviceStats(iface)?.tx_bytes) }}</span>
              </div>
            </div>
          </div>
          <div class="iface-footer">
            <div class="iface-foot-item">
              <span>默认网关</span>
              <strong class="mono">{{ wanGateway }}</strong>
            </div>
            <div class="iface-foot-item">
              <span>DNS</span>
              <strong class="mono truncate" :title="wanDns">{{ wanDns }}</strong>
            </div>
          </div>
        </PanelCard>
      </div>

      <div class="grid grid-3">
        <PanelCard title="无线网络" subtitle="SSID 与频段">
          <template #actions>
            <RouterLink class="link-btn" :to="{ name: 'wireless' }">
              管理
              <ChevronRight :size="14" />
            </RouterLink>
          </template>
          <div v-if="wifiRows.length" class="wifi-list">
            <div v-for="row in wifiRows" :key="row.key" class="wifi-row">
              <span class="wifi-band">{{ bandLabel(row.band) }}</span>
              <div class="wifi-main">
                <div class="wifi-ssid truncate">{{ row.ssid }}</div>
                <div class="wifi-meta">
                  信道 {{ row.channel }} · {{ row.htmode }} · {{ row.clients }} 台
                </div>
              </div>
              <StatusBadge :tone="row.up ? 'success' : 'neutral'" :label="row.up ? '开启' : '关闭'" />
            </div>
          </div>
          <EmptyState v-else title="未发现无线接口" description="路由器可能没有启用 Wi-Fi。" />
          <template #footer>
            <span>{{ radioCount }} 个射频 · {{ wifiRows.length }} 个 SSID · {{ wirelessCount }} 台终端</span>
            <span>无线流量 {{ formatBytes(wirelessTraffic) }}</span>
          </template>
        </PanelCard>

        <PanelCard title="客户端" subtitle="无线优先，按信号排序">
          <template #actions>
            <RouterLink class="link-btn" :to="{ name: 'clients' }">
              全部
              <ChevronRight :size="14" />
            </RouterLink>
          </template>
          <div v-if="recentClients.length" class="client-list">
            <div v-for="client in recentClients" :key="client.mac" class="client-row">
              <span class="client-avatar">{{ initialOf(client.hostname) }}</span>
              <div class="client-main">
                <div class="client-name truncate">{{ client.hostname }}</div>
                <div class="client-meta mono">{{ client.ip }}</div>
              </div>
              <div class="client-side">
                <span class="client-type">{{ client.wireless ? client.bandLabel : '有线' }}</span>
                <SignalBars v-if="client.wireless" :level="signalLevel(client.signal)" :dbm="client.signal" />
              </div>
            </div>
          </div>
          <EmptyState v-else title="暂无在线设备" description="有新设备连接后会显示在这里。" />
          <template #footer>
            <span>无线 {{ wirelessCount }} 台</span>
            <span>其他 {{ otherCount }} 台</span>
          </template>
        </PanelCard>

        <PanelCard title="代理状态" subtitle="ShellCrash">
          <template #actions>
            <RouterLink class="link-btn" :to="{ name: 'proxy' }">
              详情
              <ChevronRight :size="14" />
            </RouterLink>
          </template>
          <div v-if="proxy.running" class="proxy-block">
            <div class="proxy-head">
              <StatusBadge tone="success" label="运行中" />
              <span class="proxy-version mono">{{ proxy.version }}</span>
            </div>
            <dl class="kv-grid proxy-kv">
              <div class="kv">
                <dt>当前出口</dt>
                <dd :title="proxy.node">{{ proxy.node || '—' }}</dd>
              </div>
              <div class="kv">
                <dt>出口延迟</dt>
                <dd class="num" :title="proxyDelayTitle">{{ proxyDelayText }}</dd>
              </div>
              <div class="kv">
                <dt>活动连接</dt>
                <dd class="num">{{ proxy.connections }}</dd>
              </div>
              <div class="kv">
                <dt>策略组</dt>
                <dd class="num">{{ proxy.groups }}</dd>
              </div>
              <div class="kv">
                <dt>上传总量</dt>
                <dd class="num">{{ formatBytes(proxy.up) }}</dd>
              </div>
              <div class="kv">
                <dt>下载总量</dt>
                <dd class="num">{{ formatBytes(proxy.down) }}</dd>
              </div>
            </dl>
          </div>
          <EmptyState
            v-else
            :icon="ShieldOff"
            title="未检测到代理服务"
            description="ShellCrash 未运行，或 API 端口不可达。"
          />
          <template #footer>
            <span>延迟每分钟探测一次</span>
            <span class="mono">API 127.0.0.1:{{ controllerPort }}</span>
          </template>
        </PanelCard>
      </div>

      <div class="grid grid-main">
        <ProxyShellCrashCard :status="shellCrash.status" :crash="shellCrash.crash" />

        <div class="side-stack">
          <StatCard
            label="核心运行时长"
            :value="coreUptime"
            :meta="coreVersion ? `核心 ${coreVersion}` : '未读取到核心版本'"
            :icon="Timer"
            tone="neutral"
          />
          <StatCard
            label="开机自启"
            :value="autostartText"
            :meta="autostartMeta"
            :icon="Power"
            :tone="autostartTone"
          />
        </div>
      </div>
    </template>

    <div v-else class="card">
      <div class="card-body">
        <el-skeleton :rows="6" animated />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
  import { computed, onBeforeUnmount, onMounted, reactive, ref, shallowRef, watch } from 'vue'
  import { RouterLink, useRouter } from 'vue-router'
  import {
    Activity,
    ChevronRight,
    HardDrive,
    MemoryStick,
    Power,
    RefreshCw,
    Router as RouterIcon,
    ShieldOff,
    Timer,
    Users
  } from 'lucide-vue-next'
  import type { EChartsCoreOption } from 'echarts/core'
  import PageHeader from '@/components/PageHeader.vue'
  import PanelCard from '@/components/PanelCard.vue'
  import StatCard from '@/components/StatCard.vue'
  import StatusBadge from '@/components/StatusBadge.vue'
  import SignalBars from '@/components/SignalBars.vue'
  import EmptyState from '@/components/EmptyState.vue'
  import BaseChart from '@/components/BaseChart.vue'
  import ProxyShellCrashCard from '@/components/proxy-ShellCrashCard.vue'
  import { usePolling } from '@/composables/usePolling'
  import { useRefreshSignal } from '@/composables/useRefresh'
  import { useTheme } from '@/composables/useTheme'
  import { api } from '@/api/openwrt'
  import { fetchProxyDelay } from '@/api/proxyActions'
  import {
    fetchShellCrashCrash,
    fetchShellCrashStatus,
    type ShellCrashCrashResult,
    type ShellCrashStatus
  } from '@/api/shellcrashConfig'
  import type {
    BoardInfo,
    DhcpLease,
    HostHint,
    NetworkDevice,
    NetworkInterface,
    Station,
    SystemInfo,
    WirelessRadio
  } from '@/api/types'
  import {
    bandLabel,
    formatBitrate,
    formatBytes,
    formatUptime,
    ipv4Of,
    ipv6Of,
    protoLabel,
    signalLevel,
    withAlpha
  } from '@/utils/format'
  import {
    buildWifiMeta,
    countWirelessClients,
    mergeClients,
    type ClientRow
  } from '@/utils/clients'
  import { pickPrimaryGroup, resolveNode, isProxyGroup } from '@/utils/proxy'
  import { pickWanInterfaces, wanDeviceName } from '@/utils/network'

  defineOptions({ name: 'DashboardView' })

  const { isDark } = useTheme()
  const refreshSignal = useRefreshSignal()
  const router = useRouter()

  // The ubus payloads are replaced wholesale on every poll, so a shallow ref
  // is enough and keeps Vue from deep-proxying every nested object.
  const board = shallowRef<BoardInfo>()
  const info = shallowRef<SystemInfo>()
  const interfaces = shallowRef<NetworkInterface[]>([])
  const devices = shallowRef<NetworkDevice[]>([])
  const wireless = shallowRef<Record<string, WirelessRadio>>({})
  const leases = shallowRef<DhcpLease[]>([])
  const hints = shallowRef<Record<string, HostHint>>({})
  const stations = shallowRef<Record<string, Station[]>>({})
  const proxy = reactive({
    running: false,
    version: '',
    node: '',
    groups: 0,
    connections: 0,
    up: 0,
    down: 0,
    /** The measured latency of the exit node, null when it is unknown. */
    delay: null as number | null,
    /** When the latency was measured the last time. */
    delayAt: 0
  })

  /** The ShellCrash service and the guardian, read through the root CGI. */
  const shellCrash = reactive({
    status: null as ShellCrashStatus | null,
    crash: null as ShellCrashCrashResult | null
  })

  const traffic = ref<Array<{ time: number; rx: number; tx: number }>>([])
  let previous: { rx: number; tx: number; at: number } | null = null
  let proxyTick = 0
  let seedTimer: number | undefined
  let proxySeedTimer: number | undefined
  let delayProbe = false
  let shellCrashTick = 0

  /** The latency probe of the overview runs at most once a minute. */
  const DELAY_TTL = 60_000

  /** WAN / WAN6 / LAN resolved by role, not by a hard-coded interface name. */
  const pickedInterfaces = computed(() => pickWanInterfaces(interfaces.value))
  const wan = computed(() => pickedInterfaces.value.wan)
  const wan6 = computed(() => pickedInterfaces.value.wan6)
  const lan = computed(() => pickedInterfaces.value.lan)
  const wanUp = computed(() => Boolean(wan.value?.up))
  const wanIp = computed(() => (wan.value ? ipv4Of(wan.value) : '—'))
  const lanIp = computed(() => (lan.value ? ipv4Of(lan.value) : '—'))
  const wanGateway = computed(
    () => wan.value?.route?.find((route) => route.target === '0.0.0.0')?.nexthop || '—'
  )
  const wanDns = computed(() => wan.value?.['dns-server']?.join(', ') || '—')
  const shownInterfaces = computed(() => {
    const seen = new Set<string>()
    return [wan.value, wan6.value, lan.value].filter((iface): iface is NetworkInterface => {
      if (!iface || seen.has(iface.interface)) return false
      seen.add(iface.interface)
      return true
    })
  })
  const radioCount = computed(() => Object.keys(wireless.value).length)
  /** The controller port of the running core, 9999 is the ShellCrash default. */
  const controllerPort = computed(() => shellCrash.status?.ports?.controller || 9999)

  const loads = computed(() => (info.value?.load ?? [0, 0, 0]).map((value) => value / 65536))
  const memoryUsed = computed(() => {
    const memory = info.value?.memory
    return memory ? memory.total - memory.available : 0
  })
  const memoryPercent = computed(() => {
    const memory = info.value?.memory
    return memory?.total ? Math.round((memoryUsed.value / memory.total) * 100) : 0
  })
  const storagePercent = computed(() => {
    const root = info.value?.root
    return root?.total ? Math.round((root.used / root.total) * 100) : 0
  })
  const memoryTone = computed(() =>
    memoryPercent.value >= 90 ? 'danger' : memoryPercent.value >= 75 ? 'warning' : 'brand'
  )
  const storageTone = computed(() =>
    storagePercent.value >= 90 ? 'danger' : storagePercent.value >= 75 ? 'warning' : 'brand'
  )

  function deviceStats(iface: NetworkInterface | undefined) {
    if (!iface) return undefined
    const name = wanDeviceName(iface)
    return devices.value.find((device) => device.name === name)?.stats
  }

  /**
   * The netdev that carries the WAN traffic, e.g. `pppoe-wan` behind `wan`.
   * A device without the logical WAN interface still matches the stock names.
   */
  function findWanDevice(list: NetworkDevice[]): NetworkDevice | undefined {
    const name = wanDeviceName(wan.value)
    return (
      (name ? list.find((device) => device.name === name) : undefined) ??
      list.find((device) => device.name === 'wan') ??
      list.find((device) => device.name === 'pppoe-wan')
    )
  }

  const wifiMeta = computed(() => buildWifiMeta(wireless.value))
  const clients = computed<ClientRow[]>(() =>
    mergeClients(leases.value, stations.value, hints.value, wifiMeta.value)
  )
  const wirelessCount = computed(() => countWirelessClients(stations.value))
  const otherCount = computed(() => Math.max(0, clients.value.length - wirelessCount.value))

  const recentClients = computed(() =>
    [...clients.value]
      .sort((a, b) => {
        if (a.wireless !== b.wireless) return a.wireless ? -1 : 1
        return (b.signal ?? -999) - (a.signal ?? -999)
      })
      .slice(0, 5)
  )

  interface WifiRow {
    key: string
    band: string
    ssid: string
    ifname: string
    channel: string
    htmode: string
    clients: number
    up: boolean
  }

  const wifiRows = computed<WifiRow[]>(() =>
    Object.entries(wireless.value).flatMap(([radioKey, radio]) =>
      radio.interfaces.map((iface) => ({
        key: `${radioKey}-${iface.section}`,
        band: radio.config?.band || '',
        ssid: iface.config?.ssid || '未命名网络',
        ifname: iface.ifname || '',
        channel: radio.config?.channel || '—',
        htmode: radio.config?.htmode || '',
        clients: stations.value[iface.ifname]?.length || 0,
        up: radio.up && !radio.disabled && !iface.config?.disabled
      }))
    )
  )

  const wirelessTraffic = computed(() =>
    wifiRows.value.reduce((sum, row) => {
      const stats = devices.value.find((device) => device.name === row.ifname)?.stats
      return sum + (stats?.rx_bytes || 0) + (stats?.tx_bytes || 0)
    }, 0)
  )

  const lastRx = computed(() => traffic.value[traffic.value.length - 1]?.rx ?? 0)
  const lastTx = computed(() => traffic.value[traffic.value.length - 1]?.tx ?? 0)

  /** The measured latency of the exit node. */
  const proxyDelayText = computed(() =>
    typeof proxy.delay === 'number' ? `${proxy.delay} ms` : '—'
  )

  const proxyDelayTitle = computed(() =>
    proxy.delay === null
      ? '延迟尚未探测或节点没有响应'
      : `出口节点 ${proxy.node || '—'} 的延迟`
  )

  /** The uptime of the mihomo core. */
  const coreUptime = computed(() => {
    const uptime = shellCrash.crash?.uptime
    if (!uptime) return '—'
    return formatUptime(uptime)
  })

  const coreVersion = computed(() => shellCrash.crash?.core_version || '')

  const autostartText = computed(() => {
    if (!shellCrash.status) return '—'
    return shellCrash.status.autostart ? '已开启' : '已关闭'
  })

  const autostartMeta = computed(() => {
    if (!shellCrash.status) return '未读取到 ShellCrash 状态'
    return shellCrash.status.autostart
      ? '路由器重启后自动启动核心'
      : '需要手动启动 ShellCrash'
  })

  const autostartTone = computed<'brand' | 'success' | 'warning' | 'danger' | 'neutral'>(() => {
    if (!shellCrash.status) return 'neutral'
    return shellCrash.status.autostart ? 'success' : 'warning'
  })

  function pushTraffic(rx: number, tx: number): void {
    const now = Date.now()
    if (previous) {
      const elapsed = (now - previous.at) / 1000
      if (elapsed > 0.4) {
        traffic.value.push({
          time: now,
          rx: Math.max(0, (rx - previous.rx) / elapsed),
          tx: Math.max(0, (tx - previous.tx) / elapsed)
        })
        if (traffic.value.length > 45) traffic.value.shift()
      }
    }
    previous = { rx, tx, at: now }
  }

  // The first sample only establishes a baseline. Take extra samples quickly
  // so the chart renders within a couple of seconds instead of waiting for
  // the next polling tick.
  function scheduleSeed(): void {
    if (traffic.value.length >= 2 || seedTimer !== undefined) return
    seedTimer = window.setTimeout(async () => {
      seedTimer = undefined
      try {
        const list = await api.networkDevices()
        const device = findWanDevice(list)
        if (device?.stats) pushTraffic(device.stats.rx_bytes, device.stats.tx_bytes)
      } catch {
        // The regular polling tick will retry.
      }
      scheduleSeed()
    }, 1200)
  }

  async function loadProxy(): Promise<void> {
    try {
      const [version, connections, proxies] = await Promise.all([
        api.shellcrash.version(),
        api.shellcrash.connections(),
        api.shellcrash.proxies()
      ])
      proxy.running = Boolean(version?.version)
      proxy.version = version?.version || ''
      proxy.connections = connections?.connections?.length || 0
      proxy.up = connections?.uploadTotal || 0
      proxy.down = connections?.downloadTotal || 0

      const primary = pickPrimaryGroup(proxies)
      proxy.node = primary ? resolveNode(proxies, primary.now) : ''
      proxy.groups = Object.values(proxies).filter(isProxyGroup).length
      probeProxyDelay(proxy.node)
    } catch {
      proxy.running = false
    }
  }

  /**
   * Measures the latency of the exit node.
   *
   * The probe keeps a mihomo request open for several seconds, so it runs at
   * most once a minute and never in parallel with itself.
   */
  function probeProxyDelay(node: string): void {
    if (!node || delayProbe) return
    if (Date.now() - proxy.delayAt < DELAY_TTL) return
    delayProbe = true
    void fetchProxyDelay(node)
      .then((delay) => {
        proxy.delay = typeof delay === 'number' ? delay : null
        proxy.delayAt = Date.now()
      })
      .catch(() => {
        proxy.delay = null
        proxy.delayAt = Date.now()
      })
      .finally(() => {
        delayProbe = false
      })
  }

  /** Reads the state of the ShellCrash service and of the guardian. */
  async function loadShellCrash(): Promise<void> {
    try {
      const [status, crash] = await Promise.all([
        fetchShellCrashStatus(),
        fetchShellCrashCrash()
      ])
      shellCrash.status = status
      shellCrash.crash = crash
    } catch {
      // The card shows the empty state, the next round retries.
    }
  }

  const { loaded, error, refreshing, refresh } = usePolling(async () => {
    const [nextBoard, nextInfo, nextInterfaces, nextDevices, nextWireless, nextLeases, nextHints] =
      await Promise.all([
        api.board(),
        api.systemInfo(),
        api.interfaces(),
        api.networkDevices(),
        api.wireless(),
        api.dhcpLeases(),
        api.hostHints()
      ])

    board.value = nextBoard
    info.value = nextInfo
    interfaces.value = nextInterfaces
    devices.value = nextDevices
    wireless.value = nextWireless
    leases.value = nextLeases
    hints.value = nextHints

    const wanDevice = findWanDevice(nextDevices)
    if (wanDevice?.stats) {
      pushTraffic(wanDevice.stats.rx_bytes, wanDevice.stats.tx_bytes)
    }

    // The first sample only establishes a baseline. Take extra ones quickly
    // so the chart appears immediately instead of waiting for the next poll.
    scheduleSeed()

    try {
      stations.value = await api.stations()
    } catch {
      stations.value = {}
    }

    proxyTick += 1
    if (proxyTick === 1 || proxyTick % 3 === 0) await loadProxy()

    // The ShellCrash state changes rarely, so it is read every 30 seconds.
    shellCrashTick += 1
    if (shellCrashTick === 1 || shellCrashTick % 6 === 0) await loadShellCrash()
  }, 5000)

  watch(refreshSignal, () => {
    // A manual refresh also asks for a fresh latency measurement.
    proxy.delayAt = 0
    void refresh()
    void loadProxy()
    void loadShellCrash()
  })

  onMounted(() => {
    // The first full poll waits for seven parallel calls; seed the proxy card
    // earlier so it does not sit in the empty state for a whole round.
    proxySeedTimer = window.setTimeout(() => void loadProxy(), 1200)
  })

  onBeforeUnmount(() => {
    if (seedTimer) window.clearTimeout(seedTimer)
    if (proxySeedTimer) window.clearTimeout(proxySeedTimer)
  })

  const trafficOption = computed<EChartsCoreOption>(() => {
    const styles = getComputedStyle(document.documentElement)
    const rxColor = styles.getPropertyValue('--chart-rx').trim()
    const txColor = styles.getPropertyValue('--chart-tx').trim()
    const gridColor = styles.getPropertyValue('--chart-grid').trim()
    const textColor = styles.getPropertyValue('--text-muted').trim()
    const surface = styles.getPropertyValue('--surface').trim()
    const border = styles.getPropertyValue('--border').trim()
    void isDark.value

    return {
      animation: false,
      grid: { top: 18, right: 30, bottom: 6, left: 6, containLabel: true },
      tooltip: {
        trigger: 'axis',
        backgroundColor: surface,
        borderColor: border,
        borderWidth: 1,
        padding: [8, 10],
        textStyle: { color: styles.getPropertyValue('--text').trim(), fontSize: 12 },
        valueFormatter: (value: unknown) => formatBitrate(Number(value))
      },
      xAxis: {
        type: 'category',
        boundaryGap: false,
        data: traffic.value.map((point) =>
          new Date(point.time).toLocaleTimeString('zh-CN', {
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
            hour12: false
          })
        ),
        axisLine: { show: false },
        axisTick: { show: false },
        axisLabel: { color: textColor, fontSize: 11, hideOverlap: true }
      },
      yAxis: {
        type: 'value',
        splitNumber: 4,
        axisLabel: {
          color: textColor,
          fontSize: 11,
          formatter: (value: number) => formatBitrate(value)
        },
        splitLine: { lineStyle: { color: gridColor } }
      },
      series: [
        {
          name: '下行',
          type: 'line',
          smooth: 0.3,
          symbol: 'none',
          data: traffic.value.map((point) => point.rx),
          lineStyle: { width: 2, color: rxColor },
          areaStyle: {
            color: {
              type: 'linear',
              x: 0,
              y: 0,
              x2: 0,
              y2: 1,
              colorStops: [
                { offset: 0, color: withAlpha(rxColor, 0.22) },
                { offset: 1, color: withAlpha(rxColor, 0) }
              ]
            }
          }
        },
        {
          name: '上行',
          type: 'line',
          smooth: 0.3,
          symbol: 'none',
          data: traffic.value.map((point) => point.tx),
          lineStyle: { width: 2, color: txColor },
          areaStyle: {
            color: {
              type: 'linear',
              x: 0,
              y: 0,
              x2: 0,
              y2: 1,
              colorStops: [
                { offset: 0, color: withAlpha(txColor, 0.16) },
                { offset: 1, color: withAlpha(txColor, 0) }
              ]
            }
          }
        }
      ]
    }
  })

  function initialOf(name: string): string {
    const trimmed = name.trim()
    return trimmed ? trimmed.slice(0, 1).toUpperCase() : '?'
  }

  function goNetworkConfig(): void {
    void router.push({ name: 'config-network' })
  }
</script>

<style scoped>
  /* Element Plus 给相邻按钮加了 12px 左边距，和外层 flex 的 gap 叠加后
     同一行的按钮会被拉到 20px 间距；这里把间距统一交回给 gap 控制。 */
  .el-button + .el-button {
    margin-left: 0;
  }

  .error-alert {
    border-radius: var(--radius-lg);
  }

  .hero {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-6);
    padding: 22px 24px;
  }

  .hero-main {
    display: flex;
    align-items: center;
    gap: 14px;
    min-width: 0;
  }

  .hero-icon {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 48px;
    height: 48px;
    flex-shrink: 0;
    color: var(--brand-text);
    background: var(--brand-soft);
    border-radius: var(--radius-lg);
  }

  .hero-copy {
    min-width: 0;
  }

  .hero-title-row {
    display: flex;
    align-items: center;
    gap: 10px;
  }

  .hero-title {
    color: var(--text);
    font-size: 18px;
    font-weight: 600;
    line-height: 1.3;
    letter-spacing: -0.01em;
  }

  .hero-sub {
    margin-top: 3px;
    color: var(--text-muted);
    font-size: var(--text-xs);
    line-height: 1.5;
  }

  .hero-sep {
    margin: 0 4px;
    color: var(--text-faint);
  }

  .hero-stats {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, auto));
    gap: 34px;
  }

  .hero-stat {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .hero-stat-label {
    color: var(--text-muted);
    font-size: 11.5px;
  }

  .hero-stat-value {
    color: var(--text);
    font-size: var(--text-sm);
    font-weight: 500;
    white-space: nowrap;
  }

  .traffic-legend {
    display: flex;
    align-items: center;
    gap: 14px;
    color: var(--text-muted);
    font-size: 11.5px;
  }

  .legend-item {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    white-space: nowrap;
  }

  .legend-item strong {
    color: var(--text);
    font-weight: 500;
  }

  .legend-dot {
    width: 7px;
    height: 7px;
    border-radius: 50%;
  }

  .legend-dot.rx {
    background: var(--chart-rx);
  }

  .legend-dot.tx {
    background: var(--chart-tx);
  }

  .chart-placeholder {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 3px;
    height: 264px;
    color: var(--text-muted);
    font-size: var(--text-xs);
    border: 1px dashed var(--border-strong);
    border-radius: var(--radius-md);
  }

  .chart-placeholder svg {
    margin-bottom: 4px;
    color: var(--text-faint);
  }

  .chart-placeholder p {
    color: var(--text-secondary);
    font-size: var(--text-sm);
    font-weight: 500;
  }

  .iface-list {
    display: flex;
    flex-direction: column;
  }

  .iface-row {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 11px 0;
    border-bottom: 1px solid var(--border);
  }

  .iface-row:first-child {
    padding-top: 2px;
  }

  .iface-row:last-child {
    padding-bottom: 2px;
    border-bottom: 0;
  }

  .iface-dot {
    width: 7px;
    height: 7px;
    flex-shrink: 0;
    background: var(--text-faint);
    border-radius: 50%;
  }

  .iface-dot.up {
    background: var(--success);
  }

  .iface-main {
    flex: 1;
    min-width: 0;
  }

  .iface-title {
    display: flex;
    align-items: center;
    gap: 7px;
    color: var(--text);
    font-size: var(--text-sm);
    font-weight: 600;
  }

  .iface-proto {
    padding: 1px 6px;
    color: var(--text-muted);
    font-size: 10.5px;
    font-weight: 500;
    background: var(--surface-2);
    border-radius: 4px;
  }

  .iface-ip {
    max-width: 190px;
    margin-top: 1px;
    color: var(--text-muted);
    font-size: 11.5px;
  }

  .iface-traffic {
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    gap: 1px;
    color: var(--text-muted);
    font-size: 11px;
  }

  .iface-flag {
    color: var(--text-muted);
    font-size: 10.5px;
    white-space: nowrap;
  }

  .iface-footer {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 8px 14px;
    margin-top: 14px;
    padding-top: 12px;
    border-top: 1px solid var(--border);
  }

  .iface-foot-item {
    display: flex;
    flex-direction: column;
    gap: 1px;
    min-width: 0;
  }

  .iface-foot-item span {
    color: var(--text-muted);
    font-size: 10.5px;
  }

  .iface-foot-item strong {
    overflow: hidden;
    color: var(--text);
    font-size: 11.5px;
    font-weight: 500;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .wifi-list,
  .client-list {
    display: flex;
    flex-direction: column;
  }

  .wifi-row {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 10px 0;
    border-bottom: 1px solid var(--border);
  }

  .wifi-row:first-child {
    padding-top: 2px;
  }

  .wifi-row:last-child {
    padding-bottom: 2px;
    border-bottom: 0;
  }

  .wifi-band {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 48px;
    height: 22px;
    flex-shrink: 0;
    color: var(--brand-text);
    font-size: 10.5px;
    font-weight: 600;
    background: var(--brand-soft);
    border-radius: 5px;
  }

  .wifi-main {
    flex: 1;
    min-width: 0;
  }

  .wifi-ssid {
    color: var(--text);
    font-size: var(--text-sm);
    font-weight: 500;
  }

  .wifi-meta {
    margin-top: 1px;
    color: var(--text-muted);
    font-size: 11px;
  }

  .client-row {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 9px 0;
    border-bottom: 1px solid var(--border);
  }

  .client-row:first-child {
    padding-top: 2px;
  }

  .client-row:last-child {
    padding-bottom: 2px;
    border-bottom: 0;
  }

  .client-avatar {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 30px;
    height: 30px;
    flex-shrink: 0;
    color: var(--text-secondary);
    font-size: 12px;
    font-weight: 600;
    background: var(--surface-2);
    border-radius: 50%;
  }

  .client-main {
    flex: 1;
    min-width: 0;
  }

  .client-name {
    color: var(--text);
    font-size: var(--text-sm);
    font-weight: 500;
  }

  .client-meta {
    margin-top: 1px;
    color: var(--text-muted);
    font-size: 11px;
  }

  .client-side {
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    gap: 3px;
  }

  .client-type {
    color: var(--text-muted);
    font-size: 10.5px;
  }

  .proxy-block {
    display: flex;
    flex-direction: column;
    gap: 14px;
  }

  .proxy-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  .proxy-version {
    color: var(--text-muted);
    font-size: 11.5px;
  }

  .proxy-kv {
    gap: 12px 18px;
  }

  /* The narrow column of the last row holds the two summary cards. */
  .side-stack {
    display: flex;
    flex-direction: column;
    gap: var(--space-4);
    min-width: 0;
  }

  /* A long value inside the narrow column must not widen the track. */
  .grid-main > * {
    min-width: 0;
  }

  @media (max-width: 1180px) {
    .hero {
      align-items: flex-start;
      flex-direction: column;
    }

    .hero-stats {
      width: 100%;
      grid-template-columns: repeat(4, minmax(0, 1fr));
      gap: 18px;
    }
  }

  @media (max-width: 900px) {
    .hero-stats {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  }

  @media (max-width: 640px) {
    .hero {
      padding: 18px 16px;
    }

    .hero-title-row {
      align-items: flex-start;
      flex-direction: column;
      gap: 5px;
    }

    .traffic-card :deep(.card-head) {
      flex-direction: column;
      gap: 8px;
    }

    .traffic-card :deep(.card-actions) {
      width: 100%;
    }

    .traffic-legend {
      gap: 14px;
    }
  }
</style>
