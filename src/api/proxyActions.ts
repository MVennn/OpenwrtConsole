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
  if (!isProxyNameAllowed(name)) return null
  const data = await cgiGet<{ delay?: number; message?: string }>(
    `${CGI}?path=${encodeURIComponent(`/proxies/${name}/delay`)}&url=${encodeURIComponent(url)}`
  )
  if (typeof data?.delay === 'number') return data.delay
  return null
}

/** How many latency probes may run at the same time. */
export const DELAY_CONCURRENCY = 4

export interface ProxyDelayResult {
  node: string
  /** The measured latency in milliseconds, null when the node did not answer. */
  delay: number | null
}

/**
 * Probes a list of nodes and returns one entry per node.
 *
 * The probes run with a small concurrency limit: every probe keeps a mihomo
 * request open for up to eight seconds, so firing dozens of them at once
 * would stall the router. A node whose name the CGI cannot encode is skipped
 * and reported as "no answer" instead of failing the whole batch.
 */
export async function fetchProxyDelays(
  nodes: string[],
  options: { url?: string; concurrency?: number } = {}
): Promise<Record<string, number | null>> {
  const unique = [...new Set(nodes)].filter(isProxyNameAllowed)
  const result: Record<string, number | null> = {}
  if (!unique.length) return result

  const limit = Math.max(1, Math.min(options.concurrency ?? DELAY_CONCURRENCY, unique.length))
  let cursor = 0

  async function worker(): Promise<void> {
    for (;;) {
      const index = cursor
      cursor += 1
      if (index >= unique.length) return
      const node = unique[index]
      result[node] = await fetchProxyDelay(node, options.url).catch(() => null)
    }
  }

  await Promise.all(Array.from({ length: limit }, () => worker()))
  return result
}

/** The metadata of a live connection; newer cores also report the process. */
export interface ProxyConnectionMeta {
  host?: string
  destinationIP?: string
  sourceIP?: string
  network?: string
  type?: string
  inboundName?: string
  /** Name of the local process that opened the connection. */
  process?: string
  /** Full path of the local process. */
  processPath?: string
}

/** A live connection of the mihomo core. */
export interface ProxyConnection {
  id: string
  upload: number
  download: number
  rule: string
  rulePayload?: string
  chains: string[]
  start: string
  metadata?: ProxyConnectionMeta
}

export interface ConnectionBucket {
  /** The domain or the process the connections belong to. */
  key: string
  /** Number of connections in the bucket. */
  count: number
  upload: number
  download: number
  /** Upload plus download, in bytes. */
  total: number
}

export interface ConnectionSummary {
  /** The busiest domains, sorted by traffic. */
  domains: ConnectionBucket[]
  /** The busiest processes, sorted by traffic. */
  processes: ConnectionBucket[]
  /** Connections that carry neither a host nor a process. */
  unattributed: number
  /** Bytes of the connections that could be attributed to a domain. */
  domainBytes: number
  /** Bytes of the connections that could be attributed to a process. */
  processBytes: number
}

/**
 * Groups the live connections by domain and by process.
 *
 * mihomo only fills the process fields when the core is allowed to read the
 * process table of the router, so the process list can legitimately be empty.
 * The caller shows that as a hint instead of inventing numbers.
 */
export function summarizeConnections(
  connections: ProxyConnection[],
  limit = 5
): ConnectionSummary {
  const domains = new Map<string, ConnectionBucket>()
  const processes = new Map<string, ConnectionBucket>()
  let unattributed = 0
  let domainBytes = 0
  let processBytes = 0

  for (const connection of connections) {
    const upload = connection.upload || 0
    const download = connection.download || 0
    const total = upload + download
    const meta = connection.metadata || {}

    const domain = meta.host || meta.destinationIP || ''
    if (domain) {
      const bucket =
        domains.get(domain) ?? { key: domain, count: 0, upload: 0, download: 0, total: 0 }
      bucket.count += 1
      bucket.upload += upload
      bucket.download += download
      bucket.total += total
      domains.set(domain, bucket)
      domainBytes += total
    }

    const process = meta.processPath || meta.process || ''
    if (process) {
      const bucket =
        processes.get(process) ?? { key: process, count: 0, upload: 0, download: 0, total: 0 }
      bucket.count += 1
      bucket.upload += upload
      bucket.download += download
      bucket.total += total
      processes.set(process, bucket)
      processBytes += total
    }

    if (!domain && !process) unattributed += 1
  }

  const byTraffic = (list: ConnectionBucket[]): ConnectionBucket[] =>
    [...list].sort((a, b) => b.total - a.total || a.key.localeCompare(b.key))

  return {
    domains: byTraffic([...domains.values()]).slice(0, limit),
    processes: byTraffic([...processes.values()]).slice(0, limit),
    unattributed,
    domainBytes,
    processBytes
  }
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
