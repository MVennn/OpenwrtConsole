<template>
  <div class="strength" :class="`tone-${tone}`">
    <div class="strength-head">
      <span class="strength-label">密码强度</span>
      <span class="strength-value">{{ label }}</span>
    </div>
    <div class="strength-bar" role="img" :aria-label="`密码强度：${label}`">
      <span
        v-for="index in 3"
        :key="index"
        class="strength-seg"
        :class="{ 'is-on': index <= score }"
      />
    </div>
    <p class="strength-hint">{{ hint }}</p>
  </div>
</template>

<script setup lang="ts">
  import { computed } from 'vue'

  const props = defineProps<{
    password: string
  }>()

  /** 0 = too weak, 1 = weak, 2 = fair, 3 = strong. */
  const score = computed(() => {
    const value = props.password
    if (!value) return 0

    let points = 0
    if (value.length >= 8) points += 1
    if (value.length >= 12) points += 1
    if (/[a-z]/.test(value) && /[A-Z]/.test(value)) points += 1
    if (/\d/.test(value)) points += 1
    if (/[^\w\s]/.test(value)) points += 1

    if (points <= 1) return 0
    if (points <= 3) return 1
    if (points <= 4) return 2
    return 3
  })

  const label = computed(() => {
    if (!props.password) return '未填写'
    if (score.value === 0) return '强度弱'
    if (score.value === 1) return '强度中'
    if (score.value === 2) return '强度较高'
    return '强度高'
  })

  const tone = computed(() => {
    if (!props.password) return 'empty'
    if (score.value === 0) return 'danger'
    if (score.value <= 1) return 'warning'
    return 'success'
  })

  const hint = computed(() => {
    const value = props.password
    if (!value) return '留空表示不修改当前密码'

    const missing: string[] = []
    if (value.length < 8) missing.push('至少 8 位')
    if (!(/[a-z]/.test(value) && /[A-Z]/.test(value))) missing.push('包含大小写字母')
    if (!/\d/.test(value)) missing.push('包含数字')
    if (!/[^\w\s]/.test(value)) missing.push('包含符号')

    if (!missing.length) return '密码强度足够'
    return `建议：${missing.join('、')}`
  })
</script>

<style scoped>
  .strength {
    display: flex;
    flex-direction: column;
    gap: 6px;
    padding: 10px 12px;
    background: var(--surface-2);
    border-radius: var(--radius-md);
  }

  .strength-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-2);
  }

  .strength-label {
    color: var(--text-secondary);
    font-size: 12px;
    font-weight: 500;
  }

  .strength-value {
    font-size: 12px;
    font-weight: 500;
  }

  .strength-bar {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 4px;
  }

  .strength-seg {
    height: 4px;
    background: var(--border-strong);
    border-radius: 999px;
  }

  .strength-hint {
    color: var(--text-muted);
    font-size: 12px;
    line-height: 1.5;
  }

  .tone-danger .strength-value {
    color: var(--danger-text);
  }

  .tone-danger .strength-seg.is-on {
    background: var(--danger);
  }

  .tone-warning .strength-value {
    color: var(--warning-text);
  }

  .tone-warning .strength-seg.is-on {
    background: var(--warning);
  }

  .tone-success .strength-value {
    color: var(--success-text);
  }

  .tone-success .strength-seg.is-on {
    background: var(--success);
  }

  .tone-empty .strength-value {
    color: var(--text-muted);
  }
</style>
