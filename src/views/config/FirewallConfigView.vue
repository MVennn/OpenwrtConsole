<template>
  <div class="page">
    <PageHeader title="防火墙配置" description="安全区域、区域转发、端口转发与出站规则，保存后可一键应用">
      <el-button :icon="RefreshCw" :loading="refreshing" @click="refresh">刷新</el-button>
      <el-button
        v-if="pending.length || dirty"
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
        <FwOffloadCard
          :software="defaults.flowOffloading"
          :hardware="defaults.flowOffloadingHw"
          :disabled="busy"
          @toggle="toggleOffload"
        />
      </div>

      <PanelCard title="默认策略" subtitle="defaults 段：未被区域规则命中的流量按这里处理">
        <div class="policy-grid">
          <div v-for="policy in defaultPolicies" :key="policy.key" class="policy-cell">
            <span class="policy-key">{{ policy.key }}</span>
            <StatusBadge
              :label="policy.value || '未设置'"
              :tone="policyTone(policy.value)"
              :dot="false"
            />
          </div>
          <div class="policy-cell">
            <span class="policy-key">synflood_protect</span>
            <StatusBadge :label="flagLabel(defaults.synfloodProtect)" :tone="flagTone(defaults.synfloodProtect)" />
          </div>
          <div class="policy-cell">
            <span class="policy-key">drop_invalid</span>
            <StatusBadge :label="flagLabel(defaults.dropInvalid)" :tone="flagTone(defaults.dropInvalid)" />
          </div>
        </div>
      </PanelCard>

      <PanelCard title="安全区域" :subtitle="`${zones.length} 个 zone 段`">
        <template #actions>
          <el-button size="small" :icon="Plus" :disabled="busy" @click="openZoneDialog()">
            新增区域
          </el-button>
        </template>

        <div v-if="zones.length" class="zone-grid">
          <FwZoneCard
            v-for="zone in zones"
            :key="zone.id"
            :zone="zone"
            :disabled="busy"
            @edit="openZoneDialog"
            @remove="removeZone"
          />
        </div>

        <EmptyState
          v-else
          :icon="ShieldOff"
          title="没有配置安全区域"
          description="路由器未加载 /etc/config/firewall，或该文件中不包含任何 zone 段。"
        />
      </PanelCard>

      <PanelCard title="区域转发" :subtitle="`${forwardings.length} 条 forwarding 段`">
        <template #actions>
          <el-button size="small" :icon="Plus" :disabled="busy" @click="openForwardingDialog()">
            新增转发
          </el-button>
        </template>

        <div v-if="forwardings.length" class="forward-list">
          <div v-for="item in forwardings" :key="item.id" class="forward-row">
            <span class="forward-zone">{{ item.src || '—' }}</span>
            <ArrowRight :size="14" :stroke-width="2" class="forward-arrow" />
            <span class="forward-zone">{{ item.dest || '—' }}</span>
            <span class="forward-id mono">{{ item.id }}</span>
            <span class="forward-spacer" />
            <el-button size="small" :icon="Pencil" :disabled="busy" @click="openForwardingDialog(item)">
              编辑
            </el-button>
            <el-button
              size="small"
              type="danger"
              plain
              :icon="Trash2"
              :disabled="busy"
              @click="removeForwarding(item)"
            >
              删除
            </el-button>
          </div>
        </div>

        <EmptyState
          v-else
          :icon="Route"
          title="没有区域转发"
          description="没有配置区域之间的流量转发，所有流量都停留在自己的区域内。"
        />
      </PanelCard>

      <PanelCard title="端口转发" :subtitle="`${redirects.length} 条 redirect 段`" flush>
        <template #actions>
          <el-button size="small" :icon="Plus" :disabled="busy" @click="openRedirectDialog()">
            新增端口转发
          </el-button>
        </template>

        <div v-if="redirects.length" class="desktop-only">
          <el-table :data="redirects" style="width: 100%">
            <el-table-column label="源地址 / 源端口" min-width="170">
              <template #default="{ row }">
                <div class="table-primary">{{ row.src || '—' }}</div>
                <div class="table-sub mono">{{ sourceDetail(row) }}</div>
              </template>
            </el-table-column>
            <el-table-column label="目标 IP" min-width="130">
              <template #default="{ row }">
                <span class="mono table-mono">{{ row.destIp || '—' }}</span>
              </template>
            </el-table-column>
            <el-table-column label="目标端口" width="110">
              <template #default="{ row }">
                <span class="mono table-mono">{{ row.destPort || '—' }}</span>
              </template>
            </el-table-column>
            <el-table-column label="协议" width="110">
              <template #default="{ row }">
                <span class="table-mono">{{ protoText(row.proto) }}</span>
              </template>
            </el-table-column>
            <el-table-column label="转发目标" min-width="140">
              <template #default="{ row }">
                <span class="mono table-mono">{{ row.target || '—' }}</span>
              </template>
            </el-table-column>
            <el-table-column label="启用" width="80">
              <template #default="{ row }">
                <el-switch
                  :model-value="row.enabled"
                  :disabled="busy"
                  @update:model-value="toggleRedirect(row, Boolean($event))"
                />
              </template>
            </el-table-column>
            <el-table-column label="操作" width="150">
              <template #default="{ row }">
                <div class="row-actions">
                <el-button link size="small" :icon="Pencil" :disabled="busy" @click="openRedirectDialog(row)">
                  编辑
                </el-button>
                <el-button link
                  size="small"
                  type="danger"
                  plain
                  :icon="Trash2"
                  :disabled="busy"
                  @click="removeRedirect(row)"
                >
                  删除
                </el-button>
                              </div>
              </template>
            </el-table-column>
          </el-table>
        </div>

        <div v-if="redirects.length" class="mobile-only mobile-list">
          <div v-for="row in redirects" :key="row.id" class="mobile-row">
            <div class="mobile-row-head">
              <strong class="truncate">{{ row.src || '—' }} → {{ row.destIp || row.target || '—' }}</strong>
              <el-switch
                :model-value="row.enabled"
                :disabled="busy"
                @update:model-value="toggleRedirect(row, Boolean($event))"
              />
            </div>
            <div class="mobile-line">
              <span>源地址 / 源端口</span>
              <span class="mono">{{ sourceDetail(row) }}</span>
            </div>
            <div class="mobile-line">
              <span>目标 IP / 端口</span>
              <span class="mono">{{ row.destIp || '—' }}:{{ row.destPort || '—' }}</span>
            </div>
            <div class="mobile-line">
              <span>协议</span>
              <span>{{ protoText(row.proto) }}</span>
            </div>
            <div class="mobile-actions">
              <el-button size="small" :icon="Pencil" :disabled="busy" @click="openRedirectDialog(row)">
                编辑
              </el-button>
              <el-button
                size="small"
                type="danger"
                plain
                :icon="Trash2"
                :disabled="busy"
                @click="removeRedirect(row)"
              >
                删除
              </el-button>
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
          <el-button size="small" :icon="Plus" :disabled="busy" @click="openRuleDialog()">
            新增出站规则
          </el-button>
        </template>

        <div v-if="rules.length" class="desktop-only">
          <el-table :data="rules" style="width: 100%">
            <el-table-column label="名称" min-width="160">
              <template #default="{ row }">
                <span class="table-primary truncate" :title="row.name">{{ row.name || row.id }}</span>
              </template>
            </el-table-column>
            <el-table-column label="源" min-width="110">
              <template #default="{ row }">
                <span class="table-mono">{{ row.src || '任意' }}</span>
              </template>
            </el-table-column>
            <el-table-column label="目标" min-width="130">
              <template #default="{ row }">
                <span class="table-mono">{{ row.dest || '任意' }}</span>
              </template>
            </el-table-column>
            <el-table-column label="协议" width="120">
              <template #default="{ row }">
                <span class="table-mono">{{ protoText(row.proto) }}</span>
              </template>
            </el-table-column>
            <el-table-column label="动作" width="100">
              <template #default="{ row }">
                <StatusBadge
                  :label="row.target || '—'"
                  :tone="policyTone(row.target)"
                  :dot="false"
                />
              </template>
            </el-table-column>
            <el-table-column label="协议族" width="110">
              <template #default="{ row }">
                <span class="table-mono">{{ familyText(row.family) }}</span>
              </template>
            </el-table-column>
            <el-table-column label="启用" width="80">
              <template #default="{ row }">
                <el-switch
                  :model-value="row.enabled"
                  :disabled="busy"
                  @update:model-value="toggleRule(row, Boolean($event))"
                />
              </template>
            </el-table-column>
            <el-table-column label="操作" width="150">
              <template #default="{ row }">
                <div class="row-actions">
                <el-button link size="small" :icon="Pencil" :disabled="busy" @click="openRuleDialog(row)">
                  编辑
                </el-button>
                <el-button link
                  size="small"
                  type="danger"
                  plain
                  :icon="Trash2"
                  :disabled="busy"
                  @click="removeRule(row)"
                >
                  删除
                </el-button>
                              </div>
              </template>
            </el-table-column>
          </el-table>
        </div>

        <div v-if="rules.length" class="mobile-only mobile-list">
          <div v-for="row in rules" :key="row.id" class="mobile-row">
            <div class="mobile-row-head">
              <strong class="truncate">{{ row.name || row.id }}</strong>
              <el-switch
                :model-value="row.enabled"
                :disabled="busy"
                @update:model-value="toggleRule(row, Boolean($event))"
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
            <div class="mobile-actions">
              <el-button size="small" :icon="Pencil" :disabled="busy" @click="openRuleDialog(row)">
                编辑
              </el-button>
              <el-button
                size="small"
                type="danger"
                plain
                :icon="Trash2"
                :disabled="busy"
                @click="removeRule(row)"
              >
                删除
              </el-button>
            </div>
          </div>
        </div>

        <EmptyState
          v-if="!rules.length"
          :icon="ListFilter"
          title="没有出站规则"
          description="当前配置中没有自定义的流量规则，出站流量完全由区域策略决定。"
        />
      </PanelCard>

      <PanelCard
        title="待应用改动"
        :subtitle="pending.length ? `${pending.length} 项改动尚未提交` : '所有改动都已提交'"
      >
        <template #actions>
          <el-button
            v-if="pending.length || dirty"
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

        <ul v-if="pending.length" class="change-list">
          <li
            v-for="(change, index) in pending"
            :key="`${change.op}-${change.section}-${change.option ?? ''}-${index}`"
            class="change-item"
          >
            <span class="change-op" :class="`op-${change.op}`">{{ opText(change.op) }}</span>
            <span class="change-text">{{ changeText(change) }}</span>
          </li>
        </ul>

        <el-alert
          v-else-if="dirty"
          type="warning"
          show-icon
          :closable="false"
          title="有未提交的改动"
          description="改动已经写入 UCI 暂存区，路由器没有返回明细列表，点击「保存并应用」提交并重载防火墙服务。"
        />

        <EmptyState
          v-else
          :icon="CheckCircle2"
          title="没有待应用的改动"
          description="当前页面显示的配置与路由器上生效的配置一致。"
        />
      </PanelCard>

      <p class="page-note">
        所有修改先写入 UCI 暂存区，确认无误后点击「保存并应用」提交并重载防火墙服务。
        应用过程中连接可能短暂中断。
      </p>
    </template>

    <div v-else class="card">
      <div class="card-body">
        <el-skeleton :rows="6" animated />
      </div>
    </div>

    <FwZoneDialog
      v-model="zoneDialog.open"
      :zone="zoneDialog.zone"
      :network-options="networkOptions"
      :taken-names="takenZoneNames"
      :saving="busy"
      @save="saveZone"
    />
    <FwForwardingDialog
      v-model="forwardingDialog.open"
      :forwarding="forwardingDialog.item"
      :zone-names="zoneNames"
      :saving="busy"
      @save="saveForwarding"
    />
    <FwRedirectDialog
      v-model="redirectDialog.open"
      :redirect="redirectDialog.item"
      :zone-names="zoneNames"
      :saving="busy"
      @save="saveRedirect"
    />
    <FwRuleDialog
      v-model="ruleDialog.open"
      :rule="ruleDialog.item"
      :zone-names="zoneNames"
      :saving="busy"
      @save="saveRule"
    />
  </div>
</template>

<script setup lang="ts">
  import { computed, onMounted, reactive, ref, watch } from 'vue'
  import { ElMessage, ElMessageBox } from 'element-plus'
  import {
    ArrowRight,
    ArrowRightLeft,
    CheckCircle2,
    ListFilter,
    Pencil,
    Plus,
    RefreshCw,
    RotateCcw,
    Route,
    Save,
    ShieldCheck,
    ShieldOff,
    Trash2
  } from 'lucide-vue-next'
  import PageHeader from '@/components/PageHeader.vue'
  import PanelCard from '@/components/PanelCard.vue'
  import StatCard from '@/components/StatCard.vue'
  import StatusBadge from '@/components/StatusBadge.vue'
  import EmptyState from '@/components/EmptyState.vue'
  import FwZoneCard from '@/components/config-fw/FwZoneCard.vue'
  import FwZoneDialog from '@/components/config-fw/FwZoneDialog.vue'
  import FwForwardingDialog from '@/components/config-fw/FwForwardingDialog.vue'
  import FwRedirectDialog from '@/components/config-fw/FwRedirectDialog.vue'
  import FwRuleDialog from '@/components/config-fw/FwRuleDialog.vue'
  import FwOffloadCard from '@/components/config-fw/FwOffloadCard.vue'
  import { useRefreshSignal } from '@/composables/useRefresh'
  import type { UciChange } from '@/api/uci'
  import {
    applyFirewall,
    changeText,
    createEmptyFirewallModel,
    deleteForwardingSection,
    deleteRedirectSection,
    deleteRuleSection,
    deleteZoneSection,
    fetchFirewallModel,
    fetchNetworkNames,
    fetchPendingChanges,
    familyText,
    policyTone,
    protoText,
    revertFirewall,
    saveForwarding as persistForwarding,
    saveRedirect as persistRedirect,
    saveRule as persistRule,
    saveZone as persistZone,
    setFlowOffloading,
    type FwForwarding,
    type FwForwardingDraft,
    type FwRedirect,
    type FwRedirectDraft,
    type FwRule,
    type FwRuleDraft,
    type FwZone,
    type FwZoneDraft,
    type FirewallModel
  } from '@/api/firewallConfig'

  defineOptions({ name: 'FirewallConfigView' })

  const model = ref<FirewallModel>(createEmptyFirewallModel())
  const pending = ref<UciChange[]>([])
  const networkOptions = ref<string[]>([])

  const loaded = ref(false)
  const error = ref<Error | null>(null)
  const refreshing = ref(false)
  const busy = ref(false)
  const applying = ref(false)
  const discarding = ref(false)
  const notice = ref('')
  /** Set as soon as a change was staged, even when the router does not
   *  return a change list. */
  const dirty = ref(false)

  const refreshSignal = useRefreshSignal()

  const zoneDialog = reactive<{ open: boolean; zone: FwZone | null }>({
    open: false,
    zone: null
  })
  const forwardingDialog = reactive<{ open: boolean; item: FwForwarding | null }>({
    open: false,
    item: null
  })
  const redirectDialog = reactive<{ open: boolean; item: FwRedirect | null }>({
    open: false,
    item: null
  })
  const ruleDialog = reactive<{ open: boolean; item: FwRule | null }>({
    open: false,
    item: null
  })

  const defaults = computed(() => model.value.defaults)
  const zones = computed(() => model.value.zones)
  const forwardings = computed(() => model.value.forwardings)
  const redirects = computed(() => model.value.redirects)
  const rules = computed(() => model.value.rules)

  const zoneNames = computed(() => zones.value.map((zone) => zone.name))
  const takenZoneNames = computed(() =>
    zones.value.filter((zone) => zone.id !== zoneDialog.zone?.id).map((zone) => zone.name)
  )

  const defaultPolicies = computed(() => [
    { key: 'input', value: defaults.value.input },
    { key: 'output', value: defaults.value.output },
    { key: 'forward', value: defaults.value.forward }
  ])

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

  /* ---------------------------------------------------------------- data */

  async function load(): Promise<void> {
    const [nextModel, nextChanges, nextNetworks] = await Promise.all([
      fetchFirewallModel(),
      fetchPendingChanges(),
      fetchNetworkNames().catch(() => [] as string[])
    ])
    model.value = nextModel
    pending.value = nextChanges
    networkOptions.value = nextNetworks
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

  function flagLabel(value: boolean | null): string {
    if (value === null) return '未设置'
    return value ? '开启' : '关闭'
  }

  function flagTone(value: boolean | null): 'success' | 'neutral' {
    return value ? 'success' : 'neutral'
  }

  function opText(op: UciChange['op']): string {
    if (op === 'set') return '设置'
    if (op === 'delete') return '删除'
    if (op === 'add') return '新增'
    if (op === 'rename') return '重命名'
    if (op === 'move') return '移动'
    return op
  }

  function sourceDetail(row: FwRedirect): string {
    const parts = [row.srcIp, row.srcDport].filter(Boolean)
    return parts.length ? parts.join(':') : '任意'
  }

  function toRedirectDraft(row: FwRedirect): FwRedirectDraft {
    return {
      id: row.id,
      name: row.name,
      src: row.src,
      srcIp: row.srcIp,
      srcDport: row.srcDport,
      destIp: row.destIp,
      destPort: row.destPort,
      proto: row.proto,
      target: row.target,
      enabled: row.enabled
    }
  }

  function toRuleDraft(row: FwRule): FwRuleDraft {
    return {
      id: row.id,
      name: row.name,
      src: row.src,
      dest: row.dest,
      proto: row.proto,
      target: row.target,
      enabled: row.enabled,
      family: row.family
    }
  }

  /* -------------------------------------------------------------- dialogs */

  function openZoneDialog(zone?: FwZone): void {
    zoneDialog.zone = zone ?? null
    zoneDialog.open = true
  }

  function openForwardingDialog(item?: FwForwarding): void {
    forwardingDialog.item = item ?? null
    forwardingDialog.open = true
  }

  function openRedirectDialog(item?: FwRedirect): void {
    redirectDialog.item = item ?? null
    redirectDialog.open = true
  }

  function openRuleDialog(item?: FwRule): void {
    ruleDialog.item = item ?? null
    ruleDialog.open = true
  }

  /* ---------------------------------------------------------------- zones */

  async function saveZone(draft: FwZoneDraft): Promise<void> {
    const original = draft.id ? zones.value.find((zone) => zone.id === draft.id) : undefined

    if (
      original &&
      (original.input !== draft.input ||
        original.output !== draft.output ||
        original.forward !== draft.forward)
    ) {
      const ok = await confirm(
        `区域 ${original.name} 的策略将从 ${original.input} / ${original.output} / ${original.forward} ` +
          `改为 ${draft.input} / ${draft.output} / ${draft.forward}。` +
          '策略改动会重建防火墙规则链，可能立即中断当前连接（包括本管理页面的访问）。是否继续？',
        '确认修改区域策略'
      )
      if (!ok) return
    }

    if (original && original.name !== draft.name) {
      const ok = await confirm(
        `区域名称将从 ${original.name} 改为 ${draft.name}。` +
          '引用旧名称的区域转发与端口转发将不再匹配，需要一并更新。是否继续？',
        '确认重命名安全区域'
      )
      if (!ok) return
    }

    busy.value = true
    try {
      const result = await persistZone(draft)
      zoneDialog.open = false
      await load()
      dirty.value = true
      ElMessage.success(result.id === draft.id ? '区域已更新，等待应用' : '区域已新增，等待应用')
      if (result.warning) notice.value = result.warning
    } catch (err) {
      ElMessage.error(`保存区域失败：${messageOf(err)}`)
    } finally {
      busy.value = false
    }
  }

  async function removeZone(zone: FwZone): Promise<void> {
    const relatedForwardings = forwardings.value.filter(
      (item) => item.src === zone.name || item.dest === zone.name
    )
    const relatedRedirects = redirects.value.filter((item) => item.src === zone.name)

    const ok = await confirm(
      `删除区域 ${zone.name} 会立即移除它的入站 / 出站 / 转发策略，` +
        '绑定该区域的设备可能失去访问权限，现有连接也可能被中断。' +
        (relatedForwardings.length
          ? `同时会删除 ${relatedForwardings.length} 条相关的区域转发。`
          : '') +
        (relatedRedirects.length
          ? `另有 ${relatedRedirects.length} 条端口转发引用该区域，应用后将不再匹配。`
          : '') +
        '是否继续？',
      '确认删除安全区域',
      'error'
    )
    if (!ok) return

    busy.value = true
    try {
      for (const item of relatedForwardings) await deleteForwardingSection(item.id)
      await deleteZoneSection(zone.id)
      await load()
      dirty.value = true
      ElMessage.success('区域已删除，等待应用')
    } catch (err) {
      ElMessage.error(`删除区域失败：${messageOf(err)}`)
    } finally {
      busy.value = false
    }
  }

  /* ----------------------------------------------------------- forwarding */

  async function saveForwarding(draft: FwForwardingDraft): Promise<void> {
    busy.value = true
    try {
      await persistForwarding(draft)
      forwardingDialog.open = false
      await load()
      dirty.value = true
      ElMessage.success('区域转发已保存，等待应用')
    } catch (err) {
      ElMessage.error(`保存区域转发失败：${messageOf(err)}`)
    } finally {
      busy.value = false
    }
  }

  async function removeForwarding(item: FwForwarding): Promise<void> {
    const ok = await confirm(
      `删除区域转发 ${item.src} → ${item.dest} 后，这两个区域之间的流量会被区域策略拦截，现有连接可能中断。是否继续？`,
      '确认删除区域转发',
      'error'
    )
    if (!ok) return

    busy.value = true
    try {
      await deleteForwardingSection(item.id)
      await load()
      dirty.value = true
      ElMessage.success('区域转发已删除，等待应用')
    } catch (err) {
      ElMessage.error(`删除区域转发失败：${messageOf(err)}`)
    } finally {
      busy.value = false
    }
  }

  /* ------------------------------------------------------------- redirect */

  async function saveRedirect(draft: FwRedirectDraft): Promise<void> {
    busy.value = true
    try {
      await persistRedirect(draft)
      redirectDialog.open = false
      await load()
      dirty.value = true
      ElMessage.success('端口转发已保存，等待应用')
    } catch (err) {
      ElMessage.error(`保存端口转发失败：${messageOf(err)}`)
    } finally {
      busy.value = false
    }
  }

  async function toggleRedirect(row: FwRedirect, enabled: boolean): Promise<void> {
    busy.value = true
    try {
      await persistRedirect({ ...toRedirectDraft(row), enabled })
      await load()
      dirty.value = true
      ElMessage.success(enabled ? '规则已启用，等待应用' : '规则已停用，等待应用')
    } catch (err) {
      ElMessage.error(`更新端口转发失败：${messageOf(err)}`)
    } finally {
      busy.value = false
    }
  }

  async function removeRedirect(row: FwRedirect): Promise<void> {
    const ok = await confirm(
      `删除端口转发 ${row.src || '—'} → ${row.destIp || row.target || '—'} 后，` +
        '该端口不再对外部开放，正在使用的连接会中断。是否继续？',
      '确认删除端口转发',
      'error'
    )
    if (!ok) return

    busy.value = true
    try {
      await deleteRedirectSection(row.id)
      await load()
      dirty.value = true
      ElMessage.success('端口转发已删除，等待应用')
    } catch (err) {
      ElMessage.error(`删除端口转发失败：${messageOf(err)}`)
    } finally {
      busy.value = false
    }
  }

  /* ---------------------------------------------------------------- rules */

  async function saveRule(draft: FwRuleDraft): Promise<void> {
    busy.value = true
    try {
      await persistRule(draft)
      ruleDialog.open = false
      await load()
      dirty.value = true
      ElMessage.success('出站规则已保存，等待应用')
    } catch (err) {
      ElMessage.error(`保存出站规则失败：${messageOf(err)}`)
    } finally {
      busy.value = false
    }
  }

  async function toggleRule(row: FwRule, enabled: boolean): Promise<void> {
    busy.value = true
    try {
      await persistRule({ ...toRuleDraft(row), enabled })
      await load()
      dirty.value = true
      ElMessage.success(enabled ? '规则已启用，等待应用' : '规则已停用，等待应用')
    } catch (err) {
      ElMessage.error(`更新出站规则失败：${messageOf(err)}`)
    } finally {
      busy.value = false
    }
  }

  async function removeRule(row: FwRule): Promise<void> {
    const ok = await confirm(
      `删除出站规则「${row.name || row.id}」后，匹配该规则的流量会回到区域策略处理，依赖它的服务可能中断。是否继续？`,
      '确认删除出站规则',
      'error'
    )
    if (!ok) return

    busy.value = true
    try {
      await deleteRuleSection(row.id)
      await load()
      dirty.value = true
      ElMessage.success('出站规则已删除，等待应用')
    } catch (err) {
      ElMessage.error(`删除出站规则失败：${messageOf(err)}`)
    } finally {
      busy.value = false
    }
  }

  /* -------------------------------------------------------------- offload */

  async function toggleOffload(payload: { software: boolean; hardware: boolean }): Promise<void> {
    busy.value = true
    try {
      await setFlowOffloading(payload.software, payload.hardware)
      await load()
      dirty.value = true
      ElMessage.success('流量卸载设置已暂存，点击「保存并应用」生效')
    } catch (err) {
      ElMessage.error(`设置流量卸载失败：${messageOf(err)}`)
    } finally {
      busy.value = false
    }
  }

  /* --------------------------------------------------------- commit/apply */

  async function saveAndApply(): Promise<void> {
    if (!pending.value.length) {
      ElMessage.info('没有待应用的改动')
      return
    }

    const ok = await confirm(
      `即将提交 ${pending.value.length} 项防火墙改动并重载防火墙服务。` +
        '规则链会被重建，短暂的连接中断（包括本管理页面）是正常现象。是否继续？',
      '确认保存并应用'
    )
    if (!ok) return

    applying.value = true
    try {
      await applyFirewall()
      await load()
      dirty.value = false
      ElMessage.success('防火墙配置已保存并应用')
    } catch (err) {
      ElMessage.error(`应用防火墙配置失败：${messageOf(err)}`)
    } finally {
      applying.value = false
    }
  }

  async function discardChanges(): Promise<void> {
    const ok = await confirm(
      '放弃所有尚未提交的防火墙改动？路由器上已经生效的配置不会被修改，UCI 暂存区会恢复成当前生效的内容。',
      '确认放弃修改'
    )
    if (!ok) return

    discarding.value = true
    try {
      await revertFirewall()
      await load()
      dirty.value = false
      ElMessage.success('已放弃未提交的改动')
    } catch (err) {
      ElMessage.error(`放弃改动失败：${messageOf(err)}`)
    } finally {
      discarding.value = false
    }
  }
</script>

<style scoped>
  .zone-grid {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: var(--space-4);
  }

  @media (max-width: 1180px) {
    .zone-grid {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  }

  @media (max-width: 900px) {
    .zone-grid {
      grid-template-columns: minmax(0, 1fr);
    }
  }

  .policy-grid {
    display: grid;
    grid-template-columns: repeat(5, minmax(0, 1fr));
    gap: 10px;
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

  .forward-id {
    color: var(--text-faint);
    font-size: 11px;
  }

  .forward-spacer {
    flex: 1 1 auto;
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

  .change-list {
    display: flex;
    flex-direction: column;
    gap: 6px;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .change-item {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 8px 12px;
    background: var(--surface-2);
    border-radius: var(--radius);
  }

  .change-op {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    min-width: 40px;
    height: 20px;
    padding: 0 7px;
    color: var(--brand-text);
    font-size: 11px;
    font-weight: 500;
    background: var(--brand-soft);
    border-radius: 999px;
  }

  .change-op.op-delete {
    color: var(--danger-text);
    background: var(--danger-soft);
  }

  .change-op.op-add {
    color: var(--success-text);
    background: var(--success-soft);
  }

  .change-text {
    overflow: hidden;
    color: var(--text-secondary);
    font-size: 12.5px;
    font-family: var(--font-mono);
    text-overflow: ellipsis;
    white-space: nowrap;
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

  .mobile-actions {
    display: flex;
    gap: 8px;
    margin-top: 10px;
  }

  .page-note {
    padding: 0 4px;
    color: var(--text-muted);
    font-size: var(--text-xs);
  }

  @media (max-width: 640px) {
    .policy-grid {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }

    .forward-row {
      flex-wrap: wrap;
    }
  }
</style>
