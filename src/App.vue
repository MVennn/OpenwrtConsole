<template>
  <RouterView />
</template>

<script setup lang="ts">
  import { RouterView } from 'vue-router'
  import { useBuildGuard } from '@/composables/useBuildGuard'

  useBuildGuard()
</script>
