<template>
  <div ref="pageRoot" class="page">
    <PageHeader title="软件包管理" description="apk 软件仓库、已安装软件包与系统升级">
      <el-button :icon="RefreshCw" :loading="refreshing" :disabled="busy !== ''" @click="refresh">
        刷新
      </el-button>
      <el-button
        :icon="Download"
        type="primary"
        :loading="busyWith('update')"
        :disabled="busy !== ''"
        @click="onUpdateIndex"
      >
        更新仓库索引
      </el-button>
      <el-button
        :icon="CircleArrowUp"
        type="danger"
        plain
        :loading="busyWith('upgrade')"
        :disabled="busy !== ''"
        @click="onUpgradeAll"
      >
        升级全部
      </el-button>
    </PageHeader>

    <el-alert v-if="error" type="error" :title="error" :closable="false" show-icon />

    <el-alert
      v-if="busy"
      type="info"
      :title="`${jobTitle} · 已用时 ${jobElapsed} 秒`"
      description="操作在路由器上执行，完成后本页会自动刷新当前视图的列表。"
      :closable="false"
      show-icon
    />

    <template v-if="loaded">
      <div class="grid grid-4">
        <StatCard
          label="已安装软件包"
          :value="installedCount"
          :meta="upgradableCount > 0 ? `其中 ${upgradableCount} 个有新版本` : '当前没有可升级的软件包'"
          :icon="Package"
          tone="brand"
        />
        <StatCard
          label="仓库可安装"
          :value="statsLoaded ? availableCount : '—'"
          :meta="availableMeta"
          :icon="Download"
          tone="neutral"
        />
        <StatCard
          label="最近一次操作"
          :value="lastActionValue"
          :meta="lastActionMeta"
          :icon="Activity"
          :tone="lastActionTone"
        />
        <StatCard
          label="索引更新时间"
          :value="indexUpdatedAt ? indexTimeText : '未下载'"
          :meta="indexUpdatedAt ? 'apk 仓库索引的最近一次刷新' : '请先更新仓库索引'"
          :icon="Clock"
          :tone="indexUpdatedAt ? 'success' : 'warning'"
        />
      </div>

      <PanelCard class="pkg-panel" :title="viewTitle" :subtitle="viewSubtitle" flush>
        <template #actions>
          <el-radio-group
            :model-value="activeView"
            class="pkg-seg"
            size="small"
            @change="onViewChange"
          >
            <el-radio-button value="installed">已安装</el-radio-button>
            <el-radio-button value="repo">仓库</el-radio-button>
          </el-radio-group>
        </template>

        <div class="pkg-toolbar">
          <el-input
            v-if="activeView === 'installed'"
            v-model="installedSearch"
            class="pkg-search"
            placeholder="搜索已安装的包名、版本或描述"
            clearable
            :prefix-icon="Search"
          />
          <el-input
            v-else
            v-model="repoSearch"
            class="pkg-search"
            placeholder="在仓库中搜索包名或描述（由路由器过滤）"
            clearable
            :prefix-icon="Search"
          />
          <div class="pkg-toolbar-meta">
            <span class="count-badge num">{{ visibleCount }}</span>
            <span class="pkg-hint">{{ toolbarHint }}</span>
          </div>
        </div>

        <!-- 已安装视图：只有这一张表会被渲染，已装包再多也不会拖慢仓库视图 -->
        <template v-if="activeView === 'installed'">
          <div v-if="filteredInstalled.length" class="desktop-only">
            <el-table :data="filteredInstalled" style="width: 100%">
              <el-table-column label="包名" min-width="190">
                <template #default="{ row }">
                  <div class="pkg-primary mono-value">{{ row.name }}</div>
                  <div v-if="row.origin" class="pkg-sub truncate">{{ row.origin }}</div>
                </template>
              </el-table-column>
              <el-table-column label="版本" min-width="150">
                <template #default="{ row }">
                  <span class="mono-value">{{ row.version }}</span>
                </template>
              </el-table-column>
              <el-table-column label="描述" min-width="260">
                <template #default="{ row }">
                  <span class="pkg-desc" :title="row.description || ''">{{
                    row.description || '—'
                  }}</span>
                </template>
              </el-table-column>
              <el-table-column label="大小" min-width="110" align="right">
                <template #default="{ row }">
                  <span class="num">{{ formatBytes(row.installedSize) }}</span>
                </template>
              </el-table-column>
              <el-table-column label="操作" width="100" align="right">
                <template #default="{ row }">
                  <el-button
                    type="danger"
                    plain
                    size="small"
                    :loading="busyWith(`remove:${row.name}`)"
                    :disabled="busy !== '' && !busyWith(`remove:${row.name}`)"
                    @click="onRemove(row)"
                  >
                    卸载
                  </el-button>
                </template>
              </el-table-column>
            </el-table>
          </div>

          <div v-if="filteredInstalled.length" class="mobile-only mobile-list">
            <div v-for="row in filteredInstalled" :key="row.name" class="mobile-row">
              <div class="mobile-row-head">
                <strong class="mono-value truncate">{{ row.name }}</strong>
                <span class="muted text-xs mono">{{ row.version }}</span>
              </div>
              <div class="mobile-line">
                <span>描述</span>
                <span class="mobile-desc truncate">{{ row.description || '—' }}</span>
              </div>
              <div class="mobile-line">
                <span>大小</span>
                <span class="num">{{ formatBytes(row.installedSize) }}</span>
              </div>
              <div class="mobile-actions">
                <el-button
                  type="danger"
                  plain
                  size="small"
                  :loading="busyWith(`remove:${row.name}`)"
                  :disabled="busy !== '' && !busyWith(`remove:${row.name}`)"
                  @click="onRemove(row)"
                >
                  卸载
                </el-button>
              </div>
            </div>
          </div>

          <EmptyState
            v-if="!filteredInstalled.length"
            :icon="Package"
            title="没有匹配的软件包"
            :description="
              installed.length
                ? '换个关键词试试。'
                : '路由器还没有安装任何可列出的软件包。'
            "
          />
        </template>

        <!-- 仓库视图：列表由路由器过滤后返回，浏览器永远拿不到整个仓库 -->
        <template v-else>
          <div v-if="repoLoading && !repoPackages.length" class="pkg-skeleton">
            <el-skeleton :rows="6" animated />
          </div>

          <template v-else>
            <div v-if="repoPackages.length" class="desktop-only">
              <el-table :data="repoPackages" style="width: 100%">
                <el-table-column label="包名" min-width="190">
                  <template #default="{ row }">
                    <div class="pkg-primary mono-value">{{ row.name }}</div>
                    <div v-if="row.origin" class="pkg-sub truncate">{{ row.origin }}</div>
                  </template>
                </el-table-column>
                <el-table-column label="版本" min-width="150">
                  <template #default="{ row }">
                    <span class="mono-value">{{ row.version }}</span>
                  </template>
                </el-table-column>
                <el-table-column label="描述" min-width="300">
                  <template #default="{ row }">
                    <span class="pkg-desc" :title="row.description || ''">{{
                      row.description || '—'
                    }}</span>
                  </template>
                </el-table-column>
                <el-table-column label="操作" width="100" align="right">
                  <template #default="{ row }">
                    <el-button
                      type="primary"
                      plain
                      size="small"
                      :loading="busyWith(`install:${row.name}`)"
                      :disabled="busy !== '' && !busyWith(`install:${row.name}`)"
                      @click="onInstall(row)"
                    >
                      安装
                    </el-button>
                  </template>
                </el-table-column>
              </el-table>
            </div>

            <div v-if="repoPackages.length" class="mobile-only mobile-list">
              <div v-for="row in repoPackages" :key="row.name" class="mobile-row">
                <div class="mobile-row-head">
                  <strong class="mono-value truncate">{{ row.name }}</strong>
                  <span class="muted text-xs mono">{{ row.version }}</span>
                </div>
                <div class="mobile-line">
                  <span>描述</span>
                  <span class="mobile-desc truncate">{{ row.description || '—' }}</span>
                </div>
                <div class="mobile-actions">
                  <el-button
                    type="primary"
                    plain
                    size="small"
                    :loading="busyWith(`install:${row.name}`)"
                    :disabled="busy !== '' && !busyWith(`install:${row.name}`)"
                    @click="onInstall(row)"
                  >
                    安装
                  </el-button>
                </div>
              </div>
            </div>

            <EmptyState
              v-if="!repoPackages.length"
              :icon="Download"
              title="没有匹配的软件包"
              :description="repoEmptyHint"
            />
          </template>
        </template>
      </PanelCard>

      <PanelCard v-if="lastOutput" title="操作输出" subtitle="最近一次写操作的原始输出">
        <pre class="pkg-output">{{ lastOutput }}</pre>
      </PanelCard>

      <p class="page-note">
        安装、卸载或升级完成后会自动刷新当前视图的列表；仓库搜索在路由器上执行，
        结果由路由器过滤后返回，不会把整个仓库拉回浏览器。
      </p>
    </template>

    <div v-else class="card">
      <div class="card-body">
        <el-skeleton :rows="6" animated />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
  import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
  import { Activity, CircleArrowUp, Clock, Download, Package, RefreshCw, Search } from 'lucide-vue-next'
  import { ElMessage, ElMessageBox } from 'element-plus'
  import PageHeader from '@/components/PageHeader.vue'
  import PanelCard from '@/components/PanelCard.vue'
  import StatCard from '@/components/StatCard.vue'
  import EmptyState from '@/components/EmptyState.vue'
  import {
    fetchInstalledPackages,
    fetchPackageStats,
    fetchRepositoryPackages,
    startPackageJob,
    waitForPackageJob,
    type PackageInfo
  } from '@/api/packages'
  import { formatBytes } from '@/utils/format'

  defineOptions({ name: 'PackagesView' })

  type Tone = 'brand' | 'success' | 'warning' | 'danger' | 'neutral'
  type PkgView = 'installed' | 'repo'

  const activeView = ref<PkgView>('installed')

  const installed = ref<PackageInfo[]>([])
  const repoPackages = ref<PackageInfo[]>([])
  const installedCount = ref(0)
  const availableCount = ref(0)
  const repoMatchCount = ref(0)
  const upgradableCount = ref(0)
  const indexUpdatedAt = ref(0)

  const installedSearch = ref('')
  const installedTerm = ref('')
  const repoSearch = ref('')
  const repoTerm = ref('')
  const repoLoading = ref(false)
  const repoLoaded = ref(false)
  const repoStale = ref(false)
  const installedStale = ref(false)

  const busy = ref('')
  const jobTitle = ref('')
  const jobElapsed = ref(0)
  const jobStartedAt = ref(0)

  const lastAction = ref<{ label: string; ok: boolean; at: number } | null>(null)
  const lastOutput = ref('')

  const loaded = ref(false)
  const refreshing = ref(false)
  const error = ref('')
  const statsLoaded = ref(false)
  const statsFailed = ref(false)

  const pageRoot = ref<HTMLElement>()
  const scrollPositions: Record<PkgView, number> = { installed: 0, repo: 0 }

  let elapsedTimer: number | undefined
  let installedTimer: number | undefined
  let repoTimer: number | undefined
  let cancelJob: (() => void) | undefined
  let repoRequestId = 0
  let statsRequestId = 0
  let statsPromise: Promise<void> | null = null

  /** True while an action of that kind is running. */
  function busyWith(kind: string): boolean {
    return busy.value.startsWith(kind)
  }

  // ----------------------------------------------------------- scrolling ---

  /** The element that scrolls the page: the layout's main column. */
  function scrollHost(): HTMLElement | null {
    let node: HTMLElement | null = pageRoot.value ?? null
    while (node) {
      const overflowY = getComputedStyle(node).overflowY
      if (overflowY === 'auto' || overflowY === 'scroll') return node
      node = node.parentElement
    }
    return document.scrollingElement instanceof HTMLElement ? document.scrollingElement : null
  }

  function currentScroll(): number {
    return scrollHost()?.scrollTop ?? 0
  }

  function restoreScroll(view: PkgView): void {
    const host = scrollHost()
    if (!host) return
    host.scrollTop = scrollPositions[view]
  }

  // -------------------------------------------------------------- views ---

  const filteredInstalled = computed(() => {
    const term = installedTerm.value
    if (!term) return installed.value
    return installed.value.filter((row) => {
      return (
        row.name.toLowerCase().includes(term) ||
        row.version.toLowerCase().includes(term) ||
        (row.description || '').toLowerCase().includes(term)
      )
    })
  })

  const viewTitle = computed(() => (activeView.value === 'installed' ? '已安装软件包' : '仓库软件包'))

  const viewSubtitle = computed(() => {
    if (activeView.value === 'installed') {
      return `路由器上已安装 ${installedCount.value} 个软件包`
    }
    if (!statsLoaded.value) return '正在读取仓库信息…'
    return `仓库中可安装 ${availableCount.value} 个软件包`
  })

  const visibleCount = computed(() =>
    activeView.value === 'installed' ? filteredInstalled.value.length : repoPackages.value.length
  )

  const toolbarHint = computed(() => {
    if (activeView.value === 'installed') {
      if (installedTerm.value) {
        return `匹配 ${filteredInstalled.value.length} / ${installedCount.value} 个`
      }
      return `共 ${installedCount.value} 个软件包`
    }
    if (repoLoading.value) return '正在搜索仓库…'
    if (statsFailed.value) return '仓库信息读取失败，请刷新重试'
    if (!statsLoaded.value) return '正在读取仓库信息…'
    if (repoTerm.value) {
      return repoMatchCount.value > repoPackages.value.length
        ? `匹配 ${repoMatchCount.value} 个，显示前 ${repoPackages.value.length} 个`
        : `匹配 ${repoMatchCount.value} 个`
    }
    return `仓库共 ${availableCount.value} 个软件包`
  })

  const repoEmptyHint = computed(() => {
    if (repoTerm.value) return '仓库里没有匹配的软件包，换个关键词试试。'
    if (!indexUpdatedAt.value) return '仓库索引尚未下载，请先点击「更新仓库索引」。'
    return '仓库里没有可安装的软件包，请先更新仓库索引。'
  })

  const availableMeta = computed(() => {
    if (statsFailed.value) return '读取失败，请点击刷新重试'
    if (!statsLoaded.value) return '正在读取仓库信息…'
    if (repoTerm.value) return `当前匹配 ${repoMatchCount.value} 个`
    return '搜索可查询仓库中的全部软件包'
  })

  const lastActionValue = computed(() => {
    if (!lastAction.value) return '—'
    return lastAction.value.ok ? '成功' : '失败'
  })

  const lastActionMeta = computed(() => {
    if (!lastAction.value) return '本页还没有执行过写操作'
    const time = new Date(lastAction.value.at).toLocaleTimeString('zh-CN', { hour12: false })
    return `${lastAction.value.label} · ${time}`
  })

  const lastActionTone = computed<Tone>(() => {
    if (!lastAction.value) return 'neutral'
    return lastAction.value.ok ? 'success' : 'danger'
  })

  const indexTimeText = computed(() =>
    new Date(indexUpdatedAt.value * 1000).toLocaleString('zh-CN', {
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    })
  )

  function messageOf(err: unknown): string {
    return err instanceof Error ? err.message : '请求失败'
  }

  /** Turns the raw output of a failed apk command into a readable reason. */
  function failureHint(output: string): string {
    const text = output || ''
    if (/stale|unavailable repositories/i.test(text)) {
      return '仓库索引不可用，请先更新仓库索引'
    }
    const line = text
      .split('\n')
      .map((item) => item.trim())
      .find((item) => item && !item.startsWith('WARNING'))
    return line ? line.slice(0, 120) : ''
  }

  // --------------------------------------------------------------- data ---

  async function loadInstalled(): Promise<void> {
    const result = await fetchInstalledPackages()
    installed.value = result.packages ?? []
    installedCount.value = result.installedCount ?? installed.value.length
    upgradableCount.value = result.upgradableCount ?? upgradableCount.value
    indexUpdatedAt.value = result.indexUpdatedAt ?? indexUpdatedAt.value
  }

  /**
   * The counters of the repository. The repository index is an order of
   * magnitude bigger than the installed list, so the request is shared by all
   * callers and the answer is cached on the router as well.
   */
  function ensureStats(force = false): Promise<void> {
    if (force) statsPromise = null
    if (!statsPromise) statsPromise = loadStats()
    return statsPromise
  }

  async function loadStats(): Promise<void> {
    const id = ++statsRequestId
    try {
      const result = await fetchPackageStats()
      if (id !== statsRequestId) return
      availableCount.value = result.availableCount ?? availableCount.value
      upgradableCount.value = result.upgradableCount ?? upgradableCount.value
      indexUpdatedAt.value = result.indexUpdatedAt ?? indexUpdatedAt.value
      statsLoaded.value = true
      statsFailed.value = false
    } catch (err) {
      if (id !== statsRequestId) return
      statsFailed.value = true
      error.value = `仓库信息读取失败：${messageOf(err)}`
    }
  }

  /** The repository page. The keyword is matched on the router. */
  async function loadRepoList(): Promise<void> {
    const id = ++repoRequestId
    repoLoading.value = true
    try {
      // The counters are read first: they share the cached parse of the
      // repository index with the list, so the router only walks it once.
      await ensureStats()
      const result = await fetchRepositoryPackages(repoTerm.value)
      if (id !== repoRequestId) return
      repoPackages.value = result.packages ?? []
      repoMatchCount.value = result.availableCount ?? repoPackages.value.length
      repoLoaded.value = true
      repoStale.value = false
    } catch (err) {
      if (id !== repoRequestId) return
      error.value = `仓库列表读取失败：${messageOf(err)}`
    } finally {
      if (id === repoRequestId) repoLoading.value = false
    }
  }

  /** Loads what the view needs, if it is not on screen yet. */
  async function ensureViewData(view: PkgView): Promise<void> {
    if (view === 'installed') {
      if (installedStale.value) {
        installedStale.value = false
        await loadInstalled()
      }
      return
    }
    if (repoStale.value || !repoLoaded.value) {
      await loadRepoList()
    }
  }

  async function bootstrap(): Promise<void> {
    try {
      await loadInstalled()
    } catch (err) {
      error.value = `已安装列表读取失败：${messageOf(err)}`
    }
    loaded.value = true
    // The repository counters arrive in the background: the installed list is
    // usable right away and the repository is only read when it is opened.
    void ensureStats()
  }

  async function refresh(): Promise<void> {
    refreshing.value = true
    try {
      if (activeView.value === 'installed') {
        await loadInstalled()
        installedStale.value = false
      }
      await ensureStats(true)
      if (activeView.value === 'repo') await loadRepoList()
    } catch (err) {
      error.value = messageOf(err)
    } finally {
      refreshing.value = false
    }
  }

  /** After a write operation the lists and the counters are read again. */
  async function reloadAfterAction(): Promise<void> {
    repoStale.value = true
    installedStale.value = true
    await ensureStats(true)
    if (activeView.value === 'installed') {
      installedStale.value = false
      await loadInstalled()
    } else {
      await loadRepoList()
    }
  }

  // -------------------------------------------------------------- input ---

  function onViewChange(next: unknown): void {
    const target: PkgView = next === 'repo' ? 'repo' : 'installed'
    if (target === activeView.value) return
    // Every view keeps its own scroll position.
    scrollPositions[activeView.value] = currentScroll()
    activeView.value = target
    void nextTick(() => {
      restoreScroll(target)
      void ensureViewData(target)
    })
  }

  watch(installedSearch, (value) => {
    if (installedTimer) window.clearTimeout(installedTimer)
    installedTimer = window.setTimeout(() => {
      installedTerm.value = value.trim().toLowerCase()
    }, 250)
  })

  watch(repoSearch, (value) => {
    if (repoTimer) window.clearTimeout(repoTimer)
    repoTimer = window.setTimeout(() => {
      const term = value.trim()
      if (term === repoTerm.value) return
      repoTerm.value = term
      // The list on screen does not match the keyword any more.
      repoStale.value = true
      if (activeView.value === 'repo') void loadRepoList()
    }, 400)
  })

  // -------------------------------------------------------------- write ---

  function startElapsedTimer(): void {
    stopElapsedTimer()
    elapsedTimer = window.setInterval(() => {
      jobElapsed.value = Math.round((Date.now() - jobStartedAt.value) / 1000)
    }, 1000)
  }

  function stopElapsedTimer(): void {
    if (elapsedTimer) {
      window.clearInterval(elapsedTimer)
      elapsedTimer = undefined
    }
  }

  /**
   * Starts a write operation on the router and follows it until it is done.
   * The CGI runs the command in the background, so the page polls the job.
   */
  async function runJob(
    action: 'install' | 'remove' | 'update' | 'upgrade',
    params: Record<string, string | number | undefined>,
    title: string,
    label: string
  ): Promise<void> {
    busy.value = `${action}:${params.name ?? ''}`
    jobTitle.value = title
    jobStartedAt.value = Date.now()
    jobElapsed.value = 0
    startElapsedTimer()
    lastOutput.value = ''

    try {
      const job = await startPackageJob(action, params)
      const watcher = waitForPackageJob(job.jobId, (state) => {
        if (state.output) lastOutput.value = state.output
      })
      cancelJob = watcher.cancel
      const final = await watcher.promise

      if (final.output) lastOutput.value = final.output

      if (final.state === 'timeout') {
        lastAction.value = { label: `${label}超时`, ok: false, at: Date.now() }
        ElMessage.error(`${label}超时，任务已被强制终止`)
      } else if ((final.exitCode ?? 0) !== 0) {
        lastAction.value = { label: `${label}失败`, ok: false, at: Date.now() }
        const hint = failureHint(final.output || '')
        ElMessage.error(`${label}失败${hint ? `：${hint}` : ''}`)
      } else {
        lastAction.value = { label: `${label}成功`, ok: true, at: Date.now() }
        ElMessage.success(`${label}成功`)
      }
    } catch (err) {
      lastAction.value = { label: `${label}失败`, ok: false, at: Date.now() }
      ElMessage.error(messageOf(err))
    } finally {
      busy.value = ''
      stopElapsedTimer()
      cancelJob = undefined
      try {
        await reloadAfterAction()
      } catch (err) {
        error.value = messageOf(err)
      }
    }
  }

  async function confirmDanger(
    title: string,
    message: string,
    confirmText: string
  ): Promise<boolean> {
    try {
      await ElMessageBox.confirm(message, title, {
        type: 'warning',
        confirmButtonText: confirmText,
        cancelButtonText: '取消',
        closeOnClickModal: false
      })
      return true
    } catch {
      return false
    }
  }

  async function onInstall(pkg: PackageInfo): Promise<void> {
    if (busy.value) return
    const confirmed = await confirmDanger(
      `安装 ${pkg.name}`,
      `确定安装 ${pkg.name} ${pkg.version} 吗？\n\n` +
        '安装会改动系统依赖关系，可能引入新的软件包并占用存储空间，' +
        '个别服务可能需要重启，依赖冲突时甚至会导致服务异常。',
      '确认安装'
    )
    if (!confirmed) return
    await runJob('install', { name: pkg.name }, `正在安装 ${pkg.name}`, `安装 ${pkg.name}`)
  }

  async function onRemove(pkg: PackageInfo): Promise<void> {
    if (busy.value) return
    const confirmed = await confirmDanger(
      `卸载 ${pkg.name}`,
      `确定卸载 ${pkg.name} ${pkg.version} 吗？\n\n` +
        '卸载会删除该软件包并改动系统依赖关系，依赖它的服务可能无法启动，' +
        '其配置也可能一并丢失，且无法在本页面一键还原。',
      '确认卸载'
    )
    if (!confirmed) return
    await runJob('remove', { name: pkg.name }, `正在卸载 ${pkg.name}`, `卸载 ${pkg.name}`)
  }

  async function onUpdateIndex(): Promise<void> {
    if (busy.value) return
    const confirmed = await confirmDanger(
      '更新仓库索引',
      '确定更新仓库索引吗？\n\n' +
        '更新会从软件源下载最新索引，需要路由器能够访问外网，' +
        '会占用少量存储空间，但不会改动已安装的软件包。',
      '确认更新'
    )
    if (!confirmed) return
    await runJob('update', {}, '正在更新仓库索引', '更新仓库索引')
  }

  async function onUpgradeAll(): Promise<void> {
    if (busy.value) return
    const first = await confirmDanger(
      '升级全部软件包',
      '确定要升级全部软件包吗？\n\n' +
        '升级会安装所有可用的更新，过程中会占用存储空间，' +
        '并可能重启相关服务，期间管理页面可能短暂无法访问。',
      '继续'
    )
    if (!first) return
    const second = await confirmDanger(
      '再次确认升级',
      '请再次确认：升级全部软件包会改动系统依赖关系与文件，' +
        '若更新中途失败可能导致服务异常甚至无法启动，' +
        '需要时只能通过 SSH 手动恢复。确定现在执行升级吗？',
      '确认升级'
    )
    if (!second) return
    await runJob('upgrade', {}, '正在升级全部软件包', '升级全部软件包')
  }

  onMounted(() => {
    void bootstrap()
  })

  onUnmounted(() => {
    stopElapsedTimer()
    if (installedTimer) window.clearTimeout(installedTimer)
    if (repoTimer) window.clearTimeout(repoTimer)
    cancelJob?.()
  })
</script>

<style scoped>
  .count-badge {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 24px;
    height: 22px;
    padding: 0 7px;
    color: var(--text-muted);
    font-size: 11px;
    font-weight: 500;
    background: var(--surface-2);
    border-radius: 999px;
  }

  /* The segmented control: two views of the same card, never two tabs. */
  .pkg-seg {
    display: inline-flex;
    align-items: center;
    gap: 2px;
    padding: 3px;
    background: var(--surface-2);
    border-radius: var(--radius);
  }

  .pkg-seg :deep(.el-radio-button:not(:first-child)) {
    margin-left: 0;
  }

  .pkg-seg :deep(.el-radio-button .el-radio-button__inner) {
    padding: 5px 14px;
    color: var(--text-secondary);
    font-size: var(--text-xs);
    font-weight: 500;
    background: transparent;
    border: 0;
    border-radius: var(--radius-sm);
    box-shadow: none;
    transition:
      color 0.16s ease,
      background-color 0.16s ease;
  }

  .pkg-seg :deep(.el-radio-button .el-radio-button__inner:hover) {
    color: var(--text);
  }

  .pkg-seg :deep(.el-radio-button__original-radio:checked + .el-radio-button__inner) {
    color: var(--brand-text);
    background: var(--surface);
    box-shadow: var(--shadow-xs);
  }

  .pkg-seg :deep(.el-radio-button__original-radio:focus-visible + .el-radio-button__inner) {
    outline: 2px solid var(--brand);
    outline-offset: 1px;
  }

  .pkg-toolbar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding: 14px 16px;
    border-bottom: 1px solid var(--border);
  }

  .pkg-search {
    max-width: 340px;
  }

  .pkg-toolbar-meta {
    display: flex;
    align-items: center;
    gap: 8px;
    min-width: 0;
  }

  .pkg-hint {
    overflow: hidden;
    color: var(--text-muted);
    font-size: 11.5px;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .pkg-primary {
    color: var(--text);
    font-size: var(--text-sm);
    font-weight: 500;
  }

  .pkg-sub {
    margin-top: 1px;
    color: var(--text-muted);
    font-size: 11px;
  }

  .pkg-desc {
    display: block;
    overflow: hidden;
    color: var(--text-secondary);
    font-size: 12.5px;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .pkg-skeleton {
    padding: 20px 16px;
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

  .mobile-desc {
    max-width: 62%;
  }

  .mobile-actions {
    display: flex;
    justify-content: flex-end;
    margin-top: 8px;
  }

  .pkg-output {
    max-height: 260px;
    margin: 0;
    padding: 12px 14px;
    overflow: auto;
    color: var(--text-secondary);
    font-family: var(--font-mono);
    font-size: 12px;
    line-height: 1.7;
    white-space: pre-wrap;
    word-break: break-word;
    background: var(--surface-2);
    border-radius: var(--radius);
  }

  .page-note {
    padding: 0 4px;
    color: var(--text-muted);
    font-size: var(--text-xs);
  }

  @media (max-width: 640px) {
    /* The segmented control takes the whole width of the card head. */
    .pkg-panel :deep(.card-head) {
      flex-wrap: wrap;
    }

    .pkg-panel :deep(.card-actions) {
      width: 100%;
    }

    .pkg-seg {
      display: flex;
      width: 100%;
    }

    .pkg-seg :deep(.el-radio-button) {
      flex: 1 1 0;
    }

    .pkg-seg :deep(.el-radio-button .el-radio-button__inner) {
      width: 100%;
      text-align: center;
    }

    .pkg-toolbar {
      align-items: stretch;
      flex-direction: column;
      padding: 12px 16px;
    }

    .pkg-search {
      max-width: none;
    }

    .pkg-toolbar-meta {
      justify-content: space-between;
    }

    .pkg-hint {
      white-space: normal;
    }
  }
</style>
