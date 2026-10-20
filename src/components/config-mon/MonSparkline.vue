<template>
  <svg
    class="spark"
    :class="`spark-${tone}`"
    :viewBox="`0 0 ${width} ${height}`"
    preserveAspectRatio="none"
    role="img"
    :aria-label="label"
  >
    <defs>
      <linearGradient :id="gradientId" x1="0" y1="0" x2="0" y2="1">
        <stop class="spark-stop spark-stop-top" offset="0%" />
        <stop class="spark-stop spark-stop-bottom" offset="100%" />
      </linearGradient>
    </defs>
    <path v-if="geometry.area" class="spark-area" :d="geometry.area" :fill="`url(#${gradientId})`" />
    <path v-if="geometry.line" class="spark-line" :d="geometry.line" />
  </svg>
</template>

<script setup lang="ts">
  import { computed } from 'vue'

  const props = withDefaults(
    defineProps<{
      /** Samples to draw, oldest first. */
      values: number[]
      /** Semantic tone of the series. */
      tone?: 'rx' | 'tx' | 'brand' | 'warning'
      width?: number
      height?: number
      label?: string
    }>(),
    { tone: 'rx', width: 120, height: 32, label: '速率趋势' }
  )

  // A random id keeps several sparklines on the page from sharing a gradient.
  const gradientId = `mon-spark-${Math.random().toString(36).slice(2, 9)}`

  const geometry = computed(() => {
    const values = props.values.filter((value) => Number.isFinite(value))
    if (values.length < 2) return { line: '', area: '' }

    const max = Math.max(...values, 1)
    const step = props.width / (values.length - 1)
    const points = values.map((value, index) => {
      const x = index * step
      const ratio = Math.max(0, Math.min(1, value / max))
      const y = props.height - ratio * (props.height - 2) - 1
      return `${x.toFixed(2)},${y.toFixed(2)}`
    })

    const line = `M${points.join(' L')}`
    const area = `${line} L${props.width},${props.height} L0,${props.height} Z`
    return { line, area }
  })
</script>

<style scoped>
  .spark {
    display: block;
    width: 100%;
    min-width: 0;
  }

  /* The colours live in CSS rules: the CSSOM rejects `var()` inside a paint
     property, so a `stop-color` written through the style object would end up
     empty and break the gradient. */
  .spark-line {
    fill: none;
    stroke-width: 1.5;
    stroke-linecap: round;
    stroke-linejoin: round;
    vector-effect: non-scaling-stroke;
  }

  .spark-stop-top {
    stop-opacity: 0.26;
  }

  .spark-stop-bottom {
    stop-opacity: 0;
  }

  .spark-rx .spark-line {
    stroke: var(--chart-rx);
  }

  .spark-rx .spark-stop {
    stop-color: var(--chart-rx);
  }

  .spark-tx .spark-line {
    stroke: var(--chart-tx);
  }

  .spark-tx .spark-stop {
    stop-color: var(--chart-tx);
  }

  .spark-brand .spark-line {
    stroke: var(--brand);
  }

  .spark-brand .spark-stop {
    stop-color: var(--brand);
  }

  .spark-warning .spark-line {
    stroke: var(--warning);
  }

  .spark-warning .spark-stop {
    stop-color: var(--warning);
  }
</style>
