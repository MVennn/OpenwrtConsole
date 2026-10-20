<template>
  <div class="login-page">
    <section class="brand-panel">
      <div class="brand-grid" aria-hidden="true" />
      <div class="brand-inner">
        <div class="brand-top">
          <div class="brand-mark">
            <RouterIcon :size="22" :stroke-width="2" />
          </div>
          <span class="brand-name">OpenWrt Console</span>
        </div>

        <div class="brand-copy">
          <h1>把路由器的状态<br />看清楚。</h1>
          <p>实时流量、无线客户端、接口状态与代理链路，集中在一个界面里。</p>
        </div>

        <ul class="feature-list">
          <li>
            <Activity :size="16" />
            <span>系统与网络状态实时刷新</span>
          </li>
          <li>
            <Wifi :size="16" />
            <span>无线频段、信号与漫游客户端</span>
          </li>
          <li>
            <ShieldCheck :size="16" />
            <span>ShellCrash 代理链路一览</span>
          </li>
        </ul>

        <div class="brand-foot">
          <span>Xiaomi AX3000T</span>
          <span class="brand-foot-sep" />
          <span>OpenWrt 25.12</span>
        </div>
      </div>

      <svg class="brand-topology" viewBox="0 0 520 300" fill="none" aria-hidden="true">
        <g stroke="currentColor" stroke-width="1" opacity="0.22">
          <path d="M260 150 L120 60 M260 150 L400 60 M260 150 L120 240 M260 150 L400 240" />
          <circle cx="260" cy="150" r="52" />
          <circle cx="260" cy="150" r="96" stroke-dasharray="3 6" />
        </g>
        <g fill="currentColor">
          <circle cx="260" cy="150" r="5" opacity="0.9" />
          <circle cx="120" cy="60" r="3" opacity="0.55" />
          <circle cx="400" cy="60" r="3" opacity="0.55" />
          <circle cx="120" cy="240" r="3" opacity="0.55" />
          <circle cx="400" cy="240" r="3" opacity="0.55" />
          <circle cx="356" cy="150" r="2.5" opacity="0.4" />
          <circle cx="164" cy="150" r="2.5" opacity="0.4" />
        </g>
      </svg>
    </section>

    <section class="form-panel">
      <div class="form-wrap">
        <div class="mobile-brand">
          <div class="brand-mark">
            <RouterIcon :size="20" :stroke-width="2" />
          </div>
          <span>OpenWrt Console</span>
        </div>

        <header class="form-head">
          <h2>登录管理界面</h2>
          <p>使用路由器的管理员密码继续</p>
        </header>

        <form class="login-form" @submit.prevent="submit">
          <label class="field">
            <span class="field-label">用户名</span>
            <el-input
              v-model="username"
              size="large"
              autocomplete="username"
              placeholder="root"
              :prefix-icon="UserIcon"
              @keyup.enter="focusPassword"
            />
          </label>

          <label class="field">
            <span class="field-label">密码</span>
            <el-input
              ref="passwordRef"
              v-model="password"
              type="password"
              size="large"
              show-password
              autocomplete="current-password"
              placeholder="路由器管理密码"
              :prefix-icon="LockIcon"
              @keyup.enter="submit"
            />
          </label>

          <p v-if="error" class="form-error" role="alert">
            <AlertCircle :size="15" />
            {{ error }}
          </p>

          <el-button
            class="submit-btn"
            type="primary"
            size="large"
            native-type="submit"
            :loading="session.loggingIn"
          >
            登录
          </el-button>
        </form>

        <p class="form-note">
          <Lock :size="12" />
          凭据只用于在本机创建临时管理会话，不会离开路由器。
        </p>

        <div class="form-foot">
          <a href="/cgi-bin/luci/">应急入口：LuCI</a>
          <span>HTTPS 已启用</span>
        </div>
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
  import { onMounted, ref } from 'vue'
  import { useRoute, useRouter } from 'vue-router'
  import { AlertCircle, Activity, Lock, Router as RouterIcon, ShieldCheck, User, Wifi } from 'lucide-vue-next'
  import type { InputInstance } from 'element-plus'
  import { login, useSession } from '@/stores/session'

  defineOptions({ name: 'LoginView' })

  const router = useRouter()
  const route = useRoute()
  const session = useSession()

  const username = ref(localStorage.getItem('owrt-username') || 'root')
  const password = ref('')
  const error = ref('')
  const passwordRef = ref<InputInstance>()

  const UserIcon = User
  const LockIcon = Lock

  onMounted(() => {
    if (username.value && !password.value) {
      passwordRef.value?.focus()
    }
  })

  function focusPassword(): void {
    passwordRef.value?.focus()
  }

  async function submit(): Promise<void> {
    error.value = ''
    if (!username.value.trim()) {
      error.value = '请输入用户名'
      return
    }
    if (!password.value) {
      error.value = '请输入密码'
      return
    }

    try {
      await login(username.value.trim(), password.value)
      localStorage.setItem('owrt-username', username.value.trim())
      const redirect = typeof route.query.redirect === 'string' ? route.query.redirect : '/dashboard'
      await router.replace(redirect)
    } catch (err) {
      error.value = err instanceof Error ? err.message : '登录失败，请重试'
    }
  }
</script>

<style scoped>
  .login-page {
    display: grid;
    grid-template-columns: minmax(0, 1.05fr) minmax(0, 0.95fr);
    min-height: 100vh;
    background: var(--bg);
  }

  .brand-panel {
    position: relative;
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    padding: 48px;
    overflow: hidden;
    color: #fff;
    background:
      radial-gradient(900px 500px at 15% 0%, rgba(93, 135, 255, 0.34), transparent 62%),
      radial-gradient(700px 500px at 100% 100%, rgba(20, 184, 166, 0.2), transparent 60%),
      #0e1220;
  }

  .brand-grid {
    position: absolute;
    inset: 0;
    background-image: radial-gradient(rgba(255, 255, 255, 0.12) 1px, transparent 1px);
    background-size: 22px 22px;
    mask-image: linear-gradient(to bottom, rgba(0, 0, 0, 0.55), transparent 78%);
  }

  .brand-inner {
    position: relative;
    z-index: 1;
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    height: 100%;
    max-width: 460px;
  }

  .brand-top {
    display: flex;
    align-items: center;
    gap: 10px;
  }

  .brand-mark {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 36px;
    height: 36px;
    color: #fff;
    background: rgba(93, 135, 255, 0.9);
    border-radius: 10px;
  }

  .brand-name {
    font-size: 15px;
    font-weight: 600;
    letter-spacing: 0.01em;
  }

  .brand-copy {
    margin-top: auto;
    padding: 48px 0 36px;
  }

  .brand-copy h1 {
    color: #fff;
    font-size: clamp(30px, 3.4vw, 44px);
    font-weight: 600;
    line-height: 1.2;
    letter-spacing: -0.03em;
  }

  .brand-copy p {
    max-width: 34ch;
    margin-top: 16px;
    color: rgba(255, 255, 255, 0.66);
    font-size: var(--text-base);
    line-height: 1.7;
  }

  .feature-list {
    display: flex;
    flex-direction: column;
    gap: 12px;
    padding: 0;
    margin: 0 0 auto;
    list-style: none;
  }

  .feature-list li {
    display: flex;
    align-items: center;
    gap: 10px;
    color: rgba(255, 255, 255, 0.78);
    font-size: var(--text-sm);
  }

  .feature-list svg {
    color: #9db9ff;
  }

  .brand-foot {
    display: flex;
    align-items: center;
    gap: 10px;
    margin-top: 48px;
    color: rgba(255, 255, 255, 0.42);
    font-size: 11.5px;
    letter-spacing: 0.02em;
  }

  .brand-foot-sep {
    width: 1px;
    height: 10px;
    background: rgba(255, 255, 255, 0.22);
  }

  .brand-topology {
    position: absolute;
    right: -60px;
    bottom: 30px;
    width: 560px;
    color: #9db9ff;
    pointer-events: none;
  }

  .form-panel {
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 48px 32px;
    background: var(--bg);
  }

  .form-wrap {
    width: 100%;
    max-width: 368px;
  }

  .mobile-brand {
    display: none;
  }

  .form-head h2 {
    color: var(--text);
    font-size: 24px;
    font-weight: 600;
    line-height: 1.25;
    letter-spacing: -0.02em;
  }

  .form-head p {
    margin-top: 6px;
    color: var(--text-muted);
    font-size: var(--text-sm);
  }

  .login-form {
    display: flex;
    flex-direction: column;
    gap: 16px;
    margin-top: 28px;
  }

  .field {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .field-label {
    color: var(--text-secondary);
    font-size: var(--text-xs);
    font-weight: 500;
  }

  .login-form :deep(.el-input__wrapper) {
    min-height: 44px;
    padding: 0 12px;
    border-radius: var(--radius-md);
  }

  .form-error {
    display: flex;
    align-items: flex-start;
    gap: 7px;
    padding: 9px 11px;
    color: var(--danger-text);
    font-size: var(--text-xs);
    line-height: 1.5;
    background: var(--danger-soft);
    border-radius: var(--radius);
  }

  .form-error svg {
    flex-shrink: 0;
    margin-top: 1px;
  }

  .submit-btn {
    width: 100%;
    height: 44px;
    margin-top: 4px;
    font-size: var(--text-sm);
    border-radius: var(--radius-md);
  }

  .form-note {
    display: flex;
    align-items: center;
    gap: 5px;
    margin-top: 18px;
    color: var(--text-faint);
    font-size: 11.5px;
    line-height: 1.5;
  }

  .form-foot {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-top: 40px;
    padding-top: 16px;
    color: var(--text-faint);
    font-size: 11.5px;
    border-top: 1px solid var(--border);
  }

  .form-foot a {
    color: var(--text-muted);
  }

  @media (max-width: 900px) {
    .login-page {
      grid-template-columns: minmax(0, 1fr);
    }

    .brand-panel {
      display: none;
    }

    .form-panel {
      align-items: flex-start;
      min-height: 100dvh;
      padding: 40px 20px;
    }

    .form-wrap {
      max-width: 400px;
      margin: 8vh auto 0;
    }

    .mobile-brand {
      display: flex;
      align-items: center;
      gap: 9px;
      margin-bottom: 32px;
      color: var(--text);
      font-size: 14px;
      font-weight: 600;
    }

    .mobile-brand .brand-mark {
      width: 32px;
      height: 32px;
      background: var(--brand);
      border-radius: 9px;
    }
  }

  @media (max-width: 640px) {
    .form-panel {
      padding: 28px 16px;
    }

    .form-wrap {
      margin-top: 3vh;
    }

    .form-foot {
      margin-top: 28px;
    }
  }
</style>
