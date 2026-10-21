<template>
  <div class="page">
    <PageHeader title="代理" description="ShellCrash 核心运行状态、代理组与活动连接">
      <el-button :icon="RefreshCw" :loading="refreshing" @click="refresh">刷新</el-button>
    </PageHeader>

    <el-alert v-if="error" type="error" :title="error?.message || '操作失败'" :closable="false" show-icon />

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
                ShellCrash 核心
                <span class="proxy-sep">·</span>
                {{ modeText }}
                <span class="proxy-sep">·</span>
                API 127.0.0.1:{{ controllerPort }}
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
            <template #actions>
              <RouterLink class="link-btn" :to="{ name: 'config-shellcrash' }">
                ShellCrash 设置
                <ChevronRight :size="14" />
              </RouterLink>
            </template>

            <div class="group-list">
              <div v-for="group in groups" :key="group.name" class="group-row">
                <div class="group-main">
                  <div class="group-name-row">
                    <span class="group-name truncate">{{ group.name }}</span>
                    <span class="group-type">{{ typeLabel(group.type) }}</span>
                  </div>
                  <div class="group-now">
                    <span class="truncate" :title="group.now">
                      {{ group.now || '未选择节点' }}
                    </span>
                    <span class="group-delay num" :class="delayTone(group)">
                      {{ delayText(group) }}
                    </span>
                  </div>
                  <ProxyNodeDelays
                    :results="speedResults[group.name] || []"
                    :fastest="fastestNode[group.name] || ''"
                  />
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
                      :label="optionLabel(node)"
                      :value="node"
                      :disabled="!nameAllowed(node)"
                    >
                      <span class="node-option">
                        <span class="node-name truncate">{{ node }}</span>
                        <span class="node-delay num">{{ nodeDelayText(node) }}</span>
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

            <template #footer>
              <span>「测速」会探测该组前 8 个节点，并把延迟标在组内。</span>
            </template>
          </PanelCard>

          <div class="side-stack">
            <ProxyExitCard
              :node="primaryNode"
              :group="primaryGroup?.name || ''"
              :delay="exitDelay"
              :switched-at="exitState.switchedAt"
              :now="now"
            />

            <PanelCard title="运行配置" subtitle="来自核心 /configs">
              <dl class="kv-grid config-kv">
                <div class="kv">
                  <dt>代理模式</dt>
                  <dd class="mono-value">{{ modeText }}</dd>
                </div>
                <div class="kv">
                  <dt>混合端口</dt>
                  <dd class="mono-value">{{ configs?.['mixed-port'] || '—' }}</dd>
                </div>
                <div class="kv">
                  <dt>TPROXY 端口</dt>
                  <dd class="mono-value">{{ configs?.['tproxy-port'] || '—' }}</dd>
                </div>
                <div class="kv">
                  <dt>Redir 端口</dt>
                  <dd class="mono-value">{{ configs?.['redir-port'] || '—' }}</dd>
                </div>
                <div class="kv">
                  <dt>TUN 模式</dt>
                  <dd class="mono-value">{{ tunText }}</dd>
                </div>
                <div class="kv">
                  <dt>日志级别</dt>
                  <dd class="mono-value" :title="rawLogLevel">{{ logLevelText }}</dd>
                </div>
              </dl>
            </PanelCard>
          </div>
        </div>

        <PanelCard
          title="活动连接"
          :subtitle="`${connections.length} 条 · 按流量降序`"
          flush
        >
          <ProxyConnectionSummary v-if="connections.length" :summary="connectionSummary" />

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
            description="没有流量经过代理时这里是空的；设备开始访问外网后，规则、链路与流量会实时出现。"
          />

          <template #footer>
            <span>列表按上传加下载的总量降序，最多显示 12 条</span>
          </template>
        </PanelCard>
      </template>

      <PanelCard v-else title="代理服务">
        <EmptyState
          :icon="ShieldOff"
          title="未检测到 ShellCrash"
          :description="`服务未运行，或核心 API（127.0.0.1:${controllerPort}）不可达。请先在路由器上启动 ShellCrash 后刷新。`"
        >
          <RouterLink class="link-btn" :to="{ name: 'config-shellcrash' }">
            打开 ShellCrash 设置
            <ChevronRight :size="14" />
          </RouterLink>
        </EmptyState>
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
  import { computed, onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue'
  import { RouterLink } from 'vue-router'
  import {
    ArrowDown,
    ArrowUp,
    ChevronRight,
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
  import ProxyExitCard from '@/components/proxy-ExitCard.vue'
  import ProxyNodeDelays from '@/components/proxy-NodeDelays.vue'
  import ProxyConnectionSummary from '@/components/proxy-ConnectionSummary.vue'
  import { usePolling } from '@/composables/usePolling'
  import { useRefreshSignal } from '@/composables/useRefresh'
  import { api } from '@/api/openwrt'
  import { SessionExpiredError } from '@/api/ubus'
  import {
    fetchProxyDelays,
    isProxyNameAllowed,
    summarizeConnections,
    switchProxyNode,
    type ProxyDelayResult
  } from '@/api/proxyActions'
  import { markProxySwitched, rememberProxyExit } from '@/api/proxyState'
  import { fetchShellCrashStatus } from '@/api/shellcrashConfig'
  import type {
    ShellCrashConfigs,
    ShellCrashConnection,
    ShellCrashProxy
  } from '@/api/types'
  import { formatBytes } from '@/utils/format'
  import { groupRank, pickPrimaryGroup, resolveNode } from '@/utils/proxy'

  defineOptions({ name: 'ProxyView' })

  const available = ref(false)
  const version = ref('')
  /** The controller port of the running core; 9999 is the ShellCrash default. */
  const controllerPort = ref(9999)
  // Replaced wholesale on every poll; deep reactivity would only add proxies.
  const configs = shallowRef<ShellCrashConfigs>()
  const proxies = shallowRef<Record<string, ShellCrashProxy>>({})
  const connections = shallowRef<ShellCrashConnection[]>([])
  const upTotal = ref(0)
  const downTotal = ref(0)
  const refreshSignal = useRefreshSignal()

  /** Currently picked node per group, mirrors group.now after every reload. */
  const picked = ref<Record<string, string>>({})
  /** Groups with a switch in flight. */
  const switching = ref<Record<string, boolean>>({})
  /** Groups with a running latency test. */
  const speedTesting = ref<Record<string, boolean>>({})
  /** Measured latency per node name, null means the node did not answer. */
  const delays = ref<Record<string, number | null>>({})
  /** When the node was probed the last time, used for the cache lifetime. */
  const delayAt = ref<Record<string, number>>({})
  /** Result of the last batch test, per group. */
  const speedResults = ref<Record<string, ProxyDelayResult[]>>({})
  /** The fastest node of the last batch test, per group. */
  const fastestNode = ref<Record<string, string>>({})

  /** The exit node and when it was switched the last time. */
  const exitState = ref({ node: '', group: '', switchedAt: 0 })
  /** Ticks once a second so the running duration stays alive. */
  const now = ref(Date.now())

  /** A measured latency is kept for five minutes. */
  const DELAY_TTL = 5 * 60_000
  /** How many nodes a group test probes. */
  const BATCH_SIZE = 8

  let clock: number | undefined
  let probing = false
  /** The controller port was read once; no need to ask the router again. */
  let controllerLoaded = false
  /** A status request is in flight; do not stack them on slow routers. */
  let controllerLoading = false

  const groups = computed(() =>
    Object.values(proxies.value)
      .filter((item) => ['Selector', 'URLTest', 'Fallback', 'LoadBalance'].includes(item.type))
      .sort((a, b) => groupRank(a.name) - groupRank(b.name) || a.name.localeCompare(b.name))
  )

  const primaryGroup = computed(() => pickPrimaryGroup(proxies.value))
  const primaryNode = computed(() =>
    primaryGroup.value ? resolveNode(proxies.value, primaryGroup.value.now) : ''
  )

  /** The measured latency of the current exit node, null when unknown. */
  const exitDelay = computed(() => {
    const node = primaryNode.value
    if (!node) return null
    const value = delays.value[node]
    return typeof value === 'number' ? value : null
  })

  const modeText = computed(() => {
    if (!configs.value) return '—'
    if (configs.value.tun?.enable) return `TUN · ${configs.value.tun.stack || 'gVisor'}`
    if (configs.value['tproxy-port']) return `TPROXY · ${configs.value['tproxy-port']}`
    if (configs.value['redir-port']) return `REDIR · ${configs.value['redir-port']}`
    return `MIXED · ${configs.value['mixed-port'] || '—'}`
  })

  /** TUN 状态：开启时带上协议栈，关闭时只说关闭。 */
  const tunText = computed(() => {
    const tun = configs.value?.tun
    if (!tun?.enable) return '关闭'
    return tun.stack ? `已开启 · ${tun.stack}` : '已开启'
  })

  /** 原始日志级别，例如 `warning`。 */
  const rawLogLevel = computed(() => configs.value?.['log-level'] || 'info')

  /** 日志级别的人话映射，未知取值原样显示。 */
  const LOG_LEVEL_LABELS: Record<string, string> = {
    silent: '静默',
    error: '错误',
    warning: '警告',
    info: '信息',
    debug: '调试'
  }

  const logLevelText = computed(
    () => LOG_LEVEL_LABELS[rawLogLevel.value.toLowerCase()] || rawLogLevel.value
  )

  const topConnections = computed(() =>
    [...connections.value]
      .sort((a, b) => b.upload + b.download - (a.upload + a.download))
      .slice(0, 12)
  )

  const connectionSummary = computed(() => summarizeConnections(connections.value, 5))

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

  /** The node a group really routes through, following nested groups. */
  function currentNodeOf(group: ShellCrashProxy): string {
    return resolveNode(proxies.value, group.now)
  }

  /** The measured latency of a node; null when it is unknown or timed out. */
  function delayOf(node: string): number | null {
    if (!node) return null
    const value = delays.value[node]
    return typeof value === 'number' ? value : null
  }

  /** The latency of the node a group currently uses. */
  function delayText(group: ShellCrashProxy): string {
    const delay = delayOf(currentNodeOf(group))
    return typeof delay === 'number' ? `${delay} ms` : '—'
  }

  function delayTone(group: ShellCrashProxy): string {
    const delay = delayOf(currentNodeOf(group))
    if (typeof delay !== 'number') return 'is-unknown'
    if (delay < 200) return 'is-good'
    if (delay < 600) return 'is-fair'
    return 'is-slow'
  }

  /** The latency of a node inside the switch list. */
  function nodeDelayText(node: string): string {
    const delay = delayOf(node)
    return typeof delay === 'number' ? `${delay} ms` : '—'
  }

  function optionLabel(node: string): string {
    const suffix = nodeDelayText(node)
    return suffix === '—' ? node : `${node} · ${suffix}`
  }

  /** Keeps the select in sync with the node mihomo really uses. */
  function syncPicked(): void {
    for (const group of groups.value) {
      if (switching.value[group.name]) continue
      picked.value[group.name] = group.now || ''
    }
  }

  /**
   * Probes the nodes the groups currently use.
   *
   * The probe is skipped when the value is still fresh, so a page that stays
   * open does not keep the router busy every ten seconds.
   */
  async function probeCurrentNodes(force = false): Promise<void> {
    if (probing) return
    const stamp = Date.now()
    const wanted = groups.value
      .map((group) => currentNodeOf(group))
      .filter((node) => Boolean(node) && nameAllowed(node))
    const fresh = wanted.filter(
      (node) => force || stamp - (delayAt.value[node] ?? 0) > DELAY_TTL
    )
    if (!fresh.length) return

    probing = true
    try {
      const result = await fetchProxyDelays(fresh)
      for (const [node, delay] of Object.entries(result)) {
        delays.value[node] = delay
        delayAt.value[node] = Date.now()
      }
    } finally {
      probing = false
    }
  }

  /**
   * Reads the controller port from ShellCrash.
   *
   * The core does not have to listen on the ShellCrash default 9999, so the
   * page asks once and keeps 9999 as the fallback when the status is not
   * available.
   */
  async function loadControllerPort(): Promise<void> {
    if (controllerLoaded || controllerLoading) return
    controllerLoading = true
    try {
      const status = await fetchShellCrashStatus()
      controllerPort.value = status.ports?.controller || 9999
      controllerLoaded = true
    } catch {
      // Keep the default and retry with the next poll.
    } finally {
      controllerLoading = false
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
      // Only the primary group carries the exit; a switch in another group is
      // picked up by the poll, which compares the exit node with the stored
      // one.
      if (primaryGroup.value?.name === group.name) {
        exitState.value = markProxySwitched(node, group.name, Date.now())
      }
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
    const nodes = (group.all || []).filter((node) => nameAllowed(node)).slice(0, BATCH_SIZE)
    if (!nodes.length) {
      ElMessage.warning('该策略组没有可用于测速的节点')
      return
    }

    speedTesting.value[group.name] = true
    try {
      const map = await fetchProxyDelays(nodes)
      const results: ProxyDelayResult[] = nodes.map((node) => ({
        node,
        delay: typeof map[node] === 'number' ? map[node] : null
      }))
      speedResults.value[group.name] = results
      for (const item of results) {
        delays.value[item.node] = item.delay
        delayAt.value[item.node] = Date.now()
      }

      const alive = results.filter((item) => typeof item.delay === 'number')
      const best = alive.reduce<ProxyDelayResult | null>(
        (min, item) =>
          !min || (item.delay as number) < (min.delay as number) ? item : min,
        null
      )
      fastestNode.value[group.name] = best?.node || ''
      ElMessage.success(
        `「${group.name}」测速完成，${alive.length}/${results.length} 个节点可用`
      )
    } finally {
      speedTesting.value[group.name] = false
    }
  }

  const { loaded, error, refreshing, refresh } = usePolling(async () => {
    // Runs even when the proxy API is down: the empty state needs the port.
    void loadControllerPort()
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

      // The exit node may have been switched by an automatic group; the
      // moment of the change is stored in the browser.
      if (primaryNode.value) {
        const next = rememberProxyExit(
          primaryNode.value,
          primaryGroup.value?.name || ''
        )
        if (next.node !== exitState.value.node || next.switchedAt !== exitState.value.switchedAt) {
          exitState.value = next
        }
      }

      void probeCurrentNodes()
    } catch (err) {
      if (err instanceof SessionExpiredError) throw err
      available.value = false
    }
  }, 10000)

  watch(refreshSignal, () => void refresh())

  onMounted(() => {
    clock = window.setInterval(() => {
      now.value = Date.now()
    }, 1000)
  })

  onBeforeUnmount(() => {
    if (clock !== undefined) window.clearInterval(clock)
  })
</script>

<style scoped>
  /* Element Plus 给相邻按钮加了 12px 左边距，和外层 flex 的 gap 叠加后
     同一行的按钮会被拉到 20px 间距；这里把间距交回给 gap 统一控制。 */
  .el-button + .el-button {
    margin-left: 0;
  }

  /* The two cards share one grid row. Without an explicit `min-width: 0` a
     long value inside the narrow column would stretch the whole track. */
  .grid-main > * {
    min-width: 0;
  }

  /* The narrow column holds the exit card and the run configuration. */
  .side-stack {
    display: flex;
    flex-direction: column;
    gap: var(--space-4);
    min-width: 0;
  }

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

  /* A router can carry dozens of groups. Without a cap the left card grows
     far past the right column and the page looks broken; the list scrolls
     inside the card instead. */
  .group-list {
    display: flex;
    flex-direction: column;
    max-height: clamp(320px, 56vh, 560px);
    padding-right: 4px;
    overflow-y: auto;
    scrollbar-gutter: stable;
  }

  .group-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    min-width: 0;
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
    /* A long group name or node name must never paint over the controls on
       the right; every child is clipped to this column. */
    overflow: hidden;
  }

  .group-name-row {
    display: flex;
    align-items: center;
    gap: 7px;
    min-width: 0;
  }

  .group-name {
    flex: 0 1 auto;
    min-width: 0;
    max-width: 100%;
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
    display: flex;
    align-items: center;
    gap: 8px;
    min-width: 0;
    margin-top: 1px;
    color: var(--text-muted);
    font-size: 11.5px;
  }

  /* The node name takes the remaining width and truncates; the delay badge
     keeps its intrinsic width. */
  .group-now > .truncate {
    flex: 1 1 auto;
    min-width: 0;
  }

  .group-delay {
    flex-shrink: 0;
    padding: 1px 6px;
    font-size: 10.5px;
    font-weight: 500;
    background: var(--surface-2);
    border-radius: 4px;
  }

  .group-delay.is-good {
    color: var(--success-text);
    background: var(--success-soft);
  }

  .group-delay.is-fair {
    color: var(--warning-text);
    background: var(--warning-soft);
  }

  .group-delay.is-slow {
    color: var(--danger-text);
    background: var(--danger-soft);
  }

  .group-delay.is-unknown {
    color: var(--text-faint);
  }

  .group-side {
    display: flex;
    align-items: center;
    gap: 8px;
    flex: 0 1 auto;
    min-width: 0;
  }

  .group-count {
    flex-shrink: 0;
    color: var(--text-muted);
    font-size: 11px;
    white-space: nowrap;
  }

  .group-speed {
    flex-shrink: 0;
    min-height: 24px;
    padding: 0 2px;
  }

  /* 220px is the comfortable width; below that the select shrinks instead of
     pushing the row past the card edge. */
  .group-switch {
    flex: 0 1 220px;
    width: 220px;
    min-width: 140px;
    max-width: 100%;
  }

  /* Element Plus does not always ellipsize the selected label, especially for
     long node names. */
  .group-switch :deep(.el-select__selected-item),
  .group-switch :deep(.el-select__placeholder) {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
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
    gap: 12px 18px;
    margin: 0;
  }

  /* The card lives in the narrow column of the main grid: every level must
     be allowed to shrink, otherwise a long value widens the whole column. */
  .config-kv .kv {
    min-width: 0;
  }

  .config-kv dt {
    font-size: 11.5px;
  }

  .config-kv dd {
    font-size: 12.5px;
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
