<template>
  <PanelCard :title="title" :subtitle="subtitle">
    <template #actions>
      <slot name="actions" />
    </template>

    <div v-if="entries.length" class="pending-wrap">
      <div class="pending-head">
        <span class="pending-col-op">操作</span>
        <span class="pending-col-target">配置段 · 选项</span>
        <span class="pending-col-value">旧值 → 新值</span>
      </div>

      <ul class="pending-list">
        <li v-for="(entry, index) in entries" :key="`${entry.op}-${entry.target}-${index}`" class="pending-row">
          <span class="pending-op" :class="`op-${entry.op}`">{{ opText(entry.op) }}</span>
          <span class="pending-target" :title="entry.target">
            <span class="mono">{{ entry.target }}</span>
            <span v-if="entry.label" class="pending-label">{{ entry.label }}</span>
          </span>
          <span class="pending-values">
            <template v-if="entry.op === 'add'">
              <span class="pending-note">新增段 {{ entry.type || '未知类型' }}</span>
            </template>
            <template v-else-if="entry.op === 'delete' && !entry.option">
              <span class="pending-note">整个配置段将被删除</span>
            </template>
            <template v-else-if="entry.op === 'delete'">
              <span v-if="entry.before" class="pending-value mono is-before">{{ entry.before }}</span>
              <ArrowRight v-if="entry.before" :size="13" class="pending-arrow" />
              <span class="pending-value mono is-after">（删除）</span>
            </template>
            <template v-else>
              <span class="pending-value mono is-before">{{ entry.before || '（未设置）' }}</span>
              <ArrowRight :size="13" class="pending-arrow" />
              <span class="pending-value mono is-after">{{ entry.after || '（未设置）' }}</span>
            </template>
          </span>
        </li>
      </ul>

      <p class="pending-hint">
        改动仍在 UCI 暂存区（<span class="mono">/tmp/.uci</span>），尚未写入配置文件。
        点击右上角「保存并应用」后才会提交并重载对应的服务；「放弃修改」可以撤销它们。
      </p>
    </div>

    <EmptyState
      v-else
      :icon="CheckCircle2"
      :title="emptyTitle"
      :description="emptyDescription"
    />
  </PanelCard>
</template>

<script setup lang="ts">
  import { ArrowRight, CheckCircle2 } from 'lucide-vue-next'
  import PanelCard from '@/components/PanelCard.vue'
  import EmptyState from '@/components/EmptyState.vue'
  import { opText, type PendingEntry } from '@/api/configPending'

  defineOptions({ name: 'ConfigPendingPanel' })

  withDefaults(
    defineProps<{
      /** The staged changes, ready to be displayed. */
      entries: PendingEntry[]
      title?: string
      subtitle?: string
      emptyTitle?: string
      emptyDescription?: string
    }>(),
    {
      title: '待生效的改动',
      subtitle: '暂存在 UCI 中，还没有写入路由器',
      emptyTitle: '没有待应用的改动',
      emptyDescription: '当前页面显示的配置与路由器上生效的配置一致。'
    }
  )
</script>

<style scoped>
  .pending-wrap {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .pending-head {
    display: grid;
    grid-template-columns: 44px minmax(120px, 1.2fr) minmax(160px, 2fr);
    gap: 10px;
    padding-bottom: 6px;
    color: var(--text-faint);
    font-size: 10.5px;
    border-bottom: 1px solid var(--border);
  }

  .pending-list {
    display: flex;
    flex-direction: column;
    gap: 6px;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .pending-row {
    display: grid;
    grid-template-columns: 44px minmax(120px, 1.2fr) minmax(160px, 2fr);
    align-items: center;
    gap: 10px;
    padding: 7px 10px;
    background: var(--surface-2);
    border-radius: var(--radius);
  }

  .pending-op {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    height: 20px;
    color: var(--brand-text);
    font-size: 11px;
    font-weight: 500;
    background: var(--brand-soft);
    border-radius: 999px;
  }

  .pending-op.op-delete {
    color: var(--danger-text);
    background: var(--danger-soft);
  }

  .pending-op.op-add {
    color: var(--success-text);
    background: var(--success-soft);
  }

  .pending-target {
    display: flex;
    flex-direction: column;
    gap: 1px;
    min-width: 0;
    overflow: hidden;
    color: var(--text-secondary);
    font-size: 12px;
  }

  .pending-target .mono {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .pending-label {
    color: var(--text-muted);
    font-size: 11px;
  }

  .pending-values {
    display: flex;
    align-items: center;
    gap: 7px;
    min-width: 0;
    font-size: 12px;
  }

  .pending-value {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .pending-value.is-before {
    color: var(--text-faint);
    text-decoration: line-through;
  }

  .pending-value.is-after {
    color: var(--text);
    font-weight: 500;
  }

  .pending-arrow {
    flex-shrink: 0;
    color: var(--text-faint);
  }

  .pending-note {
    color: var(--text-muted);
    font-size: 12px;
  }

  .pending-hint {
    margin: 4px 0 0;
    color: var(--text-muted);
    font-size: 11.5px;
    line-height: 1.6;
  }

  @media (max-width: 640px) {
    .pending-head {
      display: none;
    }

    .pending-row {
      grid-template-columns: 44px minmax(0, 1fr);
      gap: 6px 10px;
    }

    .pending-values {
      grid-column: span 2;
      flex-wrap: wrap;
    }
  }
</style>
