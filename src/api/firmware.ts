import { getSessionId } from './ubus'

/**
 * Firmware update center: check for official updates, read the release notes,
 * download the image and flash it. On top of that the page still offers the
 * manual installation and the configuration backup / restore.
 *
 * The rpcd session may read the board information, but it may neither flash a
 * firmware image nor write a configuration backup, so every action goes
 * through the root CGI `modern-sysupgrade`. The CGI validates the session,
 * whitelists the action and asks for a single use token before it touches the
 * flash or the configuration.
 *
 * The update check and the download need the internet. They run as background
 * jobs on the router, because the wiki page with the release notes is slow
 * and the router has no `timeout` command. The CGI answers with a job id
 * while the job is still running; the console then polls the job status.
 */

const CGI = '/cgi-bin/modern-sysupgrade'

/** The CGI refuses anything larger than 40 MiB. */
export const MAX_FIRMWARE_SIZE = 40 * 1024 * 1024

/** Where the CGI stores the uploaded image. */
export const FIRMWARE_PATH = '/tmp/openwrt-firmware.bin'

/** Where the CGI stores a configuration backup. */
export const BACKUP_PATH = '/tmp/openwrt-backup.tar.gz'

/** The CGI only accepts file names that match this pattern. */
export const FIRMWARE_NAME_PATTERN = /^[A-Za-z0-9._-]{1,64}$/

/** How long the console waits for a job of the router before it gives up. */
export const JOB_POLL_INTERVAL = 1500

/** The longest time the console polls a job of the router. */
export const JOB_TIMEOUT = 180_000

export type FirmwareAction =
  | 'info'
  | 'upload'
  | 'upgrade'
  | 'verify'
  | 'backup'
  | 'restore'
  | 'list-backups'
  | 'check-update'
  | 'download'
  | 'download-status'
  | 'check-status'

export interface FirmwareRelease {
  distribution: string
  version: string
  revision: string
  target: string
  description: string
  firmware_url?: string
}

export interface FirmwareBoard {
  kernel: string
  hostname: string
  system: string
  model: string
  board_name: string
  rootfs_type: string
}

export interface FirmwareFile {
  name: string
  path: string
  size: number
  mtime: number
}

/** The state of the last successful update check. */
export interface UpdateCheck {
  ok: boolean
  /** The version that is currently installed. */
  current_version: string
  /** The newest version that the official download server offers. */
  latest_version: string
  /** The target platform, e.g. `mediatek/filogic`. */
  target: string
  /** The hardware id, e.g. `vendor,model-name`. */
  id: string
  /** The model name of the router. */
  model: string
  /** The hardware id with the comma replaced by an underscore. */
  device: string
  /** The publication date of the release, `YYYY-MM-DD HH:MM:SS`. */
  published_at: string
  /** The publication date as it is written on the download server. */
  published_at_raw: string
  /** The publication date as a unix timestamp, 0 when it is unknown. */
  published_at_ts: number
  /** The size of the firmware image in bytes. */
  size: number
  /** The sha256 checksum of the firmware image. */
  sha256: string
  /** The address of the official image, empty when there is none. */
  download_url: string
  /** The address of the release notes in the wiki. */
  changelog_url: string
  /** The key points of the release notes, at most eight of them. */
  notes: string[]
  /** True when the official server offers a newer version. */
  upgradable: boolean
  /** The file name of the official image. */
  file_name: string
  /** The build time of the official image. */
  file_date: string
  /** A readable warning, empty when everything is fine. */
  warning: string
}

export interface FirmwareInfo {
  ok: boolean
  board: FirmwareBoard
  release: FirmwareRelease
  /** Firmware images that are currently stored in /tmp. */
  files: FirmwareFile[]
  /** Configuration backups that are currently stored in /tmp. */
  backups: FirmwareFile[]
  /** The result of the last update check, null when there was none. */
  update: UpdateCheck | null
  /** The unix timestamp of the last update check, 0 when there was none. */
  update_checked_at: number
}

export interface FirmwareUploadResult {
  ok: boolean
  path: string
  size: number
  filename: string
}

/** The state of the firmware image that is on the router. */
export interface FirmwareVerification {
  ok: boolean
  /** True when an image is stored in /tmp. */
  exists: boolean
  path: string
  size: number
  /** The sha256 checksum of the image, empty when it could not be read. */
  sha256: string
}

/** The state of one check of the pre-flash verification. */
export type FirmwareCheckState = 'pass' | 'fail' | 'unknown'

export interface FirmwareCheck {
  /** What is checked, e.g. "文件大小". */
  label: string
  state: FirmwareCheckState
  /** The values that were compared. */
  detail: string
}

export interface FirmwareBackupResult {
  ok: boolean
  path: string
  size: number
}

export interface FirmwareStartedResult {
  ok: boolean
  started: boolean
}

/** The result of the firmware download. */
export interface FirmwareDownloadResult {
  ok: boolean
  /** Where the image was stored on the router. */
  path: string
  /** The size of the image in bytes. */
  size: number
  /** The sha256 checksum of the downloaded image. */
  sha256: string
  /** True when the checksum matched the official one. */
  verified: boolean
}

/** The state of a background job of the router. */
export interface FirmwareJobStatus {
  ok: boolean
  job_id: string
  status: 'running' | 'done' | 'failed' | 'timeout'
  /** The bytes that are already on the router. */
  bytes: number
  /** The expected number of bytes. */
  total: number
  /** The payload of the job, null while it is still running. */
  result: Record<string, unknown> | null
}

/** The outcome of an action that may still be running in the background. */
export interface FirmwareJobOutcome {
  /** The raw payload of the job, null while it is still running. */
  result: Record<string, unknown> | null
  /** The id of the job, empty when the work is already done. */
  jobId: string
  /** True while the router is still working on the job. */
  pending: boolean
}

export class FirmwareError extends Error {
  code: string

  constructor(message: string, code = 'failed') {
    super(message)
    this.name = 'FirmwareError'
    this.code = code
  }
}

const ERROR_TEXT: Record<string, string> = {
  unauthorized: '登录状态已失效，请重新登录',
  'unsupported operation': '不支持的操作',
  'missing action': '缺少操作名称',
  'missing firmware file name': '缺少固件文件名',
  'missing backup path': '缺少备份路径',
  'backup file not found': '备份文件不存在',
  'token invalid or expired': '令牌无效或已过期',
  'firmware file too large': '固件文件超过 40MB 上限',
  network: '无法连接路由器，请检查网络连接'
}

/** The CGI rejects every other file name, so the page checks it up front. */
export function isValidFirmwareName(name: string): boolean {
  return FIRMWARE_NAME_PATTERN.test(name) && /\.(bin|tar|img|gz|itb)$/i.test(name)
}

/**
 * Turns a CGI error code into a readable message. The CGI answers with a
 * Chinese text of its own, which is kept when it is not one of the known
 * English codes.
 */
function messageFor(code: string, fallback: string): string {
  const mapped = ERROR_TEXT[code]
  if (mapped) return mapped
  if (code && /[一-鿿]/.test(code)) return code
  return fallback || code
}

function sessionId(): string {
  const sid = getSessionId()
  if (!sid) {
    window.dispatchEvent(new Event('owrt:session-expired'))
    throw new FirmwareError('登录状态已失效，请重新登录', 'unauthorized')
  }
  return sid
}

function parsePayload(text: string): Record<string, unknown> {
  if (!text) return {}
  try {
    const parsed = JSON.parse(text) as unknown
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>
    }
  } catch {
    /* fall through: the caller reports a generic error */
  }
  return {}
}

function stringField(payload: Record<string, unknown>, key: string, fallback = ''): string {
  const value = payload[key]
  if (typeof value === 'string') return value
  if (typeof value === 'number' && Number.isFinite(value)) return String(value)
  return fallback
}

function numberField(payload: Record<string, unknown>, key: string): number {
  const value = payload[key]
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string') {
    const parsed = Number(value)
    if (Number.isFinite(parsed)) return parsed
  }
  return 0
}

function booleanField(payload: Record<string, unknown>, key: string): boolean {
  return payload[key] === true
}

function stringList(payload: Record<string, unknown>, key: string): string[] {
  const raw = payload[key]
  if (!Array.isArray(raw)) return []
  const list: string[] = []
  for (const item of raw) {
    if (typeof item === 'string' && item) list.push(item)
  }
  return list
}

function fileList(payload: Record<string, unknown>, key: string): FirmwareFile[] {
  const raw = payload[key]
  if (!Array.isArray(raw)) return []
  const files: FirmwareFile[] = []
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue
    const record = item as Record<string, unknown>
    files.push({
      name: stringField(record, 'name'),
      path: stringField(record, 'path'),
      size: numberField(record, 'size'),
      mtime: numberField(record, 'mtime')
    })
  }
  return files
}

/** Reads the payload of an update check. */
export function parseUpdateCheck(payload: Record<string, unknown>): UpdateCheck {
  return {
    ok: true,
    current_version: stringField(payload, 'current_version'),
    latest_version: stringField(payload, 'latest_version'),
    target: stringField(payload, 'target'),
    id: stringField(payload, 'id'),
    model: stringField(payload, 'model'),
    device: stringField(payload, 'device'),
    published_at: stringField(payload, 'published_at'),
    published_at_raw: stringField(payload, 'published_at_raw'),
    published_at_ts: numberField(payload, 'published_at_ts'),
    size: numberField(payload, 'size'),
    sha256: stringField(payload, 'sha256'),
    download_url: stringField(payload, 'download_url'),
    changelog_url: stringField(payload, 'changelog_url'),
    notes: stringList(payload, 'notes'),
    upgradable: booleanField(payload, 'upgradable'),
    file_name: stringField(payload, 'file_name'),
    file_date: stringField(payload, 'file_date'),
    warning: stringField(payload, 'warning')
  }
}

/** Reads the payload of a firmware download. */
export function parseDownloadResult(payload: Record<string, unknown>): FirmwareDownloadResult {
  return {
    ok: true,
    path: stringField(payload, 'path', FIRMWARE_PATH),
    size: numberField(payload, 'size'),
    sha256: stringField(payload, 'sha256'),
    verified: booleanField(payload, 'verified')
  }
}

/** Runs one CGI action that carries a JSON body. */
async function callCgi<T>(
  action: FirmwareAction,
  params: Record<string, string> = {}
): Promise<T> {
  const sid = sessionId()
  // Only the session id and the action travel in the query: both are URL safe
  // by contract. Every other parameter goes into the JSON body, because the
  // CGI reads the raw value there (a query string would percent encoded).
  const query = new URLSearchParams({ sid, action })

  let response: Response
  const controller = new AbortController()
  const timer = window.setTimeout(() => controller.abort(), 15000)
  try {
    response = await fetch(`${CGI}?${query.toString()}`, {
      method: 'POST',
      credentials: 'same-origin',
      cache: 'no-store',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, ...params }),
      signal: controller.signal
    })
  } catch {
    throw new FirmwareError(ERROR_TEXT.network, 'network')
  } finally {
    window.clearTimeout(timer)
  }

  if (response.status === 401) {
    window.dispatchEvent(new Event('owrt:session-expired'))
    throw new FirmwareError(ERROR_TEXT.unauthorized, 'unauthorized')
  }

  const text = await response.text()
  const payload = parsePayload(text)

  if (!response.ok || payload.ok === false) {
    const code = stringField(payload, 'error', 'failed')
    throw new FirmwareError(messageFor(code, `操作失败（HTTP ${response.status}）`), code)
  }

  return payload as unknown as T
}

/** Board information plus the firmware images and backups stored in /tmp. */
export async function fetchFirmwareInfo(): Promise<FirmwareInfo> {
  const payload = await callCgi<Record<string, unknown>>('info')
  const board = (payload.board ?? {}) as Record<string, unknown>
  const release = (payload.release ?? {}) as Record<string, unknown>
  const update = payload.update
  const hasUpdate = Boolean(update) && typeof update === 'object' && !Array.isArray(update)

  return {
    ok: true,
    board: {
      kernel: stringField(board, 'kernel'),
      hostname: stringField(board, 'hostname'),
      system: stringField(board, 'system'),
      model: stringField(board, 'model'),
      board_name: stringField(board, 'board_name'),
      rootfs_type: stringField(board, 'rootfs_type')
    },
    release: {
      distribution: stringField(release, 'distribution'),
      version: stringField(release, 'version'),
      revision: stringField(release, 'revision'),
      target: stringField(release, 'target'),
      description: stringField(release, 'description'),
      firmware_url: stringField(release, 'firmware_url')
    },
    files: fileList(payload, 'files'),
    backups: fileList(payload, 'backups'),
    update: hasUpdate ? parseUpdateCheck(update as Record<string, unknown>) : null,
    update_checked_at: numberField(payload, 'update_checked_at')
  }
}

/**
 * Asks the official download server whether there is a newer release. The
 * check needs three round trips and the wiki is slow, so the router may still
 * be working on it when the answer arrives: the outcome then carries the job
 * id and the console polls the job status.
 */
export async function checkForUpdate(): Promise<FirmwareJobOutcome> {
  const payload = await callCgi<Record<string, unknown>>('check-update')
  const jobId = stringField(payload, 'job_id')
  if (payload.pending === true && jobId) {
    return { result: null, jobId, pending: true }
  }
  return { result: payload, jobId: '', pending: false }
}

/** Reads the state of a background job of the router. */
export async function fetchJobStatus(jobId: string): Promise<FirmwareJobStatus> {
  const payload = await callCgi<Record<string, unknown>>('download-status', { job_id: jobId })
  const raw = payload.result
  const hasResult = Boolean(raw) && typeof raw === 'object' && !Array.isArray(raw)
  const state = stringField(payload, 'status', 'running')

  return {
    ok: true,
    job_id: stringField(payload, 'job_id', jobId),
    status:
      state === 'done' || state === 'failed' || state === 'timeout' ? state : 'running',
    bytes: numberField(payload, 'bytes'),
    total: numberField(payload, 'total'),
    result: hasResult ? (raw as Record<string, unknown>) : null
  }
}

/**
 * Downloads the official firmware image to /tmp and verifies its checksum.
 * The download is a background job on the router, so the outcome may carry a
 * job id while the image is still on its way.
 */
export async function downloadFirmware(
  downloadUrl: string,
  sha256: string,
  size: number
): Promise<FirmwareJobOutcome> {
  const payload = await callCgi<Record<string, unknown>>('download', {
    download_url: downloadUrl,
    sha256,
    size: String(Math.max(0, Math.round(size)))
  })
  const jobId = stringField(payload, 'job_id')
  if (payload.pending === true && jobId) {
    return { result: null, jobId, pending: true }
  }
  return { result: payload, jobId: '', pending: false }
}

/**
 * Uploads a firmware image. The request body is the raw file (no multipart)
 * and the file name travels in the `X-Filename` header; the CGI stores the
 * image in /tmp and answers with the path and the size.
 */
export function uploadFirmwareImage(
  file: File,
  onProgress?: (percent: number) => void
): Promise<FirmwareUploadResult> {
  const sid = sessionId()
  const query = new URLSearchParams({
    sid,
    action: 'upload',
    filename: file.name
  })

  return new Promise<FirmwareUploadResult>((resolve, reject) => {
    const request = new XMLHttpRequest()
    request.open('POST', `${CGI}?${query.toString()}`, true)
    request.withCredentials = true
    request.responseType = 'text'
    request.setRequestHeader('Content-Type', 'application/octet-stream')
    request.setRequestHeader('X-Filename', file.name)

    request.upload.onprogress = (event) => {
      if (!onProgress || !event.lengthComputable) return
      onProgress(Math.min(100, Math.round((event.loaded / event.total) * 100)))
    }

    request.onload = () => {
      const payload = parsePayload(request.responseText)
      if (request.status === 401) {
        window.dispatchEvent(new Event('owrt:session-expired'))
        reject(new FirmwareError(ERROR_TEXT.unauthorized, 'unauthorized'))
        return
      }
      if (request.status < 200 || request.status >= 300 || payload.ok === false) {
        const code = stringField(payload, 'error', 'failed')
        reject(new FirmwareError(messageFor(code, `上传失败（HTTP ${request.status}）`), code))
        return
      }
      resolve({
        ok: true,
        path: stringField(payload, 'path', FIRMWARE_PATH),
        size: numberField(payload, 'size'),
        filename: stringField(payload, 'filename', file.name)
      })
    }

    request.onerror = () => reject(new FirmwareError(ERROR_TEXT.network, 'network'))
    request.onabort = () => reject(new FirmwareError('上传已取消', 'aborted'))
    request.ontimeout = () => reject(new FirmwareError('上传超时，请重试', 'network'))
    // Without a timeout the ontimeout handler never fires and a stalled
    // upload hangs forever. A firmware image can be large, so allow 10 min.
    request.timeout = 10 * 60 * 1000

    request.send(file)
  })
}

/** Starts the flash. The token is single use and valid for 120 seconds. */
export async function startFirmwareUpgrade(token: string): Promise<FirmwareStartedResult> {
  const payload = await callCgi<Record<string, unknown>>('upgrade', { token })
  return { ok: true, started: payload.started === true }
}

/**
 * Reads the size and the checksum of the firmware image that is on the
 * router. The console compares them with the official ones before it lets
 * the user flash.
 */
export async function verifyFirmwareImage(): Promise<FirmwareVerification> {
  const payload = await callCgi<Record<string, unknown>>('verify')
  return {
    ok: true,
    exists: payload.exists === true,
    path: stringField(payload, 'path', FIRMWARE_PATH),
    size: numberField(payload, 'size'),
    sha256: stringField(payload, 'sha256')
  }
}

/** The official release page of a version. */
export function officialReleaseUrl(version: string): string {
  if (!version) return ''
  return `https://downloads.openwrt.org/releases/${encodeURIComponent(version)}/`
}

/** The official download page of the target platform of a version. */
export function officialTargetUrl(version: string, target: string): string {
  if (!version || !target) return ''
  // The target is a path like "mediatek/filogic": the slash has to stay a
  // slash, otherwise the download server does not find the directory.
  const path = target
    .split('/')
    .map((part) => encodeURIComponent(part))
    .join('/')
  return `https://downloads.openwrt.org/releases/${encodeURIComponent(version)}/targets/${path}/`
}

/** A record of the last flash, kept in the browser. */
export interface FlashRecord {
  /** Epoch in milliseconds. */
  at: number
  /** The version that was flashed. */
  version: string
  /** Where the image came from. */
  source: 'official' | 'manual'
}

const FLASH_KEY = 'owrt-firmware-flash'

/** The last flash of this browser, null when there was none. */
export function loadFlashRecord(): FlashRecord | null {
  try {
    const raw = localStorage.getItem(FLASH_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as unknown
    if (!parsed || typeof parsed !== 'object') return null
    const record = parsed as Record<string, unknown>
    const at = Number(record.at)
    if (!Number.isFinite(at) || at <= 0) return null
    return {
      at,
      version: typeof record.version === 'string' ? record.version : '',
      source: record.source === 'manual' ? 'manual' : 'official'
    }
  } catch {
    return null
  }
}

/** Remembers the last flash of this browser. */
export function saveFlashRecord(record: FlashRecord): void {
  try {
    localStorage.setItem(FLASH_KEY, JSON.stringify(record))
  } catch {
    /* the record is a convenience, a full storage must not break the page */
  }
}

/** Writes a configuration backup into /tmp. */
export async function createConfigurationBackup(
  path: string = BACKUP_PATH
): Promise<FirmwareBackupResult> {
  const payload = await callCgi<Record<string, unknown>>('backup', { path })
  return {
    ok: true,
    path: stringField(payload, 'path', path),
    size: numberField(payload, 'size')
  }
}

/** Lists the configuration backups that live in /tmp. */
export async function listConfigurationBackups(): Promise<FirmwareFile[]> {
  const payload = await callCgi<Record<string, unknown>>('list-backups')
  return fileList(payload, 'backups')
}

/** Restores a configuration backup; the router reboots afterwards. */
export async function restoreConfigurationBackup(
  path: string,
  token: string
): Promise<FirmwareStartedResult> {
  const payload = await callCgi<Record<string, unknown>>('restore', { path, token })
  return { ok: true, started: payload.started === true }
}
