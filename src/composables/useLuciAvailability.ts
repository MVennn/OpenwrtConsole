import { onMounted, ref } from 'vue'

/** The LuCI entry the console links to as an emergency exit. */
const LUCI_PATH = '/cgi-bin/luci/'

/** The sidebar and the login page must not wait long for a missing LuCI. */
const TIMEOUT_MS = 2000

/**
 * One probe per page load, shared by the sidebar and the login page: opening
 * the login page after a logout must not ask the router a second time.
 */
let probe: Promise<boolean> | null = null

/**
 * Checks whether the router serves LuCI.
 *
 * Not every image carries LuCI, and linking to `/cgi-bin/luci/` on such a
 * router lands on a 404, so the emergency entry is only offered when the
 * HEAD request answers. Every failure (timeout, refused connection, 404)
 * counts as "not installed".
 */
async function probeLuci(): Promise<boolean> {
  const controller = new AbortController()
  const timer = window.setTimeout(() => controller.abort(), TIMEOUT_MS)
  try {
    const response = await fetch(LUCI_PATH, {
      method: 'HEAD',
      cache: 'no-store',
      signal: controller.signal
    })
    // LuCI answers 200 on an open session, 302 when it redirects to the login
    // page and 403 when a login is required. A HEAD request may also be
    // refused with 405. All of them prove the path exists; only 404 means the
    // package is not installed.
    return response.status !== 404
  } catch {
    return false
  } finally {
    window.clearTimeout(timer)
  }
}

/** Whether LuCI is reachable on this router. */
export function useLuciAvailability() {
  const available = ref(false)

  onMounted(async () => {
    if (!probe) probe = probeLuci()
    available.value = await probe
  })

  return available
}
