<template>
  <div class="page">
    <PageHeader title="客户端" description="DHCP 租约与无线终端的合并视图">
      <el-button :icon="RefreshCw" :loading="refreshing" @click="refresh">刷新</el-button>
      <el-button type="primary" @click="goDhcpConfig">DHCP 与主机名</el-button>
    </PageHeader>

    <el-alert v-if="error" type="error" :title="error?.message || '操作失败'" :closable="false" show-icon />

    <template v-if="loaded">
      <div class="grid grid-3">
        <StatCard
          label="全部客户端"
          :value="clients.length"
          meta="DHCP 租约与无线终端去重后"
          :icon="Users"
          tone="brand"
        />
        <StatCard
          label="无线客户端"
          :value="wirelessCount"
          :meta="wirelessBandMeta"
          :icon="Wifi"
          tone="success"
        />
        <StatCard
          label="其他客户端"
          :value="otherCount"
          meta="仅有 DHCP 租约，未关联无线"
          :icon="Cable"
          tone="neutral"
        />
      </div>

      <PanelCard title="客户端列表" :subtitle="`${filtered.length} 台设备`" flush>
        <template #actions>
          <span class="count-badge">{{ filtered.length }}</span>
        </template>

        <div class="client-toolbar">
          <el-input
            v-model="search"
            class="client-search"
            placeholder="搜索主机名、IP 或 MAC"
            clearable
            :prefix-icon="Search"
          />
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
        </div>

        <div v-if="filtered.length" class="desktop-only">
          <el-table :data="filtered" style="width: 100%">
            <el-table-column label="设备" min-width="200">
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
            <el-table-column label="类型" min-width="160">
              <template #default="{ row }">
                <div class="type-cell">
                  <el-tag size="small" :type="identityTagType(row)">
                    {{ identityLabel(row) }}
                  </el-tag>
                  <span class="type-vendor">{{ identityVendor(row) }}</span>
                  <button class="type-refresh" title="重新识别" @click.stop="reprobe(row)">
                    <RefreshCw :size="12" />
                  </button>
                </div>
              </template>
            </el-table-column>
            <el-table-column label="接入方式" min-width="110">
              <template #default="{ row }">
                <el-tag v-if="row.wireless" size="small" type="success">
                  {{ row.bandLabel }}
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
            <el-table-column label="链路速率" min-width="110">
              <template #default="{ row }">
                <span class="num">{{ row.wireless ? formatLinkRate(row.rate) : '—' }}</span>
              </template>
            </el-table-column>
            <el-table-column label="在线 / 租约" min-width="130">
              <template #default="{ row }">
                <span v-if="row.wireless">{{ formatUptime(row.connected) }}</span>
                <span v-else-if="row.lease">{{ leaseText(row.lease) }}</span>
                <span v-else class="muted">—</span>
              </template>
            </el-table-column>
            <el-table-column label="最后活动" width="110" align="right">
              <template #default="{ row }">
                <span v-if="row.wireless">{{ formatAgo(row.inactive) }}</span>
                <span v-else class="muted">—</span>
              </template>
            </el-table-column>
          </el-table>
        </div>

        <div v-if="filtered.length" class="mobile-only mobile-list">
          <div v-for="row in filtered" :key="row.mac" class="mobile-row">
            <div class="mobile-row-head">
              <div class="device-cell">
                <span class="device-avatar">{{ initialOf(row.hostname) }}</span>
                <strong class="truncate">{{ row.hostname }}</strong>
              </div>
              <el-tag v-if="row.wireless" size="small" type="success">{{ row.bandLabel }}</el-tag>
              <el-tag v-else size="small" type="info">有线</el-tag>
            </div>
            <div class="mobile-line">
              <span>IP</span>
              <span class="mono">{{ row.ip }}</span>
            </div>
            <div class="mobile-line">
              <span>MAC</span>
              <span class="mono">{{ row.mac }}</span>
            </div>
            <div class="mobile-line">
              <span>类型</span>
              <span>{{ identityLabel(row) }} · {{ identityVendor(row) }}</span>
            </div>
            <div v-if="row.wireless" class="mobile-line">
              <span>信号</span>
              <span class="signal-cell">
                <SignalBars :level="signalLevel(row.signal)" :dbm="row.signal" />
                <span class="num">{{ row.signal }} dBm</span>
              </span>
            </div>
          </div>
        </div>

        <EmptyState
          v-if="!filtered.length"
          :icon="Users"
          title="没有匹配的客户端"
          :description="
            clients.length
              ? '换个关键词或切换筛选条件试试。'
              : '设备连接路由器并获取地址后会出现在这里。'
          "
        />
      </PanelCard>

      <p class="page-note">
        需要设置静态租约或调整 DHCP 地址池？
        <a href="#" @click.prevent="goDhcpConfig">前往 DHCP 与主机名</a>
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
  import { computed, ref, shallowRef, watch } from 'vue'
  import { useRouter } from 'vue-router'
  import { Cable, RefreshCw, Search, Users, Wifi } from 'lucide-vue-next'
  import PageHeader from '@/components/PageHeader.vue'
  import PanelCard from '@/components/PanelCard.vue'
  import StatCard from '@/components/StatCard.vue'
  import SignalBars from '@/components/SignalBars.vue'
  import EmptyState from '@/components/EmptyState.vue'
  import { usePolling } from '@/composables/usePolling'
  import { useRefreshSignal } from '@/composables/useRefresh'
  import { api } from '@/api/openwrt'
  import { identifyDevice } from '@/api/identify'
  import type { IdentifyProbe } from '@/api/identify'
  import type { DhcpLease, HostHint, Station, WirelessRadio } from '@/api/types'
  import { formatAgo, formatLinkRate, formatUptime, signalLevel } from '@/utils/format'
  import { buildWifiMeta, mergeClients } from '@/utils/clients'
  import type { ClientRow } from '@/utils/clients'
  import { identify } from '@/utils/identify'
  import type { DeviceIdentity } from '@/utils/identify'

  defineOptions({ name: 'ClientsView' })

  type Filter = 'all' | 'wireless' | 'wired'

  // Replaced wholesale on every poll; deep reactivity would only add proxies.
  const leases = shallowRef<DhcpLease[]>([])
  const stations = shallowRef<Record<string, Station[]>>({})
  const hints = shallowRef<Record<string, HostHint>>({})
  const wireless = shallowRef<Record<string, WirelessRadio>>({})
  const probes = ref<Record<string, IdentifyProbe | null>>({})
  const probing = ref<Record<string, boolean>>({})
  const search = ref('')
  const filter = ref<Filter>('all')
  const refreshSignal = useRefreshSignal()
  const router = useRouter()

  // Probe results are cached per MAC, not per IP: a device keeps its identity
  // when DHCP moves it, and a changed IP invalidates the cache explicitly.
  const PROBE_TTL = 7 * 24 * 60 * 60 * 1000
  const MAX_PROBES = 2
  const pending: Array<{ mac: string; ip: string }> = []
  const queued = new Set<string>()
  let activeProbes = 0

  const filters: Array<{ value: Filter; label: string }> = [
    { value: 'all', label: '全部' },
    { value: 'wireless', label: '无线' },
    { value: 'wired', label: '有线' }
  ]

  const wifiMeta = computed(() => buildWifiMeta(wireless.value))
  const clients = computed(() =>
    mergeClients(leases.value, stations.value, hints.value, wifiMeta.value)
  )

  interface ProbeCache {
    at: number
    ip: string
    probe: IdentifyProbe
  }

  function cacheKey(mac: string): string {
    return `owrt-identify:${mac.toUpperCase()}`
  }

  function readCache(mac: string, ip: string): IdentifyProbe | null {
    try {
      const raw = localStorage.getItem(cacheKey(mac))
      if (!raw) return null
      const cached = JSON.parse(raw) as ProbeCache
      if (!cached?.at || cached.ip !== ip || Date.now() - cached.at > PROBE_TTL) return null
      return cached.probe ?? null
    } catch {
      return null
    }
  }

  function writeCache(mac: string, ip: string, probe: IdentifyProbe): void {
    try {
      const payload: ProbeCache = { at: Date.now(), ip, probe }
      localStorage.setItem(cacheKey(mac), JSON.stringify(payload))
    } catch {
      // Private mode or a full quota: the probe still works for this visit.
    }
  }

  function dropCache(mac: string): void {
    try {
      localStorage.removeItem(cacheKey(mac))
    } catch {
      // Nothing to do; the in-memory entry is dropped by the caller.
    }
  }

  function pump(): void {
    while (activeProbes < MAX_PROBES && pending.length > 0) {
      const job = pending.shift()
      if (!job) break
      queued.delete(job.mac)
      activeProbes += 1
      probing.value[job.mac] = true
      void identifyDevice(job.ip)
        .then((probe) => {
          probes.value[job.mac] = probe
          if (probe) writeCache(job.mac, job.ip, probe)
        })
        .catch(() => {
          probes.value[job.mac] = null
        })
        .finally(() => {
          activeProbes -= 1
          delete probing.value[job.mac]
          pump()
        })
    }
  }

  function enqueue(mac: string, ip: string): void {
    const key = mac.toUpperCase()
    if (queued.has(key) || probing.value[key] || probes.value[key] !== undefined) return
    if (!/^\d{1,3}(\.\d{1,3}){3}$/.test(ip)) return
    queued.add(key)
    pending.push({ mac: key, ip })
    pump()
  }

  const identities = computed<Record<string, DeviceIdentity>>(() => {
    const map: Record<string, DeviceIdentity> = {}
    for (const row of clients.value) {
      const key = row.mac.toUpperCase()
      map[key] = identify({
        mac: row.mac,
        hostname: row.hostname,
        band: row.band,
        ht: row.ht,
        vht: row.vht,
        he: row.he,
        probe: probes.value[key]
      })
    }
    return map
  })

  function identityOf(row: ClientRow): DeviceIdentity | undefined {
    return identities.value[row.mac.toUpperCase()]
  }

  function identityLabel(row: ClientRow): string {
    const key = row.mac.toUpperCase()
    if (probing.value[key] && probes.value[key] === undefined) return '识别中…'
    return identityOf(row)?.label ?? '未知设备'
  }

  function identityVendor(row: ClientRow): string {
    return identityOf(row)?.vendor ?? '未知厂商'
  }

  function identityTagType(row: ClientRow): 'success' | 'info' | 'warning' | 'danger' {
    switch (identityOf(row)?.kind) {
      case 'phone':
      case 'tablet':
        return 'success'
      case 'tv':
      case 'iot':
        return 'warning'
      case 'camera':
        return 'danger'
      default:
        return 'info'
    }
  }

  function reprobe(row: ClientRow): void {
    const key = row.mac.toUpperCase()
    if (probing.value[key]) return
    dropCache(key)
    delete probes.value[key]
    enqueue(key, row.ip)
  }

  const wirelessCount = computed(() => clients.value.filter((row) => row.wireless).length)
  const otherCount = computed(() => Math.max(0, clients.value.length - wirelessCount.value))

  /** Aggregates the bands the wireless rows actually report. */
  const wirelessBandMeta = computed(() => {
    const counts = new Map<string, number>()
    for (const row of clients.value) {
      if (!row.wireless) continue
      const label = row.bandLabel && row.bandLabel !== '—' ? row.bandLabel : '未知频段'
      counts.set(label, (counts.get(label) ?? 0) + 1)
    }
    if (!counts.size) return '暂无无线终端'

    const order = ['2.4 GHz', '5 GHz', '6 GHz']
    return [...counts.entries()]
      .sort(([left], [right]) => {
        const leftIndex = order.indexOf(left)
        const rightIndex = order.indexOf(right)
        if (leftIndex === -1 && rightIndex === -1) return left.localeCompare(right)
        if (leftIndex === -1) return 1
        if (rightIndex === -1) return -1
        return leftIndex - rightIndex
      })
      .map(([label, count]) => `${count} 台 ${label}`)
      .join(' · ')
  })

  const filtered = computed(() => {
    const term = search.value.trim().toLowerCase()
    return clients.value
      .filter((row) => {
        if (filter.value === 'wireless' && !row.wireless) return false
        if (filter.value === 'wired' && row.wireless) return false
        if (!term) return true
        const identity = identities.value[row.mac.toUpperCase()]
        return (
          row.hostname.toLowerCase().includes(term) ||
          row.ip.toLowerCase().includes(term) ||
          row.mac.toLowerCase().includes(term) ||
          (identity?.label.toLowerCase().includes(term) ?? false) ||
          (identity?.vendor.toLowerCase().includes(term) ?? false)
        )
      })
      .sort((a, b) => {
        if (a.wireless !== b.wireless) return a.wireless ? -1 : 1
        if (a.wireless && b.wireless) return (b.signal ?? -999) - (a.signal ?? -999)
        return a.ip.localeCompare(b.ip, undefined, { numeric: true })
      })
  })

  function leaseText(expires: number): string {
    const remaining = expires - Date.now() / 1000
    return remaining > 0 ? `剩余 ${formatUptime(remaining)}` : '已过期'
  }

  function initialOf(name: string): string {
    return name.trim().slice(0, 1).toUpperCase() || '?'
  }

  function goDhcpConfig(): void {
    void router.push({ name: 'config-system' })
  }

  const { loaded, error, refreshing, refresh } = usePolling(async () => {
    const [nextLeases, nextStations, nextHints, nextWireless] = await Promise.all([
      api.dhcpLeases(),
      api.stations().catch(() => ({})),
      api.hostHints(),
      api.wireless()
    ])
    leases.value = nextLeases
    stations.value = nextStations
    hints.value = nextHints
    wireless.value = nextWireless
  }, 10000)

  watch(refreshSignal, () => void refresh())

  // Identify each client once. Cached results survive reloads; a row whose IP
  // changed is probed again, and the per-row button forces a fresh probe.
  watch(
    clients,
    (rows) => {
      for (const row of rows) {
        const key = row.mac.toUpperCase()
        if (probes.value[key] !== undefined || probing.value[key] || queued.has(key)) continue
        const cached = readCache(key, row.ip)
        if (cached) {
          probes.value[key] = cached
          continue
        }
        enqueue(key, row.ip)
      }
    },
    { immediate: true }
  )
</script>

<style scoped>
  /* Element Plus 给相邻按钮加了 12px 左边距，和外层 flex 的 gap 叠加后
     同一行的按钮会被拉到 20px 间距；这里把间距统一交回给 gap 控制。 */
  .el-button + .el-button {
    margin-left: 0;
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

  .client-toolbar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding: 14px 16px;
    border-bottom: 1px solid var(--border);
  }

  .client-search {
    max-width: 320px;
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

  .signal-cell {
    display: flex;
    align-items: center;
    gap: 7px;
    color: var(--text-secondary);
    font-size: 12px;
  }

  .type-cell {
    display: flex;
    align-items: center;
    gap: 6px;
    min-width: 0;
  }

  .type-vendor {
    overflow: hidden;
    color: var(--text-muted);
    font-size: 11.5px;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .type-refresh {
    display: inline-flex;
    flex-shrink: 0;
    align-items: center;
    justify-content: center;
    width: 22px;
    height: 22px;
    color: var(--text-muted);
    cursor: pointer;
    background: transparent;
    border: 0;
    border-radius: var(--radius-sm);
  }

  .type-refresh:hover {
    color: var(--text);
    background: var(--surface-2);
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
    .client-toolbar {
      align-items: stretch;
      flex-direction: column;
      padding: 12px 16px;
    }

    .client-search {
      max-width: none;
    }
  }
</style>
