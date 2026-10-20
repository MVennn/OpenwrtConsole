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
      <el-form-item label="目标网络" required :error="errors.target">
        <el-input
          v-model="form.target"
          :disabled="saving"
          placeholder="192.168.10.0/24，默认路由填 0.0.0.0/0"
        />
        <p class="field-hint">支持 CIDR；只填网段地址时按所选接口的掩码补全。</p>
      </el-form-item>

      <el-form-item label="网关" required :error="errors.gateway">
        <el-input v-model="form.gateway" :disabled="saving" placeholder="192.168.1.1" />
        <p v-if="gatewayConflict" class="field-warn">{{ gatewayConflict }}</p>
      </el-form-item>

      <el-form-item label="接口" required :error="errors.iface">
        <el-select
          v-model="form.iface"
          class="field-full"
          filterable
          :disabled="saving"
          placeholder="选择出口接口"
        >
          <el-option v-for="item in interfaceOptions" :key="item.value" :label="item.label" :value="item.value" />
        </el-select>
      </el-form-item>

      <el-form-item label="跃点（Metric）" :error="errors.metric">
        <el-input-number
          v-model="form.metric"
          :min="0"
          :max="65535"
          :step="1"
          controls-position="right"
          :disabled="saving"
          placeholder="留空使用默认值"
        />
        <p class="field-hint">数值越小优先级越高，多条默认路由时用它决定顺序。</p>
      </el-form-item>
    </el-form>

    <div v-if="changes.length" class="change-box">
      <p class="change-title">{{ creating ? '将新增的路由' : '将生效的改动' }}</p>
      <ul class="change-list">
        <li v-for="change in changes" :key="change.option" :class="{ 'is-new': creating }">
          <span class="change-label">{{ change.label }}</span>
          <span class="change-from">{{ change.from }}</span>
          <span class="change-arrow">→</span>
          <span class="change-to">{{ change.to }}</span>
        </li>
      </ul>
      <p class="change-note">点击页面的「保存并应用」后写入 /etc/config/network。</p>
    </div>
    <p v-else class="change-empty">尚未修改任何内容。</p>

    <template #footer>
      <el-button :disabled="saving" @click="emit('update:modelValue', false)">取消</el-button>
      <el-button type="primary" :loading="saving" :disabled="!changes.length" @click="save">
        保存
      </el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
  import { computed, reactive, watch } from 'vue'
  import { useMediaQuery } from '@/composables/useMediaQuery'
  import {
    isValidIpv4,
    maskToPrefix,
    prefixToMask,
    splitCidr,
    type NetInterface,
    type NetRoute,
    type NetRouteDraft
  } from '@/api/networkConfig'

  interface PendingChange {
    option: string
    label: string
    from: string
    to: string
  }

  const props = defineProps<{
    modelValue: boolean
    /** `null` creates a new route. */
    route: NetRoute | null
    interfaces: NetInterface[]
    saving?: boolean
  }>()

  const emit = defineEmits<{
    'update:modelValue': [value: boolean]
    save: [draft: NetRouteDraft]
  }>()

  const form = reactive({
    target: '',
    gateway: '',
    iface: '',
    metric: undefined as number | undefined
  })

  const errors = reactive({ target: '', gateway: '', iface: '', metric: '' })

  const creating = computed(() => props.route === null)

  const isMobile = useMediaQuery('(max-width: 640px)')
  const dialogWidth = computed(() => (isMobile.value ? '100%' : '520px'))

  const dialogTitle = computed(() => (props.route ? `编辑静态路由 · ${props.route.id}` : '新增静态路由'))

  const interfaceOptions = computed(() =>
    props.interfaces.map((iface) => ({
      value: iface.id,
      label: iface.id + (iface.address ? `（${iface.address}）` : '')
    }))
  )

  /** The interface the route is bound to. */
  const boundInterface = computed(() =>
    props.interfaces.find((item) => item.id === form.iface)
  )

  const gatewayConflict = computed(() => {
    const iface = boundInterface.value
    if (!iface?.gateway) return ''
    return `接口 ${iface.id} 已经配置了网关 ${iface.gateway}，两条默认路由可能互相冲突。`
  })

  /** The netmask that will be written for the target. */
  const targetNetmask = computed(() => {
    const { prefix } = splitCidr(form.target)
    if (prefix !== null) return prefixToMask(prefix)
    const iface = boundInterface.value
    if (iface?.prefix !== null && iface?.prefix !== undefined) return prefixToMask(iface.prefix)
    return '255.255.255.0'
  })

  function reset(): void {
    const route = props.route
    const target = route?.target ?? ''
    if (!target) {
      form.target = ''
    } else if (route?.isDefault) {
      form.target = '0.0.0.0/0'
    } else {
      const prefix = route?.netmask ? maskToPrefix(route.netmask) : null
      form.target = prefix !== null ? `${target}/${prefix}` : target
    }
    form.gateway = route?.gateway ?? ''
    form.iface = route?.iface ?? props.interfaces[0]?.id ?? ''
    form.metric = route?.metric ?? undefined

    errors.target = ''
    errors.gateway = ''
    errors.iface = ''
    errors.metric = ''
  }

  watch(
    () => props.modelValue,
    (open) => {
      if (open) reset()
    },
    { immediate: true }
  )

  /**
   * The values a brand new route will be written with. There is nothing to
   * diff against, so every field is listed with its new value.
   */
  function describeNewRoute(): PendingChange[] {
    const list: PendingChange[] = []
    const from = '（新建）'
    const { address, prefix } = splitCidr(form.target.trim())

    list.push({
      option: 'target',
      label: '目标网络',
      from,
      to: prefix !== null ? `${address}/${prefix}` : address || '（无）'
    })
    list.push({ option: 'netmask', label: '子网掩码', from, to: targetNetmask.value })
    list.push({ option: 'gateway', label: '网关', from, to: form.gateway.trim() || '（无）' })
    list.push({ option: 'interface', label: '接口', from, to: form.iface || '（无）' })
    list.push({
      option: 'metric',
      label: '跃点',
      from,
      to: form.metric ? String(form.metric) : '（默认）'
    })

    return list
  }

  const changes = computed<PendingChange[]>(() => {
    const route = props.route
    if (!route) return describeNewRoute()

    const list: PendingChange[] = []

    const target = form.target.trim()
    const netmask = targetNetmask.value
    const { address, prefix } = splitCidr(target)
    // The stored target is a plain address, the field holds a CIDR — compare
    // the address part so an untouched default route shows no change.
    if (address !== (route.target ?? '')) {
      list.push({
        option: 'target',
        label: '目标网络',
        from: route.target || '（无）',
        to: prefix !== null ? `${address}/${prefix}` : address || '（无）'
      })
    }
    if (netmask !== (route.netmask ?? '')) {
      list.push({
        option: 'netmask',
        label: '子网掩码',
        from: route.netmask || '（无）',
        to: netmask
      })
    }
    if (form.gateway.trim() !== (route.gateway ?? '')) {
      list.push({
        option: 'gateway',
        label: '网关',
        from: route.gateway || '（无）',
        to: form.gateway.trim() || '（无）'
      })
    }
    if (form.iface !== (route.iface ?? '')) {
      list.push({
        option: 'interface',
        label: '接口',
        from: route.iface || '（无）',
        to: form.iface || '（无）'
      })
    }
    const metric = form.metric ?? null
    if (metric !== (route.metric ?? null)) {
      list.push({
        option: 'metric',
        label: '跃点',
        from: route.metric ? String(route.metric) : '（默认）',
        to: metric ? String(metric) : '（默认）'
      })
    }

    return list
  })

  function validate(): boolean {
    errors.target = ''
    errors.gateway = ''
    errors.iface = ''
    errors.metric = ''

    const target = form.target.trim()
    if (!target) {
      errors.target = '请输入目标网络'
    } else {
      const { address, prefix } = splitCidr(target)
      if (!isValidIpv4(address)) {
        errors.target = '目标网络必须是合法的 IPv4 网段'
      } else if (prefix === null && target.includes('/')) {
        errors.target = '前缀长度不合法'
      }
    }

    if (!form.gateway.trim()) {
      errors.gateway = '请输入网关'
    } else if (!isValidIpv4(form.gateway.trim())) {
      errors.gateway = '网关必须是合法的 IPv4 地址'
    }

    if (!form.iface) {
      errors.iface = '请选择出口接口'
    }

    if (form.metric !== undefined && (form.metric < 0 || form.metric > 65535)) {
      errors.metric = '跃点需要在 0 – 65535 之间'
    }

    return !errors.target && !errors.gateway && !errors.iface && !errors.metric
  }

  function save(): void {
    if (!validate()) return

    const { address, prefix } = splitCidr(form.target.trim())
    const netmask = prefix !== null ? prefixToMask(prefix) : targetNetmask.value

    emit('save', {
      id: props.route?.id,
      target: address,
      netmask,
      gateway: form.gateway.trim(),
      iface: form.iface,
      metric: form.metric ?? null
    })
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

  .field-warn {
    width: 100%;
    margin-top: 4px;
    color: var(--warning-text);
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

  /* A brand new route has nothing to compare against — the "from" column only
     says that the section does not exist yet. */
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
</style>
