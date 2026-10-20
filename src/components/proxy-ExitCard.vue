<template>
  <PanelCard title="当前出口" subtitle="出口节点与切换历史">
    <div class="exit-body">
      <div class="exit-node-row">
        <strong class="exit-node truncate" :title="node">{{ node || '—' }}</strong>
        <span class="exit-delay num" :class="delayTone">{{ delayText }}</span>
      </div>

      <dl class="kv-grid exit-kv">
        <div class="kv">
          <dt>策略组</dt>
          <dd :title="group">{{ group || '—' }}</dd>
        </div>
        <div class="kv">
          <dt>节点延迟</dt>
          <dd class="num">{{ delayText }}</dd>
        </div>
        <div class="kv">
          <dt>上次切换</dt>
          <dd class="num">{{ switchedText }}</dd>
        </div>
        <div class="kv">
          <dt>已持续</dt>
          <dd class="num">{{ durationText }}</dd>
        </div>
      </dl>
    </div>

    <template #footer>
      <span>切换记录保存在浏览器本地</span>
      <span v-if="!switchedAt">首次记录，切换时间未知</span>
    </template>
  </PanelCard>
</template>

<script setup lang="ts">
  import { computed } from 'vue'
  import PanelCard from '@/components/PanelCard.vue'

  const props = defineProps<{
    /** The node the traffic leaves through. */
    node: string
    /** The strategy group that owns the node. */
    group: string
    /** The measured latency in milliseconds, null when it is unknown. */
    delay: number | null
    /** Epoch milliseconds of the last switch, 0 when it is unknown. */
    switchedAt: number
    /** Current time in epoch milliseconds, used for the running duration. */
    now: number
  }>()

  const delayText = computed(() =>
    typeof props.delay === 'number' ? `${props.delay} ms` : '—'
  )

  const delayTone = computed(() => {
    if (typeof props.delay !== 'number') return 'is-unknown'
    if (props.delay < 200) return 'is-good'
    if (props.delay < 600) return 'is-fair'
    return 'is-slow'
  })

  const switchedText = computed(() => {
    if (!props.switchedAt) return '—'
    return new Date(props.switchedAt).toLocaleTimeString('zh-CN', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false
    })
  })

  const durationText = computed(() => {
    if (!props.switchedAt) return '—'
    const seconds = Math.max(0, Math.floor((props.now - props.switchedAt) / 1000))
    const days = Math.floor(seconds / 86400)
    const hours = Math.floor((seconds % 86400) / 3600)
    const minutes = Math.floor((seconds % 3600) / 60)
    if (days > 0) return `${days} 天 ${hours} 小时`
    if (hours > 0) return `${hours} 小时 ${minutes} 分`
    if (minutes > 0) return `${minutes} 分 ${seconds % 60} 秒`
    return `${seconds} 秒`
  })
</script>

<style scoped>
  .exit-body {
    display: flex;
    flex-direction: column;
    gap: 14px;
  }

  .exit-node-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    min-width: 0;
  }

  .exit-node {
    overflow: hidden;
    color: var(--text);
    font-size: var(--text-sm);
    font-weight: 600;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .exit-delay {
    flex-shrink: 0;
    padding: 2px 8px;
    font-size: 11.5px;
    font-weight: 500;
    background: var(--surface-2);
    border-radius: 999px;
  }

  .exit-delay.is-good {
    color: var(--success-text);
    background: var(--success-soft);
  }

  .exit-delay.is-fair {
    color: var(--warning-text);
    background: var(--warning-soft);
  }

  .exit-delay.is-slow {
    color: var(--danger-text);
    background: var(--danger-soft);
  }

  .exit-delay.is-unknown {
    color: var(--text-muted);
  }

  .exit-kv {
    gap: 12px 18px;
  }
</style>
