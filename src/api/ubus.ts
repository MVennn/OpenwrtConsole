const SID_KEY = 'owrt-sid'

export class SessionExpiredError extends Error {
  constructor() {
    super('登录状态已失效，请重新登录')
    this.name = 'SessionExpiredError'
  }
}

function sessionExpired(): never {
  window.dispatchEvent(new Event('owrt:session-expired'))
  throw new SessionExpiredError()
}

async function timedFetch(
  input: string,
  init: RequestInit = {},
  timeout = 10000
): Promise<Response> {
  const controller = new AbortController()
  const timer = window.setTimeout(() => controller.abort(), timeout)
  try {
    return await fetch(input, { ...init, signal: controller.signal })
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      throw new UbusError('请求超时，请检查路由器连接')
    }
    throw err
  } finally {
    window.clearTimeout(timer)
  }
}

export class UbusError extends Error {
  code?: number

  constructor(message: string, code?: number) {
    super(message)
    this.name = 'UbusError'
    this.code = code
  }
}

export function getSessionId(): string {
  return localStorage.getItem(SID_KEY) || sessionStorage.getItem(SID_KEY) || ''
}

export function setSessionId(sid: string): void {
  // localStorage survives reloads and new tabs; the ubus session itself has a
  // one-hour server-side expiry, so this is the authoritative client copy.
  if (sid) {
    localStorage.setItem(SID_KEY, sid)
    sessionStorage.removeItem(SID_KEY)
  } else {
    localStorage.removeItem(SID_KEY)
    sessionStorage.removeItem(SID_KEY)
  }
}

interface JsonRpcResponse {
  jsonrpc?: string
  id?: number
  result?: unknown[]
  error?: { code: number; message: string }
}

/**
 * Checks whether the session is still usable by calling `system.info`, which
 * every session may call. It tells a dead session apart from a single method
 * the session simply has no ACL for.
 */
async function sessionAlive(): Promise<boolean> {
  const sid = getSessionId()
  if (!sid) return false
  try {
    const response = await timedFetch('/ubus', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: Date.now(),
        method: 'call',
        params: [sid, 'system', 'info', {}]
      })
    })
    if (!response.ok) return false
    const data = (await response.json()) as JsonRpcResponse
    return !data.error && Array.isArray(data.result)
  } catch {
    return false
  }
}

/**
 * Calls a ubus object over uhttpd's /ubus endpoint using the LuCI session id.
 * The session id is created by /cgi-bin/modern-login and kept in sessionStorage.
 */
export async function ubusCall<T = unknown>(  object: string,
  method: string,
  params: Record<string, unknown> = {}
): Promise<T> {
  const sid = getSessionId()
  if (!sid) sessionExpired()

  let response: Response
  try {
    response = await timedFetch('/ubus', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: Date.now(),
        method: 'call',
        params: [sid, object, method, params]
      })
    })
  } catch (err) {
    if (err instanceof UbusError) throw err
    throw new UbusError('无法连接路由器，请检查网络连接')
  }

  if (!response.ok) {
    throw new UbusError(`路由器返回 HTTP ${response.status}`)
  }

  let data: JsonRpcResponse
  try {
    data = (await response.json()) as JsonRpcResponse
  } catch {
    // uhttpd answers with an HTML error page in some failure modes; without
    // this the caller gets a raw English SyntaxError.
    throw new UbusError('响应不是有效的 JSON')
  }

  if (data.error) {
    if (data.error.code === -32002) {
      // rpcd answers "Access denied" both for a dead session and for a method
      // the session has no ACL for. Only the first case may end the session,
      // otherwise a single restricted call would log the user out.
      if (!(await sessionAlive())) sessionExpired()
      throw new UbusError('当前会话没有执行该操作的权限', -32002)
    }
    throw new UbusError(data.error?.message || 'ubus 调用失败', data.error?.code)
  }

  const result = data.result
  if (!result || !Array.isArray(result) || result.length === 0) {
    throw new UbusError('ubus 返回了无法识别的响应')
  }

  const status = Number(result[0])
  const payload = result[1]
  if (status !== 0) {
    // libubus-obj.h 的现行顺序（OpenWrt 22.03+ 起含 METHOD_NOT_FOUND）：
    // 1 无效命令 / 2 参数错误 / 3 方法未找到 / 4 未找到 / 5 没有数据 /
    // 6 没有权限 / 7 超时 / 8 不支持。旧编号把 2-7 整体错位过，别照抄。
    const messages: Record<number, string> = {
      1: '无效命令',
      2: '参数错误',
      3: '方法未找到',
      4: '未找到（条目不存在）',
      5: '没有数据',
      6: '没有权限',
      7: '超时',
      8: '不支持的操作'
    }
    throw new UbusError(messages[status] || `ubus 调用失败（${status}）`, status)
  }

  return (payload ?? null) as T
}

// uci delete/rename 对不存在的条目返回 NOT_FOUND：新旧 ubus 编号分别是 4/3，
// 两个都要认，否则"删除一个本来就没有的选项"会被当成致命错误。
export function isNotFoundError(err: unknown): boolean {
  return err instanceof UbusError && (err.code === 3 || err.code === 4)
}

export async function cgiGet<T>(path: string): Promise<T> {
  const sid = getSessionId()
  if (!sid) sessionExpired()

  // uhttpd does not forward custom headers to CGI and self-signed HTTPS pages
  // may reject Secure cookies, so the validated sid travels in the query.
  const separator = path.includes('?') ? '&' : '?'
  const response = await timedFetch(`${path}${separator}sid=${encodeURIComponent(sid)}`, {
    credentials: 'same-origin',
    cache: 'no-store'
  })

  if (response.status === 401) sessionExpired()
  if (!response.ok) throw new UbusError(`请求失败（HTTP ${response.status}）`)

  const text = await response.text()
  if (!text) return null as T
  try {
    return JSON.parse(text) as T
  } catch {
    throw new UbusError('响应不是有效的 JSON')
  }
}
