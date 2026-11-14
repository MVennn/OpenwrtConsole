import { onBeforeUnmount, onMounted, ref } from 'vue'

/**
 * Tracks whether the browser believes it has a network connection. The console
 * talks to a router on the local network, so an offline browser means every
 * request will fail; showing that once in the header is clearer than letting
 * each view report its own timeout.
 *
 * The state is module level: the header, the sidebar and any future banner read
 * the same value, and the listeners are only registered by the components that
 * actually use it.
 */
const online = ref(typeof navigator === 'undefined' ? true : navigator.onLine)

function sync(): void {
  online.value = navigator.onLine
}

export function useNetworkStatus() {
  onMounted(() => {
    sync()
    window.addEventListener('online', sync)
    window.addEventListener('offline', sync)
  })

  onBeforeUnmount(() => {
    window.removeEventListener('online', sync)
    window.removeEventListener('offline', sync)
  })

  return { online }
}
