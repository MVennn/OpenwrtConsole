import type { ShellCrashProxy } from '@/api/types'

const GROUP_TYPES = ['Selector', 'URLTest', 'Fallback', 'LoadBalance']

export function isProxyGroup(proxy: ShellCrashProxy | undefined): boolean {
  return Boolean(proxy && GROUP_TYPES.includes(proxy.type))
}

/** Main routing group first, regional/test groups last. */
export function groupRank(name: string): number {
  if (/节点选择/.test(name)) return 0
  if (/手动切换/.test(name)) return 1
  if (/GLOBAL/.test(name)) return 2
  if (/AI|人工智能/.test(name)) return 3
  return 9
}

export function pickPrimaryGroup(
  proxies: Record<string, ShellCrashProxy>
): ShellCrashProxy | undefined {
  const groups = Object.values(proxies).filter(isProxyGroup)
  if (!groups.length) return undefined
  return [...groups].sort(
    (a, b) => groupRank(a.name) - groupRank(b.name) || a.name.localeCompare(b.name)
  )[0]
}

/** Follows nested selectors (节点选择 -> 自动选择 -> 日本) to the real exit. */
export function resolveNode(
  proxies: Record<string, ShellCrashProxy>,
  name: string | undefined,
  depth = 0
): string {
  if (!name || depth > 6) return name || ''
  const proxy = proxies[name]
  if (!proxy) return name
  if (isProxyGroup(proxy) && proxy.now) return resolveNode(proxies, proxy.now, depth + 1)
  return name
}
