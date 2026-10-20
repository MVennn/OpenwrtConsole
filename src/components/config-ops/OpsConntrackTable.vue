<template>
  <div class="ops-conntrack">
    <div class="ops-toolbar">
      <el-input
        v-model="keyword"
        class="ops-search"
        placeholder="按协议、地址或端口过滤"
        clearable
        :prefix-icon="Search"
      />
      <span class="ops-count num">{{ filtered.length }} / {{ connections.length }} 条连接</span>
    </div>

    <div v-if="filtered.length" class="desktop-only">
      <el-table :data="visible" style="width: 100%">
        <el-table-column label="协议" width="96">
          <template #default="{ row }">
            <div class="ops-proto">
              <span class="ops-proto-name">{{ row.protocol }}</span>
              <span class="ops-sub">{{ row.layer3 || '—' }}</span>
            </div>
          </template>
        </el-table-column>
        <el-table-column label="源" min-width="180">
          <template #default="{ row }">
            <span class="mono ops-addr">{{ row.source }}</span>
          </template>
        </el-table-column>
        <el-table-column label="目标" min-width="180">
          <template #default="{ row }">
            <span class="mono ops-addr">{{ row.destination }}</span>
          </template>
        </el-table-column>
        <el-table-column label="状态" width="100">
          <template #default="{ row }">
            <StatusBadge :label="row.state" :tone="toneOf(row)" />
          </template>
        </el-table-column>
        <el-table-column label="超时" width="100" align="right">
          <template #default="{ row }">
            <span class="num">{{ formatUptime(row.timeout) }}</span>
          </template>
        </el-table-column>
        <el-table-column label="流量" width="120" align="right">
          <template #default="{ row }">
            <div class="ops-flow">
              <span class="num">{{ formatBytes(row.bytes) }}</span>
              <span class="ops-sub num">{{ row.packets }} 包</span>
            </div>
          </template>
        </el-table-column>
      </el-table>
    </div>

    <div v-if="filtered.length" class="mobile-only ops-mobile">
      <div v-for="(row, index) in visible" :key="`${row.source}-${row.destination}-${index}`" class="ops-mobile-row">
        <div class="ops-mobile-head">
          <span class="ops-proto-name">{{ row.protocol }}</span>
          <StatusBadge :label="row.state" :tone="toneOf(row)" />
        </div>
        <div class="ops-mobile-line">
          <span>源</span>
          <span class="mono">{{ row.source }}</span>
        </div>
        <div class="ops-mobile-line">
          <span>目标</span>
          <span class="mono">{{ row.destination }}</span>
        </div>
        <div class="ops-mobile-line">
          <span>超时</span>
          <span class="num">{{ formatUptime(row.timeout) }}</span>
        </div>
      </div>
    </div>

    <EmptyState
      v-if="!filtered.length"
      :icon="Network"
      title="没有匹配的连接"
      description="当前连接跟踪表为空，或过滤条件过于严格。"
    />

    <p v-if="truncated" class="ops-note">
      共 {{ filtered.length }} 条连接，已显示前 {{ visible.length }} 条。连接跟踪来自内核快照，
      仅供排查问题参考。
    </p>
    <p v-else-if="filtered.length" class="ops-note">
      状态由连接跟踪引用数推断，路由器未直接上报 TCP 状态。
    </p>
  </div>
</template>

<script setup lang="ts">
  import { computed, ref } from 'vue'
  import { Network, Search } from 'lucide-vue-next'
  import StatusBadge from '@/components/StatusBadge.vue'
  import EmptyState from '@/components/EmptyState.vue'
  import { formatBytes, formatUptime } from '@/utils/format'
  import type { OpsConntrack } from '@/api/ops'

  /** The router reports every tracked flow; the table shows the first 50. */
  const MAX_ROWS = 50

  const props = defineProps<{
    connections: OpsConntrack[]
  }>()

  const keyword = ref('')

  const filtered = computed(() => {
    const term = keyword.value.trim().toLowerCase()
    if (!term) return props.connections
    return props.connections.filter((row) =>
      [
        row.protocol,
        row.layer3,
        row.source,
        row.destination,
        row.state
      ].some((value) => value.toLowerCase().includes(term))
    )
  })

  const visible = computed(() => filtered.value.slice(0, MAX_ROWS))
  const truncated = computed(() => filtered.value.length > MAX_ROWS)

  function toneOf(row: OpsConntrack): 'success' | 'warning' | 'neutral' {
    if (row.state === '已建立') return 'success'
    if (row.state === '建立中') return 'warning'
    return 'neutral'
  }
</script>

<style scoped>
  .ops-toolbar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding: 14px 16px;
    border-bottom: 1px solid var(--border);
  }

  .ops-search {
    max-width: 320px;
  }

  .ops-count {
    color: var(--text-muted);
    font-size: 11.5px;
  }

  .ops-proto {
    display: flex;
    flex-direction: column;
    line-height: 1.4;
  }

  .ops-proto-name {
    color: var(--text);
    font-size: 12.5px;
    font-weight: 500;
  }

  .ops-sub {
    color: var(--text-muted);
    font-size: 11px;
  }

  .ops-addr {
    color: var(--text-secondary);
    font-size: 12px;
  }

  .ops-flow {
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    line-height: 1.4;
  }

  .ops-note {
    padding: 10px 16px 12px;
    color: var(--text-muted);
    font-size: 11.5px;
    line-height: 1.6;
    border-top: 1px solid var(--border);
  }

  .ops-mobile {
    padding: 4px 16px 12px;
  }

  .ops-mobile-row {
    padding: 12px 0;
    border-bottom: 1px solid var(--border);
  }

  .ops-mobile-row:last-child {
    border-bottom: 0;
  }

  .ops-mobile-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    margin-bottom: 4px;
  }

  .ops-mobile-line {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 12px;
    color: var(--text-muted);
    font-size: 11.5px;
    line-height: 1.9;
  }

  .ops-mobile-line span:last-child {
    overflow: hidden;
    color: var(--text-secondary);
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  @media (max-width: 640px) {
    .ops-toolbar {
      align-items: stretch;
      flex-direction: column;
      padding: 12px 16px;
    }

    .ops-search {
      max-width: none;
    }
  }
</style>
