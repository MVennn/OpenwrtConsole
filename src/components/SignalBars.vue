<template>
  <span class="signal" :class="`level-${level}`" :title="title">
    <i v-for="n in 4" :key="n" :class="{ on: n <= level }" />
  </span>
</template>

<script setup lang="ts">
  import { computed } from 'vue'

  const props = defineProps<{
    level: number
    dbm?: number
  }>()

  const title = computed(() => (props.dbm === undefined ? '信号未知' : `${props.dbm} dBm`))
</script>

<style scoped>
  .signal {
    display: inline-flex;
    align-items: flex-end;
    gap: 2px;
    height: 14px;
  }

  .signal i {
    display: block;
    width: 3px;
    background: var(--border-strong);
    border-radius: 1px;
  }

  .signal i:nth-child(1) {
    height: 5px;
  }

  .signal i:nth-child(2) {
    height: 8px;
  }

  .signal i:nth-child(3) {
    height: 11px;
  }

  .signal i:nth-child(4) {
    height: 14px;
  }

  .signal i.on {
    background: var(--success);
  }

  .signal.level-2 i.on {
    background: var(--warning);
  }

  .signal.level-1 i.on {
    background: var(--danger);
  }
</style>
