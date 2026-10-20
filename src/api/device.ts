/**
 * Device identity for the login page.
 *
 * The login page is the only screen a visitor sees before a session exists,
 * so it must not use `ubusCall` — that one needs a session id and would
 * report an expired session to a visitor who never had one. Instead this
 * module asks uhttpd's `/ubus` endpoint for the board information with the
 * anonymous session.
 *
 * OpenWrt does not grant the anonymous session access to `system.board` by
 * default, so the call usually fails with `Access denied`. That is the normal
 * case, not an error: the module then returns `null` and the caller falls
 * back to a generic wording. Every failure path is swallowed — the login
 * page has to render no matter what the router answers.
 */

/** The session id uhttpd treats as "anonymous". */
const ANONYMOUS_SESSION = '00000000000000000000000000000000'

/** How long the login page waits for the answer. */
const TIMEOUT_MS = 3000

/** What the login page shows about the router. */
export interface DeviceIdentity {
  /** The model name of the router, as reported by `system.board`. */
  model: string
  /** The distribution and its version, e.g. `OpenWrt 25.12.6`. */
  os: string
}

interface UbusReply {
  error?: { code?: number; message?: string }
  result?: unknown[]
}

/** Reads a string field and trims it. */
function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

/** Builds the "OpenWrt 25.12.6" style label of the release. */
function releaseLabel(release: unknown): string {
  if (!release || typeof release !== 'object') return ''
  const record = release as Record<string, unknown>
  const distribution = text(record.distribution)
  const version = text(record.version)
  if (distribution && version) return `${distribution} ${version}`
  return distribution || version
}

/**
 * Reads the model and the system version of the router without a session.
 *
 * Returns `null` when the router does not answer, does not allow the
 * anonymous call, or answers with something unexpected.
 */
export async function fetchDeviceIdentity(): Promise<DeviceIdentity | null> {
  const controller = new AbortController()
  const timer = window.setTimeout(() => controller.abort(), TIMEOUT_MS)
  try {
    const response = await fetch('/ubus', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      cache: 'no-store',
      signal: controller.signal,
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: Date.now(),
        method: 'call',
        params: [ANONYMOUS_SESSION, 'system', 'board', {}]
      })
    })
    if (!response.ok) return null

    const reply = (await response.json().catch(() => null)) as UbusReply | null
    if (!reply || reply.error) return null

    const result = reply.result
    if (!Array.isArray(result) || result.length < 2 || Number(result[0]) !== 0) return null

    const board = result[1]
    if (!board || typeof board !== 'object') return null
    const record = board as Record<string, unknown>

    const model = text(record.model) || text(record.board_name)
    if (!model) return null

    return { model, os: releaseLabel(record.release) || text(record.system) }
  } catch {
    // The router did not answer in time or refused the anonymous call.
    return null
  } finally {
    window.clearTimeout(timer)
  }
}
