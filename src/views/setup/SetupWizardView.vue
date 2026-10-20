<template>
  <div class="setup-page">
    <header class="setup-bar">
      <div class="setup-brand">
        <span class="setup-mark">
          <RouterIcon :size="18" :stroke-width="2" />
        </span>
        <div class="setup-brand-text">
          <strong>OpenWrt Console</strong>
          <span>首次配置向导</span>
        </div>
      </div>

      <div class="setup-bar-actions">
        <span v-if="boardModel" class="setup-model truncate">{{ boardModel }}</span>
        <el-button text :icon="RotateCcw" :disabled="applying" @click="restart">
          重新运行向导
        </el-button>
      </div>
    </header>

    <main class="setup-main">
      <SetupStatusSummary :status="status" @skip="skipWizard" />

      <el-alert
        v-if="loadError"
        type="error"
        :title="loadError"
        description="请确认控制台仍然可以访问路由器，然后点击右上角的「重新运行向导」重试。"
        show-icon
        :closable="false"
      />

      <section class="setup-card">
        <template v-if="!finished">
          <el-steps
            class="setup-steps"
            :active="step"
            :direction="stepDirection"
            finish-status="success"
            align-center
          >
            <el-step title="管理密码" description="root 密码" />
            <el-step title="时区与主机名" description="设备身份" />
            <el-step title="无线网络" description="SSID 与密码" />
            <el-step title="上网方式" description="WAN 接入" />
          </el-steps>

          <div class="step-body">
            <el-skeleton v-if="loading" :rows="4" animated />

            <!-- 步骤 1：管理密码 -->
            <section v-else-if="step === 0" class="step">
              <h2 class="step-title">设置管理密码</h2>
              <p class="step-desc">
                出厂密码通常印在路由器底部的标签上。改成自己的密码，可以避免别人拿到设备后直接接管。
                留空表示不修改当前密码。
              </p>

              <div class="field-grid">
                <SetupField
                  label="新密码"
                  for="setup-password"
                  :error="passwordError"
                  hint="至少 8 位，建议混合大小写字母、数字与符号"
                >
                  <el-input
                    id="setup-password"
                    v-model="password"
                    type="password"
                    show-password
                    autocomplete="new-password"
                    placeholder="留空表示不修改"
                  />
                </SetupField>

                <SetupField
                  label="确认密码"
                  for="setup-password-confirm"
                  :error="passwordConfirmError"
                >
                  <el-input
                    id="setup-password-confirm"
                    v-model="passwordConfirm"
                    type="password"
                    show-password
                    autocomplete="new-password"
                    placeholder="再次输入新密码"
                  />
                </SetupField>
              </div>

              <SetupPasswordStrength :password="password" />
            </section>

            <!-- 步骤 2：时区与主机名 -->
            <section v-else-if="step === 1" class="step">
              <h2 class="step-title">时区与主机名</h2>
              <p class="step-desc">
                主机名是局域网内其他设备看到的名字，时区决定系统时间与日志时间戳。
              </p>

              <div class="field-grid">
                <SetupField
                  label="主机名"
                  required
                  for="setup-hostname"
                  :error="hostnameError"
                  hint="字母、数字、点、短横线或下划线，以字母或数字开头"
                >
                  <el-input
                    id="setup-hostname"
                    v-model="hostname"
                    maxlength="63"
                    placeholder="OpenWrt"
                    @change="onIdentityChange"
                  />
                </SetupField>

                <SetupField
                  label="时区"
                  for="setup-timezone"
                  hint="影响系统时间、日志时间戳与定时任务"
                >
                  <el-select
                    id="setup-timezone"
                    v-model="zone"
                    filterable
                    class="full"
                    placeholder="选择时区"
                    @change="onIdentityChange"
                  >
                    <el-option
                      v-for="item in timezones"
                      :key="item.zone"
                      :label="item.zone"
                      :value="item.zone"
                    />
                  </el-select>
                </SetupField>
              </div>
            </section>

            <!-- 步骤 3：无线 -->
            <section v-else-if="step === 2" class="step">
              <h2 class="step-title">无线网络</h2>
              <p class="step-desc">
                为每个频段设置名称与密码。写入后无线服务会重载，已连接的设备需要重新连接。
              </p>

              <p v-if="!wifiDrafts.length" class="step-empty">
                没有检测到无线硬件，这台设备不支持 Wi-Fi，可以跳过这一步。
              </p>

              <article v-for="(draft, index) in wifiDrafts" :key="draft.radio" class="radio-card">
                <header class="radio-head">
                  <div class="radio-title">
                    <Radio :size="16" />
                    <strong>{{ bandLabel(draft.radio) }}</strong>
                    <span v-if="channelOf(draft.radio)" class="radio-meta mono">
                      {{ channelOf(draft.radio) }}
                    </span>
                  </div>
                  <el-switch v-model="draft.enabled" @change="onWifiChange" />
                </header>

                <div class="field-grid">
                  <SetupField
                    label="网络名称 (SSID)"
                    required
                    :for="`setup-ssid-${index}`"
                    :error="wifiErrors[index]?.ssid"
                  >
                    <el-input
                      :id="`setup-ssid-${index}`"
                      v-model="draft.ssid"
                      maxlength="32"
                      :disabled="!draft.enabled"
                      @change="onWifiChange"
                    />
                  </SetupField>

                  <SetupField label="加密方式" :for="`setup-enc-${index}`">
                    <el-select
                      :id="`setup-enc-${index}`"
                      v-model="draft.encryption"
                      class="full"
                      :disabled="!draft.enabled"
                      @change="onWifiChange"
                    >
                      <el-option
                        v-for="option in SETUP_ENCRYPTION_OPTIONS"
                        :key="option.value"
                        :label="option.label"
                        :value="option.value"
                      />
                    </el-select>
                  </SetupField>

                  <SetupField
                    v-if="draft.encryption !== 'none'"
                    class="span-2"
                    label="无线密码"
                    :for="`setup-key-${index}`"
                    :error="wifiErrors[index]?.key"
                    :hint="keyHint(draft)"
                  >
                    <el-input
                      :id="`setup-key-${index}`"
                      v-model="draft.key"
                      type="password"
                      show-password
                      autocomplete="new-password"
                      :disabled="!draft.enabled"
                      :placeholder="keyPlaceholder(draft)"
                      @change="onWifiChange"
                    />
                  </SetupField>
                </div>
              </article>
            </section>

            <!-- 步骤 4：上网方式 -->
            <section v-else class="step">
              <h2 class="step-title">选择上网方式</h2>
              <p class="step-desc">WAN 接口决定路由器如何连接上互联网。</p>

              <el-radio-group v-model="wanDraft.protocol" class="proto-group" @change="onWanChange">
                <el-radio value="dhcp">DHCP 客户端（自动获取地址）</el-radio>
                <el-radio value="static">静态 IP（手动填写地址）</el-radio>
              </el-radio-group>

              <div class="field-grid">
                <SetupField
                  v-if="!wanDraft.section"
                  label="WAN 设备"
                  required
                  for="setup-wan-device"
                  :error="wanErrors.device"
                  hint="选择连接运营商/上级路由器的网口"
                >
                  <el-select
                    id="setup-wan-device"
                    v-model="wanDraft.device"
                    filterable
                    class="full"
                    placeholder="选择 WAN 网口"
                    @change="onWanChange"
                  >
                    <el-option
                      v-for="device in wanDevices"
                      :key="device"
                      :label="device"
                      :value="device"
                    />
                  </el-select>
                </SetupField>

                <SetupField v-else label="WAN 设备" hint="已存在的 WAN 接口">
                  <el-input :model-value="wanDraft.device" readonly />
                </SetupField>

                <template v-if="wanDraft.protocol === 'static'">
                  <SetupField
                    label="WAN IP 地址"
                    required
                    for="setup-wan-ip"
                    :error="wanErrors.ipaddr"
                  >
                    <el-input
                      id="setup-wan-ip"
                      v-model="wanDraft.ipaddr"
                      placeholder="例如 192.168.1.10"
                      @change="onWanChange"
                    />
                  </SetupField>

                  <SetupField label="子网掩码" required for="setup-wan-mask" :error="wanErrors.netmask">
                    <el-select
                      id="setup-wan-mask"
                      v-model="wanDraft.netmask"
                      class="full"
                      @change="onWanChange"
                    >
                      <el-option
                        v-for="mask in SETUP_NETMASK_OPTIONS"
                        :key="mask.value"
                        :label="mask.label"
                        :value="mask.value"
                      />
                    </el-select>
                  </SetupField>

                  <SetupField label="网关" required for="setup-wan-gw" :error="wanErrors.gateway">
                    <el-input
                      id="setup-wan-gw"
                      v-model="wanDraft.gateway"
                      placeholder="例如 192.168.1.1"
                      @change="onWanChange"
                    />
                  </SetupField>

                  <SetupField
                    label="DNS 服务器"
                    for="setup-wan-dns"
                    :error="wanErrors.dns"
                    hint="多个地址之间用空格分隔，留空则使用运营商分配的 DNS"
                  >
                    <el-input
                      id="setup-wan-dns"
                      v-model="wanDnsText"
                      placeholder="223.5.5.5 119.29.29.29"
                      @change="onWanChange"
                    />
                  </SetupField>
                </template>
              </div>
            </section>
          </div>

          <div v-if="changes.length" class="pending">
            <header class="pending-head">
              <span class="pending-title">
                <ListChecks :size="14" />
                待生效的改动（{{ changes.length }}）
              </span>
              <el-button
                size="small"
                type="danger"
                plain
                :disabled="applying"
                @click="discard"
              >
                放弃已暂存的改动
              </el-button>
            </header>
            <ul class="pending-list">
              <li v-for="(change, index) in changes" :key="`${change.label}-${index}`" class="pending-item">
                <span class="pending-label">{{ change.label }}</span>
                <span class="pending-before mono-value truncate">{{ change.before }}</span>
                <ArrowRight :size="12" class="pending-arrow" />
                <span class="pending-after mono-value truncate">{{ change.after }}</span>
              </li>
            </ul>
          </div>

          <footer class="step-actions">
            <el-button :disabled="step === 0 || applying || loading" @click="prev">
              上一步
            </el-button>
            <el-button type="primary" :loading="applying" :disabled="loading" @click="next">
              {{ step === 3 ? '完成设置' : '下一步' }}
            </el-button>
          </footer>
        </template>

        <!-- 完成 -->
        <div v-else class="done">
          <span class="done-icon">
            <CheckCircle2 :size="26" />
          </span>
          <h2 class="done-title">设置已写入路由器</h2>
          <p class="done-desc">
            无线与网络服务已经重载，无线设备需要重新连接。如果浏览器还在使用旧配置，
            刷新一次页面即可看到最新的状态。
          </p>

          <ul v-if="applied.length" class="done-list">
            <li v-for="(item, index) in applied" :key="index">
              <Check :size="13" />
              {{ item }}
            </li>
          </ul>

          <el-alert
            v-for="(warning, index) in applyWarnings"
            :key="index"
            type="warning"
            :title="warning"
            :closable="false"
            show-icon
            class="done-warning"
          />

          <div class="done-actions">
            <el-button @click="restart">重新运行向导</el-button>
            <el-button type="primary" @click="skipWizard">进入控制台</el-button>
          </div>
        </div>
      </section>
    </main>
  </div>
</template>

<script setup lang="ts">
  import { computed, onMounted, ref } from 'vue'
  import { useRouter } from 'vue-router'
  import { ElMessage, ElMessageBox } from 'element-plus'
  import {
    ArrowRight,
    Check,
    CheckCircle2,
    ListChecks,
    Radio,
    RotateCcw,
    Router as RouterIcon
  } from 'lucide-vue-next'
  import SetupField from '@/components/setup/SetupField.vue'
  import SetupPasswordStrength from '@/components/setup/SetupPasswordStrength.vue'
  import SetupStatusSummary from '@/components/setup/SetupStatusSummary.vue'
  import { useMediaQuery } from '@/composables/useMediaQuery'
  import { api } from '@/api/openwrt'
  import {
    applySetupChanges,
    diffSetupIdentity,
    diffSetupWan,
    diffSetupWireless,
    discardSetupChanges,
    isValidSetupHostname,
    isValidSetupIpv4,
    readSetupIdentity,
    readSetupStatus,
    readSetupTimezones,
    readSetupWan,
    readSetupWireless,
    restoreSetupBaseline,
    SETUP_ENCRYPTION_OPTIONS,
    SETUP_NETMASK_OPTIONS,
    stageSetupIdentity,
    stageSetupWan,
    stageSetupWireless,
    type SetupApplyPlan,
    type SetupBaseline,
    type SetupChange,
    type SetupIdentity,
    type SetupStatus,
    type SetupTimezone,
    type SetupWifiDraft,
    type SetupWanDraft
  } from '@/api/setup'

  defineOptions({ name: 'SetupWizardView' })

  const router = useRouter()
  const isMobile = useMediaQuery('(max-width: 640px)')

  const status = ref<SetupStatus | null>(null)
  const baseline = ref<SetupBaseline | null>(null)
  const boardModel = ref('')
  const loadError = ref('')
  const loading = ref(true)
  const applying = ref(false)
  const finished = ref(false)

  const step = ref(0)
  const applied = ref<string[]>([])
  const applyWarnings = ref<string[]>([])

  // 步骤 1
  const password = ref('')
  const passwordConfirm = ref('')
  const passwordError = ref('')
  const passwordConfirmError = ref('')

  // 步骤 2
  const hostname = ref('')
  const zone = ref('')
  const timezones = ref<SetupTimezone[]>([])
  const hostnameError = ref('')

  // 步骤 3
  const wifiDrafts = ref<SetupWifiDraft[]>([])
  const wifiErrors = ref<Record<number, { ssid: string; key: string }>>({})

  // 步骤 4
  const wanDraft = ref<SetupWanDraft>({
    section: '',
    device: '',
    protocol: 'dhcp',
    ipaddr: '',
    netmask: '255.255.255.0',
    gateway: '',
    dns: []
  })
  const wanErrors = ref<Record<string, string>>({})
  const wanDevices = ref<string[]>([])

  const stepDirection = computed<'horizontal' | 'vertical'>(() =>
    isMobile.value ? 'vertical' : 'horizontal'
  )

  const wanDnsText = computed({
    get: () => wanDraft.value.dns.join(' '),
    set: (value: string) => {
      wanDraft.value.dns = value
        .split(/[\s,]+/)
        .map((item) => item.trim())
        .filter(Boolean)
    }
  })

  /** The radios of the router — the source of the band labels. */
  const radios = computed(() => baseline.value?.wireless.radios ?? [])

  /** Everything that is going to be written to the router. */
  const changes = computed<SetupChange[]>(() => {
    const base = baseline.value
    if (!base) return []

    const list: SetupChange[] = []
    if (password.value) {
      list.push({ label: '管理员密码', before: '（当前密码）', after: '（新密码）' })
    }
    list.push(
      ...diffSetupIdentity(base.identity, {
        hostname: hostname.value.trim(),
        zone: zone.value
      })
    )
    list.push(...diffSetupWireless(base.wireless, wifiDrafts.value))
    list.push(...diffSetupWan(base.wan, wanDraft.value))
    return list
  })

  /** Which config files the apply step has to touch. */
  const applyPlan = computed<SetupApplyPlan>(() => {
    const base = baseline.value
    if (!base) return { system: false, wireless: false, network: false }

    return {
      system:
        diffSetupIdentity(base.identity, {
          hostname: hostname.value.trim(),
          zone: zone.value
        }).length > 0,
      wireless: diffSetupWireless(base.wireless, wifiDrafts.value).length > 0,
      network: diffSetupWan(base.wan, wanDraft.value).length > 0
    }
  })

  /* ------------------------------------------------------------------ *
   * Helpers
   * ------------------------------------------------------------------ */

  function defaultSsid(band: string, current: string): string {
    const base = current.trim() || 'OpenWrt'
    if (band === '5g') return `${base}-5G`
    if (band === '6g') return `${base}-6G`
    return base
  }

  function bandLabel(radio: string): string {
    return radios.value.find((item) => item.section === radio)?.bandLabel ?? '无线'
  }

  function channelOf(radio: string): string {
    const channel = radios.value.find((item) => item.section === radio)?.channel
    return channel ? `信道 ${channel}` : ''
  }

  function keySetOf(radio: string): boolean {
    return radios.value.find((item) => item.section === radio)?.keySet ?? false
  }

  function keyPlaceholder(draft: SetupWifiDraft): string {
    return keySetOf(draft.radio) ? '留空表示不修改当前密码' : '至少 8 位'
  }

  function keyHint(draft: SetupWifiDraft): string {
    return keySetOf(draft.radio)
      ? '路由器上的密码不会被读取，留空表示保持不变'
      : '至少 8 位，建议混合大小写字母、数字与符号'
  }

  function errorText(err: unknown): string {
    return err instanceof Error ? err.message : '未知错误'
  }

  /**
   * The zone the router currently uses. `zonename` holds the IANA name, but
   * older configurations only carry the POSIX string — the zone with the same
   * POSIX string is used then.
   */
  function resolveZone(identity: SetupIdentity, zones: SetupTimezone[]): string {
    if (identity.zonename && zones.some((item) => item.zone === identity.zonename)) {
      return identity.zonename
    }
    const match = zones.find((item) => item.tzstring === identity.timezone)
    return match?.zone || identity.zonename || ''
  }

  /** The POSIX string of the selected zone. */
  function zoneTzstring(name: string): string {
    return timezones.value.find((item) => item.zone === name)?.tzstring || ''
  }

  /* ------------------------------------------------------------------ *
   * Loading
   * ------------------------------------------------------------------ */

  async function load(): Promise<void> {
    loading.value = true
    loadError.value = ''
    try {
      const [statusData, identity, wireless, wan, zones] = await Promise.all([
        readSetupStatus(),
        readSetupIdentity(),
        readSetupWireless(),
        readSetupWan(),
        readSetupTimezones()
      ])

      status.value = statusData
      baseline.value = { identity, wireless, wan }
      timezones.value = zones
      wanDevices.value = wan.devices

      hostname.value = identity.hostname
      zone.value = resolveZone(identity, zones)

      wifiDrafts.value = wireless.radios.map((radio) => ({
        radio: radio.section,
        iface: radio.iface,
        ssid: radio.ssid || defaultSsid(radio.band, identity.hostname),
        encryption: radio.encryption || 'psk2',
        key: '',
        enabled: !radio.disabled && !radio.ifaceDisabled
      }))

      wanDraft.value = {
        section: wan.section,
        device: wan.device || wan.devices.find((item) => item === 'wan') || wan.devices[0] || '',
        protocol: wan.protocol,
        ipaddr: wan.ipaddr,
        netmask: wan.netmask || '255.255.255.0',
        gateway: wan.gateway,
        dns: [...wan.dns]
      }
    } catch (err) {
      loadError.value = errorText(err)
    } finally {
      loading.value = false
    }
  }

  async function refreshStatus(): Promise<void> {
    try {
      status.value = await readSetupStatus()
    } catch {
      // The summary keeps its old value — not worth an error dialog.
    }
  }

  /* ------------------------------------------------------------------ *
   * Staging
   * ------------------------------------------------------------------ */

  async function stageStep(index: number): Promise<void> {
    if (index === 1) {
      await stageSetupIdentity({
        section: baseline.value?.identity.section,
        hostname: hostname.value.trim(),
        zone: zone.value,
        tzstring: zoneTzstring(zone.value)
      })
      return
    }
    if (index === 2) {
      await stageSetupWireless(wifiDrafts.value)
      return
    }
    if (index === 3) {
      await stageSetupWan(wanDraft.value)
    }
  }

  async function safeStage(index: number): Promise<void> {
    try {
      await stageStep(index)
    } catch (err) {
      ElMessage.error(`暂存失败：${errorText(err)}`)
    }
  }

  function onIdentityChange(): void {
    void safeStage(1)
  }

  function onWifiChange(): void {
    void safeStage(2)
  }

  function onWanChange(): void {
    void safeStage(3)
  }

  /* ------------------------------------------------------------------ *
   * Validation
   * ------------------------------------------------------------------ */

  function validateStep(index: number): string {
    if (index === 0) {
      passwordError.value = ''
      passwordConfirmError.value = ''
      if (!password.value) {
        passwordConfirm.value = ''
        return ''
      }
      if (password.value.length < 8) {
        passwordError.value = '密码至少 8 位'
        return passwordError.value
      }
      if (password.value !== passwordConfirm.value) {
        passwordConfirmError.value = '两次输入的密码不一致'
        return passwordConfirmError.value
      }
      return ''
    }

    if (index === 1) {
      hostnameError.value = ''
      const name = hostname.value.trim()
      if (!name) {
        hostnameError.value = '请填写主机名'
        return hostnameError.value
      }
      if (!isValidSetupHostname(name)) {
        hostnameError.value = '主机名只能包含字母、数字、点、短横线和下划线，且需以字母或数字开头'
        return hostnameError.value
      }
      return ''
    }

    if (index === 2) {
      wifiErrors.value = {}
      for (const [radioIndex, draft] of wifiDrafts.value.entries()) {
        const errors = { ssid: '', key: '' }
        if (draft.enabled) {
          if (!draft.ssid.trim()) {
            errors.ssid = 'SSID 不能为空'
          } else if (draft.ssid.length > 32) {
            errors.ssid = 'SSID 最长 32 个字符'
          }

          if (draft.encryption !== 'none') {
            if (!draft.key && !keySetOf(draft.radio)) {
              errors.key = '请填写无线密码'
            } else if (draft.key && draft.key.length < 8) {
              errors.key = '无线密码至少 8 位'
            }
          }
        }
        if (errors.ssid || errors.key) wifiErrors.value[radioIndex] = errors
      }
      const first = Object.values(wifiErrors.value)[0]
      return first?.ssid || first?.key || ''
    }

    if (index === 3) {
      wanErrors.value = {}
      if (!wanDraft.value.section && !wanDraft.value.device) {
        wanErrors.value.device = '请选择 WAN 设备'
        return wanErrors.value.device
      }
      if (wanDraft.value.protocol === 'static') {
        if (!isValidSetupIpv4(wanDraft.value.ipaddr)) {
          wanErrors.value.ipaddr = '请填写正确的 IPv4 地址'
          return wanErrors.value.ipaddr
        }
        if (!wanDraft.value.netmask) {
          wanErrors.value.netmask = '请选择子网掩码'
          return wanErrors.value.netmask
        }
        if (!isValidSetupIpv4(wanDraft.value.gateway)) {
          wanErrors.value.gateway = '请填写正确的网关地址'
          return wanErrors.value.gateway
        }
        for (const dns of wanDraft.value.dns) {
          if (!isValidSetupIpv4(dns)) {
            wanErrors.value.dns = `DNS 地址 ${dns} 格式不正确`
            return wanErrors.value.dns
          }
        }
      }
      return ''
    }

    return ''
  }

  /* ------------------------------------------------------------------ *
   * Navigation
   * ------------------------------------------------------------------ */

  async function next(): Promise<void> {
    const message = validateStep(step.value)
    if (message) {
      ElMessage.warning(message)
      return
    }

    try {
      await stageStep(step.value)
    } catch (err) {
      ElMessage.error(`暂存失败：${errorText(err)}`)
      return
    }

    if (step.value === 3) {
      await finish()
      return
    }

    step.value += 1
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  function prev(): void {
    if (step.value === 0) return
    step.value -= 1
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  /* ------------------------------------------------------------------ *
   * Apply
   * ------------------------------------------------------------------ */

  async function finish(): Promise<void> {
    const list = changes.value
      .map((change) => `· ${change.label}：${change.before} → ${change.after}`)
      .join('\n')

    try {
      await ElMessageBox.confirm(
        `即将把下面的改动写入路由器：\n\n${list || '· 没有需要写入的改动'}\n\n` +
          '无线服务会重载，已连接的无线设备需要重新连接；修改 WAN 之后网络可能中断几秒。',
        '完成设置',
        {
          type: 'warning',
          confirmButtonText: '确认写入',
          cancelButtonText: '再检查一下'
        }
      )
    } catch {
      return
    }

    applying.value = true
    try {
      const report = await applySetupChanges(
        applyPlan.value,
        password.value ? { username: 'root', password: password.value } : undefined
      )
      applied.value = report.applied
      applyWarnings.value = report.warnings
      finished.value = true
      await refreshStatus()
      ElMessage.success('设置已写入路由器')
    } catch (err) {
      ElMessage.error(`${errorText(err)}，正在回滚已暂存的改动`)
      await rollback()
    } finally {
      applying.value = false
    }
  }

  async function rollback(): Promise<void> {
    const base = baseline.value
    if (!base) return
    try {
      await restoreSetupBaseline(base)
      await load()
      ElMessage.success('已恢复到向导开始前的配置')
    } catch {
      ElMessage.error('自动回滚失败，请到配置页面手动检查')
    }
  }

  async function discard(): Promise<void> {
    try {
      await ElMessageBox.confirm(
        '放弃已暂存的改动后，向导会重新读取路由器的当前配置。已经写入路由器的设置不会被撤销。',
        '放弃已暂存的改动',
        {
          type: 'warning',
          confirmButtonText: '放弃改动',
          cancelButtonText: '取消'
        }
      )
    } catch {
      return
    }

    await discardSetupChanges(['system', 'wireless', 'network'])
    password.value = ''
    passwordConfirm.value = ''
    await load()
    ElMessage.success('已暂存的改动已放弃')
  }

  async function restart(): Promise<void> {
    if (changes.value.length) {
      try {
        await ElMessageBox.confirm(
          '重新运行向导会放弃已暂存的改动，并重新读取路由器的当前配置。确定继续吗？',
          '重新运行向导',
          {
            type: 'warning',
            confirmButtonText: '重新开始',
            cancelButtonText: '取消'
          }
        )
      } catch {
        return
      }
      await discardSetupChanges(['system', 'wireless', 'network'])
    }

    step.value = 0
    finished.value = false
    applied.value = []
    applyWarnings.value = []
    password.value = ''
    passwordConfirm.value = ''
    await load()
  }

  function skipWizard(): void {
    void router.push({ name: 'dashboard' })
  }

  onMounted(async () => {
    await load()
    api
      .board()
      .then((board) => {
        boardModel.value = board?.model || ''
      })
      .catch(() => {
        // The model name is decoration — ignore a failure.
      })
  })
</script>

<style scoped>
  .setup-page {
    display: flex;
    flex-direction: column;
    min-height: 100vh;
    background: var(--bg);
  }

  /* ------------------------------------------------------------ 顶部条 */

  .setup-bar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-4);
    padding: 12px 24px;
    background: var(--surface);
    border-bottom: 1px solid var(--border);
  }

  .setup-brand {
    display: flex;
    align-items: center;
    gap: 10px;
    min-width: 0;
  }

  .setup-mark {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 32px;
    height: 32px;
    flex-shrink: 0;
    color: #fff;
    background: var(--brand);
    border-radius: 9px;
  }

  .setup-brand-text {
    display: flex;
    flex-direction: column;
    min-width: 0;
  }

  .setup-brand-text strong {
    color: var(--text);
    font-size: 14px;
    font-weight: 600;
    line-height: 1.3;
  }

  .setup-brand-text span {
    color: var(--text-muted);
    font-size: 12px;
  }

  .setup-bar-actions {
    display: flex;
    align-items: center;
    gap: var(--space-3);
    min-width: 0;
  }

  .setup-model {
    max-width: 220px;
    color: var(--text-muted);
    font-size: 12px;
  }

  /* -------------------------------------------------------------- 主体 */

  .setup-main {
    display: flex;
    flex-direction: column;
    gap: var(--space-4);
    width: 100%;
    max-width: 880px;
    margin: 0 auto;
    padding: 24px 24px 48px;
  }

  .setup-card {
    display: flex;
    flex-direction: column;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius-lg);
    box-shadow: var(--shadow-xs);
  }

  .setup-steps {
    padding: 20px 20px 4px;
    border-bottom: 1px solid var(--border);
  }

  .step-body {
    padding: 20px;
  }

  .step {
    display: flex;
    flex-direction: column;
    gap: var(--space-4);
  }

  .step-title {
    color: var(--text);
    font-size: 17px;
    font-weight: 600;
    line-height: 1.3;
  }

  .step-desc {
    max-width: 62ch;
    margin-top: -8px;
    color: var(--text-muted);
    font-size: 13px;
    line-height: 1.6;
  }

  .step-empty {
    padding: 20px;
    color: var(--text-muted);
    font-size: 13px;
    text-align: center;
    background: var(--surface-2);
    border-radius: var(--radius-md);
  }

  .field-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: var(--space-4);
  }

  .field-grid .span-2 {
    grid-column: 1 / -1;
  }

  .full {
    width: 100%;
  }

  /* ------------------------------------------------------------ 无线卡片 */

  .radio-card {
    display: flex;
    flex-direction: column;
    gap: var(--space-4);
    padding: 14px 16px;
    background: var(--surface-3);
    border: 1px solid var(--border);
    border-radius: var(--radius-md);
  }

  .radio-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-3);
  }

  .radio-title {
    display: flex;
    align-items: center;
    gap: 8px;
    min-width: 0;
    color: var(--text-secondary);
  }

  .radio-title strong {
    color: var(--text);
    font-size: 14px;
    font-weight: 600;
  }

  .radio-meta {
    color: var(--text-faint);
    font-size: 12px;
  }

  .proto-group {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 6px;
  }

  /* -------------------------------------------------------- 待生效改动 */

  .pending {
    padding: 14px 20px;
    background: var(--surface-3);
    border-top: 1px solid var(--border);
  }

  .pending-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-3);
    margin-bottom: 8px;
  }

  .pending-title {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    color: var(--text-secondary);
    font-size: 12px;
    font-weight: 500;
  }

  .pending-list {
    display: flex;
    flex-direction: column;
    gap: 5px;
    padding: 0;
    margin: 0;
    list-style: none;
  }

  .pending-item {
    display: flex;
    align-items: center;
    gap: 8px;
    min-width: 0;
    font-size: 12px;
  }

  .pending-label {
    flex-shrink: 0;
    min-width: 96px;
    color: var(--text-secondary);
    font-weight: 500;
  }

  .pending-before {
    color: var(--text-faint);
    text-decoration: line-through;
  }

  .pending-arrow {
    flex-shrink: 0;
    color: var(--text-faint);
  }

  .pending-after {
    color: var(--text);
  }

  /* -------------------------------------------------------------- 底部 */

  .step-actions {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-3);
    padding: 14px 20px;
    border-top: 1px solid var(--border);
  }

  /* -------------------------------------------------------------- 完成 */

  .done {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--space-3);
    padding: 40px 24px 32px;
    text-align: center;
  }

  .done-icon {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 52px;
    height: 52px;
    color: var(--success-text);
    background: var(--success-soft);
    border-radius: 50%;
  }

  .done-title {
    color: var(--text);
    font-size: 19px;
    font-weight: 600;
  }

  .done-desc {
    max-width: 48ch;
    color: var(--text-muted);
    font-size: 13px;
    line-height: 1.6;
  }

  .done-list {
    display: flex;
    flex-direction: column;
    gap: 6px;
    padding: 0;
    margin: 4px 0 0;
    list-style: none;
  }

  .done-list li {
    display: flex;
    align-items: center;
    gap: 7px;
    color: var(--text-secondary);
    font-size: 12.5px;
  }

  .done-list svg {
    color: var(--success);
  }

  .done-warning {
    max-width: 520px;
  }

  .done-actions {
    display: flex;
    gap: var(--space-2);
    margin-top: var(--space-3);
  }

  /* ------------------------------------------------------------ 移动端 */

  @media (max-width: 640px) {
    .setup-bar {
      padding: 10px 16px;
    }

    .setup-model {
      display: none;
    }

    .setup-main {
      padding: 16px 12px 32px;
    }

    .setup-steps {
      padding: 16px 16px 0;
    }

    .step-body {
      padding: 16px;
    }

    .field-grid {
      grid-template-columns: minmax(0, 1fr);
    }

    .pending,
    .step-actions {
      padding: 12px 16px;
    }

    .pending-item {
      flex-wrap: wrap;
    }

    .pending-label {
      min-width: 0;
    }

    .done {
      padding: 32px 16px 24px;
    }
  }
</style>
