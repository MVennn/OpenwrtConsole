<template>
  <el-dialog
    :model-value="modelValue"
    :title="dialogTitle"
    width="640px"
    @update:model-value="emit('update:modelValue', $event)"
  >
    <div class="mon-dialog">
      <BaseChart v-if="points.length > 1" :option="option" :height="240" />
      <div v-else class="chart-placeholder">
        <Activity :size="22" :stroke-width="1.6" />
        <p>正在采集该设备的速率样本…</p>
        <span>约 10 秒后显示速率曲线</span>
      </div>

      <dl class="kv-grid mon-kv">
        <div class="kv">
          <dt>IP 地址</dt>
          <dd class="mono-value">{{ client?.ip || '—' }}</dd>
        </div>
        <div class="kv">
          <dt>MAC 地址</dt>
          <dd class="mono-value">{{ client?.mac || '—' }}</dd>
        </div>
        <div class="kv">
          <dt>接入方式</dt>
          <dd>{{ accessLabel }}</dd>
        </div>
        <div class="kv">
          <dt>信号</dt>
          <dd>{{ signalText }}</dd>
        </div>
        <div class="kv">
          <dt>当前速率</dt>
          <dd class="num">{{ currentRate }}</dd>
        </div>
        <div class="kv">
          <dt>链路速率</dt>
          <dd class="num">{{ linkRateText }}</dd>
        </div>
        <div class="kv">
          <dt>累计流量</dt>
          <dd class="num">{{ totalText }}</dd>
        </div>
        <div class="kv">
          <dt>在线时长</dt>
          <dd class="num">{{ connectedText }}</dd>
        </div>
      </dl>
    </div>

    <template #footer>
      <span class="mon-dialog-note">曲线数据来自浏览器本地采样，切换时间范围即可调整窗口。</span>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
  import { computed } from 'vue'
  import { Activity } from 'lucide-vue-next'
  import type { EChartsCoreOption } from 'echarts/core'
  import BaseChart from '@/components/BaseChart.vue'
  import { useTheme } from '@/composables/useTheme'
  import { formatBitrate, formatBytes, formatLinkRate, formatUptime, withAlpha } from '@/utils/format'
  import { MAX_CHART_POINTS, windowSamples, type ClientStat } from '@/api/monitor'

  const props = defineProps<{
    modelValue: boolean
    /** The inspected client, null while the dialog is closed. */
    client: ClientStat | null
    /** Length of the visible window in milliseconds. */
    windowMs: number
  }>()

  const emit = defineEmits<{
    (event: 'update:modelValue', value: boolean): void
  }>()

  const { isDark } = useTheme()

  const points = computed(() =>
    props.client ? windowSamples(props.client.history, props.windowMs, MAX_CHART_POINTS) : []
  )

  const dialogTitle = computed(() =>
    props.client ? `${props.client.hostname} · 速率曲线` : '速率曲线'
  )

  const accessLabel = computed(() => {
    if (!props.client) return '—'
    return props.client.wireless ? `无线 ${props.client.bandLabel || ''}`.trim() : '有线'
  })

  const signalText = computed(() => {
    if (!props.client?.wireless || props.client.signal === undefined) return '—'
    return `${props.client.signal} dBm`
  })

  const currentRate = computed(() => {
    if (!props.client) return '—'
    return `↓ ${formatBitrate(props.client.rxRate)} · ↑ ${formatBitrate(props.client.txRate)}`
  })

  const totalText = computed(() => {
    if (!props.client) return '—'
    const total = props.client.rxBytes + props.client.txBytes
    return total > 0 ? formatBytes(total) : '—'
  })

  const linkRateText = computed(() => {
    if (!props.client?.wireless || !props.client.linkRate) return '—'
    return formatLinkRate(props.client.linkRate)
  })

  const connectedText = computed(() => {
    if (!props.client?.connected) return '—'
    return formatUptime(props.client.connected)
  })

  const option = computed<EChartsCoreOption>(() => {
    const styles = getComputedStyle(document.documentElement)
    const rxColor = styles.getPropertyValue('--chart-rx').trim()
    const txColor = styles.getPropertyValue('--chart-tx').trim()
    const gridColor = styles.getPropertyValue('--chart-grid').trim()
    const textColor = styles.getPropertyValue('--text-muted').trim()
    const surface = styles.getPropertyValue('--surface').trim()
    const border = styles.getPropertyValue('--border').trim()
    void isDark.value

    const samples = points.value

    return {
      animation: false,
      grid: { top: 18, right: 30, bottom: 6, left: 6, containLabel: true },
      tooltip: {
        trigger: 'axis',
        backgroundColor: surface,
        borderColor: border,
        borderWidth: 1,
        padding: [8, 10],
        textStyle: { color: styles.getPropertyValue('--text').trim(), fontSize: 12 },
        valueFormatter: (value: unknown) => formatBitrate(Number(value))
      },
      xAxis: {
        type: 'category',
        boundaryGap: false,
        data: samples.map((point) =>
          new Date(point.time).toLocaleTimeString('zh-CN', {
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
            hour12: false
          })
        ),
        axisLine: { show: false },
        axisTick: { show: false },
        axisLabel: { color: textColor, fontSize: 11, hideOverlap: true }
      },
      yAxis: {
        type: 'value',
        splitNumber: 4,
        axisLabel: {
          color: textColor,
          fontSize: 11,
          formatter: (value: number) => formatBitrate(value)
        },
        splitLine: { lineStyle: { color: gridColor } }
      },
      series: [
        {
          name: '下行',
          type: 'line',
          smooth: 0.3,
          symbol: 'none',
          data: samples.map((point) => point.rx),
          lineStyle: { width: 2, color: rxColor },
          areaStyle: {
            color: {
              type: 'linear',
              x: 0,
              y: 0,
              x2: 0,
              y2: 1,
              colorStops: [
                { offset: 0, color: withAlpha(rxColor, 0.22) },
                { offset: 1, color: withAlpha(rxColor, 0) }
              ]
            }
          }
        },
        {
          name: '上行',
          type: 'line',
          smooth: 0.3,
          symbol: 'none',
          data: samples.map((point) => point.tx),
          lineStyle: { width: 2, color: txColor },
          areaStyle: {
            color: {
              type: 'linear',
              x: 0,
              y: 0,
              x2: 0,
              y2: 1,
              colorStops: [
                { offset: 0, color: withAlpha(txColor, 0.16) },
                { offset: 1, color: withAlpha(txColor, 0) }
              ]
            }
          }
        }
      ]
    }
  })
</script>

<style scoped>
  .mon-dialog {
    display: flex;
    flex-direction: column;
    gap: 16px;
  }

  .mon-kv {
    gap: 12px 18px;
  }

  .chart-placeholder {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 3px;
    height: 240px;
    color: var(--text-muted);
    font-size: var(--text-xs);
    border: 1px dashed var(--border-strong);
    border-radius: var(--radius-md);
  }

  .chart-placeholder svg {
    margin-bottom: 4px;
    color: var(--text-faint);
  }

  .chart-placeholder p {
    color: var(--text-secondary);
    font-size: var(--text-sm);
    font-weight: 500;
  }

  .mon-dialog-note {
    color: var(--text-muted);
    font-size: var(--text-xs);
  }
</style>
