<template>
  <el-dialog
    :model-value="modelValue"
    class="wifi-dialog"
    :width="dialogWidth"
    :title="dialogTitle"
    :close-on-click-modal="false"
    append-to-body
    @update:model-value="emit('update:modelValue', $event)"
  >
    <template v-if="radio">
      <el-form label-position="top" class="wifi-form" @submit.prevent>
        <div class="field-grid">
          <el-form-item label="频段">
            <el-select v-model="form.band" style="width: 100%">
              <el-option v-for="option in bandOptions" :key="option.value" :label="option.label" :value="option.value" />
            </el-select>
          </el-form-item>

          <el-form-item label="带宽（HT 模式）">
            <el-select v-model="form.htmode" style="width: 100%">
              <el-option
                v-for="option in htmodeOptions"
                :key="option"
                :label="option"
                :value="option"
              />
            </el-select>
          </el-form-item>
        </div>

        <el-form-item label="信道">
          <div class="channel-row">
            <el-radio-group v-model="form.channelMode" size="small">
              <el-radio-button value="auto">自动</el-radio-button>
              <el-radio-button value="fixed">固定信道</el-radio-button>
            </el-radio-group>
            <el-select
              v-if="form.channelMode === 'fixed'"
              v-model="form.channel"
              size="small"
              class="channel-select"
            >
              <el-option v-for="item in channels" :key="item" :label="`信道 ${item}`" :value="String(item)" />
            </el-select>
          </div>
          <p class="field-hint">「自动」由路由器自行选择干扰最小的信道。</p>
        </el-form-item>

        <div class="field-grid">
          <el-form-item label="国家码" :error="errors.country">
            <el-input
              v-model="form.country"
              maxlength="2"
              placeholder="CN"
              @input="form.country = form.country.toUpperCase()"
            />
            <p class="field-hint">两位大写字母，决定可用的信道与功率上限。</p>
          </el-form-item>

          <el-form-item label="发射功率">
            <el-select v-model="form.txpower" style="width: 100%">
              <el-option
                v-for="option in txpowerOptions"
                :key="option.value"
                :label="option.label"
                :value="option.value"
              />
            </el-select>
          </el-form-item>
        </div>

        <div class="switch-field">
          <div class="switch-copy">
            <span class="switch-label">启用该射频</span>
            <span class="switch-hint">关闭后该射频上的所有 SSID 都会停止广播。</span>
          </div>
          <el-switch v-model="form.enabled" />
        </div>
      </el-form>

      <div v-if="changes.length" class="change-box">
        <p class="change-title">将生效的改动</p>
        <ul class="change-list">
          <li v-for="change in changes" :key="change.option">
            <span class="change-label">{{ change.label }}</span>
            <span class="change-from">{{ change.from }}</span>
            <span class="change-arrow">→</span>
            <span class="change-to">{{ change.to }}</span>
          </li>
        </ul>
        <p class="change-note">改动先写入暂存区，点击「保存并应用」后无线服务才会重新加载，连接会短暂中断。</p>
      </div>
      <p v-else class="change-empty">尚未修改任何内容。</p>
    </template>

    <template #footer>
      <el-button @click="emit('update:modelValue', false)">取消</el-button>
      <el-button type="primary" :loading="saving" :disabled="!changes.length" @click="save">
        暂存改动
      </el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
  import { computed, reactive, ref, watch } from 'vue'
  import { ElMessage } from 'element-plus'
  import { useMediaQuery } from '@/composables/useMediaQuery'
  import {
    stageWirelessConfig,
    bandText,
    channelsForBand,
    HTMODE_OPTIONS,
    type WifiRadioConfig
  } from '@/api/wirelessConfig'
  import type { StagedEdit } from '@/api/configPending'

  interface PendingChange {
    option: string
    label: string
    from: string
    to: string
  }

  const props = defineProps<{
    modelValue: boolean
    radio: WifiRadioConfig | null
  }>()

  const emit = defineEmits<{
    'update:modelValue': [value: boolean]
    /** The changes that were staged in the UCI delta. */
    saved: [edits: StagedEdit[]]
  }>()

  const form = reactive({
    band: '',
    htmode: '',
    channelMode: 'auto' as 'auto' | 'fixed',
    channel: '',
    country: '',
    txpower: '',
    enabled: true
  })

  const errors = reactive({ country: '' })
  const saving = ref(false)

  // The dialog is teleported to the body — a scoped rule cannot reach it, so
  // the mobile width is driven by the `width` property instead.
  const isMobile = useMediaQuery('(max-width: 640px)')
  const dialogWidth = computed(() => (isMobile.value ? '100%' : '520px'))

  const dialogTitle = computed(() =>
    props.radio?.section ? `编辑射频 · ${props.radio.section}` : '编辑射频'
  )

  const bandOptions = [
    { value: '2g', label: '2.4 GHz' },
    { value: '5g', label: '5 GHz' },
    { value: '6g', label: '6 GHz' }
  ]

  const htmodeOptions = computed(() => {
    const current = form.htmode
    return current && !HTMODE_OPTIONS.includes(current)
      ? [...HTMODE_OPTIONS, current]
      : HTMODE_OPTIONS
  })

  const channels = computed(() => channelsForBand(form.band || props.radio?.band))

  const txpowerOptions = computed(() => {
    const options = [
      { value: '', label: '驱动默认值' },
      { value: 'auto', label: '自动' }
    ]
    for (let dbm = 0; dbm <= 30; dbm += 1) {
      options.push({ value: String(dbm), label: `${dbm} dBm` })
    }
    const current = form.txpower
    if (current && !options.some((item) => item.value === current)) {
      options.push({ value: current, label: `${current}（当前值）` })
    }
    return options
  })

  /** Everything that differs from the stored configuration. */
  const changes = computed<PendingChange[]>(() => {
    const radio = props.radio
    if (!radio) return []
    const list: PendingChange[] = []

    if (form.band !== radio.band) {
      list.push({
        option: 'band',
        label: '频段',
        from: bandText(radio.band),
        to: bandText(form.band)
      })
    }
    if (form.htmode !== radio.htmode) {
      list.push({
        option: 'htmode',
        label: '带宽',
        from: radio.htmode || '（未设置）',
        to: form.htmode || '（未设置）'
      })
    }

    const desiredChannel = form.channelMode === 'auto' ? 'auto' : form.channel
    const originalChannel = radio.channel || 'auto'
    if (desiredChannel !== originalChannel) {
      list.push({
        option: 'channel',
        label: '信道',
        from: originalChannel === 'auto' ? '自动' : originalChannel,
        to: desiredChannel === 'auto' ? '自动' : desiredChannel
      })
    }

    if (form.country !== radio.country) {
      list.push({
        option: 'country',
        label: '国家码',
        from: radio.country || '（未设置）',
        to: form.country || '（未设置）'
      })
    }
    if (form.txpower !== radio.txpower) {
      list.push({
        option: 'txpower',
        label: '发射功率',
        from: radio.txpower ? `${radio.txpower}` : '驱动默认值',
        to: form.txpower ? `${form.txpower}` : '驱动默认值'
      })
    }
    if (form.enabled === radio.disabled) {
      list.push({
        option: 'disabled',
        label: '射频状态',
        from: radio.disabled ? '已禁用' : '已启用',
        to: form.enabled ? '已启用' : '已禁用'
      })
    }

    return list
  })

  function reset(): void {
    const radio = props.radio
    const channel = radio?.channel || ''
    form.band = radio?.band ?? ''
    form.htmode = radio?.htmode ?? ''
    form.channelMode = !channel || channel === 'auto' ? 'auto' : 'fixed'
    form.channel = form.channelMode === 'fixed' ? channel : String(channels.value[0] ?? 11)
    form.country = radio?.country ?? ''
    form.txpower = radio?.txpower ?? ''
    form.enabled = !radio?.disabled
    errors.country = ''
  }

  watch(
    () => props.modelValue,
    (open) => {
      if (open) reset()
    },
    { immediate: true }
  )

  function validate(): boolean {
    errors.country = ''
    if (form.country && !/^[A-Za-z]{2}$/.test(form.country)) {
      errors.country = '国家码必须是两个字母，例如 CN'
    }
    if (form.channelMode === 'fixed' && !form.channel) {
      ElMessage.warning('请选择固定信道')
      return false
    }
    return !errors.country
  }

  async function save(): Promise<void> {
    const radio = props.radio
    if (!radio?.section) return
    if (!validate()) return

    const values: Record<string, string> = {}
    const remove: string[] = []

    for (const change of changes.value) {
      switch (change.option) {
        case 'band':
          values.band = form.band
          break
        case 'htmode':
          if (form.htmode) values.htmode = form.htmode
          else remove.push('htmode')
          break
        case 'channel':
          values.channel = form.channelMode === 'auto' ? 'auto' : form.channel
          break
        case 'country':
          if (form.country) values.country = form.country
          else remove.push('country')
          break
        case 'txpower':
          if (form.txpower) values.txpower = form.txpower
          else remove.push('txpower')
          break
        case 'disabled':
          values.disabled = form.enabled ? '0' : '1'
          break
        default:
          break
      }
    }

    saving.value = true
    try {
      const result = await stageWirelessConfig([{ section: radio.section, values, remove }])
      ElMessage.success('射频配置已暂存，点击「保存并应用」后生效')
      emit('saved', result.edits)
      emit('update:modelValue', false)
    } catch (err) {
      ElMessage.error(err instanceof Error ? err.message : '保存失败')
    } finally {
      saving.value = false
    }
  }
</script>

<style scoped>
  .wifi-form :deep(.el-form-item) {
    margin-bottom: 14px;
  }

  .wifi-form :deep(.el-form-item__label) {
    padding-bottom: 4px;
    color: var(--text-secondary);
    font-size: 13px;
    font-weight: 500;
    line-height: 1.4;
  }

  .field-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 0 14px;
  }

  .channel-row {
    display: flex;
    align-items: center;
    gap: 10px;
    width: 100%;
  }

  .channel-select {
    width: 140px;
  }

  .switch-field {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    padding: 10px 12px;
    margin-bottom: 14px;
    background: var(--surface-3);
    border: 1px solid var(--border);
    border-radius: var(--radius);
  }

  .switch-copy {
    display: flex;
    flex-direction: column;
    min-width: 0;
  }

  .switch-label {
    color: var(--text);
    font-size: 13px;
    font-weight: 500;
  }

  .switch-hint {
    color: var(--text-muted);
    font-size: 11px;
  }

  .field-hint {
    width: 100%;
    margin-top: 4px;
    color: var(--text-muted);
    font-size: 11.5px;
    line-height: 1.5;
  }

  .change-box {
    padding: 12px 14px;
    margin-top: 4px;
    background: var(--surface-3);
    border: 1px solid var(--border);
    border-radius: var(--radius);
  }

  .change-title {
    color: var(--text);
    font-size: 12px;
    font-weight: 600;
  }

  .change-list {
    display: flex;
    flex-direction: column;
    gap: 4px;
    padding: 0;
    margin: 8px 0 0;
    list-style: none;
  }

  .change-list li {
    display: flex;
    align-items: baseline;
    flex-wrap: wrap;
    gap: 6px;
    color: var(--text-secondary);
    font-size: 12px;
  }

  .change-label {
    color: var(--text-muted);
  }

  .change-from {
    color: var(--text-faint);
    text-decoration: line-through;
  }

  .change-arrow {
    color: var(--text-faint);
  }

  .change-to {
    color: var(--text);
    font-weight: 500;
  }

  .change-note {
    margin-top: 8px;
    color: var(--text-muted);
    font-size: 11.5px;
  }

  .change-empty {
    margin-top: 4px;
    color: var(--text-muted);
    font-size: 12px;
  }

  @media (max-width: 640px) {
    .field-grid {
      grid-template-columns: minmax(0, 1fr);
    }

    .channel-row {
      flex-direction: column;
      align-items: stretch;
    }

    .channel-select {
      width: 100%;
    }
  }
</style>
