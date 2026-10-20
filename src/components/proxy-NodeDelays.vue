<template>
  <ul v-if="results.length" class="node-delays">
    <li v-for="item in results" :key="item.node" class="node-delay-row">
      <span class="node-delay-name truncate" :title="item.node">{{ item.node }}</span>
      <span class="node-delay-value num" :class="valueClass(item.delay)">
        {{ typeof item.delay === 'number' ? `${item.delay} ms` : '超时' }}
      </span>
      <span v-if="item.node === fastest" class="node-delay-best">最快</span>
    </li>
  </ul>
</template>

<script setup lang="ts">
  import type { ProxyDelayResult } from '@/api/proxyActions'

  defineProps<{
    /** The measured nodes of the batch. */
    results: ProxyDelayResult[]
    /** The node with the lowest latency. */
    fastest: string
  }>()

  function valueClass(delay: number | null): string {
    if (typeof delay !== 'number') return 'is-timeout'
    if (delay < 200) return 'is-good'
    if (delay < 600) return 'is-fair'
    return 'is-slow'
  }
</script>

<style scoped>
  .node-delays {
    display: flex;
    flex-wrap: wrap;
    gap: 6px 8px;
    margin: 8px 0 0;
    padding: 0;
    list-style: none;
  }

  .node-delay-row {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    max-width: 100%;
    padding: 2px 8px;
    background: var(--surface-2);
    border-radius: 999px;
  }

  .node-delay-name {
    max-width: 190px;
    color: var(--text-secondary);
    font-size: 11px;
  }

  .node-delay-value {
    color: var(--text-muted);
    font-size: 11px;
    font-weight: 500;
  }

  .node-delay-value.is-good {
    color: var(--success-text);
  }

  .node-delay-value.is-fair {
    color: var(--warning-text);
  }

  .node-delay-value.is-slow {
    color: var(--danger-text);
  }

  .node-delay-value.is-timeout {
    color: var(--text-faint);
  }

  .node-delay-best {
    padding: 0 5px;
    color: var(--success-text);
    font-size: 10px;
    font-weight: 600;
    background: var(--success-soft);
    border-radius: 999px;
  }
</style>
