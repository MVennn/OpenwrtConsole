<template>
  <div class="page">
    <PageHeader title="系统" description="固件信息、资源占用与系统日志">
      <el-button :icon="RefreshCw" :loading="refreshing" @click="refresh">刷新</el-button>
      <el-button type="primary" @click="goSystemConfig">系统设置</el-button>
    </PageHeader>

    <el-alert v-if="error" type="error" :title="error?.message || '操作失败'" :closable="false" show-icon />

    <template v-if="loaded">
      <div class="grid grid-4">
        <StatCard
          label="运行时间"
          :value="formatUptime(info?.uptime)"
          :meta="`启动于 ${bootTime}`"
          :icon="Clock"
          tone="brand"
        />
        <StatCard
          label="1 分钟负载"
          :value="loads[0].toFixed(2)"
          :meta="`5 分钟 ${loads[1].toFixed(2)} · 15 分钟 ${loads[2].toFixed(2)}`"
          :icon="Activity"
          tone="neutral"
        />
        <StatCard
          label="内存使用"
          :value="memoryPercent"
          suffix="%"
          :meta="`${formatBytes(memoryUsed)} / ${formatBytes(info?.memory?.total)}`"
          :tone="memoryTone"
          :progress="memoryPercent"
          :icon="MemoryStick"
        />
        <StatCard
          label="存储使用"
          :value="storagePercent"
          suffix="%"
          :meta="`可用 ${formatBytes((info?.root?.avail || 0) * 1024)}`"
          :tone="storageTone"
          :progress="storagePercent"
          :icon="HardDrive"
        />
      </div>

      <div class="grid grid-wide">
        <PanelCard title="系统信息" subtitle="来自 ubus system.board">
          <dl class="kv-grid info-grid">
            <div class="kv">
              <dt>主机名</dt>
              <dd>{{ board?.hostname || '—' }}</dd>
            </div>
            <div class="kv">
              <dt>设备型号</dt>
              <dd>{{ board?.model || '—' }}</dd>
            </div>
            <div class="kv">
              <dt>固件版本</dt>
              <dd>{{ board?.release?.description || '—' }}</dd>
            </div>
            <div class="kv">
              <dt>内核版本</dt>
              <dd class="mono">{{ board?.kernel || '—' }}</dd>
            </div>
            <div class="kv">
              <dt>版本修订</dt>
              <dd class="mono">{{ board?.release?.revision || '—' }}</dd>
            </div>
            <div class="kv">
              <dt>目标平台</dt>
              <dd class="mono">{{ board?.release?.target || '—' }}</dd>
            </div>
            <div class="kv">
              <dt>根文件系统</dt>
              <dd>{{ board?.rootfs_type || '—' }}</dd>
            </div>
            <div class="kv">
              <dt>系统时间</dt>
              <dd>{{ localTime }}</dd>
            </div>
          </dl>
        </PanelCard>

        <PanelCard title="资源明细" subtitle="内存、存储与交换分区">
          <div class="res-list">
            <div v-for="row in resources" :key="row.label" class="res-row">
              <div class="res-head">
                <span class="res-label">{{ row.label }}</span>
                <span class="res-value num">{{ row.text }}</span>
              </div>
              <div class="res-track">
                <div class="res-fill" :class="`tone-${row.tone}`" :style="{ width: `${row.percent}%` }" />
              </div>
            </div>
          </div>
        </PanelCard>
      </div>

      <PanelCard title="系统日志" :subtitle="`最近 ${logLines.length} 行`" flush>
        <template #actions>
          <el-select
            v-model="logCount"
            size="small"
            class="log-select"
            style="width: 108px"
            @change="loadLogs"
          >
            <el-option :value="80" label="80 行" />
            <el-option :value="160" label="160 行" />
            <el-option :value="300" label="300 行" />
          </el-select>
          <button class="icon-btn log-refresh" aria-label="刷新日志" @click="loadLogs">
            <RefreshCw :size="15" />
          </button>
        </template>
        <pre ref="logView" class="log-view">{{ logLines.length ? logLines.join('\n') : '暂无日志输出' }}</pre>
      </PanelCard>

      <PanelCard title="维护操作" subtitle="高风险操作需要确认">
        <div class="maintenance">
          <div class="maintenance-row">
            <div class="maintenance-copy">
              <p class="maintenance-title">重启路由器</p>
              <p class="maintenance-desc">会中断所有有线与无线连接，预计 1–2 分钟后恢复。</p>
            </div>
            <el-button type="danger" plain :loading="rebooting" @click="reboot">重启</el-button>
          </div>
          <div class="maintenance-row">
            <div class="maintenance-copy">
              <p class="maintenance-title">更多设置</p>
              <p class="maintenance-desc">软件包、启动项、备份与固件升级都在控制台内完成。</p>
            </div>
            <div class="maintenance-links">
              <el-button link type="primary" size="small" @click="goPackages">软件包</el-button>
              <el-button link type="primary" size="small" @click="goOperations">启动项</el-button>
              <el-button link type="primary" size="small" @click="goFirmware">备份 / 固件</el-button>
            </div>
          </div>
        </div>
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
  import { computed, nextTick, ref, shallowRef, watch } from 'vue'
  import { useRouter } from 'vue-router'
  import {
    Activity,
    Clock,
    HardDrive,
    MemoryStick,
    RefreshCw
  } from 'lucide-vue-next'
  import { ElMessage, ElMessageBox } from 'element-plus'
  import PageHeader from '@/components/PageHeader.vue'
  import PanelCard from '@/components/PanelCard.vue'
  import StatCard from '@/components/StatCard.vue'
  import { usePolling } from '@/composables/usePolling'
  import { useRefreshSignal } from '@/composables/useRefresh'
  import { api } from '@/api/openwrt'
  import { rebootRouter } from '@/api/ops'
  import type { BoardInfo, SystemInfo } from '@/api/types'
  import { formatBytes, formatClock, formatPercent, formatUptime } from '@/utils/format'

  defineOptions({ name: 'SystemView' })

  // Replaced wholesale on every poll; deep reactivity would only add proxies.
  const board = shallowRef<BoardInfo>()
  const info = shallowRef<SystemInfo>()
  const logs = shallowRef<string[]>([])
  const logCount = ref(80)
  const logView = ref<HTMLElement>()
  const rebooting = ref(false)
  const refreshSignal = useRefreshSignal()
  const router = useRouter()

  const loads = computed(() => (info.value?.load ?? [0, 0, 0]).map((value) => value / 65536))
  const memoryUsed = computed(() => {
    const memory = info.value?.memory
    return memory ? memory.total - memory.available : 0
  })
  const memoryPercent = computed(() => {
    const memory = info.value?.memory
    return memory?.total ? Math.round((memoryUsed.value / memory.total) * 100) : 0
  })
  const storagePercent = computed(() => {
    const root = info.value?.root
    return root?.total ? Math.round((root.used / root.total) * 100) : 0
  })
  const memoryTone = computed(() =>
    memoryPercent.value >= 90 ? 'danger' : memoryPercent.value >= 75 ? 'warning' : 'brand'
  )
  const storageTone = computed(() =>
    storagePercent.value >= 90 ? 'danger' : storagePercent.value >= 75 ? 'warning' : 'brand'
  )

  const localTime = computed(() => formatClock(info.value?.localtime))
  const bootTime = computed(() => {
    if (!info.value) return '—'
    return formatClock(info.value.localtime - info.value.uptime)
  })

  const resources = computed(() => {
    const memory = info.value?.memory
    const root = info.value?.root
    const tmp = info.value?.tmp
    const swap = info.value?.swap
    return [
      {
        label: '内存',
        text: memory
          ? `${formatBytes(memory.total - memory.available)} / ${formatBytes(memory.total)}`
          : '—',
        percent: memory?.total ? formatPercent(memory.total - memory.available, memory.total) : 0,
        tone: memoryPercent.value >= 90 ? 'danger' : memoryPercent.value >= 75 ? 'warning' : 'brand'
      },
      {
        label: '存储（overlay）',
        text: root
          ? `${formatBytes(root.used * 1024)} / ${formatBytes(root.total * 1024)}`
          : '—',
        percent: root?.total ? formatPercent(root.used, root.total) : 0,
        tone: storagePercent.value >= 90 ? 'danger' : storagePercent.value >= 75 ? 'warning' : 'brand'
      },
      {
        label: '临时空间（/tmp）',
        text: tmp
          ? `${formatBytes(tmp.used * 1024)} / ${formatBytes(tmp.total * 1024)}`
          : '—',
        percent: tmp?.total ? formatPercent(tmp.used, tmp.total) : 0,
        tone: 'neutral'
      },
      {
        label: '交换分区',
        text: swap?.total ? `${formatBytes(swap.total * 1024)}` : '未启用',
        percent: swap?.total ? formatPercent(swap.total - swap.free, swap.total) : 0,
        tone: 'neutral'
      }
    ]
  })

  const logLines = computed(() => logs.value)

  async function loadLogs(): Promise<void> {
    try {
      logs.value = await api.logs(logCount.value)
      await nextTick()
      if (logView.value) logView.value.scrollTop = logView.value.scrollHeight
    } catch {
      logs.value = []
    }
  }

  function goSystemConfig(): void {
    void router.push({ name: 'config-system' })
  }

  function goPackages(): void {
    void router.push({ name: 'config-packages' })
  }

  function goOperations(): void {
    void router.push({ name: 'operations' })
  }

  function goFirmware(): void {
    void router.push({ name: 'config-firmware' })
  }

  async function reboot(): Promise<void> {
    try {
      await ElMessageBox.confirm(
        '重启会立即中断所有网络连接，路由器预计需要 1–2 分钟恢复。确定继续吗？',
        '重启路由器',
        {
          type: 'warning',
          confirmButtonText: '确认重启',
          cancelButtonText: '取消',
          confirmButtonClass: 'el-button--danger'
        }
      )
    } catch {
      return
    }

    rebooting.value = true
    try {
      await rebootRouter()
      ElMessage.success('重启指令已发送，请等待路由器恢复')
    } catch (err) {
      ElMessage.error(err instanceof Error ? err.message : '重启失败')
      rebooting.value = false
    }
  }

  const { loaded, error, refreshing, refresh } = usePolling(async () => {
    const [nextBoard, nextInfo] = await Promise.all([api.board(), api.systemInfo()])
    board.value = nextBoard
    info.value = nextInfo
    await loadLogs()
  }, 15000)

  watch(refreshSignal, () => {
    void refresh()
    void loadLogs()
  })
</script>

<style scoped>
  /* Element Plus 给相邻按钮加了 12px 左边距，和外层 flex 的 gap 叠加后
     同一行的按钮会被拉到 20px 间距；这里把间距统一交回给 gap 控制。 */
  .el-button + .el-button {
    margin-left: 0;
  }

  .info-grid {
    gap: 16px 24px;
  }

  .res-list {
    display: flex;
    flex-direction: column;
    gap: 18px;
  }

  .res-row {
    display: flex;
    flex-direction: column;
    gap: 7px;
  }

  .res-head {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 12px;
  }

  .res-label {
    color: var(--text-secondary);
    font-size: var(--text-sm);
    font-weight: 500;
  }

  .res-value {
    color: var(--text-muted);
    font-size: 11.5px;
  }

  .res-track {
    height: 6px;
    overflow: hidden;
    background: var(--surface-2);
    border-radius: 999px;
  }

  .res-fill {
    height: 100%;
    background: var(--brand);
    border-radius: inherit;
    transition: width 0.35s ease;
  }

  .res-fill.tone-warning {
    background: var(--warning);
  }

  .res-fill.tone-danger {
    background: var(--danger);
  }

  .res-fill.tone-neutral {
    background: var(--text-faint);
  }

  /* 卡片头部的下拉与图标按钮保持同一档高度（small = 30px），否则同一行
     里会出现一高一矮的两个控件。 */
  .log-select :deep(.el-select__wrapper) {
    min-height: 30px;
  }

  .log-refresh {
    width: 30px;
    height: 30px;
  }

  .log-view {
    max-height: 360px;
    padding: 14px 20px 18px;
    margin: 0;
    overflow: auto;
    color: var(--text-secondary);
    font-family: var(--font-mono);
    font-size: 11.5px;
    line-height: 1.7;
    white-space: pre-wrap;
    word-break: break-word;
    background: var(--surface-3);
    border-top: 1px solid var(--border);
    border-radius: 0 0 var(--radius-lg) var(--radius-lg);
  }

  .maintenance {
    display: flex;
    flex-direction: column;
    gap: 0;
  }

  .maintenance-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 20px;
    padding: 16px 0;
    border-bottom: 1px solid var(--border);
  }

  .maintenance-row:first-child {
    padding-top: 2px;
  }

  .maintenance-row:last-child {
    padding-bottom: 2px;
    border-bottom: 0;
  }

  .maintenance-title {
    color: var(--text);
    font-size: var(--text-sm);
    font-weight: 500;
  }

  .maintenance-desc {
    margin-top: 2px;
    color: var(--text-muted);
    font-size: var(--text-xs);
    line-height: 1.6;
  }

  .maintenance-links {
    display: flex;
    flex-shrink: 0;
    gap: 6px;
  }

  @media (max-width: 640px) {
    .maintenance-row {
      align-items: flex-start;
      flex-direction: column;
      gap: 10px;
    }

    .maintenance-links {
      flex-wrap: wrap;
    }

    .log-view {
      padding: 12px 16px 14px;
    }
  }
</style>
