<template>
  <div class="port-grid">
    <div v-for="item in items" :key="item.port" class="port-cell" :class="item.listening ? 'is-live' : 'is-idle'">
      <div class="port-top">
        <span class="port-num mono num">{{ item.port }}</span>
        <StatusBadge
          :label="item.listening ? '已监听' : '未监听'"
          :tone="item.listening ? 'success' : 'neutral'"
          :dot="false"
        />
      </div>
      <span class="port-label">{{ item.label }}</span>
      <span class="port-hint">{{ item.hint }}</span>
      <span class="port-owner mono">
        <template v-if="item.listening">{{ item.process || '未知进程' }} · PID {{ item.pid }}</template>
        <template v-else>没有进程占用</template>
      </span>
      <span v-if="item.configured && item.configured !== item.port" class="port-note">
        运行配置里是 {{ item.configured }}
      </span>
    </div>
  </div>
</template>

<script setup lang="ts">
  import { computed } from 'vue'
  import StatusBadge from '@/components/StatusBadge.vue'
  import type { ShellCrashPortEntry } from '@/api/shellcrashConfig'

  const props = defineProps<{
    /** The ports the router reported. */
    ports: ShellCrashPortEntry[]
    /** The port the running configuration uses, keyed by the default port. */
    configured: Record<string, number>
  }>()

  /** What the five ShellCrash ports are for. */
  const META: Record<number, { label: string; hint: string }> = {
    7890: { label: '混合端口', hint: 'HTTP + SOCKS 手动代理' },
    7892: { label: '透明代理 TCP', hint: 'redir 模式劫持 TCP' },
    7893: { label: '透明代理 UDP', hint: 'tproxy 模式劫持 UDP' },
    1053: { label: '核心 DNS', hint: '核心的 DNS 监听端口' },
    9999: { label: '控制面板 API', hint: '面板与策略切换接口' }
  }

  const items = computed(() =>
    props.ports.map((entry) => {
      const meta = META[entry.port] ?? { label: `端口 ${entry.port}`, hint: 'ShellCrash 端口' }
      return {
        port: entry.port,
        label: meta.label,
        hint: meta.hint,
        listening: entry.listening,
        pid: entry.pid,
        process: entry.process,
        configured: props.configured[String(entry.port)] ?? 0
      }
    })
  )
</script>

<style scoped>
  .port-grid {
    display: grid;
    grid-template-columns: repeat(5, minmax(0, 1fr));
    gap: var(--space-3);
  }

  .port-cell {
    display: flex;
    flex-direction: column;
    gap: 4px;
    padding: 12px 14px;
    background: var(--surface-2);
    border: 1px solid transparent;
    border-radius: var(--radius);
  }

  .port-cell.is-live {
    border-color: color-mix(in srgb, var(--success) 26%, transparent);
  }

  .port-top {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
  }

  .port-num {
    color: var(--text);
    font-size: var(--text-lg);
    font-weight: 600;
  }

  .port-label {
    color: var(--text);
    font-size: var(--text-sm);
    font-weight: 500;
  }

  .port-hint {
    color: var(--text-muted);
    font-size: 11px;
    line-height: 1.5;
  }

  .port-owner {
    color: var(--text-secondary);
    font-size: 11.5px;
  }

  .port-cell.is-idle .port-owner {
    color: var(--text-faint);
  }

  .port-note {
    color: var(--warning-text);
    font-size: 10.5px;
  }

  @media (max-width: 1180px) {
    .port-grid {
      grid-template-columns: repeat(3, minmax(0, 1fr));
    }
  }

  @media (max-width: 640px) {
    .port-grid {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  }
</style>
