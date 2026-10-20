<template>
  <el-dialog
    :model-value="modelValue"
    :title="isNew ? '新增安全区域' : '编辑安全区域'"
    width="560px"
    append-to-body
    destroy-on-close
    @update:model-value="emit('update:modelValue', $event)"
  >
    <el-form ref="formRef" :model="form" :rules="rules" label-position="top" @submit.prevent>
      <el-form-item label="区域名称" prop="name">
        <el-input
          v-model="form.name"
          placeholder="例如 lan、guest、iot"
          maxlength="32"
          clearable
        />
      </el-form-item>

      <el-form-item label="成员网络" prop="networks">
        <el-select
          v-model="form.networks"
          multiple
          filterable
          allow-create
          default-first-option
          class="fw-field"
          placeholder="选择该区域负责的网络"
        >
          <el-option v-for="net in networkOptions" :key="net" :label="net" :value="net" />
        </el-select>
        <p class="fw-hint">区域会接管所选网络的流量，未选择时该区域不绑定任何接口。</p>
      </el-form-item>

      <div class="fw-grid">
        <el-form-item label="入站策略（input）" prop="input">
          <el-select v-model="form.input" class="fw-field">
            <el-option v-for="policy in policies" :key="policy" :label="policy" :value="policy" />
          </el-select>
        </el-form-item>

        <el-form-item label="出站策略（output）" prop="output">
          <el-select v-model="form.output" class="fw-field">
            <el-option v-for="policy in policies" :key="policy" :label="policy" :value="policy" />
          </el-select>
        </el-form-item>
      </div>

      <div class="fw-grid">
        <el-form-item label="转发策略（forward）" prop="forward">
          <el-select v-model="form.forward" class="fw-field">
            <el-option v-for="policy in policies" :key="policy" :label="policy" :value="policy" />
          </el-select>
        </el-form-item>

        <el-form-item label="是否允许输入">
          <el-switch
            :model-value="allowInput"
            inline-prompt
            active-text="允许"
            inactive-text="拒绝"
            @update:model-value="setAllowInput"
          />
        </el-form-item>
      </div>

      <div class="fw-grid">
        <el-form-item label="NAT（masq）">
          <el-switch v-model="form.masq" />
        </el-form-item>

        <el-form-item label="MTU 修正（mtu_fix）">
          <el-switch v-model="form.mtuFix" />
        </el-form-item>
      </div>

      <el-alert
        v-if="policyChanged"
        type="warning"
        show-icon
        :closable="false"
        title="入站 / 出站 / 转发策略发生变化"
        description="策略改动会在应用后重建防火墙规则链，可能中断当前连接（包括本管理页面的访问）。"
      />

      <p v-if="isNew" class="fw-hint fw-hint-strong">
        新区域会生成一个匿名 UCI 段名（cfgXXXXXX），区域名称写在 name 选项中。
      </p>
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
  import { FW_POLICIES, type FwZone, type FwZoneDraft } from '@/api/firewallConfig'

  defineOptions({ name: 'FwZoneDialog' })

  const props = withDefaults(
    defineProps<{
      modelValue: boolean
      zone?: FwZone | null
      /** Interface names of the network config. */
      networkOptions?: string[]
      /** Names of the other zones, used to keep the zone name unique. */
      takenNames?: string[]
      saving?: boolean
    }>(),
    {
      zone: null,
      networkOptions: () => [],
      takenNames: () => [],
      saving: false
    }
  )

  const emit = defineEmits<{
    (event: 'update:modelValue', value: boolean): void
    (event: 'save', draft: FwZoneDraft): void
  }>()

  const formRef = ref<FormInstance>()
  const policies = FW_POLICIES

  const form = reactive<FwZoneDraft>({
    id: undefined,
    name: '',
    networks: [],
    input: 'REJECT',
    output: 'ACCEPT',
    forward: 'REJECT',
    masq: false,
    mtuFix: false,
    family: ''
  })

  const isNew = computed(() => !form.id)

  /** The allow-input switch mirrors the input policy. */
  const allowInput = computed(() => form.input === 'ACCEPT')

  function setAllowInput(value: boolean | string | number): void {
    form.input = value ? 'ACCEPT' : 'REJECT'
  }

  /** True when the policy differs from the stored zone. */
  const policyChanged = computed(() => {
    if (!props.zone) return false
    return (
      props.zone.input !== form.input ||
      props.zone.output !== form.output ||
      props.zone.forward !== form.forward
    )
  })

  const rules = computed<FormRules>(() => ({
    name: [
      { required: true, message: '请填写区域名称', trigger: 'blur' },
      {
        validator: (_rule: unknown, value: unknown, callback: (error?: string | Error) => void) => {
          const name = String(value ?? '').trim()
          if (!name) {
            callback(new Error('请填写区域名称'))
            return
          }
          if (props.takenNames.includes(name)) {
            callback(new Error(`已存在名为 ${name} 的区域`))
            return
          }
          callback()
        },
        trigger: ['blur', 'change']
      }
    ]
  }))

  function reset(): void {
    const zone = props.zone
    form.id = zone?.id
    form.name = zone?.name ?? ''
    form.networks = zone ? [...zone.networks] : []
    form.input = zone?.input || 'REJECT'
    form.output = zone?.output || 'ACCEPT'
    form.forward = zone?.forward || 'REJECT'
    form.masq = zone?.masq ?? false
    form.mtuFix = zone?.mtuFix ?? false
    form.family = zone?.family ?? ''
  }

  watch(
    () => [props.modelValue, props.zone?.id] as const,
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
      networks: [...form.networks],
      input: form.input,
      output: form.output,
      forward: form.forward,
      masq: form.masq,
      mtuFix: form.mtuFix,
      family: form.family
    })
  }
</script>

<style scoped>
  .fw-field {
    width: 100%;
  }

  .fw-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 0 16px;
  }

  .fw-hint {
    margin-top: 4px;
    color: var(--text-muted);
    font-size: 11.5px;
    line-height: 1.6;
  }

  .fw-hint-strong {
    margin-top: 10px;
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
