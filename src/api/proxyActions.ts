import { cgiGet, getSessionId } from './ubus'

const CGI = '/cgi-bin/modern-proxy'

/**
 * The console may only act on proxy names the CGI accepts: printable text
 * without quotes, backslashes, slashes or "..". Real group and node names
 * carry emoji, flags, CJK, "#" and spaces, so those stay switchable; the CGI
 * additionally verifies that the group exists and owns the node.
 */
export const PROXY_NAME_PATTERN = /^[^"\\/\u0000-\u001f\u007f]{1,64}$/

export function isProxyNameAllowed(name: string): boolean {
  if (!name || name.length > 64) return false
  if (name.includes('..')) return false
  return PROXY_NAME_PATTERN.test(name)
}

/** Latency probe target; the CGI only accepts this fixed whitelist. */
export const DELAY_TEST_URL = 'http://www.gstatic.com/generate_204'

/** CGI error codes mapped to readable Chinese text. */
const ERROR_TEXT: Record<string, string> = {
  unauthorized: '登录状态已失效，请重新登录',
  'bad path': '请求路径不合法',
  'invalid group name': '组名包含不支持的字符，无法切换',
  'invalid node name': '节点名包含不支持的字符，无法切换',
  'invalid name': '名称包含不支持的字符',  'group not found': '策略组不存在或已失效',
  'node not in group': '该节点不属于此策略组',
  'missing group or node': '请求参数不完整',
  'url not allowed': '测速地址不在允许列表中',
  'shellcrash not configured': 'ShellCrash 尚未配置'
}

function explain(code: string | undefined, fallback: string): string {
  if (!code) return fallback
  return ERROR_TEXT[code] || fallback
}

export interface ProxyGroupDetail {
  type?: string
  now?: string
  all?: string[]
  history?: Array<{ time: string; delay: number }>
}

export interface ProxySwitchResult {
  ok: boolean
  group?: string
  node?: string
  error?: string
}

/** Reads one proxy group (its member list and current node) from mihomo. */
export async function fetchProxyGroup(name: string): Promise<ProxyGroupDetail> {
  const data = await cgiGet<ProxyGroupDetail>(
    `${CGI}?path=${encodeURIComponent(`/proxies/${name}`)}`
  )
  return data ?? {}
}

/** Runs a latency test for a single node; null means "no answer". */
export async function fetchProxyDelay(
  name: string,
  url: string = DELAY_TEST_URL
): Promise<number | null> {
  const data = await cgiGet<{ delay?: number; message?: string }>(
    `${CGI}?path=${encodeURIComponent(`/proxies/${name}/delay`)}&url=${encodeURIComponent(url)}`
  )
  if (typeof data?.delay === 'number') return data.delay
  return null
}

/**
 * Switches a proxy group to another node. The CGI re-reads the group from
 * mihomo and refuses the request when the node does not belong to it.
 */
export async function switchProxyNode(
  group: string,
  node: string
): Promise<ProxySwitchResult> {
  const sid = getSessionId()
  if (!sid) {
    window.dispatchEvent(new Event('owrt:session-expired'))
    throw new Error(ERROR_TEXT.unauthorized)
  }

  let response: Response
  try {
    response = await fetch(`${CGI}?sid=${encodeURIComponent(sid)}`, {
      method: 'POST',
      credentials: 'same-origin',
      cache: 'no-store',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ group, node })
    })
  } catch {
    throw new Error('无法连接路由器，请检查网络连接')
  }

  if (response.status === 401) {
    window.dispatchEvent(new Event('owrt:session-expired'))
    throw new Error(ERROR_TEXT.unauthorized)
  }

  const text = await response.text()
  let payload: ProxySwitchResult | null = null
  if (text) {
    try {
      payload = JSON.parse(text) as ProxySwitchResult
    } catch {
      payload = null
    }
  }

  if (!response.ok) {
    throw new Error(explain(payload?.error, `切换失败（HTTP ${response.status}）`))
  }
  if (payload && payload.ok === false) {
    throw new Error(explain(payload.error, '切换失败'))
  }
  return payload ?? { ok: true }
}
