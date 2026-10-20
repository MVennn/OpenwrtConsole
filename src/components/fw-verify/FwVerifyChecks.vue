<template>
  <ul class="fw-checks">
    <li v-for="check in checks" :key="check.label" class="fw-check">
      <el-tag :type="tagType(check.state)" size="small" effect="light">
        {{ tagText(check.state) }}
      </el-tag>
      <span class="fw-check-label">{{ check.label }}</span>
      <span class="fw-check-detail" :class="{ 'is-fail': check.state === 'fail' }">
        {{ check.detail }}
      </span>
    </li>
  </ul>
</template>

<script setup lang="ts">
  import type { FirmwareCheck, FirmwareCheckState } from '@/api/firmware'

  defineOptions({ name: 'FwVerifyChecks' })

  defineProps<{
    checks: FirmwareCheck[]
  }>()

  function tagType(state: FirmwareCheckState): 'success' | 'danger' | 'info' {
    if (state === 'pass') return 'success'
    if (state === 'fail') return 'danger'
    return 'info'
  }

  function tagText(state: FirmwareCheckState): string {
    if (state === 'pass') return '一致'
    if (state === 'fail') return '不一致'
    return '无官方信息'
  }
</script>

<style scoped>
  .fw-checks {
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 0;
    margin: 0;
    list-style: none;
  }

  .fw-check {
    display: flex;
    align-items: center;
    gap: 10px;
    min-width: 0;
    font-size: var(--text-xs);
  }

  .fw-check-label {
    flex: 0 0 auto;
    color: var(--text-secondary);
    font-weight: 500;
  }

  .fw-check-detail {
    min-width: 0;
    overflow: hidden;
    color: var(--text-muted);
    font-family: var(--font-mono);
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .fw-check-detail.is-fail {
    color: var(--danger-text);
    font-weight: 500;
  }
</style>
