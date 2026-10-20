import { getSessionId } from './ubus'

const CGI = '/cgi-bin/modern-pkg'

/**
 * Software package management for the router. The box uses apk, so every read
 * action answers with the package list that `apk query` produced and every
 * write action starts a background job that has to be polled.
 */
export interface PackageInfo {
  name: string
  version: string
  description?: string
  arch?: string
  license?: string
  origin?: string
  /** Size the package occupies on the overlay, in bytes. */
  installedSize?: number
  /** Size of the downloaded package file, in bytes. */
  fileSize?: number
  /** True when the package is already installed on the router. */
  installed?: boolean
  /** The packages the repository entry depends on. */
  depends?: string[]
}

export type PackageAction =
  | 'list'
  | 'available'
  | 'search'
  | 'stats'
  | 'install'
  | 'remove'
  | 'update'
  | 'upgrade'
  | 'status'

export type PackageJobState = 'running' | 'done' | 'timeout'

export interface PackageJob {
  jobId: string
  state: PackageJobState
  exitCode?: number
  output?: string
}

export interface PackageListResult {
  ok: boolean
  output?: string
  packages?: PackageInfo[]
  installedCount?: number
  availableCount?: number
  /** The number of packages the keyword matched, installed ones included. */
  matchedCount?: number
  upgradableCount?: number
  /** The packages a newer version exists for, with the new version. */
  upgradable?: PackageInfo[]
  /** Epoch of the newest repository index, 0 when it was never downloaded. */
  indexUpdatedAt?: number
  jobId?: string
  status?: string
  exitCode?: number
  error?: string
  /** Machine readable error code, e.g. "unsupported_action". */
  code?: string
}

/**
 * The number of packages the entry depends on. The dependencies come from the
 * repository index, so an installed package (which the index does not know)
 * has no number.
 */
export function dependencyCount(pkg: PackageInfo | undefined): number | null {
  if (!pkg || !Array.isArray(pkg.depends)) return null
  return pkg.depends.length
}

export class PackageError extends Error {
  code: string
  /** HTTP status of the answer, 0 when the request never reached the router. */
  status: number

  constructor(message: string, code = 'failed', status = 0) {
    super(message)
    this.name = 'PackageError'
    this.code = code
    this.status = status
  }
}

/** Runs one action of the package CGI. */
export async function runPackageAction(
  action: PackageAction,
  params: Record<string, string | number | undefined> = {}
): Promise<PackageListResult> {
  const sid = getSessionId()
  if (!sid) {
    window.dispatchEvent(new Event('owrt:session-expired'))
    throw new PackageError('登录状态已失效，请重新登录', 'unauthorized')
  }

  const payload: Record<string, string> = {}
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === '') continue
    payload[key] = String(value)
  }

  let response: Response
  try {
    response = await fetch(`${CGI}?sid=${encodeURIComponent(sid)}`, {
      method: 'POST',
      credentials: 'same-origin',
      cache: 'no-store',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, params: payload })
    })
  } catch {
    throw new PackageError('无法连接路由器，请检查网络连接', 'network')
  }

  if (response.status === 401) {
    window.dispatchEvent(new Event('owrt:session-expired'))
    throw new PackageError('登录状态已失效，请重新登录', 'unauthorized')
  }

  const text = await response.text()
  let result: PackageListResult | null = null
  if (text) {
    try {
      result = JSON.parse(text) as PackageListResult
    } catch {
      result = null
    }
  }

  if (!response.ok) {
    const message = result?.error || `操作失败（HTTP ${response.status}）`
    throw new PackageError(
      message,
      result?.code || result?.error || 'failed',
      response.status
    )
  }

  if (result && result.ok === false) {
    throw new PackageError(
      result.error || '操作失败',
      result.code || result.error || 'failed',
      response.status
    )
  }

  return result ?? { ok: true }
}

/**
 * The packages that are installed on the router. The answer also carries the
 * packages a newer version exists for.
 */
export async function fetchInstalledPackages(): Promise<PackageListResult> {
  return runPackageAction('list')
}

/**
 * The head of the repository list, or the packages matching a keyword. The
 * repository holds more than ten thousand packages, so the keyword is matched
 * on the router — the browser never sees more than the returned page.
 */
export async function fetchRepositoryPackages(keyword?: string): Promise<PackageListResult> {
  const term = normalizeKeyword(keyword || '')
  if (!term) return runPackageAction('available')
  return runPackageAction('search', { keyword: term, scope: 'available' })
}

/**
 * The counters of the page. A router whose CGI does not know the "stats"
 * action answers with "不支持的操作"; such a deployment falls back to the
 * available list, which carries the same numbers.
 */
export async function fetchPackageStats(): Promise<PackageListResult> {
  try {
    return await runPackageAction('stats')
  } catch (err) {
    if (err instanceof PackageError && isUnsupportedAction(err)) {
      const result = await runPackageAction('available')
      return {
        ok: true,
        availableCount: result.availableCount,
        indexUpdatedAt: result.indexUpdatedAt
      }
    }
    throw err
  }
}

/** True when the CGI rejected the action because it does not know it. */
function isUnsupportedAction(err: PackageError): boolean {
  if (err.code === 'unsupported_action') return true
  // An older CGI only sends the message, not a machine readable code.
  return err?.status === 400 && /不支持|unsupported|unknown action/i.test(err?.message || '')
}

/**
 * The keyword is only ever used for matching inside the CGI, never as an
 * argument of a command. The CGI reads the request body with a flat pattern
 * that cannot hold an escaped quote, so quotes and control characters are
 * dropped here.
 */
function normalizeKeyword(value: string): string {
  return value
    .replace(/["\\]/g, '')
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .trim()
    .slice(0, 64)
}

/**
 * Starts a write action. The CGI runs it in the background, because an
 * upgrade can take minutes while the browser would drop the connection.
 */
export async function startPackageJob(
  action: 'install' | 'remove' | 'update' | 'upgrade',
  params: Record<string, string | number | undefined> = {}
): Promise<PackageJob> {
  const result = await runPackageAction(action, { ...params, confirm: 'yes' })
  if (!result.jobId) {
    throw new PackageError('路由器没有返回任务编号', 'job')
  }
  return {
    jobId: result.jobId,
    state: 'running',
    output: result.output || ''
  }
}

/** Reads the state of a running job. */
export async function fetchPackageJob(jobId: string): Promise<PackageJob> {
  const result = await runPackageAction('status', { job: jobId })
  return {
    jobId: result.jobId || jobId,
    state: (result.status as PackageJobState) || 'running',
    exitCode: result.exitCode,
    output: result.output || ''
  }
}

/**
 * Polls a job until it finishes. `onTick` is called with every state change
 * so the page can show the progress.
 */
export function waitForPackageJob(
  jobId: string,
  onTick?: (job: PackageJob) => void,
  interval = 2000
): { promise: Promise<PackageJob>; cancel: () => void } {
  let timer: number | undefined
  let cancelled = false

  const promise = new Promise<PackageJob>((resolve, reject) => {
    const tick = async (): Promise<void> => {
      try {
        const job = await fetchPackageJob(jobId)
        onTick?.(job)
        if (job.state === 'done' || job.state === 'timeout') {
          resolve(job)
          return
        }
      } catch (err) {
        reject(err)
        return
      }
      if (!cancelled) timer = window.setTimeout(() => void tick(), interval)
    }
    void tick()
  })

  return {
    promise,
    cancel: () => {
      cancelled = true
      if (timer) window.clearTimeout(timer)
    }
  }
}
