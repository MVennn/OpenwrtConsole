<template>
  <div class="page">
    <PageHeader title="网络" description="接口地址、网关、DNS 与设备流量">
      <el-button :icon="RefreshCw" :loading="refreshing" @click="refresh">刷新</el-button>
    </PageHeader>

    <el-alert v-if="error" type="error" :title="error?.message || '操作失败'" :closable="false" show-icon />

    <template v-if="loaded">
      <div class="grid grid-3">
        <section v-for="item in summaries" :key="item.key" class="card iface-card">
          <div class="iface-card-head">
            <div class="iface-heading">
              <span class="iface-dot" :class="{ up: item.data?.up }" />
              <div>
                <h2 class="iface-name">{{ item.label }}</h2>
                <p class="iface-proto-text">{{ protoLabel(item.data?.proto) }}</p>
              </div>
            </div>
            <StatusBadge
              :tone="item.data?.up ? 'success' : 'danger'"
              :label="item.data?.up ? '在线' : '离线'"
            />
          </div>

          <div class="iface-address">
            <span class="iface-address-label">
              {{ item.ipv6 ? 'IPv6 地址' : 'IPv4 地址' }}
            </span>
            <strong class="iface-address-value mono" :title="item.ipv6 ? ipv6Of(item.data) : ipv4Of(item.data)">
              {{ item.ipv6 ? ipv6Of(item.data) : ipv4Of(item.data) }}
            </strong>
            <span
              v-if="item.ipv6 && ipv6PrefixOf(item.data)"
              class="iface-address-note"
            >
              下发前缀 {{ ipv6PrefixOf(item.data) }}
            </span>
          </div>

          <dl class="kv-grid iface-kv">
            <div class="kv">
              <dt>网关</dt>
              <dd class="mono">{{ gatewayOf(item.data) }}</dd>
            </div>
            <div class="kv">
              <dt>DNS</dt>
              <dd class="mono" :title="dnsOf(item.data)">{{ dnsOf(item.data) }}</dd>
            </div>
            <div class="kv">
              <dt>设备</dt>
              <dd class="mono">{{ wanDeviceName(item.data) || '—' }}</dd>
            </div>
            <div class="kv">
              <dt>已运行</dt>
              <dd>{{ formatUptime(item.data?.uptime) }}</dd>
            </div>
          </dl>

          <div class="iface-traffic">
            <span><ArrowDown :size="13" /> {{ formatBytes(deviceStats(item.data)?.rx_bytes) }}</span>
            <span><ArrowUp :size="13" /> {{ formatBytes(deviceStats(item.data)?.tx_bytes) }}</span>
          </div>
        </section>
      </div>

      <PanelCard title="所有接口" subtitle="不含 loopback" flush>
        <div class="desktop-only">
          <el-table :data="interfaceRows" style="width: 100%">
            <el-table-column label="接口" min-width="130">
              <template #default="{ row }">
                <div class="table-primary">{{ row.interface.toUpperCase() }}</div>
                <div class="table-sub">{{ protoLabel(row.proto) }}</div>
              </template>
            </el-table-column>
            <el-table-column label="状态" width="96">
              <template #default="{ row }">
                <StatusBadge
                  :tone="row.up ? 'success' : 'neutral'"
                  :label="row.up ? '在线' : '离线'"
                />
              </template>
            </el-table-column>
            <el-table-column label="设备" min-width="110">
              <template #default="{ row }">
                <span class="mono table-mono">{{ wanDeviceName(row) || '—' }}</span>
              </template>
            </el-table-column>
            <el-table-column label="IPv4" min-width="140">
              <template #default="{ row }">
                <span class="mono table-mono">{{ ipv4Of(row) }}</span>
              </template>
            </el-table-column>
            <el-table-column label="网关" min-width="130">
              <template #default="{ row }">
                <span class="mono table-mono">{{ gatewayOf(row) }}</span>
              </template>
            </el-table-column>
            <el-table-column label="运行时间" min-width="120">
              <template #default="{ row }">{{ formatUptime(row.uptime) }}</template>
            </el-table-column>
            <el-table-column label="接收 / 发送" min-width="150" align="right">
              <template #default="{ row }">
                <span class="table-mono num">
                  ↓ {{ formatBytes(deviceStats(row)?.rx_bytes) }} · ↑
                  {{ formatBytes(deviceStats(row)?.tx_bytes) }}
                </span>
              </template>
            </el-table-column>
          </el-table>
        </div>

        <div class="mobile-only mobile-list">
          <div v-for="row in interfaceRows" :key="row.interface" class="mobile-row">
            <div class="mobile-row-head">
              <strong>{{ row.interface.toUpperCase() }}</strong>
              <StatusBadge :tone="row.up ? 'success' : 'neutral'" :label="row.up ? '在线' : '离线'" />
            </div>
            <div class="mobile-line">
              <span>IPv4</span>
              <span class="mono">{{ ipv4Of(row) }}</span>
            </div>
            <div class="mobile-line">
              <span>网关</span>
              <span class="mono">{{ gatewayOf(row) }}</span>
            </div>
            <div class="mobile-line">
              <span>流量</span>
              <span class="num">
                ↓ {{ formatBytes(deviceStats(row)?.rx_bytes) }} · ↑
                {{ formatBytes(deviceStats(row)?.tx_bytes) }}
              </span>
            </div>
          </div>
        </div>
      </PanelCard>

      <PanelCard title="网络设备" subtitle="物理与虚拟设备计数" flush>
        <el-table :data="deviceRows" style="width: 100%" class="desktop-only">
          <el-table-column label="设备" min-width="130">
            <template #default="{ row }">
              <span class="mono table-mono">{{ row.name }}</span>
            </template>
          </el-table-column>
          <el-table-column label="类型" width="90">
            <template #default="{ row }">
              <el-tag size="small" :type="deviceType(row).tone">{{ deviceType(row).label }}</el-tag>
            </template>
          </el-table-column>
          <el-table-column label="状态" width="90">
            <template #default="{ row }">
              <span class="state-dot" :class="{ up: row.up }" />
              {{ row.up ? '启用' : '关闭' }}
            </template>
          </el-table-column>
          <el-table-column label="主设备" min-width="110">
            <template #default="{ row }">
              <span class="mono table-mono">{{ row.master || '—' }}</span>
            </template>
          </el-table-column>
          <el-table-column label="接收" min-width="110" align="right">
            <template #default="{ row }">{{ formatBytes(row.stats?.rx_bytes) }}</template>
          </el-table-column>
          <el-table-column label="发送" min-width="110" align="right">
            <template #default="{ row }">{{ formatBytes(row.stats?.tx_bytes) }}</template>
          </el-table-column>
          <el-table-column label="错误 / 丢包" min-width="120" align="right">
            <template #default="{ row }">
              <span class="num">
                {{ (row.stats?.rx_errors ?? 0) + (row.stats?.tx_errors ?? 0) }} /
                {{ (row.stats?.rx_dropped ?? 0) + (row.stats?.tx_dropped ?? 0) }}
              </span>
            </template>
          </el-table-column>
        </el-table>

        <div class="mobile-only mobile-list">
          <div v-for="row in deviceRows" :key="row.name" class="mobile-row">
            <div class="mobile-row-head">
              <strong class="mono">{{ row.name }}</strong>
              <span class="state-dot" :class="{ up: row.up }" />
            </div>
            <div class="mobile-line">
              <span>类型</span>
              <span>{{ deviceType(row).label }}</span>
            </div>
            <div class="mobile-line">
              <span>流量</span>
              <span class="num">
                ↓ {{ formatBytes(row.stats?.rx_bytes) }} · ↑ {{ formatBytes(row.stats?.tx_bytes) }}
              </span>
            </div>
          </div>
        </div>
      </PanelCard>

      <p class="page-note">
        需要修改接口协议或 VLAN？
        <a href="#" @click.prevent="goNetworkConfig">前往网络配置</a>。
        需要调整 DHCP 地址池？
        <a href="#" @click.prevent="goDhcpConfig">前往 DHCP 与主机名</a>。
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
  import { computed, shallowRef, watch } from 'vue'
  import { useRouter } from 'vue-router'
  import { ArrowDown, ArrowUp, RefreshCw } from 'lucide-vue-next'
  import PageHeader from '@/components/PageHeader.vue'
  import PanelCard from '@/components/PanelCard.vue'
  import StatusBadge from '@/components/StatusBadge.vue'
  import { usePolling } from '@/composables/usePolling'
  import { useRefreshSignal } from '@/composables/useRefresh'
  import { api } from '@/api/openwrt'
  import type { NetworkDevice, NetworkInterface } from '@/api/types'
  import { formatBytes, formatUptime, ipv4Of, ipv6Of, protoLabel } from '@/utils/format'
  import { pickWanInterfaces, wanDeviceName } from '@/utils/network'

  defineOptions({ name: 'NetworkView' })

  // Replaced wholesale on every poll; deep reactivity would only add proxies.
  const interfaces = shallowRef<NetworkInterface[]>([])
  const devices = shallowRef<NetworkDevice[]>([])
  const refreshSignal = useRefreshSignal()
  const router = useRouter()

  /** WAN / WAN6 / LAN resolved by role, not by a hard-coded interface name. */
  const pickedInterfaces = computed(() => pickWanInterfaces(interfaces.value))

  const summaries = computed(() => [
    { key: 'wan', label: 'WAN 广域网', data: pickedInterfaces.value.wan, ipv6: false },
    { key: 'wan6', label: 'IPv6 广域网', data: pickedInterfaces.value.wan6, ipv6: true },
    { key: 'lan', label: 'LAN 局域网', data: pickedInterfaces.value.lan, ipv6: false }
  ])

  const interfaceRows = computed(() =>
    [...interfaces.value]
      .filter((item) => item.interface !== 'loopback')
      .sort((a, b) => order(a) - order(b))
  )

  const deviceRows = computed(() =>
    [...devices.value].sort((a, b) => a.name.localeCompare(b.name))
  )

  function order(iface: NetworkInterface): number {
    if (iface === pickedInterfaces.value.wan) return 0
    if (iface === pickedInterfaces.value.wan6) return 1
    if (iface === pickedInterfaces.value.lan) return 2
    return 9
  }

  function gatewayOf(iface: NetworkInterface | undefined): string {
    if (!iface?.route?.length) return '—'
    const route = iface.route.find((item) => item.target === '0.0.0.0' || item.target === '::')
    return route?.nexthop || '—'
  }

  function dnsOf(iface: NetworkInterface | undefined): string {
    return iface?.['dns-server']?.join(', ') || '—'
  }

  function ipv6PrefixOf(iface: NetworkInterface | undefined): string {
    const prefix = iface?.['ipv6-prefix-assignment']?.[0]
    return prefix ? `${prefix.address}/${prefix.mask}` : ''
  }

  function deviceStats(iface: NetworkInterface | undefined) {
    if (!iface) return undefined
    const name = wanDeviceName(iface)
    return devices.value.find((device) => device.name === name)?.stats
  }

  function deviceType(device: NetworkDevice): { label: string; tone: 'primary' | 'success' | 'info' | 'warning' } {
    if (device.wireless) return { label: '无线', tone: 'success' }
    if (/^(br-|lo$|wg|tun|veth|docker|ifb|bond|ppp|gre|sit|6rd|ip6tnl)/.test(device.name)) {
      return { label: '虚拟', tone: 'info' }
    }
    return { label: '有线', tone: 'primary' }
  }

  function goNetworkConfig(): void {
    void router.push({ name: 'config-network' })
  }

  function goDhcpConfig(): void {
    void router.push({ name: 'config-system' })
  }

  const { loaded, error, refreshing, refresh } = usePolling(async () => {
    const [nextInterfaces, nextDevices] = await Promise.all([
      api.interfaces(),
      api.networkDevices()
    ])
    interfaces.value = nextInterfaces
    devices.value = nextDevices
  }, 10000)

  watch(refreshSignal, () => void refresh())
</script>

<style scoped>
  /* Element Plus 给相邻按钮加了 12px 左边距，和外层 flex 的 gap 叠加后
     同一行的按钮会被拉到 20px 间距；这里把间距统一交回给 gap 控制。 */
  .el-button + .el-button {
    margin-left: 0;
  }

  .iface-card {
    display: flex;
    flex-direction: column;
    padding: 18px 20px 16px;
  }

  .iface-card-head {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 10px;
  }

  .iface-heading {
    display: flex;
    align-items: center;
    gap: 9px;
  }

  .iface-dot {
    width: 8px;
    height: 8px;
    background: var(--text-faint);
    border-radius: 50%;
  }

  .iface-dot.up {
    background: var(--success);
    box-shadow: 0 0 0 3px var(--success-soft);
  }

  .iface-name {
    color: var(--text);
    font-size: var(--text-sm);
    font-weight: 600;
    line-height: 1.3;
  }

  .iface-proto-text {
    margin-top: 1px;
    color: var(--text-muted);
    font-size: 11px;
  }

  .iface-address {
    display: flex;
    flex-direction: column;
    gap: 2px;
    margin: 18px 0 14px;
    padding-bottom: 14px;
    border-bottom: 1px solid var(--border);
  }

  .iface-address-label {
    color: var(--text-muted);
    font-size: 11px;
  }

  .iface-address-value {
    overflow: hidden;
    color: var(--text);
    font-size: 18px;
    font-weight: 600;
    letter-spacing: -0.02em;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .iface-address-note {
    overflow: hidden;
    color: var(--text-muted);
    font-size: 11px;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .iface-kv {
    margin: 0;
  }

  .iface-traffic {
    display: flex;
    align-items: center;
    gap: 14px;
    margin-top: 14px;
    padding-top: 12px;
    color: var(--text-muted);
    font-size: 11.5px;
    border-top: 1px solid var(--border);
  }

  .iface-traffic span {
    display: inline-flex;
    align-items: center;
    gap: 4px;
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

  .state-dot {
    display: inline-block;
    width: 6px;
    height: 6px;
    margin-right: 5px;
    background: var(--text-faint);
    border-radius: 50%;
    vertical-align: 1px;
  }

  .state-dot.up {
    background: var(--success);
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
</style>
