<template>
  <div class="page">
    <PageHeader title="防火墙" description="安全区域策略、端口转发与流量卸载（只读视图）">
      <el-button :icon="RefreshCw" :loading="refreshing" @click="refresh">刷新</el-button>
      <el-button type="primary" @click="goFirewallConfig">防火墙配置</el-button>
    </PageHeader>

    <el-alert v-if="error" type="error" :title="error.message" :closable="false" show-icon />

    <template v-if="loaded">
      <div class="grid grid-4">
        <StatCard
          label="安全区域"
          :value="zones.length"
          :meta="zoneMeta"
          :icon="ShieldCheck"
          tone="brand"
        />
        <StatCard
          label="端口转发"
          :value="redirects.length"
          :meta="redirectMeta"
          :icon="ArrowRightLeft"
          tone="warning"
        />
        <StatCard
          label="出站规则"
          :value="rules.length"
          :meta="ruleMeta"
          :icon="ListFilter"
          tone="neutral"
        />
        <StatCard
          label="流量卸载"
          :value="offload.value"
          :meta="offload.meta"
          :badge="offload.badge"
          :icon="Zap"
          :tone="offload.tone"
        />
      </div>

      <div v-if="zones.length" class="grid grid-3">
        <FirewallZoneCard v-for="zone in zones" :key="zone.id" :zone="zone" />
      </div>

      <PanelCard v-else title="安全区域" subtitle="firewall 配置中的 zone 段">
        <EmptyState
          :icon="ShieldOff"
          title="没有配置安全区域"
          description="路由器未加载 /etc/config/firewall，或该文件中不包含任何 zone 段。"
        />
      </PanelCard>

      <PanelCard title="端口转发" :subtitle="`${redirects.length} 条 redirect 段`" flush>
        <template #actions>
          <span class="count-badge">{{ redirects.length }}</span>
        </template>

        <div v-if="redirects.length" class="desktop-only">
          <el-table :data="redirects" style="width: 100%">
            <el-table-column label="源地址 / 源端口" min-width="160">
              <template #default="{ row }">
                <div class="table-primary">{{ row.src || '—' }}</div>
                <div v-if="row.srcIp || row.srcDport" class="table-sub mono">
                  {{ sourceDetail(row) }}
                </div>
              </template>
            </el-table-column>
            <el-table-column label="目标 IP" min-width="140">
              <template #default="{ row }">
                <span class="mono table-mono">{{ row.destIp || '—' }}</span>
              </template>
            </el-table-column>
            <el-table-column label="协议" width="110">
              <template #default="{ row }">
                <span class="table-mono">{{ protoText(row.proto) }}</span>
              </template>
            </el-table-column>
            <el-table-column label="目标端口" width="110">
              <template #default="{ row }">
                <span class="mono table-mono">{{ row.destPort || '—' }}</span>
              </template>
            </el-table-column>
            <el-table-column label="转发目标" min-width="170">
              <template #default="{ row }">
                <span class="mono table-mono">{{ row.target || row.destIp || '—' }}</span>
              </template>
            </el-table-column>
            <el-table-column label="状态" width="90">
              <template #default="{ row }">
                <StatusBadge
                  :label="row.enabled ? '启用' : '停用'"
                  :tone="row.enabled ? 'success' : 'neutral'"
                />
              </template>
            </el-table-column>
          </el-table>
        </div>

        <div v-if="redirects.length" class="mobile-only mobile-list">
          <div v-for="row in redirects" :key="row.id" class="mobile-row">
            <div class="mobile-row-head">
              <strong class="truncate">{{ row.src || '—' }} → {{ row.target || row.destIp || '—' }}</strong>
              <StatusBadge
                :label="row.enabled ? '启用' : '停用'"
                :tone="row.enabled ? 'success' : 'neutral'"
              />
            </div>
            <div class="mobile-line">
              <span>源地址 / 源端口</span>
              <span class="mono">{{ sourceDetail(row) }}</span>
            </div>
            <div class="mobile-line">
              <span>目标 IP</span>
              <span class="mono">{{ row.destIp || '—' }}</span>
            </div>
            <div class="mobile-line">
              <span>目标端口</span>
              <span class="mono">{{ row.destPort || '—' }}</span>
            </div>
            <div class="mobile-line">
              <span>协议</span>
              <span>{{ protoText(row.proto) }}</span>
            </div>
          </div>
        </div>

        <EmptyState
          v-if="!redirects.length"
          :icon="ArrowRightLeft"
          title="没有端口转发规则"
          description="当前配置中没有 redirect 段，外部流量不会被转发到内网设备。"
        />
      </PanelCard>

      <PanelCard title="出站规则" :subtitle="`${rules.length} 条 rule 段`" flush>
        <template #actions>
          <span class="count-badge">{{ rules.length }}</span>
        </template>

        <div v-if="visibleRules.length" class="desktop-only">
          <el-table :data="visibleRules" style="width: 100%">
            <el-table-column label="名称" min-width="170">
              <template #default="{ row }">
                <span class="table-primary truncate" :title="row.name">{{ row.name || row.id }}</span>
              </template>
            </el-table-column>
            <el-table-column label="源" min-width="120">
              <template #default="{ row }">
                <span class="table-mono">{{ row.src || '—' }}</span>
              </template>
            </el-table-column>
            <el-table-column label="目标" min-width="120">
              <template #default="{ row }">
                <span class="table-mono">{{ row.dest || '—' }}</span>
              </template>
            </el-table-column>
            <el-table-column label="协议" width="120">
              <template #default="{ row }">
                <span class="table-mono">{{ protoText(row.proto) }}</span>
              </template>
            </el-table-column>
            <el-table-column label="动作" width="110">
              <template #default="{ row }">
                <span class="table-mono">{{ row.target || '—' }}</span>
              </template>
            </el-table-column>
            <el-table-column label="状态" width="90">
              <template #default="{ row }">
                <StatusBadge
                  :label="row.enabled ? '启用' : '停用'"
                  :tone="row.enabled ? 'success' : 'neutral'"
                />
              </template>
            </el-table-column>
            <el-table-column label="协议族" width="110">
              <template #default="{ row }">
                <span class="table-mono">{{ familyText(row.family) }}</span>
              </template>
            </el-table-column>
          </el-table>
        </div>

        <div v-if="visibleRules.length" class="mobile-only mobile-list">
          <div v-for="row in visibleRules" :key="row.id" class="mobile-row">
            <div class="mobile-row-head">
              <strong class="truncate">{{ row.name || row.id }}</strong>
              <StatusBadge
                :label="row.enabled ? '启用' : '停用'"
                :tone="row.enabled ? 'success' : 'neutral'"
              />
            </div>
            <div class="mobile-line">
              <span>源 → 目标</span>
              <span class="mono">{{ row.src || '任意' }} → {{ row.dest || '任意' }}</span>
            </div>
            <div class="mobile-line">
              <span>协议 / 动作</span>
              <span>{{ protoText(row.proto) }} · {{ row.target || '—' }}</span>
            </div>
            <div class="mobile-line">
              <span>协议族</span>
              <span>{{ familyText(row.family) }}</span>
            </div>
          </div>
        </div>

        <EmptyState
          v-if="!rules.length"
          :icon="ListFilter"
          title="没有出站规则"
          description="当前配置中没有自定义的流量规则，出站流量完全由区域策略决定。"
        />

        <template v-if="rules.length" #footer>
          <span>共 {{ rules.length }} 条规则</span>
          <span v-if="rules.length > RULE_LIMIT">仅展示前 {{ RULE_LIMIT }} 条</span>
        </template>
      </PanelCard>

      <div class="grid grid-2">
        <PanelCard title="默认策略" subtitle="未命中区域时的兜底行为与防护开关">
          <div class="policy-grid">
            <div v-for="policy in defaultPolicies" :key="policy.key" class="policy-cell">
              <span class="policy-key">{{ policy.key }}</span>
              <StatusBadge
                :label="policy.value || '未设置'"
                :tone="policyTone(policy.value)"
                :dot="false"
              />
            </div>
          </div>

          <div class="switch-list">
            <div class="switch-row">
              <span class="switch-label">SYN Flood 防护</span>
              <StatusBadge :label="flagLabel(defaults.synfloodProtect)" :tone="flagTone(defaults.synfloodProtect)" />
            </div>
            <div class="switch-row">
              <span class="switch-label">丢弃非法数据包</span>
              <StatusBadge :label="flagLabel(defaults.dropInvalid)" :tone="flagTone(defaults.dropInvalid)" />
            </div>
            <div class="switch-row">
              <span class="switch-label">软件流量卸载</span>
              <StatusBadge
                :label="defaults.flowOffloading ? '开启' : '关闭'"
                :tone="defaults.flowOffloading ? 'success' : 'neutral'"
              />
            </div>
            <div class="switch-row">
              <span class="switch-label">硬件流量卸载</span>
              <StatusBadge
                :label="defaults.flowOffloadingHw ? '开启' : '关闭'"
                :tone="defaults.flowOffloadingHw ? 'success' : 'neutral'"
              />
            </div>
          </div>
        </PanelCard>

        <PanelCard title="区域转发" :subtitle="`${forwardings.length} 条 forwarding 段`">
          <div v-if="forwardings.length" class="forward-list">
            <div v-for="item in forwardings" :key="item.id" class="forward-row">
              <span class="forward-zone">{{ item.src || '—' }}</span>
              <ArrowRight :size="14" :stroke-width="2" class="forward-arrow" />
              <span class="forward-zone">{{ item.dest || '—' }}</span>
            </div>
          </div>

          <EmptyState
            v-else
            :icon="Route"
            title="没有区域转发"
            description="没有配置区域之间的流量转发，所有流量都停留在自己的区域内。"
          />
        </PanelCard>
      </div>

      <p class="page-note">
        本页面只读取 /etc/config/firewall，不会写入任何配置。
        需要修改策略？
        <a href="#" @click.prevent="goFirewallConfig">前往防火墙配置</a>
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
    ArrowRight,
    ArrowRightLeft,
    ListFilter,
    RefreshCw,
    Route,
    ShieldCheck,
    ShieldOff,
    Zap
  } from 'lucide-vue-next'
  import PageHeader from '@/components/PageHeader.vue'
  import PanelCard from '@/components/PanelCard.vue'
  import StatCard from '@/components/StatCard.vue'
  import StatusBadge from '@/components/StatusBadge.vue'
  import EmptyState from '@/components/EmptyState.vue'
  import FirewallZoneCard from '@/components/_archive/FirewallZoneCard.vue'
  import { usePolling } from '@/composables/usePolling'
  import { useRefreshSignal } from '@/composables/useRefresh'
  import {
    createEmptyFirewallConfig,
    fetchFirewallConfig,
    policyTone,
    type FirewallConfig,
    type FirewallRedirect
  } from '@/api/_archive/firewall.readonly'

  defineOptions({ name: 'FirewallView' })

  /** Outbound rules are capped so a huge rule set cannot flood the page. */
  const RULE_LIMIT = 20

  const config = ref<FirewallConfig>(createEmptyFirewallConfig())
  const refreshSignal = useRefreshSignal()
  const router = useRouter()

  const defaults = computed(() => config.value.defaults)
  const zones = computed(() => config.value.zones)
  const redirects = computed(() => config.value.redirects)
  const rules = computed(() => config.value.rules)
  const forwardings = computed(() => config.value.forwardings)
  const visibleRules = computed(() => rules.value.slice(0, RULE_LIMIT))

  const zoneMeta = computed(() => {
    const bound = zones.value.filter((zone) => zone.networks.length).length
    return bound ? `${bound} 个区域已绑定网络` : '没有区域绑定网络'
  })

  const redirectMeta = computed(() =>
    redirects.value.length
      ? `${redirects.value.filter((item) => item.enabled).length} 条处于启用状态`
      : '没有配置目的地址映射'
  )

  const ruleMeta = computed(() =>
    rules.value.length
      ? `${rules.value.filter((item) => item.enabled).length} 条处于启用状态`
      : '出站流量由区域策略决定'
  )

  const offload = computed<{
    value: string
    meta: string
    badge: string
    tone: 'brand' | 'success' | 'neutral'
  }>(() => {
    const software = defaults.value.flowOffloading
    const hardware = defaults.value.flowOffloadingHw
    if (hardware) {
      return {
        value: '硬件加速',
        meta: '软件卸载与硬件卸载均已开启',
        badge: 'HW',
        tone: 'success'
      }
    }
    if (software) {
      return {
        value: '软件卸载',
        meta: '仅软件流量卸载，硬件卸载未开启',
        badge: 'SW',
        tone: 'brand'
      }
    }
    return {
      value: '已关闭',
      meta: '流量全部走内核路径处理',
      badge: '',
      tone: 'neutral'
    }
  })

  const defaultPolicies = computed(() => [
    { key: 'input', value: defaults.value.input },
    { key: 'output', value: defaults.value.output },
    { key: 'forward', value: defaults.value.forward }
  ])

  function protoText(proto: string): string {
    if (!proto) return '—'
    return proto
      .split(/\s+/)
      .filter(Boolean)
      .map((item) => item.toUpperCase())
      .join(' / ')
  }

  function familyText(family: string): string {
    const value = family.trim().toLowerCase()
    if (!value || value === 'any') return 'IPv4 / IPv6'
    if (value === 'ipv4') return 'IPv4'
    if (value === 'ipv6') return 'IPv6'
    return family
  }

  function sourceDetail(row: FirewallRedirect): string {
    const parts = [row.srcIp, row.srcDport].filter(Boolean)
    return parts.length ? parts.join(':') : '任意'
  }

  function flagLabel(value: boolean | null): string {
    if (value === null) return '未设置'
    return value ? '开启' : '关闭'
  }

  function flagTone(value: boolean | null): 'success' | 'neutral' {
    return value ? 'success' : 'neutral'
  }

  function goFirewallConfig(): void {
    void router.push({ name: 'config-firewall' })
  }

  const { loaded, error, refreshing, refresh } = usePolling(async () => {
    config.value = await fetchFirewallConfig()
  }, 15000)

  watch(refreshSignal, () => void refresh())
</script>

<style scoped>
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

  .table-sub {
    margin-top: 1px;
    color: var(--text-muted);
    font-size: 11px;
  }

  .table-mono {
    color: var(--text-secondary);
    font-size: 12px;
  }

  .policy-grid {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 10px;
    padding-bottom: 16px;
    border-bottom: 1px solid var(--border);
  }

  .policy-cell {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 5px;
    min-width: 0;
  }

  .policy-key {
    color: var(--text-muted);
    font-size: 11px;
    font-family: var(--font-mono);
  }

  .switch-list {
    display: flex;
    flex-direction: column;
    gap: 9px;
    padding-top: 14px;
  }

  .switch-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
  }

  .switch-label {
    color: var(--text-secondary);
    font-size: var(--text-sm);
  }

  .forward-list {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .forward-row {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 9px 12px;
    background: var(--surface-2);
    border-radius: var(--radius);
  }

  .forward-zone {
    color: var(--text);
    font-size: var(--text-sm);
    font-weight: 500;
  }

  .forward-arrow {
    color: var(--text-faint);
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
    .policy-grid {
      grid-template-columns: repeat(3, minmax(0, 1fr));
    }
  }
</style>
