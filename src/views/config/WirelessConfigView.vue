<template>
  <div class="page">
    <PageHeader title="无线配置" description="编辑射频与 SSID，保存后立即生效">
      <el-button :icon="RefreshCw" :loading="refreshing" @click="refresh">刷新</el-button>
      <el-button type="primary" :icon="RotateCw" :loading="reloading" @click="reloadWifi">
        重载无线服务
      </el-button>
    </PageHeader>

    <el-alert
      type="warning"
      show-icon
      :closable="false"
      title="保存会短暂中断无线连接"
      description="每次保存或切换开关都会重新加载无线服务，已连接的设备需要重新连接（约 10–30 秒）。远程操作时请勿关闭当前使用的无线网络。"
    />

    <el-alert v-if="error" type="error" :title="error.message" :closable="false" show-icon />

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

      <p class="page-note">
        需要更高级的无线选项（例如 802.11r / 802.11k 漫游、多个 VAP）？
      </p>
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
  import { computed, ref, watch } from 'vue'
  import { Antenna, Radio, RefreshCw, RotateCw, Users, Wifi, WifiOff } from 'lucide-vue-next'
  import { ElMessage, ElMessageBox } from 'element-plus'
  import PageHeader from '@/components/PageHeader.vue'
  import StatCard from '@/components/StatCard.vue'
  import EmptyState from '@/components/EmptyState.vue'
  import WifiRadioCard from '@/components/config-wifi/WifiRadioCard.vue'
  import WifiSsidDialog from '@/components/config-wifi/WifiSsidDialog.vue'
  import WifiRadioDialog from '@/components/config-wifi/WifiRadioDialog.vue'
  import { usePolling } from '@/composables/usePolling'
  import { useRefreshSignal } from '@/composables/useRefresh'
  import { systemOps } from '@/api/systemOps'
  import {
    readWirelessConfig,
    setIfaceEnabled,
    setRadioEnabled,
    type WifiIfaceConfig,
    type WifiRadioConfig,
    type WirelessConfigModel
  } from '@/api/wirelessConfig'

  defineOptions({ name: 'WirelessConfigView' })

  const model = ref<WirelessConfigModel>({ radios: [], networks: [], clients: 0 })
  const pending = ref<string[]>([])
  const ssidDialogOpen = ref(false)
  const radioDialogOpen = ref(false)
  const activeIface = ref<WifiIfaceConfig | null>(null)
  const activeRadio = ref<WifiRadioConfig | null>(null)
  const reloading = ref(false)
  const refreshSignal = useRefreshSignal()

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

  async function loadModel(): Promise<void> {
    model.value = await readWirelessConfig()
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

  async function toggleRadio(payload: { section: string; enabled: boolean }): Promise<void> {
    const radio = findRadio(payload.section)
    if (!radio) return

    const previous = radio.disabled
    radio.disabled = !payload.enabled
    markPending(payload.section, true)

    try {
      await setRadioEnabled(payload.section, payload.enabled)
      ElMessage.success(`${payload.section} 已${payload.enabled ? '启用' : '禁用'}`)
      await reloadModel(1500)
    } catch (err) {
      // Roll the switch back and, best effort, write the old value to the
      // router as well so that the router and the UI agree again.
      radio.disabled = previous
      await setRadioEnabled(payload.section, !previous).catch(() => undefined)
      ElMessage.error(
        `${err instanceof Error ? err.message : '操作失败'}，开关状态已回滚`
      )
      await reloadModel()
    } finally {
      markPending(payload.section, false)
    }
  }

  async function toggleIface(payload: { section: string; enabled: boolean }): Promise<void> {
    const iface = findIface(payload.section)
    if (!iface) return

    const previous = iface.disabled
    iface.disabled = !payload.enabled
    markPending(payload.section, true)

    try {
      await setIfaceEnabled(payload.section, payload.enabled)
      ElMessage.success(`${iface.ssid || 'SSID'} 已${payload.enabled ? '启用' : '禁用'}`)
      await reloadModel(1500)
    } catch (err) {
      iface.disabled = previous
      await setIfaceEnabled(payload.section, !previous).catch(() => undefined)
      ElMessage.error(
        `${err instanceof Error ? err.message : '操作失败'}，开关状态已回滚`
      )
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

  async function onSaved(): Promise<void> {
    await reloadModel(1500)
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

  watch(refreshSignal, () => void refresh())
</script>

<style scoped>
  .radio-grid {
    display: flex;
    flex-direction: column;
    gap: var(--space-4);
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
