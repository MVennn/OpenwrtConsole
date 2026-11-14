import { onMounted, onUnmounted, ref } from 'vue'

/**
 * Handed to the poll task so a request that is already running can be dropped
 * when the view goes away, instead of keeping the router busy for a page that
 * nobody is looking at any more.
 */
export interface PollContext {
  readonly signal: AbortSignal
}

/** Retry delays stop growing here, so a dead router is still probed every minute. */
const MAX_BACKOFF = 60000

/**
 * Runs `task` immediately, then on a fixed interval. Interval ticks are silent
 * (no loading flicker); manual refresh shows the spinner. Polling pauses while
 * the tab is hidden so a background tab does not keep hammering the router.
 *
 * A failed round is retried with a growing delay (2x, 4x ... capped at a
 * minute) instead of on every tick: the router is a 233 MB box, and a view that
 * keeps firing seven ubus calls every five seconds while it is already
 * struggling is what turns a slow answer into an OOM restart. The delay drops
 * back to the plain interval on the first successful round.
 */
export function usePolling(task: (ctx: PollContext) => Promise<void>, interval = 5000) {
  const refreshing = ref(false)
  const loaded = ref(false)
  const error = ref<Error | null>(null)
  /** Consecutive failed rounds; 0 means the last round succeeded. */
  const failures = ref(0)
  let timer: number | undefined
  let busy = false
  let pendingManual = false
  let disposed = false
  let controller: AbortController | null = null

  /** Delay before the next round: the plain interval while healthy. */
  function nextDelay(): number {
    if (failures.value === 0) return interval
    return Math.min(interval * 2 ** Math.min(failures.value, 4), MAX_BACKOFF)
  }

  async function run(silent = false): Promise<void> {
    // Do not stack requests when the router is slow; the next tick will catch up.
    if (disposed) return
    if (busy) {
      // A manual refresh that arrives mid-poll must not be dropped silently:
      // run it once the current request finishes.
      if (!silent) pendingManual = true
      return
    }
    busy = true
    if (!silent) refreshing.value = true
    controller = new AbortController()
    try {
      await task({ signal: controller.signal })
      if (!disposed) {
        error.value = null
        loaded.value = true
        failures.value = 0
      }
    } catch (err) {
      // A round cancelled because the view is gone is not a router failure.
      if (!disposed) {
        error.value = err instanceof Error ? err : new Error(String(err))
        failures.value += 1
      }
    } finally {
      busy = false
      if (!silent) refreshing.value = false
      if (pendingManual) {
        pendingManual = false
        if (!disposed) void run(false)
      }
    }
  }

  function stopTimer(): void {
    if (timer !== undefined) {
      window.clearTimeout(timer)
      timer = undefined
    }
  }

  /**
   * Schedules the next round. The guard on `timer` keeps exactly one timeout
   * alive, so a visibility change and a finished round cannot both schedule.
   */
  function schedule(): void {
    if (disposed || timer !== undefined) return
    timer = window.setTimeout(async () => {
      timer = undefined
      if (disposed || document.hidden) return
      await run(true)
      schedule()
    }, nextDelay())
  }

  function onVisibility(): void {
    if (document.hidden) {
      stopTimer()
    } else {
      void run(true)
      schedule()
    }
  }

  onMounted(() => {
    void run(false)
    schedule()
    document.addEventListener('visibilitychange', onVisibility)
  })

  onUnmounted(() => {
    disposed = true
    stopTimer()
    controller?.abort()
    document.removeEventListener('visibilitychange', onVisibility)
  })

  return {
    refreshing,
    loaded,
    error,
    failures,
    refresh: () => run(false)
  }
}
