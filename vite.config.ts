import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import Components from 'unplugin-vue-components/vite'
import { ElementPlusResolver } from 'unplugin-vue-components/resolvers'
import { fileURLToPath, URL } from 'node:url'

// The console is served from /modern/ on the router, so every asset URL must
// be prefixed accordingly. During local development the same relative calls
// are proxied to the router over HTTPS (self-signed certificate).
export default defineConfig({
  base: '/modern/',
  plugins: [
    vue(),
    // Element Plus is imported on demand: every `<el-xxx>` tag in a template
    // becomes an explicit import of that single component plus its
    // stylesheet. `importStyle: 'css'` uses the prebuilt theme-chalk files,
    // which is byte-for-byte the same CSS that `element-plus/dist/index.css`
    // is compiled from — no sass toolchain, no visual drift.
    //
    // `dirs: []` disables the directory scanner: local components keep being
    // imported explicitly, only Element Plus is auto-resolved.
    Components({
      resolvers: [ElementPlusResolver({ importStyle: 'css' })],
      dirs: [],
      dts: false
    })
  ],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url))
    }
  },
  server: {
    proxy: {
      '/ubus': {
        target: 'https://10.0.0.1',
        changeOrigin: true,
        secure: false
      },
      '/cgi-bin': {
        target: 'https://10.0.0.1',
        changeOrigin: true,
        secure: false
      }
    }
  },
  build: {
    target: 'es2020',
    chunkSizeWarningLimit: 1200
  }
})
