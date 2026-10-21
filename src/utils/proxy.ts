import type { ShellCrashProxy } from '@/api/types'

const GROUP_TYPES = ['Selector', 'URLTest', 'Fallback', 'LoadBalance']

/** mihomo 内置的全局选择器，不是用户配置的策略组；界面里不展示。 */
const HIDDEN_GROUPS = new Set(['GLOBAL'])

/** Type order for {@link pickPrimaryGroup}: the main group is a Selector. */
const TYPE_RANK: Record<string, number> = {
  Selector: 0,
  URLTest: 1,
  Fallback: 2,
  LoadBalance: 3
}

export function isProxyGroup(proxy: ShellCrashProxy | undefined): boolean {
  return Boolean(proxy && GROUP_TYPES.includes(proxy.type))
}

/** 策略组列表 / 主分组选择用；排除 GLOBAL 这类内置项。 */
export function isVisibleGroup(proxy: ShellCrashProxy | undefined): boolean {
  return isProxyGroup(proxy) && !HIDDEN_GROUPS.has(proxy?.name || '')
}

/**
 * Names subscriptions give their main routing group: "节点选择", "Proxy",
 * "Select", … None of these words names a region.
 */
const PRIMARY_GROUP_NAME = /节点选择|选择节点|proxy|select|代理/iu

/**
 * A bare "节点" is the generic name of the main group; with a region in front
 * of it ("香港节点") it is a regional group. Only the position after a
 * non-letter counts as bare, so a flag emoji or a separator still matches.
 */
const BARE_NODE_NAME = /(^|[^\p{L}])节点$/u

/** Main routing group first, regional/test groups last. */
export function groupRank(name: string): number {
  const text = (name || '').trim()
  if (!text) return 9
  if (PRIMARY_GROUP_NAME.test(text) || BARE_NODE_NAME.test(text)) return 0
  if (/手动切换|手动选择|manual/iu.test(text)) return 1
  if (/global/i.test(text)) return 2
  if (/(^|[^a-z])ai([^a-z]|$)|人工智能/i.test(text.toLowerCase())) return 3
  return 9
}

/**
 * The group the UI treats as the exit of the proxy: a Selector first (it is
 * the group the user switches), then the automatic types, and within one type
 * the main routing group before the regional and test groups. A regional
 * group must never win just because its name sorts first.
 */
export function pickPrimaryGroup(
  proxies: Record<string, ShellCrashProxy>
): ShellCrashProxy | undefined {
  const groups = Object.values(proxies).filter(isVisibleGroup)
  if (!groups.length) return undefined
  return [...groups].sort(
    (a, b) =>
      (TYPE_RANK[a.type] ?? 9) - (TYPE_RANK[b.type] ?? 9) ||
      groupRank(a.name) - groupRank(b.name) ||
      a.name.localeCompare(b.name)
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
