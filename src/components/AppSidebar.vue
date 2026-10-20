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
      <template v-for="group in groups" :key="group.label">
        <p v-if="showText" class="nav-label">{{ group.label }}</p>
        <RouterLink
          v-for="item in group.items"
          :key="item.name"
          :to="{ name: item.name }"
          class="nav-item"
          active-class="is-active"
          :title="collapsed ? item.label : undefined"
        >
          <component :is="item.icon" :size="18" :stroke-width="1.9" />
          <span v-if="showText">{{ item.label }}</span>
        </RouterLink>
      </template>
    </nav>

    <div class="sidebar-foot">
      <div v-if="showText" class="router-card">
        <div class="router-card-head">
          <span class="router-dot" />
          <span>管理连接</span>
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
  import { computed } from 'vue'
  import { RouterLink } from 'vue-router'
  import { useLuciAvailability } from '@/composables/useLuciAvailability'
  import { useMediaQuery } from '@/composables/useMediaQuery'
  import {
    Activity,
    ChartLine,
    ChevronLeft,
    ExternalLink,
    Globe,
    LayoutDashboard,
    Network,
    Package,
    RadioTower,
    Rocket,
    Router as RouterIcon,
    ServerCog,
    Settings,
    Shield,
    ShieldCheck,
    SlidersHorizontal,
    Smartphone,
    Wand2,
    Wifi,
    Wrench,
    Zap,
    X
  } from 'lucide-vue-next'

  const props = defineProps<{
    collapsed: boolean
    mobileOpen: boolean
  }>()

  defineEmits<{
    toggle: []
    close: []
  }>()

  const isMobile = useMediaQuery('(max-width: 900px)')
  const showText = computed(() => !props.collapsed || isMobile.value)

  const host = window.location.host
  const luciUrl = `${window.location.protocol}//${host}/cgi-bin/luci/`
  /** Not every image carries LuCI; the emergency entry is only offered when it does. */
  const luciAvailable = useLuciAvailability()

  const groups = [
    {
      label: '状态',
      items: [
        { name: 'dashboard', label: '概览', icon: LayoutDashboard },
        { name: 'config-monitor', label: '监控与流量', icon: ChartLine }
      ]
    },
    {
      label: '网络',
      items: [
        { name: 'network', label: '网络', icon: Network },
        { name: 'wireless', label: '无线', icon: Wifi },
        { name: 'clients', label: '客户端', icon: Smartphone },
        { name: 'dns', label: 'DNS', icon: Globe },
        { name: 'config-network', label: '网络配置', icon: SlidersHorizontal },
        { name: 'config-wireless', label: '无线配置', icon: RadioTower },
        { name: 'config-firewall', label: '防火墙配置', icon: Shield }
      ]
    },
    {
      label: '服务',
      items: [
        { name: 'proxy', label: '代理', icon: ShieldCheck },
        { name: 'config-shellcrash', label: 'ShellCrash', icon: Zap },
        { name: 'diagnostics', label: '诊断', icon: Activity }
      ]
    },
    {
      label: '系统',
      items: [
        { name: 'system', label: '系统', icon: Settings },
        { name: 'config-system', label: '系统设置', icon: Wrench },
        { name: 'config-packages', label: '软件包管理', icon: Package },
        { name: 'config-firmware', label: '固件升级', icon: Rocket },
        { name: 'operations', label: '服务运维', icon: ServerCog },
        { name: 'setup', label: '首次配置', icon: Wand2 }
      ]
    }
  ]
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
    padding: 8px 12px;
    overflow-y: auto;
  }

  .nav-label {
    padding: 8px 10px 6px;
    color: var(--text-faint);
    font-size: 11px;
    font-weight: 500;
    letter-spacing: 0.08em;
  }

  .nav-item {
    display: flex;
    align-items: center;
    gap: 10px;
    height: 40px;
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
    padding: 8px 10px;
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
      padding: 8px 12px;
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
