import { getSessionId, SessionExpiredError, UbusError } from '@/api/ubus'

/**
 * Diagnostics run on the router through a dedicated CGI that owns the command
 * allowlist. The browser never names a program: it only picks one of these
 * tools and, for the network tools, a target.
 */
export const DIAGNOSTIC_TOOLS = ['ping', 'dns', 'trace', 'routes', 'ports'] as const

export type DiagnosticTool = (typeof DIAGNOSTIC_TOOLS)[number]

export interface DiagnosticResult {
  tool: DiagnosticTool
  target: string
  /** The exact command the router ran, for display only. */
  command: string
  /** Combined stdout/stderr of the command, kept verbatim. */
  output: string
  exitCode: number
  /** Server side duration; 0 when the router cannot report it. */
  durationMs: number
  truncated: boolean
}

/** The router rejects anything outside this set, so the UI rejects it too. */
const TARGET_PATTERN = /^[A-Za-z0-9._:-]{1,253}$/

/** The CGI kills a command after 12 s; the client waits a little longer. */
const REQUEST_TIMEOUT = 20000

interface RawDiagnosticResponse {
  tool?: string
  target?: string
  command?: string
  output?: string
  exit_code?: number
  duration_ms?: number
  truncated?: boolean
  error?: string
}

export function isValidDiagnosticTarget(target: string): boolean {
  return TARGET_PATTERN.test(target)
}

/** routes and ports are local snapshots and do not take a target. */
export function diagnosticNeedsTarget(tool: DiagnosticTool): boolean {
  return tool !== 'routes' && tool !== 'ports'
}

function toResult(tool: DiagnosticTool, target: string, data: RawDiagnosticResponse): DiagnosticResult {
  return {
    tool: (DIAGNOSTIC_TOOLS as readonly string[]).includes(data.tool ?? '')
      ? (data.tool as DiagnosticTool)
      : tool,
    target: data.target ?? target,
    command: data.command ?? '',
    output: typeof data.output === 'string' ? data.output : '',
    exitCode: Number.isFinite(data.exit_code) ? Number(data.exit_code) : 0,
    durationMs: Number.isFinite(data.duration_ms) ? Number(data.duration_ms) : 0,
    truncated: Boolean(data.truncated)
  }
}

export async function runDiagnostic(
  tool: DiagnosticTool,
  target = ''
): Promise<DiagnosticResult> {
  const sid = getSessionId()
  if (!sid) {
    window.dispatchEvent(new Event('owrt:session-expired'))
    throw new SessionExpiredError()
  }

  const payload: { tool: DiagnosticTool; target?: string } = { tool }
  if (diagnosticNeedsTarget(tool)) payload.target = target

  const controller = new AbortController()
  const timer = window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT)

  let response: Response
  try {
    response = await fetch(`/cgi-bin/modern-exec?sid=${encodeURIComponent(sid)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      credentials: 'same-origin',
      cache: 'no-store',
      signal: controller.signal
    })
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      throw new UbusError('诊断执行超时，请稍后重试')
    }
    throw new UbusError('无法连接路由器，请检查网络连接')
  } finally {
    window.clearTimeout(timer)
  }

  const text = await response.text()
  let data: RawDiagnosticResponse = {}
  try {
    data = text ? (JSON.parse(text) as RawDiagnosticResponse) : {}
  } catch {
    throw new UbusError('诊断服务返回了无法解析的响应')
  }

  if (response.status === 401) {
    window.dispatchEvent(new Event('owrt:session-expired'))
    throw new SessionExpiredError()
  }
  if (!response.ok) {
    throw new UbusError(data.error || `诊断执行失败（HTTP ${response.status}）`)
  }

  return toResult(tool, target, data)
}
