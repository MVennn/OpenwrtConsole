<template>
  <div class="page">
    <PageHeader title="网络配置" description="接口地址、网关、DNS 与静态路由，可修改后一键应用">
      <el-button :icon="RefreshCw" :loading="refreshing" @click="refresh">刷新</el-button>
      <el-button
        v-if="hasPending"
        :icon="RotateCcw"
        :loading="discarding"
        @click="discardChanges"
      >
        放弃修改
      </el-button>
      <el-button type="primary" :icon="Save" :loading="applying" @click="saveAndApply">
        保存并应用<template v-if="pendingEntries.length">（{{ pendingEntries.length }}）</template>
      </el-button>
    </PageHeader>

    <DraftNotice :dirty="draftDirty" :saved-at="savedAt" @discard="discardChanges" />

    <el-alert v-if="error" type="error" :title="error?.message || '操作失败'" :closable="false" show-icon />
    <el-alert
      v-if="notice"
      type="warning"
      :title="notice"
      closable
      show-icon
      @close="notice = ''"
    />

    <template v-if="loaded">
      <div class="grid grid-4">
        <StatCard
          label="接口总数"
          :value="model.interfaces.length"
          :meta="interfaceMeta"
          :icon="Network"
          tone="brand"
        />
        <StatCard
          label="链路在线"
          :value="connectedCount"
          :meta="`${model.interfaces.length} 个配置接口`"
          :icon="PlugZap"
          tone="success"
        />
        <StatCard
          label="静态路由"
          :value="model.routes.length"
          :meta="defaultRouteMeta"
          :icon="Route"
          tone="warning"
        />
        <StatCard
          label="DHCP 客户端"
          :value="model.hostCount"
          meta="根据主机提示估算"
          :icon="Users"
          tone="neutral"
        />
      </div>

      <PanelCard title="接口" :subtitle="`${model.interfaces.length} 个 interface 段`" flush>
        <template #actions>
          <el-button
            link
            type="primary"
            size="small"
            :icon="Plus"
            :disabled="busy"
            @click="openInterfaceDialog()"
          >
            新增接口
          </el-button>
        </template>

        <div v-if="model.interfaces.length" class="desktop-only">
          <el-table :data="model.interfaces" style="width: 100%">
            <el-table-column label="名称" min-width="120">
              <template #default="{ row }">
                <div class="table-primary">{{ row.id }}</div>
                <div v-if="row.isLan" class="table-sub">LAN 网段</div>
              </template>
            </el-table-column>
            <el-table-column label="协议" width="100">
              <template #default="{ row }">
                <span class="table-mono">{{ protocolText(row.protocol) }}</span>
              </template>
            </el-table-column>
            <el-table-column label="设备" min-width="100">
              <template #default="{ row }">
                <span class="mono table-mono">{{ row.device || '—' }}</span>
              </template>
            </el-table-column>
            <el-table-column label="地址" min-width="150">
              <template #default="{ row }">
                <div class="table-primary mono">{{ addressText(row) }}</div>
                <div class="table-sub mono">{{ netmaskText(row) }}</div>
                <div v-if="runtimeAddress(row)" class="table-sub mono">
                  运行中 {{ runtimeAddress(row) }}
                </div>
              </template>
            </el-table-column>
            <el-table-column label="网关" min-width="110">
              <template #default="{ row }">
                <span class="mono table-mono">{{ row.gateway || '—' }}</span>
              </template>
            </el-table-column>
            <el-table-column label="DNS" min-width="120">
              <template #default="{ row }">
                <span class="mono table-mono">{{ row.dns.join(' ') || '—' }}</span>
              </template>
            </el-table-column>
            <el-table-column label="链路" min-width="130">
              <template #default="{ row }">
                <StatusBadge :label="linkLabel(row)" :tone="linkTone(row)" />
                <div v-if="linkSpeed(row)" class="table-sub num">{{ linkSpeed(row) }}</div>
                <div v-else-if="!row.disabled" class="table-sub">无线 / 虚拟接口</div>
              </template>
            </el-table-column>
            <el-table-column label="启用" width="86">
              <template #default="{ row }">
                <StatusBadge
                  :label="row.disabled ? '已禁用' : '已启用'"
                  :tone="row.disabled ? 'neutral' : 'success'"
                />
              </template>
            </el-table-column>
            <el-table-column label="操作" width="190">
              <template #default="{ row }">
                <div class="row-actions">
                  <el-button
                    size="small"
                    link
                    type="primary"
                    :icon="Pencil"
                    :disabled="busy"
                    @click="openInterfaceDialog(row)"
                  >
                    编辑
                  </el-button>
                  <el-button
                    size="small"
                    link
                    :icon="row.disabled ? Play : Power"
                    :disabled="busy"
                    @click="toggleInterface(row, row.disabled)"
                  >
                    {{ row.disabled ? '启用' : '禁用' }}
                  </el-button>
                  <el-button
                    size="small"
                    link
                    type="danger"
                    :icon="Trash2"
                    :disabled="busy"
                    @click="removeInterface(row)"
                  >
                    删除
                  </el-button>
                </div>
              </template>
            </el-table-column>
          </el-table>
        </div>

        <div v-if="model.interfaces.length" class="mobile-only mobile-list">
          <div v-for="row in model.interfaces" :key="row.id" class="mobile-row">
            <div class="mobile-row-head">
              <strong class="truncate">{{ row.id }}</strong>
              <StatusBadge :label="linkLabel(row)" :tone="linkTone(row)" />
            </div>
            <div class="mobile-line">
              <span>协议 / 设备</span>
              <span class="mono">{{ protocolText(row.protocol) }} · {{ row.device || '—' }}</span>
            </div>
            <div class="mobile-line">
              <span>地址</span>
              <span class="mono">{{ addressText(row) }} · {{ netmaskText(row) }}</span>
            </div>
            <div class="mobile-line">
              <span>网关</span>
              <span class="mono">{{ row.gateway || '—' }}</span>
            </div>
            <div class="mobile-line">
              <span>DNS</span>
              <span class="mono">{{ row.dns.join(' ') || '—' }}</span>
            </div>
            <div class="mobile-line">
              <span>链路速率</span>
              <span class="num">{{ linkSpeed(row) || '—' }}</span>
            </div>
            <div class="mobile-actions">
              <el-button size="small" :icon="Pencil" :disabled="busy" @click="openInterfaceDialog(row)">
                编辑
              </el-button>
              <el-button
                size="small"
                :icon="row.disabled ? Play : Power"
                :disabled="busy"
                @click="toggleInterface(row, row.disabled)"
              >
                {{ row.disabled ? '启用' : '禁用' }}
              </el-button>
              <el-button
                size="small"
                type="danger"
                plain
                :icon="Trash2"
                :disabled="busy"
                @click="removeInterface(row)"
              >
                删除
              </el-button>
            </div>
          </div>
        </div>

        <EmptyState
          v-if="!model.interfaces.length"
          :icon="Network"
          title="没有配置接口"
          description="/etc/config/network 中没有任何 interface 段，无法编辑网络。"
        />

        <div v-if="removedInterfaces.length" class="removed-box">
          <p class="removed-title">待删除的接口</p>
          <div v-for="row in removedInterfaces" :key="row.id" class="removed-row">
            <span class="mono">{{ row.id }}</span>
            <span class="muted">{{ protocolText(row.protocol) }} · {{ row.address || '—' }}</span>
            <StatusBadge label="待删除" tone="warning" :dot="false" />
          </div>
        </div>
      </PanelCard>

      <PanelCard title="静态路由" :subtitle="`${model.routes.length} 条 route 段`" flush>
        <template #actions>
          <el-button
            link
            type="primary"
            size="small"
            :icon="Plus"
            :disabled="busy"
            @click="openRouteDialog()"
          >
            新增路由
          </el-button>
        </template>

        <div v-if="model.routes.length" class="desktop-only">
          <el-table :data="model.routes" style="width: 100%">
            <el-table-column label="目标" min-width="180">
              <template #default="{ row }">
                <div class="table-primary mono">{{ routeTargetText(row) }}</div>
                <div v-if="row.isDefault" class="table-sub">默认路由</div>
              </template>
            </el-table-column>
            <el-table-column label="网关" min-width="140">
              <template #default="{ row }">
                <span class="mono table-mono">{{ row.gateway || '—' }}</span>
              </template>
            </el-table-column>
            <el-table-column label="接口" min-width="120">
              <template #default="{ row }">
                <span class="mono table-mono">{{ row.iface || '—' }}</span>
              </template>
            </el-table-column>
            <el-table-column label="跃点" width="90">
              <template #default="{ row }">
                <span class="num table-mono">{{ row.metric ?? '—' }}</span>
              </template>
            </el-table-column>
            <el-table-column label="生效状态" min-width="150">
              <template #default="{ row }">
                <StatusBadge :label="routeState(row).label" :tone="routeState(row).tone" />
                <div v-if="routeState(row).detail" class="table-sub">
                  {{ routeState(row).detail }}
                </div>
              </template>
            </el-table-column>
            <el-table-column label="操作" width="150">
              <template #default="{ row }">
                <div class="row-actions">
                  <el-button link size="small" :icon="Pencil" :disabled="busy" @click="openRouteDialog(row)">
                    编辑
                  </el-button>
                  <el-button
                    link
                    size="small"
                    type="danger"
                    :icon="Trash2"
                    :disabled="busy"
                    @click="removeRoute(row)"
                  >
                    删除
                  </el-button>
                </div>
              </template>
            </el-table-column>
          </el-table>
        </div>

        <div v-if="model.routes.length" class="mobile-only mobile-list">
          <div v-for="row in model.routes" :key="row.id" class="mobile-row">
            <div class="mobile-row-head">
              <strong class="truncate mono">{{ routeTargetText(row) }}</strong>
              <StatusBadge :label="routeState(row).label" :tone="routeState(row).tone" />
            </div>
            <div class="mobile-line">
              <span>网关</span>
              <span class="mono">{{ row.gateway || '—' }}</span>
            </div>
            <div class="mobile-line">
              <span>接口</span>
              <span class="mono">{{ row.iface || '—' }}</span>
            </div>
            <div class="mobile-line">
              <span>跃点</span>
              <span class="num">{{ row.metric ?? '—' }}</span>
            </div>
            <div class="mobile-actions">
              <el-button size="small" :icon="Pencil" :disabled="busy" @click="openRouteDialog(row)">
                编辑
              </el-button>
              <el-button
                size="small"
                type="danger"
                plain
                :icon="Trash2"
                :disabled="busy"
                @click="removeRoute(row)"
              >
                删除
              </el-button>
            </div>
          </div>
        </div>

        <EmptyState
          v-if="!model.routes.length"
          :icon="Route"
          title="没有静态路由"
          description="默认路由由 DHCP 下发的网关或接口的 gateway 选项提供，这里只列出额外的静态路由。"
        />

        <div v-if="removedRoutes.length" class="removed-box">
          <p class="removed-title">待删除的路由</p>
          <div v-for="row in removedRoutes" :key="row.id" class="removed-row">
            <span class="mono">{{ routeTargetText(row) }}</span>
            <span class="muted">{{ row.gateway || '—' }} · {{ row.iface || '—' }}</span>
            <StatusBadge label="待删除" tone="warning" :dot="false" />
          </div>
        </div>

        <template v-if="model.routes.length" #footer>
          <span>共 {{ model.routes.length }} 条静态路由</span>
          <span>新增与删除在点击「保存并应用」后生效</span>
        </template>
      </PanelCard>

      <ConfigPendingPanel
        :entries="pendingEntries"
        title="待生效的改动"
        subtitle="暂存在 UCI 暂存区，还没有写入 /etc/config/network"
      >
        <template #actions>
          <el-button
            v-if="hasPending"
            size="small"
            type="danger"
            plain
            :icon="RotateCcw"
            :loading="discarding"
            @click="discardChanges"
          >
            放弃修改
          </el-button>
        </template>
      </ConfigPendingPanel>

      <PanelCard title="无线网段" subtitle="来自 /etc/config/wireless，本页只读" flush>
        <div v-if="model.wireless.length" class="desktop-only">
          <el-table :data="model.wireless" style="width: 100%">
            <el-table-column label="SSID" min-width="150">
              <template #default="{ row }">
                <div class="table-primary">{{ row.ssid || '（未命名）' }}</div>
                <div class="table-sub mono">{{ row.id }}</div>
              </template>
            </el-table-column>
            <el-table-column label="绑定网络" min-width="140">
              <template #default="{ row }">
                <span class="mono table-mono">{{ row.networks.join(' ') || '—' }}</span>
              </template>
            </el-table-column>
            <el-table-column label="模式" width="110">
              <template #default="{ row }">
                <span class="table-mono">{{ modeText(row.mode) }}</span>
              </template>
            </el-table-column>
            <el-table-column label="状态" width="90">
              <template #default="{ row }">
                <StatusBadge
                  :label="row.disabled ? '禁用' : '启用'"
                  :tone="row.disabled ? 'neutral' : 'success'"
                />
              </template>
            </el-table-column>
          </el-table>
        </div>

        <div v-if="model.wireless.length" class="mobile-only mobile-list">
          <div v-for="row in model.wireless" :key="row.id" class="mobile-row">
            <div class="mobile-row-head">
              <strong class="truncate">{{ row.ssid || '（未命名）' }}</strong>
              <StatusBadge
                :label="row.disabled ? '禁用' : '启用'"
                :tone="row.disabled ? 'neutral' : 'success'"
              />
            </div>
            <div class="mobile-line">
              <span>绑定网络</span>
              <span class="mono">{{ row.networks.join(' ') || '—' }}</span>
            </div>
            <div class="mobile-line">
              <span>模式</span>
              <span>{{ modeText(row.mode) }}</span>
            </div>
          </div>
        </div>

        <EmptyState
          v-if="!model.wireless.length"
          :icon="WifiOff"
          title="没有无线网段"
          description="这台设备没有配置无线网段，或 /etc/config/wireless 为空。"
        />
      </PanelCard>

      <p class="page-note">
        本页只写入 /etc/config/network。无线网段的修改请到
        <a href="#" @click.prevent="openWirelessConfig">无线配置</a>。
      </p>
    </template>

    <div v-else class="card">
      <div class="card-body">
        <el-skeleton :rows="6" animated />
      </div>
    </div>

    <NetInterfaceDialog
      v-model="ifaceDialog.open"
      :iface="ifaceDialog.iface"
      :devices="model.devices"
      :existing-names="model.sectionNames"
      :saving="busy"
      @save="saveInterface"
    />

    <NetRouteDialog
      v-model="routeDialog.open"
      :route="routeDialog.route"
      :interfaces="model.interfaces"
      :saving="busy"
      @save="saveRoute"
    />
  </div>
</template>

<script setup lang="ts">
  import { computed, onMounted, reactive, ref, watch } from 'vue'
  import { useRouter } from 'vue-router'
  import {
    Network,
    Pencil,
    Play,
    PlugZap,
    Plus,
    Power,
    RefreshCw,
    RotateCcw,
    Route,
    Save,
    Trash2,
    Users,
    WifiOff
  } from 'lucide-vue-next'
  import { ElMessage, ElMessageBox } from 'element-plus'
  import PageHeader from '@/components/PageHeader.vue'
  import PanelCard from '@/components/PanelCard.vue'
  import StatCard from '@/components/StatCard.vue'
  import StatusBadge from '@/components/StatusBadge.vue'
  import EmptyState from '@/components/EmptyState.vue'
  import DraftNotice from '@/components/DraftNotice.vue'
  import ConfigPendingPanel from '@/components/cfg-pending/ConfigPendingPanel.vue'
  import NetInterfaceDialog from '@/components/config-net/NetInterfaceDialog.vue'
  import NetRouteDialog from '@/components/config-net/NetRouteDialog.vue'
  import { useDraft, useUnsavedGuard } from '@/composables/useDraft'
  import { useRefreshSignal } from '@/composables/useRefresh'
  import { uciChanges, uciGet, type UciChange, type UciSection } from '@/api/uci'
  import {
    applyEdits,
    buildPendingEntries,
    resetDraft,
    stageEdits,
    type PendingEntry,
    type StagedEdit
  } from '@/api/configPending'
  import {
    addressText,
    applyNetwork,
    createEmptyNetworkModel,
    fetchActiveRoutes,
    fetchNetworkModel,
    matchActiveRoute,
    netmaskText,
    parseNetworkModel,
    protocolText,
    revertNetwork,
    routeTargetText,
    stageInterface,
    stageInterfaceEnabled,
    stageInterfaceRemoval,
    stageRoute,
    stageRouteRemoval,
    type NetActiveRoute,
    type NetInterface,
    type NetInterfaceDraft,
    type NetRoute,
    type NetRouteDraft,
    type NetworkModel
  } from '@/api/networkConfig'

  defineOptions({ name: 'NetworkConfigView' })

  const router = useRouter()

  /** The changes the console staged and that are not applied yet. */
  interface NetDraft {
    edits: StagedEdit[]
  }

  const draft = useDraft<NetDraft>('net-config', { edits: [] })
  /** The moment the draft was written the last time. */
  const savedAt = draft.savedAt

  const model = ref<NetworkModel>(createEmptyNetworkModel())
  /** The committed configuration of the router. */
  const baseline = ref<Record<string, UciSection>>({})
  /** True once the committed configuration has been read. */
  const baselineReady = ref(false)
  /** The change list the router reports for /etc/config/network. */
  const routerChanges = ref<UciChange[]>([])
  /** The kernel routing table, empty when the router does not report it. */
  const activeRoutes = ref<NetActiveRoute[]>([])
  const routeTableAvailable = ref(false)

  const loaded = ref(false)
  const error = ref<Error | null>(null)
  const refreshing = ref(false)
  const busy = ref(false)
  const applying = ref(false)
  const discarding = ref(false)
  const notice = ref('')

  const ifaceDialog = reactive<{ open: boolean; iface: NetInterface | null }>({
    open: false,
    iface: null
  })
  const routeDialog = reactive<{ open: boolean; route: NetRoute | null }>({
    open: false,
    route: null
  })

  const refreshSignal = useRefreshSignal()

  /* ------------------------------------------------------------ derived */

  /** The changes the router reports but the console did not stage itself. */
  const foreignEdits = computed<StagedEdit[]>(() => {
    const known = new Set(
      draftEdits.value.map((edit) => `${edit.section}.${edit.option ?? ''}`)
    )
    const edits: StagedEdit[] = []
    for (const change of routerChanges.value) {
      const key = `${change.section}.${change.option ?? ''}`
      if (known.has(key)) continue
      known.add(key)
      if (change.op === 'delete' && !change.option) {
        edits.push({ op: 'delete', section: change.section, before: '' })
      } else if (change.op === 'add') {
        edits.push({ op: 'add', section: change.section, type: change.type, before: '' })
      } else if (change.option) {
        edits.push({
          op: 'set',
          section: change.section,
          option: change.option,
          value: change.value ?? '',
          before: ''
        })
      }
    }
    return edits
  })

  /** The configuration as it will be after "保存并应用". */
  const effectiveValues = computed(() =>
    applyEdits(baseline.value, [...draftEdits.value, ...foreignEdits.value])
  )

  const pendingEntries = computed<PendingEntry[]>(() =>
    buildPendingEntries(baseline.value, routerChanges.value, [
      ...draftEdits.value,
      ...foreignEdits.value
    ])
  )

  const hasPending = computed(() => pendingEntries.value.length > 0)

  /** The draft only counts as dirty when it really carries changes. */
  /** The staged edits the draft keeps across reloads. */
  const draftEdits = computed(() => draft.value.value.edits)

  /** Replaces the recorded edits — the draft watcher persists them. */
  function setDraftEdits(next: StagedEdit[]): void {
    draft.value.value.edits = next
  }

  const draftDirty = computed(() => draft.dirty.value && draftEdits.value.length > 0)

  useUnsavedGuard(draftDirty, '网络配置有未保存的修改')

  const connectedCount = computed(
    () => model.value.interfaces.filter((iface) => model.value.runtime[iface.id]?.up).length
  )

  const committedModel = computed(() => parseNetworkModel(baseline.value))

  const removedInterfaces = computed<NetInterface[]>(() =>
    draftEdits.value
      .filter((edit) => edit.op === 'delete' && !edit.option)
      .map((edit) => committedModel.value.interfaces.find((item) => item.id === edit.section))
      .filter((item): item is NetInterface => Boolean(item))
  )

  const removedRoutes = computed<NetRoute[]>(() =>
    draftEdits.value
      .filter((edit) => edit.op === 'delete' && !edit.option)
      .map((edit) => committedModel.value.routes.find((item) => item.id === edit.section))
      .filter((item): item is NetRoute => Boolean(item))
  )

  const defaultRouteSections = computed(
    () => model.value.routes.filter((route) => route.isDefault).length
  )

  /** Interfaces that carry their own default gateway. */
  const gatewayInterfaces = computed(
    () => model.value.interfaces.filter((iface) => iface.gateway && iface.protocol === 'static').length
  )

  const defaultRouteMeta = computed(() => {
    const total = defaultRouteSections.value + gatewayInterfaces.value
    if (!total) return '没有配置默认路由'
    const parts: string[] = []
    if (defaultRouteSections.value) parts.push(`${defaultRouteSections.value} 条默认路由`)
    if (gatewayInterfaces.value) parts.push(`${gatewayInterfaces.value} 个接口网关`)
    return parts.join(' · ')
  })

  const interfaceMeta = computed(() => {
    const disabled = model.value.interfaces.filter((iface) => iface.disabled).length
    return disabled ? `${disabled} 个已禁用` : '全部处于启用状态'
  })

  /* ---------------------------------------------------------------- data */

  function delay(ms: number): Promise<void> {
    return new Promise((resolve) => window.setTimeout(resolve, ms))
  }

  async function load(): Promise<void> {
    const [values, changes] = await Promise.all([uciGet('network'), uciChanges('network')])

    // The committed configuration is the base of the change list. It is only
    // refreshed while the router has no staged changes — otherwise the
    // staged values would be mistaken for the old ones.
    if (!baselineReady.value || !changes.length) {
      baseline.value = values
      baselineReady.value = true
    }
    routerChanges.value = changes

    // The router's staging area is empty — the staged changes were applied
    // or discarded somewhere else, so the local record is outdated.
    if (!changes.length && draftEdits.value.length) {
      setDraftEdits([])
      await resetDraft(draft)
    }

    const [nextModel, routes] = await Promise.all([
      fetchNetworkModel(effectiveValues.value),
      fetchActiveRoutes()
    ])
    model.value = nextModel
    activeRoutes.value = routes.routes
    routeTableAvailable.value = routes.available
  }

  async function refresh(): Promise<void> {
    refreshing.value = true
    try {
      await load()
      error.value = null
      loaded.value = true
    } catch (err) {
      error.value = err instanceof Error ? err : new Error(String(err))
    } finally {
      refreshing.value = false
    }
  }

  onMounted(() => void refresh())
  watch(refreshSignal, () => void refresh())

  /* ------------------------------------------------------------- helpers */

  function messageOf(err: unknown): string {
    return err instanceof Error ? err.message : String(err)
  }

  async function confirm(
    message: string,
    title: string,
    type: 'warning' | 'error' | 'info' = 'warning'
  ): Promise<boolean> {
    try {
      await ElMessageBox.confirm(message, title, {
        type,
        confirmButtonText: '继续',
        cancelButtonText: '取消',
        distinguishCancelAndClose: true
      })
      return true
    } catch {
      return false
    }
  }

  function modeText(mode: string): string {
    if (mode === 'ap') return '接入点'
    if (mode === 'sta') return '客户端'
    if (mode === 'mesh') return '网状'
    if (mode === 'adhoc') return '自组织'
    return mode.toUpperCase()
  }

  /** The runtime state of an interface. */
  function runtimeOf(iface: NetInterface) {
    return model.value.runtime[iface.id]
  }

  /** The address the interface really has right now. */
  function runtimeAddress(iface: NetInterface): string {
    return runtimeOf(iface)?.address || ''
  }

  /** The link state of an interface. */
  function linkLabel(iface: NetInterface): string {
    if (iface.disabled) return '已禁用'
    const state = runtimeOf(iface)
    if (!state) return '状态未知'
    if (!state.up) return '链路离线'
    if (state.carrier === false) return '无载波'
    return '链路在线'
  }

  function linkTone(iface: NetInterface): 'success' | 'danger' | 'neutral' | 'warning' {
    if (iface.disabled) return 'neutral'
    const state = runtimeOf(iface)
    if (!state) return 'neutral'
    if (!state.up) return 'danger'
    if (state.carrier === false) return 'warning'
    return 'success'
  }

  /** The negotiated link speed of the device of an interface. */
  function linkSpeed(iface: NetInterface): string {
    const speed = runtimeOf(iface)?.speed
    if (!speed) return ''
    return speed >= 1000 ? `${speed / 1000} Gbps` : `${speed} Mbps`
  }

  /** Whether a static route is part of the kernel routing table. */
  function routeState(route: NetRoute): {
    label: string
    tone: 'success' | 'warning' | 'neutral'
    detail: string
  } {
    if (!routeTableAvailable.value) {
      return { label: '未知', tone: 'neutral', detail: '路由器未提供内核路由表' }
    }
    const match = matchActiveRoute(route, activeRoutes.value)
    if (match) {
      const parts: string[] = []
      if (match.nexthop) parts.push(`下一跳 ${match.nexthop}`)
      if (match.iface) parts.push(match.iface)
      return { label: '已生效', tone: 'success', detail: parts.join(' · ') }
    }
    return {
      label: '未生效',
      tone: 'warning',
      detail: route.isDefault ? '可能被 DHCP 下发的默认路由覆盖' : '内核路由表中没有这条路由'
    }
  }

  function openWirelessConfig(): void {
    void router.push({ name: 'config-wireless' })
  }

  /* ------------------------------------------------------------ dialogs */

  function openInterfaceDialog(iface?: NetInterface): void {
    ifaceDialog.iface = iface ?? null
    ifaceDialog.open = true
  }

  function openRouteDialog(route?: NetRoute): void {
    routeDialog.route = route ?? null
    routeDialog.open = true
  }

  /** Records the staged edits and refreshes the view. */
  function remember(edits: StagedEdit[]): void {
    setDraftEdits(stageEdits(baseline.value, draftEdits.value, edits))
  }

  /* ------------------------------------------------------------ interface */

  async function saveInterface(draftData: NetInterfaceDraft): Promise<void> {
    const original = draftData.id
      ? model.value.interfaces.find((iface) => iface.id === draftData.id)
      : undefined

    const addressChanged =
      Boolean(original) &&
      (original?.address !== draftData.address ||
        (original?.prefix ?? null) !== (draftData.prefix ?? null))
    const gatewayChanged = Boolean(original) && original?.gateway !== draftData.gateway

    if (addressChanged || gatewayChanged) {
      const details: string[] = []
      if (addressChanged) {
        details.push(
          `IPv4 地址（${original?.address || '无'} → ${draftData.address || '无'}）`
        )
      }
      if (gatewayChanged) {
        details.push(`网关（${original?.gateway || '无'} → ${draftData.gateway || '无'}）`)
      }
      const ok = await confirm(
        `修改接口 ${draftData.id || draftData.name || ''} 的 ${details.join('、')} ` +
          '会在点击「保存并应用」后重载网络服务，可能中断当前连接（包括本管理页面的访问）。' +
          '如果你正在通过该接口连接路由器，应用后可能无法继续访问本页面。是否继续？',
        '确认修改网络接口'
      )
      if (!ok) return
    }

    busy.value = true
    try {
      const result = await stageInterface(draftData)
      remember(result.edits)
      await load()
      ifaceDialog.open = false
      ElMessage.success('接口已暂存，点击「保存并应用」后生效')
      if (result.warning) notice.value = result.warning
    } catch (err) {
      ElMessage.error(`保存接口失败：${messageOf(err)}`)
    } finally {
      busy.value = false
    }
  }

  async function toggleInterface(iface: NetInterface, enabled: boolean): Promise<void> {
    if (!enabled) {
      const ok = await confirm(
        `禁用接口 ${iface.id} 会在点击「保存并应用」后重载网络服务，` +
          '该接口上的所有连接（包括本管理页面的访问）都会中断，' +
          '绑定该网络的设备将无法联网。是否继续？',
        '确认禁用接口'
      )
      if (!ok) return
    }

    busy.value = true
    try {
      const result = await stageInterfaceEnabled(iface.id, enabled)
      remember(result.edits)
      await load()
      ElMessage.success(`接口 ${iface.id} 已暂存为${enabled ? '启用' : '禁用'}`)
    } catch (err) {
      ElMessage.error(`操作失败：${messageOf(err)}`)
    } finally {
      busy.value = false
    }
  }

  async function removeInterface(iface: NetInterface): Promise<void> {
    const ok = await confirm(
      `删除接口 ${iface.id} 会移除它的地址、网关与 DNS 配置，` +
        '绑定该网络的设备可能失去连接，防火墙中引用该网络的区域也会失效。' +
        '删除在点击「保存并应用」后才会生效，在此之前可以用「放弃修改」撤销。是否继续？',
      '确认删除接口'
    )
    if (!ok) return

    busy.value = true
    try {
      const result = await stageInterfaceRemoval(iface.id)
      remember(result.edits)
      await load()
      ElMessage.success('接口已暂存删除，点击「保存并应用」后生效')
    } catch (err) {
      ElMessage.error(`删除接口失败：${messageOf(err)}`)
    } finally {
      busy.value = false
    }
  }

  /* ---------------------------------------------------------------- route */

  async function saveRoute(draftData: NetRouteDraft): Promise<void> {
    busy.value = true
    try {
      const result = await stageRoute(draftData)
      remember(result.edits)
      await load()
      routeDialog.open = false
      ElMessage.success('静态路由已暂存，点击「保存并应用」后生效')
    } catch (err) {
      ElMessage.error(`保存路由失败：${messageOf(err)}`)
    } finally {
      busy.value = false
    }
  }

  async function removeRoute(route: NetRoute): Promise<void> {
    const ok = await confirm(
      `删除到 ${routeTargetText(route)} 的静态路由（网关 ${route.gateway || '无'}）？` +
        '删除在点击「保存并应用」后才会生效，在此之前可以用「放弃修改」撤销。',
      '确认删除静态路由'
    )
    if (!ok) return

    busy.value = true
    try {
      const result = await stageRouteRemoval(route.id)
      remember(result.edits)
      await load()
      ElMessage.success('静态路由已暂存删除，点击「保存并应用」后生效')
    } catch (err) {
      ElMessage.error(`删除路由失败：${messageOf(err)}`)
    } finally {
      busy.value = false
    }
  }

  /* ---------------------------------------------------------- apply/revert */

  async function saveAndApply(): Promise<void> {
    if (!hasPending.value) {
      ElMessage.info('没有待应用的改动')
      return
    }

    const count = pendingEntries.value.length
    const ok = await confirm(
      (count
        ? `即将提交 ${count} 项网络改动并重载网络服务，`
        : '即将提交暂存区中的网络改动并重载网络服务，') +
        '网络接口会短暂重启，连接可能中断（包括本管理页面的访问）。是否继续？',
      '确认保存并应用'
    )
    if (!ok) return

    applying.value = true
    try {
      await applyNetwork()
      ElMessage.success('网络配置已保存并应用，正在重新读取接口状态…')
      setDraftEdits([])
      await resetDraft(draft)
      // The network service needs a moment before the new state is visible.
      await delay(2000)
      await load()
    } catch (err) {
      ElMessage.error(
        `应用网络配置失败：${messageOf(err)}。` +
          '配置可能已经写入 /etc/config/network，请刷新页面确认接口状态后再重试。'
      )
      await load().catch(() => undefined)
    } finally {
      applying.value = false
    }
  }

  async function discardChanges(): Promise<void> {
    const ok = await confirm(
      '放弃所有尚未提交的网络改动？路由器上已经生效的配置不会被修改，' +
        'UCI 暂存区会恢复成当前生效的内容。',
      '确认放弃修改'
    )
    if (!ok) return

    discarding.value = true
    try {
      await revertNetwork()
      setDraftEdits([])
      await resetDraft(draft)
      await load()
      ElMessage.success('已放弃未提交的改动')
    } catch (err) {
      ElMessage.error(`放弃改动失败：${messageOf(err)}`)
    } finally {
      discarding.value = false
    }
  }
</script>

<style scoped>
  /* Element Plus 给相邻按钮加了 12px 左边距，和外层 flex 的 gap 叠加后
     同一行的按钮会被拉到 20px 间距；这里把间距统一交回给 gap 控制。 */
  .el-button + .el-button {
    margin-left: 0;
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

  .removed-box {
    padding: 12px 16px;
    background: var(--warning-soft);
    border-top: 1px solid var(--border);
  }

  .removed-title {
    margin-bottom: 6px;
    color: var(--warning-text);
    font-size: 12px;
    font-weight: 600;
  }

  .removed-row {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 4px 0;
    color: var(--text-secondary);
    font-size: 12px;
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
    text-align: right;
  }

  .mobile-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    padding-top: 10px;
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
