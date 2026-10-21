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
      <nav v-if="tabs.length > 1" class="workspace-tabs" :aria-label="`${workspace?.label || ''}工作区`">
        <div class="workspace-tabs-inner">
          <RouterLink
            v-for="tab in tabs"
            :key="tab.name"
            :to="{ name: tab.name }"
            class="workspace-tab"
            exact-active-class="is-active"
          >
            {{ tab.label }}
          </RouterLink>
        </div>
      </nav>
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
  import { computed, ref, watch } from 'vue'
  import { RouterLink, RouterView, useRoute } from 'vue-router'
  import AppSidebar from '@/components/AppSidebar.vue'
  import AppHeader from '@/components/AppHeader.vue'
  import { workspaceOf } from '@/navigation'

  const STORAGE_KEY = 'owrt-sidebar-collapsed'
  const collapsed = ref(localStorage.getItem(STORAGE_KEY) === '1')
  const mobileOpen = ref(false)
  const route = useRoute()

  /** The workspace owns several pages; the tab strip switches between them. */
  const workspace = computed(() => workspaceOf(route.name))
  const tabs = computed(() => workspace.value?.tabs ?? [])

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

  /* The tab strip belongs to the workspace, not to a single page: it sits
     between the header and the content and stays put while the page scrolls. */
  .workspace-tabs {
    position: sticky;
    top: var(--header-h);
    z-index: 40;
    flex-shrink: 0;
    /* Opaque on purpose: the strip is sticky, and a translucent background
       lets the page title show through while it scrolls underneath. */
    background: var(--surface);
    border-bottom: 1px solid var(--border);
  }

  .workspace-tabs-inner {
    display: flex;
    gap: 4px;
    max-width: var(--content-max);
    padding: 0 24px;
    margin: 0 auto;
    overflow-x: auto;
    scrollbar-width: none;
  }

  .workspace-tabs-inner::-webkit-scrollbar {
    display: none;
  }

  .workspace-tab {
    position: relative;
    display: inline-flex;
    align-items: center;
    height: 40px;
    padding: 0 10px;
    color: var(--text-muted);
    font-size: var(--text-sm);
    font-weight: 500;
    text-decoration: none;
    white-space: nowrap;
    transition: color 0.16s ease;
  }

  .workspace-tab:hover {
    color: var(--text);
    text-decoration: none;
  }

  .workspace-tab.is-active {
    color: var(--brand-text);
  }

  .workspace-tab.is-active::after {
    position: absolute;
    right: 10px;
    bottom: -1px;
    left: 10px;
    height: 2px;
    content: '';
    background: var(--brand);
    border-radius: 2px 2px 0 0;
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
    .workspace-tabs-inner {
      padding: 0 16px;
    }

    .app-content {
      padding: 16px;
    }

    .app-footer {
      padding: 0 16px 20px;
    }
  }
</style>
