import { createApp } from 'vue'

// Must come first: it carries the Element Plus stylesheets (and the locale
// registration) so that `tokens.css` / `element.css` stay *after* them and
// keep overriding Element Plus' defaults.
import { setupElement } from './plugins/element'

import '@/styles/tokens.css'
import '@/styles/base.css'
import '@/styles/element.css'
import '@/styles/layout.css'

import App from './App.vue'
import router from './router'

// The cache-busting marker only exists to survive a stale-chunk reload.
if (new URL(window.location.href).searchParams.has('_reload')) {
  const url = new URL(window.location.href)
  url.searchParams.delete('_reload')
  window.history.replaceState(null, '', url.toString())
}

// Element Plus is no longer registered with `app.use(ElementPlus)`: every
// `<el-xxx>` tag is auto-imported per template by unplugin-vue-components, so
// only the components that are really used end up in the bundle.
const app = createApp(App)
setupElement(app)

app.use(router).mount('#app')

// Tells the boot guard in index.html that the app came up, so a redeploy
// that removed the hashed entry chunk triggers a cache busting reload.
;(window as unknown as { __OWRT_BOOTED__?: boolean }).__OWRT_BOOTED__ = true
