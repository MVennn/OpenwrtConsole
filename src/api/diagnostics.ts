import { getSessionId, SessionExpiredError, UbusError } from '@/api/ubus'

/**
 * Diagnostics run on the router through a dedicated CGI that owns the command
 * allowlist. The browser never names a program: it only picks one of these
 * tools and, for the network tools, a target.
 *
 * The network tools also take numbers: the ping count, the packet size, the
 * wait time and the traceroute hops. They are really put on the command line
 * of the router — the CGI clamps them to a sane range — and the answer carries
 * the command that was run, so the console can show what happened.
 */
export const DIAGNOSTIC_TOOLS = ['ping', 'dns', 'trace', 'routes', 'ports'] as const

export type DiagnosticTool = (typeof DIAGNOSTIC_TOOLS)[number]

/** The presets of the network tools. */
export interface DiagnosticParams {
  /** ping: number of echo requests. */
  count?: number
  /** ping: payload size of one packet in bytes. */
  size?: number
  /** ping: seconds to wait for a reply. */
  wait?: number
  /** traceroute: maximum number of hops. */
  hops?: number
  /** traceroute: seconds to wait for one probe. */
  twait?: number
  /** traceroute: probes per hop. */
  probes?: number
}

export interface DiagnosticResult {
  tool: DiagnosticTool
  target: string
  /** The exact command the router ran, for display only. */
  command: string
  /** The parameters the router really used. */
  params: DiagnosticParams
  /** Combined stdout/stderr of the command, kept verbatim. */
  output: string
  exitCode: number
  /** Server side duration; 0 when the router cannot report it. */
  durationMs: number
  truncated: boolean
}

/** The presets the console offers. */
export const PING_COUNT_OPTIONS = [3, 5, 10] as const
export const PING_SIZE_OPTIONS = [56, 128, 256, 512, 1024] as const
export const PING_WAIT_OPTIONS = [1, 2, 3, 5] as const
export const TRACE_HOPS_OPTIONS = [5, 10, 15, 20] as const
export const TRACE_WAIT_OPTIONS = [1, 2] as const
export const TRACE_PROBE_OPTIONS = [1, 3] as const

/** The defaults of the presets. The CGI uses the same ones. */
export const DEFAULT_PARAMS: Record<DiagnosticTool, DiagnosticParams> = {
  ping: { count: 5, size: 56, wait: 3 },
  dns: {},
  trace: { hops: 15, twait: 1, probes: 3 },
  routes: {},
  ports: {}
}

/** The longest the router waits for a traceroute with the largest preset. */
export const DIAGNOSTIC_TIMEOUT = 140000

/** The router rejects anything outside this set, so the UI rejects it too. */
const TARGET_PATTERN = /^[A-Za-z0-9._:-]{1,253}$/

interface RawDiagnosticResponse {
  tool?: string
  target?: string
  command?: string
  params?: Record<string, unknown>
  output?: string
  exit_code?: number
  duration_ms?: number
  truncated?: boolean
  error?: string
}

/** One entry of the history of the page. */
export interface DiagnosticHistoryEntry {
  id: string
  /** Epoch in milliseconds. */
  at: number
  tool: DiagnosticTool
  target: string
  command: string
  exitCode: number
  durationMs: number
  success: boolean
  /** One line with the outcome, e.g. "丢包 0% · 平均 12.3 ms". */
  summary: string
  params: DiagnosticParams
}

const HISTORY_KEY = 'owrt-diag-history'

/** How many entries the history keeps. */
export const HISTORY_LIMIT = 10

export function isValidDiagnosticTarget(target: string): boolean {
  return TARGET_PATTERN.test(target)
}

/** routes and ports are local snapshots and do not take a target. */
export function diagnosticNeedsTarget(tool: DiagnosticTool): boolean {
  return tool !== 'routes' && tool !== 'ports'
}

/**
 * The command the router will run. The CGI builds the same string, so the
 * preview of the console and the command of the answer are identical.
 */
export function buildDiagnosticCommand(
  tool: DiagnosticTool,
  target: string,
  params: DiagnosticParams = {}
): string {
  const host = target || '<目标>'
  switch (tool) {
    case 'ping':
      return `ping -c ${params.count ?? 5} -s ${params.size ?? 56} -W ${params.wait ?? 3} ${host}`
    case 'dns':
      return `nslookup ${host}`
    case 'trace':
      return `traceroute -n -w ${params.twait ?? 1} -q ${params.probes ?? 3} -m ${params.hops ?? 15} ${host}`
    case 'routes':
      return 'ip route show'
    case 'ports':
      return 'netstat -lntup'
  }
}

/** The label of the tools. */
export const DIAGNOSTIC_LABELS: Record<DiagnosticTool, string> = {
  ping: 'Ping',
  dns: 'DNS 解析',
  trace: '路由跟踪',
  routes: '路由表',
  ports: '监听端口'
}

function numberParam(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value)
    if (Number.isFinite(parsed)) return parsed
  }
  return undefined
}

function toParams(raw: Record<string, unknown> | undefined): DiagnosticParams {
  const params: DiagnosticParams = {}
  if (!raw) return params
  const count = numberParam(raw.count)
  const size = numberParam(raw.size)
  const wait = numberParam(raw.wait)
  const hops = numberParam(raw.hops)
  const twait = numberParam(raw.twait)
  const probes = numberParam(raw.probes)
  if (count !== undefined) params.count = count
  if (size !== undefined) params.size = size
  if (wait !== undefined) params.wait = wait
  if (hops !== undefined) params.hops = hops
  if (twait !== undefined) params.twait = twait
  if (probes !== undefined) params.probes = probes
  return params
}

function toResult(tool: DiagnosticTool, target: string, data: RawDiagnosticResponse): DiagnosticResult {
  const effectiveTool = (DIAGNOSTIC_TOOLS as readonly string[]).includes(data.tool ?? '')
    ? (data.tool as DiagnosticTool)
    : tool
  return {
    tool: effectiveTool,
    target: data.target ?? target,
    command: data.command ?? '',
    params: toParams(data.params),
    output: typeof data.output === 'string' ? data.output : '',
    exitCode: Number.isFinite(data.exit_code) ? Number(data.exit_code) : 0,
    durationMs: Number.isFinite(data.duration_ms) ? Number(data.duration_ms) : 0,
    truncated: Boolean(data.truncated)
  }
}

export async function runDiagnostic(
  tool: DiagnosticTool,
  target = '',
  params: DiagnosticParams = {}
): Promise<DiagnosticResult> {
  const sid = getSessionId()
  if (!sid) {
    window.dispatchEvent(new Event('owrt:session-expired'))
    throw new SessionExpiredError()
  }

  const payload: Record<string, string> = { tool }
  if (diagnosticNeedsTarget(tool)) payload.target = target
  // The CGI reads the flat string values of the body, so the numbers travel
  // as strings as well.
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === '') continue
    payload[key] = String(value)
  }

  const controller = new AbortController()
  const timer = window.setTimeout(() => controller.abort(), DIAGNOSTIC_TIMEOUT)

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

/**
 * One line with the outcome of a run: the packet loss of a ping, the address
 * a name resolved to, the number of hops of a traceroute.
 */
export function summarizeDiagnostic(tool: DiagnosticTool, output: string): string {
  const text = output || ''

  if (tool === 'ping') {
    const loss = text.match(/([\d.]+)%\s*packet loss/i)
    const rtt = text.match(/min\/avg\/max\s*=\s*([\d.]+)\/([\d.]+)\/([\d.]+)/i)
    const parts: string[] = []
    if (loss) parts.push(`丢包 ${loss[1]}%`)
    const sent = text.match(/(\d+)\s+packets transmitted,\s*(\d+)\s+(?:packets\s+)?received/i)
    if (sent) parts.push(`收到 ${sent[2]}/${sent[1]}`)
    if (rtt) parts.push(`平均 ${rtt[2]} ms`)
    return parts.join(' · ') || firstLine(text) || '无输出'
  }

  if (tool === 'dns') {
    const addresses = [...text.matchAll(/^Address:\s*([0-9]{1,3}(?:\.[0-9]{1,3}){3})\s*$/gm)].map(
      (match) => match[1]
    )
    if (addresses.length) return `解析到 ${addresses[addresses.length - 1]}`
    const named = text.match(/^Name:\s*(\S+)\s*$/m)
    if (named) return `解析 ${named[1]}`
    return firstLine(text) || '无输出'
  }

  if (tool === 'trace') {
    const hops = text.match(/^\s*\d+\s+\S+/gm)
    if (hops && hops.length) return `${hops.length} 跳`
    return firstLine(text) || '无输出'
  }

  if (tool === 'routes') {
    const lines = text.split('\n').filter((line) => line.trim() !== '')
    return lines.length ? `${lines.length} 条路由` : '路由表为空'
  }

  const lines = text.split('\n').filter((line) => line.trim() !== '')
  return lines.length ? `${lines.length} 行监听信息` : '没有监听端口'
}

function firstLine(text: string): string {
  const line = text
    .split('\n')
    .map((item) => item.trim())
    .find((item) => item !== '')
  return line ? line.slice(0, 80) : ''
}

/**
 * A readable reason for a failed run. The exit code alone says nothing to a
 * user, so the output is read for the usual reasons.
 */
export function explainDiagnosticFailure(result: DiagnosticResult): string {
  if (result.exitCode === 0) return ''
  const text = result.output || ''

  if (/unknown host|could not resolve host|name does not resolve|name or service not known/i.test(text)) {
    return '域名无法解析，请换一个域名或直接使用 IP 地址'
  }
  if (/100%\s*packet loss/i.test(text)) {
    return '目标不可达，100% 的探测包都没有得到回应'
  }
  if (/destination host unreachable/i.test(text)) {
    return '目标主机不可达（收到 Destination Host Unreachable）'
  }
  if (/time to live exceeded/i.test(text)) {
    return 'TTL 超时，路径上有一跳丢弃了 ICMP 报文'
  }
  if (/temporary failure in name resolution|server misbehaving/i.test(text)) {
    return 'DNS 服务器没有正常回应'
  }
  if (/no route to host/i.test(text)) {
    return '没有到目标网段的路由'
  }

  switch (result.exitCode) {
    case 124:
      return '命令超过了路由器的看门狗时限，被强制终止'
    case 137:
      return '命令被强制终止（超时或内存不足）'
    case 143:
      return '命令被终止'
    case 1:
      return '命令返回了错误，详情见下方输出'
    default:
      return `命令返回了退出码 ${result.exitCode}`
  }
}

/** The history of the page, newest first. */
export function loadDiagnosticHistory(): DiagnosticHistoryEntry[] {
  try {
    const raw = localStorage.getItem(HISTORY_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return []
    const entries: DiagnosticHistoryEntry[] = []
    for (const item of parsed) {
      if (!item || typeof item !== 'object') continue
      const record = item as Record<string, unknown>
      const tool = record.tool
      if (typeof tool !== 'string' || !(DIAGNOSTIC_TOOLS as readonly string[]).includes(tool)) {
        continue
      }
      entries.push({
        id: typeof record.id === 'string' ? record.id : String(record.at ?? entries.length),
        at: Number(record.at) || 0,
        tool: tool as DiagnosticTool,
        target: typeof record.target === 'string' ? record.target : '',
        command: typeof record.command === 'string' ? record.command : '',
        exitCode: Number(record.exitCode) || 0,
        durationMs: Number(record.durationMs) || 0,
        success: record.success === true,
        summary: typeof record.summary === 'string' ? record.summary : '',
        params: toParams(record.params as Record<string, unknown> | undefined)
      })
      if (entries.length >= HISTORY_LIMIT) break
    }
    return entries
  } catch {
    return []
  }
}

/** Stores an entry and returns the new history, newest first. */
export function recordDiagnostic(
  entry: Omit<DiagnosticHistoryEntry, 'id' | 'at'>
): DiagnosticHistoryEntry[] {
  const stored: DiagnosticHistoryEntry = {
    ...entry,
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    at: Date.now()
  }
  const history = [stored, ...loadDiagnosticHistory()].slice(0, HISTORY_LIMIT)
  try {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(history))
  } catch {
    /* the history is a convenience, a full storage must not break the page */
  }
  return history
}

/** Removes the history of the page. */
export function clearDiagnosticHistory(): void {
  try {
    localStorage.removeItem(HISTORY_KEY)
  } catch {
    /* ignore */
  }
}

/** Saves the raw output of a run as a text file. */
export function downloadDiagnosticOutput(filename: string, content: string): void {
  const blob = new Blob([content], { type: 'text/plain;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.style.display = 'none'
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}
