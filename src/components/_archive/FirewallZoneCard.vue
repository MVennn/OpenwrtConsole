<template>
  <article class="card zone-card">
    <header class="zone-head">
      <div class="zone-heading">
        <span class="zone-icon"><ShieldCheck :size="17" :stroke-width="1.9" /></span>
        <div class="zone-heading-text">
          <h3 class="zone-name truncate" :title="zone.name">{{ zone.name }}</h3>
          <p class="zone-meta">
            <span class="zone-family">{{ familyText(zone.family) }}</span>
          </p>
        </div>
      </div>

    </header>

    <div class="zone-policies">
      <div v-for="policy in policies" :key="policy.key" class="zone-policy">
        <span class="zone-policy-label">{{ policy.key }}</span>
        <StatusBadge
          :label="policy.value || '未设置'"
          :tone="policyTone(policy.value)"
          :dot="false"
        />
      </div>
    </div>

    <dl class="zone-lists">
      <div class="zone-list">
        <dt>网络</dt>
        <dd>
          <span v-for="net in zone.networks" :key="net" class="chip mono">{{ net }}</span>
          <span v-if="!zone.networks.length" class="zone-empty">未绑定网络</span>
        </dd>
      </div>

      <div class="zone-list">
        <dt>转发到</dt>
        <dd>
          <span v-for="target in zone.forwardTo" :key="target" class="chip">{{ target }}</span>
          <span v-if="!zone.forwardTo.length" class="zone-empty">无</span>
        </dd>
      </div>
    </dl>

    <footer class="zone-foot">
      <StatusBadge
        :label="zone.masq ? 'NAT 开启' : 'NAT 关闭'"
        :tone="zone.masq ? 'success' : 'neutral'"
      />
      <StatusBadge
        v-if="zone.mtuFix"
        label="MTU 修正"
        tone="info"
        :dot="false"
      />
    </footer>
  </article>
</template>

<script setup lang="ts">
  import { computed } from 'vue'
  import { ShieldCheck } from 'lucide-vue-next'
  import StatusBadge from '@/components/StatusBadge.vue'
  import { policyTone, type FirewallZone } from '@/api/_archive/firewall.readonly'

  defineOptions({ name: 'FirewallZoneCard' })

  const props = defineProps<{
    zone: FirewallZone
  }>()

  const policies = computed(() => [
    { key: 'input', value: props.zone.input },
    { key: 'output', value: props.zone.output },
    { key: 'forward', value: props.zone.forward }
  ])

  function familyText(family: string): string {
    const value = family.trim().toLowerCase()
    if (!value || value === 'any') return 'IPv4 / IPv6'
    if (value === 'ipv4') return 'IPv4'
    if (value === 'ipv6') return 'IPv6'
    return family
  }
</script>

<style scoped>
  .zone-card {
    display: flex;
    flex-direction: column;
    padding: 18px 20px 16px;
  }

  .zone-head {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 10px;
  }

  .zone-heading {
    display: flex;
    align-items: center;
    gap: 9px;
    min-width: 0;
  }

  .zone-icon {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 34px;
    height: 34px;
    flex-shrink: 0;
    color: var(--brand-text);
    background: var(--brand-soft);
    border-radius: var(--radius-md);
  }

  .zone-heading-text {
    min-width: 0;
  }

  .zone-name {
    color: var(--text);
    font-size: var(--text-base);
    font-weight: 600;
    line-height: 1.3;
  }

  .zone-meta {
    margin-top: 2px;
    color: var(--text-muted);
    font-size: 11px;
  }

  .zone-link {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 30px;
    height: 30px;
    flex-shrink: 0;
    color: var(--text-muted);
    background: var(--surface-2);
    border-radius: var(--radius-sm);
    transition:
      color 0.16s ease,
      background-color 0.16s ease;
  }

  .zone-link:hover {
    color: var(--brand-text);
    text-decoration: none;
    background: var(--brand-soft);
  }

  .zone-policies {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 8px;
    margin: 16px 0 14px;
    padding: 12px 0;
    border-top: 1px solid var(--border);
    border-bottom: 1px solid var(--border);
  }

  .zone-policy {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 4px;
    min-width: 0;
  }

  .zone-policy-label {
    color: var(--text-muted);
    font-size: 11px;
    font-family: var(--font-mono);
  }

  .zone-lists {
    display: flex;
    flex-direction: column;
    gap: 10px;
    margin: 0;
  }

  .zone-list dt {
    margin-bottom: 5px;
    color: var(--text-muted);
    font-size: 11px;
  }

  .zone-list dd {
    display: flex;
    flex-wrap: wrap;
    gap: 5px;
    margin: 0;
  }

  .chip {
    display: inline-flex;
    align-items: center;
    height: 22px;
    padding: 0 8px;
    color: var(--text-secondary);
    font-size: 11.5px;
    background: var(--surface-2);
    border-radius: var(--radius-sm);
  }

  .zone-empty {
    color: var(--text-faint);
    font-size: 11.5px;
  }

  .zone-foot {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    margin-top: 14px;
    padding-top: 12px;
    border-top: 1px solid var(--border);
  }

  @media (max-width: 640px) {
    .zone-card {
      padding: 16px;
    }

    .zone-policies {
      grid-template-columns: repeat(3, minmax(0, 1fr));
    }
  }
</style>
