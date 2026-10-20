<template>
  <el-dialog
    :model-value="modelValue"
    :title="isNew ? '新增出站规则' : '编辑出站规则'"
    width="560px"
    append-to-body
    destroy-on-close
    @update:model-value="emit('update:modelValue', $event)"
  >
    <el-form ref="formRef" :model="form" :rules="rules" label-position="top" @submit.prevent>
      <el-form-item label="规则名称" prop="name">
        <el-input v-model="form.name" placeholder="例如 允许 DNS 出站" maxlength="48" clearable />
      </el-form-item>

      <div class="fw-grid">
        <el-form-item label="源" prop="src">
          <el-select v-model="form.src" class="fw-field" placeholder="流量来源区域">
            <el-option label="任意（any）" value="any" />
            <el-option v-for="zone in zoneNames" :key="zone" :label="zone" :value="zone" />
          </el-select>
        </el-form-item>

        <el-form-item label="目标" prop="dest">
          <el-input v-model="form.dest" placeholder="目标地址，留空表示任意" class="mono-input" clearable />
        </el-form-item>
      </div>

      <div class="fw-grid">
        <el-form-item label="协议" prop="proto">
          <el-select v-model="form.proto" class="fw-field">
            <el-option v-for="proto in protocols" :key="proto" :label="proto" :value="proto" />
          </el-select>
        </el-form-item>

        <el-form-item label="动作" prop="target">
          <el-select v-model="form.target" class="fw-field">
            <el-option v-for="action in actions" :key="action" :label="action" :value="action" />
          </el-select>
        </el-form-item>
      </div>

      <div class="fw-grid">
        <el-form-item label="协议族" prop="family">
          <el-select v-model="form.family" class="fw-field">
            <el-option v-for="family in families" :key="family" :label="family" :value="family" />
          </el-select>
        </el-form-item>

        <el-form-item label="启用">
          <el-switch v-model="form.enabled" />
        </el-form-item>
      </div>

      <el-alert
        v-if="form.target === 'REJECT' || form.target === 'DROP'"
        type="warning"
        show-icon
        :closable="false"
        title="该规则会阻断匹配到的流量"
        description="阻断类规则一旦应用，可能让依赖这些流量的服务中断。"
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
  import {
    FW_FAMILIES,
    FW_PROTOCOLS,
    FW_RULE_ACTIONS,
    type FwRule,
    type FwRuleDraft
  } from '@/api/firewallConfig'

  defineOptions({ name: 'FwRuleDialog' })

  const props = withDefaults(
    defineProps<{
      modelValue: boolean
      rule?: FwRule | null
      zoneNames?: string[]
      saving?: boolean
    }>(),
    {
      rule: null,
      zoneNames: () => [],
      saving: false
    }
  )

  const emit = defineEmits<{
    (event: 'update:modelValue', value: boolean): void
    (event: 'save', draft: FwRuleDraft): void
  }>()

  const formRef = ref<FormInstance>()
  const protocols = FW_PROTOCOLS
  const actions = FW_RULE_ACTIONS
  const families = FW_FAMILIES

  const form = reactive<FwRuleDraft>({
    id: undefined,
    name: '',
    src: 'any',
    dest: '',
    proto: 'tcp udp',
    target: 'ACCEPT',
    enabled: true,
    family: 'any'
  })

  const isNew = computed(() => !form.id)

  const rules = computed<FormRules>(() => ({
    name: [{ required: true, message: '请填写规则名称', trigger: 'blur' }],
    proto: [{ required: true, message: '请选择协议', trigger: 'change' }],
    target: [{ required: true, message: '请选择动作', trigger: 'change' }]
  }))

  function reset(): void {
    const rule = props.rule
    form.id = rule?.id
    form.name = rule?.name ?? ''
    form.src = rule?.src || 'any'
    form.dest = rule?.dest ?? ''
    form.proto = rule?.proto || 'tcp udp'
    form.target = rule?.target || 'ACCEPT'
    form.enabled = rule?.enabled ?? true
    form.family = rule?.family || 'any'
  }

  watch(
    () => [props.modelValue, props.rule?.id] as const,
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
      name: form.name.trim(),
      src: form.src.trim(),
      dest: form.dest.trim(),
      proto: form.proto.trim(),
      target: form.target.trim(),
      enabled: form.enabled,
      family: form.family.trim()
    })
  }
</script>

<style scoped>
  .fw-field {
    width: 100%;
  }

  .mono-input :deep(input) {
    font-family: var(--font-mono);
  }

  .fw-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 0 16px;
  }

  @media (max-width: 640px) {
    .fw-grid {
      grid-template-columns: minmax(0, 1fr);
    }

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
