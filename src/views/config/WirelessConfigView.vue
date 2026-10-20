<template>
  <div class="page">
    <PageHeader title="无线配置" description="编辑射频与 SSID，暂存后一键应用">
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

    <el-alert
      type="warning"
      show-icon
      :closable="false"
      title="保存会短暂中断无线连接"
      description="点击「保存并应用」后无线服务会重新加载，已连接的设备需要重新连接（约 10–30 秒）。远程操作时请勿关闭当前使用的无线网络。"
    />

    <el-alert v-if="error" type="error" :title="error?.message || '操作失败'" :closable="false" show-icon />

    <template v-if="loaded">
      <div class="grid grid-4">
        <StatCard
          label="无线射频"
          :value="radioCount"
          :meta="`${enabledRadioCount} 个已启用`"
          :icon="Radio"
          tone="brand"
        />
        <StatCard
          label="SSID 数量"
          :value="ssidCount"
          :meta="`${hiddenCount} 个隐藏 · ${guestCount} 个访客`"
          :icon="Wifi"
          tone="neutral"
        />
        <StatCard
          label="已启用射频"
          :value="enabledRadioCount"
          :meta="radioCount ? `${Math.round((enabledRadioCount / radioCount) * 100)}% 处于广播状态` : '—'"
          :icon="Antenna"
          tone="success"
        />
        <StatCard
          label="当前客户端"
          :value="model.clients"
          :meta="`${connectedIfaceCount} 个 SSID 正在广播`"
          :icon="Users"
          tone="neutral"
        />
      </div>

      <div class="radio-grid">
        <WifiRadioCard
          v-for="radio in model.radios"
          :key="radio.section || 'orphan'"
          :radio="radio"
          :pending="pending"
          @toggle-radio="toggleRadio"
          @toggle-ssid="toggleIface"
          @edit-radio="openRadioDialog"
          @edit-ssid="openSsidDialog"
        />
      </div>

      <EmptyState
        v-if="!model.radios.length"
        :icon="WifiOff"
        title="没有找到无线射频"
        description="这台设备可能没有可用的无线硬件，或者 /etc/config/wireless 为空。"
      />

      <ConfigPendingPanel
        :entries="pendingEntries"
        title="待生效的改动"
        subtitle="暂存在 UCI 暂存区，还没有写入 /etc/config/wireless"
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

      <PanelCard title="无线服务" subtitle="重新加载无线服务，让已经生效的配置再次下发">
        <template #actions>
          <el-button :icon="RotateCw" :loading="reloading" @click="reloadWifi">
            重载无线服务
          </el-button>
        </template>
        <p class="card-note">
          <Info :size="13" class="note-icon" />
          「重载无线服务」会重新应用 /etc/config/wireless 中已经生效的配置，不会提交暂存区里的改动；
          所有无线连接会短暂中断，需要重新连接。
        </p>
      </PanelCard>
    </template>

    <div v-else class="card">
      <div class="card-body">
        <el-skeleton :rows="6" animated />
      </div>
    </div>

    <WifiSsidDialog
      v-model="ssidDialogOpen"
      :iface="activeIface"
      :networks="model.networks"
      @saved="onSaved"
    />

    <WifiRadioDialog
      v-model="radioDialogOpen"
      :radio="activeRadio"
      @saved="onSaved"
    />
  </div>
</template>

<script setup lang="ts">
  import { computed, onMounted, reactive, ref, watch } from 'vue'
  import {
    Antenna,
    Info,
    Radio,
    RefreshCw,
    RotateCcw,
    RotateCw,
    Save,
    Users,
    Wifi,
    WifiOff
  } from 'lucide-vue-next'
  import { ElMessage, ElMessageBox } from 'element-plus'
  import PageHeader from '@/components/PageHeader.vue'
  import PanelCard from '@/components/PanelCard.vue'
  import StatCard from '@/components/StatCard.vue'
  import EmptyState from '@/components/EmptyState.vue'
  import DraftNotice from '@/components/DraftNotice.vue'
  import ConfigPendingPanel from '@/components/cfg-pending/ConfigPendingPanel.vue'
  import WifiRadioCard from '@/components/config-wifi/WifiRadioCard.vue'
  import WifiSsidDialog from '@/components/config-wifi/WifiSsidDialog.vue'
  import WifiRadioDialog from '@/components/config-wifi/WifiRadioDialog.vue'
  import { useDraft, useUnsavedGuard } from '@/composables/useDraft'
  import { usePolling } from '@/composables/usePolling'
  import { useRefreshSignal } from '@/composables/useRefresh'
  import { systemOps } from '@/api/systemOps'
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
    commitWirelessConfig,
    discardWirelessChanges,
    readWirelessConfig,
    stageIfaceEnabled,
    stageRadioEnabled,
    type WifiIfaceConfig,
    type WifiRadioConfig,
    type WirelessConfigModel
  } from '@/api/wirelessConfig'

  defineOptions({ name: 'WirelessConfigView' })

  interface WifiDraft {
    edits: StagedEdit[]
  }

  const draft = useDraft<WifiDraft>('wifi-config', { edits: [] })
  const savedAt = draft.savedAt

  const model = ref<WirelessConfigModel>({ radios: [], networks: [], clients: 0 })
  const baseline = ref<Record<string, UciSection>>({})
  /** True once the committed configuration has been read. */
  const baselineReady = ref(false)
  const routerChanges = ref<UciChange[]>([])
  const pending = ref<string[]>([])
  const ssidDialogOpen = ref(false)
  const radioDialogOpen = ref(false)
  const activeIface = ref<WifiIfaceConfig | null>(null)
  const activeRadio = ref<WifiRadioConfig | null>(null)
  const reloading = ref(false)
  const applying = ref(false)
  const discarding = ref(false)
  const refreshSignal = useRefreshSignal()

  /* ------------------------------------------------------------ derived */

  /** The changes the router reports but the console did not stage itself. */
  const foreignEdits = computed<StagedEdit[]>(() => {
    const known = new Set(
      draft.value.value.edits.map((edit) => `${edit.section}.${edit.option ?? ''}`)
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

  const effectiveValues = computed(() =>
    applyEdits(baseline.value, [...draft.value.value.edits, ...foreignEdits.value])
  )

  const pendingEntries = computed<PendingEntry[]>(() =>
    buildPendingEntries(baseline.value, routerChanges.value, [
      ...draft.value.value.edits,
      ...foreignEdits.value
    ])
  )

  const hasPending = computed(() => pendingEntries.value.length > 0)

  const draftEdits = computed(() => draft.value.value.edits)

  const draftDirty = computed(() => draft.dirty.value && draftEdits.value.length > 0)

  useUnsavedGuard(draftDirty, '无线配置有未保存的修改')

  const realRadios = computed(() => model.value.radios.filter((radio) => !radio.orphan))
  const radioCount = computed(() => realRadios.value.length)
  const enabledRadioCount = computed(
    () => realRadios.value.filter((radio) => !radio.disabled).length
  )
  const allIfaces = computed(() => model.value.radios.flatMap((radio) => radio.interfaces))
  const ssidCount = computed(() => allIfaces.value.length)
  const hiddenCount = computed(() => allIfaces.value.filter((iface) => iface.hidden).length)
  const guestCount = computed(() => allIfaces.value.filter((iface) => iface.guest).length)
  const connectedIfaceCount = computed(
    () => allIfaces.value.filter((iface) => !iface.disabled && iface.ssid).length
  )

  /* --------------------------------------------------------------- data */

  async function loadModel(): Promise<void> {
    const [values, changes] = await Promise.all([uciGet('wireless'), uciChanges('wireless')])

    // The committed configuration is the base of the change list. It is only
    // refreshed while the router has no staged changes — otherwise the
    // staged values would be mistaken for the old ones.
    if (!baselineReady.value || !changes.length) {
      baseline.value = values
      baselineReady.value = true
    }
    routerChanges.value = changes

    // The staging area of the router is empty — the recorded changes were
    // applied or discarded somewhere else.
    if (!changes.length && draftEdits.value.length) {
      setDraftEdits([])
      await resetDraft(draft)
    }

    model.value = await readWirelessConfig(effectiveValues.value)
  }

  function setDraftEdits(next: StagedEdit[]): void {
    draft.value.value.edits = next
  }

  function delay(ms: number): Promise<void> {
    return new Promise((resolve) => window.setTimeout(resolve, ms))
  }

  /** Re-reads the configuration; the runtime state needs a moment to settle. */
  async function reloadModel(wait = 0): Promise<void> {
    if (wait) await delay(wait)
    try {
      await loadModel()
    } catch {
      // Keep the current model — the next poll picks the new state up.
    }
  }

  function findRadio(section: string): WifiRadioConfig | undefined {
    return model.value.radios.find((radio) => radio.section === section)
  }

  function findIface(section: string): WifiIfaceConfig | undefined {
    return allIfaces.value.find((iface) => iface.section === section)
  }

  function markPending(section: string, on: boolean): void {
    pending.value = on
      ? [...new Set([...pending.value, section])]
      : pending.value.filter((item) => item !== section)
  }

  /* -------------------------------------------------------------- edits */

  async function toggleRadio(payload: { section: string; enabled: boolean }): Promise<void> {
    const radio = findRadio(payload.section)
    if (!radio) return

    markPending(payload.section, true)
    try {
      const result = await stageRadioEnabled(payload.section, payload.enabled)
      setDraftEdits(stageEdits(baseline.value, draftEdits.value, result.edits))
      await loadModel()
      ElMessage.success(
        `射频 ${payload.section} 已暂存为${payload.enabled ? '启用' : '禁用'}，点击「保存并应用」后生效`
      )
    } catch (err) {
      ElMessage.error(`操作失败：${err instanceof Error ? err.message : String(err)}`)
      await reloadModel()
    } finally {
      markPending(payload.section, false)
    }
  }

  async function toggleIface(payload: { section: string; enabled: boolean }): Promise<void> {
    const iface = findIface(payload.section)
    if (!iface) return

    markPending(payload.section, true)
    try {
      const result = await stageIfaceEnabled(payload.section, payload.enabled)
      setDraftEdits(stageEdits(baseline.value, draftEdits.value, result.edits))
      await loadModel()
      ElMessage.success(
        `${iface.ssid || 'SSID'} 已暂存为${payload.enabled ? '启用' : '禁用'}，点击「保存并应用」后生效`
      )
    } catch (err) {
      ElMessage.error(`操作失败：${err instanceof Error ? err.message : String(err)}`)
      await reloadModel()
    } finally {
      markPending(payload.section, false)
    }
  }

  function openSsidDialog(section: string): void {
    activeIface.value = findIface(section) ?? null
    if (!activeIface.value) return
    ssidDialogOpen.value = true
  }

  function openRadioDialog(section: string): void {
    activeRadio.value = findRadio(section) ?? null
    if (!activeRadio.value) return
    radioDialogOpen.value = true
  }

  async function onSaved(edits: StagedEdit[]): Promise<void> {
    setDraftEdits(stageEdits(baseline.value, draftEdits.value, edits))
    await reloadModel()
  }

  /* --------------------------------------------------------- apply/revert */

  async function saveAndApply(): Promise<void> {
    if (!hasPending.value) {
      ElMessage.info('没有待应用的改动')
      return
    }

    const ok = await ElMessageBox.confirm(
      `即将提交 ${pendingEntries.value.length} 项无线改动并重新加载无线服务。` +
        '所有无线连接会短暂中断，已连接的设备需要重新连接。是否继续？',
      '确认保存并应用',
      {
        type: 'warning',
        confirmButtonText: '继续',
        cancelButtonText: '取消',
        distinguishCancelAndClose: true
      }
    ).then(() => true)
      .catch(() => false)

    if (!ok) return

    applying.value = true
    try {
      await commitWirelessConfig()
      setDraftEdits([])
      await resetDraft(draft)
      ElMessage.success('无线配置已保存并应用，正在重新读取状态…')
      await delay(2000)
      await loadModel()
    } catch (err) {
      ElMessage.error(
        `应用无线配置失败：${err instanceof Error ? err.message : String(err)}。` +
          '如果你是通过无线访问本页面，无线服务重载期间连接可能中断，' +
          '请刷新页面确认配置是否已经生效。'
      )
    } finally {
      applying.value = false
    }
  }

  async function discardChanges(): Promise<void> {
    const ok = await ElMessageBox.confirm(
      '放弃所有尚未提交的无线改动？路由器上已经生效的配置不会被修改，' +
        'UCI 暂存区会恢复成当前生效的内容。',
      '确认放弃修改',
      {
        type: 'warning',
        confirmButtonText: '继续',
        cancelButtonText: '取消',
        distinguishCancelAndClose: true
      }
    ).then(() => true)
      .catch(() => false)

    if (!ok) return

    discarding.value = true
    try {
      await discardWirelessChanges()
      setDraftEdits([])
      await resetDraft(draft)
      await loadModel()
      ElMessage.success('已放弃未提交的改动')
    } catch (err) {
      ElMessage.error(`放弃改动失败：${err instanceof Error ? err.message : String(err)}`)
    } finally {
      discarding.value = false
    }
  }

  async function reloadWifi(): Promise<void> {
    try {
      await ElMessageBox.confirm(
        '重载无线服务会短暂中断所有无线连接，已连接的设备需要重新连接。确定继续吗？',
        '重载无线服务',
        {
          type: 'warning',
          confirmButtonText: '确认重载',
          cancelButtonText: '取消'
        }
      )
    } catch {
      return
    }

    reloading.value = true
    try {
      await systemOps.reloadWifi()
      ElMessage.success('无线服务已重载')
      await reloadModel(2000)
    } catch (err) {
      ElMessage.error(err instanceof Error ? err.message : '重载失败')
    } finally {
      reloading.value = false
    }
  }

  const { loaded, error, refreshing, refresh } = usePolling(async () => {
    // Never overwrite the view while a dialog is open or a write is running.
    if (ssidDialogOpen.value || radioDialogOpen.value || pending.value.length) return
    await loadModel()
  }, 15000)

  onMounted(() => void refresh())
  watch(refreshSignal, () => void refresh())
</script>

<style scoped>
  /* Element Plus 给相邻按钮加了 12px 左边距，和外层 flex 的 gap 叠加后
     同一行的按钮会被拉到 20px 间距；这里把间距统一交回给 gap 控制。 */
  .el-button + .el-button {
    margin-left: 0;
  }

  .radio-grid {
    display: flex;
    flex-direction: column;
    gap: var(--space-4);
  }

  .card-note {
    display: flex;
    align-items: flex-start;
    gap: 6px;
    margin: 0;
    color: var(--text-muted);
    font-size: var(--text-xs);
    line-height: 1.6;
  }

  .note-icon {
    flex-shrink: 0;
    margin-top: 2px;
  }
</style>

<!--
  The dialogs are teleported to `body`, so a scoped rule cannot reach the
  dialog element itself. The width comes from the `width` property, only the
  mobile spacing has to be done here.
-->
<style>
  @media (max-width: 640px) {
    .wifi-dialog.el-dialog {
      --el-dialog-margin-top: 8px;
      margin-bottom: 8px;
      border-radius: var(--radius-lg);
    }
  }
</style>
