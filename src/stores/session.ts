import { reactive } from 'vue'
import { getSessionId, SessionExpiredError, setSessionId, ubusCall } from '@/api/ubus'

interface SessionState {
  sid: string
  username: string
  expiresAt: number
  loggingIn: boolean
}

const initialSid = getSessionId()
if (initialSid && !localStorage.getItem('owrt-sid')) {
  // Migrate sessions stored by earlier builds in sessionStorage.
  setSessionId(initialSid)
}
// Earlier builds used a cookie for CGI auth; it is no longer needed.
document.cookie = 'owrt_sid=; Path=/; Max-Age=0'

const state = reactive<SessionState>({
  sid: initialSid,
  username: 'root',
  expiresAt: Number(localStorage.getItem('owrt-sid-exp') || 0),
  loggingIn: false
})

export function useSession() {
  return state
}

export function clearSession(): void {
  state.sid = ''
  state.expiresAt = 0
  setSessionId('')
  localStorage.removeItem('owrt-sid-exp')
  sessionStorage.removeItem('owrt-sid-exp')
  // Remove the legacy cookie used by earlier builds.
  document.cookie = 'owrt_sid=; Path=/; Max-Age=0'
}

export async function login(username: string, password: string): Promise<void> {
  state.loggingIn = true
  try {
    let response: Response
    try {
      response = await fetch('/cgi-bin/modern-login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
      })
    } catch {
      throw new Error('无法连接路由器，请确认已连接到路由器网络')
    }

    const data = (await response.json().catch(() => ({}))) as {
      sid?: string
      expires?: number
      error?: string
    }

    if (!response.ok || !data.sid) {
      throw new Error(data.error || '用户名或密码错误')
    }

    // The CGI asks the router for a 3600s session; keep the same fallback so a
    // response without `expires` does not shorten the session to 5 minutes.
    const expires = data.expires || 3600
    state.sid = data.sid
    state.expiresAt = Date.now() + expires * 1000
    setSessionId(data.sid)
    localStorage.setItem('owrt-sid-exp', String(state.expiresAt))
  } finally {
    state.loggingIn = false
  }
}

export async function logout(): Promise<void> {
  try {
    if (state.sid) await ubusCall('session', 'destroy', {})
  } catch {
    // The session may already be gone; clearing the local copy is enough.
  } finally {
    clearSession()
  }
}

let validation: Promise<boolean> | null = null

export function validateSession(): Promise<boolean> {
  if (!state.sid) return Promise.resolve(false)
  if (!validation) {
    // The login session has ACL access to system.* but not to session.get,
    // so a lightweight system call is the reliable liveness probe.
    validation = ubusCall('system', 'info', {})
      .then(() => true)
      .catch((err) => {
        // A transient Wi-Fi hiccup must not log the user out; only a real
        // ACL/session rejection invalidates the stored session.
        if (err instanceof SessionExpiredError) {
          clearSession()
          return false
        }
        return true
      })
      .finally(() => {
        validation = null
      })
  }
  return validation
}
