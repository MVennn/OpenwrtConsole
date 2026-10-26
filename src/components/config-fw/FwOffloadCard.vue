<template>
  <article class="card stat-card offload-card">
    <div class="stat-top">
      <span class="stat-icon" :class="`tone-${tone}`">
        <Zap :size="18" :stroke-width="1.9" />
      </span>
      <span v-if="badge" class="stat-badge" :class="`tone-${tone}`">{{ badge }}</span>
    </div>

    <p class="stat-label">流量卸载</p>
    <p class="stat-value num">{{ value }}</p>

    <div class="offload-switches">
      <div class="offload-row">
        <span class="offload-label">
          软件卸载
          <span class="offload-hint">flow_offloading</span>
        </span>
        <el-switch
          :model-value="software"
          :disabled="disabled"
          @update:model-value="onSoftware"
        />
      </div>

      <div class="offload-row">
        <span class="offload-label">
          硬件卸载
          <span class="offload-hint">flow_offloading_hw</span>
        </span>
        <el-switch
          :model-value="hardware"
          :disabled="disabled || !software"
          @update:model-value="onHardware"
        />
      </div>
    </div>
  </article>
</template>

<script setup lang="ts">
  import { computed } from 'vue'
  import { Zap } from 'lucide-vue-next'

  defineOptions({ name: 'FwOffloadCard' })

  const props = withDefaults(
    defineProps<{
      software: boolean
      hardware: boolean
      disabled?: boolean
    }>(),
    { disabled: false }
  )

  const emit = defineEmits<{
    (event: 'toggle', payload: { software: boolean; hardware: boolean }): void
  }>()

  const value = computed(() => {
    if (props.hardware) return '硬件加速'
    if (props.software) return '软件卸载'
    return '已关闭'
  })

  const badge = computed(() => {
    if (props.hardware) return 'HW'
    if (props.software) return 'SW'
    return ''
  })

  const tone = computed<'brand' | 'success' | 'neutral'>(() => {
    if (props.hardware) return 'success'
    if (props.software) return 'brand'
    return 'neutral'
  })

  function onSoftware(value: boolean | string | number): void {
    const on = Boolean(value)
    // HW offload depends on software offload: writing hw=1 with sw=0 is an
    // invalid combination that fw4 silently ignores.
    emit('toggle', { software: on, hardware: on ? props.hardware : false })
  }

  function onHardware(value: boolean | string | number): void {
    emit('toggle', { software: props.software, hardware: Boolean(value) })
  }
</script>

<style scoped>
  .stat-card {
    display: flex;
    flex-direction: column;
    padding: 18px 20px 20px;
  }

  .stat-top {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 14px;
  }

  .stat-icon {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 38px;
    height: 38px;
    color: var(--brand-text);
    background: var(--brand-soft);
    border-radius: var(--radius-md);
  }

  .stat-icon.tone-success {
    color: var(--success-text);
    background: var(--success-soft);
  }

  .stat-icon.tone-neutral {
    color: var(--text-secondary);
    background: var(--surface-2);
  }

  .stat-badge {
    padding: 2px 8px;
    color: var(--brand-text);
    font-size: 11px;
    font-weight: 500;
    background: var(--brand-soft);
    border-radius: 999px;
  }

  .stat-badge.tone-success {
    color: var(--success-text);
    background: var(--success-soft);
  }

  .stat-label {
    color: var(--text-muted);
    font-size: var(--text-sm);
    line-height: 1.4;
  }

  .stat-value {
    margin-top: 2px;
    color: var(--text);
    font-size: var(--text-xl);
    font-weight: 600;
    line-height: 1.2;
    letter-spacing: -0.02em;
  }

  .offload-switches {
    display: flex;
    flex-direction: column;
    gap: 9px;
    margin-top: 14px;
    padding-top: 12px;
    border-top: 1px solid var(--border);
  }

  .offload-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
  }

  .offload-label {
    display: flex;
    flex-direction: column;
    gap: 1px;
    min-width: 0;
    color: var(--text-secondary);
    font-size: var(--text-sm);
  }

  .offload-hint {
    color: var(--text-faint);
    font-size: 11px;
    font-family: var(--font-mono);
  }
</style>
