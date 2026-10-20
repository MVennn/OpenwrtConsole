<template>
  <el-dialog
    :model-value="modelValue"
    :title="isNew ? '新增端口转发' : '编辑端口转发'"
    width="560px"
    append-to-body
    destroy-on-close
    @update:model-value="emit('update:modelValue', $event)"
  >
    <el-form ref="formRef" :model="form" :rules="rules" label-position="top" @submit.prevent>
      <el-form-item label="规则名称" prop="name">
        <el-input v-model="form.name" placeholder="可选，便于识别" maxlength="48" clearable />
      </el-form-item>

      <div class="fw-grid">
        <el-form-item label="源区域" prop="src">
          <el-select v-model="form.src" class="fw-field" placeholder="外部流量来自哪个区域">
            <el-option v-for="zone in zoneNames" :key="zone" :label="zone" :value="zone" />
          </el-select>
        </el-form-item>

        <el-form-item label="协议" prop="proto">
          <el-select v-model="form.proto" class="fw-field">
            <el-option v-for="proto in protocols" :key="proto" :label="proto" :value="proto" />
          </el-select>
        </el-form-item>
      </div>

      <div class="fw-grid">
        <el-form-item label="源地址" prop="srcIp">
          <el-input v-model="form.srcIp" placeholder="留空表示任意" class="mono-input" clearable />
        </el-form-item>

        <el-form-item label="源端口" prop="srcDport">
          <el-input v-model="form.srcDport" placeholder="例如 443" class="mono-input" clearable />
        </el-form-item>
      </div>

      <div class="fw-grid">
        <el-form-item label="目标 IP" prop="destIp">
          <el-input v-model="form.destIp" placeholder="内网设备地址" class="mono-input" clearable />
        </el-form-item>

        <el-form-item label="目标端口" prop="destPort">
          <el-input v-model="form.destPort" placeholder="例如 8080" class="mono-input" clearable />
        </el-form-item>
      </div>

      <div class="fw-grid">
        <el-form-item label="转发目标" prop="target">
          <el-input v-model="form.target" placeholder="可选，主机名或地址" class="mono-input" clearable />
        </el-form-item>

        <el-form-item label="启用">
          <el-switch v-model="form.enabled" />
        </el-form-item>
      </div>

      <el-alert
        v-if="!form.destIp && !form.target"
        type="info"
        show-icon
        :closable="false"
        title="未填写目标地址或转发目标"
        description="没有目标时该规则不会真正转发任何流量。"
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
  import { FW_PROTOCOLS, type FwRedirect, type FwRedirectDraft } from '@/api/firewallConfig'

  defineOptions({ name: 'FwRedirectDialog' })

  const props = withDefaults(
    defineProps<{
      modelValue: boolean
      redirect?: FwRedirect | null
      zoneNames?: string[]
      saving?: boolean
    }>(),
    {
      redirect: null,
      zoneNames: () => [],
      saving: false
    }
  )

  const emit = defineEmits<{
    (event: 'update:modelValue', value: boolean): void
    (event: 'save', draft: FwRedirectDraft): void
  }>()

  const formRef = ref<FormInstance>()
  const protocols = FW_PROTOCOLS

  const form = reactive<FwRedirectDraft>({
    id: undefined,
    name: '',
    src: '',
    srcIp: '',
    srcDport: '',
    destIp: '',
    destPort: '',
    proto: 'tcp',
    target: '',
    enabled: true
  })

  const isNew = computed(() => !form.id)

  const rules = computed<FormRules>(() => ({
    src: [{ required: true, message: '请选择源区域', trigger: 'change' }],
    proto: [{ required: true, message: '请选择协议', trigger: 'change' }]
  }))

  function reset(): void {
    const redirect = props.redirect
    form.id = redirect?.id
    form.name = redirect?.name ?? ''
    form.src = redirect?.src ?? props.zoneNames[0] ?? ''
    form.srcIp = redirect?.srcIp ?? ''
    form.srcDport = redirect?.srcDport ?? ''
    form.destIp = redirect?.destIp ?? ''
    form.destPort = redirect?.destPort ?? ''
    form.proto = redirect?.proto || 'tcp'
    form.target = redirect?.target ?? ''
    form.enabled = redirect?.enabled ?? true
  }

  watch(
    () => [props.modelValue, props.redirect?.id] as const,
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
      srcIp: form.srcIp.trim(),
      srcDport: form.srcDport.trim(),
      destIp: form.destIp.trim(),
      destPort: form.destPort.trim(),
      proto: form.proto.trim(),
      target: form.target.trim(),
      enabled: form.enabled
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
