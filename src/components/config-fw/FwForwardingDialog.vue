<template>
  <el-dialog
    :model-value="modelValue"
    :title="isNew ? '新增区域转发' : '编辑区域转发'"
    width="460px"
    append-to-body
    destroy-on-close
    @update:model-value="emit('update:modelValue', $event)"
  >
    <el-form ref="formRef" :model="form" :rules="rules" label-position="top" @submit.prevent>
      <el-form-item label="源区域" prop="src">
        <el-select v-model="form.src" class="fw-field" placeholder="流量来自哪个区域">
          <el-option v-for="zone in zoneNames" :key="zone" :label="zone" :value="zone" />
        </el-select>
      </el-form-item>

      <el-form-item label="目标区域" prop="dest">
        <el-select v-model="form.dest" class="fw-field" placeholder="流量转发到哪个区域">
          <el-option v-for="zone in zoneNames" :key="zone" :label="zone" :value="zone" />
        </el-select>
      </el-form-item>

      <el-alert
        type="info"
        show-icon
        :closable="false"
        title="区域转发允许一个区域的流量进入另一个区域"
        description="转发生效还需要源区域与目标区域的 forward 策略允许转发。"
      />
    </el-form>

    <template #footer>
      <el-button @click="emit('update:modelValue', false)">取消</el-button>
      <el-button type="primary" :loading="saving" @click="submit">保存</el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
  import { computed, reactive, ref, watch } from 'vue'
  import type { FormInstance, FormRules } from 'element-plus'
  import type { FwForwarding, FwForwardingDraft } from '@/api/firewallConfig'

  defineOptions({ name: 'FwForwardingDialog' })

  const props = withDefaults(
    defineProps<{
      modelValue: boolean
      forwarding?: FwForwarding | null
      zoneNames?: string[]
      saving?: boolean
    }>(),
    {
      forwarding: null,
      zoneNames: () => [],
      saving: false
    }
  )

  const emit = defineEmits<{
    (event: 'update:modelValue', value: boolean): void
    (event: 'save', draft: FwForwardingDraft): void
  }>()

  const formRef = ref<FormInstance>()

  const form = reactive<FwForwardingDraft>({
    id: undefined,
    src: '',
    dest: ''
  })

  const isNew = computed(() => !form.id)

  const rules = computed<FormRules>(() => ({
    src: [{ required: true, message: '请选择源区域', trigger: 'change' }],
    dest: [
      { required: true, message: '请选择目标区域', trigger: 'change' },
      {
        validator: (_rule: unknown, value: unknown, callback: (error?: string | Error) => void) => {
          if (value && value === form.src) {
            callback(new Error('源区域与目标区域不能相同'))
            return
          }
          callback()
        },
        trigger: 'change'
      }
    ]
  }))

  function reset(): void {
    const forwarding = props.forwarding
    form.id = forwarding?.id
    form.src = forwarding?.src ?? props.zoneNames[0] ?? ''
    form.dest = forwarding?.dest ?? props.zoneNames[1] ?? ''
  }

  watch(
    () => [props.modelValue, props.forwarding?.id] as const,
    ([open]) => {
      if (!open) return
      reset()
      formRef.value?.clearValidate()
    },
    { immediate: true }
  )

  async function submit(): Promise<void> {
    if (!formRef.value) return
    const valid = await formRef.value.validate().catch(() => false)
    if (!valid) return

    emit('save', {
      id: form.id,
      src: form.src.trim(),
      dest: form.dest.trim()
    })
  }
</script>

<style scoped>
  .fw-field {
    width: 100%;
  }

  @media (max-width: 640px) {
    :deep(.el-dialog) {
      width: 100% !important;
      margin: 0;
    }

    :deep(.el-dialog__body),
    :deep(.el-dialog__header),
    :deep(.el-dialog__footer) {
      padding-left: 16px;
      padding-right: 16px;
    }
  }
</style>
