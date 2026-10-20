<template>
  <div class="page">
    <PageHeader title="DNS 与主机名" description="dnsmasq 上游、地址池与主机租约一览">
      <el-button :icon="RefreshCw" :loading="refreshing" @click="refresh">刷新</el-button>
      <el-button type="primary" @click="goDhcpConfig">DHCP 与主机名</el-button>
    </PageHeader>

    <el-alert v-if="error" type="error" :title="error?.message || '操作失败'" :closable="false" show-icon />
    <el-alert
      v-if="partialError"
      type="warning"
      :title="partialError"
      :closable="false"
      show-icon
    />

    <template v-if="loaded">
      <div class="grid grid-4">
        <StatCard
          label="DNS 上游"
          :value="upstreamServers.length"
          suffix="个"
          :meta="upstreamMeta"
          :icon="Globe"
          tone="brand"
        />
        <StatCard
          label="地址池"
          :value="poolCapacity"
          suffix="个地址"
          :meta="poolMeta"
          :icon="Network"
          tone="success"
        />
        <StatCard
          label="DNS 缓存"
          :value="cacheSize"
          suffix="条"
          :meta="cacheMeta"
          :icon="Database"
          tone="neutral"
        />
        <StatCard
          label="当前租约"
          :value="leases.length"
          suffix="个"
          :meta="leaseMeta"
          :icon="Users"
          tone="warning"
        />
      </div>

      <div class="grid grid-2">
        <PanelCard title="DNS 上游" subtitle="dnsmasq 的上游解析与搜索域">
          <div class="stack">
            <div class="block">
              <p class="block-label">上游 DNS</p>
              <div v-if="upstreamServers.length" class="chip-list">
                <span v-for="server in upstreamServers" :key="server" class="pill mono">
                  {{ server }}
                </span>
              </div>
              <p v-else class="muted text-xs">未配置上游 DNS，dnsmasq 将直接使用系统解析器。</p>
            </div>

            <div class="block">
              <p class="block-label">搜索域</p>
              <div v-if="searchDomains.length" class="chip-list">
                <span v-for="domain in searchDomains" :key="domain" class="pill">
                  {{ domain }}
                </span>
              </div>
              <p v-else class="muted text-xs">未配置搜索域。</p>
            </div>

            <dl class="kv-grid">
              <div class="kv">
                <dt>解析来源</dt>
                <dd>
                  <StatusBadge :label="upstreamSourceLabel" :tone="upstreamSourceTone" />
                </dd>
              </div>
              <div class="kv">
                <dt>本地解析</dt>
                <dd>
                  <StatusBadge
                    :label="settings.localservice ? '仅本地网络' : '全部客户端'"
                    :tone="settings.localservice ? 'success' : 'neutral'"
                  />
                </dd>
              </div>
              <div class="kv">
                <dt>监听端口</dt>
                <dd class="mono">{{ settings.port }}</dd>
              </div>
              <div class="kv">
                <dt>系统解析器</dt>
                <dd class="mono truncate" :title="systemResolvers">{{ systemResolvers }}</dd>
              </div>
            </dl>
          </div>
        </PanelCard>

        <PanelCard title="地址池" subtitle="DHCP 下发的地址范围">
          <div v-if="pools.length" class="stack">
            <div v-for="(pool, index) in pools" :key="`${pool.interface}-${pool.start}-${index}`" class="block">
              <p class="block-label">
                {{ pool.interface ? `${pool.interface} 接口` : 'dhcp_option 范围' }}
              </p>
              <dl class="kv-grid">
                <div class="kv">
                  <dt>起始地址</dt>
                  <dd class="mono">{{ pool.start }}</dd>
                </div>
                <div class="kv">
                  <dt>结束地址</dt>
                  <dd class="mono">{{ pool.end }}</dd>
                </div>
                <div class="kv">
                  <dt>掩码 / 数量</dt>
                  <dd class="mono">{{ pool.limit || '—' }}</dd>
                </div>
                <div class="kv">
                  <dt>可用地址</dt>
                  <dd class="num">{{ pool.capacity }}</dd>
                </div>
              </dl>
            </div>
          </div>

          <EmptyState
            v-else
            :icon="Network"
            title="没有找到地址池"
            description="dhcp 配置中没有 dhcp_option 范围，也没有带起始偏移的 DHCP 段。"
          />

          <template v-if="settings.options.length" #footer>
            <span>dhcp_option</span>
            <span class="mono truncate" :title="settings.options.join(' · ')">
              {{ settings.options.join(' · ') }}
            </span>
          </template>
        </PanelCard>
      </div>

      <PanelCard title="静态租约" subtitle="固定 MAC 与地址的绑定关系" flush>
        <template #actions>
          <span class="count-badge">{{ settings.staticLeases.length }}</span>
        </template>

        <div v-if="settings.staticLeases.length" class="desktop-only">
          <el-table :data="staticLeaseRows" style="width: 100%">
            <el-table-column label="主机名" min-width="160">
              <template #default="{ row }">
                <span class="table-primary">{{ row.name || '—' }}</span>
              </template>
            </el-table-column>
            <el-table-column label="MAC 地址" min-width="150">
              <template #default="{ row }">
                <span class="mono table-mono">{{ row.mac || '—' }}</span>
              </template>
            </el-table-column>
            <el-table-column label="IP 地址" min-width="140">
              <template #default="{ row }">
                <span class="mono table-mono">{{ row.ip || '—' }}</span>
              </template>
            </el-table-column>
          </el-table>
        </div>

        <div v-if="settings.staticLeases.length" class="mobile-only mobile-list">
          <div v-for="row in staticLeaseRows" :key="row.key" class="mobile-row">
            <div class="mobile-row-head">
              <strong class="truncate">{{ row.name || '未命名' }}</strong>
              <span class="mono">{{ row.ip || '—' }}</span>
            </div>
            <div class="mobile-line">
              <span>MAC</span>
              <span class="mono">{{ row.mac || '—' }}</span>
            </div>
          </div>
        </div>

        <EmptyState
          v-if="!settings.staticLeases.length"
          :icon="KeyRound"
          title="没有静态租约"
          description="在 DHCP 与主机名页添加固定地址后，这里会列出绑定关系。"
        />
      </PanelCard>

      <PanelCard title="当前租约" subtitle="dnsmasq 正在下发的地址" flush>
        <template #actions>
          <span class="count-badge">{{ leases.length }}</span>
        </template>

        <div v-if="leases.length" class="desktop-only">
          <el-table :data="leaseRows" style="width: 100%">
            <el-table-column label="主机名" min-width="160">
              <template #default="{ row }">
                <span class="table-primary">{{ row.hostname || '未命名' }}</span>
              </template>
            </el-table-column>
            <el-table-column label="MAC 地址" min-width="150">
              <template #default="{ row }">
                <span class="mono table-mono">{{ row.mac }}</span>
              </template>
            </el-table-column>
            <el-table-column label="IP 地址" min-width="140">
              <template #default="{ row }">
                <span class="mono table-mono">{{ row.ip }}</span>
              </template>
            </el-table-column>
            <el-table-column label="剩余有效期" min-width="130" align="right">
              <template #default="{ row }">
                <span v-if="row.remaining > 0" class="num" :title="formatUptime(row.remaining)">
                  {{ formatDurationShort(row.remaining) }}
                </span>
                <StatusBadge v-else label="已过期" tone="warning" />
              </template>
            </el-table-column>
          </el-table>
        </div>

        <div v-if="leases.length" class="mobile-only mobile-list">
          <div v-for="row in leaseRows" :key="row.key" class="mobile-row">
            <div class="mobile-row-head">
              <strong class="truncate">{{ row.hostname || '未命名' }}</strong>
              <span v-if="row.remaining > 0" class="num">{{ formatDurationShort(row.remaining) }}</span>
              <StatusBadge v-else label="已过期" tone="warning" />
            </div>
            <div class="mobile-line">
              <span>IP</span>
              <span class="mono">{{ row.ip }}</span>
            </div>
            <div class="mobile-line">
              <span>MAC</span>
              <span class="mono">{{ row.mac }}</span>
            </div>
          </div>
        </div>

        <EmptyState
          v-if="!leases.length"
          :icon="Users"
          title="没有活动租约"
          description="设备获取到地址后，租约会出现在这里。"
        />
      </PanelCard>

      <PanelCard title="自定义主机名" subtitle="dnsmasq 静态主机记录" flush>
        <template #actions>
          <span class="count-badge">{{ hosts.length }}</span>
        </template>

        <div v-if="hosts.length" class="desktop-only">
          <el-table :data="hostRows" style="width: 100%">
            <el-table-column label="IP 地址" min-width="180">
              <template #default="{ row }">
                <span class="mono table-mono">{{ row.ip }}</span>
                <el-tag v-if="row.ipv6" size="small" type="info" class="ip-tag">IPv6</el-tag>
              </template>
            </el-table-column>
            <el-table-column label="名称" min-width="220">
              <template #default="{ row }">
                <div class="chip-list">
                  <span v-for="name in row.names" :key="name" class="pill">{{ name }}</span>
                </div>
              </template>
            </el-table-column>
          </el-table>
        </div>

        <div v-if="hosts.length" class="mobile-only mobile-list">
          <div v-for="row in hostRows" :key="row.key" class="mobile-row">
            <div class="mobile-row-head">
              <strong class="mono truncate">{{ row.ip }}</strong>
              <el-tag v-if="row.ipv6" size="small" type="info">IPv6</el-tag>
            </div>
            <div class="mobile-line">
              <span>名称</span>
              <span class="truncate">{{ row.names.join('、') || '—' }}</span>
            </div>
          </div>
        </div>

        <EmptyState
          v-if="!hosts.length"
          :icon="Server"
          title="没有自定义主机名"
          description="在 /etc/hosts 或 DHCP 与主机名页的主机记录中配置后，这里会列出解析结果。"
        />
      </PanelCard>

      <p class="page-note">
        需要调整上游 DNS、地址池或租约时长？
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
  import { computed, ref, watch } from 'vue'
  import { useRouter } from 'vue-router'
  import { Database, Globe, KeyRound, Network, RefreshCw, Server, Users } from 'lucide-vue-next'
  import PageHeader from '@/components/PageHeader.vue'
  import PanelCard from '@/components/PanelCard.vue'
  import StatCard from '@/components/StatCard.vue'
  import StatusBadge from '@/components/StatusBadge.vue'
  import EmptyState from '@/components/EmptyState.vue'
  import { usePolling } from '@/composables/usePolling'
  import { useRefreshSignal } from '@/composables/useRefresh'
  import {
    getDhcpSettings,
    getHosts,
    getInterfaceAddresses,
    getLeases,
    getResolvConfig,
    resolvePools,
    type DhcpPool,
    type DhcpSettings,
    type HostEntry,
    type Lease
  } from '@/api/dns'
  import { formatDurationShort, formatUptime } from '@/utils/format'

  defineOptions({ name: 'DnsView' })

  const settings = ref<DhcpSettings>({
    servers: [],
    cacheSize: 0,
    noresolv: false,
    port: 53,
    localservice: false,
    options: [],
    optionRanges: [],
    poolSpecs: [],
    staticLeases: []
  })
  const pools = ref<DhcpPool[]>([])
  const leases = ref<Lease[]>([])
  const hosts = ref<HostEntry[]>([])
  const nameservers = ref<string[]>([])
  const searchDomains = ref<string[]>([])
  const partialError = ref('')
  const refreshSignal = useRefreshSignal()
  const router = useRouter()

  const upstreamServers = computed(() =>
    settings.value.servers.length ? settings.value.servers : nameservers.value
  )

  const upstreamSourceLabel = computed(() =>
    settings.value.servers.length ? '自定义上游' : '跟随系统解析器'
  )

  const upstreamSourceTone = computed<'brand' | 'neutral'>(() =>
    settings.value.servers.length ? 'brand' : 'neutral'
  )

  const upstreamMeta = computed(() =>
    settings.value.servers.length
      ? '来自 dnsmasq 的 list server 配置'
      : '取自 /etc/resolv.conf.auto'
  )

  const systemResolvers = computed(() => nameservers.value.join('、') || '—')

  const poolCapacity = computed(() =>
    pools.value.reduce((total, pool) => total + pool.capacity, 0)
  )

  const poolMeta = computed(() => {
    if (!pools.value.length) return '未配置地址池'
    const first = pools.value[0]
    return `${first.start} – ${first.end}`
  })

  const cacheSize = computed(() => settings.value.cacheSize)
  const cacheMeta = computed(() =>
    settings.value.cacheSize ? 'DNS 缓存条目上限' : '未启用缓存'
  )

  const leaseMeta = computed(() => {
    const named = leases.value.filter((lease) => lease.hostname).length
    return leases.value.length ? `${named} 个带主机名` : '当前没有租约'
  })

  const staticLeaseRows = computed(() =>
    settings.value.staticLeases.map((lease, index) => ({
      key: `${lease.mac}-${lease.ip}-${index}`,
      name: lease.name,
      mac: lease.mac,
      ip: lease.ip
    }))
  )

  const leaseRows = computed(() =>
    leases.value
      .map((lease) => ({
        key: `${lease.mac}-${lease.ip}`,
        hostname: lease.hostname,
        mac: lease.mac,
        ip: lease.ip,
        remaining: Number(lease.expiry) - Date.now() / 1000
      }))
      .sort((a, b) => b.remaining - a.remaining)
  )

  const hostRows = computed(() =>
    hosts.value.map((host, index) => ({
      key: `${host.ip}-${index}`,
      ip: host.ip,
      names: host.names,
      ipv6: host.ip.includes(':')
    }))
  )

  function goDhcpConfig(): void {
    void router.push({ name: 'config-system' })
  }

  const { loaded, error, refreshing, refresh } = usePolling(async () => {
    // A CGI that cannot be reached is reported as a warning; the rest of the
    // page stays usable instead of failing as a whole.
    const failed: string[] = []

    const [nextSettings, nextLeases, nextHosts, nextResolv] = await Promise.all([
      getDhcpSettings(),
      getLeases().catch(() => {
        failed.push('当前租约')
        return [] as Lease[]
      }),
      getHosts().catch(() => {
        failed.push('自定义主机名')
        return [] as HostEntry[]
      }),
      getResolvConfig().catch(() => {
        failed.push('系统解析器')
        return { nameservers: [] as string[], search: [] as string[] }
      })
    ])

    partialError.value = failed.length ? `读取失败：${failed.join('、')}` : ''

    settings.value = nextSettings
    leases.value = nextLeases
    hosts.value = nextHosts
    nameservers.value = nextResolv.nameservers
    searchDomains.value = nextResolv.search

    // The interface addresses are only needed to resolve the pools that are
    // described by an offset instead of an explicit range.
    const needsAddresses = nextSettings.poolSpecs.length > 0 && !nextSettings.optionRanges.length
    const addresses = needsAddresses ? await getInterfaceAddresses().catch(() => ({})) : {}
    pools.value = resolvePools(nextSettings, addresses)
  }, 15000)

  watch(refreshSignal, () => void refresh())
</script>

<style scoped>
  /* Element Plus 给相邻按钮加了 12px 左边距，和外层 flex 的 gap 叠加后
     同一行的按钮会被拉到 20px 间距；这里把间距统一交回给 gap 控制。 */
  .el-button + .el-button {
    margin-left: 0;
  }

  .block {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .block-label {
    color: var(--text-muted);
    font-size: var(--text-xs);
  }

  .chip-list {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
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

  .table-primary {
    color: var(--text);
    font-size: var(--text-sm);
    font-weight: 500;
  }

  .table-mono {
    color: var(--text-secondary);
    font-size: 12px;
  }

  .ip-tag {
    margin-left: 8px;
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
</style>
