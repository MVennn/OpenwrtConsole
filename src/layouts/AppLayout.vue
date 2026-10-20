<template>
  <div class="app-shell" :class="{ collapsed }">
    <div
      v-if="mobileOpen"
      class="sidebar-overlay"
      aria-hidden="true"
      @click="mobileOpen = false"
    />
    <AppSidebar :collapsed="collapsed" :mobile-open="mobileOpen" @toggle="toggle" @close="mobileOpen = false" />
    <div class="app-main">
      <AppHeader @menu="mobileOpen = true" @toggle="toggle" />
      <main class="app-content">
        <RouterView />
      </main>
      <footer class="app-footer">
        <span>OpenWrt Console</span>
        <span class="footer-sep">·</span>
        <span>本地管理界面</span>
      </footer>
    </div>
  </div>
</template>

<script setup lang="ts">
  import { ref, watch } from 'vue'
  import { RouterView, useRoute } from 'vue-router'
  import AppSidebar from '@/components/AppSidebar.vue'
  import AppHeader from '@/components/AppHeader.vue'

  const STORAGE_KEY = 'owrt-sidebar-collapsed'
  const collapsed = ref(localStorage.getItem(STORAGE_KEY) === '1')
  const mobileOpen = ref(false)
  const route = useRoute()

  function toggle(): void {
    collapsed.value = !collapsed.value
    localStorage.setItem(STORAGE_KEY, collapsed.value ? '1' : '0')
  }

  watch(
    () => route.name,
    () => {
      mobileOpen.value = false
    }
  )
</script>

<style scoped>
  .app-shell {
    display: flex;
    height: 100vh;
    overflow: hidden;
    background: var(--bg);
  }

  /* The main column is the scroll container so the sidebar and header stay
     put while long pages (clients, logs) scroll. */
  .app-main {
    display: flex;
    flex: 1;
    flex-direction: column;
    min-width: 0;
    height: 100vh;
    overflow-y: auto;
    overscroll-behavior: contain;
  }

  @supports (height: 100dvh) {
    .app-shell,
    .app-main {
      height: 100dvh;
    }
  }

  .app-content {
    flex: 1;
    width: 100%;
    padding: 24px;
  }

  .app-footer {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    padding: 0 24px 24px;
    color: var(--text-faint);
    font-size: 11.5px;
  }

  .app-footer a {
    color: var(--text-muted);
  }

  .footer-sep {
    color: var(--border-strong);
  }

  .sidebar-overlay {
    position: fixed;
    inset: 0;
    z-index: 55;
    background: rgba(15, 23, 42, 0.38);
    animation: overlay-in 0.18s ease both;
  }

  @keyframes overlay-in {
    from {
      opacity: 0;
    }
    to {
      opacity: 1;
    }
  }

  @media (max-width: 1180px) {
    .app-content {
      padding: 20px;
    }
  }

  @media (max-width: 640px) {
    .app-content {
      padding: 16px;
    }

    .app-footer {
      padding: 0 16px 20px;
    }
  }
</style>
