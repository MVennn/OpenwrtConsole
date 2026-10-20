<template>
  <div class="card stat-card">
    <div class="stat-top">
      <span class="stat-icon" :class="`tone-${tone}`">
        <component :is="icon" :size="18" :stroke-width="1.9" />
      </span>
      <span v-if="badge" class="stat-badge" :class="`tone-${tone}`">{{ badge }}</span>
    </div>
    <p class="stat-label">{{ label }}</p>
    <p class="stat-value num">
      {{ value }}<span v-if="suffix" class="stat-suffix">{{ suffix }}</span>
    </p>
    <p v-if="meta" class="stat-meta truncate">{{ meta }}</p>
    <div v-if="progress !== undefined" class="stat-track" role="presentation">
      <div
        class="stat-fill"
        :class="`tone-${tone}`"
        :style="{ width: `${clampedProgress}%` }"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
  import { computed, type Component } from 'vue'

  const props = withDefaults(
    defineProps<{
      label: string
      value: string | number
      suffix?: string
      meta?: string
      badge?: string
      tone?: 'brand' | 'success' | 'warning' | 'danger' | 'neutral'
      icon: Component
      progress?: number
    }>(),
    {
      tone: 'brand',
      suffix: '',
      meta: '',
      badge: '',
      progress: undefined
    }
  )

  const clampedProgress = computed(() => Math.min(100, Math.max(0, props.progress ?? 0)))
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

  .stat-icon.tone-warning {
    color: var(--warning-text);
    background: var(--warning-soft);
  }

  .stat-icon.tone-danger {
    color: var(--danger-text);
    background: var(--danger-soft);
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

  .stat-badge.tone-warning {
    color: var(--warning-text);
    background: var(--warning-soft);
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

  .stat-suffix {
    margin-left: 3px;
    color: var(--text-muted);
    font-size: var(--text-sm);
    font-weight: 500;
    letter-spacing: 0;
  }

  .stat-meta {
    margin-top: 5px;
    color: var(--text-muted);
    font-size: var(--text-xs);
  }

  .stat-track {
    height: 5px;
    margin-top: 12px;
    overflow: hidden;
    background: var(--surface-2);
    border-radius: 999px;
  }

  .stat-fill {
    height: 100%;
    background: var(--brand);
    border-radius: inherit;
    transition: width 0.35s ease;
  }

  .stat-fill.tone-success {
    background: var(--success);
  }

  .stat-fill.tone-warning {
    background: var(--warning);
  }

  .stat-fill.tone-danger {
    background: var(--danger);
  }

  .stat-fill.tone-neutral {
    background: var(--text-faint);
  }
</style>
