import { getSessionId } from './ubus'

const CGI = '/cgi-bin/modern-shellcrash'

/**
 * ShellCrash / mihomo configuration for the modern console.
 *
 * The rpcd session may not touch `/etc/ShellCrash/configs/ShellCrash.cfg`,
 * may not restart the service and may not read the runtime configuration of
 * the core, so every action goes through the root CGI `modern-shellcrash`.
 *
 * Two secrets never leave the router:
 *   * the mihomo `secret` is only used by the CGI when it talks to the core
 *   * the subscription URL carries a token, the CGI only returns its host
 */

export type ShellCrashAction =
  | 'status'
  | 'config'
  | 'config-write'
  | 'service'
  | 'overrides'
  | 'override-toggle'
  | 'subs'
  | 'log'
  | 'crash'
  | 'ports'
  | 'heal'
  | 'sub-update'
  | 'sub-update-state'

/** The service actions the CGI accepts. */
export type ShellCrashServiceAction = 'start' | 'stop' | 'restart' | 'enable' | 'disable'

/** The override files the CGI is allowed to touch. */
export const SHELLCRASH_OVERRIDE_FILES = [
  'config.yaml',
  'proxies.yaml',
  'proxy-groups.yaml',
  'rules.yaml',
  'user.yaml'
] as const

export type ShellCrashOverrideFile = (typeof SHELLCRASH_OVERRIDE_FILES)[number]

/** The config keys the console may read and write. */
export const SHELLCRASH_CONFIG_KEYS = [
  'redir_mod',
  'dns_mod',
  'firewall_mod',
  'cn_ip_route',
  'cn_ipv6_route',
  'ipv6_support',
  'ipv6_redir',
  'ipv6_dns',
  'hosts_opt',
  'dns_protect',
  'sniffer',
  'quic_rj',
  'my_alias',
  'ecs_subnet',
  'firewall_area',
  'core_v',
  'crashcore',
  'url_id',
  'release_type',
  'hostdir',
  'disoverride'
] as const

export type ShellCrashConfigKey = (typeof SHELLCRASH_CONFIG_KEYS)[number]

/** The ports the core listens on, read from the runtime configuration. */
export interface ShellCrashPorts {
  mixed: number
  redir: number
  tproxy: number
  socks: number
  dns: number
  controller: number
}

export interface ShellCrashStatus {
  ok: boolean
  installed: boolean
  /** The core process is alive. */
  running: boolean
  /** The raw output of `/etc/init.d/shellcrash status`. */
  service_status: string
  pid: number
  /** The mihomo version, e.g. `v1.19.32`. */
  core_version: string
  /** The ShellCrash version, e.g. `1.9.5beta3`. */
  shellcrash_version: string
  redir_mod: string
  dns_mod: string
  firewall_mod: string
  ports: ShellCrashPorts
  subs_count: number
  /** The service starts on boot. */
  autostart: boolean
  /** `<action> <rc> <timestamp>` of the last service action. */
  last_action: string
}

export interface ShellCrashConfigResult {
  ok: boolean
  values: Record<string, string>
  /** The host of the subscription URL, without the token. */
  url_host: string
  /** The core has a secret configured. */
  secret_set: boolean
}

/**
 * The state of one override file.
 *
 * `active` means `xxx.yaml` exists and is merged into the runtime
 * configuration, `disabled` means only `xxx.yaml.bak` is there (the file was
 * moved aside and is not merged), `missing` means neither exists.
 */
export type ShellCrashOverrideState = 'active' | 'disabled' | 'missing'

export interface ShellCrashOverrideEntry {
  name: string
  /** The file is merged into the runtime configuration. */
  enabled: boolean
  /** Whether the file is merged, moved aside or absent. */
  state: ShellCrashOverrideState
  size: number
  mtime: string
  mtime_epoch: number
  /** The first comment line of the file: what it is for. */
  summary: string
  /** The header comment of the file. */
  description: string
  /** The number of lines of the file. */
  lines: number
}

export interface ShellCrashOverridesResult {
  ok: boolean
  files: ShellCrashOverrideEntry[]
  /** The cfg carries `disoverride=1`, every override is ignored. */
  global_disabled: boolean
}

export interface ShellCrashSubscription {
  index: number
  alias: string
  /** The name of the update source in the servers list. */
  source: string
  /** The base url of the update source. */
  source_url: string
  url_id: string
  host: string
  masked: string
  /** The link is active in the config (a commented out link is not). */
  enabled: boolean
  /** The nodes the subscription adds to the running configuration. */
  entries: number
}

export interface ShellCrashProvider {
  name: string
  host: string
  masked: string
  /** The nodes of the pool the provider is merged into. */
  entries: number
  enabled: boolean
}

export interface ShellCrashSubsResult {
  ok: boolean
  count: number
  url_count: number
  provider_count: number
  url_id: string
  update_source: string
  /** The base url of the update source. */
  update_url: string
  alias: string
  /** The nodes in the running configuration. */
  node_count: number
  /** The nodes the user added by hand. */
  custom_count: number
  subs: ShellCrashSubscription[]
  providers: ShellCrashProvider[]
}

export interface ShellCrashLogResult {
  ok: boolean
  file: string
  lines: string[]
  files: Array<{ name: string; path: string; size: number }>
}

export interface ShellCrashCrashResult {
  ok: boolean
  running: boolean
  pid: number
  core_version: string
  /** Epoch seconds of the last start. */
  start_time: number
  uptime: number
  alive_ts: number
  /** Seconds since the guardian saw the core the last time. */
  alive_age: number
  probe_ts: number
  last_fallback_heal: number
  start_error: boolean
  guardian_cron: string
  guardian_log: string[]
}

export interface ShellCrashWriteResult {
  ok: boolean
  changed?: string[]
  backup?: string
  message?: string
}

/** One of the five ports the console watches. */
export interface ShellCrashPortEntry {
  port: number
  /** Something listens on the port. */
  listening: boolean
  /** The pid of the process that owns the port, 0 when it is free. */
  pid: number
  /** The name of the process that owns the port. */
  process: string
}

export interface ShellCrashPortsResult {
  ok: boolean
  ports: ShellCrashPortEntry[]
}

/** One entry of the self healing history. */
export interface ShellCrashHealEntry {
  /** Epoch seconds of the action. */
  time: number
  level: 'info' | 'warning' | 'error' | 'success'
  message: string
  /** The file the information comes from. */
  source: string
}

export interface ShellCrashHealResult {
  ok: boolean
  entries: ShellCrashHealEntry[]
}

export interface ShellCrashSubUpdateResult {
  ok: boolean
  /** The task was handed over to the router. */
  started?: boolean
  /** The task is still running. */
  running?: boolean
  /** The task finished. */
  done?: boolean
  /** The task finished without an error. */
  success?: boolean
  /** The exit code of the task. */
  rc?: number
  /** Epoch seconds when the task was started. */
  started_at?: number
  /** Epoch seconds when the task finished. */
  finished_at?: number
  /** The tail of the task log. */
  lines?: string[]
  message?: string
}

export interface ShellCrashServiceResult {
  ok: boolean
  action?: string
  started?: boolean
  autostart?: boolean
  message?: string
}

export class ShellCrashError extends Error {
  code: string

  constructor(message: string, code = 'failed') {
    super(message)
    this.name = 'ShellCrashError'
    this.code = code
  }
}

const ERROR_TEXT: Record<string, string> = {
  unauthorized: '登录状态已失效，请重新登录',
  'unsupported operation': '不支持的操作',
  'unsupported service': '不支持的服务',
  'unsupported action': '不支持的动作',
  'unsupported override file': '不支持的覆写文件',
  'missing enable=yes or enable=no': '缺少 enable=yes 或 enable=no',
  'needs confirm=yes': '需要二次确认',
  'invalid log file name': '日志文件名不合法',
  'no change': '没有需要修改的项',
  network: '无法连接路由器，请检查网络连接'
}

function explain(code: string | undefined, fallback: string): string {
  if (!code) return fallback
  if (ERROR_TEXT[code]) return ERROR_TEXT[code]
  // The CGI answers with a readable Chinese message; only a machine code
  // falls back to the generic text.
  return /[\u4e00-\u9fff]/.test(code) ? code : fallback
}

/** Runs one action of the ShellCrash CGI. */
export async function runShellCrashAction<T = unknown>(
  action: ShellCrashAction,
  params: Record<string, string | number | boolean | undefined> = {}
): Promise<T> {
  const sid = getSessionId()
  if (!sid) {
    window.dispatchEvent(new Event('owrt:session-expired'))
    throw new ShellCrashError(ERROR_TEXT.unauthorized, 'unauthorized')
  }

  const payload: Record<string, string> = {}
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === '') continue
    payload[key] = String(value)
  }

  let response: Response
  try {
    response = await fetch(`${CGI}?sid=${encodeURIComponent(sid)}`, {
      method: 'POST',
      credentials: 'same-origin',
      cache: 'no-store',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, params: payload })
    })
  } catch {
    throw new ShellCrashError(ERROR_TEXT.network, 'network')
  }

  if (response.status === 401) {
    window.dispatchEvent(new Event('owrt:session-expired'))
    throw new ShellCrashError(ERROR_TEXT.unauthorized, 'unauthorized')
  }

  const text = await response.text()
  if (!text.trim()) {
    // An empty body usually means the CGI was killed halfway (uhttpd kills a
    // script after 30 s). The write may already have happened, so the message
    // asks for a refresh instead of pretending the operation failed.
    throw new ShellCrashError(
      '路由器没有返回内容，请求可能超时。若刚重启过 ShellCrash，请刷新后确认配置是否已写入。',
      'empty-response'
    )
  }

  let result: { error?: string; ok?: boolean }
  try {
    result = JSON.parse(text) as { error?: string; ok?: boolean }
  } catch (err) {
    // The parser error names the offending position, which is the only way to
    // tell a truncated body from a body that carries a stray byte.
    const why = err instanceof Error ? err.message : String(err)
    const pos = /position (\d+)/.exec(why)
    const at = pos ? Number(pos[1]) : -1
    const around =
      at >= 0 && at < text.length
        ? `第 ${at} 个字符是 ${JSON.stringify(text[at])}（U+${text
            .charCodeAt(at)
            .toString(16)
            .toUpperCase()
            .padStart(4, '0')}）`
        : ''
    const flat = text.replace(/\s+/g, ' ').trim()
    const excerpt =
      flat.length > 160 ? `${flat.slice(0, 80)} … ${flat.slice(-80)}` : flat
    throw new ShellCrashError(
      `路由器返回的内容无法解析（${why}${around ? `；${around}` : ''}；共 ${text.length} 字符${
        excerpt ? `：${excerpt}` : ''
      }）。` + '请刷新后确认配置是否已写入，再决定是否重试。',
      'invalid-response'
    )
  }

  if (!response.ok) {
    const code = result?.error || 'failed'
    throw new ShellCrashError(explain(code, `操作失败（HTTP ${response.status}）`), code)
  }

  if (result.ok === false) {
    const code = result.error || 'failed'
    throw new ShellCrashError(explain(code, '操作失败'), code)
  }

  return result as unknown as T
}

/** The state of the service, the core and the listening ports. */
export async function fetchShellCrashStatus(): Promise<ShellCrashStatus> {
  const data = await runShellCrashAction<ShellCrashStatus>('status')
  return {
    ...data,
    ports: data.ports ?? {
      mixed: 0,
      redir: 0,
      tproxy: 0,
      socks: 0,
      dns: 0,
      controller: 0
    }
  }
}

/** The whitelisted config keys, with the secret and the token masked. */
export async function fetchShellCrashConfig(): Promise<ShellCrashConfigResult> {
  const data = await runShellCrashAction<ShellCrashConfigResult>('config')
  return { ...data, values: data.values ?? {} }
}

/**
 * Writes the given config keys. The CGI backs the file up and answers with
 * the name of the backup; the new values only take effect after a restart.
 */
export async function writeShellCrashConfig(
  changes: Record<string, string>
): Promise<ShellCrashWriteResult> {
  const params: Record<string, string | number | undefined> = { confirm: 'yes' }
  for (const [key, value] of Object.entries(changes)) params[key] = value
  return runShellCrashAction<ShellCrashWriteResult>('config-write', params)
}

/** Starts, stops, restarts the service or toggles the boot autostart. */
export async function runShellCrashService(
  action: ShellCrashServiceAction
): Promise<ShellCrashServiceResult> {
  return runShellCrashAction<ShellCrashServiceResult>('service', { action })
}

/** The override files and their state. */
export async function fetchShellCrashOverrides(): Promise<ShellCrashOverridesResult> {
  const data = await runShellCrashAction<ShellCrashOverridesResult>('overrides')
  return { ...data, files: data.files ?? [] }
}

/**
 * Enables or disables one override file. ShellCrash merges the files in
 * `/etc/ShellCrash/yamls` while the core starts, so a disabled file is
 * moved aside and restored again when it is enabled.
 */
export async function toggleShellCrashOverride(
  file: ShellCrashOverrideFile,
  enable: boolean
): Promise<ShellCrashWriteResult> {
  return runShellCrashAction<ShellCrashWriteResult>('override-toggle', {
    file,
    enable: enable ? 'yes' : 'no',
    confirm: 'yes'
  })
}

/** The subscriptions and the providers, without their tokens. */
export async function fetchShellCrashSubs(): Promise<ShellCrashSubsResult> {
  const data = await runShellCrashAction<ShellCrashSubsResult>('subs')
  return {
    ...data,
    subs: data.subs ?? [],
    providers: data.providers ?? []
  }
}

/** The tail of one log file. */
export async function fetchShellCrashLog(file?: string): Promise<ShellCrashLogResult> {
  const data = await runShellCrashAction<ShellCrashLogResult>('log', { file })
  return { ...data, lines: data.lines ?? [], files: data.files ?? [] }
}

/** The state of the core and of the guardian. */
export async function fetchShellCrashCrash(): Promise<ShellCrashCrashResult> {
  const data = await runShellCrashAction<ShellCrashCrashResult>('crash')
  return { ...data, guardian_log: data.guardian_log ?? [] }
}

/**
 * Who listens on the five ShellCrash ports. The router has no `ss`, so the
 * CGI parses `netstat -lntp`; a port without an owner is free.
 */
export async function fetchShellCrashPorts(): Promise<ShellCrashPortsResult> {
  const data = await runShellCrashAction<ShellCrashPortsResult>('ports')
  return { ...data, ports: data.ports ?? [] }
}

/** The self healing history of the guardian and of the legacy watchdog. */
export async function fetchShellCrashHeal(): Promise<ShellCrashHealResult> {
  const data = await runShellCrashAction<ShellCrashHealResult>('heal')
  return { ...data, entries: data.entries ?? [] }
}

/**
 * Starts the hot update of the online subscription. It runs on the router
 * and takes a while, so the browser polls {@link fetchShellCrashSubUpdate}.
 */
export async function startShellCrashSubUpdate(): Promise<ShellCrashSubUpdateResult> {
  return runShellCrashAction<ShellCrashSubUpdateResult>('sub-update', { confirm: 'yes' })
}

/** The state of the running subscription update. */
export async function fetchShellCrashSubUpdate(): Promise<ShellCrashSubUpdateResult> {
  const data = await runShellCrashAction<ShellCrashSubUpdateResult>('sub-update-state')
  return { ...data, lines: data.lines ?? [] }
}
