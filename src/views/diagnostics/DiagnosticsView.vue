<template>
  <div class="page">
    <PageHeader title="诊断工具" description="连通性、DNS 解析与路由排查，命令在路由器本地执行">
      <el-button :icon="Eraser" :disabled="!hasResult" @click="clearResult">清空结果</el-button>
    </PageHeader>

    <el-alert v-if="error" type="error" :title="error?.message || '操作失败'" :closable="false" show-icon />

    <div class="grid grid-4 diag-grid">
      <StatCard
        label="本次诊断状态"
        :value="status.label"
        :tone="status.tone"
        :badge="status.badge"
        :meta="status.meta"
        :icon="Stethoscope"
      />
      <StatCard
        label="最近执行工具"
        :value="lastToolMeta.label"
        :tone="hasResult ? 'brand' : 'neutral'"
        :meta="lastToolMeta.command"
        :icon="lastToolMeta.icon"
      />
      <StatCard
        label="诊断目标"
        :value="lastTarget"
        :tone="lastTarget ? 'brand' : 'neutral'"
        :meta="lastTargetMeta"
        :icon="Target"
      />
      <StatCard
        label="本次耗时"
        :value="elapsedText"
        :suffix="elapsed > 0 ? 's' : ''"
        tone="neutral"
        :meta="elapsedMeta"
        :icon="Timer"
      />
    </div>

    <div class="diag-layout">
      <PanelCard title="诊断工具" subtitle="选择工具并填写目标">
        <el-radio-group v-model="tool" class="tool-group">
          <el-radio-button value="ping">Ping</el-radio-button>
          <el-radio-button value="dns">DNS 解析</el-radio-button>
          <el-radio-button value="trace">路由跟踪</el-radio-button>
        </el-radio-group>

        <p class="tool-hint mono">{{ commandPreview }}</p>

        <label class="field-label" for="diagnostic-target">诊断目标</label>
        <el-input
          id="diagnostic-target"
          v-model="target"
          class="target-input"
          :placeholder="targetPlaceholder"
          :prefix-icon="Target"
          clearable
          :disabled="running"
          @keyup.enter="executeSelected"
        />

        <!-- 参数预设：这些值会真的传给路由器的命令 -->
        <div v-if="tool === 'ping'" class="preset-block">
          <p class="preset-title">参数预设</p>
          <div class="preset-grid">
            <div class="preset">
              <label class="preset-label" for="diag-ping-count">探测次数</label>
              <el-select id="diag-ping-count" v-model="pingCount" class="preset-select">
                <el-option
                  v-for="option in PING_COUNT_OPTIONS"
                  :key="option"
                  :label="`${option} 次`"
                  :value="option"
                />
              </el-select>
            </div>
            <div class="preset">
              <label class="preset-label" for="diag-ping-size">包大小</label>
              <el-select id="diag-ping-size" v-model="pingSize" class="preset-select">
                <el-option
                  v-for="option in PING_SIZE_OPTIONS"
                  :key="option"
                  :label="`${option} 字节`"
                  :value="option"
                />
              </el-select>
            </div>
            <div class="preset">
              <label class="preset-label" for="diag-ping-wait">等待时间</label>
              <el-select id="diag-ping-wait" v-model="pingWait" class="preset-select">
                <el-option
                  v-for="option in PING_WAIT_OPTIONS"
                  :key="option"
                  :label="`${option} 秒`"
                  :value="option"
                />
              </el-select>
            </div>
          </div>
        </div>

        <div v-else-if="tool === 'trace'" class="preset-block">
          <p class="preset-title">参数预设</p>
          <div class="preset-grid">
            <div class="preset">
              <label class="preset-label" for="diag-trace-hops">最大跳数</label>
              <el-select id="diag-trace-hops" v-model="traceHops" class="preset-select">
                <el-option
                  v-for="option in TRACE_HOPS_OPTIONS"
                  :key="option"
                  :label="`${option} 跳`"
                  :value="option"
                />
              </el-select>
            </div>
            <div class="preset">
              <label class="preset-label" for="diag-trace-wait">每跳等待</label>
              <el-select id="diag-trace-wait" v-model="traceWait" class="preset-select">
                <el-option
                  v-for="option in TRACE_WAIT_OPTIONS"
                  :key="option"
                  :label="`${option} 秒`"
                  :value="option"
                />
              </el-select>
            </div>
            <div class="preset">
              <label class="preset-label" for="diag-trace-probes">每跳探测</label>
              <el-select id="diag-trace-probes" v-model="traceProbes" class="preset-select">
                <el-option
                  v-for="option in TRACE_PROBE_OPTIONS"
                  :key="option"
                  :label="`${option} 次`"
                  :value="option"
                />
              </el-select>
            </div>
          </div>
        </div>

        <div class="action-row">
          <el-button
            type="primary"
            :icon="Play"
            :loading="running && runningTool === tool"
            :disabled="running"
            @click="executeSelected"
          >
            执行
          </el-button>
          <el-button
            :icon="Network"
            :loading="running && runningTool === 'routes'"
            :disabled="running"
            @click="execute('routes')"
          >
            路由表
          </el-button>
          <el-button
            :icon="Cable"
            :loading="running && runningTool === 'ports'"
            :disabled="running"
            @click="execute('ports')"
          >
            监听端口
          </el-button>
        </div>

        <p class="tool-note">
          命令在路由器本地执行：Ping 最长 30 秒、路由跟踪最长 120 秒，输出超过 200 KB
          会被截断。超时由路由器上的看门狗终止。
        </p>
      </PanelCard>

      <PanelCard title="执行结果" :subtitle="resultSubtitle">
        <template #actions>
          <el-button size="small" :icon="Copy" :disabled="!hasResult" @click="copyOutput">
            复制
          </el-button>
          <el-button size="small" :icon="Download" :disabled="!hasResult" @click="exportOutput">
            导出 .txt
          </el-button>
        </template>

        <el-alert
          v-if="failureReason"
          type="error"
          :title="failureReason"
          :description="`退出码 ${result?.exitCode} · 耗时 ${elapsedText} 秒`"
          :closable="false"
          show-icon
        />

        <pre v-if="hasResult" class="output-view">{{ result?.output }}</pre>
        <EmptyState
          v-else
          title="尚未执行诊断"
          description="选择工具与目标后点击「执行」，原始命令输出会显示在这里。"
          :icon="Terminal"
        />

        <div v-if="hasResult" class="result-foot">
          <span class="result-meta">{{ resultMeta }}</span>
          <span v-if="result?.truncated" class="result-flag">输出已截断</span>
        </div>
      </PanelCard>
    </div>

    <PanelCard title="诊断历史" :subtitle="historySubtitle">
      <template #actions>
        <el-button size="small" :icon="Trash2" :disabled="!history.length" @click="onClearHistory">
          清空历史
        </el-button>
      </template>

      <ul v-if="history.length" class="hist-list">
        <li v-for="entry in history" :key="entry.id" class="hist-item">
          <div class="hist-main">
            <div class="hist-line">
              <span class="hist-time num">{{ formatTime(entry.at) }}</span>
              <el-tag size="small" effect="plain" class="hist-tag">{{
                DIAGNOSTIC_LABELS[entry.tool]
              }}</el-tag>
              <el-tag
                size="small"
                effect="plain"
                class="hist-tag"
                :class="entry.success ? 'is-success' : 'is-fail'"
              >
                {{ entry.success ? '成功' : '失败' }}
              </el-tag>
              <span class="hist-target mono-value truncate">{{ entry.target || '本地快照' }}</span>
            </div>
            <p class="hist-summary">
              {{ entry.summary || '无摘要' }}
              <span class="hist-meta num">· 退出码 {{ entry.exitCode }} · 耗时 {{
                (entry.durationMs / 1000).toFixed(2)
              }} 秒</span>
            </p>
          </div>
          <el-button
            size="small"
            :icon="RotateCw"
            :disabled="running"
            @click="rerun(entry)"
          >
            重新执行
          </el-button>
        </li>
      </ul>

      <EmptyState
        v-else
        title="还没有诊断记录"
        description="执行一次诊断后，这里会保留最近 10 次记录（时间、工具、目标、结果与一行摘要），点「重新执行」可以再来一次。"
        :icon="History"
      />
    </PanelCard>
  </div>
</template>

<script setup lang="ts">
  import { computed, onMounted, ref, type Component } from 'vue'
  import {
    Activity,
    Cable,
    Copy,
    Download,
    Eraser,
    Globe,
    History,
    Network,
    Play,
    Route,
    RotateCw,
    Stethoscope,
    Target,
    Terminal,
    Timer,
    Trash2
  } from 'lucide-vue-next'
  import { ElMessage, ElMessageBox } from 'element-plus'
  import PageHeader from '@/components/PageHeader.vue'
  import PanelCard from '@/components/PanelCard.vue'
  import StatCard from '@/components/StatCard.vue'
  import EmptyState from '@/components/EmptyState.vue'
  import {
    DIAGNOSTIC_LABELS,
    HISTORY_LIMIT,
    PING_COUNT_OPTIONS,
    PING_SIZE_OPTIONS,
    PING_WAIT_OPTIONS,
    TRACE_HOPS_OPTIONS,
    TRACE_PROBE_OPTIONS,
    TRACE_WAIT_OPTIONS,
    buildDiagnosticCommand,
    clearDiagnosticHistory,
    diagnosticNeedsTarget,
    downloadDiagnosticOutput,
    explainDiagnosticFailure,
    isValidDiagnosticTarget,
    loadDiagnosticHistory,
    recordDiagnostic,
    runDiagnostic,
    summarizeDiagnostic,
    type DiagnosticHistoryEntry,
    type DiagnosticParams,
    type DiagnosticResult,
    type DiagnosticTool
  } from '@/api/diagnostics'

  defineOptions({ name: 'DiagnosticsView' })

  type Tone = 'brand' | 'success' | 'warning' | 'danger' | 'neutral'

  interface ToolMeta {
    label: string
    command: string
    icon: Component
  }

  const EMPTY_TOOL: ToolMeta = { label: '—', command: '尚未执行诊断', icon: Terminal }

  const TOOL_ICONS: Record<DiagnosticTool, Component> = {
    ping: Activity,
    dns: Globe,
    trace: Route,
    routes: Network,
    ports: Cable
  }

  const tool = ref<DiagnosticTool>('ping')
  const target = ref('')
  const running = ref(false)
  const runningTool = ref<DiagnosticTool | ''>('')
  const error = ref<Error | null>(null)
  const failed = ref(false)
  const result = ref<DiagnosticResult | null>(null)
  const elapsed = ref(0)
  const history = ref<DiagnosticHistoryEntry[]>([])

  // 参数预设：ping
  const pingCount = ref(5)
  const pingSize = ref(56)
  const pingWait = ref(3)
  // 参数预设：traceroute
  const traceHops = ref(15)
  const traceWait = ref(1)
  const traceProbes = ref(3)

  const hasResult = computed(() => result.value !== null)

  /** The parameters of the selected tool. They are sent to the router. */
  const currentParams = computed<DiagnosticParams>(() => {
    if (tool.value === 'ping') {
      return { count: pingCount.value, size: pingSize.value, wait: pingWait.value }
    }
    if (tool.value === 'trace') {
      return { hops: traceHops.value, twait: traceWait.value, probes: traceProbes.value }
    }
    return {}
  })

  const commandPreview = computed(() =>
    buildDiagnosticCommand(tool.value, target.value.trim(), currentParams.value)
  )

  const targetPlaceholder = computed(() =>
    tool.value === 'ping' ? '例如 example.com 或 8.8.8.8' : '例如 example.com'
  )

  const lastToolMeta = computed<ToolMeta>(() => {
    if (!result.value) return EMPTY_TOOL
    return {
      label: DIAGNOSTIC_LABELS[result.value.tool],
      command: result.value.command || '—',
      icon: TOOL_ICONS[result.value.tool]
    }
  })

  const lastTarget = computed(() => result.value?.target || '—')
  const lastTargetMeta = computed(() => {
    if (!result.value) return '尚未执行诊断'
    return result.value.target ? '本次诊断目标' : '本地快照，无需目标'
  })
  const elapsedText = computed(() =>
    elapsed.value > 0 ? (elapsed.value / 1000).toFixed(2) : '—'
  )
  const elapsedMeta = computed(() => {
    if (failed.value) return '本次诊断未完成'
    if (elapsed.value > 0) return '本次命令用时'
    return '尚未执行诊断'
  })

  const status = computed<{ label: string; tone: Tone; badge: string; meta: string }>(() => {
    if (running.value) {
      return { label: '执行中', tone: 'brand', badge: '运行中', meta: '正在等待路由器返回结果' }
    }
    if (failed.value && error.value) {
      return { label: '请求失败', tone: 'danger', badge: '未完成', meta: '本次诊断没有拿到结果' }
    }
    const current = result.value
    if (!current) {
      return { label: '未执行', tone: 'neutral', badge: '空闲', meta: '选择工具与目标后点击执行' }
    }
    if (current.exitCode === 0) {
      return {
        label: '成功',
        tone: 'success',
        badge: '退出码 0',
        meta: `${DIAGNOSTIC_LABELS[current.tool]} 执行完成`
      }
    }
    if (current.exitCode === 124 || current.exitCode === 137 || current.exitCode === 143) {
      return {
        label: '超时',
        tone: 'warning',
        badge: `退出码 ${current.exitCode}`,
        meta: '命令超过看门狗时限后被终止'
      }
    }
    return {
      label: '失败',
      tone: 'danger',
      badge: `退出码 ${current.exitCode}`,
      meta: '命令返回了非零退出码'
    }
  })

  const resultSubtitle = computed(() =>
    result.value ? result.value.command : '选择工具与目标后执行，结果显示在这里'
  )

  const resultMeta = computed(() => {
    const current = result.value
    if (!current) return ''
    return [
      DIAGNOSTIC_LABELS[current.tool],
      `退出码 ${current.exitCode}`,
      `${(elapsed.value / 1000).toFixed(2)} s`
    ].join(' · ')
  })

  /** A readable reason for a failed run. */
  const failureReason = computed(() => {
    if (!result.value || result.value.exitCode === 0) return ''
    return explainDiagnosticFailure(result.value)
  })

  const historySubtitle = computed(() =>
    history.value.length
      ? `最近 ${history.value.length} 次诊断，最多保留 ${HISTORY_LIMIT} 条`
      : `最多保留 ${HISTORY_LIMIT} 条记录`
  )

  function formatTime(at: number): string {
    return new Date(at).toLocaleString('zh-CN', {
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false
    })
  }

  async function execute(which: DiagnosticTool): Promise<void> {
    if (running.value) return

    const value = target.value.trim()
    if (diagnosticNeedsTarget(which)) {
      if (!value) {
        ElMessage.warning('请填写诊断目标，例如 example.com')
        return
      }
      if (!isValidDiagnosticTarget(value)) {
        ElMessage.warning('目标仅支持字母、数字、点、冒号、短横线与下划线')
        return
      }
    }

    error.value = null
    failed.value = false
    running.value = true
    runningTool.value = which

    const params = which === 'ping' ? currentParams.value : which === 'trace' ? currentParams.value : {}
    const started = performance.now()
    try {
      const data = await runDiagnostic(which, value, params)
      result.value = data
      elapsed.value = data.durationMs > 0 ? data.durationMs : Math.round(performance.now() - started)
      remember(data)
    } catch (err) {
      error.value = err instanceof Error ? err : new Error(String(err))
      failed.value = true
      elapsed.value = 0
    } finally {
      running.value = false
      runningTool.value = ''
    }
  }

  /** Writes the run into the history of the page. */
  function remember(data: DiagnosticResult): void {
    const success = data.exitCode === 0
    history.value = recordDiagnostic({
      tool: data.tool,
      target: data.target,
      command: data.command,
      exitCode: data.exitCode,
      durationMs: data.durationMs,
      success,
      summary: summarizeDiagnostic(data.tool, data.output),
      params: data.params
    })
  }

  function executeSelected(): void {
    void execute(tool.value)
  }

  function clearResult(): void {
    result.value = null
    elapsed.value = 0
    failed.value = false
    error.value = null
  }

  /** Runs a run of the history again, with the same presets. */
  async function rerun(entry: DiagnosticHistoryEntry): Promise<void> {
    tool.value = entry.tool
    if (entry.params.count !== undefined) pingCount.value = entry.params.count
    if (entry.params.size !== undefined) pingSize.value = entry.params.size
    if (entry.params.wait !== undefined) pingWait.value = entry.params.wait
    if (entry.params.hops !== undefined) traceHops.value = entry.params.hops
    if (entry.params.twait !== undefined) traceWait.value = entry.params.twait
    if (entry.params.probes !== undefined) traceProbes.value = entry.params.probes
    if (entry.target) target.value = entry.target
    await execute(entry.tool)
  }

  async function onClearHistory(): Promise<void> {
    if (!history.value.length) return
    try {
      await ElMessageBox.confirm('确定清空本页的诊断历史吗？此操作不可撤销。', '清空历史', {
        type: 'warning',
        confirmButtonText: '清空',
        cancelButtonText: '取消',
        closeOnClickModal: false
      })
    } catch {
      return
    }
    clearDiagnosticHistory()
    history.value = []
    ElMessage.success('诊断历史已清空')
  }

  function legacyCopy(text: string): void {
    const area = document.createElement('textarea')
    area.value = text
    area.setAttribute('readonly', '')
    area.style.position = 'fixed'
    area.style.top = '-1000px'
    area.style.opacity = '0'
    document.body.appendChild(area)
    area.select()
    const copied = document.execCommand('copy')
    document.body.removeChild(area)
    if (!copied) throw new Error('copy failed')
  }

  async function copyOutput(): Promise<void> {
    const text = result.value?.output ?? ''
    if (!text) return
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(text)
      } else {
        legacyCopy(text)
      }
      ElMessage.success('输出已复制到剪贴板')
    } catch {
      try {
        legacyCopy(text)
        ElMessage.success('输出已复制到剪贴板')
      } catch {
        ElMessage.warning('复制失败，请手动选择输出内容复制')
      }
    }
  }

  /** Saves the raw output of the run as a text file. */
  function exportOutput(): void {
    const current = result.value
    if (!current) return
    const stamp = new Date().toISOString().replace(/[:.]/g, '-')
    const name = `${current.tool}-${current.target || 'local'}-${stamp}.txt`
    const header = [
      `# 工具：${DIAGNOSTIC_LABELS[current.tool]}`,
      `# 目标：${current.target || '（本地快照）'}`,
      `# 命令：${current.command}`,
      `# 退出码：${current.exitCode}`,
      `# 耗时：${(current.durationMs / 1000).toFixed(2)} 秒`,
      `# 时间：${new Date().toLocaleString('zh-CN')}`,
      ''
    ].join('\n')
    downloadDiagnosticOutput(name, `${header}${current.output}\n`)
    ElMessage.success('原始输出已导出')
  }

  onMounted(() => {
    history.value = loadDiagnosticHistory()
  })
</script>

<style scoped>
  /* Element Plus 给相邻按钮加了 12px 左边距，和外层 flex 的 gap 叠加后
     同一行的按钮会被拉到 20px 间距；这里把间距统一交回给 gap 控制。 */
  .el-button + .el-button {
    margin-left: 0;
  }

  .diag-grid :deep(.stat-value) {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .diag-layout {
    display: grid;
    grid-template-columns: minmax(0, 340px) minmax(0, 1fr);
    gap: var(--space-4);
  }

  .tool-group {
    display: flex;
    flex-wrap: wrap;
  }

  .tool-hint {
    margin-top: 10px;
    overflow-wrap: anywhere;
    color: var(--text-muted);
    font-size: 11.5px;
  }

  .field-label {
    display: block;
    margin: 16px 0 6px;
    color: var(--text-secondary);
    font-size: var(--text-sm);
    font-weight: 500;
  }

  .target-input {
    width: 100%;
  }

  .preset-block {
    margin-top: 16px;
  }

  .preset-title {
    margin-bottom: 8px;
    color: var(--text-secondary);
    font-size: var(--text-sm);
    font-weight: 500;
  }

  .preset-grid {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: var(--space-3);
  }

  .preset {
    display: flex;
    flex-direction: column;
    gap: 5px;
    min-width: 0;
  }

  .preset-label {
    color: var(--text-muted);
    font-size: var(--text-xs);
  }

  .preset-select {
    width: 100%;
  }

  /* 下拉框与同一行的按钮、输入框保持同高 */
  .preset-select :deep(.el-select__wrapper) {
    min-height: 36px;
  }

  .action-row {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-2);
    margin-top: 16px;
  }

  .tool-note {
    margin-top: 14px;
    color: var(--text-muted);
    font-size: var(--text-xs);
    line-height: 1.6;
  }

  .output-view {
    max-height: 460px;
    padding: 14px 16px;
    margin: 0;
    overflow: auto;
    color: var(--text-secondary);
    font-family: var(--font-mono);
    font-size: 12px;
    line-height: 1.7;
    white-space: pre-wrap;
    word-break: break-word;
    background: var(--surface-3);
    border: 1px solid var(--border);
    border-radius: var(--radius);
  }

  .result-foot {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-3);
    margin-top: 12px;
    color: var(--text-muted);
    font-size: var(--text-xs);
  }

  .result-meta {
    font-family: var(--font-mono);
    font-size: 11.5px;
  }

  .result-flag {
    color: var(--warning-text);
    font-weight: 500;
  }

  .hist-list {
    padding: 0;
    margin: 0;
    list-style: none;
  }

  .hist-item {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-3);
    padding: 10px 0;
    border-bottom: 1px solid var(--border);
  }

  .hist-item:last-child {
    border-bottom: 0;
  }

  .hist-main {
    min-width: 0;
  }

  .hist-line {
    display: flex;
    align-items: center;
    gap: 8px;
    min-width: 0;
  }

  .hist-time {
    color: var(--text-muted);
    font-size: 11.5px;
  }

  /* 标签用中性底色，深浅色下都读得清 */
  .hist-tag {
    color: var(--text-secondary);
    background: var(--surface-2);
  }

  .hist-tag.is-success {
    color: var(--success-text);
    background: var(--success-soft);
  }

  .hist-tag.is-fail {
    color: var(--danger-text);
    background: var(--danger-soft);
  }

  .hist-target {
    color: var(--text);
  }

  .hist-summary {
    margin-top: 4px;
    overflow: hidden;
    color: var(--text-secondary);
    font-size: var(--text-xs);
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .hist-meta {
    color: var(--text-muted);
  }

  @media (max-width: 900px) {
    .diag-layout {
      grid-template-columns: minmax(0, 1fr);
    }
  }

  @media (max-width: 640px) {
    .action-row {
      flex-direction: column;
    }

    .action-row :deep(.el-button) {
      width: 100%;
      margin-left: 0;
    }

    .preset-grid {
      grid-template-columns: minmax(0, 1fr);
    }

    .hist-item {
      align-items: flex-start;
      flex-direction: column;
    }

    .output-view {
      max-height: 320px;
      padding: 12px;
      font-size: 11.5px;
    }
  }
</style>
