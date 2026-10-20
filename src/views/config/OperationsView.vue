<template>
  <div class="page">
    <PageHeader title="服务与运维" description="服务启停、进程与连接跟踪、存储占用以及系统维护操作">
      <el-button :icon="RefreshCw" :loading="refreshing" @click="refresh">刷新</el-button>
    </PageHeader>

    <el-alert v-if="error" type="error" :title="error?.message || '操作失败'" :closable="false" show-icon />
    <el-alert
      v-if="sectionErrors.system"
      type="warning"
      :title="`资源占用信息读取失败：${sectionErrors.system}`"
      :closable="false"
      show-icon
    />

    <template v-if="loaded">
      <div class="grid grid-4">
        <StatCard
          label="服务"
          :value="services.length"
          :meta="`运行中 ${runningCount} · 已停止 ${stoppedCount}`"
          :icon="Server"
          tone="brand"
        />
        <StatCard
          label="进程"
          :value="processes.length"
          :meta="topProcessMeta"
          :icon="Terminal"
          tone="neutral"
        />
        <StatCard
          label="内存占用"
          :value="memoryPercent"
          suffix="%"
          :meta="`${formatBytes(memoryUsed)} / ${formatBytes(memoryTotal)}`"
          :tone="memoryTone"
          :progress="memoryPercent"
          :icon="MemoryStick"
        />
        <StatCard
          label="存储占用"
          :value="storagePercent"
          suffix="%"
          :meta="`可用 ${formatBytes(storageFree)}`"
          :tone="storageTone"
          :progress="storagePercent"
          :icon="HardDrive"
        />
      </div>

      <PanelCard title="服务" :subtitle="serviceSubtitle" flush>
        <template #actions>
          <span class="ops-badge num">{{ services.length }}</span>
        </template>

        <el-alert
          v-if="sectionErrors.services"
          type="warning"
          :title="sectionErrors.services"
          :closable="false"
          show-icon
        />

        <OpsServiceTable
          :services="services"
          :pending="pending"
          :overrides="overrides"
          @action="onServiceAction"
          @toggle="onAutostartToggle"
        />
      </PanelCard>

      <PanelCard title="进程" :subtitle="processSubtitle" flush>
        <template #actions>
          <span class="ops-badge num">{{ processes.length }}</span>
        </template>

        <el-alert
          v-if="sectionErrors.processes"
          type="warning"
          :title="sectionErrors.processes"
          :closable="false"
          show-icon
        />

        <OpsProcessTable :processes="processes" />
      </PanelCard>

      <div class="grid grid-wide">
        <PanelCard title="存储与挂载" subtitle="挂载点占用与块设备信息">
          <el-alert
            v-if="sectionErrors.mounts"
            type="warning"
            :title="sectionErrors.mounts"
            :closable="false"
            show-icon
          />
          <el-alert
            v-if="sectionErrors.blocks"
            type="warning"
            :title="sectionErrors.blocks"
            :closable="false"
            show-icon
          />

          <OpsStorageCard :mounts="mounts" :blocks="blocks" />
        </PanelCard>

        <PanelCard title="设备指示灯" subtitle="LED 状态">
          <el-alert
            v-if="sectionErrors.leds"
            type="warning"
            :title="sectionErrors.leds"
            :closable="false"
            show-icon
          />

          <OpsLedCard :leds="leds" />
        </PanelCard>
      </div>

      <PanelCard title="连接跟踪" :subtitle="conntrackSubtitle" flush>
        <template #actions>
          <span class="ops-badge num">{{ conntrack.length }}</span>
        </template>

        <el-alert
          v-if="sectionErrors.conntrack"
          type="warning"
          :title="sectionErrors.conntrack"
          :closable="false"
          show-icon
        />

        <OpsConntrackTable :connections="conntrack" />
      </PanelCard>

      <PanelCard title="系统操作" subtitle="备份、重启与恢复出厂设置">
        <OpsSystemActions />
      </PanelCard>

      <p class="page-note">
        页面每 15 秒自动刷新一次数据，服务启停与系统操作会立即执行在路由器上。
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
  import { HardDrive, MemoryStick, RefreshCw, Server, Terminal } from 'lucide-vue-next'
  import { ElMessage, ElMessageBox } from 'element-plus'
  import PageHeader from '@/components/PageHeader.vue'
  import PanelCard from '@/components/PanelCard.vue'
  import StatCard from '@/components/StatCard.vue'
  import OpsServiceTable from '@/components/config-ops/OpsServiceTable.vue'
  import OpsProcessTable from '@/components/config-ops/OpsProcessTable.vue'
  import OpsConntrackTable from '@/components/config-ops/OpsConntrackTable.vue'
  import OpsStorageCard from '@/components/config-ops/OpsStorageCard.vue'
  import OpsLedCard from '@/components/config-ops/OpsLedCard.vue'
  import OpsSystemActions from '@/components/config-ops/OpsSystemActions.vue'
  import { usePolling } from '@/composables/usePolling'
  import { useRefreshSignal } from '@/composables/useRefresh'
  import { api } from '@/api/openwrt'
  import type { SystemInfo } from '@/api/types'
  import { formatBytes } from '@/utils/format'
  import {
    calibrateBlockSizes,
    fetchBlockDevices,
    fetchConntrack,
    fetchLeds,
    fetchMounts,
    fetchProcesses,
    fetchServices,
    runServiceAction,
    type OpsProcess,
    type OpsServiceAction
  } from '@/api/ops'

  defineOptions({ name: 'OperationsView' })

  type Tone = 'brand' | 'success' | 'warning' | 'danger' | 'neutral'

  /** Stopping one of these services cuts the connection the console runs on. */
  const CRITICAL_SERVICES = new Set([
    'network',
    'firewall',
    'wpad',
    'dnsmasq',
    'dropbear',
    'uhttpd',
    'rpcd',
    'odhcpd'
  ])

  const services = ref<Awaited<ReturnType<typeof fetchServices>>>([])
  const processes = ref<OpsProcess[]>([])
  const conntrack = ref<Awaited<ReturnType<typeof fetchConntrack>>>([])
  const mounts = ref<Awaited<ReturnType<typeof fetchMounts>>>([])
  const blocks = ref<Awaited<ReturnType<typeof fetchBlockDevices>>>([])
  const leds = ref<Awaited<ReturnType<typeof fetchLeds>>>([])
  const info = ref<SystemInfo>()
  const pending = ref<Record<string, OpsServiceAction>>({})
  const overrides = ref<Record<string, boolean>>({})
  const sectionErrors = ref<Record<string, string>>({})
  const refreshSignal = useRefreshSignal()

  const runningCount = computed(() => services.value.filter((row) => row.running).length)
  const stoppedCount = computed(() => services.value.length - runningCount.value)

  const topProcess = computed<OpsProcess | undefined>(() => {
    let best: OpsProcess | undefined
    for (const row of processes.value) {
      if (!best || row.cpu > best.cpu) best = row
    }
    return best
  })

  const topProcessMeta = computed(() => {
    const row = topProcess.value
    if (!row) return '暂无进程数据'
    if (!row.command) return `CPU 最高 ${row.cpu.toFixed(1)}%`
    return `CPU 最高 ${row.cpu.toFixed(1)}% · ${row.command}`
  })

  const memoryTotal = computed(() => info.value?.memory?.total ?? 0)
  const memoryUsed = computed(() => {
    const memory = info.value?.memory
    if (!memory) return 0
    return Math.max(0, memory.total - memory.available)
  })
  const memoryPercent = computed(() =>
    memoryTotal.value ? Math.round((memoryUsed.value / memoryTotal.value) * 100) : 0
  )
  const memoryTone = computed<Tone>(() =>
    memoryPercent.value >= 90 ? 'danger' : memoryPercent.value >= 75 ? 'warning' : 'brand'
  )

  const overlayMount = computed(
    () =>
      mounts.value.find((row) => row.mountpoint === '/overlay') ??
      mounts.value.find((row) => row.mountpoint === '/')
  )

  const storageTotal = computed(() => {
    if (info.value?.root?.total) return info.value.root.total * 1024
    return overlayMount.value?.totalBytes ?? 0
  })
  const storageUsed = computed(() => {
    if (info.value?.root?.used !== undefined) return info.value.root.used * 1024
    return overlayMount.value?.usedBytes ?? 0
  })
  const storageFree = computed(() => {
    if (info.value?.root?.avail !== undefined) return info.value.root.avail * 1024
    return overlayMount.value?.availableBytes ?? 0
  })
  const storagePercent = computed(() =>
    storageTotal.value ? Math.round((storageUsed.value / storageTotal.value) * 100) : 0
  )
  const storageTone = computed<Tone>(() =>
    storagePercent.value >= 90 ? 'danger' : storagePercent.value >= 75 ? 'warning' : 'brand'
  )

  const serviceSubtitle = computed(
    () => `${services.value.length} 个服务 · 运行中 ${runningCount.value} · 已停止 ${stoppedCount.value}`
  )
  const processSubtitle = computed(() => `${processes.value.length} 个进程`)
  const conntrackSubtitle = computed(() => `内核连接跟踪表共 ${conntrack.value.length} 条记录`)

  function messageOf(err: unknown): string {
    return err instanceof Error ? err.message : '请求失败'
  }

  async function loadAll(): Promise<void> {
    const errors: Record<string, string> = {}
    const [nextServices, nextProcesses, nextConntrack, nextMounts, nextBlocks, nextLeds, nextInfo] =
      await Promise.all([
        fetchServices().catch((err) => {
          errors.services = messageOf(err)
          return []
        }),
        fetchProcesses().catch((err) => {
          errors.processes = messageOf(err)
          return []
        }),
        fetchConntrack().catch((err) => {
          errors.conntrack = messageOf(err)
          return []
        }),
        fetchMounts().catch((err) => {
          errors.mounts = messageOf(err)
          return []
        }),
        fetchBlockDevices().catch((err) => {
          errors.blocks = messageOf(err)
          return []
        }),
        fetchLeds().catch((err) => {
          errors.leds = messageOf(err)
          return []
        }),
        api.systemInfo().catch((err) => {
          errors.system = messageOf(err)
          return undefined
        })
      ])

    services.value = nextServices
    processes.value = nextProcesses
    conntrack.value = nextConntrack
    mounts.value = nextMounts
    blocks.value = calibrateBlockSizes(nextBlocks, nextMounts)
    leds.value = nextLeds
    info.value = nextInfo
    sectionErrors.value = errors
  }

  async function refreshServices(changed?: string): Promise<void> {
    try {
      const next = await fetchServices()
      services.value = next
      if (changed) {
        // The router is the source of truth again once it answered.
        const remaining = { ...overrides.value }
        delete remaining[changed]
        overrides.value = remaining
      }
    } catch (err) {
      sectionErrors.value = { ...sectionErrors.value, services: messageOf(err) }
    }
  }

  function actionLabel(action: OpsServiceAction): string {
    switch (action) {
      case 'start':
        return '启动'
      case 'stop':
        return '停止'
      case 'restart':
        return '重启'
      case 'enable':
        return '开机自启'
      default:
        return '取消开机自启'
    }
  }

  async function confirmCritical(name: string, action: OpsServiceAction): Promise<boolean> {
    if (!CRITICAL_SERVICES.has(name)) return true
    if (action === 'start' || action === 'enable') return true
    try {
      await ElMessageBox.confirm(
        `${name} 是关键服务，${actionLabel(action)}会中断当前的网络连接与控制台会话。确定继续吗？`,
        `${name} · ${actionLabel(action)}`,
        {
          type: 'warning',
          confirmButtonText: '确认执行',
          cancelButtonText: '取消'
        }
      )
      return true
    } catch {
      return false
    }
  }

  async function performAction(name: string, action: OpsServiceAction): Promise<void> {
    if (pending.value[name]) return
    pending.value = { ...pending.value, [name]: action }
    try {
      await runServiceAction(name, action)
      ElMessage.success(`${name} ${actionLabel(action)}成功`)
    } catch (err) {
      ElMessage.error(messageOf(err))
      const next = { ...overrides.value }
      delete next[name]
      overrides.value = next
    } finally {
      const next = { ...pending.value }
      delete next[name]
      pending.value = next
      await refreshServices(name)
    }
  }

  async function onServiceAction(name: string, action: OpsServiceAction): Promise<void> {
    if (pending.value[name]) return
    if (!(await confirmCritical(name, action))) return
    await performAction(name, action)
  }

  async function onAutostartToggle(name: string, enabled: boolean): Promise<void> {
    if (pending.value[name]) return
    const action: OpsServiceAction = enabled ? 'enable' : 'disable'
    if (!(await confirmCritical(name, action))) return
    overrides.value = { ...overrides.value, [name]: enabled }
    await performAction(name, action)
  }

  const { loaded, error, refreshing, refresh } = usePolling(loadAll, 15000)

  watch(refreshSignal, () => void refresh())
</script>

<style scoped>
  /* The service and backup tables live in shared components: their buttons
     still carry Element Plus' 12px sibling margin, which stacks on top of
     the 6px gap of the row. Cancel it here so every row keeps one spacing. */
  :deep(.ops-actions .el-button + .el-button),
  :deep(.ops-action-buttons .el-button + .el-button),
  :deep(.ops-mobile-actions .el-button + .el-button) {
    margin-left: 0;
  }

  .ops-badge {
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

  .page-note {
    padding: 0 4px;
    color: var(--text-muted);
    font-size: var(--text-xs);
  }
</style>
