<template>
  <div class="page">
    <PageHeader title="固件更新中心" description="检测官方更新、查看更新日志、一键下载并刷写">
      <el-button :icon="RefreshCw" :loading="refreshing" @click="refresh">刷新</el-button>
    </PageHeader>

    <el-alert v-if="error" type="error" :title="error" :closable="false" show-icon />
    <el-alert v-if="notice" type="warning" :title="notice" :closable="false" show-icon />

    <div class="fw-record">
      <History :size="15" class="fw-record-icon" />
      <span class="fw-record-label">上次刷写</span>
      <span class="fw-record-value num">{{ flashRecordText }}</span>
      <span v-if="flashRecord" class="fw-record-meta">
        来源：{{ flashRecord.source === 'official' ? '官方镜像' : '手动上传' }}
        <template v-if="flashRecord.version"> · 版本 {{ flashRecord.version }}</template>
      </span>
    </div>

    <template v-if="loaded">
      <div class="grid grid-4">
        <StatCard
          label="当前版本"
          :value="release.version || '—'"
          :meta="release.description || release.distribution || '固件信息不可用'"
          :icon="Package"
          tone="brand"
        />
        <StatCard
          label="最新版本"
          :value="latestVersion"
          :meta="latestMeta"
          :icon="Sparkles"
          :tone="latestTone"
        />
        <StatCard
          label="目标平台"
          :value="release.target || '—'"
          :meta="board.model || board.board_name || '—'"
          :icon="Cpu"
          tone="neutral"
        />
        <StatCard
          label="固件文件"
          :value="firmwareState"
          :meta="firmwareMeta"
          :icon="HardDrive"
          :tone="firmwareTone"
        />
      </div>

      <PanelCard title="更新状态" subtitle="向 OpenWrt 官方下载站询问是否有适用于本机的新版本">
        <template #actions>
          <el-button type="primary" :icon="RefreshCw" :loading="checking" @click="handleCheck">
            检查更新
          </el-button>
        </template>

        <!-- 正在检测 -->
        <div v-if="checking && !update" class="fw-checking">
          <el-skeleton :rows="3" animated />
          <p class="fw-checking-note">
            正在访问 OpenWrt 官方下载站并读取更新日志，检测通常需要 10–30 秒。
          </p>
        </div>

        <!-- 检测失败 -->
        <div v-else-if="checkError" class="fw-state">
          <el-alert type="error" :title="checkError" description="请检查路由器的外网连接与代理设置后重试。" :closable="false" show-icon />
          <div class="fw-state-actions">
            <el-button type="primary" plain :icon="RefreshCw" @click="handleCheck">重试</el-button>
          </div>
        </div>

        <!-- 从未检测 -->
        <EmptyState
          v-else-if="!update"
          :icon="Sparkles"
          title="尚未检测更新"
          description="点击右上角「检查更新」，控制台会访问 OpenWrt 官方下载站，告诉你有没有新版本以及更新了什么。"
        />

        <!-- 已是最新版本 -->
        <div v-else-if="!update.upgradable" class="fw-state">
          <el-alert
            type="success"
            :title="`已是最新版本（${update.latest_version}）`"
            :description="`上次检测：${checkedAtText}。官方源暂未提供比当前版本更新的固件。`"
            :closable="false"
            show-icon
          />
          <dl class="fw-meta">
            <div class="fw-meta-row">
              <dt class="fw-meta-label">当前版本</dt>
              <dd class="fw-meta-value num">{{ update.current_version }}</dd>
            </div>
            <div class="fw-meta-row">
              <dt class="fw-meta-label">官方最新</dt>
              <dd class="fw-meta-value num">{{ update.latest_version }}</dd>
            </div>
            <div class="fw-meta-row">
              <dt class="fw-meta-label">发布日期</dt>
              <dd class="fw-meta-value num">{{ publishedText }}</dd>
            </div>
            <div class="fw-meta-row">
              <dt class="fw-meta-label">目标平台</dt>
              <dd class="fw-meta-value mono-value">{{ update.target || '—' }}</dd>
            </div>
            <div class="fw-meta-row">
              <dt class="fw-meta-label">检查时间</dt>
              <dd class="fw-meta-value num">{{ checkedAtText }}</dd>
            </div>
          </dl>
          <p v-if="update.notes.length" class="fw-subtle">当前版本的更新日志：</p>
          <ul v-if="update.notes.length" class="fw-notes">
            <li v-for="(note, index) in update.notes" :key="index">{{ note }}</li>
          </ul>
          <div class="fw-links">
            <a
              v-if="releasePageUrl"
              class="fw-link"
              :href="releasePageUrl"
              target="_blank"
              rel="noopener"
            >
              官方发布页
            </a>
            <a
              v-if="targetPageUrl"
              class="fw-link"
              :href="targetPageUrl"
              target="_blank"
              rel="noopener"
            >
              官方下载目录
            </a>
            <a
              v-if="update.download_url"
              class="fw-link"
              :href="update.download_url"
              target="_blank"
              rel="noopener"
            >
              官方镜像
            </a>
            <a
              v-if="update.changelog_url"
              class="fw-link"
              :href="update.changelog_url"
              target="_blank"
              rel="noopener"
            >
              完整更新日志
            </a>
          </div>
          <p class="fw-subtle">
            上次检查：{{ checkedAtText }}。官方源暂未提供比当前版本更新的固件，可在上面的链接查看官方发布说明。
          </p>
        </div>

        <!-- 检测到新版本 -->
        <div v-else class="fw-state">
          <div class="fw-compare">
            <div class="fw-compare-side">
              <span class="fw-compare-label">当前版本</span>
              <span class="fw-compare-version num">{{ update.current_version }}</span>
            </div>
            <ArrowRight class="fw-compare-arrow" :size="18" :stroke-width="2" />
            <div class="fw-compare-side">
              <span class="fw-compare-label">最新版本</span>
              <span class="fw-compare-version num fw-compare-new">{{ update.latest_version }}</span>
            </div>
            <el-tag type="warning" size="small" effect="light">可升级</el-tag>
          </div>

          <el-alert
            v-if="update.warning"
            type="warning"
            :title="update.warning"
            :closable="false"
            show-icon
          />

          <dl class="fw-meta">
            <div class="fw-meta-row">
              <dt class="fw-meta-label">发布日期</dt>
              <dd class="fw-meta-value num">{{ publishedText }}</dd>
            </div>
            <div class="fw-meta-row">
              <dt class="fw-meta-label">文件大小</dt>
              <dd class="fw-meta-value num">{{ formatBytes(update.size) }}</dd>
            </div>
            <div class="fw-meta-row">
              <dt class="fw-meta-label">目标平台</dt>
              <dd class="fw-meta-value mono-value">{{ update.target || '—' }}</dd>
            </div>
            <div class="fw-meta-row">
              <dt class="fw-meta-label">文件名称</dt>
              <dd class="fw-meta-value mono-value fw-break">{{ update.file_name || '—' }}</dd>
            </div>
            <div class="fw-meta-row">
              <dt class="fw-meta-label">SHA-256</dt>
              <dd class="fw-meta-value mono-value fw-break">{{ update.sha256 || '—' }}</dd>
            </div>
          </dl>

          <div v-if="update.notes.length" class="fw-notes-block">
            <p class="fw-subtle">更新内容</p>
            <ul class="fw-notes">
              <li v-for="(note, index) in update.notes" :key="index">{{ note }}</li>
            </ul>
          </div>
          <a
            v-if="update.changelog_url"
            class="fw-link"
            :href="update.changelog_url"
            target="_blank"
            rel="noopener"
          >
            查看完整更新日志
          </a>

          <el-alert
            v-if="downloadError"
            type="error"
            :title="downloadError"
            :closable="false"
            show-icon
          />

          <div v-if="downloading || downloaded" class="fw-progress">
            <div class="row-between">
              <span class="meta-label">下载到路由器</span>
              <span class="num fw-percent">{{ downloadPercent }}%</span>
            </div>
            <el-progress
              :percentage="downloadPercent"
              :status="downloaded ? 'success' : undefined"
              :stroke-width="8"
              :show-text="false"
            />
            <p class="fw-progress-note">
              {{
                downloading
                  ? `正在下载 ${update.file_name || '固件镜像'}，路由器会校验 SHA-256 后再保存。`
                  : `固件已保存到 ${downloaded?.path || FIRMWARE_PATH}（${formatBytes(downloaded?.size)}），校验${downloaded?.verified ? '通过' : '未通过'}。`
              }}
            </p>
          </div>

          <div v-if="downloaded || firmwareFile" class="fw-verify">
            <div class="row-between">
              <span class="meta-label">刷写前校验</span>
              <el-button size="small" :loading="verifying" @click="refreshVerification">
                重新校验
              </el-button>
            </div>
            <FwVerifyChecks :checks="checks" />
            <el-alert
              v-if="blockingReason"
              type="error"
              :title="`校验未通过，已禁止刷写：${blockingReason}`"
              :closable="false"
              show-icon
            />
          </div>

          <div class="fw-actions">
            <el-button
              v-if="!downloaded"
              type="primary"
              :icon="FileDown"
              :loading="downloading"
              :disabled="!update.download_url"
              @click="handleDownload"
            >
              下载固件
            </el-button>
            <el-button
              v-else
              type="danger"
              plain
              :icon="UploadCloud"
              :loading="flashing"
              :disabled="blockingReason !== ''"
              @click="handleFlashUpdate"
            >
              校验并刷写
            </el-button>
            <el-button
              :icon="RefreshCw"
              :loading="downloading"
              :disabled="flashing"
              @click="handleDownload"
            >
              重新下载
            </el-button>
          </div>

          <p class="fw-danger-note">
            刷写会覆盖当前固件并重启路由器，未备份的配置不会保留。刷写过程中请勿断电。
          </p>
        </div>
      </PanelCard>

      <PanelCard title="手动安装" subtitle="从本机选择固件镜像上传到路由器后刷写">
        <template #actions>
          <el-button
            :icon="manualOpen ? ChevronUp : ChevronDown"
            @click="manualOpen = !manualOpen"
          >
            {{ manualOpen ? '收起' : '展开' }}
          </el-button>
        </template>

        <div v-if="!manualOpen" class="fw-subtle">
          手动安装适用于官方源没有对应镜像、或者需要安装第三方编译固件的情况。
        </div>

        <div v-else>
          <div class="fw-guide">
            <p class="fw-guide-title">如何取得固件</p>
            <ol class="fw-guide-list">
              <li>
                在
                <a href="https://downloads.openwrt.org/" target="_blank" rel="noopener">
                  OpenWrt 官方下载站
                </a>
                按当前设备型号与目标平台（<span class="mono-value">{{ release.target || '—' }}</span
                >）选择对应的 <span class="mono-value">sysupgrade</span> 镜像。
              </li>
              <li>
                镜像文件通常以 <span class="mono-value">-sysupgrade.bin</span> 结尾；文件名只能包含
                字母、数字、点、下划线和连字符，且必须以 .bin 或 .tar 结尾。
              </li>
              <li>刷写前请先生成一次配置备份，并确保供电稳定，过程中不要断电。</li>
            </ol>
          </div>

          <div class="fw-picker">
            <input
              ref="fileInput"
              class="fw-file-input"
              type="file"
              accept=".bin,.tar"
              @change="onFileSelected"
            />
            <el-button :icon="Upload" :disabled="uploading" @click="pickFile">
              选择固件文件
            </el-button>
            <span v-if="selectedFile" class="fw-file-name truncate">
              <span class="mono-value">{{ selectedFile.name }}</span>
              <span class="muted"> · {{ formatBytes(selectedFile.size) }}</span>
            </span>
            <span v-else class="muted text-sm">尚未选择固件文件</span>
          </div>

          <el-alert v-if="fileError" type="error" :title="fileError" :closable="false" show-icon />

          <div v-if="uploading || uploaded" class="fw-progress">
            <div class="row-between">
              <span class="meta-label">上传到路由器</span>
              <span class="num fw-percent">{{ uploadPercent }}%</span>
            </div>
            <el-progress
              :percentage="uploadPercent"
              :status="progressStatus"
              :stroke-width="8"
              :show-text="false"
            />
            <p class="fw-progress-note">{{ uploadNote }}</p>
          </div>

          <div v-if="uploaded" class="fw-verify">
            <div class="row-between">
              <span class="meta-label">校验结果</span>
              <el-button size="small" :loading="verifying" @click="verifyUploaded">重新校验</el-button>
            </div>
            <p class="fw-verify-line">
              <el-tag :type="verified ? 'success' : 'warning'" size="small" effect="light">
                {{ verified ? '校验通过' : '待校验' }}
              </el-tag>
              <span class="mono-value">{{ uploaded.path }}</span>
              <span class="muted">{{ formatBytes(uploaded.size) }}</span>
            </p>
            <p v-if="verifyNote" class="fw-verify-note">{{ verifyNote }}</p>
            <FwVerifyChecks :checks="checks" />
            <el-alert
              v-if="blockingReason"
              type="error"
              :title="`校验未通过，已禁止刷写：${blockingReason}`"
              :closable="false"
              show-icon
            />
          </div>

          <div class="fw-confirm">
            <SysFormField
              label="确认词"
              for="fw-upgrade-confirm"
              required
              :error="upgradeWordError"
              hint="请输入 UPGRADE 以确认刷写固件"
            >
              <el-input
                id="fw-upgrade-confirm"
                v-model="upgradeWord"
                placeholder="UPGRADE"
                autocomplete="off"
                @input="upgradeWordError = ''"
              />
            </SysFormField>
            <el-button
              type="danger"
              plain
              :icon="UploadCloud"
              :loading="flashing"
              :disabled="!canFlash"
              @click="handleFlash"
            >
              校验并刷写
            </el-button>
            <p v-if="uploaded && blockingReason" class="fw-block-note">
              校验未通过，无法刷写：{{ blockingReason }}
            </p>
          </div>

          <p class="fw-danger-note">
            刷写会覆盖当前固件并重启路由器，未备份的配置不会保留。刷写过程中请勿断电。
          </p>
        </div>
      </PanelCard>

      <PanelCard title="备份与恢复" subtitle="配置备份保存在路由器的 /tmp 中，重启后失效">
        <template #actions>
          <el-button type="primary" :icon="Download" :loading="backingUp" @click="handleBackup">
            生成备份
          </el-button>
        </template>

        <el-alert
          v-if="backupResult"
          type="success"
          :title="`备份已生成：${backupResult.path}（${formatBytes(backupResult.size)}）`"
          :closable="false"
          show-icon
        />

        <div v-if="backups.length" class="desktop-only">
          <el-table :data="backups" style="width: 100%">
            <el-table-column label="名称" min-width="180">
              <template #default="{ row }">
                <span class="mono-value">{{ row.name }}</span>
              </template>
            </el-table-column>
            <el-table-column label="路径" min-width="220">
              <template #default="{ row }">
                <span class="mono-value muted">{{ row.path }}</span>
              </template>
            </el-table-column>
            <el-table-column label="大小" width="110" align="right">
              <template #default="{ row }">
                <span class="num">{{ formatBytes(row.size) }}</span>
              </template>
            </el-table-column>
            <el-table-column label="修改时间" width="160">
              <template #default="{ row }">
                <span class="num">{{ formatClock(row.mtime) }}</span>
              </template>
            </el-table-column>
            <el-table-column label="操作" width="110" align="right">
              <template #default="{ row }">
                <el-button
                  size="small"
                  type="danger"
                  plain
                  :disabled="restoreTarget?.path === row.path"
                  @click="selectBackup(row)"
                >
                  {{ restoreTarget?.path === row.path ? '已选择' : '选择' }}
                </el-button>
              </template>
            </el-table-column>
          </el-table>
        </div>

        <div v-if="backups.length" class="mobile-only mobile-list">
          <div v-for="row in backups" :key="row.path" class="mobile-row">
            <div class="mobile-row-head">
              <strong class="mono-value truncate">{{ row.name }}</strong>
              <el-button
                size="small"
                type="danger"
                plain
                :disabled="restoreTarget?.path === row.path"
                @click="selectBackup(row)"
              >
                {{ restoreTarget?.path === row.path ? '已选择' : '选择' }}
              </el-button>
            </div>
            <div class="mobile-line">
              <span>路径</span>
              <span class="mono-value truncate">{{ row.path }}</span>
            </div>
            <div class="mobile-line">
              <span>大小</span>
              <span class="num">{{ formatBytes(row.size) }}</span>
            </div>
            <div class="mobile-line">
              <span>修改时间</span>
              <span class="num">{{ formatClock(row.mtime) }}</span>
            </div>
          </div>
        </div>

        <EmptyState
          v-if="!backups.length"
          :icon="Archive"
          title="还没有可用的备份"
          description="点击右上角「生成备份」保存一份当前配置，备份文件会出现在这里。"
        />

        <div class="fw-confirm">
          <SysFormField
            label="确认词"
            for="fw-restore-confirm"
            required
            :error="restoreWordError"
            :hint="
              restoreTarget
                ? `将恢复 ${restoreTarget.path}，请输入 RESTORE 以确认`
                : '请先在上方选择一份备份，再输入 RESTORE 以确认'
            "
          >
            <el-input
              id="fw-restore-confirm"
              v-model="restoreWord"
              placeholder="RESTORE"
              autocomplete="off"
              @input="restoreWordError = ''"
            />
          </SysFormField>
          <el-button
            type="danger"
            plain
            :icon="RotateCcw"
            :loading="restoring"
            :disabled="!canRestore"
            @click="handleRestore"
          >
            恢复所选备份
          </el-button>
        </div>

        <p class="fw-danger-note">
          恢复会用备份覆盖当前全部配置并重启路由器，未备份的改动全部丢失且无法撤销。
        </p>
      </PanelCard>

      <PanelCard title="系统信息" subtitle="当前固件、目标平台与根文件系统">
        <div class="desktop-only">
          <el-table :data="systemRows" style="width: 100%">
            <el-table-column label="项目" min-width="160">
              <template #default="{ row }">
                <span class="secondary">{{ row.label }}</span>
              </template>
            </el-table-column>
            <el-table-column label="值" min-width="260">
              <template #default="{ row }">
                <span class="mono-value">{{ row.value }}</span>
              </template>
            </el-table-column>
          </el-table>
        </div>

        <div class="mobile-only mobile-list">
          <div v-for="row in systemRows" :key="row.label" class="mobile-row">
            <div class="mobile-line">
              <span>{{ row.label }}</span>
              <span class="mono-value truncate">{{ row.value }}</span>
            </div>
          </div>
        </div>
      </PanelCard>

      <el-alert
        type="warning"
        title="刷写固件与恢复备份都会重启路由器"
        description="重启期间控制台会断开，路由器通常需要 1–2 分钟恢复联网。"
        :closable="false"
        show-icon
      />
    </template>

    <div v-else class="card">
      <div class="card-body">
        <el-skeleton :rows="6" animated />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
  import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
  import {
    Archive,
    ArrowRight,
    ChevronDown,
    ChevronUp,
    Cpu,
    Download,
    FileDown,
    HardDrive,
    History,
    Package,
    RefreshCw,
    RotateCcw,
    Sparkles,
    Upload,
    UploadCloud
  } from 'lucide-vue-next'
  import { ElMessage, ElMessageBox } from 'element-plus'
  import PageHeader from '@/components/PageHeader.vue'
  import PanelCard from '@/components/PanelCard.vue'
  import StatCard from '@/components/StatCard.vue'
  import EmptyState from '@/components/EmptyState.vue'
  import SysFormField from '@/components/config-sys/SysFormField.vue'
  import FwVerifyChecks from '@/components/fw-verify/FwVerifyChecks.vue'
  import { useRefreshSignal } from '@/composables/useRefresh'
  import { requestToken } from '@/api/systemOps'
  import { formatBytes, formatClock } from '@/utils/format'
  import {
    FIRMWARE_PATH,
    JOB_POLL_INTERVAL,
    JOB_TIMEOUT,
    MAX_FIRMWARE_SIZE,
    checkForUpdate,
    createConfigurationBackup,
    downloadFirmware,
    fetchFirmwareInfo,
    fetchJobStatus,
    isValidFirmwareName,
    loadFlashRecord,
    officialReleaseUrl,
    officialTargetUrl,
    parseDownloadResult,
    parseUpdateCheck,
    restoreConfigurationBackup,
    saveFlashRecord,
    startFirmwareUpgrade,
    uploadFirmwareImage,
    verifyFirmwareImage,
    type FirmwareBoard,
    type FirmwareCheck,
    type FirmwareDownloadResult,
    type FirmwareFile,
    type FirmwareInfo,
    type FirmwareRelease,
    type FirmwareVerification,
    type UpdateCheck
  } from '@/api/firmware'

  defineOptions({ name: 'FirmwareView' })

  const UPGRADE_WORD = 'UPGRADE'
  const RESTORE_WORD = 'RESTORE'

  const info = ref<FirmwareInfo | null>(null)
  const backups = ref<FirmwareFile[]>([])
  const loaded = ref(false)
  const refreshing = ref(false)
  const error = ref('')
  const notice = ref('')

  // ---- update center -----------------------------------------------------
  const update = ref<UpdateCheck | null>(null)
  const checkedAt = ref(0)
  const checking = ref(false)
  const checkError = ref('')
  const downloading = ref(false)
  const downloadError = ref('')
  const downloadBytes = ref(0)
  const downloadTotal = ref(0)
  const downloaded = ref<FirmwareDownloadResult | null>(null)
  const flashing = ref(false)
  const rebooting = ref(false)
  const manualOpen = ref(false)

  // ---- manual installation ----------------------------------------------
  const fileInput = ref<HTMLInputElement | null>(null)
  const selectedFile = ref<File | null>(null)
  const fileError = ref('')
  const uploading = ref(false)
  const uploadPercent = ref(0)
  const uploaded = ref<{ path: string; size: number; filename: string } | null>(null)
  const verified = ref(false)
  const verifying = ref(false)
  const verifyNote = ref('')
  const upgradeWord = ref('')
  const upgradeWordError = ref('')

  // ---- verification before the flash ------------------------------------
  /** The size and the checksum of the image that is on the router. */
  const verification = ref<FirmwareVerification | null>(null)
  /** Where the image on the router came from. */
  const imageSource = ref<'official' | 'manual' | null>(null)
  /** The last flash of this browser. */
  const flashRecord = ref(loadFlashRecord())

  // ---- backup and restore ------------------------------------------------
  const backingUp = ref(false)
  const backupResult = ref<{ path: string; size: number } | null>(null)
  const restoreTarget = ref<FirmwareFile | null>(null)
  const restoreWord = ref('')
  const restoreWordError = ref('')
  const restoring = ref(false)

  const refreshSignal = useRefreshSignal()
  let stopped = false

  const board = computed<FirmwareBoard>(
    () =>
      info.value?.board ?? {
        kernel: '',
        hostname: '',
        system: '',
        model: '',
        board_name: '',
        rootfs_type: ''
      }
  )
  const release = computed<FirmwareRelease>(
    () =>
      info.value?.release ?? {
        distribution: '',
        version: '',
        revision: '',
        target: '',
        description: ''
      }
  )

  const latestVersion = computed(() => update.value?.latest_version || '—')

  const latestMeta = computed(() => {
    if (!update.value) return '尚未检测'
    if (update.value.upgradable) return '检测到新版本'
    return `上次检测 ${checkedAtText.value}`
  })

  const latestTone = computed<'brand' | 'success' | 'warning' | 'neutral'>(() => {
    if (!update.value) return 'neutral'
    return update.value.upgradable ? 'warning' : 'success'
  })

  const firmwareFile = computed<FirmwareFile | null>(() => {
    const files = info.value?.files ?? []
    return files.find((file) => file.path === FIRMWARE_PATH) ?? null
  })

  const firmwareState = computed(() => {
    if (downloaded.value) return formatBytes(downloaded.value.size)
    if (firmwareFile.value) return formatBytes(firmwareFile.value.size)
    return '未就绪'
  })

  const firmwareMeta = computed(() => {
    if (downloaded.value) return `已下载到 ${downloaded.value.path}`
    if (firmwareFile.value) return `已就绪 · ${firmwareFile.value.path}`
    return '需要先下载或上传固件'
  })

  const firmwareTone = computed<'success' | 'neutral'>(() => {
    return downloaded.value || firmwareFile.value ? 'success' : 'neutral'
  })

  const downloadPercent = computed(() => {
    if (!downloadTotal.value) return 0
    return Math.min(100, Math.round((downloadBytes.value / downloadTotal.value) * 100))
  })

  const checkedAtText = computed(() => {
    if (!checkedAt.value) return '尚未检测'
    return new Date(checkedAt.value * 1000).toLocaleString('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    })
  })

  const publishedText = computed(() => {
    if (!update.value) return '—'
    if (update.value.published_at_ts) {
      return new Date(update.value.published_at_ts * 1000).toLocaleString('zh-CN', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false
      })
    }
    return update.value.published_at || '—'
  })

  const progressStatus = computed<'success' | 'exception' | undefined>(() => {
    if (fileError.value) return 'exception'
    if (uploading.value) return undefined
    if (uploaded.value) return verified.value ? 'success' : undefined
    return undefined
  })

  const uploadNote = computed(() => {
    if (uploading.value) return `正在上传 ${selectedFile.value?.name ?? ''}，请勿关闭页面。`
    if (uploaded.value) {
      return `固件已保存到 ${uploaded.value.path}，路由器重启后该文件会消失。`
    }
    return ''
  })

  const canFlash = computed(
    () =>
      Boolean(uploaded.value) &&
      verified.value &&
      blockingReason.value === '' &&
      upgradeWord.value.trim() === UPGRADE_WORD &&
      !flashing.value &&
      !uploading.value
  )

  const canRestore = computed(
    () =>
      Boolean(restoreTarget.value) &&
      restoreWord.value.trim() === RESTORE_WORD &&
      !restoring.value &&
      !rebooting.value
  )

  // ------------------------------------------------------- verification ---

  /** The official page of the release and of the target directory. */
  const releasePageUrl = computed(() => officialReleaseUrl(update.value?.latest_version ?? ''))
  const targetPageUrl = computed(() =>
    officialTargetUrl(update.value?.latest_version ?? '', update.value?.target ?? '')
  )

  const flashRecordText = computed(() => {
    const record = flashRecord.value
    if (!record) return '本页还没有刷写记录'
    return new Date(record.at).toLocaleString('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    })
  })

  /** The device identifier of the router, e.g. `vendor_model-name`. */
  const deviceId = computed(() => (board.value?.board_name ?? '').replace(/,/g, '_'))

  /**
   * The checks that have to pass before the router may be flashed: the size
   * of the image, its checksum, the device and the target platform.
   */
  const checks = computed<FirmwareCheck[]>(() => {
    const current = update.value
    const file = verification.value
    const boardName = board.value?.board_name ?? ''
    const target = release.value?.target ?? ''
    const officialSize = current?.size ?? 0
    const officialSha = (current?.sha256 ?? '').toLowerCase()
    const fileSha = (file?.sha256 ?? '').toLowerCase()
    const list: FirmwareCheck[] = []

    // 1. the size of the image
    if (file && file.size > 0 && officialSize > 0) {
      const same = file.size === officialSize
      list.push({
        label: '文件大小',
        state: same ? 'pass' : 'fail',
        detail: `${formatBytes(file.size)} / 官方 ${formatBytes(officialSize)}`
      })
    } else {
      list.push({
        label: '文件大小',
        state: 'unknown',
        detail: officialSize > 0 ? '路由器上还没有固件文件' : '没有官方镜像可比对'
      })
    }

    // 2. the checksum of the image
    if (fileSha && officialSha) {
      const same = fileSha === officialSha
      list.push({
        label: 'SHA-256',
        state: same ? 'pass' : 'fail',
        detail: same
          ? `与官方一致（${fileSha.slice(0, 16)}…）`
          : `不一致：${fileSha.slice(0, 16)}… / 官方 ${officialSha.slice(0, 16)}…`
      })
    } else {
      list.push({
        label: 'SHA-256',
        state: 'unknown',
        detail: officialSha ? '路由器上还没有固件文件' : '没有官方校验值可比对'
      })
    }

    // 3. the device: a manual upload carries the model in its file name,
    //    the official image is checked against the board of the router
    if (imageSource.value === 'manual' && uploaded.value) {
      const name = uploaded.value.filename.toLowerCase()
      const device = deviceId.value.toLowerCase()
      if (device && name.includes(device)) {
        list.push({
          label: '设备型号',
          state: 'pass',
          detail: `文件名与本机一致（${boardName}）`
        })
      } else if (name.includes('-sysupgrade')) {
        list.push({
          label: '设备型号',
          state: 'fail',
          detail: `文件名中的机型与本机（${boardName}）不符`
        })
      } else {
        list.push({
          label: '设备型号',
          state: 'unknown',
          detail: `无法从文件名判断机型（本机 ${boardName || '未知'}）`
        })
      }
    } else if (current?.id && boardName) {
      const same = current.id === boardName
      list.push({
        label: '设备型号',
        state: same ? 'pass' : 'fail',
        detail: `${boardName} / 官方镜像 ${current.id}`
      })
    } else {
      list.push({
        label: '设备型号',
        state: 'unknown',
        detail: boardName || '—'
      })
    }

    // 4. the target platform
    if (current?.target && target) {
      const same = current.target === target
      list.push({
        label: '目标平台',
        state: same ? 'pass' : 'fail',
        detail: `${target} / 官方镜像 ${current.target}`
      })
    } else {
      list.push({
        label: '目标平台',
        state: 'unknown',
        detail: target || '—'
      })
    }

    return list
  })

  /** A check that failed keeps the flash button disabled. */
  const blockingReason = computed(() => {
    const failed = checks.value.filter((check) => check.state === 'fail')
    if (!failed.length) return ''
    return failed.map((check) => `${check.label}${check.detail}`).join('；')
  })

  const systemRows = computed(() => [
    { label: '固件版本', value: release.value?.version || '—' },
    { label: '修订版本', value: release.value?.revision || '—' },
    { label: '目标平台', value: release.value?.target || '—' },
    { label: '内核版本', value: board.value?.kernel || '—' },
    { label: '根文件系统类型', value: board.value?.rootfs_type || '—' },
    { label: '设备型号', value: board.value?.model || '—' },
    { label: '硬件标识', value: board.value?.board_name || '—' },
    { label: '主机名', value: board.value?.hostname || '—' }
  ])

  function messageOf(err: unknown): string {
    return err instanceof Error ? err.message : '请求失败'
  }

  function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => window.setTimeout(resolve, ms))
  }

  /**
   * Waits for a background job of the router. The router has no `timeout`
   * command, so the job itself runs under a watchdog; this loop only stops
   * when the job is done or when the console stops waiting.
   */
  async function runJob(
    jobId: string,
    onProgress?: (bytes: number, total: number) => void
  ): Promise<Record<string, unknown>> {
    const deadline = Date.now() + JOB_TIMEOUT
    while (Date.now() < deadline) {
      if (stopped) throw new Error('操作已取消')
      await sleep(JOB_POLL_INTERVAL)
      const status = await fetchJobStatus(jobId)
      onProgress?.(status.bytes, status.total)
      if (status.status === 'running') continue
      if (status.status === 'done' && status.result) {
        if (status.result.ok === false) {
          throw new Error(String(status.result.error ?? '任务失败'))
        }
        return status.result
      }
      throw new Error(status.status === 'timeout' ? '任务超时，请重试' : '任务失败，请重试')
    }
    throw new Error('任务超时，请重试')
  }

  /** Checks the uploaded image against the file list of the router. */
  function verifyAgainst(payload: FirmwareInfo): void {
    const target = payload.files.find((file) => file.path === FIRMWARE_PATH)
    if (!target) {
      verified.value = false
      verifyNote.value = '路由器 /tmp 中没有找到固件文件，请重新上传。'
      return
    }
    if (!target.size) {
      verified.value = false
      verifyNote.value = '固件文件大小为 0，无法刷写，请重新上传。'
      return
    }
    if (target.size > MAX_FIRMWARE_SIZE) {
      verified.value = false
      verifyNote.value = '固件文件超过 40 MB 上限，无法刷写。'
      return
    }
    verified.value = true
    if (uploaded.value && target.size !== uploaded.value.size) {
      verifyNote.value = `路由器上的文件为 ${formatBytes(target.size)}，与上传的 ${formatBytes(
        uploaded.value.size
      )} 不一致，请重新上传。`
    } else {
      verifyNote.value = '文件已写入路由器 /tmp，大小与上传文件一致。'
    }
  }

  async function load(silent = false): Promise<void> {
    if (refreshing.value) return
    if (!silent) refreshing.value = true
    try {
      const payload = await fetchFirmwareInfo()
      info.value = payload
      backups.value = payload.backups
      loaded.value = true
      // The router keeps the result of the last check, so a reload of the
      // page shows the state again without asking the download server twice.
      if (payload.update) {
        update.value = payload.update
        checkedAt.value = payload.update_checked_at
      }
      if (uploaded.value) verifyAgainst(payload)
      // An image on the router is checked against the official values, so
      // that the flash can be blocked before it happens.
      if (payload.files.some((file) => file.path === FIRMWARE_PATH)) {
        await refreshVerification()
      }
      if (rebooting.value) notice.value = ''
    } catch (err) {
      if (rebooting.value) {
        notice.value = '路由器正在重启，恢复联网后请点击「刷新」继续操作。'
      } else {
        error.value = messageOf(err)
      }
    } finally {
      refreshing.value = false
    }
  }

  function refresh(): void {
    void load()
  }

  /** Asks the official download server whether there is a newer release. */
  async function handleCheck(): Promise<void> {
    if (checking.value) return
    checking.value = true
    checkError.value = ''
    try {
      const outcome = await checkForUpdate()
      const payload = outcome.pending
        ? await runJob(outcome.jobId)
        : (outcome.result ?? {})
      update.value = parseUpdateCheck(payload)
      checkedAt.value = Math.floor(Date.now() / 1000)
      if (update.value.warning) {
        ElMessage.warning(update.value.warning)
      } else if (update.value.upgradable) {
        ElMessage.success(`检测到新版本 ${update.value.latest_version}`)
      } else {
        ElMessage.success('已是最新版本')
      }
    } catch (err) {
      checkError.value = messageOf(err)
    } finally {
      checking.value = false
    }
  }

  /** Downloads the official image to the router and verifies the checksum. */
  async function handleDownload(): Promise<void> {
    const current = update.value
    if (!current?.download_url || downloading.value) return
    downloading.value = true
    downloadError.value = ''
    downloadBytes.value = 0
    downloadTotal.value = current.size
    downloaded.value = null
    try {
      const outcome = await downloadFirmware(current.download_url, current.sha256, current.size)
      const payload = outcome.pending
        ? await runJob(outcome.jobId, (bytes, total) => {
            downloadBytes.value = bytes
            if (total) downloadTotal.value = total
          })
        : (outcome.result ?? {})
      const result = parseDownloadResult(payload)
      downloaded.value = result
      imageSource.value = 'official'
      if (!result.verified) {
        downloadError.value = '未能取得官方校验值，固件未经校验，请自行确认来源。'
        ElMessage.warning('固件已下载，但未通过官方校验值验证')
      } else {
        ElMessage.success('固件已下载并通过 SHA-256 校验')
      }
      await load(true)
    } catch (err) {
      downloadError.value = messageOf(err)
    } finally {
      downloading.value = false
    }
  }

  /**
   * Reads the size and the checksum of the image that is on the router, so
   * that they can be compared with the official ones.
   */
  async function refreshVerification(): Promise<void> {
    verifying.value = true
    try {
      verification.value = await verifyFirmwareImage()
    } catch (err) {
      verification.value = null
      verifyNote.value = messageOf(err)
    } finally {
      verifying.value = false
    }
  }

  /** Flashes the downloaded official image. */
  async function handleFlashUpdate(): Promise<void> {
    const current = update.value
    const result = downloaded.value
    if (!current || !result) return
    if (!result.verified) {
      ElMessage.warning('固件未通过校验，请重新下载后再刷写')
      return
    }
    if (blockingReason.value) {
      ElMessage.error(`校验未通过，无法刷写：${blockingReason.value}`)
      return
    }

    try {
      await ElMessageBox.confirm(
        `即将把 OpenWrt ${current.latest_version} 刷写到这台路由器（当前 ${release.value?.version || '—'}）。` +
          '刷写会覆盖现有固件并重启路由器，未备份的配置不会保留，过程中请勿断电。确定继续吗？',
        '刷写固件',
        {
          type: 'warning',
          confirmButtonText: '确认刷写',
          cancelButtonText: '取消',
          confirmButtonClass: 'el-button--danger'
        }
      )
    } catch {
      return
    }

    flashing.value = true
    try {
      const token = await requestToken('firmware-upgrade')
      await startFirmwareUpgrade(token)
      rebooting.value = true
      rememberFlash(current.latest_version, 'official')
      ElMessage.success('刷写指令已发送，路由器将重启')
      notice.value = '固件正在刷写，路由器随后会重启，通常需要 1–2 分钟恢复联网。'
    } catch (err) {
      ElMessage.error(messageOf(err))
    } finally {
      flashing.value = false
    }
  }

  /** Remembers the flash in the browser, so that the page can show it. */
  function rememberFlash(version: string, source: 'official' | 'manual'): void {
    const record = { at: Date.now(), version, source }
    saveFlashRecord(record)
    flashRecord.value = record
  }

  function pickFile(): void {
    fileInput.value?.click()
  }

  async function onFileSelected(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement
    const file = input.files?.[0]
    input.value = ''
    fileError.value = ''
    uploaded.value = null
    verified.value = false
    verifyNote.value = ''
    uploadPercent.value = 0

    if (!file) {
      selectedFile.value = null
      return
    }

    if (!isValidFirmwareName(file.name)) {
      selectedFile.value = null
      fileError.value = '文件名只能包含字母、数字、点、下划线和连字符，且必须以 .bin 或 .tar 结尾。'
      return
    }
    if (file.size > MAX_FIRMWARE_SIZE) {
      selectedFile.value = null
      fileError.value = `固件文件为 ${formatBytes(file.size)}，超过 40 MB 上限。`
      return
    }
    if (!file.size) {
      selectedFile.value = null
      fileError.value = '固件文件为空，请重新选择。'
      return
    }

    selectedFile.value = file
    await doUpload(file)
  }

  async function doUpload(file: File): Promise<void> {
    uploading.value = true
    uploadPercent.value = 0
    try {
      const result = await uploadFirmwareImage(file, (percent) => {
        uploadPercent.value = percent
      })
      uploadPercent.value = 100
      uploaded.value = { path: result.path, size: result.size, filename: result.filename }
      imageSource.value = 'manual'
      ElMessage.success('固件已上传到路由器')
      await verifyUploaded()
    } catch (err) {
      uploaded.value = null
      verified.value = false
      fileError.value = messageOf(err)
    } finally {
      uploading.value = false
    }
  }

  async function verifyUploaded(): Promise<void> {
    verifying.value = true
    try {
      const payload = await fetchFirmwareInfo()
      info.value = payload
      backups.value = payload.backups
      verifyAgainst(payload)
      // The checksum of the image on the router, compared with the official one
      verification.value = await verifyFirmwareImage()
    } catch (err) {
      verifyNote.value = messageOf(err)
    } finally {
      verifying.value = false
    }
  }

  async function handleFlash(): Promise<void> {
    if (!uploaded.value) return
    if (upgradeWord.value.trim() !== UPGRADE_WORD) {
      upgradeWordError.value = `请输入 ${UPGRADE_WORD} 以确认刷写`
      return
    }
    if (!verified.value) {
      ElMessage.warning('请先完成固件校验')
      return
    }
    if (blockingReason.value) {
      ElMessage.error(`校验未通过，无法刷写：${blockingReason.value}`)
      return
    }

    try {
      await ElMessageBox.confirm(
        `即将把 ${uploaded.value.filename} 刷写到这台路由器（当前 ${release.value?.version || '—'}）。` +
          '刷写会覆盖现有固件并重启路由器，未备份的配置不会保留，过程中请勿断电。确定继续吗？',
        '刷写固件',
        {
          type: 'warning',
          confirmButtonText: '确认刷写',
          cancelButtonText: '取消',
          confirmButtonClass: 'el-button--danger'
        }
      )
    } catch {
      return
    }

    flashing.value = true
    try {
      const token = await requestToken('firmware-upgrade')
      await startFirmwareUpgrade(token)
      rebooting.value = true
      rememberFlash(update.value?.latest_version || release.value?.version || '', 'manual')
      ElMessage.success('刷写指令已发送，路由器将重启')
      notice.value = '固件正在刷写，路由器随后会重启，通常需要 1–2 分钟恢复联网。'
    } catch (err) {
      ElMessage.error(messageOf(err))
    } finally {
      flashing.value = false
    }
  }

  async function handleBackup(): Promise<void> {
    if (backingUp.value) return
    backingUp.value = true
    try {
      const result = await createConfigurationBackup()
      backupResult.value = { path: result.path, size: result.size }
      ElMessage.success(`备份已生成：${result.path}`)
      await load(true)
    } catch (err) {
      ElMessage.error(messageOf(err))
    } finally {
      backingUp.value = false
    }
  }

  function selectBackup(file: FirmwareFile): void {
    restoreTarget.value = file
    restoreWordError.value = ''
  }

  async function handleRestore(): Promise<void> {
    const target = restoreTarget.value
    if (!target) return
    if (restoreWord.value.trim() !== RESTORE_WORD) {
      restoreWordError.value = `请输入 ${RESTORE_WORD} 以确认恢复`
      return
    }

    try {
      await ElMessageBox.confirm(
        `恢复会用 ${target.path} 覆盖当前全部配置并重启路由器，未备份的改动全部丢失且无法撤销。确定继续吗？`,
        '恢复配置备份',
        {
          type: 'warning',
          confirmButtonText: '确认恢复',
          cancelButtonText: '取消',
          confirmButtonClass: 'el-button--danger'
        }
      )
    } catch {
      return
    }

    restoring.value = true
    try {
      const token = await requestToken('backup-restore')
      await restoreConfigurationBackup(target.path, token)
      rebooting.value = true
      ElMessage.success('恢复指令已发送，路由器将重启')
      notice.value = '正在恢复配置备份，路由器随后会重启，通常需要 1–2 分钟恢复联网。'
    } catch (err) {
      ElMessage.error(messageOf(err))
    } finally {
      restoring.value = false
    }
  }

  onMounted(async () => {
    await load()
    // The page is an update center: the state of the official release is
    // checked right away, the cached result of the router is shown meanwhile.
    void handleCheck()
  })

  onUnmounted(() => {
    stopped = true
  })

  watch(refreshSignal, () => void load(true))
</script>

<style scoped>
  /* Element Plus 给相邻按钮加了 12px 左边距，和外层 flex 的 gap 叠加后
     同一行的按钮会被拉到 20px 间距；这里把间距统一交回给 gap 控制。 */
  .el-button + .el-button {
    margin-left: 0;
  }

  .fw-record {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 10px 14px;
    color: var(--text-secondary);
    font-size: var(--text-xs);
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius-md);
  }

  .fw-record-icon {
    flex-shrink: 0;
    color: var(--text-faint);
  }

  .fw-record-label {
    color: var(--text-muted);
  }

  .fw-record-value {
    color: var(--text);
    font-weight: 500;
  }

  .fw-record-meta {
    color: var(--text-muted);
  }

  .fw-links {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-3);
  }

  .fw-block-note {
    color: var(--danger-text);
    font-size: var(--text-xs);
    line-height: 1.6;
  }

  .fw-state {
    display: flex;
    flex-direction: column;
    gap: var(--space-4);
  }

  .fw-state-actions {
    display: flex;
    gap: var(--space-2);
  }

  .fw-checking {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
  }

  .fw-checking-note {
    color: var(--text-muted);
    font-size: var(--text-xs);
    line-height: 1.6;
  }

  .fw-subtle {
    color: var(--text-muted);
    font-size: var(--text-xs);
    line-height: 1.6;
  }

  .fw-compare {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--space-3);
    padding: 14px 16px;
    background: var(--surface-2);
    border-radius: var(--radius-md);
  }

  .fw-compare-side {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .fw-compare-label {
    color: var(--text-muted);
    font-size: var(--text-xs);
  }

  .fw-compare-version {
    color: var(--text);
    font-size: var(--text-md);
    font-weight: 600;
    line-height: 1.2;
  }

  .fw-compare-new {
    color: var(--success-text);
  }

  .fw-compare-arrow {
    color: var(--text-faint);
  }

  .fw-meta {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 1px;
    margin: 0;
    overflow: hidden;
    background: var(--border);
    border: 1px solid var(--border);
    border-radius: var(--radius-md);
  }

  .fw-meta-row {
    display: flex;
    flex-direction: column;
    gap: 3px;
    min-width: 0;
    padding: 10px 14px;
    background: var(--surface);
  }

  .fw-meta-label {
    color: var(--text-secondary);
    font-size: var(--text-sm);
    font-weight: 500;
    line-height: 1.4;
  }

  .fw-meta-value {
    margin: 0;
    color: var(--text);
    font-size: var(--text-xs);
    line-height: 1.5;
    word-break: break-word;
  }

  .fw-break {
    word-break: break-all;
  }

  .fw-notes-block {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .fw-notes {
    padding-left: 18px;
    margin: 0;
    color: var(--text-secondary);
    font-size: var(--text-xs);
    line-height: 1.9;
  }

  .fw-notes li {
    margin: 0;
  }

  .fw-link {
    align-self: flex-start;
    color: var(--brand-text);
    font-size: var(--text-xs);
    font-weight: 500;
  }

  .fw-actions {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-2);
  }

  .fw-guide {
    padding: 14px 16px;
    margin-bottom: 16px;
    background: var(--surface-2);
    border-radius: var(--radius-md);
  }

  .fw-guide-title {
    color: var(--text);
    font-size: var(--text-sm);
    font-weight: 500;
  }

  .fw-guide-list {
    padding-left: 18px;
    margin: 6px 0 0;
    color: var(--text-muted);
    font-size: var(--text-xs);
    line-height: 1.9;
  }

  .fw-guide-list a {
    color: var(--brand-text);
  }

  .fw-picker {
    display: flex;
    align-items: center;
    gap: var(--space-3);
    padding: 14px 16px;
    border: 1px dashed var(--border-strong);
    border-radius: var(--radius-md);
  }

  .fw-file-input {
    display: none;
  }

  .fw-file-name {
    min-width: 0;
    color: var(--text-secondary);
    font-size: var(--text-sm);
  }

  .fw-progress {
    padding: 14px 16px;
    background: var(--surface-3);
    border-radius: var(--radius-md);
  }

  .fw-percent {
    color: var(--text);
    font-size: var(--text-sm);
    font-weight: 500;
  }

  .fw-progress-note {
    margin-top: 8px;
    color: var(--text-muted);
    font-size: var(--text-xs);
    line-height: 1.6;
    word-break: break-all;
  }

  .fw-verify {
    padding: 14px 16px;
    margin-top: 12px;
    border: 1px solid var(--border);
    border-radius: var(--radius-md);
  }

  .fw-verify-line {
    display: flex;
    align-items: center;
    gap: 10px;
    margin-top: 8px;
    color: var(--text-secondary);
    font-size: var(--text-xs);
  }

  .fw-verify-note {
    margin-top: 6px;
    color: var(--text-muted);
    font-size: var(--text-xs);
    line-height: 1.6;
  }

  .fw-confirm {
    display: flex;
    align-items: flex-end;
    gap: var(--space-4);
    padding-top: 16px;
    margin-top: 16px;
    border-top: 1px solid var(--border);
  }

  .fw-confirm :deep(.sys-field) {
    flex: 1 1 auto;
    max-width: 320px;
  }

  .fw-danger-note {
    padding-top: 10px;
    color: var(--danger-text);
    font-size: var(--text-xs);
    line-height: 1.6;
  }

  .mobile-list {
    padding: 4px 16px 12px;
  }

  .mobile-row {
    padding: 12px 0;
    border-bottom: 1px solid var(--border);
  }

  .mobile-row:last-child {
    border-bottom: 0;
  }

  .mobile-row-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    margin-bottom: 6px;
    color: var(--text);
    font-size: var(--text-sm);
  }

  .mobile-line {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    color: var(--text-muted);
    font-size: 11.5px;
    line-height: 1.8;
  }

  .mobile-line span:last-child {
    color: var(--text-secondary);
  }

  @media (max-width: 640px) {
    .fw-picker,
    .fw-confirm {
      align-items: stretch;
      flex-direction: column;
      gap: 10px;
    }

    .fw-confirm :deep(.sys-field) {
      max-width: none;
    }

    .fw-verify-line {
      flex-wrap: wrap;
    }

    .fw-meta {
      grid-template-columns: minmax(0, 1fr);
    }

    .fw-actions {
      flex-direction: column;
      align-items: stretch;
    }

    .fw-actions :deep(.el-button) {
      width: 100%;
      margin-left: 0;
    }
  }
</style>
