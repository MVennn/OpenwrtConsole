<template>
  <div class="sys-field" :class="{ 'has-error': !!error }">
    <label class="sys-label" :for="$props.for || undefined">
      {{ label }}
      <span v-if="required" class="sys-required" aria-hidden="true">*</span>
    </label>
    <slot :id="fieldId" />
    <p v-if="error" class="sys-error">{{ error }}</p>
    <p v-else-if="hint" class="sys-hint">{{ hint }}</p>
  </div>
</template>

<script setup lang="ts">
  import { computed, useId } from 'vue'

  const props = withDefaults(
    defineProps<{
      label: string
      /** Id of the control the label points at. */
      for?: string
      /** Marks the field as required (red asterisk). */
      required?: boolean
      /** Error message, shown right below the control. */
      error?: string
      /** Hint text, shown when there is no error. */
      hint?: string
    }>(),
    { for: '', required: false, error: '', hint: '' }
  )

  const generatedId = useId()
  const fieldId = computed(() => props.for || `sys-field-${generatedId}`)
</script>

<style scoped>
  .sys-field {
    display: flex;
    flex-direction: column;
    gap: 5px;
    min-width: 0;
  }

  .sys-label {
    color: var(--text-secondary);
    font-size: var(--text-sm);
    font-weight: 500;
    line-height: 1.4;
  }

  .sys-required {
    margin-left: 2px;
    color: var(--danger);
  }

  .sys-error {
    color: var(--danger-text);
    font-size: var(--text-xs);
    line-height: 1.5;
  }

  .sys-hint {
    color: var(--text-muted);
    font-size: var(--text-xs);
    line-height: 1.5;
  }
</style>
