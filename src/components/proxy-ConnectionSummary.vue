<template>
  <div class="conn-summary">
    <section class="summary-col">
      <header class="summary-head">
        <h3 class="summary-title">按域名</h3>
        <span class="summary-meta num">{{ summary.domains.length }} 个</span>
      </header>
      <ul v-if="summary.domains.length" class="summary-list">
        <li v-for="bucket in summary.domains" :key="bucket.key" class="summary-row">
          <span class="summary-key truncate" :title="bucket.key">{{ bucket.key }}</span>
          <span class="summary-count num">{{ bucket.count }} 条</span>
          <span class="summary-bytes num">{{ formatBytes(bucket.total) }}</span>
        </li>
      </ul>
      <p v-else class="summary-empty">当前连接没有域名信息。</p>
    </section>

    <section class="summary-col">
      <header class="summary-head">
        <h3 class="summary-title">按进程</h3>
        <span class="summary-meta num">{{ summary.processes.length }} 个</span>
      </header>
      <ul v-if="summary.processes.length" class="summary-list">
        <li v-for="bucket in summary.processes" :key="bucket.key" class="summary-row">
          <span class="summary-key truncate" :title="bucket.key">{{ bucket.key }}</span>
          <span class="summary-count num">{{ bucket.count }} 条</span>
          <span class="summary-bytes num">{{ formatBytes(bucket.total) }}</span>
        </li>
      </ul>
      <p v-else class="summary-empty">
        核心未上报进程信息，需要读取进程表才能统计。
      </p>
    </section>
  </div>
</template>

<script setup lang="ts">
  import type { ConnectionSummary } from '@/api/proxyActions'
  import { formatBytes } from '@/utils/format'

  defineProps<{
    summary: ConnectionSummary
  }>()
</script>

<style scoped>
  .conn-summary {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 18px;
    padding: 14px 20px;
    border-bottom: 1px solid var(--border);
  }

  .summary-col {
    display: flex;
    flex-direction: column;
    gap: 6px;
    min-width: 0;
  }

  .summary-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
  }

  .summary-title {
    margin: 0;
    color: var(--text-secondary);
    font-size: 11.5px;
    font-weight: 600;
    letter-spacing: 0.02em;
  }

  .summary-meta {
    color: var(--text-faint);
    font-size: 11px;
  }

  .summary-list {
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .summary-row {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto auto;
    align-items: center;
    gap: 10px;
    padding: 3px 0;
    font-size: 11.5px;
  }

  .summary-key {
    min-width: 0;
    color: var(--text);
  }

  .summary-count {
    color: var(--text-faint);
    font-size: 11px;
  }

  .summary-bytes {
    min-width: 58px;
    color: var(--text-secondary);
    font-size: 11.5px;
    text-align: right;
  }

  .summary-empty {
    margin: 0;
    color: var(--text-faint);
    font-size: 11.5px;
    line-height: 1.6;
  }

  @media (max-width: 640px) {
    .conn-summary {
      grid-template-columns: minmax(0, 1fr);
      gap: 14px;
    }
  }
</style>
