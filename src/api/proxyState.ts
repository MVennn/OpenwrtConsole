/**
 * Local state of the proxy exit.
 *
 * The router does not remember when the exit node was switched, but the
 * console does: every switch and every observed change of the exit node is
 * written to the local storage, so the proxy page can show when the current
 * exit was picked and how long it has been in use.
 *
 * The data never leaves the browser.
 */

/** Key of the local storage entry. */
export const PROXY_STATE_KEY = 'owrt:proxy-exit'

export interface ProxyExitState {
  /** The node the traffic currently leaves through. */
  node: string
  /** The strategy group that owns the node. */
  group: string
  /**
   * Epoch milliseconds of the last change of the exit node.
   * 0 means "unknown": the exit was observed for the first time.
   */
  switchedAt: number
}

/** Reads the stored exit state, null when nothing was stored yet. */
export function readProxyExitState(): ProxyExitState | null {
  try {
    const raw = localStorage.getItem(PROXY_STATE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<ProxyExitState> | null
    if (!parsed || typeof parsed.node !== 'string' || !parsed.node) return null
    return {
      node: parsed.node,
      group: typeof parsed.group === 'string' ? parsed.group : '',
      switchedAt: typeof parsed.switchedAt === 'number' ? parsed.switchedAt : 0
    }
  } catch {
    return null
  }
}

/** Stores the exit state; a broken storage never breaks the page. */
export function writeProxyExitState(state: ProxyExitState): void {
  try {
    localStorage.setItem(PROXY_STATE_KEY, JSON.stringify(state))
  } catch {
    // Private mode or a full quota: the page keeps working without the history.
  }
}

/** Forgets the stored exit state. */
export function clearProxyExitState(): void {
  try {
    localStorage.removeItem(PROXY_STATE_KEY)
  } catch {
    // Nothing to do.
  }
}

/**
 * Remembers the exit node.
 *
 * When the node differs from the stored one the exit was switched in the
 * meantime — by the console or by an automatic group (URLTest / Fallback) —
 * and the change is recorded now. The first observation only stores the node,
 * the switch time stays unknown because it happened before the console knew.
 */
export function rememberProxyExit(node: string, group: string, now = Date.now()): ProxyExitState {
  const stored = readProxyExitState()
  if (!stored) {
    const fresh: ProxyExitState = { node, group, switchedAt: 0 }
    writeProxyExitState(fresh)
    return fresh
  }
  if (stored.node === node) {
    if (stored.group !== group) {
      const updated: ProxyExitState = { ...stored, group }
      writeProxyExitState(updated)
      return updated
    }
    return stored
  }
  const changed: ProxyExitState = { node, group, switchedAt: now }
  writeProxyExitState(changed)
  return changed
}

/** Records a switch that the console performed itself. */
export function markProxySwitched(node: string, group: string, now = Date.now()): ProxyExitState {
  const state: ProxyExitState = { node, group, switchedAt: now }
  writeProxyExitState(state)
  return state
}
