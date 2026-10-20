<template>
  <section class="card">
    <header v-if="title || $slots.actions" class="card-head">
      <div class="card-head-main">
        <h2 class="card-title">{{ title }}</h2>
        <p v-if="subtitle" class="card-sub">{{ subtitle }}</p>
      </div>
      <div v-if="$slots.actions" class="card-actions">
        <slot name="actions" />
      </div>
    </header>
    <div class="card-body" :class="{ flush }">
      <slot />
    </div>
    <footer v-if="$slots.footer" class="card-footer">
      <slot name="footer" />
    </footer>
  </section>
</template>

<script setup lang="ts">
  defineProps<{
    title?: string
    subtitle?: string
    flush?: boolean
  }>()
</script>
