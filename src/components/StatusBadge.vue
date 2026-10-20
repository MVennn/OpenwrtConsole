<template>
  <span class="status-badge" :class="`tone-${tone}`">
    <span v-if="dot" class="status-dot" />
    {{ label }}
  </span>
</template>

<script setup lang="ts">
  withDefaults(
    defineProps<{
      label: string
      tone?: 'success' | 'warning' | 'danger' | 'neutral' | 'info' | 'brand'
      dot?: boolean
    }>(),
    { tone: 'neutral', dot: true }
  )
</script>

<style scoped>
  .status-badge {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    height: 24px;
    padding: 0 9px;
    color: var(--text-secondary);
    font-size: var(--text-xs);
    font-weight: 500;
    white-space: nowrap;
    background: var(--surface-2);
    border-radius: 999px;
  }

  .status-dot {
    width: 6px;
    height: 6px;
    background: currentColor;
    border-radius: 50%;
  }

  .tone-success {
    color: var(--success-text);
    background: var(--success-soft);
  }

  .tone-warning {
    color: var(--warning-text);
    background: var(--warning-soft);
  }

  .tone-danger {
    color: var(--danger-text);
    background: var(--danger-soft);
  }

  .tone-info {
    color: var(--info-text);
    background: var(--info-soft);
  }

  .tone-brand {
    color: var(--brand-text);
    background: var(--brand-soft);
  }

  .tone-neutral {
    color: var(--text-muted);
  }
</style>
