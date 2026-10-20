<template>
  <PanelCard title="ShellCrash 状态" subtitle="核心进程与守护自愈">
    <template #actions>
      <RouterLink class="link-btn" :to="{ name: 'config-shellcrash' }">
        设置
        <ChevronRight :size="14" />
      </RouterLink>
    </template>

    <div v-if="status" class="sc-block">
      <div class="sc-head">
        <StatusBadge
          :tone="status.running ? 'success' : 'danger'"
          :label="status.running ? '运行中' : '已停止'"
        />
        <span class="sc-version mono">{{ status.shellcrash_version || '—' }}</span>
      </div>

      <dl class="kv-grid sc-kv">
        <div class="kv">
          <dt>核心版本</dt>
          <dd class="mono-value">{{ status.core_version || '—' }}</dd>
        </div>
        <div class="kv">
          <dt>进程 PID</dt>
          <dd class="num">{{ status.pid || '—' }}</dd>
        </div>
        <div class="kv">
          <dt>开机自启</dt>
          <dd>{{ status.autostart ? '已开启' : '已关闭' }}</dd>
        </div>
        <div class="kv">
          <dt>上次自愈</dt>
          <dd class="num">{{ healText }}</dd>
        </div>
        <div class="kv">
          <dt>核心运行时长</dt>
          <dd class="num">{{ uptimeText }}</dd>
        </div>
        <div class="kv">
          <dt>守护巡检</dt>
          <dd class="num">{{ probeText }}</dd>
        </div>
      </dl>
    </div>

    <EmptyState
      v-else
      :icon="ShieldOff"
      title="未读取到 ShellCrash 状态"
      description="守护接口没有返回数据，可能是 ShellCrash 未安装或会话已失效。"
    />

    <template #footer>
      <span>订阅 {{ status?.subs_count ?? 0 }} 个</span>
      <span v-if="guardianText" class="truncate">{{ guardianText }}</span>
      <span v-else>未配置守护巡检</span>
    </template>
  </PanelCard>
</template>

<script setup lang="ts">
  import { computed } from 'vue'
  import { RouterLink } from 'vue-router'
  import { ChevronRight, ShieldOff } from 'lucide-vue-next'
  import PanelCard from '@/components/PanelCard.vue'
  import StatusBadge from '@/components/StatusBadge.vue'
  import EmptyState from '@/components/EmptyState.vue'
  import type {
    ShellCrashCrashResult,
    ShellCrashStatus
  } from '@/api/shellcrashConfig'
  import { formatClock, formatUptime } from '@/utils/format'

  const props = defineProps<{
    status: ShellCrashStatus | null
    crash: ShellCrashCrashResult | null
  }>()

  /** The last time the guardian replaced a dead core. */
  const healText = computed(() => {
    const stamp = props.crash?.last_fallback_heal
    if (!stamp) return '未记录'
    return formatClock(stamp)
  })

  const uptimeText = computed(() => {
    const uptime = props.crash?.uptime
    if (!uptime) return '—'
    return formatUptime(uptime)
  })

  /** The age of the last liveness probe of the guardian. */
  const probeText = computed(() => {
    const age = props.crash?.alive_age
    if (age === undefined || age === null || age < 0) return '—'
    return `${age} 秒前`
  })

  const guardianText = computed(() => props.crash?.guardian_cron || '')
</script>

<style scoped>
  .sc-block {
    display: flex;
    flex-direction: column;
    gap: 14px;
  }

  .sc-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
  }

  .sc-version {
    overflow: hidden;
    color: var(--text-muted);
    font-size: 11.5px;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .sc-kv {
    gap: 12px 18px;
  }
</style>
