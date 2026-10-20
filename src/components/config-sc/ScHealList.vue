<template>
  <ul class="heal-list">
    <li v-for="(entry, index) in entries" :key="`${entry.time}-${index}`" class="heal-row">
      <span class="heal-time mono">{{ formatTime(entry.time) }}</span>
      <StatusBadge :label="levelLabel(entry.level)" :tone="levelTone(entry.level)" :dot="false" />
      <span class="heal-message">{{ entry.message }}</span>
      <span class="heal-source mono">{{ entry.source }}</span>
    </li>
  </ul>
</template>

<script setup lang="ts">
  import StatusBadge from '@/components/StatusBadge.vue'
  import type { ShellCrashHealEntry } from '@/api/shellcrashConfig'

  defineProps<{
    entries: ShellCrashHealEntry[]
  }>()

  function levelTone(level: ShellCrashHealEntry['level']): 'success' | 'warning' | 'danger' | 'neutral' {
    if (level === 'success') return 'success'
    if (level === 'warning') return 'warning'
    if (level === 'error') return 'danger'
    return 'neutral'
  }

  function levelLabel(level: ShellCrashHealEntry['level']): string {
    if (level === 'success') return '已恢复'
    if (level === 'warning') return '已修复'
    if (level === 'error') return '异常'
    return '记录'
  }

  function formatTime(epoch: number): string {
    if (!epoch) return '时间未知'
    const date = new Date(epoch * 1000)
    const pad = (value: number) => String(value).padStart(2, '0')
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(
      date.getHours()
    )}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`
  }
</script>

<style scoped>
  .heal-list {
    display: flex;
    flex-direction: column;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .heal-row {
    display: grid;
    grid-template-columns: 150px 78px minmax(0, 1fr) 160px;
    gap: 12px;
    align-items: center;
    padding: 9px 0;
    border-bottom: 1px solid var(--border);
  }

  .heal-row:last-child {
    border-bottom: 0;
  }

  .heal-time {
    color: var(--text-secondary);
    font-size: 11.5px;
  }

  .heal-message {
    overflow: hidden;
    color: var(--text);
    font-size: 12.5px;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .heal-source {
    overflow: hidden;
    color: var(--text-faint);
    font-size: 11px;
    text-align: right;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  @media (max-width: 900px) {
    .heal-row {
      grid-template-columns: minmax(0, 1fr) auto;
      row-gap: 4px;
    }

    .heal-time {
      grid-column: 1;
    }

    .heal-message {
      grid-column: 1 / -1;
      white-space: normal;
    }

    .heal-source {
      grid-column: 1 / -1;
      text-align: left;
    }
  }
</style>
