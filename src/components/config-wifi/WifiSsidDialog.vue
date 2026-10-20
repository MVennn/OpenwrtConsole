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
    <template v-if="iface">
      <el-form label-position="top" class="wifi-form" @submit.prevent>
        <el-form-item label="SSID 名称" required :error="errors.ssid">
          <el-input
            v-model="form.ssid"
            maxlength="32"
            show-word-limit
            placeholder="无线网络名称"
          />
        </el-form-item>

        <el-form-item label="加密方式">
          <el-select v-model="form.encryption" style="width: 100%">
            <el-option
              v-for="option in encryptionOptions"
              :key="option.value"
              :label="option.label"
              :value="option.value"
            />
          </el-select>
        </el-form-item>

        <el-form-item v-if="form.encryption !== 'none'" label="密码" :error="errors.key">
          <el-input
            v-model="form.key"
            type="password"
            show-password
            autocomplete="new-password"
            :placeholder="iface.keySet ? '留空表示不修改现有密码' : '请输入至少 8 位密码'"
          />
          <p class="field-hint">
            {{ iface.keySet ? '当前密码：已设置。留空表示不修改。' : '当前未设置密码。' }}
          </p>
        </el-form-item>

        <div class="field-grid">
          <el-form-item label="工作模式">
            <el-select v-model="form.mode" style="width: 100%">
              <el-option
                v-for="option in modeOptions"
                :key="option.value"
                :label="option.label"
                :value="option.value"
              />
            </el-select>
          </el-form-item>

          <el-form-item label="绑定网络">
            <el-select v-model="form.network" style="width: 100%">
              <el-option
                v-for="option in networkOptions"
                :key="option.value"
                :label="option.label"
                :value="option.value"
              />
            </el-select>
          </el-form-item>
        </div>

        <div class="switch-grid">
          <div class="switch-field">
            <div class="switch-copy">
              <span class="switch-label">隐藏网络</span>
              <span class="switch-hint">不广播 SSID，需要手动添加</span>
            </div>
            <el-switch v-model="form.hidden" />
          </div>
          <div class="switch-field">
            <div class="switch-copy">
              <span class="switch-label">访客网络</span>
              <span class="switch-hint">隔离该网络内的客户端</span>
            </div>
            <el-switch v-model="form.guest" />
          </div>
        </div>

        <el-form-item label="MAC 过滤模式">
          <el-select v-model="form.macfilter" style="width: 100%">
            <el-option
              v-for="option in macFilterOptions"
              :key="option.value"
              :label="option.label"
              :value="option.value"
            />
          </el-select>
        </el-form-item>

        <el-form-item
          v-if="form.macfilter !== '0'"
          label="MAC 地址列表"
          :error="errors.maclist"
        >
          <el-input
            v-model="form.maclist"
            type="textarea"
            :rows="2"
            placeholder="AA:BB:CC:DD:EE:FF，多个地址用空格分隔"
          />
          <p class="field-hint">
            {{ form.macfilter === '1' ? '白名单：只有列表内的设备可以连接。' : '黑名单：列表内的设备无法连接。' }}
          </p>
        </el-form-item>
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
        <p class="change-note">保存后无线服务会重新加载，连接会短暂中断。</p>
      </div>
      <p v-else class="change-empty">尚未修改任何内容。</p>
    </template>

    <template #footer>
      <el-button @click="emit('update:modelValue', false)">取消</el-button>
      <el-button
        type="primary"
        :loading="saving"
        :disabled="!changes.length"
        @click="save"
      >
        保存并应用
      </el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
  import { computed, reactive, ref, watch } from 'vue'
  import { ElMessage } from 'element-plus'
  import { useMediaQuery } from '@/composables/useMediaQuery'
  import {
    applyWirelessConfig,
    discardWirelessChanges,
    encryptionText,
    macFilterText,
    modeText,
    ENCRYPTION_OPTIONS,
    IFACE_MODE_OPTIONS,
    MAC_FILTER_OPTIONS,
    type WifiIfaceConfig
  } from '@/api/wirelessConfig'

  interface PendingChange {
    option: string
    label: string
    from: string
    to: string
  }

  const props = defineProps<{
    modelValue: boolean
    iface: WifiIfaceConfig | null
    networks: string[]
  }>()

  const emit = defineEmits<{
    'update:modelValue': [value: boolean]
    saved: []
  }>()

  const form = reactive({
    ssid: '',
    encryption: 'none',
    key: '',
    mode: 'ap',
    network: '',
    hidden: false,
    guest: false,
    macfilter: '0',
    maclist: ''
  })

  const errors = reactive({ ssid: '', key: '', maclist: '' })
  const saving = ref(false)

  // The dialog is teleported to the body — a scoped rule cannot reach it, so
  // the mobile width is driven by the `width` property instead.
  const isMobile = useMediaQuery('(max-width: 640px)')
  const dialogWidth = computed(() => (isMobile.value ? '100%' : '560px'))

  const dialogTitle = computed(() =>
    props.iface?.ssid ? `编辑 SSID · ${props.iface.ssid}` : '编辑 SSID'
  )

  const encryptionOptions = computed(() => {
    const known = ENCRYPTION_OPTIONS.some((item) => item.value === form.encryption)
    return known
      ? ENCRYPTION_OPTIONS
      : [...ENCRYPTION_OPTIONS, { value: form.encryption, label: `${form.encryption}（当前值）` }]
  })

  const modeOptions = computed(() => {
    const known = IFACE_MODE_OPTIONS.some((item) => item.value === form.mode)
    return known
      ? IFACE_MODE_OPTIONS
      : [...IFACE_MODE_OPTIONS, { value: form.mode, label: `${form.mode}（当前值）` }]
  })

  const networkOptions = computed(() => {
    const names = props.networks.slice()
    if (form.network && !names.includes(form.network)) names.unshift(form.network)
    return names.map((name) => ({ value: name, label: name }))
  })

  const macFilterOptions = MAC_FILTER_OPTIONS

  /** Everything that differs from the stored configuration. */
  const changes = computed<PendingChange[]>(() => {
    const iface = props.iface
    if (!iface) return []
    const list: PendingChange[] = []
    const ssid = form.ssid.trim()

    if (ssid !== iface.ssid) {
      list.push({
        option: 'ssid',
        label: 'SSID',
        from: iface.ssid || '（空）',
        to: ssid || '（空）'
      })
    }
    if (form.encryption !== iface.encryption) {
      list.push({
        option: 'encryption',
        label: '加密方式',
        from: encryptionText(iface.encryption),
        to: encryptionText(form.encryption)
      })
    }
    if (form.key) {
      list.push({
        option: 'key',
        label: '密码',
        from: iface.keySet ? '已设置' : '未设置',
        to: '已修改'
      })
    }
    if (form.mode !== iface.mode) {
      list.push({
        option: 'mode',
        label: '工作模式',
        from: modeText(iface.mode),
        to: modeText(form.mode)
      })
    }
    if (form.network !== iface.network) {
      list.push({
        option: 'network',
        label: '绑定网络',
        from: iface.network || '（无）',
        to: form.network || '（无）'
      })
    }
    if (form.hidden !== iface.hidden) {
      list.push({
        option: 'hidden',
        label: '隐藏网络',
        from: iface.hidden ? '是' : '否',
        to: form.hidden ? '是' : '否'
      })
    }
    if (form.guest !== iface.guest) {
      list.push({
        option: 'isolate',
        label: '访客网络',
        from: iface.guest ? '开启' : '关闭',
        to: form.guest ? '开启' : '关闭'
      })
    }
    if (form.macfilter !== iface.macfilter) {
      list.push({
        option: 'macfilter',
        label: 'MAC 过滤',
        from: macFilterText(iface.macfilter),
        to: macFilterText(form.macfilter)
      })
    }
    const maclist = form.maclist.trim()
    if (maclist !== iface.maclist.join(' ')) {
      list.push({
        option: 'maclist',
        label: 'MAC 列表',
        from: iface.maclist.length ? iface.maclist.join(' ') : '（空）',
        to: maclist || '（空）'
      })
    }

    return list
  })

  function reset(): void {
    const iface = props.iface
    form.ssid = iface?.ssid ?? ''
    form.encryption = iface?.encryption ?? 'none'
    form.key = ''
    form.mode = iface?.mode ?? 'ap'
    form.network = iface?.network ?? ''
    form.hidden = iface?.hidden ?? false
    form.guest = iface?.guest ?? false
    form.macfilter = iface?.macfilter ?? '0'
    form.maclist = (iface?.maclist ?? []).join(' ')
    errors.ssid = ''
    errors.key = ''
    errors.maclist = ''
  }

  watch(
    () => props.modelValue,
    (open) => {
      if (open) reset()
    },
    { immediate: true }
  )

  function validate(): boolean {
    errors.ssid = ''
    errors.key = ''
    errors.maclist = ''

    const ssid = form.ssid.trim()
    if (!ssid) {
      errors.ssid = '请输入 SSID 名称'
    } else if (ssid.length > 32) {
      errors.ssid = 'SSID 名称不能超过 32 个字符'
    }

    if (form.encryption !== 'none') {
      if (!form.key && !props.iface?.keySet) {
        errors.key = '请输入密码，或设置加密方式为开放网络'
      } else if (form.key && form.key.length < 8) {
        errors.key = '密码至少 8 位'
      } else if (form.key && form.key.length > 63) {
        errors.key = '密码最多 63 位'
      }
    }

    if (form.macfilter !== '0' && !form.maclist.trim()) {
      errors.maclist = '请填写 MAC 地址列表'
    }

    return !errors.ssid && !errors.key && !errors.maclist
  }

  async function save(): Promise<void> {
    const iface = props.iface
    if (!iface) return
    if (!validate()) return

    const values: Record<string, string> = {}
    const remove: string[] = []

    for (const change of changes.value) {
      switch (change.option) {
        case 'ssid':
          values.ssid = form.ssid.trim()
          break
        case 'encryption':
          values.encryption = form.encryption
          break
        case 'mode':
          values.mode = form.mode
          break
        case 'network':
          values.network = form.network
          break
        case 'hidden':
          values.hidden = form.hidden ? '1' : '0'
          break
        case 'macfilter':
          values.macfilter = form.macfilter
          break
        case 'key':
          if (form.key) values.key = form.key
          break
        case 'isolate':
          if (form.guest) values.isolate = '1'
          else remove.push('isolate')
          break
        case 'maclist':
          if (form.maclist.trim()) values.maclist = form.maclist.trim()
          break
        default:
          break
      }
    }

    // An open network must not keep a password, and a disabled filter must
    // not keep its address list.
    if (form.encryption === 'none' && iface.keySet) remove.push('key')
    if (form.macfilter === '0' && iface.maclist.length) remove.push('maclist')

    saving.value = true
    try {
      await applyWirelessConfig([{ section: iface.section, values, remove }])
      ElMessage.success('SSID 已保存并应用')
      emit('saved')
      emit('update:modelValue', false)
    } catch (err) {
      await discardWirelessChanges().catch(() => undefined)
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

  .switch-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 10px;
    margin-bottom: 14px;
  }

  .switch-field {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    padding: 10px 12px;
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
    .field-grid,
    .switch-grid {
      grid-template-columns: minmax(0, 1fr);
    }
  }
</style>
