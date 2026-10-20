<template>
  <section class="status-card" :class="status?.configured ? 'is-ready' : 'is-pending'">
    <header class="status-head">
      <div class="status-title">
        <span class="status-icon">
          <ShieldCheck v-if="status?.configured" :size="18" />
          <TriangleAlert v-else :size="18" />
        </span>
        <div class="status-text">
          <h2 class="status-heading">
            {{ status?.configured ? '路由器已完成基本配置' : '路由器尚未完成首次配置' }}
          </h2>
          <p class="status-desc">
            {{
              status?.configured
                ? '向导可以随时重新运行，用来修改密码、时区、无线或上网方式。'
                : '向导会带你完成密码、时区、无线与上网方式的设置。'
            }}
          </p>
        </div>
      </div>

      <div class="status-side">
        <StatusBadge
          :label="status?.configured ? '已配置' : '未配置'"
          :tone="status?.configured ? 'success' : 'warning'"
        />
        <el-button size="small" text type="primary" @click="$emit('skip')">跳过向导</el-button>
      </div>
    </header>

    <ul v-if="status" class="check-list">
      <li v-for="check in status.checks" :key="check.key" class="check-item">
        <CheckCircle2 v-if="check.done" :size="15" class="check-icon is-done" />
        <CircleDashed v-else :size="15" class="check-icon" />
        <span class="check-label">{{ check.label }}</span>
        <span class="check-detail truncate">{{ check.detail }}</span>
      </li>
    </ul>

    <div v-else class="status-loading">
      <el-skeleton :rows="2" animated />
    </div>
  </section>
</template>

<script setup lang="ts">
  import { CheckCircle2, CircleDashed, ShieldCheck, TriangleAlert } from 'lucide-vue-next'
  import StatusBadge from '@/components/StatusBadge.vue'
  import type { SetupStatus } from '@/api/setup'

  defineProps<{
    status: SetupStatus | null
  }>()

  defineEmits<{
    (event: 'skip'): void
  }>()
</script>

<style scoped>
  .status-card {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
    padding: 18px 20px;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius-lg);
    box-shadow: var(--shadow-xs);
  }

  .status-card.is-pending {
    border-color: color-mix(in srgb, var(--warning) 34%, var(--border));
    background: color-mix(in srgb, var(--warning-soft) 60%, var(--surface));
  }

  .status-head {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: var(--space-4);
  }

  .status-title {
    display: flex;
    align-items: flex-start;
    gap: 10px;
    min-width: 0;
  }

  .status-icon {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 32px;
    height: 32px;
    flex-shrink: 0;
    color: var(--warning-text);
    background: var(--warning-soft);
    border-radius: var(--radius-md);
  }

  .is-ready .status-icon {
    color: var(--success-text);
    background: var(--success-soft);
  }

  .status-heading {
    color: var(--text);
    font-size: 15px;
    font-weight: 600;
    line-height: 1.35;
  }

  .status-desc {
    margin-top: 3px;
    color: var(--text-muted);
    font-size: 12px;
    line-height: 1.5;
  }

  .status-side {
    display: flex;
    flex-shrink: 0;
    align-items: center;
    gap: var(--space-2);
  }

  .check-list {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 6px 20px;
    padding: 12px 0 0;
    margin: 0;
    list-style: none;
    border-top: 1px solid var(--border);
  }

  .check-item {
    display: flex;
    align-items: center;
    gap: 8px;
    min-width: 0;
    font-size: 12px;
  }

  .check-icon {
    flex-shrink: 0;
    color: var(--text-faint);
  }

  .check-icon.is-done {
    color: var(--success);
  }

  .check-label {
    flex-shrink: 0;
    color: var(--text-secondary);
    font-weight: 500;
  }

  .check-detail {
    min-width: 0;
    color: var(--text-muted);
  }

  .status-loading {
    padding-top: 4px;
  }

  @media (max-width: 640px) {
    .status-head {
      flex-direction: column;
      gap: var(--space-2);
    }

    .status-side {
      width: 100%;
      justify-content: space-between;
    }

    .check-list {
      grid-template-columns: minmax(0, 1fr);
    }
  }
</style>
