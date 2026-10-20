<template>
  <div class="page-head">
    <div class="page-head-main">
      <h1 class="page-title">{{ title }}</h1>
      <p v-if="description" class="page-desc">{{ description }}</p>
    </div>
    <div v-if="$slots.default" class="page-actions">
      <slot />
    </div>
  </div>
</template>

<script setup lang="ts">
  defineProps<{
    title: string
    description?: string
  }>()
</script>

<style scoped>
  .page-head {
    display: flex;
    align-items: flex-end;
    justify-content: space-between;
    gap: var(--space-4);
    padding: 2px 2px 2px;
  }

  .page-title {
    color: var(--text);
    font-size: var(--text-lg);
    font-weight: 600;
    line-height: 1.25;
    letter-spacing: -0.01em;
  }

  .page-desc {
    margin-top: 4px;
    color: var(--text-muted);
    font-size: var(--text-sm);
    line-height: 1.5;
  }

  .page-actions {
    display: flex;
    flex-shrink: 0;
    align-items: center;
    gap: var(--space-2);
  }

  @media (max-width: 640px) {
    .page-head {
      align-items: flex-start;
      flex-direction: column;
      gap: var(--space-2);
    }

    .page-actions {
      width: 100%;
    }
  }
</style>
