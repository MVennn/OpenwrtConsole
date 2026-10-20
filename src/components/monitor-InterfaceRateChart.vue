<template>
  <div class="iface-chart">
    <div class="iface-chart-head">
      <el-select
        v-model="selected"
        class="iface-select"
        size="small"
        placeholder="选择接口"
        :disabled="!rows.length"
      >
        <el-option
          v-for="row in rows"
          :key="row.name"
          :label="row.name"
          :value="row.name"
        />
      </el-select>

      <div class="iface-legend">
        <span class="legend-item">
          <i class="legend-dot rx" />
          下行 <strong class="num">{{ formatBitrate(current.rx) }}</strong>
        </span>
        <span class="legend-item">
          <i class="legend-dot tx" />
          上行 <strong class="num">{{ formatBitrate(current.tx) }}</strong>
        </span>
      </div>
    </div>

    <BaseChart v-if="points.length > 1" :option="option" :height="220" />
    <div v-else class="chart-placeholder">
      <Network :size="22" :stroke-width="1.6" />
      <p>正在采集该接口的速率样本…</p>
      <span>约 10 秒后显示历史曲线</span>
    </div>
  </div>
</template>

<script setup lang="ts">
  import { computed, ref, watch } from 'vue'
  import { Network } from 'lucide-vue-next'
  import type { EChartsCoreOption } from 'echarts/core'
  import BaseChart from '@/components/BaseChart.vue'
  import { useTheme } from '@/composables/useTheme'
  import { MAX_CHART_POINTS, windowSamples, type InterfaceStat } from '@/api/monitor'
  import { formatBitrate, withAlpha } from '@/utils/format'

  const props = defineProps<{
    /** The interfaces the router reported. */
    rows: InterfaceStat[]
    /** Length of the visible window in milliseconds. */
    windowMs: number
  }>()

  const { isDark } = useTheme()

  const selected = ref('')

  // Keep a valid selection: the interface list changes with every poll.
  watch(
    () => props.rows.map((row) => row.name),
    (names) => {
      if (!names.length) {
        selected.value = ''
        return
      }
      if (!names.includes(selected.value)) selected.value = names[0]
    },
    { immediate: true }
  )

  const active = computed(
    () => props.rows.find((row) => row.name === selected.value) ?? null
  )

  const points = computed(() =>
    active.value ? windowSamples(active.value.history, props.windowMs, MAX_CHART_POINTS) : []
  )

  const current = computed(() => ({
    rx: active.value?.rxRate ?? 0,
    tx: active.value?.txRate ?? 0
  }))

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
  .iface-chart {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .iface-chart-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    flex-wrap: wrap;
  }

  .iface-select {
    width: 180px;
  }

  .iface-legend {
    display: flex;
    align-items: center;
    gap: 14px;
    color: var(--text-muted);
    font-size: 11.5px;
  }

  .legend-item {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    white-space: nowrap;
  }

  .legend-item strong {
    color: var(--text);
    font-weight: 500;
  }

  .legend-dot {
    width: 7px;
    height: 7px;
    border-radius: 50%;
  }

  .legend-dot.rx {
    background: var(--chart-rx);
  }

  .legend-dot.tx {
    background: var(--chart-tx);
  }

  .chart-placeholder {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 3px;
    height: 220px;
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
</style>
