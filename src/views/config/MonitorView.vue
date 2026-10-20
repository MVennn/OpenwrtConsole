<template>
  <div class="page">
    <PageHeader title="监控与流量" description="资源曲线、接口速率与在线客户端的实时采样">
      <div class="range-group">
        <span class="range-label">历史窗口</span>
        <div class="range-switch" role="group" aria-label="历史窗口">
          <button
            v-for="option in MONITOR_RANGES"
            :key="option.key"
            type="button"
            class="range-chip"
            :class="{ active: range === option.key }"
            @click="range = option.key"
          >
            {{ option.label }}
          </button>
        </div>
      </div>
      <el-button :icon="RefreshCw" :loading="refreshing" @click="refresh">刷新</el-button>
    </PageHeader>

    <el-alert v-if="error" type="error" :title="error?.message || '操作失败'" :closable="false" show-icon />

    <template v-if="loaded">
      <div class="grid grid-4">
        <StatCard
          label="当前负载"
          :value="load1.toFixed(2)"
          :meta="`5 分钟 ${load5.toFixed(2)} · 15 分钟 ${load15.toFixed(2)}`"
          badge="1 分钟"
          tone="neutral"
          :icon="Activity"
        />
        <StatCard
          label="内存使用"
          :value="memory.percent"
          suffix="%"
          :meta="`已用 ${formatBytes(memory.used)} / ${formatBytes(memory.total)}`"
          :tone="memoryTone"
          :progress="memory.percent"
          :icon="MemoryStick"
        />
        <StatCard
          label="在线客户端"
          :value="clients.length"
          :meta="`${wirelessCount} 台无线 · ${wiredCount} 台有线`"
          badge="实时"
          tone="brand"
          :icon="Users"
        />
        <StatCard
          label="累计流量"
          :value="formatBytes(traffic.total)"
          :meta="`下行 ${formatBytes(traffic.rx)} · 上行 ${formatBytes(traffic.tx)}`"
          badge="自启动"
          tone="neutral"
          :icon="ArrowDownUp"
        />
      </div>

      <PanelCard
        title="资源曲线"
        :subtitle="`${rangeLabel}窗口 · 每 ${SAMPLE_INTERVAL / 1000} 秒采样一次`"
      >
        <template #actions>
          <div class="metric-switch" role="group" aria-label="指标">
            <button
              v-for="option in MONITOR_METRICS"
              :key="option.key"
              type="button"
              class="metric-chip"
              :class="{ active: metric === option.key }"
              @click="metric = option.key"
            >
              {{ option.label }}
            </button>
          </div>
        </template>

        <div class="series-legend">
          <span v-if="metric === 'cpu'" class="legend-item">
            <i class="legend-dot cpu" />
            CPU 占用（1 分钟负载折算）
            <strong class="num">{{ cpuNow }}%</strong>
          </span>
          <span v-else-if="metric === 'memory'" class="legend-item">
            <i class="legend-dot mem" />
            内存使用
            <strong class="num">{{ memory.percent }}%</strong>
          </span>
          <template v-else>
            <span class="legend-item">
              <i class="legend-dot rx" />
              下行
              <strong class="num">{{ formatBitrate(netRate.rx) }}</strong>
            </span>
            <span class="legend-item">
              <i class="legend-dot tx" />
              上行
              <strong class="num">{{ formatBitrate(netRate.tx) }}</strong>
            </span>
          </template>
          <span class="legend-hint">{{ metricHint }}</span>
        </div>

        <BaseChart v-if="resourcePoints.length > 1" :option="resourceOption" :height="280" />
        <div v-else class="chart-placeholder">
          <Activity :size="22" :stroke-width="1.6" />
          <p>正在采集资源样本…</p>
          <span>约 6 秒后显示曲线</span>
        </div>

        <template #footer>
          <span>{{ resourcePoints.length }} 个采样点</span>
          <span>{{ metricHint }}</span>
        </template>
      </PanelCard>

      <PanelCard title="接口流量" :subtitle="`${interfaceRows.length} 个接口 · 实时速率与累计收发`">
        <template #actions>
          <span class="meta-label">{{ rangeLabel }}趋势</span>
        </template>

        <div v-if="interfaceRows.length" class="iface-list">
          <div v-for="row in interfaceRows" :key="row.name" class="iface-row">
            <span class="iface-dot" :class="{ up: row.up }" />
            <div class="iface-name">
              <div class="iface-name-main">
                <span class="iface-title">{{ row.name }}</span>
                <span class="iface-kind">{{ row.wireless ? '无线' : '有线' }}</span>
              </div>
              <span v-if="row.address" class="iface-address mono truncate">{{ row.address }}</span>
            </div>
            <div class="iface-rate num">
              <span class="rx">↓ {{ formatBitrate(row.rxRate) }}</span>
              <span class="tx">↑ {{ formatBitrate(row.txRate) }}</span>
            </div>
            <MonSparkline
              class="iface-spark"
              :values="row.spark"
              tone="rx"
              :width="120"
              :height="30"
              :label="`${row.name} 速率趋势`"
            />
            <div class="iface-total num">
              <span>↓ {{ formatBytes(row.rxBytes) }}</span>
              <span>↑ {{ formatBytes(row.txBytes) }}</span>
            </div>
          </div>
        </div>
        <EmptyState
          v-else
          :icon="Network"
          title="没有可用的接口"
          description="路由器没有上报任何接口计数器。"
        />

        <template #footer>
          <span>累计数据自路由器启动以来</span>
          <span>曲线为下行与上行速率之和</span>
        </template>
      </PanelCard>

      <PanelCard
        title="接口历史速率"
        :subtitle="`${rangeLabel}窗口 · 收发速率曲线`"
      >
        <template #actions>
          <span class="meta-label">{{ interfaceRows.length }} 个接口</span>
        </template>

        <MonitorInterfaceRateChart :rows="interfaceStats" :window-ms="rangeMs" />

        <template #footer>
          <span>样本来自浏览器本地采样，切换页面会重新开始</span>
          <span>纵轴为比特每秒</span>
        </template>
      </PanelCard>

      <PanelCard title="客户端" subtitle="点击设备查看该设备的速率曲线">
        <template #actions>
          <span class="count-badge">{{ clients.length }}</span>
        </template>

        <div v-if="clients.length" class="desktop-only">
          <el-table :data="clients" style="width: 100%" @row-click="handleRowClick">
            <el-table-column label="设备" min-width="190">
              <template #default="{ row }">
                <div class="device-cell">
                  <span class="device-avatar">{{ initialOf(row.hostname) }}</span>
                  <div class="device-copy">
                    <div class="table-primary truncate">{{ row.hostname }}</div>
                    <div class="table-sub mono">{{ row.mac }}</div>
                  </div>
                </div>
              </template>
            </el-table-column>
            <el-table-column label="IP 地址" min-width="130">
              <template #default="{ row }">
                <span class="mono table-mono">{{ row.ip }}</span>
              </template>
            </el-table-column>
            <el-table-column label="接入方式" min-width="110">
              <template #default="{ row }">
                <el-tag v-if="row.wireless" size="small" type="success">
                  {{ row.bandLabel || '无线' }}
                </el-tag>
                <el-tag v-else size="small" type="info">有线</el-tag>
              </template>
            </el-table-column>
            <el-table-column label="信号" min-width="140">
              <template #default="{ row }">
                <div v-if="row.wireless" class="signal-cell">
                  <SignalBars :level="signalLevel(row.signal)" :dbm="row.signal" />
                  <span class="num">{{ row.signal }} dBm</span>
                </div>
                <span v-else class="muted">—</span>
              </template>
            </el-table-column>
            <el-table-column label="在线时长" min-width="110">
              <template #default="{ row }">
                <span v-if="row.wireless && row.connected" class="num rate-text">
                  {{ formatUptime(row.connected) }}
                </span>
                <span v-else class="muted">—</span>
              </template>
            </el-table-column>
            <el-table-column label="实时速率" min-width="170">
              <template #default="{ row }">
                <span v-if="row.wireless" class="num rate-text">
                  ↓ {{ formatBitrate(row.rxRate) }} · ↑ {{ formatBitrate(row.txRate) }}
                </span>
                <span v-else class="muted">—</span>
              </template>
            </el-table-column>
            <el-table-column label="累计收发" min-width="170" align="right">
              <template #default="{ row }">
                <span v-if="row.wireless" class="num rate-text">
                  ↓ {{ formatBytes(row.rxBytes) }} · ↑ {{ formatBytes(row.txBytes) }}
                </span>
                <span v-else class="muted">—</span>
              </template>
            </el-table-column>
          </el-table>
        </div>

        <div v-if="clients.length" class="mobile-only mobile-list">
          <button
            v-for="row in clients"
            :key="row.mac"
            type="button"
            class="mobile-row"
            @click="openClient(row)"
          >
            <div class="mobile-row-head">
              <div class="device-cell">
                <span class="device-avatar">{{ initialOf(row.hostname) }}</span>
                <strong class="truncate">{{ row.hostname }}</strong>
              </div>
              <el-tag v-if="row.wireless" size="small" type="success">
                {{ row.bandLabel || '无线' }}
              </el-tag>
              <el-tag v-else size="small" type="info">有线</el-tag>
            </div>
            <div class="mobile-line">
              <span>IP</span>
              <span class="mono">{{ row.ip }}</span>
            </div>
            <div v-if="row.wireless" class="mobile-line">
              <span>信号</span>
              <span class="signal-cell">
                <SignalBars :level="signalLevel(row.signal)" :dbm="row.signal" />
                <span class="num">{{ row.signal }} dBm</span>
              </span>
            </div>
            <div v-if="row.wireless && row.connected" class="mobile-line">
              <span>在线时长</span>
              <span class="num">{{ formatUptime(row.connected) }}</span>
            </div>
            <div v-if="row.wireless" class="mobile-line">
              <span>速率</span>
              <span class="num">
                ↓ {{ formatBitrate(row.rxRate) }} · ↑ {{ formatBitrate(row.txRate) }}
              </span>
            </div>
            <div v-if="row.wireless" class="mobile-line">
              <span>累计收发</span>
              <span class="num">
                ↓ {{ formatBytes(row.rxBytes) }} · ↑ {{ formatBytes(row.txBytes) }}
              </span>
            </div>
          </button>
        </div>

        <EmptyState
          v-if="!clients.length"
          :icon="Users"
          title="暂无在线设备"
          description="设备连接路由器并获取地址后会显示在这里。"
        />

        <template #footer>
          <span>无线 {{ wirelessCount }} 台</span>
          <span>有线 {{ wiredCount }} 台</span>
          <span>有线设备没有逐机计数器，收发显示为 —</span>
        </template>
      </PanelCard>
    </template>

    <div v-else class="card">
      <div class="card-body">
        <el-skeleton :rows="6" animated />
      </div>
    </div>

    <MonClientDialog v-model="dialogOpen" :client="selectedClient" :window-ms="rangeMs" />
  </div>
</template>

<script setup lang="ts">
  import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
  import { Activity, ArrowDownUp, MemoryStick, Network, RefreshCw, Users } from 'lucide-vue-next'
  import type { EChartsCoreOption } from 'echarts/core'
  import PageHeader from '@/components/PageHeader.vue'
  import PanelCard from '@/components/PanelCard.vue'
  import StatCard from '@/components/StatCard.vue'
  import SignalBars from '@/components/SignalBars.vue'
  import EmptyState from '@/components/EmptyState.vue'
  import BaseChart from '@/components/BaseChart.vue'
  import MonSparkline from '@/components/config-mon/MonSparkline.vue'
  import MonClientDialog from '@/components/config-mon/MonClientDialog.vue'
  import MonitorInterfaceRateChart from '@/components/monitor-InterfaceRateChart.vue'
  import { useRefreshSignal } from '@/composables/useRefresh'
  import { useTheme } from '@/composables/useTheme'
  import type {
    DhcpLease,
    HostHint,
    NetworkDevice,
    NetworkInterface,
    Station,
    SystemInfo,
    WirelessRadio
  } from '@/api/types'
  import {
    MAX_CHART_POINTS,
    MONITOR_METRICS,
    MONITOR_RANGES,
    SAMPLE_INTERVAL,
    SPARK_POINTS,
    cpuEstimate,
    externalRate,
    fetchCounters,
    fetchStations,
    fetchTopology,
    loadAverages,
    memoryUsage,
    pushSample,
    toRate,
    totalTraffic,
    windowSamples,
    type ClientStat,
    type InterfaceStat,
    type MonitorMetric,
    type MonitorRange,
    type RateSample,
    type ResourceSample
  } from '@/api/monitor'
  import {
    formatBitrate,
    formatBytes,
    formatUptime,
    ipv4Of,
    signalLevel,
    withAlpha
  } from '@/utils/format'
  import { buildWifiMeta, mergeClients } from '@/utils/clients'

  defineOptions({ name: 'MonitorView' })

  const { isDark } = useTheme()
  const refreshSignal = useRefreshSignal()

  const range = ref<MonitorRange>('1m')
  /** The metric the resource curve shows. */
  const metric = ref<MonitorMetric>('cpu')
  const loaded = ref(false)
  const refreshing = ref(false)
  const error = ref<Error | null>(null)

  const info = ref<SystemInfo>()
  const devices = ref<NetworkDevice[]>([])
  const interfaces = ref<NetworkInterface[]>([])
  const wireless = ref<Record<string, WirelessRadio>>({})
  const stations = ref<Record<string, Station[]>>({})
  const hints = ref<Record<string, HostHint>>({})
  const leases = ref<DhcpLease[]>([])

  /** Ring buffers: the resource curve and one rate curve per interface/client. */
  const resourceSamples = ref<ResourceSample[]>([])
  const interfaceStats = ref<InterfaceStat[]>([])
  const clientStats = ref<ClientStat[]>([])

  const devicePrev = new Map<string, { rx: number; tx: number; at: number }>()
  const stationPrev = new Map<string, { rx: number; tx: number; at: number }>()
  const interfaceHistory = new Map<string, RateSample[]>()
  const clientHistory = new Map<string, RateSample[]>()

  const dialogOpen = ref(false)
  const selectedMac = ref('')

  let timer: number | undefined
  let sampling = false
  let tick = 0

  const rangeOption = computed(
    () => MONITOR_RANGES.find((option) => option.key === range.value) ?? MONITOR_RANGES[0]
  )
  const rangeMs = computed(() => rangeOption.value.ms)
  const rangeLabel = computed(() => rangeOption.value.label)

  const loads = computed(() => loadAverages(info.value))
  const load1 = computed(() => loads.value[0] ?? 0)
  const load5 = computed(() => loads.value[1] ?? 0)
  const load15 = computed(() => loads.value[2] ?? 0)
  const cpuNow = computed(() => cpuEstimate(load1.value))
  const memory = computed(() => memoryUsage(info.value))
  const memoryTone = computed<'brand' | 'warning' | 'danger'>(() =>
    memory.value.percent >= 90 ? 'danger' : memory.value.percent >= 75 ? 'warning' : 'brand'
  )
  const traffic = computed(() => totalTraffic(devices.value))

  const clients = computed(() => clientStats.value)
  const wirelessCount = computed(() => clients.value.filter((row) => row.wireless).length)
  const wiredCount = computed(() => clients.value.length - wirelessCount.value)

  const selectedClient = computed(
    () => clients.value.find((row) => row.mac.toUpperCase() === selectedMac.value.toUpperCase()) ?? null
  )

  const resourcePoints = computed(() =>
    windowSamples(resourceSamples.value, rangeMs.value, MAX_CHART_POINTS)
  )

  /** The hint of the active metric, shown in the legend and the footer. */
  const metricHint = computed(
    () => MONITOR_METRICS.find((option) => option.key === metric.value)?.hint ?? ''
  )

  /** The current rate of the external traffic. */
  const netRate = computed(() => externalRate(interfaceStats.value))

  const interfaceRows = computed(() =>
    interfaceStats.value.map((row) => ({
      ...row,
      address: addressOf(row.name),
      spark: windowSamples(row.history, rangeMs.value, SPARK_POINTS).map(
        (point) => point.rx + point.tx
      )
    }))
  )

  /** The IPv4 address of the logical interface behind a device, if any. */
  function addressOf(device: string): string {
    const match = interfaces.value.find(
      (item) => item.l3_device === device || item.interface === device
    )
    if (!match) return ''
    const address = ipv4Of(match)
    return address === '—' ? '' : address
  }

  function findStation(list: Record<string, Station[]>, mac: string): Station | undefined {
    const target = mac.toUpperCase()
    for (const stations of Object.values(list)) {
      for (const station of stations) {
        if (station.mac.toUpperCase() === target) return station
      }
    }
    return undefined
  }

  function updateInterfaces(list: NetworkDevice[], now: number): void {
    const rows: InterfaceStat[] = []

    for (const device of list) {
      if (device.name === 'lo') continue

      const rxBytes = device.stats?.rx_bytes ?? 0
      const txBytes = device.stats?.tx_bytes ?? 0
      const previous = devicePrev.get(device.name)
      const rxRate = previous ? toRate(rxBytes, previous.rx, now - previous.at) : 0
      const txRate = previous ? toRate(txBytes, previous.tx, now - previous.at) : 0
      devicePrev.set(device.name, { rx: rxBytes, tx: txBytes, at: now })

      let history = interfaceHistory.get(device.name)
      if (!history) {
        history = []
        interfaceHistory.set(device.name, history)
      }
      pushSample(history, { time: now, rx: rxRate, tx: txRate })

      rows.push({
        name: device.name,
        up: device.up,
        wireless: device.wireless,
        rxBytes,
        txBytes,
        rxRate,
        txRate,
        history
      })
    }

    const alive = new Set(rows.map((row) => row.name))
    for (const name of [...interfaceHistory.keys()]) {
      if (!alive.has(name)) interfaceHistory.delete(name)
    }

    interfaceStats.value = rows.sort(
      (a, b) => b.rxBytes + b.txBytes - (a.rxBytes + a.txBytes)
    )
  }

  /**
   * Rebuilds the client list. `sample` tells whether the station counters were
   * read again in this round; when they were not, the history must not grow,
   * otherwise the curve would show a dip to zero every other round.
   */
  function updateClients(now: number, sample: boolean): void {
    const merged = mergeClients(
      leases.value,
      stations.value,
      hints.value,
      buildWifiMeta(wireless.value)
    )
    const alive = new Set<string>()

    const rows: ClientStat[] = merged.map((client) => {
      const key = client.mac.toUpperCase()
      alive.add(key)

      const station = findStation(stations.value, client.mac)
      const rxBytes = station?.rx?.bytes ?? 0
      const txBytes = station?.tx?.bytes ?? 0
      const previous = stationPrev.get(key)
      const rxRate = previous ? toRate(rxBytes, previous.rx, now - previous.at) : 0
      const txRate = previous ? toRate(txBytes, previous.tx, now - previous.at) : 0

      let history = clientHistory.get(key)
      if (!history) {
        history = []
        clientHistory.set(key, history)
      }

      if (sample) {
        stationPrev.set(key, { rx: rxBytes, tx: txBytes, at: now })
        pushSample(history, { time: now, rx: rxRate, tx: txRate })
      }

      return {
        mac: client.mac,
        hostname: client.hostname,
        ip: client.ip,
        wireless: client.wireless,
        bandLabel: client.bandLabel,
        signal: client.signal,
        linkRate: client.rate,
        connected: client.connected,
        rxBytes,
        txBytes,
        rxRate,
        txRate,
        history
      }
    })

    for (const key of [...clientHistory.keys()]) {
      if (!alive.has(key)) clientHistory.delete(key)
    }

    clientStats.value = rows.sort((a, b) => {
      if (a.wireless !== b.wireless) return a.wireless ? -1 : 1
      return b.rxRate + b.txRate - (a.rxRate + a.txRate)
    })
  }

  async function sample(): Promise<void> {
    if (sampling) return
    sampling = true

    try {
      const now = Date.now()
      const counters = await fetchCounters()
      info.value = counters.info
      devices.value = counters.devices

      const load = loadAverages(counters.info)
      // The interface counters are read first: the network rate of the
      // sample comes from them.
      updateInterfaces(counters.devices, now)
      const net = externalRate(interfaceStats.value)
      pushSample(resourceSamples.value, {
        time: now,
        load: load[0] ?? 0,
        memory: memoryUsage(counters.info).percent,
        cpu: cpuEstimate(load[0] ?? 0),
        netRx: net.rx,
        netTx: net.tx
      })

      tick += 1
      let stationsRead = false
      let topologyRead = false

      // The station table needs an extra CGI round trip, so it is read half
      // as often as the plain counters.
      if (tick % 2 === 0) {
        try {
          stations.value = await fetchStations()
          stationsRead = true
        } catch {
          // Keep the previous snapshot, the next round retries.
        }
      }

      if (tick % 5 === 0) {
        try {
          const topology = await fetchTopology()
          interfaces.value = topology.interfaces
          wireless.value = topology.wireless
          hints.value = topology.hints
          leases.value = topology.leases
          topologyRead = true
        } catch {
          // Keep the previous snapshot, the next round retries.
        }
      }

      if (stationsRead || topologyRead) updateClients(now, stationsRead)

      error.value = null
      loaded.value = true
    } catch (err) {
      error.value = err instanceof Error ? err : new Error(String(err))
    } finally {
      sampling = false
    }
  }

  function startSampling(): void {
    stopSampling()
    timer = window.setInterval(() => void sample(), SAMPLE_INTERVAL)
  }

  function stopSampling(): void {
    if (timer !== undefined) {
      window.clearInterval(timer)
      timer = undefined
    }
  }

  /** A hidden tab must not keep the router busy. */
  function handleVisibility(): void {
    if (document.hidden) {
      stopSampling()
      return
    }
    void sample()
    startSampling()
  }

  async function refresh(): Promise<void> {
    refreshing.value = true
    try {
      await sample()
    } finally {
      refreshing.value = false
    }
  }

  function openClient(client: ClientStat): void {
    selectedMac.value = client.mac
    dialogOpen.value = true
  }

  function handleRowClick(row: ClientStat): void {
    openClient(row)
  }

  function initialOf(name: string): string {
    const trimmed = name.trim()
    return trimmed ? trimmed.slice(0, 1).toUpperCase() : '?'
  }

  watch(refreshSignal, () => void sample())

  onMounted(() => {
    void sample()
    startSampling()
    document.addEventListener('visibilitychange', handleVisibility)
  })

  onBeforeUnmount(() => {
    stopSampling()
    document.removeEventListener('visibilitychange', handleVisibility)
  })

  const resourceOption = computed<EChartsCoreOption>(() => {
    const styles = getComputedStyle(document.documentElement)
    const cpuColor = styles.getPropertyValue('--chart-rx').trim()
    const memColor = styles.getPropertyValue('--chart-tx').trim()
    const rxColor = styles.getPropertyValue('--chart-rx').trim()
    const txColor = styles.getPropertyValue('--chart-tx').trim()
    const gridColor = styles.getPropertyValue('--chart-grid').trim()
    const textColor = styles.getPropertyValue('--text-muted').trim()
    const surface = styles.getPropertyValue('--surface').trim()
    const border = styles.getPropertyValue('--border').trim()
    void isDark.value

    const points = resourcePoints.value
    const isNetwork = metric.value === 'network'

    function gradient(color: string, alpha: number) {
      return {
        type: 'linear' as const,
        x: 0,
        y: 0,
        x2: 0,
        y2: 1,
        colorStops: [
          { offset: 0, color: withAlpha(color, alpha) },
          { offset: 1, color: withAlpha(color, 0) }
        ]
      }
    }

    const yAxis = isNetwork
      ? [
          {
            type: 'value' as const,
            splitNumber: 4,
            axisLabel: {
              color: textColor,
              fontSize: 11,
              formatter: (value: number) => formatBitrate(value)
            },
            splitLine: { lineStyle: { color: gridColor } }
          }
        ]
      : [
          {
            type: 'value' as const,
            max: 100,
            splitNumber: 4,
            axisLabel: {
              color: textColor,
              fontSize: 11,
              formatter: (value: number) => `${value}%`
            },
            splitLine: { lineStyle: { color: gridColor } }
          }
        ]

    const series = isNetwork
      ? [
          {
            name: '下行',
            type: 'line' as const,
            yAxisIndex: 0,
            smooth: 0.3,
            symbol: 'none',
            data: points.map((point) => point.netRx),
            lineStyle: { width: 2, color: rxColor },
            areaStyle: { color: gradient(rxColor, 0.22) }
          },
          {
            name: '上行',
            type: 'line' as const,
            yAxisIndex: 0,
            smooth: 0.3,
            symbol: 'none',
            data: points.map((point) => point.netTx),
            lineStyle: { width: 2, color: txColor },
            areaStyle: { color: gradient(txColor, 0.16) }
          }
        ]
      : metric.value === 'memory'
        ? [
            {
              name: '内存使用',
              type: 'line' as const,
              yAxisIndex: 0,
              smooth: 0.3,
              symbol: 'none',
              data: points.map((point) => point.memory),
              lineStyle: { width: 2, color: memColor },
              areaStyle: { color: gradient(memColor, 0.14) }
            }
          ]
        : [
            {
              name: 'CPU 占用（1 分钟负载折算）',
              type: 'line' as const,
              yAxisIndex: 0,
              smooth: 0.3,
              symbol: 'none',
              data: points.map((point) => point.cpu),
              lineStyle: { width: 2, color: cpuColor },
              areaStyle: { color: gradient(cpuColor, 0.12) }
            }
          ]

    return {
      animation: false,
      grid: { top: 18, right: 46, bottom: 6, left: 6, containLabel: true },
      tooltip: {
        trigger: 'axis',
        backgroundColor: surface,
        borderColor: border,
        borderWidth: 1,
        padding: [8, 10],
        textStyle: { color: styles.getPropertyValue('--text').trim(), fontSize: 12 },
        valueFormatter: isNetwork
          ? (value: unknown) => formatBitrate(Number(value))
          : (value: unknown) => `${Number(value)}%`
      },
      xAxis: {
        type: 'category',
        boundaryGap: false,
        data: points.map((point) =>
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
      yAxis,
      series
    }
  })
</script>

<style scoped>
  .range-group {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .range-label {
    color: var(--text-muted);
    font-size: 11.5px;
    white-space: nowrap;
  }

  .range-switch {
    display: flex;
    gap: 2px;
    padding: 3px;
    background: var(--surface-2);
    border-radius: var(--radius);
  }

  /* 30px 的胶囊加 3px 内边距 = 36px，和同一行的「刷新」按钮等高。 */
  .range-chip {
    height: 30px;
    padding: 0 11px;
    color: var(--text-muted);
    font-size: 11.5px;
    font-weight: 500;
    cursor: pointer;
    background: transparent;
    border: 0;
    border-radius: var(--radius-sm);
    transition:
      color 0.15s ease,
      background-color 0.15s ease;
  }

  .range-chip:hover {
    color: var(--text);
  }

  .range-chip.active {
    color: var(--text);
    background: var(--surface);
    box-shadow: var(--shadow-xs);
  }

  .metric-switch {
    display: flex;
    gap: 2px;
    padding: 3px;
    background: var(--surface-2);
    border-radius: var(--radius);
  }

  .metric-chip {
    height: 26px;
    padding: 0 11px;
    color: var(--text-muted);
    font-size: 11.5px;
    font-weight: 500;
    cursor: pointer;
    background: transparent;
    border: 0;
    border-radius: var(--radius-sm);
    transition:
      color 0.15s ease,
      background-color 0.15s ease;
  }

  .metric-chip:hover {
    color: var(--text);
  }

  .metric-chip.active {
    color: var(--text);
    background: var(--surface);
    box-shadow: var(--shadow-xs);
  }

  .series-legend {
    display: flex;
    align-items: center;
    gap: 14px;
    margin-bottom: 10px;
    color: var(--text-muted);
    font-size: 11.5px;
  }

  .legend-hint {
    color: var(--text-faint);
    font-size: 11px;
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

  .legend-dot.cpu {
    background: var(--chart-rx);
  }

  .legend-dot.mem {
    background: var(--chart-tx);
  }

  .legend-dot.load {
    background: var(--warning);
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
    height: 280px;
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
    display: grid;
    grid-template-columns: 10px minmax(120px, 1.3fr) minmax(160px, 1fr) 120px minmax(160px, 1fr);
    grid-template-areas: 'dot name rate spark total';
    align-items: center;
    gap: 12px;
    padding: 10px 0;
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
    grid-area: dot;
    width: 7px;
    height: 7px;
    background: var(--text-faint);
    border-radius: 50%;
  }

  .iface-dot.up {
    background: var(--success);
  }

  .iface-name {
    grid-area: name;
    display: flex;
    flex-direction: column;
    gap: 1px;
    min-width: 0;
  }

  .iface-name-main {
    display: flex;
    align-items: center;
    gap: 7px;
    min-width: 0;
  }

  .iface-address {
    color: var(--text-muted);
    font-size: 11px;
  }

  .iface-title {
    overflow: hidden;
    color: var(--text);
    font-size: var(--text-sm);
    font-weight: 600;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .iface-kind {
    flex-shrink: 0;
    padding: 1px 6px;
    color: var(--text-muted);
    font-size: 10.5px;
    font-weight: 500;
    background: var(--surface-2);
    border-radius: 4px;
  }

  .iface-rate {
    grid-area: rate;
    display: flex;
    flex-direction: column;
    gap: 1px;
    color: var(--text-secondary);
    font-size: 11.5px;
  }

  .iface-rate .rx {
    color: var(--chart-rx);
  }

  .iface-rate .tx {
    color: var(--chart-tx);
  }

  .iface-spark {
    grid-area: spark;
    height: 30px;
  }

  .iface-total {
    grid-area: total;
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    gap: 1px;
    color: var(--text-muted);
    font-size: 11px;
  }

  .count-badge {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 24px;
    height: 22px;
    padding: 0 7px;
    color: var(--text-muted);
    font-size: 11px;
    font-weight: 500;
    background: var(--surface-2);
    border-radius: 999px;
  }

  .device-cell {
    display: flex;
    align-items: center;
    gap: 9px;
    min-width: 0;
  }

  .device-avatar {
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

  .device-copy {
    min-width: 0;
  }

  .table-primary {
    color: var(--text);
    font-size: var(--text-sm);
    font-weight: 500;
  }

  .table-sub {
    margin-top: 1px;
    color: var(--text-muted);
    font-size: 11px;
  }

  .table-mono {
    color: var(--text-secondary);
    font-size: 12px;
  }

  .rate-text {
    color: var(--text-secondary);
    font-size: 12px;
  }

  .signal-cell {
    display: flex;
    align-items: center;
    gap: 7px;
    color: var(--text-secondary);
    font-size: 12px;
  }

  :deep(.el-table__row) {
    cursor: pointer;
  }

  .mobile-list {
    padding: 4px 16px 12px;
  }

  .mobile-row {
    display: block;
    width: 100%;
    padding: 12px 0;
    color: inherit;
    text-align: left;
    cursor: pointer;
    background: none;
    border: 0;
    border-bottom: 1px solid var(--border);
  }

  .mobile-row:last-child {
    border-bottom: 0;
  }

  .mobile-row-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    margin-bottom: 6px;
    color: var(--text);
    font-size: var(--text-sm);
  }

  .mobile-line {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    color: var(--text-muted);
    font-size: 11.5px;
    line-height: 1.8;
  }

  .mobile-line span:last-child {
    color: var(--text-secondary);
  }

  @media (max-width: 640px) {
    .range-group {
      flex-wrap: wrap;
      width: 100%;
    }

    .range-switch {
      flex: 1 1 auto;
    }

    .range-chip {
      flex: 1;
    }

    .metric-switch {
      width: 100%;
    }

    .metric-chip {
      flex: 1;
    }

    :deep(.card-head) {
      flex-direction: column;
      gap: 8px;
    }

    :deep(.card-actions) {
      width: 100%;
    }

    :deep(.card-footer) {
      align-items: flex-start;
      flex-direction: column;
      gap: 4px;
    }

    .series-legend {
      flex-wrap: wrap;
      gap: 8px 14px;
    }

    .iface-row {
      grid-template-columns: 10px minmax(0, 1fr) auto;
      grid-template-areas:
        'dot name rate'
        'dot spark total';
      row-gap: 8px;
      column-gap: 10px;
    }

    .iface-rate {
      align-items: flex-end;
    }

    .iface-spark {
      height: 26px;
    }
  }
</style>
