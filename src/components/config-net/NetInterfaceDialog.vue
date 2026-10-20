<template>
  <el-dialog
    :model-value="modelValue"
    class="net-dialog"
    :width="dialogWidth"
    :title="dialogTitle"
    :close-on-click-modal="false"
    append-to-body
    @update:model-value="emit('update:modelValue', $event)"
  >
    <el-form label-position="top" class="net-form" @submit.prevent>
      <el-form-item v-if="creating" label="接口名称" required :error="errors.name">
        <el-input
          v-model="form.name"
          placeholder="例如 guest"
          :disabled="saving"
        />
        <p class="field-hint">UCI 段名，只能包含字母、数字和下划线。</p>
      </el-form-item>

      <el-form-item label="协议" required>
        <el-radio-group v-model="form.protocol" :disabled="saving">
          <el-radio-button v-for="option in protocolOptions" :key="option.value" :value="option.value">
            {{ option.label }}
          </el-radio-button>
        </el-radio-group>
      </el-form-item>

      <el-form-item label="设备" required :error="errors.device">
        <el-select
          v-model="form.device"
          class="field-full"
          filterable
          allow-create
          clearable
          :disabled="saving"
          placeholder="例如 br-lan"
        >
          <el-option v-for="item in deviceOptions" :key="item" :label="item" :value="item" />
        </el-select>
      </el-form-item>

      <template v-if="form.protocol === 'static'">
        <el-form-item label="IPv4 地址" required :error="errors.address">
          <el-input
            :model-value="form.address"
            :disabled="saving"
            placeholder="10.0.0.1/24"
            @update:model-value="onAddressInput"
          />
        </el-form-item>

        <el-form-item label="掩码 / 前缀" required :error="errors.mask">
          <el-select
            v-model="form.mask"
            class="field-full"
            filterable
            allow-create
            :disabled="saving"
            placeholder="24"
            @change="onMaskChange"
          >
            <el-option v-for="item in maskOptions" :key="item" :label="`/${item}`" :value="item" />
          </el-select>
          <p class="field-hint">填写 24 表示 /24，也可以直接填写 255.255.255.0。</p>
        </el-form-item>
      </template>

      <el-form-item label="网关" :error="errors.gateway">
        <el-input
          v-model="form.gateway"
          :disabled="saving"
          placeholder="10.0.0.1（可留空）"
        />
        <p class="field-hint">静态地址的默认网关；DHCP 客户端时作为自定义网关。</p>
      </el-form-item>

      <el-form-item label="DNS 服务器" :error="errors.dns">
        <el-select
          v-model="form.dns"
          class="field-full"
          multiple
          filterable
          allow-create
          default-first-option
          :disabled="saving"
          placeholder="输入后回车添加，例如 10.0.0.1"
        />
        <p class="field-hint">留空表示使用运营商分配的 DNS。</p>
      </el-form-item>

      <p class="advanced-title">高级选项</p>

      <div class="switch-grid">
        <div class="switch-field">
          <div class="switch-copy">
            <span class="switch-label">禁用该接口</span>
            <span class="switch-hint">接口不再启动，连接会中断</span>
          </div>
          <el-switch v-model="form.disabled" :disabled="saving" />
        </div>
        <div class="switch-field">
          <div class="switch-copy">
            <span class="switch-label">LAN 网段</span>
            <span class="switch-hint">写入 type 选项标记为局域网</span>
          </div>
          <el-switch v-model="form.isLan" :disabled="saving" />
        </div>
      </div>

      <el-form-item label="MTU" :error="errors.mtu">
        <el-input-number
          v-model="form.mtu"
          :min="68"
          :max="9000"
          :step="8"
          controls-position="right"
          :disabled="saving"
          placeholder="留空使用默认值"
        />
        <p class="field-hint">留空表示沿用设备的默认 MTU。</p>
      </el-form-item>
    </el-form>

    <div v-if="changes.length" class="change-box">
      <p class="change-title">{{ creating ? '将新建的接口' : '将生效的改动' }}</p>
      <ul class="change-list">
        <li v-for="change in changes" :key="change.option" :class="{ 'is-new': creating }">
          <span class="change-label">{{ change.label }}</span>
          <span class="change-from">{{ change.from }}</span>
          <span class="change-arrow">→</span>
          <span class="change-to">{{ change.to }}</span>
        </li>
      </ul>
      <p class="change-note">
        {{ creating
          ? '保存后会写入 /etc/config/network 并重载网络服务，连接可能短暂中断。'
          : '保存后会重载网络服务，连接可能短暂中断。' }}
      </p>
    </div>
    <p v-else class="change-empty">尚未修改任何内容。</p>

    <template #footer>
      <el-button :disabled="saving" @click="emit('update:modelValue', false)">取消</el-button>
      <el-button type="primary" :loading="saving" :disabled="!changes.length" @click="save">
        保存并应用
      </el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
  import { computed, reactive, watch } from 'vue'
  import { useMediaQuery } from '@/composables/useMediaQuery'
  import {
    formatCidr,
    isValidIpv4,
    maskToPrefix,
    prefixToMask,
    protocolText,
    splitCidr,
    type NetInterface,
    type NetInterfaceDraft
  } from '@/api/networkConfig'

  interface PendingChange {
    option: string
    label: string
    from: string
    to: string
  }

  const props = withDefaults(
    defineProps<{
      modelValue: boolean
      /** `null` creates a new interface. */
      iface: NetInterface | null
      devices: string[]
      /** Names of the existing interface sections (uniqueness check). */
      existingNames?: string[]
      saving?: boolean
    }>(),
    { existingNames: () => [] }
  )

  const emit = defineEmits<{
    'update:modelValue': [value: boolean]
    save: [draft: NetInterfaceDraft]
  }>()

  const creating = computed(() => props.iface === null)

  const form = reactive({
    name: '',
    protocol: 'static',
    device: '',
    address: '',
    mask: '24',
    gateway: '',
    dns: [] as string[],
    mtu: undefined as number | undefined,
    disabled: false,
    isLan: false
  })

  const errors = reactive({ name: '', device: '', address: '', mask: '', gateway: '', dns: '', mtu: '' })

  // The dialog is teleported to the body — a scoped rule cannot reach it, so
  // the mobile width is driven by the `width` property instead.
  const isMobile = useMediaQuery('(max-width: 640px)')
  const dialogWidth = computed(() => (isMobile.value ? '100%' : '620px'))

  const dialogTitle = computed(() =>
    props.iface ? `编辑接口 · ${props.iface.id}` : '新增接口'
  )

  const protocolOptions = computed(() => {
    const options = [
      { value: 'static', label: '静态地址' },
      { value: 'dhcp', label: 'DHCP 客户端' }
    ]
    if (form.protocol && !options.some((item) => item.value === form.protocol)) {
      options.push({ value: form.protocol, label: protocolText(form.protocol) })
    }
    return options
  })

  const deviceOptions = computed(() => {
    const names = new Set(props.devices)
    if (form.device) names.add(form.device)
    return [...names].sort((a, b) => a.localeCompare(b))
  })

  const maskOptions = [
    '32', '30', '29', '28', '27', '26', '25', '24', '23', '22', '21', '20', '19', '18', '17', '16',
    '15', '14', '13', '12', '11', '10', '9', '8'
  ]

  /** The prefix a mask field value stands for. */
  function maskValueToPrefix(value: string): number | null {
    const text = value.trim()
    if (/^\d{1,2}$/.test(text)) {
      const prefix = Number(text)
      return prefix >= 0 && prefix <= 32 ? prefix : null
    }
    return maskToPrefix(text)
  }

  function onAddressInput(value: string): void {
    form.address = value
    const { prefix } = splitCidr(value)
    if (prefix !== null) form.mask = String(prefix)
  }

  function onMaskChange(value: string): void {
    form.mask = value
    const prefix = maskValueToPrefix(value)
    if (prefix === null) return
    if (form.address.includes('/')) {
      const { address } = splitCidr(form.address)
      form.address = `${address}/${prefix}`
    }
  }

  function reset(): void {
    const iface = props.iface
    form.name = iface?.id ?? ''
    form.protocol = iface?.protocol ?? 'static'
    form.device = iface?.device ?? ''
    form.address = iface ? formatCidr(iface.address, iface.prefix) : ''
    form.mask = iface ? (iface.prefix !== null ? String(iface.prefix) : iface.netmask || '24') : '24'
    form.gateway = iface?.gateway ?? ''
    form.dns = [...(iface?.dns ?? [])]
    form.mtu = iface?.mtu ?? undefined
    form.disabled = iface?.disabled ?? false
    form.isLan = iface?.isLan ?? false

    errors.name = ''
    errors.device = ''
    errors.address = ''
    errors.mask = ''
    errors.gateway = ''
    errors.dns = ''
    errors.mtu = ''
  }

  watch(
    () => props.modelValue,
    (open) => {
      if (open) reset()
    },
    { immediate: true }
  )

  /** The prefix that will be written. */
  const effectivePrefix = computed(() => {
    const { prefix } = splitCidr(form.address)
    if (prefix !== null) return prefix
    return maskValueToPrefix(form.mask)
  })

  /**
   * The values a brand new interface will be written with. There is nothing
   * to diff against, so every field is listed with its new value.
   */
  function describeNewInterface(): PendingChange[] {
    const list: PendingChange[] = []
    const from = '（新建）'

    list.push({ option: 'proto', label: '协议', from, to: protocolText(form.protocol) })
    list.push({ option: 'device', label: '设备', from, to: form.device.trim() || '（无）' })

    if (form.protocol === 'static') {
      const { address } = splitCidr(form.address)
      list.push({
        option: 'ipaddr',
        label: 'IPv4 地址',
        from,
        to: formatCidr(address, effectivePrefix.value) || '（无）'
      })
    }

    list.push({ option: 'gateway', label: '网关', from, to: form.gateway.trim() || '（无）' })

    const dns = form.dns.map((item) => item.trim()).filter(Boolean)
    list.push({ option: 'dns', label: 'DNS', from, to: dns.join(' ') || '（无）' })

    list.push({
      option: 'mtu',
      label: 'MTU',
      from,
      to: form.mtu ? String(form.mtu) : '（默认）'
    })
    list.push({ option: 'disabled', label: '状态', from, to: form.disabled ? '禁用' : '启用' })
    list.push({ option: 'type', label: 'LAN 网段', from, to: form.isLan ? '是' : '否' })

    return list
  }

  /** Everything that differs from the stored configuration. */
  const changes = computed<PendingChange[]>(() => {
    const iface = props.iface
    if (!iface) return describeNewInterface()

    const list: PendingChange[] = []

    const protocolChanged = form.protocol !== (iface.protocol ?? 'static')
    if (protocolChanged) {
      list.push({
        option: 'proto',
        label: '协议',
        from: protocolText(iface.protocol),
        to: protocolText(form.protocol)
      })
    }

    if (form.device !== (iface.device ?? '')) {
      list.push({
        option: 'device',
        label: '设备',
        from: iface.device || '（无）',
        to: form.device || '（无）'
      })
    }

    if (form.protocol === 'static') {
      const { address } = splitCidr(form.address)
      const nextAddress = address
      const currentAddress = iface.address ?? ''
      if (nextAddress !== currentAddress || effectivePrefix.value !== (iface.prefix ?? null)) {
        list.push({
          option: 'ipaddr',
          label: 'IPv4 地址',
          from: iface.address ? formatCidr(iface.address, iface.prefix) : '（无）',
          to: formatCidr(nextAddress, effectivePrefix.value)
        })
      }
    } else if ((iface.protocol ?? '') === 'static') {
      // Switching to DHCP drops the static address.
      list.push({
        option: 'ipaddr',
        label: 'IPv4 地址',
        from: iface.address ? formatCidr(iface.address, iface.prefix) : '（无）',
        to: '（由 DHCP 分配）'
      })
    }

    if (form.gateway.trim() !== (iface.gateway ?? '')) {
      list.push({
        option: 'gateway',
        label: '网关',
        from: iface.gateway || '（无）',
        to: form.gateway.trim() || '（无）'
      })
    }

    const dns = form.dns.map((item) => item.trim()).filter(Boolean)
    const currentDns = (iface.dns ?? []).join(' ')
    if (dns.join(' ') !== currentDns) {
      list.push({
        option: 'dns',
        label: 'DNS',
        from: currentDns || '（无）',
        to: dns.join(' ') || '（无）'
      })
    }

    const mtu = form.mtu ?? null
    if (mtu !== (iface.mtu ?? null)) {
      list.push({
        option: 'mtu',
        label: 'MTU',
        from: iface.mtu ? String(iface.mtu) : '（默认）',
        to: mtu ? String(mtu) : '（默认）'
      })
    }

    if (form.disabled !== (iface.disabled ?? false)) {
      list.push({
        option: 'disabled',
        label: '状态',
        from: iface.disabled ? '禁用' : '启用',
        to: form.disabled ? '禁用' : '启用'
      })
    }

    if (form.isLan !== (iface.isLan ?? false)) {
      list.push({
        option: 'type',
        label: 'LAN 网段',
        from: iface.isLan ? '是' : '否',
        to: form.isLan ? '是' : '否'
      })
    }

    return list
  })

  function validate(): boolean {
    errors.name = ''
    errors.device = ''
    errors.address = ''
    errors.mask = ''
    errors.gateway = ''
    errors.dns = ''
    errors.mtu = ''

    if (creating.value) {
      const name = form.name.trim()
      if (!/^[A-Za-z0-9_]+$/.test(name)) {
        errors.name = '请输入合法的接口名称（字母、数字或下划线）'
      } else if (props.existingNames.includes(name)) {
        errors.name = `接口名称 ${name} 已存在，请换一个`
      }
    }

    if (!form.device.trim()) {
      errors.device = '请选择设备'
    }

    if (form.protocol === 'static') {
      const { address } = splitCidr(form.address)
      if (!address) {
        errors.address = '请输入 IPv4 地址'
      } else if (!isValidIpv4(address)) {
        errors.address = 'IPv4 地址格式不正确'
      }

      const prefix = maskValueToPrefix(form.mask)
      if (prefix === null) {
        errors.mask = '请输入 0–32 的前缀或正确的子网掩码'
      }
    }

    if (form.gateway.trim() && !isValidIpv4(form.gateway.trim())) {
      errors.gateway = '网关必须是合法的 IPv4 地址'
    }

    for (const item of form.dns) {
      const value = item.trim()
      if (!value) continue
      if (!isValidIpv4(value) && !value.includes(':')) {
        errors.dns = `DNS 地址不正确：${value}`
        break
      }
    }

    if (form.mtu !== undefined && (form.mtu < 68 || form.mtu > 9000)) {
      errors.mtu = 'MTU 需要在 68 – 9000 之间'
    }

    return !errors.name && !errors.device && !errors.address && !errors.mask && !errors.gateway && !errors.dns && !errors.mtu
  }

  function save(): void {
    if (!validate()) return

    const iface = props.iface
    const { address, prefix } = splitCidr(form.address)
    const effective = prefix ?? effectivePrefix.value

    const draft: NetInterfaceDraft = {
      id: iface?.id,
      name: creating.value ? form.name.trim() : undefined,
      protocol: form.protocol,
      device: form.device.trim(),
      address: form.protocol === 'static' ? address : '',
      prefix: effective,
      netmask: effective !== null ? prefixToMask(effective) : '',
      gateway: form.gateway.trim(),
      dns: form.dns.map((item) => item.trim()).filter(Boolean),
      mtu: form.mtu ?? null,
      disabled: form.disabled,
      isLan: form.isLan,
      usesCidr: iface?.usesCidr ?? form.address.includes('/'),
      extraAddresses: (iface?.addresses ?? []).slice(1),
      originalIsLan: iface?.isLan ?? false,
      originalType: iface?.type ?? '',
      originalDisabled: iface?.disabled ?? false
    }

    emit('save', draft)
  }
</script>

<style scoped>
  .net-form :deep(.el-form-item) {
    margin-bottom: 14px;
  }

  .net-form :deep(.el-form-item__label) {
    padding-bottom: 4px;
    color: var(--text-secondary);
    font-size: 13px;
    font-weight: 500;
    line-height: 1.4;
  }

  .field-full {
    width: 100%;
  }

  .field-hint {
    width: 100%;
    margin-top: 4px;
    color: var(--text-muted);
    font-size: 11.5px;
    line-height: 1.5;
  }

  .advanced-title {
    margin: 18px 0 10px;
    color: var(--text-muted);
    font-size: 12px;
    font-weight: 500;
    letter-spacing: 0.02em;
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

  /* A brand new interface has nothing to compare against — the "from" column
     only says that the section does not exist yet. */
  .change-list li.is-new .change-from {
    text-decoration: none;
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
    .switch-grid {
      grid-template-columns: minmax(0, 1fr);
    }
  }
</style>
