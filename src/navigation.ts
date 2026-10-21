import type { Component } from 'vue'
import {
  Activity,
  ChartLine,
  LayoutDashboard,
  Network,
  ServerCog,
  Settings,
  Shield,
  ShieldCheck,
  Smartphone,
  Wifi
} from 'lucide-vue-next'

/**
 * One entry in the sidebar, with the pages it owns as tabs.
 *
 * The console has more pages than a vertical dock can show without turning
 * into a scroll list, and most of them are two halves of the same task
 * (read the state, then change it). A workspace keeps them under one entry
 * and switches between them with a tab strip, while every page keeps its own
 * route so deep links and the browser back button still work.
 */
export interface WorkspaceTab {
  /** Route name, must exist in `src/router/index.ts`. */
  name: string
  label: string
}

export interface Workspace {
  key: string
  label: string
  icon: Component
  /** The first tab is the default target of the sidebar entry. */
  tabs: WorkspaceTab[]
}

export const WORKSPACES: Workspace[] = [
  {
    key: 'overview',
    label: '概览',
    icon: LayoutDashboard,
    tabs: [{ name: 'dashboard', label: '概览' }]
  },
  {
    key: 'monitor',
    label: '监控',
    icon: ChartLine,
    tabs: [{ name: 'config-monitor', label: '监控与流量' }]
  },
  {
    key: 'network',
    label: '网络',
    icon: Network,
    tabs: [
      { name: 'network', label: '接口状态' },
      { name: 'config-network', label: '网络配置' },
      { name: 'dns', label: 'DNS' }
    ]
  },
  {
    key: 'wireless',
    label: '无线',
    icon: Wifi,
    tabs: [
      { name: 'wireless', label: '射频与终端' },
      { name: 'config-wireless', label: '无线配置' }
    ]
  },
  {
    key: 'clients',
    label: '客户端',
    icon: Smartphone,
    tabs: [{ name: 'clients', label: '客户端' }]
  },
  {
    key: 'firewall',
    label: '防火墙',
    icon: Shield,
    tabs: [{ name: 'config-firewall', label: '防火墙配置' }]
  },
  {
    key: 'proxy',
    label: '代理',
    icon: ShieldCheck,
    tabs: [
      { name: 'proxy', label: '运行状态' },
      { name: 'config-shellcrash', label: 'ShellCrash 设置' }
    ]
  },
  {
    key: 'system',
    label: '系统',
    icon: Settings,
    tabs: [
      { name: 'system', label: '运行状态' },
      { name: 'config-system', label: 'DHCP 与设置' }
    ]
  },
  {
    key: 'operations',
    label: '运维',
    icon: ServerCog,
    tabs: [
      { name: 'operations', label: '服务运维' },
      { name: 'config-packages', label: '软件包' },
      { name: 'config-firmware', label: '固件升级' }
    ]
  },
  {
    key: 'diagnostics',
    label: '诊断',
    icon: Activity,
    tabs: [{ name: 'diagnostics', label: '诊断工具' }]
  }
]

/** The workspace that owns a route, or `undefined` for standalone pages. */
export function workspaceOf(routeName: unknown): Workspace | undefined {
  if (typeof routeName !== 'string') return undefined
  return WORKSPACES.find((workspace) =>
    workspace.tabs.some((tab) => tab.name === routeName)
  )
}
