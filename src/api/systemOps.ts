import { getSessionId } from './ubus'

const CGI = '/cgi-bin/modern-uci'

/**
 * Privileged operations that the rpcd session is not allowed to perform
 * (discarding staged changes, reloading services, rebooting, restoring).
 * The CGI validates the session, whitelists the action and, for destructive
 * ones, requires a single use token that it issues on request.
 */
export type SystemOpAction =
  | 'token'
  | 'uci-revert'
  | 'uci-commit'
  | 'uci-apply'
  | 'svc-list'
  | 'svc-action'
  | 'net-reload'
  | 'wifi-reload'
  | 'firewall-reload'
  | 'set-localtime'
  | 'set-password'
  | 'reboot'
  | 'factory-reset'
  | 'backup-create'
  | 'backup-restore'

export type SystemOpParams = Record<string, string | number | undefined>

export interface SystemOpResult {
  ok?: boolean
  token?: string
  expires_in?: number
  error?: string
  [key: string]: unknown
}

export class SystemOpError extends Error {
  code: string

  constructor(message: string, code = 'failed') {
    super(message)
    this.name = 'SystemOpError'
    this.code = code
  }
}

const ERROR_TEXT: Record<string, string> = {
  unauthorized: '登录状态已失效，请重新登录',
  'unsupported operation': '不支持的操作',
  'invalid config': '不支持的配置',
  'invalid service': '服务不存在',
  'invalid action': '不支持的动作',
  'missing purpose': '缺少用途',
  'missing username or password': '缺少用户名或密码',
  'missing time': '缺少时间',
  'backup file not found': '备份文件不存在',
  'token invalid or expired': '令牌无效或已过期'
}

/** Asks the CGI for a single use token for a destructive operation. */
export async function requestToken(purpose: string): Promise<string> {
  const result = await runSystemOp<SystemOpResult>('token', { purpose })
  if (!result.token) throw new SystemOpError('无法获取操作令牌', 'token')
  return result.token
}

/** Runs one privileged operation. */
export async function runSystemOp<T = unknown>(
  action: SystemOpAction,
  params: SystemOpParams = {}
): Promise<T> {
  const sid = getSessionId()
  if (!sid) {
    window.dispatchEvent(new Event('owrt:session-expired'))
    throw new SystemOpError('登录状态已失效，请重新登录', 'unauthorized')
  }

  const body: Record<string, unknown> = { action }
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === '') continue
    body[key] = String(value)
  }

  let response: Response
  try {
    response = await fetch(`${CGI}?sid=${encodeURIComponent(sid)}`, {
      method: 'POST',
      credentials: 'same-origin',
      cache: 'no-store',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    })
  } catch {
    throw new SystemOpError('无法连接路由器，请检查网络连接', 'network')
  }

  if (response.status === 401) {
    window.dispatchEvent(new Event('owrt:session-expired'))
    throw new SystemOpError(ERROR_TEXT.unauthorized, 'unauthorized')
  }

  const text = await response.text()
  let payload: SystemOpResult | null = null
  if (text) {
    try {
      payload = JSON.parse(text) as SystemOpResult
    } catch {
      payload = null
    }
  }

  if (!response.ok) {
    const code = payload?.error || 'failed'
    throw new SystemOpError(describeError(code, `操作失败（HTTP ${response.status}）`), code)
  }

  if (payload?.ok === false) {
    const code = payload.error || 'failed'
    throw new SystemOpError(describeError(code, '操作失败'), code)
  }

  return payload as unknown as T
}

/** The CGI already returns readable Chinese text for many failures — keep it. */
function describeError(code: string, fallback: string): string {
  if (ERROR_TEXT[code]) return ERROR_TEXT[code]
  return /[\u4e00-\u9fff]/.test(code) ? code : fallback
}

/** Convenience wrappers used by the pages. */
export const systemOps = {
  revertConfig: (config: string) => runSystemOp('uci-revert', { config }),
  commitConfig: (config: string) => runSystemOp('uci-commit', { config }),
  applyChanges: () => runSystemOp('uci-apply'),
  reloadNetwork: () => runSystemOp('net-reload'),
  reloadWifi: () => runSystemOp('wifi-reload'),
  reloadFirewall: () => runSystemOp('firewall-reload'),
  serviceAction: (service: string, action: string) =>
    runSystemOp('svc-action', { service, svc_action: action }),
  setPassword: (username: string, password: string, token: string) =>
    runSystemOp('set-password', { username, password, token }),
  reboot: (token: string) => runSystemOp('reboot', { token }),
  factoryReset: (token: string) => runSystemOp('factory-reset', { token }),
  createBackup: (path = '/tmp/openwrt-backup.tar.gz') => runSystemOp('backup-create', { path }),
  restoreBackup: (path: string, token: string) => runSystemOp('backup-restore', { path, token })
}
