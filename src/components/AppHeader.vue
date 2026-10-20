<template>
  <header class="app-header">
    <div class="header-left">
      <button class="icon-btn mobile-only" aria-label="打开菜单" @click="$emit('menu')">
        <Menu :size="19" />
      </button>
      <button class="icon-btn desktop-only" aria-label="收起侧栏" @click="$emit('toggle')">
        <PanelLeftClose :size="18" />
      </button>
      <nav class="crumbs" aria-label="面包屑">
        <span class="crumb-group">OpenWrt</span>
        <ChevronRight :size="13" class="crumb-sep" />
        <span class="crumb-current">{{ title }}</span>
      </nav>
    </div>

    <div class="header-right">
      <span class="pill is-live desktop-only">
        <span class="live-dot" />
        实时监控
      </span>
      <button
        class="icon-btn"
        :class="{ 'is-spinning': spinning }"
        aria-label="刷新数据"
        title="刷新数据"
        @click="refresh"
      >
        <RefreshCw :size="17" />
      </button>
      <button
        class="icon-btn"
        :aria-label="isDark ? '切换到浅色模式' : '切换到深色模式'"
        :title="isDark ? '切换到浅色模式' : '切换到深色模式'"
        @click="toggleTheme"
      >
        <Sun v-if="isDark" :size="17" />
        <Moon v-else :size="17" />
      </button>

      <div class="header-divider" />

      <el-dropdown trigger="click" @command="onCommand">
        <button class="user-chip" aria-label="用户菜单">
          <span class="avatar">R</span>
          <span class="user-name desktop-only">root</span>
          <ChevronDown :size="14" class="chev" />
        </button>
        <template #dropdown>
          <el-dropdown-menu>
            <el-dropdown-item command="logout">
              <LogOut :size="15" />
              退出登录
            </el-dropdown-item>
          </el-dropdown-menu>
        </template>
      </el-dropdown>
    </div>
  </header>
</template>

<script setup lang="ts">
  import { computed, ref } from 'vue'
  import { useRoute, useRouter } from 'vue-router'
  import {
    ChevronDown,
    ChevronRight,
    LogOut,
    Menu,
    Moon,
    PanelLeftClose,
    RefreshCw,
    Sun
  } from 'lucide-vue-next'
  import { useTheme } from '@/composables/useTheme'
  import { triggerRefresh } from '@/composables/useRefresh'
  import { logout } from '@/stores/session'

  defineEmits<{
    menu: []
    toggle: []
  }>()

  const route = useRoute()
  const router = useRouter()
  const { isDark, toggleTheme } = useTheme()
  const spinning = ref(false)

  const title = computed(() => (route.meta.title as string) || '控制台')

  function refresh(): void {
    spinning.value = true
    triggerRefresh()
    window.setTimeout(() => {
      spinning.value = false
    }, 700)
  }

  async function onCommand(command: string): Promise<void> {
    if (command === 'logout') {
      await logout()
      await router.replace({ name: 'login' })
    }
  }
</script>

<style scoped>
  .app-header {
    position: sticky;
    top: 0;
    z-index: 50;
    display: flex;
    align-items: center;
    justify-content: space-between;
    height: var(--header-h);
    padding: 0 24px;
    background: color-mix(in srgb, var(--surface) 88%, transparent);
    border-bottom: 1px solid var(--border);
    backdrop-filter: saturate(180%) blur(12px);
  }

  .header-left,
  .header-right {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .header-left {
    min-width: 0;
  }

  .crumbs {
    display: flex;
    align-items: center;
    gap: 6px;
    margin-left: 4px;
    font-size: var(--text-sm);
  }

  .crumb-group {
    color: var(--text-muted);
  }

  .crumb-sep {
    color: var(--text-faint);
  }

  .crumb-current {
    color: var(--text);
    font-weight: 500;
  }

  .header-divider {
    width: 1px;
    height: 22px;
    margin: 0 4px;
    background: var(--border-strong);
  }

  .user-chip {
    display: flex;
    align-items: center;
    gap: 8px;
    height: 36px;
    padding: 0 8px 0 4px;
    cursor: pointer;
    background: transparent;
    border: 0;
    border-radius: var(--radius);
  }

  .user-chip:hover {
    background: var(--surface-2);
  }

  .avatar {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 28px;
    height: 28px;
    color: var(--brand-text);
    font-size: 12px;
    font-weight: 600;
    background: var(--brand-soft);
    border-radius: 50%;
  }

  .user-name {
    color: var(--text-secondary);
    font-size: var(--text-sm);
    font-weight: 500;
  }

  .chev {
    color: var(--text-faint);
  }

  .mobile-only {
    display: none;
  }

  @media (max-width: 900px) {
    .app-header {
      padding: 0 16px;
    }

    .mobile-only {
      display: inline-flex;
    }

    .desktop-only {
      display: none;
    }
  }

  @media (max-width: 640px) {
    .app-header {
      padding: 0 12px;
    }

    .crumbs {
      margin-left: 0;
    }

    .header-divider {
      display: none;
    }
  }
</style>
