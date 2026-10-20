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
        保存并应用<template v-if="pending.length">（{{ pending.length }}）</template>
      </el-button>
    </PageHeader>

    <el-alert v-if="error" type="error" :title="error.message" :closable="false" show-icon />
    <el-alert
      v-if="notice"
      type="warning"
      :title="notice"
      closable
      show-icon
      @close="notice = ''"
    />

    <el-alert
      v-if="hasPending"
      type="warning"
      show-icon
      :closable="false"
      class="pending-alert"
    >
      <template #title>
        <span>{{ pendingTitle }}</span>
      </template>
      <ul v-if="pending.length" class="pending-list">
        <li v-for="(change, index) in pending" :key="`${change.op}-${change.section}-${change.option}-${index}`">
          <span class="pending-op">{{ opText(change.op) }}</span>
          <span class="mono">{{ changeText(change) }}</span>
        </li>
      </ul>
      <p class="pending-hint">
        改动仍在 UCI 暂存区，尚未写入 /etc/config/network。点击右上角「保存并应用」后写入并重载网络服务；
        「放弃修改」可以撤销它们。
      </p>
    </el-alert>

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
          label="已连接接口"
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
          <el-button size="small" :icon="Plus" :disabled="busy" @click="openInterfaceDialog()">
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
            <el-table-column label="地址" min-width="140">
              <template #default="{ row }">
                <div class="table-primary mono">{{ addressText(row) }}</div>
                <div class="table-sub mono">{{ netmaskText(row) }}</div>
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
            <el-table-column label="状态" width="96">
              <template #default="{ row }">
                <StatusBadge
                  :label="row.disabled ? '禁用' : '启用'"
                  :tone="row.disabled ? 'neutral' : 'success'"
                />
                <div v-if="linkState(row)" class="table-sub">{{ linkState(row) }}</div>
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
              <StatusBadge
                :label="row.disabled ? '禁用' : '启用'"
                :tone="row.disabled ? 'neutral' : 'success'"
              />
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
          <el-button size="small" :icon="Plus" :disabled="busy" @click="openRouteDialog()">
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
            <el-table-column label="操作" width="150">
              <template #default="{ row }">
                <div class="row-actions">
                <el-button link size="small" :icon="Pencil" :disabled="busy" @click="openRouteDialog(row)">
                  编辑
                </el-button>
                <el-button link
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
              </template>
            </el-table-column>
          </el-table>
        </div>

        <div v-if="model.routes.length" class="mobile-only mobile-list">
          <div v-for="row in model.routes" :key="row.id" class="mobile-row">
            <div class="mobile-row-head">
              <strong class="truncate mono">{{ routeTargetText(row) }}</strong>
              <span class="num muted">跃点 {{ row.metric ?? '—' }}</span>
            </div>
            <div class="mobile-line">
              <span>网关</span>
              <span class="mono">{{ row.gateway || '—' }}</span>
            </div>
            <div class="mobile-line">
              <span>接口</span>
              <span class="mono">{{ row.iface || '—' }}</span>
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
  import NetInterfaceDialog from '@/components/config-net/NetInterfaceDialog.vue'
  import NetRouteDialog from '@/components/config-net/NetRouteDialog.vue'
  import { useRefreshSignal } from '@/composables/useRefresh'
  import type { UciChange } from '@/api/uci'
  import {
    addressText,
    applyNetwork,
    changeText,
    createEmptyNetworkModel,
    fetchNetworkModel,
    fetchPendingChanges,
    netmaskText,
    protocolText,
    revertNetwork,
    routeTargetText,
    stageInterface,
    stageInterfaceEnabled,
    stageInterfaceRemoval,
    stageRoute,
    stageRouteRemoval,
    type NetInterface,
    type NetInterfaceDraft,
    type NetRoute,
    type NetRouteDraft,
    type NetworkModel
  } from '@/api/networkConfig'

  defineOptions({ name: 'NetworkConfigView' })

  const router = useRouter()

  const model = ref<NetworkModel>(createEmptyNetworkModel())
  const pending = ref<UciChange[]>([])

  const loaded = ref(false)
  const error = ref<Error | null>(null)
  const refreshing = ref(false)
  const busy = ref(false)
  const applying = ref(false)
  const discarding = ref(false)
  const notice = ref('')
  /** Set as soon as a change was staged, even when the router does not report
   *  a change list. */
  const dirty = ref(false)

  /** Sections that were deleted but are still part of the pending changes. */
  const removedInterfaces = ref<NetInterface[]>([])
  const removedRoutes = ref<NetRoute[]>([])

  const ifaceDialog = reactive<{ open: boolean; iface: NetInterface | null }>({
    open: false,
    iface: null
  })
  const routeDialog = reactive<{ open: boolean; route: NetRoute | null }>({
    open: false,
    route: null
  })

  const refreshSignal = useRefreshSignal()

  const connectedCount = computed(
    () => model.value.interfaces.filter((iface) => model.value.runtime[iface.id]?.up).length
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

  const hasPending = computed(() => pending.value.length > 0 || dirty.value)

  const pendingTitle = computed(() =>
    pending.value.length
      ? `有 ${pending.value.length} 处未应用的改动`
      : '有未应用的改动'
  )

  /* ---------------------------------------------------------------- data */

  async function load(): Promise<void> {
    const [nextModel, nextChanges] = await Promise.all([
      fetchNetworkModel(),
      fetchPendingChanges()
    ])
    model.value = nextModel
    pending.value = nextChanges
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

  function opText(op: UciChange['op']): string {
    if (op === 'set') return '设置'
    if (op === 'delete') return '删除'
    if (op === 'add') return '新增'
    if (op === 'rename') return '重命名'
    if (op === 'move') return '移动'
    return op
  }

  function modeText(mode: string): string {
    if (mode === 'ap') return '接入点'
    if (mode === 'sta') return '客户端'
    if (mode === 'mesh') return '网状'
    if (mode === 'adhoc') return '自组织'
    return mode.toUpperCase()
  }

  /** The runtime link state of an interface. */
  function linkState(iface: NetInterface): string {
    const state = model.value.runtime[iface.id]
    if (!state) return ''
    return state.up ? '链路在线' : '链路离线'
  }

  function openWirelessConfig(): void {
    void router.push({ name: 'config-wireless' })
  }

  /* ------------------------------------------------------------- dialogs */

  function openInterfaceDialog(iface?: NetInterface): void {
    ifaceDialog.iface = iface ?? null
    ifaceDialog.open = true
  }

  function openRouteDialog(route?: NetRoute): void {
    routeDialog.route = route ?? null
    routeDialog.open = true
  }

  /* ------------------------------------------------------------ interface */

  async function saveInterface(draft: NetInterfaceDraft): Promise<void> {
    const original = draft.id
      ? model.value.interfaces.find((iface) => iface.id === draft.id)
      : undefined

    const addressChanged =
      Boolean(original) &&
      (original?.address !== draft.address ||
        (original?.prefix ?? null) !== (draft.prefix ?? null))
    const gatewayChanged = Boolean(original) && original?.gateway !== draft.gateway

    if (addressChanged || gatewayChanged) {
      const details: string[] = []
      if (addressChanged) {
        details.push(
          `IPv4 地址（${original?.address || '无'} → ${draft.address || '无'}）`
        )
      }
      if (gatewayChanged) {
        details.push(`网关（${original?.gateway || '无'} → ${draft.gateway || '无'}）`)
      }
      const ok = await confirm(
        `修改接口 ${draft.id || draft.name || ''} 的 ${details.join('、')} ` +
          '会立即重载网络服务，可能中断当前连接（包括本管理页面的访问）。' +
          '如果你正在通过该接口连接路由器，保存后可能无法继续访问本页面。是否继续？',
        '确认修改网络接口'
      )
      if (!ok) return
    }

    busy.value = true
    try {
      const result = await stageInterface(draft)
      await applyNetwork()
      await load()
      dirty.value = false
      ifaceDialog.open = false
      ElMessage.success('接口已保存并应用')
      if (result.warning) notice.value = result.warning
    } catch (err) {
      ElMessage.error(
        `保存接口失败：${messageOf(err)}。` +
          '若提示网络断开，说明配置已写入但网络重载中断了连接，请刷新页面确认接口状态。'
      )
    } finally {
      busy.value = false
    }
  }

  async function toggleInterface(iface: NetInterface, enabled: boolean): Promise<void> {
    if (!enabled) {
      const ok = await confirm(
        `禁用接口 ${iface.id} 会立即中断该接口上的所有连接（包括本管理页面的访问），` +
          '绑定该网络的设备将无法联网。是否继续？',
        '确认禁用接口'
      )
      if (!ok) return
    }

    busy.value = true
    try {
      await stageInterfaceEnabled(iface.id, enabled)
      await applyNetwork()
      await load()
      ElMessage.success(`接口 ${iface.id} 已${enabled ? '启用' : '禁用'}`)
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
      await stageInterfaceRemoval(iface.id)
      removedInterfaces.value = [...removedInterfaces.value, iface]
      await load()
      dirty.value = true
      ElMessage.success('接口已删除，点击「保存并应用」后生效')
    } catch (err) {
      ElMessage.error(`删除接口失败：${messageOf(err)}`)
    } finally {
      busy.value = false
    }
  }

  /* ---------------------------------------------------------------- route */

  async function saveRoute(draft: NetRouteDraft): Promise<void> {
    busy.value = true
    try {
      await stageRoute(draft)
      await load()
      dirty.value = true
      routeDialog.open = false
      ElMessage.success('静态路由已保存，点击「保存并应用」后生效')
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
      await stageRouteRemoval(route.id)
      removedRoutes.value = [...removedRoutes.value, route]
      await load()
      dirty.value = true
      ElMessage.success('静态路由已删除，点击「保存并应用」后生效')
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

    const count = pending.value.length
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
      await load()
      dirty.value = false
      removedInterfaces.value = []
      removedRoutes.value = []
      ElMessage.success('网络配置已保存并应用')
    } catch (err) {
      ElMessage.error(
        `应用网络配置失败：${messageOf(err)}。` +
          '配置可能已经写入 /etc/config/network，请刷新页面确认接口状态后再重试。'
      )
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
      await load()
      dirty.value = false
      removedInterfaces.value = []
      removedRoutes.value = []
      ElMessage.success('已放弃未提交的改动')
    } catch (err) {
      ElMessage.error(`放弃改动失败：${messageOf(err)}`)
    } finally {
      discarding.value = false
    }
  }
</script>

<style scoped>
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

  .pending-alert {
    align-items: flex-start;
  }

  .pending-list {
    padding: 0;
    margin: 6px 0 0;
    list-style: none;
  }

  .pending-list li {
    display: flex;
    align-items: baseline;
    gap: 8px;
    padding: 2px 0;
    color: var(--text-secondary);
    font-size: 12px;
  }

  .pending-op {
    flex-shrink: 0;
    min-width: 28px;
    color: var(--warning-text);
    font-size: 11px;
    font-weight: 500;
  }

  .pending-hint {
    margin-top: 8px;
    color: var(--text-muted);
    font-size: 11.5px;
    line-height: 1.6;
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
