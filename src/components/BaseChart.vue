<template>
  <div ref="host" class="chart" :style="{ height: `${height}px` }" />
</template>

<script setup lang="ts">
  import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
  import * as echarts from 'echarts/core'
  import { LineChart } from 'echarts/charts'
  import { GridComponent, LegendComponent, TooltipComponent } from 'echarts/components'
  import { CanvasRenderer } from 'echarts/renderers'
  import type { EChartsCoreOption } from 'echarts/core'

  echarts.use([LineChart, GridComponent, LegendComponent, TooltipComponent, CanvasRenderer])

  const props = withDefaults(
    defineProps<{
      option: EChartsCoreOption
      height?: number
    }>(),
    { height: 280 }
  )

  const host = ref<HTMLDivElement>()
  let chart: echarts.ECharts | null = null
  let observer: ResizeObserver | null = null

  onMounted(() => {
    if (!host.value) return
    chart = echarts.init(host.value, undefined, { renderer: 'canvas' })
    chart.setOption(props.option)
    observer = new ResizeObserver(() => chart?.resize())
    observer.observe(host.value)
  })

  watch(
    () => props.option,
    (option) => chart?.setOption(option, { notMerge: true }),
    { deep: true }
  )

  onBeforeUnmount(() => {
    observer?.disconnect()
    chart?.dispose()
    chart = null
  })
</script>

<style scoped>
  .chart {
    width: 100%;
    min-width: 0;
  }
</style>
