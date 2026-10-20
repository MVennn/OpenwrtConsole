<template>
  <section class="card radio-card">
    <header class="radio-head">
      <div class="radio-heading">
        <span class="radio-band" :class="bandClass">{{ band }}</span>
        <div class="radio-heading-text">
          <h2 class="radio-title">{{ title }}</h2>
          <p class="radio-sub">{{ subtitle }}</p>
        </div>
      </div>
      <div class="radio-head-actions">
        <StatusBadge
          :tone="enabled ? 'success' : 'neutral'"
          :label="enabled ? '已开启' : '已关闭'"
        />
        <el-switch
          :model-value="enabled"
          :loading="isPending(radio.section)"
          :aria-label="`${enabled ? '关闭' : '开启'}射频 ${radio.section || title}`"
          @change="onToggleRadio"
        />
      </div>
    </header>

    <dl class="radio-grid">
      <div>
        <dt>信道</dt>
        <dd class="num">{{ channelText }}</dd>
        <dd v-if="actualChannelText" class="radio-sub mono">实际 {{ actualChannelText }}</dd>
      </div>
      <div>
        <dt>带宽</dt>
        <dd>{{ radio.htmode || '—' }}</dd>
        <dd v-if="radio.actualBandwidth" class="radio-sub mono">
          实际 {{ radio.actualBandwidth }}
        </dd>
      </div>
      <div>
        <dt>国家码</dt>
        <dd class="num">{{ radio.country || '—' }}</dd>
      </div>
      <div>
        <dt>发射功率</dt>
        <dd class="num">{{ txpowerText }}</dd>
      </div>
      <div>
        <dt>当前速率</dt>
        <dd class="num">{{ bitrateText }}</dd>
      </div>
      <div>
        <dt>关联终端</dt>
        <dd class="num">{{ clients }} 台</dd>
      </div>
    </dl>

    <div class="ssid-list">
      <div v-for="iface in radio.interfaces" :key="iface.section" class="ssid-row">
        <div class="ssid-main">
          <div class="ssid-name">
            <Wifi :size="14" />
            <strong>{{ iface.ssid || '未命名网络' }}</strong>
            <span v-if="iface.hidden" class="ssid-flag">隐藏</span>
            <span v-if="iface.guest" class="ssid-flag is-guest">访客</span>
          </div>
          <p class="ssid-meta">
            <Lock :size="12" />
            {{ encryptionText(iface.encryption) }}
            <span class="ssid-sep">·</span>
            {{ modeText(iface.mode) }}
            <span class="ssid-sep">·</span>
            网络 {{ iface.network || '—' }}
            <span class="ssid-sep">·</span>
            <span class="num">{{ iface.clients }} 台客户端</span>
            <template v-if="iface.clients">
              <span class="ssid-sep">·</span>
              <span class="num">
                信号 {{ iface.bestSignal }} dBm（{{ signalLabel(iface.bestSignal) }}）
              </span>
            </template>
          </p>
        </div>
        <div class="ssid-actions">
          <el-switch
            :model-value="!iface.disabled"
            :loading="isPending(iface.section)"
            :aria-label="`${iface.disabled ? '开启' : '关闭'} SSID ${iface.ssid || '未命名网络'}`"
            @change="onToggleIface(iface, $event)"
          />
          <el-button size="small" @click="emit('edit-ssid', iface.section)">编辑 SSID</el-button>
        </div>
      </div>
      <p v-if="!radio.interfaces.length" class="ssid-empty">该射频下没有配置 SSID。</p>
    </div>

    <footer class="radio-foot">
      <span class="radio-foot-note">
        <Settings2 :size="13" />
        信道、带宽、国家码与发射功率在「编辑射频」中修改
      </span>
      <el-button
        size="small"
        :icon="Settings2"
        :disabled="!radio.section"
        @click="emit('edit-radio', radio.section)"
      >
        编辑射频
      </el-button>
    </footer>
  </section>
</template>

<script setup lang="ts">
  import { computed } from 'vue'
  import { Lock, Settings2, Wifi } from 'lucide-vue-next'
  import StatusBadge from '@/components/StatusBadge.vue'
  import { bandText, encryptionText, modeText, type WifiRadioConfig } from '@/api/wirelessConfig'
  import { formatLinkRate, signalLabel } from '@/utils/format'

  const props = defineProps<{
    radio: WifiRadioConfig
    /** UCI sections that are currently being written to the router. */
    pending?: string[]
  }>()

  const emit = defineEmits<{
    'toggle-radio': [payload: { section: string; enabled: boolean }]
    'toggle-ssid': [payload: { section: string; enabled: boolean }]
    'edit-radio': [section: string]
    'edit-ssid': [section: string]
  }>()

  const enabled = computed(() => !props.radio.disabled)
  const band = computed(() => bandText(props.radio.band))
  const bandClass = computed(() => {
    const value = (props.radio.band || '').toLowerCase()
    if (value.startsWith('5')) return 'is-5'
    if (value.startsWith('6')) return 'is-6'
    return 'is-24'
  })

  const title = computed(() => {
    const first = props.radio.interfaces.find((iface) => iface.ssid)
    return first?.ssid || props.radio.section || '未命名射频'
  })

  const subtitle = computed(() => {
    const parts: string[] = []
    if (props.radio.section) parts.push(props.radio.section)
    if (props.radio.path) parts.push(props.radio.path)
    if (props.radio.orphan) parts.push('未绑定到该射频的 SSID')
    return parts.join(' · ') || '无线射频'
  })

  const channelText = computed(() => {
    const channel = (props.radio.channel || '').trim()
    if (!channel || channel === 'auto') return '自动'
    return channel
  })

  const txpowerText = computed(() => {
    const value = (props.radio.txpower || '').trim()
    if (!value) return '自动'
    const numeric = Number(value)
    return Number.isFinite(numeric) ? `${numeric} dBm` : value
  })

  const clients = computed(() =>
    props.radio.interfaces.reduce((sum, iface) => sum + iface.clients, 0)
  )

  /** The channel the radio really uses right now (iwinfo). */
  const actualChannelText = computed(() => {
    const radio = props.radio
    if (!radio.actualChannel) return ''
    if (radio.actualFrequency) return `信道 ${radio.actualChannel} · ${radio.actualFrequency} MHz`
    return `信道 ${radio.actualChannel}`
  })

  /** The current PHY rate of the radio (iwinfo). */
  const bitrateText = computed(() => {
    const rate = props.radio.actualBitrate
    if (!rate) return '—'
    return formatLinkRate(rate)
  })

  function isPending(section: string): boolean {
    return (props.pending ?? []).includes(section)
  }

  function onToggleRadio(value: string | number | boolean): void {
    if (!props.radio.section) return
    emit('toggle-radio', { section: props.radio.section, enabled: Boolean(value) })
  }

  function onToggleIface(
    iface: { section: string; ssid: string },
    value: string | number | boolean
  ): void {
    emit('toggle-ssid', { section: iface.section, enabled: Boolean(value) })
  }
</script>

<style scoped>
  .radio-card {
    padding: 18px 20px 0;
  }

  .radio-head {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 12px;
  }

  .radio-heading {
    display: flex;
    align-items: center;
    gap: 10px;
    min-width: 0;
  }

  .radio-heading-text {
    min-width: 0;
  }

  .radio-band {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 58px;
    height: 42px;
    flex-shrink: 0;
    color: var(--brand-text);
    font-size: 12px;
    font-weight: 600;
    background: var(--brand-soft);
    border-radius: var(--radius-md);
  }

  .radio-band.is-5 {
    color: var(--info-text);
    background: var(--info-soft);
  }

  .radio-band.is-6 {
    color: var(--success-text);
    background: var(--success-soft);
  }

  .radio-title {
    overflow: hidden;
    color: var(--text);
    font-size: var(--text-base);
    font-weight: 600;
    line-height: 1.3;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .radio-sub {
    overflow: hidden;
    margin-top: 1px;
    color: var(--text-muted);
    font-size: 11px;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .radio-head-actions {
    display: flex;
    flex-shrink: 0;
    align-items: center;
    gap: 10px;
  }

  .radio-grid {
    display: grid;
    grid-template-columns: repeat(6, minmax(0, 1fr));
    gap: 12px 14px;
    padding: 16px 0;
    margin: 16px 0 0;
    border-top: 1px solid var(--border);
  }

  .radio-grid dt {
    margin: 0 0 2px;
    color: var(--text-muted);
    font-size: 11px;
  }

  .radio-grid dd {
    margin: 0;
    overflow: hidden;
    color: var(--text);
    font-size: var(--text-sm);
    font-weight: 500;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .radio-grid dd.radio-sub {
    margin-top: 2px;
    color: var(--text-muted);
    font-size: 11px;
    font-weight: 400;
  }

  .ssid-list {
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding-bottom: 16px;
  }

  .ssid-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding: 10px 12px;
    background: var(--surface-3);
    border: 1px solid var(--border);
    border-radius: var(--radius);
  }

  .ssid-main {
    min-width: 0;
  }

  .ssid-name {
    display: flex;
    align-items: center;
    gap: 6px;
    color: var(--text);
    font-size: var(--text-sm);
    font-weight: 600;
  }

  .ssid-name svg {
    color: var(--text-muted);
  }

  .ssid-flag {
    padding: 1px 6px;
    color: var(--text-muted);
    font-size: 10.5px;
    font-weight: 500;
    background: var(--surface-2);
    border-radius: 999px;
  }

  .ssid-flag.is-guest {
    color: var(--warning-text);
    background: var(--warning-soft);
  }

  .ssid-meta {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 5px;
    margin-top: 3px;
    color: var(--text-muted);
    font-size: 11.5px;
  }

  .ssid-meta svg {
    color: var(--text-faint);
  }

  .ssid-sep {
    color: var(--text-faint);
  }

  .ssid-actions {
    display: flex;
    flex-shrink: 0;
    align-items: center;
    gap: 10px;
  }

  .ssid-empty {
    padding: 6px 2px;
    color: var(--text-muted);
    font-size: var(--text-xs);
  }

  .radio-foot {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding: 12px 0 14px;
    margin-top: auto;
    border-top: 1px solid var(--border);
  }

  .radio-foot-note {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    color: var(--text-muted);
    font-size: 11.5px;
  }

  @media (max-width: 1180px) {
    .radio-grid {
      grid-template-columns: repeat(3, minmax(0, 1fr));
    }
  }

  @media (max-width: 640px) {
    .radio-card {
      padding: 16px 16px 0;
    }

    .radio-grid {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }

    .radio-head {
      flex-direction: column;
      align-items: stretch;
    }

    .radio-head-actions {
      justify-content: space-between;
    }

    .ssid-row {
      flex-direction: column;
      align-items: stretch;
    }

    .ssid-actions {
      justify-content: space-between;
    }

    .radio-foot {
      flex-direction: column;
      align-items: stretch;
      gap: 8px;
    }
  }
</style>
