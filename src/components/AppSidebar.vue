<template>
  <aside class="sidebar" :class="{ collapsed, 'mobile-open': mobileOpen }">
    <div class="brand">
      <div class="brand-mark">
        <RouterIcon :size="20" :stroke-width="2" />
      </div>
      <div v-if="showText" class="brand-text">
        <span class="brand-name">OpenWrt</span>
        <span class="brand-sub">Console</span>
      </div>
      <button class="icon-btn brand-close mobile-only" aria-label="关闭菜单" @click="$emit('close')">
        <X :size="18" />
      </button>
    </div>

    <nav class="nav" aria-label="主导航">
      <RouterLink
        v-for="workspace in workspaces"
        :key="workspace.key"
        :to="{ name: workspace.tabs[0].name }"
        class="nav-item"
        :class="{ 'is-active': activeKey === workspace.key }"
        :title="collapsed ? workspace.label : undefined"
      >
        <component :is="workspace.icon" :size="18" :stroke-width="1.9" />
        <span v-if="showText">{{ workspace.label }}</span>
      </RouterLink>
    </nav>

    <div class="sidebar-foot">
      <div v-if="showText" class="router-card">
        <div class="router-card-head">
          <span class="router-dot" :class="{ offline: !online }" />
          <span>{{ online ? '管理连接' : '网络已断开' }}</span>
        </div>
        <p class="router-address mono">{{ host }}</p>
        <a v-if="luciAvailable" class="router-link" :href="luciUrl">
          应急入口：LuCI
          <ExternalLink :size="12" />
        </a>
        <p class="router-hint">
          {{ luciAvailable ? '仅在控制台不可用时使用' : 'LuCI 未安装' }}
        </p>
      </div>
      <button
        class="collapse-btn desktop-only"
        :aria-label="collapsed ? '展开侧栏' : '收起侧栏'"
        @click="$emit('toggle')"
      >
        <ChevronLeft :size="16" :class="{ flip: collapsed }" />
        <span v-if="!collapsed">收起</span>
      </button>
    </div>
  </aside>
</template>

<script setup lang="ts">
  import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
  import { RouterLink, useRoute } from 'vue-router'
  import { ChevronLeft, ExternalLink, Router as RouterIcon, X } from 'lucide-vue-next'
  import { useLuciAvailability } from '@/composables/useLuciAvailability'
  import { useMediaQuery } from '@/composables/useMediaQuery'
  import { WORKSPACES, workspaceOf } from '@/navigation'

  const props = defineProps<{
    collapsed: boolean
    mobileOpen: boolean
  }>()

  defineEmits<{
    toggle: []
    close: []
  }>()

  const route = useRoute()
  const isMobile = useMediaQuery('(max-width: 900px)')
  const showText = computed(() => !props.collapsed || isMobile.value)

  const host = window.location.host
  const luciUrl = `${window.location.protocol}//${host}/cgi-bin/luci/`
  /** Not every image carries LuCI; the emergency entry is only offered when it does. */
  const luciAvailable = useLuciAvailability()

  const workspaces = WORKSPACES
  const activeKey = computed(() => workspaceOf(route.name)?.key)

  /**
   * The dot used to be green no matter what, which made a broken uplink look
   * like a healthy management connection. It now follows the browser's own
   * online state — the router itself is checked by every page request.
   */
  const online = ref(navigator.onLine)

  function updateOnline(): void {
    online.value = navigator.onLine
  }

  onMounted(() => {
    window.addEventListener('online', updateOnline)
    window.addEventListener('offline', updateOnline)
  })

  onBeforeUnmount(() => {
    window.removeEventListener('online', updateOnline)
    window.removeEventListener('offline', updateOnline)
  })
</script>

<style scoped>
  .sidebar {
    display: flex;
    flex-direction: column;
    width: var(--sidebar-w);
    height: 100vh;
    background: var(--surface);
    border-right: 1px solid var(--border);
    transition: width 0.22s ease;
  }

  .sidebar.collapsed {
    width: var(--sidebar-w-collapsed);
  }

  .brand {
    display: flex;
    align-items: center;
    gap: 10px;
    height: var(--header-h);
    padding: 0 18px;
    flex-shrink: 0;
  }

  .brand-mark {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 34px;
    height: 34px;
    flex-shrink: 0;
    color: #fff;
    background: var(--brand);
    border-radius: var(--radius-md);
  }

  .brand-text {
    display: flex;
    flex-direction: column;
    min-width: 0;
    line-height: 1.15;
  }

  .brand-name {
    color: var(--text);
    font-size: 15px;
    font-weight: 600;
    letter-spacing: -0.01em;
  }

  .brand-sub {
    color: var(--text-muted);
    font-size: 11px;
    letter-spacing: 0.06em;
    text-transform: uppercase;
  }

  .brand-close {
    margin-left: auto;
  }

  .nav {
    display: flex;
    flex: 1;
    flex-direction: column;
    gap: 2px;
    padding: 10px 12px;
    overflow-y: auto;
  }

  .nav-item {
    display: flex;
    align-items: center;
    gap: 10px;
    height: 42px;
    padding: 0 10px;
    color: var(--text-secondary);
    font-size: var(--text-sm);
    font-weight: 500;
    text-decoration: none;
    border-radius: var(--radius);
    transition:
      color 0.16s ease,
      background-color 0.16s ease;
  }

  .nav-item:hover {
    color: var(--text);
    text-decoration: none;
    background: var(--surface-2);
  }

  .nav-item.is-active {
    color: var(--brand-text);
    background: var(--brand-soft);
  }

  .sidebar.collapsed .nav {
    align-items: center;
    padding: 10px;
  }

  .sidebar.collapsed .nav-item {
    justify-content: center;
    width: 44px;
    padding: 0;
  }

  .sidebar-foot {
    flex-shrink: 0;
    padding: 12px;
  }

  .router-card {
    padding: 12px;
    background: var(--surface-3);
    border: 1px solid var(--border);
    border-radius: var(--radius-md);
  }

  .router-card-head {
    display: flex;
    align-items: center;
    gap: 6px;
    color: var(--text-secondary);
    font-size: var(--text-xs);
    font-weight: 500;
  }

  .router-dot {
    width: 6px;
    height: 6px;
    background: var(--success);
    border-radius: 50%;
  }

  .router-dot.offline {
    background: var(--danger);
  }

  .router-address {
    margin-top: 4px;
    color: var(--text);
    font-size: 12.5px;
  }

  .router-link {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    margin-top: 8px;
    color: var(--text-muted);
    font-size: 11.5px;
    font-weight: 500;
    text-decoration: none;
    transition: color 0.16s ease;
  }

  .router-link:hover {
    color: var(--text-secondary);
    text-decoration: underline;
  }

  .router-hint {
    margin-top: 2px;
    color: var(--text-faint);
    font-size: 10.5px;
    line-height: 1.5;
  }

  .collapse-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    width: 100%;
    height: 34px;
    margin-top: 8px;
    color: var(--text-muted);
    font-size: var(--text-xs);
    cursor: pointer;
    background: transparent;
    border: 0;
    border-radius: var(--radius);
  }

  .collapse-btn:hover {
    color: var(--text);
    background: var(--surface-2);
  }

  .collapse-btn svg {
    transition: transform 0.2s ease;
  }

  .collapse-btn svg.flip {
    transform: rotate(180deg);
  }

  .mobile-only {
    display: none;
  }

  @media (max-width: 900px) {
    .sidebar {
      position: fixed;
      top: 0;
      left: 0;
      z-index: 60;
      height: 100dvh;
      box-shadow: var(--shadow-md);
      transform: translateX(-100%);
      transition: transform 0.24s ease;
    }

    .sidebar.mobile-open {
      transform: none;
    }

    .sidebar.collapsed {
      width: var(--sidebar-w);
    }

    .sidebar.collapsed .nav {
      align-items: stretch;
      padding: 10px 12px;
    }

    .sidebar.collapsed .nav-item {
      justify-content: flex-start;
      width: auto;
      padding: 0 10px;
    }

    .mobile-only {
      display: inline-flex;
    }

    .desktop-only {
      display: none;
    }
  }
</style>
