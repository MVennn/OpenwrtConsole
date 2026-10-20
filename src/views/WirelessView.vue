<template>
  <div class="page">
    <PageHeader title="无线" description="射频、SSID 与关联终端的信号质量">
      <el-button :icon="RefreshCw" :loading="refreshing" @click="refresh">刷新</el-button>
      <el-button type="primary" @click="goWirelessConfig">无线配置</el-button>
    </PageHeader>

    <el-alert v-if="error" type="error" :title="error.message" :closable="false" show-icon />

    <template v-if="loaded">
      <div class="grid grid-4">
        <StatCard
          label="无线射频"
          :value="radios.length"
          :meta="`${activeRadios} 个已开启`"
          :icon="Radio"
          tone="brand"
        />
        <StatCard
          label="SSID 数量"
          :value="ssidCount"
          meta="2.4 GHz / 5 GHz"
          :icon="Wifi"
          tone="neutral"
        />
        <StatCard
          label="关联客户端"
          :value="stationRows.length"
          :meta="`${strongClients} 台信号良好`"
          :icon="Smartphone"
          tone="success"
        />
        <StatCard
          label="无线总流量"
          :value="formatBytes(wirelessTraffic)"
          meta="自上次重启累计"
          :icon="ArrowUpDown"
          tone="neutral"
        />
      </div>

      <div class="grid grid-2">
        <section v-for="radio in radios" :key="radio.key" class="card radio-card">
          <div class="radio-head">
            <div class="radio-heading">
              <span class="radio-band" :class="radio.bandClass">{{ radio.bandText }}</span>
              <div>
                <h2 class="radio-title">{{ radio.ssid || '未命名网络' }}</h2>
                <p class="radio-sub">{{ radio.hardware || '无线射频' }}</p>
              </div>
            </div>
            <StatusBadge
              :tone="radio.up ? 'success' : 'neutral'"
              :label="radio.up ? '已开启' : '已关闭'"
            />
          </div>

          <div class="radio-encryption">
            <Lock :size="13" />
            {{ encryptionLabel(radio.encryption) }}
            <span class="radio-sep">·</span>
            {{ radio.ifname }}
          </div>

          <dl class="radio-grid">
            <div>
              <dt>信道</dt>
              <dd class="num">{{ radio.channel || '—' }}</dd>
            </div>
            <div>
              <dt>频宽</dt>
              <dd>{{ radio.htmode || '—' }}</dd>
            </div>
            <div>
              <dt>发射功率</dt>
              <dd class="num">{{ radio.txpower ? `${radio.txpower} dBm` : '—' }}</dd>
            </div>
            <div>
              <dt>关联终端</dt>
              <dd class="num">{{ radio.clients }} 台</dd>
            </div>
            <div>
              <dt>平均信号</dt>
              <dd>
                <template v-if="radio.avgSignal !== null">
                  <SignalBars :level="signalLevel(radio.avgSignal)" :dbm="radio.avgSignal" />
                  <span class="radio-signal-text num">{{ radio.avgSignal }} dBm</span>
                </template>
                <span v-else class="muted">—</span>
              </dd>
            </div>
            <div>
              <dt>无线流量</dt>
              <dd class="num">{{ formatBytes(radio.traffic) }}</dd>
            </div>
          </dl>
        </section>
      </div>

      <PanelCard title="关联终端" :subtitle="`${filteredStations.length} 台设备`">
        <template #actions>
          <div class="filter-chips">
            <button
              v-for="option in filters"
              :key="option.value"
              class="filter-chip"
              :class="{ active: filter === option.value }"
              @click="filter = option.value"
            >
              {{ option.label }}
            </button>
          </div>
        </template>

        <div v-if="filteredStations.length" class="desktop-only">
          <el-table :data="filteredStations" style="width: 100%">
            <el-table-column label="设备" min-width="180">
              <template #default="{ row }">
                <div class="table-primary">{{ row.hostname }}</div>
                <div class="table-sub mono">{{ row.mac }}</div>
              </template>
            </el-table-column>
            <el-table-column label="频段" width="100">
              <template #default="{ row }">
                <el-tag size="small" type="info">{{ row.bandLabel }}</el-tag>
              </template>
            </el-table-column>
            <el-table-column label="信号" min-width="150">
              <template #default="{ row }">
                <div class="signal-cell">
                  <SignalBars :level="signalLevel(row.signal)" :dbm="row.signal" />
                  <span class="num">{{ row.signal }} dBm</span>
                  <span class="signal-text">{{ signalLabel(row.signal) }}</span>
                </div>
              </template>
            </el-table-column>
            <el-table-column label="接收 / 发送速率" min-width="160">
              <template #default="{ row }">
                <span class="num">
                  {{ formatLinkRate(row.rxRate) }} / {{ formatLinkRate(row.txRate) }}
                </span>
              </template>
            </el-table-column>
            <el-table-column label="连接时长" min-width="110">
              <template #default="{ row }">{{ formatUptime(row.connected) }}</template>
            </el-table-column>
            <el-table-column label="空闲" width="100" align="right">
              <template #default="{ row }">{{ formatAgo(row.inactive) }}</template>
            </el-table-column>
          </el-table>
        </div>

        <div v-if="filteredStations.length" class="mobile-only mobile-list">
          <div v-for="row in filteredStations" :key="row.mac" class="mobile-row">
            <div class="mobile-row-head">
              <strong>{{ row.hostname }}</strong>
              <el-tag size="small" type="info">{{ row.bandLabel }}</el-tag>
            </div>
            <div class="mobile-line">
              <span>MAC</span>
              <span class="mono">{{ row.mac }}</span>
            </div>
            <div class="mobile-line">
              <span>信号</span>
              <span class="signal-cell">
                <SignalBars :level="signalLevel(row.signal)" :dbm="row.signal" />
                <span class="num">{{ row.signal }} dBm</span>
              </span>
            </div>
            <div class="mobile-line">
              <span>速率</span>
              <span class="num">{{ formatLinkRate(row.rxRate) }} / {{ formatLinkRate(row.txRate) }}</span>
            </div>
          </div>
        </div>

        <EmptyState
          v-if="!filteredStations.length"
          :icon="WifiOff"
          title="暂无关联终端"
          :description="
            filter === 'all'
              ? '当前没有设备连接到 Wi-Fi，连接后会显示信号与速率。'
              : '该频段当前没有关联设备。'
          "
        />
      </PanelCard>

      <p class="page-note">
        需要修改 SSID、密码或信道？
        <a href="#" @click.prevent="goWirelessConfig">前往无线配置</a>
      </p>
    </template>

    <div v-else class="card">
      <div class="card-body">
        <el-skeleton :rows="6" animated />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
  import { computed, ref, watch } from 'vue'
  import { useRouter } from 'vue-router'
  import {
    ArrowUpDown,
    Lock,
    Radio,
    RefreshCw,
    Smartphone,
    Wifi,
    WifiOff
  } from 'lucide-vue-next'
  import PageHeader from '@/components/PageHeader.vue'
  import PanelCard from '@/components/PanelCard.vue'
  import StatCard from '@/components/StatCard.vue'
  import StatusBadge from '@/components/StatusBadge.vue'
  import SignalBars from '@/components/SignalBars.vue'
  import EmptyState from '@/components/EmptyState.vue'
  import { usePolling } from '@/composables/usePolling'
  import { useRefreshSignal } from '@/composables/useRefresh'
  import { api } from '@/api/openwrt'
  import type { DhcpLease, HostHint, NetworkDevice, Station, WirelessRadio } from '@/api/types'
  import {
    bandLabel,
    formatAgo,
    formatBytes,
    formatLinkRate,
    formatUptime,
    encryptionLabel,
    signalLabel,
    signalLevel
  } from '@/utils/format'

  defineOptions({ name: 'WirelessView' })

  type Filter = 'all' | '2g' | '5g'

  const wireless = ref<Record<string, WirelessRadio>>({})
  const stations = ref<Record<string, Station[]>>({})
  const hints = ref<Record<string, HostHint>>({})
  const leases = ref<DhcpLease[]>([])
  const devices = ref<NetworkDevice[]>([])
  const filter = ref<Filter>('all')
  const refreshSignal = useRefreshSignal()
  const router = useRouter()

  const filters: Array<{ value: Filter; label: string }> = [
    { value: 'all', label: '全部' },
    { value: '2g', label: '2.4 GHz' },
    { value: '5g', label: '5 GHz' }
  ]

  interface RadioRow {
    key: string
    band: string
    bandText: string
    bandClass: string
    ssid: string
    ifname: string
    encryption: string
    up: boolean
    channel: string
    htmode: string
    txpower: number
    clients: number
    avgSignal: number | null
    traffic: number
    hardware: string
  }

  const radios = computed<RadioRow[]>(() =>
    Object.entries(wireless.value).map(([key, radio]) => {
      const iface = radio.interfaces[0]
      const ifname = iface?.ifname || ''
      const list = stations.value[ifname] || []
      const stats = devices.value.find((device) => device.name === ifname)?.stats
      const avgSignal = list.length
        ? Math.round(list.reduce((sum, item) => sum + item.signal, 0) / list.length)
        : null
      const band = radio.config?.band || ''

      return {
        key,
        band,
        bandText: bandLabel(band),
        bandClass: band.startsWith('2') ? 'is-24' : 'is-5',
        ssid: iface?.config?.ssid || '',
        ifname,
        encryption: iface?.config?.encryption || '',
        up: Boolean(radio.up && !radio.disabled),
        channel: radio.config?.channel || '',
        htmode: radio.config?.htmode || '',
        txpower: iface?.iwinfo?.txpower || 0,
        clients: list.length,
        avgSignal,
        traffic: (stats?.rx_bytes || 0) + (stats?.tx_bytes || 0),
        hardware: iface?.iwinfo?.hardware?.name || ''
      }
    })
  )

  const activeRadios = computed(() => radios.value.filter((radio) => radio.up).length)
  const ssidCount = computed(() => radios.value.filter((radio) => radio.ssid).length)
  const wirelessTraffic = computed(() =>
    radios.value.reduce((sum, radio) => sum + radio.traffic, 0)
  )
  const strongClients = computed(
    () => stationRows.value.filter((row) => (row.signal || -100) >= -60).length
  )

  interface StationRow {
    mac: string
    hostname: string
    band: string
    bandLabel: string
    signal: number
    rxRate: number
    txRate: number
    connected: number
    inactive: number
  }

  const stationRows = computed<StationRow[]>(() => {
    const rows: StationRow[] = []
    for (const radio of radios.value) {
      const list = stations.value[radio.ifname] || []
      for (const station of list) {
        const lease = leases.value.find(
          (item) => item.macaddr.toUpperCase() === station.mac.toUpperCase()
        )
        const hint = hints.value[station.mac.toUpperCase()]
        rows.push({
          mac: station.mac,
          hostname: lease?.hostname || hint?.name || '无线设备',
          band: radio.band,
          bandLabel: radio.bandText,
          signal: station.signal,
          rxRate: station.rx?.rate || 0,
          txRate: station.tx?.rate || 0,
          connected: station.connected_time || 0,
          inactive: station.inactive || 0
        })
      }
    }
    return rows.sort((a, b) => b.signal - a.signal)
  })

  const filteredStations = computed(() => {
    if (filter.value === 'all') return stationRows.value
    const bandPrefix = filter.value === '2g' ? '2' : '5'
    return stationRows.value.filter((row) => row.band.startsWith(bandPrefix))
  })

  function goWirelessConfig(): void {
    void router.push({ name: 'config-wireless' })
  }

  const { loaded, error, refreshing, refresh } = usePolling(async () => {
    const [nextWireless, nextStations, nextHints, nextLeases, nextDevices] = await Promise.all([
      api.wireless(),
      api.stations().catch(() => ({})),
      api.hostHints(),
      api.dhcpLeases(),
      api.networkDevices()
    ])
    wireless.value = nextWireless
    stations.value = nextStations
    hints.value = nextHints
    leases.value = nextLeases
    devices.value = nextDevices
  }, 10000)

  watch(refreshSignal, () => void refresh())
</script>

<style scoped>
  .radio-card {
    padding: 18px 20px 16px;
  }

  .radio-head {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 10px;
  }

  .radio-heading {
    display: flex;
    align-items: center;
    gap: 10px;
    min-width: 0;
  }

  .radio-band {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 58px;
    height: 42px;
    flex-shrink: 0;
    color: var(--brand-text);
    font-size: 12px;
    font-weight: 600;
    background: var(--brand-soft);
    border-radius: var(--radius-md);
  }

  .radio-band.is-5 {
    color: var(--info-text);
    background: var(--info-soft);
  }

  .radio-title {
    color: var(--text);
    font-size: var(--text-base);
    font-weight: 600;
    line-height: 1.3;
  }

  .radio-sub {
    margin-top: 1px;
    color: var(--text-muted);
    font-size: 11px;
  }

  .radio-encryption {
    display: flex;
    align-items: center;
    gap: 5px;
    margin: 12px 0 0;
    color: var(--text-muted);
    font-size: 11.5px;
  }

  .radio-sep {
    color: var(--text-faint);
  }

  .radio-grid {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 14px 16px;
    padding: 16px 0 0;
    margin: 14px 0 0;
    border-top: 1px solid var(--border);
  }

  .radio-grid dt {
    margin: 0 0 2px;
    color: var(--text-muted);
    font-size: 11px;
  }

  .radio-grid dd {
    display: flex;
    align-items: center;
    gap: 6px;
    margin: 0;
    color: var(--text);
    font-size: var(--text-sm);
    font-weight: 500;
  }

  .radio-signal-text {
    color: var(--text-muted);
    font-size: 11px;
    font-weight: 400;
  }

  .filter-chips {
    display: flex;
    gap: 2px;
    padding: 2px;
    background: var(--surface-2);
    border-radius: var(--radius);
  }

  .filter-chip {
    height: 28px;
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

  .filter-chip:hover {
    color: var(--text);
  }

  .filter-chip.active {
    color: var(--text);
    background: var(--surface);
    box-shadow: var(--shadow-xs);
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

  .signal-cell {
    display: flex;
    align-items: center;
    gap: 7px;
    color: var(--text-secondary);
    font-size: 12px;
  }

  .signal-text {
    color: var(--text-muted);
    font-size: 11px;
  }

  .mobile-list {
    padding: 4px 16px 12px;
  }

  .mobile-row {
    padding: 12px 0;
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

  .page-note {
    padding: 0 4px;
    color: var(--text-muted);
    font-size: var(--text-xs);
  }

  .page-note a {
    color: var(--brand-text);
  }

  @media (max-width: 640px) {
    .radio-card {
      padding: 16px;
    }

    .radio-grid {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  }
</style>
