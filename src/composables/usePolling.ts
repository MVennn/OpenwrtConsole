import { onMounted, onUnmounted, ref } from 'vue'

/**
 * Runs `task` immediately, then on a fixed interval. Interval ticks are silent
 * (no loading flicker); manual refresh shows the spinner. Polling pauses while
 * the tab is hidden so a background tab does not keep hammering the router.
 */
export function usePolling(task: () => Promise<void>, interval = 5000) {
  const refreshing = ref(false)
  const loaded = ref(false)
  const error = ref<Error | null>(null)
  let timer: number | undefined
  let busy = false
  let pendingManual = false

  async function run(silent = false): Promise<void> {
    // Do not stack requests when the router is slow; the next tick will catch up.
    if (busy) {
      // A manual refresh that arrives mid-poll must not be dropped silently:
      // run it once the current request finishes.
      if (!silent) pendingManual = true
      return
    }
    busy = true
    if (!silent) refreshing.value = true
    try {
      await task()
      error.value = null
      loaded.value = true
    } catch (err) {
      error.value = err instanceof Error ? err : new Error(String(err))
    } finally {
      busy = false
      if (!silent) refreshing.value = false
      if (pendingManual) {
        pendingManual = false
        void run(false)
      }
    }
  }

  function startTimer(): void {
    stopTimer()
    timer = window.setInterval(() => void run(true), interval)
  }

  function stopTimer(): void {
    if (timer) {
      window.clearInterval(timer)
      timer = undefined
    }
  }

  function onVisibility(): void {
    if (document.hidden) {
      stopTimer()
    } else {
      void run(true)
      startTimer()
    }
  }

  onMounted(() => {
    void run(false)
    startTimer()
    document.addEventListener('visibilitychange', onVisibility)
  })

  onUnmounted(() => {
    stopTimer()
    document.removeEventListener('visibilitychange', onVisibility)
  })

  return {
    refreshing,
    loaded,
    error,
    refresh: () => run(false)
  }
}
