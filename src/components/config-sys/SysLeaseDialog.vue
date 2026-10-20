<template>
  <el-dialog
    :model-value="modelValue"
    :title="lease ? '编辑静态租约' : '新增静态租约'"
    width="440px"
    @update:model-value="emit('update:modelValue', $event)"
    @open="reset"
  >
    <div class="lease-form">
      <SysFormField label="主机名" required error="errors.name" for="lease-name">
        <el-input
          id="lease-name"
          v-model="form.name"
          placeholder="例如 living-room-pc"
          maxlength="63"
          @input="clearError('name')"
        />
      </SysFormField>

      <SysFormField label="MAC 地址" required error="errors.mac" for="lease-mac">
        <el-input
          id="lease-mac"
          v-model="form.mac"
          placeholder="例如 00:11:22:33:44:55"
          maxlength="17"
          @input="clearError('mac')"
        />
      </SysFormField>

      <SysFormField
        label="IP 地址"
        required
        error="errors.ip"
        hint="必须位于动态地址池之外，避免与自动分配冲突"
        for="lease-ip"
      >
        <el-input
          id="lease-ip"
          v-model="form.ip"
          placeholder="例如 192.168.1.50"
          maxlength="15"
          @input="clearError('ip')"
        />
      </SysFormField>
    </div>

    <template #footer>
      <el-button @click="emit('update:modelValue', false)">取消</el-button>
      <el-button type="primary" :loading="submitting" @click="submit">保存</el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
  import { reactive, ref } from 'vue'
  import SysFormField from './SysFormField.vue'
  import {
    validateStaticLease,
    type SysResolvedPool,
    type SysStaticLease
  } from '@/api/systemSettings'

  const props = defineProps<{
    modelValue: boolean
    /** The lease that is edited, null creates a new one. */
    lease: SysStaticLease | null
    /** All known leases, used for the duplicate checks. */
    leases: SysStaticLease[]
    /** The resolved pools, used for the pool conflict check. */
    pools: SysResolvedPool[]
  }>()

  const emit = defineEmits<{
    (event: 'update:modelValue', value: boolean): void
    (event: 'submit', value: { name: string; mac: string; ip: string }): void
  }>()

  const submitting = ref(false)
  const form = reactive({ name: '', mac: '', ip: '' })
  const errors = reactive<{ name: string; mac: string; ip: string }>({
    name: '',
    mac: '',
    ip: ''
  })

  function reset(): void {
    form.name = props.lease?.name ?? ''
    form.mac = props.lease?.mac ?? ''
    form.ip = props.lease?.ip ?? ''
    errors.name = ''
    errors.mac = ''
    errors.ip = ''
  }

  function clearError(field: 'name' | 'mac' | 'ip'): void {
    errors[field] = ''
  }

  function submit(): void {
    const result = validateStaticLease(
      { name: form.name, mac: form.mac, ip: form.ip },
      { leases: props.leases, pools: props.pools, editingSection: props.lease?.section }
    )

    errors.name = result.field === 'name' ? result?.message : ''
    errors.mac = result.field === 'mac' ? result?.message : ''
    errors.ip = result.field === 'ip' ? result?.message : ''

    if (!result.ok) return

    submitting.value = true
    emit('submit', {
      name: form.name.trim(),
      mac: form.mac.trim().toLowerCase(),
      ip: form.ip.trim()
    })
  }

  /** Called by the parent when the write finished. */
  function finish(): void {
    submitting.value = false
  }

  defineExpose({ finish })
</script>

<style scoped>
  .lease-form {
    display: flex;
    flex-direction: column;
    gap: 14px;
  }

  @media (max-width: 640px) {
    .lease-form {
      gap: 12px;
    }
  }
</style>
