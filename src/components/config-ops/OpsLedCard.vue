<template>
  <div class="ops-leds">
    <ul v-if="leds.length" class="ops-led-list">
      <li v-for="led in leds" :key="led.name" class="ops-led-row">
        <span class="ops-dot" :class="led.on ? 'is-on' : 'is-off'" />
        <span class="ops-led-name mono truncate" :title="led.name">{{ led.name }}</span>
        <span class="ops-led-state" :class="led.on ? 'is-on' : 'is-off'">
          {{ led.on ? '点亮' : '熄灭' }}
        </span>
      </li>
    </ul>

    <EmptyState
      v-if="!leds.length"
      :icon="Lightbulb"
      title="没有指示灯信息"
      description="路由器未上报 LED 状态，该功能需要内核提供 LED 子系统。"
    />

    <p v-if="leds.length" class="ops-note">
      亮度取自路由器上报的 LED 状态，触发器为当前生效的触发规则。
    </p>
  </div>
</template>

<script setup lang="ts">
  import { Lightbulb } from 'lucide-vue-next'
  import EmptyState from '@/components/EmptyState.vue'
  import type { OpsLed } from '@/api/ops'

  defineProps<{
    leds: OpsLed[]
  }>()
</script>

<style scoped>
  .ops-led-list {
    padding: 0;
    margin: 0;
    list-style: none;
  }

  .ops-led-row {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 9px 0;
    border-bottom: 1px solid var(--border);
  }

  .ops-led-row:last-child {
    border-bottom: 0;
  }

  .ops-dot {
    width: 8px;
    height: 8px;
    flex-shrink: 0;
    border-radius: 50%;
  }

  .ops-dot.is-on {
    background: var(--success);
    box-shadow: 0 0 0 3px var(--success-soft);
  }

  .ops-dot.is-off {
    background: var(--text-faint);
  }

  .ops-led-name {
    flex: 1 1 auto;
    min-width: 0;
    color: var(--text);
    font-size: 12.5px;
  }

  .ops-led-state {
    flex-shrink: 0;
    font-size: 11.5px;
    font-weight: 500;
  }

  .ops-led-state.is-on {
    color: var(--success-text);
  }

  .ops-led-state.is-off {
    color: var(--text-muted);
  }

  .ops-note {
    margin-top: 12px;
    color: var(--text-muted);
    font-size: 11.5px;
    line-height: 1.6;
  }
</style>
