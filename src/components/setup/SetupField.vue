<template>
  <div class="setup-field" :class="{ 'has-error': !!error }">
    <label class="setup-label" :for="$props.for || undefined">
      {{ label }}
      <span v-if="required" class="setup-required" aria-hidden="true">*</span>
    </label>
    <slot />
    <p v-if="error" class="setup-error">{{ error }}</p>
    <p v-else-if="hint" class="setup-hint">{{ hint }}</p>
  </div>
</template>

<script setup lang="ts">
  withDefaults(
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
</script>

<style scoped>
  .setup-field {
    display: flex;
    flex-direction: column;
    gap: 5px;
    min-width: 0;
  }

  .setup-label {
    color: var(--text-secondary);
    font-size: 13px;
    font-weight: 500;
    line-height: 1.4;
  }

  .setup-required {
    margin-left: 2px;
    color: var(--danger);
  }

  .setup-error {
    color: var(--danger-text);
    font-size: 12px;
    line-height: 1.5;
  }

  .setup-hint {
    color: var(--text-muted);
    font-size: 12px;
    line-height: 1.5;
  }
</style>
