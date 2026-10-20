import { ref, watch } from 'vue'

const STORAGE_KEY = 'owrt-theme'

function initialDark(): boolean {
  const saved = localStorage.getItem(STORAGE_KEY)
  if (saved) return saved === 'dark'
  return window.matchMedia('(prefers-color-scheme: dark)').matches
}

const isDark = ref(document.documentElement.classList.contains('dark') || initialDark())

function apply(dark: boolean): void {
  document.documentElement.classList.toggle('dark', dark)
  document.documentElement.style.colorScheme = dark ? 'dark' : 'light'
  document
    .querySelector('meta[name="theme-color"]')
    ?.setAttribute('content', dark ? '#0b0b0d' : '#fafbfc')
}

apply(isDark.value)

watch(isDark, (dark) => {
  apply(dark)
  localStorage.setItem(STORAGE_KEY, dark ? 'dark' : 'light')
})

export function useTheme() {
  return {
    isDark,
    toggleTheme: () => {
      isDark.value = !isDark.value
    }
  }
}
