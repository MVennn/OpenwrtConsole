<template>
  <div v-if="dirty" class="draft-notice">
    <span class="draft-text">
      <AlertTriangle :size="14" />
      {{ savedAt ? `有未保存的修改（${formatTime(savedAt)}）` : '有未保存的修改' }}
    </span>
    <el-button size="small" link type="primary" @click="$emit('discard')">放弃修改</el-button>
  </div>
</template>

<script setup lang="ts">
  import { AlertTriangle } from 'lucide-vue-next'

  defineProps<{
    dirty: boolean
    savedAt?: string | null
  }>()

  defineEmits<{
    discard: []
  }>()

  function formatTime(value: string): string {
    const date = new Date(value)
    if (Number.isNaN(date.getTime())) return value
    return date.toLocaleString('zh-CN', {
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    })
  }
</script>

<style scoped>
  .draft-notice {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding: 9px 14px;
    margin-bottom: 12px;
    color: var(--warning-text);
    font-size: 12.5px;
    background: var(--warning-soft);
    border: 1px solid color-mix(in srgb, var(--warning) 24%, transparent);
    border-radius: var(--radius);
  }

  .draft-text {
    display: inline-flex;
    align-items: center;
    gap: 6px;
  }
</style>
