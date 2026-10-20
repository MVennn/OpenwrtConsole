import { ref } from 'vue'

const refreshTick = ref(0)

export function triggerRefresh(): void {
  refreshTick.value += 1
}

export function useRefreshSignal() {
  return refreshTick
}
