import { onBeforeUnmount, onMounted, ref, watch, type Ref } from 'vue'

/**
 * Keeps a form draft in localStorage so a page refresh does not throw away
 * half finished work (ShellCrash switches, interface edits, …). The draft is
 * restored on mount and removed as soon as it is saved or discarded.
 */
export interface Draft<T> {
  value: Ref<T>
  dirty: Ref<boolean>
  savedAt: Ref<string | null>
  clear: () => void
  persist: () => void
}

export function useDraft<T extends object>(key: string, initial: T): Draft<T> {
  const storageKey = `owrt-draft:${key}`
  const value = ref({ ...initial }) as Ref<T>
  const dirty = ref(false)
  const savedAt = ref<string | null>(null)

  function read(): void {
    try {
      const raw = localStorage.getItem(storageKey)
      if (!raw) return
      const parsed = JSON.parse(raw) as T & { savedAt?: string }
      if (!parsed || typeof parsed !== 'object') return
      const { savedAt: stamp, ...rest } = parsed
      value.value = { ...value.value, ...rest }
      savedAt.value = stamp ?? null
      dirty.value = true
    } catch {
      localStorage.removeItem(storageKey)
    }
  }

  function persist(): void {
    try {
      localStorage.setItem(
        storageKey,
        JSON.stringify({ ...value.value, savedAt: new Date().toISOString() })
      )
    } catch {
      // A full storage must never break the page.
    }
  }

  function clear(): void {
    localStorage.removeItem(storageKey)
    dirty.value = false
    savedAt.value = null
  }

  watch(
    value,
    () => {
      dirty.value = true
      persist()
    },
    { deep: true }
  )

  onMounted(read)

  return { value, dirty, savedAt, clear, persist }
}

/**
 * Warns before the tab is closed or navigated away while a draft is pending.
 * The browser only shows its own generic message, but the draft itself is
 * restored on the next visit.
 */
export function useUnsavedGuard(dirty: Ref<boolean>, message = '有未保存的修改'): void {
  const handler = (event: BeforeUnloadEvent): void => {
    if (!dirty.value) return
    event.preventDefault()
    event.returnValue = message
  }

  onMounted(() => window.addEventListener('beforeunload', handler))
  onBeforeUnmount(() => window.removeEventListener('beforeunload', handler))
}
