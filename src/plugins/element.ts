import type { App } from 'vue'
import { ElLoading, ElMessage, ElMessageBox, ElNotification, provideGlobalConfig } from 'element-plus'
import zhCn from 'element-plus/es/locale/lang/zh-cn'

/**
 * Element Plus is loaded on demand.
 *
 * `unplugin-vue-components` + `ElementPlusResolver` (see `vite.config.ts`)
 * rewrites every `<el-xxx>` tag into an explicit component import plus its
 * stylesheet, so nothing of the library is bundled unless a template asks for
 * it. `element-plus/dist/index.css` is *not* imported any more.
 *
 * The stylesheets below are imported here, in the entry chunk, on purpose:
 *
 *  1. `ElMessage` / `ElMessageBox` are called imperatively from the router and
 *     from the views, so the resolver never sees them and would never pull
 *     their CSS in.
 *  2. Hoisting the shared sheets into the entry keeps the cascade stable.
 *     `src/styles/tokens.css` (the `--el-*` bridge) and
 *     `src/styles/element.css` (the component overrides) are imported *after*
 *     this module, so they keep winning over Element Plus' own `:root`
 *     variables and component rules — exactly like the old
 *     `element-plus/dist/index.css` -> `tokens.css` -> `element.css` order.
 *  3. Because these modules are reachable from the entry chunk, Rollup hoists
 *     them out of the lazily loaded view chunks. Otherwise the view CSS would
 *     be appended to `<head>` at runtime and would override
 *     `src/styles/element.css` on equal specificity.
 */
import 'element-plus/es/components/alert/style/css'
import 'element-plus/es/components/dialog/style/css'
import 'element-plus/es/components/form/style/css'
import 'element-plus/es/components/form-item/style/css'
import 'element-plus/es/components/input-number/style/css'
import 'element-plus/es/components/pagination/style/css'
import 'element-plus/es/components/progress/style/css'
import 'element-plus/es/components/steps/style/css'
import 'element-plus/es/components/switch/style/css'
import 'element-plus/es/components/button/style/css'
import 'element-plus/es/components/dropdown/style/css'
import 'element-plus/es/components/dropdown-item/style/css'
import 'element-plus/es/components/dropdown-menu/style/css'
import 'element-plus/es/components/input/style/css'
import 'element-plus/es/components/loading/style/css'
import 'element-plus/es/components/message/style/css'
import 'element-plus/es/components/message-box/style/css'
import 'element-plus/es/components/notification/style/css'
import 'element-plus/es/components/option/style/css'
import 'element-plus/es/components/radio/style/css'
import 'element-plus/es/components/radio-button/style/css'
import 'element-plus/es/components/radio-group/style/css'
import 'element-plus/es/components/select/style/css'
import 'element-plus/es/components/skeleton/style/css'
import 'element-plus/es/components/table/style/css'
import 'element-plus/es/components/table-column/style/css'
import 'element-plus/es/components/tag/style/css'

/**
 * Registers Element Plus without registering the whole component library.
 *
 * `app.use(ElementPlus)` used to do three things: install every component,
 * publish the locale, and let the imperative services (`ElMessage`,
 * `ElMessageBox`, …) capture the app context. Only the components that a
 * template really uses are installed now — the resolver injects them — so this
 * function restores the two remaining pieces:
 *
 *  - The locale is published on the *application* context through
 *    `provideGlobalConfig(config, app, true)`, which is literally what
 *    `app.use(ElementPlus, { locale })` did internally. Because the provide
 *    lives on `app._context.provides`, every component in the tree resolves
 *    `zh-cn`, and so do the imperatively created services that reuse the app
 *    context. No `ElConfigProvider` wrapper is needed (App.vue stays untouched).
 *  - The imperative services are `app.use`d so their `install()` hook stores
 *    `app._context` on them. Without it `ElMessage`/`ElMessageBox` would render
 *    a context-less vnode and silently fall back to the English locale.
 */
export function setupElement(app: App): void {
  provideGlobalConfig({ locale: zhCn }, app, true)

  app.use(ElMessage)
  app.use(ElMessageBox)
  app.use(ElNotification)
  app.use(ElLoading)
}
