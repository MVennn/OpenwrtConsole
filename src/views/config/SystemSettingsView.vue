<template>
  <div class="page">
    <PageHeader title="DHCP 与系统设置" description="主机名、时区、地址池、静态租约与管理员密码">
      <el-button :icon="RefreshCw" :loading="reloading || refreshing" @click="reloadAll">
        刷新
      </el-button>
      <el-button
        type="primary"
        :icon="Save"
        :loading="saving"
        :disabled="!pendingChanges.length"
        @click="saveEverything"
      >
        保存并应用<template v-if="pendingChanges.length">（{{ pendingChanges.length }}）</template>
      </el-button>
    </PageHeader>

    <DraftNotice :dirty="draftDirty" :saved-at="savedAt" @discard="discardChanges" />

    <el-alert v-if="error" type="error" :title="error?.message || '操作失败'" :closable="false" show-icon />
    <el-alert v-if="warning" type="warning" :title="warning" :closable="false" show-icon />

    <template v-if="loaded && snapshot">
      <ConfigPendingPanel
        :entries="pendingEntries"
        title="待生效的改动"
        subtitle="保存并应用之后才会写入路由器"
        empty-title="没有待保存的改动"
        empty-description="当前表单与路由器上生效的配置一致，修改之后这里会列出「旧值 → 新值」。"
      >
        <template #actions>
          <el-button
            v-if="pendingChanges.length"
            link
            size="small"
            type="primary"
            :icon="Undo2"
            @click="discardChanges"
          >
            放弃修改
          </el-button>
        </template>
      </ConfigPendingPanel>

      <div class="grid grid-4 stats-row">
        <StatCard
          label="静态租约"
          :value="snapshot.leases.length"
          suffix="条"
          meta="固定 MAC 与地址的绑定"
          :icon="KeyRound"
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
          label="主机名"
          :value="draft.identity.hostname || '—'"
          :meta="draft.identity.hostname ? '局域网内可见的设备名' : '尚未设置主机名'"
          :icon="Server"
          tone="neutral"
        />
        <StatCard
          label="时区"
          :value="draft.identity.timezone || '—'"
          :meta="draft.identity.timezone ? '系统时间与日志时间戳' : '尚未设置时区'"
          :icon="Clock"
          tone="warning"
        />
      </div>

      <div class="grid grid-2">
        <PanelCard title="主机名与时区" subtitle="设备名称、系统时区与时间同步">
          <template #actions>
            <el-button
              link
              type="primary"
              size="small"
              :loading="savingSystem"
              :disabled="!systemDirty"
              @click="saveIdentity"
            >
              保存
            </el-button>
          </template>

          <div class="field-grid">
            <SysFormField
              label="主机名"
              required
              for="sys-hostname"
              hint="局域网内其他设备看到的名称"
              :error="identityErrors.hostname"
            >
              <el-input
                id="sys-hostname"
                v-model="hostname"
                maxlength="63"
                placeholder="OpenWrt"
                @input="identityErrors.hostname = ''"
              />
            </SysFormField>

            <SysFormField label="时区" for="sys-timezone" hint="影响系统时间与日志时间戳">
              <el-select
                id="sys-timezone"
                v-model="timezone"
                filterable
                class="full"
                placeholder="选择时区"
              >
                <el-option v-for="zone in timezoneOptions" :key="zone" :label="zone" :value="zone" />
              </el-select>
            </SysFormField>

            <SysFormField label="日志大小" hint="syslog 缓冲区容量，单位 KB">
              <el-input-number
                v-model="logSize"
                :min="16"
                :max="4096"
                :step="16"
                controls-position="right"
                class="full"
              />
            </SysFormField>

            <SysFormField label="串口登录" hint="开启后串口控制台需要先登录">
              <el-switch v-model="ttylogin" />
            </SysFormField>

            <SysFormField
              class="span-2"
              label="NTP 服务器"
              for="sys-ntp"
              hint="多个地址之间用空格分隔"
            >
              <el-input
                id="sys-ntp"
                v-model="ntpText"
                placeholder="0.openwrt.pool.ntp.org 1.openwrt.pool.ntp.org"
              />
            </SysFormField>
          </div>
        </PanelCard>

        <PanelCard title="DNS 服务器与缓存" subtitle="dnsmasq 的上游解析与本地解析策略">
          <template #actions>
            <el-button
              link
              type="primary"
              size="small"
              :loading="savingDns"
              :disabled="!dnsDirty"
              @click="saveDnsmasq"
            >
              保存
            </el-button>
          </template>

          <div class="field-grid">
            <SysFormField
              class="span-2"
              label="上游 DNS 服务器"
              for="sys-dns"
              hint="多个地址之间用空格分隔，例如 223.5.5.5 119.29.29.29"
            >
              <el-input id="sys-dns" v-model="dnsServersText" placeholder="留空则跟随系统解析器" />
            </SysFormField>

            <SysFormField label="缓存条数" hint="0 表示不限制">
              <el-input-number
                v-model="cachesize"
                :min="0"
                :max="100000"
                :step="100"
                controls-position="right"
                class="full"
              />
            </SysFormField>

            <SysFormField label="只服务本地网络" hint="开启后 dnsmasq 只响应本地网络的查询">
              <el-switch v-model="localservice" />
            </SysFormField>

            <SysFormField
              class="span-2"
              label="忽略系统解析器"
              hint="开启后 dnsmasq 只使用上面配置的上游服务器，不再读取 /etc/resolv.conf"
            >
              <el-switch v-model="noresolv" />
            </SysFormField>
          </div>
        </PanelCard>

        <PanelCard title="地址池" subtitle="dnsmasq 下发的动态地址范围">
          <template #actions>
            <el-button
              link
              type="primary"
              size="small"
              :loading="savingPool"
              :disabled="!poolDirty"
              @click="savePool"
            >
              保存
            </el-button>
          </template>

          <div v-if="draft.pools.length" class="field-grid">
            <SysFormField class="span-2" label="地址池" hint="选择要编辑的接口">
              <el-select v-model="selectedPoolSection" class="full">
                <el-option
                  v-for="pool in poolOptions"
                  :key="pool.section"
                  :label="pool.label"
                  :value="pool.section"
                />
              </el-select>
            </SysFormField>

            <SysFormField label="起始地址" :hint="poolStartHint">
              <el-input-number
                v-model="poolStart"
                :min="1"
                :max="65000"
                controls-position="right"
                class="full"
              />
            </SysFormField>

            <SysFormField label="地址数量" hint="从起始地址开始可分配的地址个数">
              <el-input-number
                v-model="poolLimit"
                :min="1"
                :max="65000"
                controls-position="right"
                class="full"
              />
            </SysFormField>

            <SysFormField class="span-2" label="租期" hint="客户端获取到的地址有效期">
              <el-select v-model="poolLeaseTime" filterable allow-create class="full">
                <el-option v-for="time in leaseTimeOptions" :key="time" :label="time" :value="time" />
              </el-select>
            </SysFormField>
          </div>

          <div v-else class="pool-empty">
            <p class="muted text-xs">当前没有配置 DHCP 地址池段，dnsmasq 不会下发任何动态地址。</p>
            <div class="pool-add">
              <el-select v-model="newPoolInterface" class="full" placeholder="选择网络接口">
                <el-option
                  v-for="iface in networkInterfaces"
                  :key="iface"
                  :label="iface"
                  :value="iface"
                />
              </el-select>
              <el-button
                type="primary"
                :loading="poolBusy"
                :disabled="!newPoolInterface"
                @click="createPool"
              >
                添加地址池
              </el-button>
            </div>
          </div>

          <p class="card-note">
            <TriangleAlert :size="13" class="note-icon" />
            保存后 dnsmasq 会重启并重新下发地址，客户端需要重新获取租约。
          </p>
        </PanelCard>

        <PanelCard title="管理员密码" subtitle="修改 root 账户的登录密码">
          <template #actions>
            <el-button
              size="small"
              type="primary"
              :loading="passwordBusy"
              :disabled="!passwordReady"
              @click="submitPassword"
            >
              修改密码
            </el-button>
          </template>

          <div class="field-grid">
            <SysFormField label="用户名" required for="sys-user" hint="默认使用 root">
              <el-input id="sys-user" v-model="passwordUser" autocomplete="username" />
            </SysFormField>

            <SysFormField label="新密码" required for="sys-password" :error="passwordError">
              <el-input
                id="sys-password"
                v-model="passwordValue"
                type="password"
                show-password
                autocomplete="new-password"
                @input="clearPasswordErrors"
              />
            </SysFormField>

            <SysFormField label="确认密码" required for="sys-password2" :error="passwordConfirmError">
              <el-input
                id="sys-password2"
                v-model="passwordConfirm"
                type="password"
                show-password
                autocomplete="new-password"
                @input="clearPasswordErrors"
              />
            </SysFormField>
          </div>

          <div class="strength">
            <div class="strength-track">
              <div
                class="strength-fill"
                :class="`tone-${strength.tone}`"
                :style="{ width: `${strengthWidth}%` }"
              />
            </div>
            <span class="strength-label" :class="`tone-${strength.tone}`">{{ strength.label }}</span>
            <span class="strength-hint">{{ strength.hint }}</span>
          </div>

          <ul v-if="strength.suggestions.length" class="strength-list">
            <li v-for="item in strength.suggestions" :key="item" class="strength-item">
              <Lightbulb :size="12" />
              {{ item }}
            </li>
          </ul>

          <p class="card-note">
            <Info :size="13" class="note-icon" />
            留空表示不修改密码。修改成功后需要使用新密码重新登录。
          </p>
        </PanelCard>
      </div>

      <PanelCard title="静态租约" subtitle="固定 MAC 与地址的绑定关系" flush>
        <template #actions>
          <span class="count-badge">{{ snapshot.leases.length }}</span>
          <el-button link type="primary" size="small" :icon="Plus" @click="openLeaseDialog(null)">
            新增
          </el-button>
        </template>

        <div v-if="snapshot.leases.length" class="desktop-only">
          <el-table :data="leaseRows" style="width: 100%">
            <el-table-column label="主机名" min-width="180">
              <template #default="{ row }">
                <span class="table-primary">{{ row.name || '—' }}</span>
              </template>
            </el-table-column>
            <el-table-column label="MAC 地址" min-width="170">
              <template #default="{ row }">
                <span class="mono-value">{{ row.mac || '—' }}</span>
              </template>
            </el-table-column>
            <el-table-column label="IP 地址" min-width="150">
              <template #default="{ row }">
                <span class="mono-value">{{ row.ip || '—' }}</span>
              </template>
            </el-table-column>
            <el-table-column label="在线状态" min-width="150">
              <template #default="{ row }">
                <StatusBadge
                  :label="leaseState(row).online ? '在线' : '离线'"
                  :tone="leaseState(row).online ? 'success' : 'neutral'"
                />
                <div v-if="leaseState(row).device" class="table-sub">
                  {{ leaseState(row).device?.hostname || leaseState(row).device?.ip }}
                </div>
              </template>
            </el-table-column>
            <el-table-column label="操作" width="220" align="right">
              <template #default="{ row }">
                <div class="row-actions">
                  <el-button
                    link
                    size="small"
                    :icon="ExternalLink"
                    :disabled="!row.ip"
                    @click="openClient(row)"
                  >
                    查看客户端
                  </el-button>
                  <el-button link size="small" :icon="Pencil" @click="openLeaseDialog(row)">编辑</el-button>
                  <el-button link size="small" type="danger" :icon="Trash2" @click="removeLease(row)">
                    删除
                  </el-button>
                </div>
              </template>
            </el-table-column>
          </el-table>
        </div>

        <div v-if="snapshot.leases.length" class="mobile-only mobile-list">
          <div v-for="row in leaseRows" :key="row.section" class="mobile-row">
            <div class="mobile-row-head">
              <strong class="truncate">{{ row.name || '未命名' }}</strong>
              <span class="mono-value">{{ row.ip || '—' }}</span>
            </div>
            <div class="mobile-line">
              <span>MAC</span>
              <span class="mono-value">{{ row.mac || '—' }}</span>
            </div>
            <div class="mobile-line">
              <span>在线状态</span>
              <span>{{ leaseState(row).online ? '在线' : '离线' }}</span>
            </div>
            <div class="mobile-actions">
              <el-button
                size="small"
                :icon="ExternalLink"
                :disabled="!row.ip"
                @click="openClient(row)"
              >
                查看客户端
              </el-button>
              <el-button size="small" :icon="Pencil" @click="openLeaseDialog(row)">编辑</el-button>
              <el-button size="small" type="danger" plain :icon="Trash2" @click="removeLease(row)">
                删除
              </el-button>
            </div>
          </div>
        </div>

        <EmptyState
          v-if="!snapshot.leases.length"
          :icon="KeyRound"
          title="没有静态租约"
          description="点击右上角「新增」为设备绑定固定地址。"
        />
      </PanelCard>

      <PanelCard title="当前租约" subtitle="dnsmasq 正在下发的地址" flush>
        <template #actions>
          <span class="count-badge">{{ liveLeases.length }}</span>
          <el-button link size="small" :icon="RefreshCw" @click="refreshLeases">刷新</el-button>
        </template>

        <div v-if="liveLeases.length" class="desktop-only">
          <el-table :data="liveLeaseRows" style="width: 100%">
            <el-table-column label="主机名" min-width="180">
              <template #default="{ row }">
                <span class="table-primary">{{ row.hostname || '未命名' }}</span>
              </template>
            </el-table-column>
            <el-table-column label="MAC 地址" min-width="170">
              <template #default="{ row }">
                <span class="mono-value">{{ row.mac }}</span>
              </template>
            </el-table-column>
            <el-table-column label="IP 地址" min-width="150">
              <template #default="{ row }">
                <span class="mono-value">{{ row.ip }}</span>
              </template>
            </el-table-column>
            <el-table-column label="剩余有效期" min-width="140" align="right">
              <template #default="{ row }">
                <span v-if="row.remaining > 0" class="num">{{ row.remainingText }}</span>
                <StatusBadge v-else label="已过期" tone="warning" />
              </template>
            </el-table-column>
          </el-table>
        </div>

        <div v-if="liveLeases.length" class="mobile-only mobile-list">
          <div v-for="row in liveLeaseRows" :key="row.key" class="mobile-row">
            <div class="mobile-row-head">
              <strong class="truncate">{{ row.hostname || '未命名' }}</strong>
              <span v-if="row.remaining > 0" class="num">{{ row.remainingText }}</span>
              <StatusBadge v-else label="已过期" tone="warning" />
            </div>
            <div class="mobile-line">
              <span>IP</span>
              <span class="mono-value">{{ row.ip }}</span>
            </div>
            <div class="mobile-line">
              <span>MAC</span>
              <span class="mono-value">{{ row.mac }}</span>
            </div>
          </div>
        </div>

        <EmptyState
          v-if="!liveLeases.length"
          :icon="Users"
          title="没有活动租约"
          description="设备获取到地址后，租约会出现在这里。"
        />
      </PanelCard>
    </template>

    <div v-else class="card">
      <div class="card-body">
        <el-skeleton :rows="8" animated />
      </div>
    </div>

    <SysLeaseDialog
      ref="leaseDialog"
      v-model="leaseDialogVisible"
      :lease="editingLease"
      :leases="snapshot ? snapshot.leases : []"
      :pools="resolvedPools"
      @submit="onLeaseSubmit"
    />
  </div>
</template>

<script setup lang="ts">
  import { computed, onMounted, ref } from 'vue'
  import { useRouter } from 'vue-router'
  import {
    Clock,
    ExternalLink,
    Info,
    KeyRound,
    Lightbulb,
    Network,
    Pencil,
    Plus,
    RefreshCw,
    Save,
    Server,
    Trash2,
    TriangleAlert,
    Undo2,
    Users
  } from 'lucide-vue-next'
  import { ElMessage, ElMessageBox } from 'element-plus'
  import PageHeader from '@/components/PageHeader.vue'
  import PanelCard from '@/components/PanelCard.vue'
  import StatCard from '@/components/StatCard.vue'
  import StatusBadge from '@/components/StatusBadge.vue'
  import EmptyState from '@/components/EmptyState.vue'
  import DraftNotice from '@/components/DraftNotice.vue'
  import ConfigPendingPanel from '@/components/cfg-pending/ConfigPendingPanel.vue'
  import SysFormField from '@/components/config-sys/SysFormField.vue'
  import SysLeaseDialog from '@/components/config-sys/SysLeaseDialog.vue'
  import { useDraft, useUnsavedGuard } from '@/composables/useDraft'
  import { usePolling } from '@/composables/usePolling'
  import { uciChanges, type UciChange } from '@/api/uci'
  import {
    buildPendingEntries,
    resetDraft,
    type PendingEntry
  } from '@/api/configPending'
  import {
    addDhcpPool,
    addStaticLease,
    changeAdminPassword,
    cloneDraft,
    deleteStaticLease,
    diffDnsmasq,
    diffIdentity,
    diffPools,
    diffSnapshots,
    draftFromSnapshot,
    emptyDraft,
    isValidHostname,
    matchLeaseOnline,
    readInterfaceAddresses,
    readLeases,
    readNetworkInterfaces,
    readOnlineDevices,
    readRawConfigs,
    readSnapshot,
    readTimezones,
    resolvePools,
    saveSettings,
    scorePassword,
    splitList,
    updateStaticLease,
    type SysChange,
    type SysDraft,
    type SysInterfaceAddress,
    type SysLease,
    type SysLeaseState,
    type SysOnlineDevice,
    type SysRawConfigs,
    type SysResolvedPool,
    type SysSnapshot,
    type SysStaticLease
  } from '@/api/systemSettings'
  import { formatDurationShort } from '@/utils/format'
  import { systemOps } from '@/api/systemOps'

  defineOptions({ name: 'SystemSettingsView' })

  const LEASE_TIME_OPTIONS = ['1h', '2h', '4h', '6h', '12h', '24h', '48h', '168h']

  const router = useRouter()

  /** The state of the router — the reference of every diff. */
  const snapshot = ref<SysSnapshot | null>(null)
  /** The editable state; it survives a reload until it is saved or discarded. */
  const draftStore = useDraft<SysDraft>('sys-config', emptyDraft())
  const draft = draftStore.value
  const savedAt = draftStore.savedAt

  const liveLeases = ref<SysLease[]>([])
  const onlineDevices = ref<SysOnlineDevice[]>([])
  const timezones = ref<string[]>([])
  const addresses = ref<Record<string, SysInterfaceAddress>>({})
  const networkInterfaces = ref<string[]>([])
  const rawConfigs = ref<SysRawConfigs>({ dhcp: {}, system: {} })
  const dhcpChanges = ref<UciChange[]>([])
  const systemChanges = ref<UciChange[]>([])

  const saving = ref(false)
  const reloading = ref(false)
  const savingSystem = ref(false)
  const savingDns = ref(false)
  const savingPool = ref(false)
  const poolBusy = ref(false)
  const passwordBusy = ref(false)
  const warning = ref('')

  const selectedPoolSection = ref('')
  const newPoolInterface = ref('')

  const leaseDialogVisible = ref(false)
  const editingLease = ref<SysStaticLease | null>(null)
  const leaseDialog = ref<InstanceType<typeof SysLeaseDialog> | null>(null)

  const passwordUser = ref('root')
  const passwordValue = ref('')
  const passwordConfirm = ref('')
  const passwordError = ref('')
  const passwordConfirmError = ref('')

  const identityErrors = ref({ hostname: '' })

  /* ------------------------------------------------------------ derived */

  /** The draft as a snapshot, so the diff helpers can be reused. */
  const draftSnapshot = computed<SysSnapshot>(() => ({
    identity: draft.value.identity,
    dnsmasq: draft.value.dnsmasq,
    pools: draft.value.pools,
    leases: snapshot.value?.leases ?? []
  }))

  const pendingChanges = computed<SysChange[]>(() => {
    if (!snapshot.value) return []
    return diffSnapshots(draftSnapshot.value, snapshot.value)
  })

  /** The local changes plus the changes the router reports for its staging area. */
  const pendingEntries = computed<PendingEntry[]>(() => {
    const local = pendingChanges.value.map((change) => ({
      op: 'set' as const,
      section: change.section,
      option: change.option,
      type: '',
      label: change.label,
      before: change.before,
      after: change.after,
      target: `${change.config} · ${change.section}.${change.option}`
    }))

    const known = new Set(local.map((entry) => `${entry.section}.${entry.option}`))
    const routerEntries: PendingEntry[] = []

    const collect = (config: 'dhcp' | 'system', changes: UciChange[]): void => {
      for (const entry of buildPendingEntries(rawConfigs.value[config], changes, [])) {
        const key = `${entry.section}.${entry.option}`
        if (known.has(key)) continue
        known.add(key)
        routerEntries.push({ ...entry, target: `${config} · ${entry.target}` })
      }
    }

    collect('dhcp', dhcpChanges.value)
    collect('system', systemChanges.value)

    return [...local, ...routerEntries]
  })

  const draftDirty = computed(() => draftStore.dirty.value && pendingChanges.value.length > 0)

  useUnsavedGuard(draftDirty, '系统设置有未保存的修改')

  const systemDirty = computed(() => {
    if (!snapshot.value) return false
    return diffIdentity(draft.value.identity, snapshot.value.identity).length > 0
  })

  const dnsDirty = computed(() => {
    if (!snapshot.value) return false
    return diffDnsmasq(draft.value.dnsmasq, snapshot.value.dnsmasq).length > 0
  })

  const poolDirty = computed(() => {
    if (!snapshot.value) return false
    return diffPools(draft.value.pools, snapshot.value.pools).length > 0
  })

  const resolvedPools = computed<SysResolvedPool[]>(() =>
    resolvePools(draft.value.pools, addresses.value)
  )

  const poolOptions = computed(() =>
    resolvedPools.value.map((pool) => ({
      section: pool.section,
      label: pool.interface
        ? `${pool.interface} · ${pool.startIp || `偏移 ${pool.start}`} – ${pool.endIp || `偏移 ${pool.start + pool.limit - 1}`}`
        : pool.section
    }))
  )

  const currentPool = computed(() => {
    const pools = draft.value.pools
    return (
      pools.find((pool) => pool.section === selectedPoolSection.value) ?? pools[0] ?? null
    )
  })

  const poolCapacity = computed(() =>
    draft.value.pools.reduce((total, pool) => total + pool.limit, 0)
  )

  const poolMeta = computed(() => {
    const pool = resolvedPools.value[0]
    if (!pool) return '未配置地址池'
    if (!pool.startIp) return `接口 ${pool.interface || '—'} · 偏移 ${pool.start}`
    return `${pool.startIp} – ${pool.endIp}`
  })

  const poolStartHint = computed(() => {
    const pool = currentPool.value
    if (!pool) return ''
    const resolved = resolvedPools.value.find((item) => item.section === pool.section)
    if (!resolved?.startIp) return '相对网络地址的偏移，例如 100 表示第 100 个地址'
    return `实际起始地址 ${resolved.startIp}`
  })

  const timezoneOptions = computed(() => {
    const options = new Set(timezones.value)
    const current = draft.value.identity.timezone
    if (current) options.add(current)
    return [...options].sort((a, b) => a.localeCompare(b))
  })

  const leaseRows = computed(() => snapshot.value?.leases ?? [])

  /** The online state of every static lease. */
  const leaseStates = computed(() => {
    const map = new Map<string, SysLeaseState>()
    for (const lease of leaseRows.value) {
      map.set(lease.section, matchLeaseOnline(lease, onlineDevices.value))
    }
    return map
  })

  const liveLeaseRows = computed(() =>
    liveLeases.value
      .map((lease) => {
        const remaining = Number(lease.expiry) - Date.now() / 1000
        return {
          key: `${lease.mac}-${lease.ip}`,
          hostname: lease.hostname,
          mac: lease.mac,
          ip: lease.ip,
          remaining,
          remainingText: formatDurationShort(remaining)
        }
      })
      .sort((a, b) => b.remaining - a.remaining)
  )

  const strength = computed(() => scorePassword(passwordValue.value))
  const strengthWidth = computed(() => Math.min(100, Math.max(8, (strength.value.score + 1) * 25)))

  const passwordReady = computed(
    () => !!passwordUser.value.trim() && !!passwordValue.value && passwordValue.value === passwordConfirm.value
  )

  /* -------------------------------------------------------- form bindings */

  const hostname = computed({
    get: () => draft.value.identity.hostname ?? '',
    set: (value: string) => {
      draft.value.identity.hostname = value
    }
  })

  const timezone = computed({
    get: () => draft.value.identity.timezone ?? '',
    set: (value: string) => {
      draft.value.identity.timezone = value
    }
  })

  const logSize = computed({
    get: () => draft.value.identity.logSize ?? 64,
    set: (value: number | undefined) => {
      draft.value.identity.logSize = value ?? 64
    }
  })

  const ttylogin = computed({
    get: () => draft.value.identity.ttylogin ?? true,
    set: (value: boolean) => {
      draft.value.identity.ttylogin = value
    }
  })

  const ntpText = computed({
    get: () => (draft.value.identity.ntpServers ?? []).join(' '),
    set: (value: string) => {
      draft.value.identity.ntpServers = splitList(value)
    }
  })

  const dnsServersText = computed({
    get: () => (draft.value.dnsmasq.servers ?? []).join(' '),
    set: (value: string) => {
      draft.value.dnsmasq.servers = splitList(value)
    }
  })

  const cachesize = computed({
    get: () => draft.value.dnsmasq.cachesize ?? 0,
    set: (value: number | undefined) => {
      draft.value.dnsmasq.cachesize = value ?? 0
    }
  })

  const noresolv = computed({
    get: () => draft.value.dnsmasq.noresolv ?? false,
    set: (value: boolean) => {
      draft.value.dnsmasq.noresolv = value
    }
  })

  const localservice = computed({
    get: () => draft.value.dnsmasq.localservice ?? false,
    set: (value: boolean) => {
      draft.value.dnsmasq.localservice = value
    }
  })

  const poolStart = computed({
    get: () => currentPool.value?.start ?? 100,
    set: (value: number | undefined) => {
      const pool = currentPool.value
      if (pool) pool.start = value ?? 100
    }
  })

  const poolLimit = computed({
    get: () => currentPool.value?.limit ?? 150,
    set: (value: number | undefined) => {
      const pool = currentPool.value
      if (pool) pool.limit = value ?? 150
    }
  })

  const poolLeaseTime = computed({
    get: () => currentPool.value?.leasetime ?? '12h',
    set: (value: string) => {
      const pool = currentPool.value
      if (pool) pool.leasetime = value
    }
  })

  /* ------------------------------------------------------------- loading */

  async function loadConfig(): Promise<void> {
    const [next, nextAddresses, raw, dhcpDelta, systemDelta] = await Promise.all([
      readSnapshot(),
      readInterfaceAddresses().catch(() => ({}) as Record<string, SysInterfaceAddress>),
      readRawConfigs().catch(() => ({ dhcp: {}, system: {} }) as SysRawConfigs),
      uciChanges('dhcp').catch(() => [] as UciChange[]),
      uciChanges('system').catch(() => [] as UciChange[])
    ])

    addresses.value = nextAddresses
    snapshot.value = next
    rawConfigs.value = raw
    dhcpChanges.value = dhcpDelta
    systemChanges.value = systemDelta

    // Without a restored draft the form starts with the state of the router.
    if (!draftStore.dirty.value) {
      draft.value = draftFromSnapshot(next)
      await resetDraft(draftStore)
    }

    const pools = draft.value.pools
    if (!selectedPoolSection.value || !pools.some((pool) => pool.section === selectedPoolSection.value)) {
      selectedPoolSection.value = pools[0]?.section ?? ''
    }
  }

  /** Writes the state of the router back into the draft and clears it. */
  async function resetDraftToServer(): Promise<void> {
    if (!snapshot.value) return
    draft.value = draftFromSnapshot(snapshot.value)
    await resetDraft(draftStore)
  }

  async function refreshLeases(): Promise<void> {
    try {
      liveLeases.value = await readLeases()
      warning.value = ''
    } catch {
      // The lease file is optional, a failure must not break the page.
      warning.value = '读取当前租约失败，其余配置仍可正常编辑。'
    }
  }

  async function refreshOnlineDevices(): Promise<void> {
    try {
      onlineDevices.value = await readOnlineDevices()
    } catch {
      // The online list is an extra, the rest of the page still works.
    }
  }

  async function reloadAll(): Promise<void> {
    reloading.value = true
    try {
      await Promise.all([loadConfig(), refreshLeases(), refreshOnlineDevices()])
      ElMessage.success('已重新读取路由器配置')
    } catch (err) {
      ElMessage.error(err instanceof Error ? err.message : '读取配置失败')
    } finally {
      reloading.value = false
    }
  }

  const { loaded, error, refreshing } = usePolling(async () => {
    if (!snapshot.value) await loadConfig()
    await Promise.all([refreshLeases(), refreshOnlineDevices()])
  }, 10000)

  onMounted(() => {
    void (async () => {
      const [zones, ifaces] = await Promise.all([
        readTimezones([
          'Asia/Shanghai',
          'Asia/Hong_Kong',
          'Asia/Singapore',
          'Asia/Tokyo',
          'Europe/London',
          'Europe/Berlin',
          'America/New_York',
          'America/Los_Angeles',
          'UTC'
        ]),
        readNetworkInterfaces().catch(() => [] as string[])
      ])
      timezones.value = zones
      networkInterfaces.value = ifaces
      if (!newPoolInterface.value && ifaces.length) newPoolInterface.value = ifaces[0]
    })()
  })

  /* --------------------------------------------------------------- saving */

  async function runSave(scope: 'system' | 'dns' | 'pool' | 'all', flag: typeof saving): Promise<void> {
    if (!snapshot.value) return

    if (scope === 'system' || scope === 'all') {
      const host = draft.value.identity.hostname.trim()
      if (!host) {
        identityErrors.value = { hostname: '请填写主机名' }
        return
      }
      if (!isValidHostname(host)) {
        identityErrors.value = {
          hostname: '主机名只能包含字母、数字、点、短横线和下划线，且需以字母或数字开头'
        }
        return
      }
      identityErrors.value = { hostname: '' }
    }

    flag.value = true
    try {
      const changed = await saveSettings(draftSnapshot.value, snapshot.value, scope)
      // The router is the source of truth again after a successful apply.
      await loadConfig()
      await resetDraftToServer()
      ElMessage.success(changed ? `已保存并应用 ${changed} 项改动` : '没有需要保存的改动')
    } catch (err) {
      ElMessage.error(err instanceof Error ? err.message : '保存失败，配置已回滚')
      await loadConfig()
    } finally {
      flag.value = false
    }
  }

  function saveEverything(): void {
    void runSave('all', saving)
  }

  function saveIdentity(): void {
    void runSave('system', savingSystem)
  }

  function saveDnsmasq(): void {
    void runSave('dns', savingDns)
  }

  function savePool(): void {
    void runSave('pool', savingPool)
  }

  async function discardChanges(): Promise<void> {
    if (!snapshot.value) return

    const configs: Array<'dhcp' | 'system'> = []
    if (systemDirty.value) configs.push('system')
    if (dnsDirty.value || poolDirty.value) configs.push('dhcp')

    try {
      await ElMessageBox.confirm(
        configs.length
          ? '放弃当前未保存的修改吗？路由器上尚未提交的 dhcp / system 改动也会一并丢弃。'
          : '放弃当前未保存的修改吗？',
        '放弃修改',
        {
          type: 'warning',
          confirmButtonText: '放弃修改',
          cancelButtonText: '取消'
        }
      )
    } catch {
      return
    }

    // `uci revert` discards the staged changes of a config file, so the
    // router keeps the state it had before this page started editing.
    for (const config of configs) {
      try {
        await systemOps.revertConfig(config)
      } catch {
        // Nothing staged for that config, the local reset is enough.
      }
    }

    await resetDraftToServer()
    selectedPoolSection.value = draft.value.pools[0]?.section ?? ''
    ElMessage.info('已放弃未保存的修改')
  }

  /* --------------------------------------------------------------- pools */

  async function createPool(): Promise<void> {
    if (!newPoolInterface.value) return
    poolBusy.value = true
    try {
      await addDhcpPool({
        interface: newPoolInterface.value,
        start: 100,
        limit: 150,
        leasetime: '12h'
      })
      await loadConfig()
      // Keep the edits of the existing pools, add the new one.
      const serverPools = snapshot.value?.pools ?? []
      draft.value.pools = serverPools.map((pool) => {
        const local = draft.value.pools.find((item) => item.section === pool.section)
        return local ?? { ...pool }
      })
      const pools = draft.value.pools
      selectedPoolSection.value = pools.length ? pools[pools.length - 1].section : ''
      ElMessage.success('地址池已创建')
    } catch (err) {
      ElMessage.error(err instanceof Error ? err.message : '创建地址池失败')
    } finally {
      poolBusy.value = false
    }
  }

  /* -------------------------------------------------------- static leases */

  function openLeaseDialog(lease: SysStaticLease | null): void {
    editingLease.value = lease
    leaseDialogVisible.value = true
  }

  /** The online state of a static lease. */
  function leaseState(lease: SysStaticLease): SysLeaseState {
    return leaseStates.value.get(lease.section) ?? { online: false, device: null }
  }

  /** Opens the client list and points at the device of the lease. */
  function openClient(lease: SysStaticLease): void {
    void router.push({ name: 'clients', query: { ip: lease.ip, mac: lease.mac } })
    ElMessage.info(`已跳转到客户端列表，可搜索 ${lease.ip || lease.mac} 查看这台设备`)
  }

  async function onLeaseSubmit(value: { name: string; mac: string; ip: string }): Promise<void> {
    try {
      if (editingLease.value) {
        await updateStaticLease({ ...editingLease.value, ...value })
        ElMessage.success('静态租约已更新')
      } else {
        await addStaticLease(value)
        ElMessage.success('静态租约已新增')
      }
      leaseDialogVisible.value = false
      await loadConfig()
      await refreshOnlineDevices()
    } catch (err) {
      ElMessage.error(err instanceof Error ? err.message : '保存静态租约失败')
    } finally {
      leaseDialog.value?.finish()
    }
  }

  async function removeLease(lease: SysStaticLease): Promise<void> {
    try {
      await ElMessageBox.confirm(
        `确定删除「${lease.name || lease.mac}」的静态租约吗？该设备之后会重新从地址池获取地址。`,
        '删除静态租约',
        {
          type: 'warning',
          confirmButtonText: '确认删除',
          cancelButtonText: '取消',
          confirmButtonClass: 'el-button--danger'
        }
      )
    } catch {
      return
    }

    try {
      await deleteStaticLease(lease.section)
      await loadConfig()
      await refreshOnlineDevices()
      ElMessage.success('静态租约已删除')
    } catch (err) {
      ElMessage.error(err instanceof Error ? err.message : '删除静态租约失败')
    }
  }

  /* ------------------------------------------------------------ password */

  function clearPasswordErrors(): void {
    passwordError.value = ''
    passwordConfirmError.value = ''
  }

  async function submitPassword(): Promise<void> {
    clearPasswordErrors()
    const user = passwordUser.value.trim()
    if (!user) {
      passwordError.value = '请填写用户名'
      return
    }
    if (!passwordValue.value) {
      passwordError.value = '请填写新密码'
      return
    }
    if (passwordValue.value !== passwordConfirm.value) {
      passwordConfirmError.value = '两次输入的密码不一致'
      return
    }
    if (passwordValue.value.length < 8) {
      passwordError.value = '密码至少需要 8 位'
      return
    }

    try {
      await ElMessageBox.confirm(
        `确定将 ${user} 账户的密码修改为新密码吗？修改后需要使用新密码重新登录。`,
        '修改管理员密码',
        {
          type: 'warning',
          confirmButtonText: '确认修改',
          cancelButtonText: '取消',
          confirmButtonClass: 'el-button--danger'
        }
      )
    } catch {
      return
    }

    passwordBusy.value = true
    try {
      await changeAdminPassword(user, passwordValue.value)
      passwordValue.value = ''
      passwordConfirm.value = ''
      ElMessage.success('管理员密码已修改')
    } catch (err) {
      ElMessage.error(err instanceof Error ? err.message : '修改密码失败')
    } finally {
      passwordBusy.value = false
    }
  }

  /* ------------------------------------------------------------- helpers */

  const leaseTimeOptions = LEASE_TIME_OPTIONS
</script>

<style scoped>
  /* Element Plus 给相邻按钮加了 12px 左边距，和外层 flex 的 gap 叠加后
     同一行的按钮会被拉到 20px 间距；这里把间距统一交回给 gap 控制。 */
  .el-button + .el-button {
    margin-left: 0;
  }

  .stats-row :deep(.stat-value) {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .change-list {
    display: flex;
    flex-direction: column;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .change-row {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 8px 0;
    font-size: var(--text-sm);
    border-bottom: 1px solid var(--border);
  }

  .change-row:last-child {
    border-bottom: 0;
  }

  .change-config {
    flex-shrink: 0;
    padding: 1px 6px;
    color: var(--text-muted);
    font-size: 10.5px;
    background: var(--surface-2);
    border-radius: 4px;
  }

  .change-label {
    flex-shrink: 0;
    min-width: 96px;
    color: var(--text-secondary);
    font-weight: 500;
  }

  .change-value {
    flex: 1 1 0;
    min-width: 0;
    color: var(--text-muted);
    font-size: 12px;
  }

  .change-value.is-next {
    color: var(--brand-text);
  }

  .change-arrow {
    flex-shrink: 0;
    color: var(--text-faint);
  }

  .field-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 14px 18px;
  }

  .field-grid .span-2 {
    grid-column: span 2;
  }

  .full {
    width: 100%;
  }

  .pool-empty {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .pool-add {
    display: flex;
    gap: 8px;
  }

  .pool-add .el-select {
    flex: 1 1 auto;
  }

  .card-note {
    display: flex;
    align-items: flex-start;
    gap: 6px;
    margin-top: 14px;
    padding-top: 12px;
    color: var(--text-muted);
    font-size: var(--text-xs);
    line-height: 1.6;
    border-top: 1px solid var(--border);
  }

  .note-icon {
    flex-shrink: 0;
    margin-top: 2px;
  }

  .strength {
    display: flex;
    align-items: center;
    gap: 10px;
    margin-top: 14px;
  }

  .strength-track {
    flex: 1 1 auto;
    height: 5px;
    overflow: hidden;
    background: var(--surface-2);
    border-radius: 999px;
  }

  .strength-fill {
    height: 100%;
    background: var(--text-faint);
    border-radius: inherit;
    transition: width 0.25s ease;
  }

  .strength-fill.tone-danger {
    background: var(--danger);
  }

  .strength-fill.tone-warning {
    background: var(--warning);
  }

  .strength-fill.tone-success {
    background: var(--success);
  }

  .strength-label {
    flex-shrink: 0;
    font-size: var(--text-xs);
    font-weight: 500;
  }

  .strength-label.tone-danger {
    color: var(--danger-text);
  }

  .strength-label.tone-warning {
    color: var(--warning-text);
  }

  .strength-label.tone-success {
    color: var(--success-text);
  }

  .strength-hint {
    flex-shrink: 0;
    color: var(--text-muted);
    font-size: 11.5px;
  }

  .strength-list {
    display: flex;
    flex-direction: column;
    gap: 4px;
    margin: 10px 0 0;
    padding: 0;
    list-style: none;
  }

  .strength-item {
    display: flex;
    align-items: flex-start;
    gap: 6px;
    color: var(--text-muted);
    font-size: 11.5px;
    line-height: 1.6;
  }

  .strength-item svg {
    flex-shrink: 0;
    margin-top: 2px;
    color: var(--text-faint);
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

  .mobile-actions {
    display: flex;
    gap: 8px;
    margin-top: 10px;
  }

  @media (max-width: 640px) {
    .field-grid {
      grid-template-columns: minmax(0, 1fr);
    }

    .field-grid .span-2 {
      grid-column: span 1;
    }

    .change-row {
      flex-wrap: wrap;
      gap: 6px 8px;
    }

    .change-label {
      min-width: 0;
    }

    .pool-add {
      flex-direction: column;
      align-items: stretch;
    }

    .strength {
      flex-wrap: wrap;
    }

    .strength-hint {
      width: 100%;
    }
  }
</style>
