<template>
  <div class="sub-card">
    <div class="sub-head">
      <span class="sub-title truncate">{{ title }}</span>
      <StatusBadge
        :label="enabled ? '已启用' : '已停用'"
        :tone="enabled ? 'success' : 'neutral'"
        :dot="false"
      />
    </div>

    <dl class="sub-facts">
      <div class="sub-fact">
        <dt>别名</dt>
        <dd class="truncate">{{ alias || '—' }}</dd>
      </div>
      <div class="sub-fact">
        <dt>来源</dt>
        <dd class="truncate">{{ source || '—' }}</dd>
      </div>
      <div class="sub-fact">
        <dt>条目数</dt>
        <dd class="num">{{ entries }}</dd>
      </div>
      <div class="sub-fact">
        <dt>地址</dt>
        <dd class="mono truncate">{{ masked }}</dd>
      </div>
    </dl>
  </div>
</template>

<script setup lang="ts">
  import StatusBadge from '@/components/StatusBadge.vue'

  defineProps<{
    title: string
    alias: string
    source: string
    entries: number
    masked: string
    enabled: boolean
  }>()
</script>

<style scoped>
  .sub-card {
    display: flex;
    flex-direction: column;
    gap: 10px;
    padding: 13px 15px;
    background: var(--surface-2);
    border-radius: var(--radius);
  }

  .sub-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
  }

  .sub-title {
    color: var(--text);
    font-size: var(--text-sm);
    font-weight: 600;
  }

  .sub-facts {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 8px 14px;
    margin: 0;
  }

  .sub-fact {
    display: flex;
    flex-direction: column;
    gap: 1px;
    min-width: 0;
  }

  .sub-fact dt {
    color: var(--text-muted);
    font-size: 11px;
  }

  .sub-fact dd {
    margin: 0;
    overflow: hidden;
    color: var(--text-secondary);
    font-size: 12px;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
</style>
