<template>
  <div class="page">
    <PageHeader title="代理" description="ShellCrash / mihomo 运行状态、代理组与活动连接">
      <el-button :icon="RefreshCw" :loading="refreshing" @click="refresh">刷新</el-button>
    </PageHeader>

    <el-alert v-if="error" type="error" :title="error.message" :closable="false" show-icon />

    <template v-if="loaded">
      <template v-if="available">
        <section class="card proxy-hero">
          <div class="proxy-hero-main">
            <div class="proxy-icon">
              <ShieldCheck :size="24" :stroke-width="1.8" />
            </div>
            <div class="proxy-copy">
              <div class="proxy-title-row">
                <h2 class="proxy-title">ShellCrash</h2>
                <StatusBadge tone="success" label="运行中" />
                <span class="proxy-version mono">{{ version }}</span>
              </div>
              <p class="proxy-sub">
                mihomo 核心
                <span class="proxy-sep">·</span>
                {{ modeText }}
                <span class="proxy-sep">·</span>
                API 127.0.0.1:9999
              </p>
            </div>
          </div>

          <div class="proxy-exit">
            <span class="proxy-exit-label">当前出口</span>
            <strong class="proxy-exit-name" :title="primaryNode">{{ primaryNode || '—' }}</strong>
            <span class="proxy-exit-group">{{ primaryGroup?.name || '默认代理组' }}</span>
          </div>
        </section>

        <div class="grid grid-3">
          <StatCard
            label="活动连接"
            :value="connections.length"
            :meta="`累计处理 ${formatBytes(upTotal + downTotal)}`"
            :icon="Waypoints"
            tone="brand"
          />
          <StatCard
            label="上传总量"
            :value="formatBytes(upTotal)"
            meta="自 ShellCrash 启动以来"
            :icon="ArrowUp"
            tone="neutral"
          />
          <StatCard
            label="下载总量"
            :value="formatBytes(downTotal)"
            meta="自 ShellCrash 启动以来"
            :icon="ArrowDown"
            tone="neutral"
          />
        </div>

        <div class="grid grid-main">
          <PanelCard title="代理组" :subtitle="`${groups.length} 个策略组`">
            <div class="group-list">
              <div v-for="group in groups" :key="group.name" class="group-row">
                <div class="group-main">
                  <div class="group-name-row">
                    <span class="group-name truncate">{{ group.name }}</span>
                    <span class="group-type">{{ typeLabel(group.type) }}</span>
                  </div>
                  <div class="group-now truncate" :title="group.now">
                    {{ group.now || '未选择节点' }}
                  </div>
                  <p v-if="!groupAllowed(group.name)" class="group-hint">
                    组名含有控制台不支持的字符，无法在此切换。
                  </p>
                </div>

                <div class="group-side">
                  <span class="group-count num">{{ group.all?.length || 0 }} 节点</span>
                  <el-button
                    class="group-speed"
                    link
                    type="primary"
                    size="small"
                    :icon="Gauge"
                    :loading="speedTesting[group.name]"
                    @click="runSpeedTest(group)"
                  >
                    测速
                  </el-button>
                  <el-select
                    class="group-switch"
                    :model-value="picked[group.name] ?? group.now ?? ''"
                    :disabled="!groupAllowed(group.name)"
                    :loading="switching[group.name]"
                    size="small"
                    filterable
                    placeholder="切换节点"
                    @change="onPick(group, $event)"
                  >
                    <el-option
                      v-for="node in group.all || []"
                      :key="node"
                      :label="optionLabel(group.name, node)"
                      :value="node"
                      :disabled="!nameAllowed(node)"
                    >
                      <span class="node-option">
                        <span class="node-name truncate">{{ node }}</span>
                        <span class="node-delay num">{{ delayLabel(group.name, node) }}</span>
                      </span>
                    </el-option>
                  </el-select>
                </div>
              </div>
            </div>
            <EmptyState
              v-if="!groups.length"
              :icon="Layers"
              title="没有可显示的策略组"
              description="ShellCrash 配置中没有 Selector、URLTest 或 Fallback 组。"
            />
          </PanelCard>

          <PanelCard title="运行配置" subtitle="来自 mihomo /configs">
            <dl class="kv-grid config-kv">
              <div class="kv">
                <dt>代理模式</dt>
                <dd>{{ modeText }}</dd>
              </div>
              <div class="kv">
                <dt>混合端口</dt>
                <dd class="mono">{{ configs?.['mixed-port'] || '—' }}</dd>
              </div>
              <div class="kv">
                <dt>TPROXY 端口</dt>
                <dd class="mono">{{ configs?.['tproxy-port'] || '—' }}</dd>
              </div>
              <div class="kv">
                <dt>Redir 端口</dt>
                <dd class="mono">{{ configs?.['redir-port'] || '—' }}</dd>
              </div>
              <div class="kv">
                <dt>TUN 模式</dt>
                <dd>{{ configs?.tun?.enable ? '已开启' : '关闭' }}</dd>
              </div>
              <div class="kv">
                <dt>日志级别</dt>
                <dd>{{ configs?.['log-level'] || 'info' }}</dd>
              </div>
            </dl>
            <p class="config-note">
              切换策略组节点可直接在上方「代理组」中进行；订阅更新与配置变更仍需使用 ShellCrash 菜单。
            </p>
          </PanelCard>
        </div>

        <PanelCard title="活动连接" :subtitle="`${connections.length} 条`" flush>
          <div v-if="connections.length" class="desktop-only">
            <el-table :data="topConnections" style="width: 100%">
              <el-table-column label="主机" min-width="190">
                <template #default="{ row }">
                  <div class="table-primary truncate">{{ hostOf(row) }}</div>
                  <div class="table-sub mono">{{ row.metadata?.sourceIP || '—' }}</div>
                </template>
              </el-table-column>
              <el-table-column label="规则" min-width="150">
                <template #default="{ row }">
                  <div class="table-primary">{{ row.rule || '—' }}</div>
                  <div class="table-sub truncate">{{ row.rulePayload || '' }}</div>
                </template>
              </el-table-column>
              <el-table-column label="链路" min-width="220">
                <template #default="{ row }">
                  <span class="chain-text truncate" :title="(row.chains || []).join(' → ')">
                    {{ (row.chains || []).join(' → ') }}
                  </span>
                </template>
              </el-table-column>
              <el-table-column label="上传 / 下载" min-width="150" align="right">
                <template #default="{ row }">
                  <span class="num">
                    ↑ {{ formatBytes(row.upload) }} · ↓ {{ formatBytes(row.download) }}
                  </span>
                </template>
              </el-table-column>
            </el-table>
          </div>

          <div v-if="connections.length" class="mobile-only mobile-list">
            <div v-for="row in topConnections" :key="row.id" class="mobile-row">
              <div class="mobile-row-head">
                <strong class="truncate">{{ hostOf(row) }}</strong>
                <span class="num">↑ {{ formatBytes(row.upload) }}</span>
              </div>
              <div class="mobile-line">
                <span>规则</span>
                <span>{{ row.rule || '—' }}</span>
              </div>
              <div class="mobile-line">
                <span>链路</span>
                <span class="truncate">{{ (row.chains || []).join(' → ') }}</span>
              </div>
            </div>
          </div>

          <EmptyState
            v-if="!connections.length"
            :icon="Waypoints"
            title="当前没有活动连接"
            description="有流量经过代理时，这里会显示规则与链路。"
          />
        </PanelCard>
      </template>

      <PanelCard v-else title="代理服务">
        <EmptyState
          :icon="ShieldOff"
          title="未检测到 ShellCrash"
          description="服务未运行，或 mihomo API（127.0.0.1:9999）不可达。请先在路由器上启动 ShellCrash 后刷新。"
        />
      </PanelCard>
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
  import {
    ArrowDown,
    ArrowUp,
    Gauge,
    Layers,
    RefreshCw,
    ShieldCheck,
    ShieldOff,
    Waypoints
  } from 'lucide-vue-next'
  import { ElMessage, ElMessageBox } from 'element-plus'
  import PageHeader from '@/components/PageHeader.vue'
  import PanelCard from '@/components/PanelCard.vue'
  import StatCard from '@/components/StatCard.vue'
  import StatusBadge from '@/components/StatusBadge.vue'
  import EmptyState from '@/components/EmptyState.vue'
  import { usePolling } from '@/composables/usePolling'
  import { useRefreshSignal } from '@/composables/useRefresh'
  import { api } from '@/api/openwrt'
  import { SessionExpiredError } from '@/api/ubus'
  import {
    fetchProxyDelay,
    isProxyNameAllowed,
    switchProxyNode
  } from '@/api/proxyActions'
  import type {
    ShellCrashConfigs,
    ShellCrashConnection,
    ShellCrashProxy
  } from '@/api/types'
  import { formatBytes } from '@/utils/format'
  import { groupRank, pickPrimaryGroup, resolveNode } from '@/utils/proxy'

  const available = ref(false)
  const version = ref('')
  const configs = ref<ShellCrashConfigs>()
  const proxies = ref<Record<string, ShellCrashProxy>>({})
  const connections = ref<ShellCrashConnection[]>([])
  const upTotal = ref(0)
  const downTotal = ref(0)
  const refreshSignal = useRefreshSignal()

  /** Currently picked node per group, mirrors group.now after every reload. */
  const picked = ref<Record<string, string>>({})
  /** Groups with a switch in flight. */
  const switching = ref<Record<string, boolean>>({})
  /** Groups with a running latency test. */
  const speedTesting = ref<Record<string, boolean>>({})
  /** Last known latency per "group|node", null means the node did not answer. */
  const delays = ref<Record<string, number | null>>({})

  const groups = computed(() =>
    Object.values(proxies.value)
      .filter((item) => ['Selector', 'URLTest', 'Fallback', 'LoadBalance'].includes(item.type))
      .sort((a, b) => groupRank(a.name) - groupRank(b.name) || a.name.localeCompare(b.name))
  )

  const primaryGroup = computed(() => pickPrimaryGroup(proxies.value))
  const primaryNode = computed(() =>
    primaryGroup.value ? resolveNode(proxies.value, primaryGroup.value.now) : ''
  )

  const modeText = computed(() => {
    if (!configs.value) return '—'
    if (configs.value.tun?.enable) return `TUN · ${configs.value.tun.stack || 'gVisor'}`
    if (configs.value['tproxy-port']) return `TPROXY · ${configs.value['tproxy-port']}`
    if (configs.value['redir-port']) return `REDIR · ${configs.value['redir-port']}`
    return `MIXED · ${configs.value['mixed-port'] || '—'}`
  })

  const topConnections = computed(() =>
    [...connections.value]
      .sort((a, b) => b.upload + b.download - (a.upload + a.download))
      .slice(0, 12)
  )

  function hostOf(row: ShellCrashConnection): string {
    return row.metadata?.host || row.metadata?.destinationIP || '未知主机'
  }

  function typeLabel(type: string): string {
    const map: Record<string, string> = {
      Selector: '手动选择',
      URLTest: '自动测速',
      Fallback: '故障转移',
      LoadBalance: '负载均衡'
    }
    return map[type] || type
  }

  function nameAllowed(name: string): boolean {
    return isProxyNameAllowed(name)
  }

  function groupAllowed(name: string): boolean {
    return isProxyNameAllowed(name)
  }

  function delayKey(group: string, node: string): string {
    return `${group}|${node}`
  }

  /** Empty while untested, "超时" for a node that did not answer. */
  function delayLabel(group: string, node: string): string {
    const value = delays.value[delayKey(group, node)]
    if (value === undefined) return ''
    if (value === null) return '超时'
    return `${value} ms`
  }

  function optionLabel(group: string, node: string): string {
    const suffix = delayLabel(group, node)
    return suffix ? `${node} · ${suffix}` : node
  }

  /** Keeps the select in sync with the node mihomo really uses. */
  function syncPicked(): void {
    for (const group of groups.value) {
      if (switching.value[group.name]) continue
      picked.value[group.name] = group.now || ''
    }
  }

  async function onPick(group: ShellCrashProxy, node: string): Promise<void> {
    if (!node || node === group.now) {
      picked.value[group.name] = group.now || ''
      return
    }

    try {
      await ElMessageBox.confirm(
        `切换后「${group.name}」的出口将立即变为「${node}」，会立即影响该策略组的流量出口。`,
        '确认切换节点？',
        {
          type: 'warning',
          confirmButtonText: '确认切换',
          cancelButtonText: '取消'
        }
      )
    } catch {
      picked.value[group.name] = group.now || ''
      return
    }

    switching.value[group.name] = true
    try {
      await switchProxyNode(group.name, node)
      ElMessage.success(`「${group.name}」已切换到「${node}」`)
      await refresh()
    } catch (err) {
      ElMessage.error(err instanceof Error ? err.message : '切换失败')
      picked.value[group.name] = group.now || ''
    } finally {
      switching.value[group.name] = false
    }
  }

  async function runSpeedTest(group: ShellCrashProxy): Promise<void> {
    // Only the first nodes are probed so a group with dozens of entries does
    // not flood the router with delay requests.
    const nodes = (group.all || []).filter((node) => nameAllowed(node)).slice(0, 8)
    if (!nodes.length) {
      ElMessage.warning('该策略组没有可用于测速的节点')
      return
    }

    speedTesting.value[group.name] = true
    try {
      const results = await Promise.all(
        nodes.map(async (node) => {
          const delay = await fetchProxyDelay(node).catch(() => null)
          return [node, delay] as const
        })
      )
      for (const [node, delay] of results) {
        delays.value[delayKey(group.name, node)] = delay
      }
      const alive = results.filter(([, delay]) => typeof delay === 'number').length
      ElMessage.success(`「${group.name}」测速完成，${alive}/${results.length} 个节点可用`)
    } finally {
      speedTesting.value[group.name] = false
    }
  }

  const { loaded, error, refreshing, refresh } = usePolling(async () => {
    try {
      const [versionData, connectionData, proxyData, configData] = await Promise.all([
        api.shellcrash.version(),
        api.shellcrash.connections(),
        api.shellcrash.proxies(),
        api.shellcrash.configs()
      ])
      version.value = versionData?.version || ''
      connections.value = connectionData?.connections || []
      upTotal.value = connectionData?.uploadTotal || 0
      downTotal.value = connectionData?.downloadTotal || 0
      proxies.value = proxyData || {}
      configs.value = configData || undefined
      available.value = Boolean(versionData?.version)
      syncPicked()
    } catch (err) {
      if (err instanceof SessionExpiredError) throw err
      available.value = false
    }
  }, 10000)

  watch(refreshSignal, () => void refresh())
</script>

<style scoped>
  .proxy-hero {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-6);
    padding: 22px 24px;
  }

  .proxy-hero-main {
    display: flex;
    align-items: center;
    gap: 14px;
    min-width: 0;
  }

  .proxy-icon {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 48px;
    height: 48px;
    flex-shrink: 0;
    color: var(--success-text);
    background: var(--success-soft);
    border-radius: var(--radius-lg);
  }

  .proxy-copy {
    min-width: 0;
  }

  .proxy-title-row {
    display: flex;
    align-items: center;
    gap: 9px;
  }

  .proxy-title {
    color: var(--text);
    font-size: 18px;
    font-weight: 600;
    line-height: 1.3;
    letter-spacing: -0.01em;
  }

  .proxy-version {
    color: var(--text-muted);
    font-size: 11.5px;
  }

  .proxy-sub {
    margin-top: 3px;
    color: var(--text-muted);
    font-size: var(--text-xs);
  }

  .proxy-sep {
    margin: 0 4px;
    color: var(--text-faint);
  }

  .proxy-exit {
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    gap: 1px;
    min-width: 0;
    max-width: 42%;
  }

  .proxy-exit-label {
    color: var(--text-muted);
    font-size: 11px;
  }

  .proxy-exit-name {
    overflow: hidden;
    max-width: 100%;
    color: var(--text);
    font-size: var(--text-sm);
    font-weight: 600;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .proxy-exit-group {
    color: var(--text-muted);
    font-size: 11px;
  }

  .group-list {
    display: flex;
    flex-direction: column;
  }

  .group-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding: 10px 0;
    border-bottom: 1px solid var(--border);
  }

  .group-row:first-child {
    padding-top: 2px;
  }

  .group-row:last-child {
    padding-bottom: 2px;
    border-bottom: 0;
  }

  .group-main {
    flex: 1 1 auto;
    min-width: 0;
  }

  .group-name-row {
    display: flex;
    align-items: center;
    gap: 7px;
  }

  .group-name {
    color: var(--text);
    font-size: var(--text-sm);
    font-weight: 500;
  }

  .group-type {
    padding: 1px 6px;
    color: var(--text-muted);
    font-size: 10px;
    font-weight: 500;
    white-space: nowrap;
    background: var(--surface-2);
    border-radius: 4px;
  }

  .group-now {
    margin-top: 1px;
    color: var(--text-muted);
    font-size: 11.5px;
  }

  .group-side {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-shrink: 0;
  }

  .group-count {
    color: var(--text-muted);
    font-size: 11px;
  }

  .group-speed {
    min-height: 24px;
    padding: 0 2px;
  }

  .group-switch {
    width: 220px;
  }

  .group-hint {
    margin-top: 4px;
    color: var(--warning-text);
    font-size: 11px;
    line-height: 1.5;
  }

  .node-option {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    width: 100%;
  }

  .node-name {
    min-width: 0;
  }

  .node-delay {
    flex-shrink: 0;
    color: var(--text-muted);
    font-size: 11px;
  }

  .config-kv {
    margin: 0;
  }

  .config-note {
    margin-top: 16px;
    padding-top: 12px;
    color: var(--text-muted);
    font-size: 11.5px;
    line-height: 1.6;
    border-top: 1px solid var(--border);
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

  .chain-text {
    display: block;
    max-width: 100%;
    color: var(--text-secondary);
    font-size: 11.5px;
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
    min-width: 0;
    color: var(--text-secondary);
  }

  @media (max-width: 900px) {
    .proxy-hero {
      align-items: flex-start;
      flex-direction: column;
      gap: 14px;
    }

    .proxy-exit {
      align-items: flex-start;
      max-width: 100%;
    }

    .group-switch {
      width: 190px;
    }
  }

  @media (max-width: 640px) {
    .proxy-hero {
      padding: 18px 16px;
    }

    /* The group row becomes two lines: the description on top, the switch
       control below with a touch friendly height. */
    .group-row {
      align-items: stretch;
      flex-direction: column;
      gap: 8px;
      padding: 12px 0;
    }

    .group-side {
      justify-content: space-between;
      gap: 10px;
      width: 100%;
    }

    .group-count {
      margin-right: auto;
    }

    .group-switch {
      flex: 1 1 auto;
      width: auto;
      min-width: 140px;
    }

    .group-switch :deep(.el-select__wrapper) {
      min-height: 36px;
    }

    .group-speed {
      min-height: 36px;
      padding: 0 6px;
    }
  }
</style>
