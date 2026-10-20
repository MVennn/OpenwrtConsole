<template>
  <div class="page">
    <PageHeader title="概览" description="路由器运行状态、网络流量与在线设备">
      <el-button :icon="RefreshCw" :loading="refreshing" @click="refresh">刷新</el-button>
      <el-button type="primary" @click="goNetworkConfig">网络配置</el-button>
    </PageHeader>

    <el-alert
      v-if="error"
      type="error"
      :title="error.message"
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
            <span class="hero-stat-label">在线设备</span>
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
          label="在线设备"
          :value="clients.length"
          :meta="`${wirelessCount} 台无线 · ${wiredCount} 台有线`"
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
                <div class="iface-ip mono truncate" :title="iface.interface === 'wan6' ? ipv6Of(iface) : ipv4Of(iface)">
                  {{ iface.interface === 'wan6' ? ipv6Of(iface) : ipv4Of(iface) }}
                </div>
              </div>
              <div v-if="iface.interface === 'wan6'" class="iface-traffic">
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
            <span>{{ wifiRows.length }} 个射频 · {{ wirelessCount }} 台终端</span>
            <span>无线流量 {{ formatBytes(wirelessTraffic) }}</span>
          </template>
        </PanelCard>

        <PanelCard title="最近客户端" subtitle="按信号强度排序">
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
            <span>有线 {{ wiredCount }} 台</span>
          </template>
        </PanelCard>

        <PanelCard title="代理状态" subtitle="ShellCrash / mihomo">
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
                <dt>当前节点</dt>
                <dd :title="proxy.node">{{ proxy.node || '—' }}</dd>
              </div>
              <div class="kv">
                <dt>活动连接</dt>
                <dd class="num">{{ proxy.connections }}</dd>
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
            <span>{{ proxy.groups }} 个策略组</span>
            <span class="mono">API 127.0.0.1:9999</span>
          </template>
        </PanelCard>
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
  import { computed, onBeforeUnmount, reactive, ref, watch } from 'vue'
  import { RouterLink, useRouter } from 'vue-router'
  import {
    Activity,
    ChevronRight,
    HardDrive,
    MemoryStick,
    RefreshCw,
    Router as RouterIcon,
    ShieldOff,
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
  import { usePolling } from '@/composables/usePolling'
  import { useRefreshSignal } from '@/composables/useRefresh'
  import { useTheme } from '@/composables/useTheme'
  import { api } from '@/api/openwrt'
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

  defineOptions({ name: 'DashboardView' })

  const { isDark } = useTheme()
  const refreshSignal = useRefreshSignal()
  const router = useRouter()

  const board = ref<BoardInfo>()
  const info = ref<SystemInfo>()
  const interfaces = ref<NetworkInterface[]>([])
  const devices = ref<NetworkDevice[]>([])
  const wireless = ref<Record<string, WirelessRadio>>({})
  const leases = ref<DhcpLease[]>([])
  const hints = ref<Record<string, HostHint>>({})
  const stations = ref<Record<string, Station[]>>({})
  const proxy = reactive({
    running: false,
    version: '',
    node: '',
    groups: 0,
    connections: 0,
    up: 0,
    down: 0
  })

  const traffic = ref<Array<{ time: number; rx: number; tx: number }>>([])
  let previous: { rx: number; tx: number; at: number } | null = null
  let proxyTick = 0
  let seedTimer: number | undefined

  const wan = computed(() => interfaces.value.find((item) => item.interface === 'wan'))
  const wan6 = computed(() => interfaces.value.find((item) => item.interface === 'wan6'))
  const lan = computed(() => interfaces.value.find((item) => item.interface === 'lan'))
  const wanUp = computed(() => Boolean(wan.value?.up))
  const wanIp = computed(() => (wan.value ? ipv4Of(wan.value) : '—'))
  const lanIp = computed(() => (lan.value ? ipv4Of(lan.value) : '—'))
  const wanGateway = computed(
    () => wan.value?.route?.find((route) => route.target === '0.0.0.0')?.nexthop || '—'
  )
  const wanDns = computed(() => wan.value?.['dns-server']?.join(', ') || '—')
  const shownInterfaces = computed(
    () => [wan.value, wan6.value, lan.value].filter(Boolean) as NetworkInterface[]
  )

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
    return devices.value.find((device) => device.name === iface.l3_device)?.stats
  }

  const wifiMeta = computed(() => buildWifiMeta(wireless.value))
  const clients = computed<ClientRow[]>(() =>
    mergeClients(leases.value, stations.value, hints.value, wifiMeta.value)
  )
  const wirelessCount = computed(() => countWirelessClients(stations.value))
  const wiredCount = computed(() => Math.max(0, clients.value.length - wirelessCount.value))

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
        up: radio.up && !radio.disabled
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
        const device = list.find((item) => item.name === 'wan')
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
    } catch {
      proxy.running = false
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

    const wanDevice = nextDevices.find((device) => device.name === 'wan')
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
  }, 5000)

  watch(refreshSignal, () => {
    void refresh()
    void loadProxy()
  })

  onBeforeUnmount(() => {
    if (seedTimer) window.clearTimeout(seedTimer)
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

  window.setTimeout(() => void loadProxy(), 1200)
</script>

<style scoped>
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
