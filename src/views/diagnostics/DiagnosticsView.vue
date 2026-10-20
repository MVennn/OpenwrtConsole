<template>
  <div class="page">
    <PageHeader title="诊断工具" description="连通性、DNS 解析与路由排查，命令在路由器本地执行">
      <el-button :icon="Eraser" :disabled="!hasResult" @click="clearResult">清空结果</el-button>
    </PageHeader>

    <el-alert v-if="error" type="error" :title="error.message" :closable="false" show-icon />

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

        <p class="tool-hint mono">{{ toolMeta.command }}</p>

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
          命令在路由器本地执行，单次最长 12 秒，输出超过 200 KB 会被截断。
        </p>
      </PanelCard>

      <PanelCard title="执行结果" :subtitle="resultSubtitle">
        <template #actions>
          <el-button
            size="small"
            :icon="Copy"
            :disabled="!hasResult"
            @click="copyOutput"
          >
            复制
          </el-button>
        </template>

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
  </div>
</template>

<script setup lang="ts">
  import { computed, ref, type Component } from 'vue'
  import {
    Activity,
    Cable,
    Copy,
    Eraser,
    Globe,
    Network,
    Play,
    Route,
    Stethoscope,
    Target,
    Terminal,
    Timer
  } from 'lucide-vue-next'
  import { ElMessage } from 'element-plus'
  import PageHeader from '@/components/PageHeader.vue'
  import PanelCard from '@/components/PanelCard.vue'
  import StatCard from '@/components/StatCard.vue'
  import EmptyState from '@/components/EmptyState.vue'
  import {
    diagnosticNeedsTarget,
    isValidDiagnosticTarget,
    runDiagnostic,
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

  const TOOL_META: Record<DiagnosticTool, ToolMeta> = {
    ping: { label: 'Ping', command: 'ping -c 3 -W 3 <目标>', icon: Activity },
    dns: { label: 'DNS 解析', command: 'nslookup <目标>', icon: Globe },
    trace: { label: '路由跟踪', command: 'traceroute -n -w 1 -q 3 <目标>', icon: Route },
    routes: { label: '路由表', command: 'ip route show', icon: Network },
    ports: { label: '监听端口', command: 'ss -lntup', icon: Cable }
  }

  const EMPTY_TOOL: ToolMeta = { label: '—', command: '尚未执行诊断', icon: Terminal }

  const tool = ref<DiagnosticTool>('ping')
  const target = ref('')
  const running = ref(false)
  const runningTool = ref<DiagnosticTool | ''>('')
  const error = ref<Error | null>(null)
  const failed = ref(false)
  const result = ref<DiagnosticResult | null>(null)
  const elapsed = ref(0)

  const hasResult = computed(() => result.value !== null)
  const toolMeta = computed(() => TOOL_META[tool.value])
  const targetPlaceholder = computed(() =>
    tool.value === 'ping' ? '例如 example.com 或 8.8.8.8' : '例如 example.com'
  )

  const lastToolMeta = computed(() =>
    result.value ? TOOL_META[result.value.tool] : EMPTY_TOOL
  )
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
        meta: `${TOOL_META[current.tool].label} 执行完成`
      }
    }
    if (current.exitCode === 124 || current.exitCode === 143) {
      return {
        label: '超时',
        tone: 'warning',
        badge: `退出码 ${current.exitCode}`,
        meta: '命令超过 12 秒后被终止'
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
      TOOL_META[current.tool].label,
      `退出码 ${current.exitCode}`,
      `${(elapsed.value / 1000).toFixed(2)} s`
    ].join(' · ')
  })

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

    const started = performance.now()
    try {
      const data = await runDiagnostic(which, value)
      result.value = data
      elapsed.value = data.durationMs > 0 ? data.durationMs : Math.round(performance.now() - started)
    } catch (err) {
      error.value = err instanceof Error ? err : new Error(String(err))
      failed.value = true
      elapsed.value = 0
    } finally {
      running.value = false
      runningTool.value = ''
    }
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
</script>

<style scoped>
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

    .output-view {
      max-height: 320px;
      padding: 12px;
      font-size: 11.5px;
    }
  }
</style>
