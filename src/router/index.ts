import { createRouter, createWebHashHistory } from 'vue-router'
import { ElMessage } from 'element-plus'
import { clearSession, useSession, validateSession } from '@/stores/session'

const CHUNK_ERROR_PATTERNS = [
  'Failed to fetch dynamically imported module',
  'Loading chunk',
  'Importing a module script failed'
]

/**
 * After a redeploy the hashed chunk names change. A tab that still holds the
 * previous index.html would fail to load its route chunk, so reload with a
 * cache-busting query instead of showing a broken page.
 */
function handleChunkError(error: unknown): void {
  const message = String((error as Error)?.message || error)
  if (!CHUNK_ERROR_PATTERNS.some((pattern) => message.includes(pattern))) return

  const url = new URL(window.location.href)
  if (url.searchParams.has('_reload')) {
    ElMessage.error('页面资源已更新，请手动刷新浏览器')
    return
  }
  url.searchParams.set('_reload', Date.now().toString())
  window.location.replace(url.toString())
}

const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    {
      path: '/login',
      name: 'login',
      component: () => import('@/views/LoginView.vue'),
      meta: { title: '登录', public: true }
    },
    {
      path: '/',
      component: () => import('@/layouts/AppLayout.vue'),
      children: [
        { path: '', redirect: '/dashboard' },
        {
          path: 'dashboard',
          name: 'dashboard',
          component: () => import('@/views/DashboardView.vue'),
          meta: { title: '概览', group: '状态' }
        },
        {
          path: 'network',
          name: 'network',
          component: () => import('@/views/NetworkView.vue'),
          meta: { title: '网络', group: '网络' }
        },
        {
          path: 'wireless',
          name: 'wireless',
          component: () => import('@/views/WirelessView.vue'),
          meta: { title: '无线', group: '网络' }
        },
        {
          path: 'clients',
          name: 'clients',
          component: () => import('@/views/ClientsView.vue'),
          meta: { title: '客户端', group: '网络' }
        },
        {
          path: 'dns',
          name: 'dns',
          component: () => import('@/views/dns/DnsView.vue'),
          meta: { title: 'DNS', group: '网络' }
        },
        {
          path: 'proxy',
          name: 'proxy',
          component: () => import('@/views/ProxyView.vue'),
          meta: { title: '代理', group: '服务' }
        },
        {
          path: 'diagnostics',
          name: 'diagnostics',
          component: () => import('@/views/diagnostics/DiagnosticsView.vue'),
          meta: { title: '诊断', group: '工具' }
        },
        {
          path: 'system',
          name: 'system',
          component: () => import('@/views/SystemView.vue'),
          meta: { title: '系统', group: '管理' }
        },
        {
          path: 'config/wireless',
          name: 'config-wireless',
          component: () => import('@/views/config/WirelessConfigView.vue'),
          meta: { title: '无线配置', group: '配置' }
        },
        {
          path: 'config/firewall',
          name: 'config-firewall',
          component: () => import('@/views/config/FirewallConfigView.vue'),
          meta: { title: '防火墙配置', group: '配置' }
        },
        {
          path: 'config/system',
          name: 'config-system',
          component: () => import('@/views/config/SystemSettingsView.vue'),
          meta: { title: '系统设置', group: '配置' }
        },
        {
          path: 'operations',
          name: 'operations',
          component: () => import('@/views/config/OperationsView.vue'),
          meta: { title: '服务运维', group: '系统' }
        },
        {
          path: 'config/network',
          name: 'config-network',
          component: () => import('@/views/config/NetworkConfigView.vue'),
          meta: { title: '网络配置', group: '配置' }
        },
        {
          path: 'config/packages',
          name: 'config-packages',
          component: () => import('@/views/config/PackagesView.vue'),
          meta: { title: '软件包管理', group: '系统' }
        },
        {
          path: 'config/firmware',
          name: 'config-firmware',
          component: () => import('@/views/config/FirmwareView.vue'),
          meta: { title: '固件升级', group: '系统' }
        },
        {
          path: 'config/shellcrash',
          name: 'config-shellcrash',
          component: () => import('@/views/config/ShellCrashView.vue'),
          meta: { title: 'ShellCrash 设置', group: '配置' }
        },
        {
          path: 'config/monitor',
          name: 'config-monitor',
          component: () => import('@/views/config/MonitorView.vue'),
          meta: { title: '监控与流量', group: '状态' }
        }
      ]
    },
    {
      path: '/setup',
      name: 'setup',
      component: () => import('@/views/setup/SetupWizardView.vue'),
      meta: { title: '首次配置' }
    },
    { path: '/:pathMatch(.*)*', redirect: '/dashboard' }
  ]
})

router.beforeEach(async (to) => {
  const session = useSession()

  if (to.meta.public) {
    if (session.sid && to.name === 'login') return { name: 'dashboard' }
    return true
  }

  if (!session.sid) {
    return { name: 'login', query: { redirect: to.fullPath } }
  }

  const valid = await validateSession()
  if (!valid) {
    return { name: 'login', query: { redirect: to.fullPath } }
  }

  return true
})

router.afterEach((to) => {
  const title = (to.meta.title as string) || '控制台'
  document.title = `${title} · OpenWrt Console`
})

window.addEventListener('owrt:session-expired', () => {
  clearSession()
  if (router.currentRoute.value.name !== 'login') {
    void router.replace({ name: 'login' })
  }
})

router.onError(handleChunkError)

export default router
