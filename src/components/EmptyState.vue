<template>
  <div class="empty-state">
    <component :is="icon" :size="28" :stroke-width="1.5" />
    <p class="empty-title">{{ title }}</p>
    <p v-if="description" class="empty-desc">{{ description }}</p>
    <slot />
  </div>
</template>

<script setup lang="ts">
  import type { Component } from 'vue'
  import { Inbox } from 'lucide-vue-next'

  withDefaults(
    defineProps<{
      title: string
      description?: string
      icon?: Component
    }>(),
    { description: '', icon: () => Inbox }
  )
</script>
