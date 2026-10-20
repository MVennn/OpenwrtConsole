import { onBeforeUnmount, onMounted } from 'vue'

const CHECK_INTERVAL = 30_000
const RELOAD_COOLDOWN = 15_000
const ENTRY_PATTERN = /assets\/index-[^"']+\.js/

/**
 * uhttpd does not send `Cache-Control`, so browsers heuristically cache
 * `index.html`. A tab that was left open across a deployment would keep
 * running the previous build (and its previous stylesheet) for a long time.
 *
 * The guard fetches the current index.html with `no-store` and compares the
 * entry chunk name with the one this page was loaded from. When they differ,
 * the page reloads with a cache busting query so the new build is picked up.
 */
export function useBuildGuard(): void {
  let timer: number | undefined

  const currentEntry = (): string => {
    const script = document.querySelector<HTMLScriptElement>('script[src*="/assets/index-"]')
    return script?.getAttribute('src')?.split('/').pop() ?? ''
  }

  async function check(): Promise<void> {
    if (document.visibilityState === 'hidden') return
    try {
      const response = await fetch(`${import.meta.env.BASE_URL}index.html`, {
        cache: 'no-store',
        credentials: 'same-origin'
      })
      if (!response.ok) return
      const html = await response.text()
      const match = html.match(ENTRY_PATTERN)
      const latest = match ? match[0].split('/').pop() : ''
      const active = currentEntry()
      if (!latest || !active || latest === active) return

      const url = new URL(window.location.href)
      if (url.searchParams.has('_reload')) {
        // Do not loop: one reload per cooldown window.
        const last = Number(sessionStorage.getItem('owrt-reload-at') || 0)
        if (Date.now() - last < RELOAD_COOLDOWN) return
      }
      sessionStorage.setItem('owrt-reload-at', String(Date.now()))
      url.searchParams.set('_reload', Date.now().toString())
      window.location.replace(url.toString())
    } catch {
      // A failed check simply means we keep running what we have.
    }
  }

  onMounted(() => {
    void check()
    timer = window.setInterval(() => void check(), CHECK_INTERVAL)
  })

  onBeforeUnmount(() => {
    if (timer) window.clearInterval(timer)
  })
}
