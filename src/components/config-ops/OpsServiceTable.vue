<template>
  <div class="ops-services">
    <div class="ops-toolbar">
      <el-input
        v-model="keyword"
        class="ops-search"
        placeholder="按服务名过滤"
        clearable
        :prefix-icon="Search"
      />
      <span class="ops-count num">{{ filtered.length }} / {{ services.length }}</span>
    </div>

    <div v-if="filtered.length" class="desktop-only">
      <el-table :data="filtered" style="width: 100%">
        <el-table-column label="服务" min-width="190">
          <template #default="{ row }">
            <div class="ops-cell">
              <span class="ops-name mono truncate">{{ row.name }}</span>
              <span v-if="row.instances" class="ops-sub num">{{ row.instances }} 个实例</span>
            </div>
          </template>
        </el-table-column>
        <el-table-column label="运行状态" width="112">
          <template #default="{ row }">
            <StatusBadge
              :label="row.running ? '运行中' : '已停止'"
              :tone="row.running ? 'success' : 'neutral'"
            />
          </template>
        </el-table-column>
        <el-table-column label="开机自启" width="118" align="center">
          <template #default="{ row }">
            <el-switch
              :model-value="autostartOf(row)"
              :disabled="!switchable(row) || isBusy(row.name)"
              :loading="isAutostartBusy(row)"
              title="关闭后路由器重启不会自动启动该服务"
              @change="onToggle(row, $event)"
            />
          </template>
        </el-table-column>
        <el-table-column label="已启用" width="104" align="center">
          <template #default="{ row }">
            <span v-if="row.enabled === null" class="muted">—</span>
            <span v-else :title="'路由器上报的启用状态'">
              <StatusBadge
                :label="row.enabled ? '是' : '否'"
                :tone="row.enabled ? 'success' : 'neutral'"
              />
            </span>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="216" align="right">
          <template #default="{ row }">
            <div class="ops-actions">
              <el-button
                size="small"
                :disabled="isBusy(row.name)"
                :loading="pendingOf(row.name) === 'start'"
                @click="emit('action', row.name, 'start')"
              >
                启动
              </el-button>
              <el-button
                size="small"
                :disabled="isBusy(row.name)"
                :loading="pendingOf(row.name) === 'stop'"
                @click="emit('action', row.name, 'stop')"
              >
                停止
              </el-button>
              <el-button
                size="small"
                :disabled="isBusy(row.name)"
                :loading="pendingOf(row.name) === 'restart'"
                @click="emit('action', row.name, 'restart')"
              >
                重启
              </el-button>
            </div>
          </template>
        </el-table-column>
      </el-table>
    </div>

    <div v-if="filtered.length" class="mobile-only ops-mobile">
      <div v-for="row in filtered" :key="row.name" class="ops-mobile-row">
        <div class="ops-mobile-head">
          <span class="ops-name mono truncate">{{ row.name }}</span>
          <StatusBadge
            :label="row.running ? '运行中' : '已停止'"
            :tone="row.running ? 'success' : 'neutral'"
          />
        </div>
        <div class="ops-mobile-line">
          <span>开机自启</span>
          <el-switch
            :model-value="autostartOf(row)"
            :disabled="!switchable(row) || isBusy(row.name)"
            :loading="isAutostartBusy(row)"
            @change="onToggle(row, $event)"
          />
        </div>
        <div class="ops-mobile-line">
          <span>已启用</span>
          <span class="mono">{{ row.enabled === null ? '—' : row.enabled ? '是' : '否' }}</span>
        </div>
        <div class="ops-mobile-actions">
          <el-button
            size="small"
            :disabled="isBusy(row.name)"
            :loading="pendingOf(row.name) === 'start'"
            @click="emit('action', row.name, 'start')"
          >
            启动
          </el-button>
          <el-button
            size="small"
            :disabled="isBusy(row.name)"
            :loading="pendingOf(row.name) === 'stop'"
            @click="emit('action', row.name, 'stop')"
          >
            停止
          </el-button>
          <el-button
            size="small"
            :disabled="isBusy(row.name)"
            :loading="pendingOf(row.name) === 'restart'"
            @click="emit('action', row.name, 'restart')"
          >
            重启
          </el-button>
        </div>
      </div>
    </div>

    <EmptyState
      v-if="!filtered.length"
      :icon="Server"
      title="没有匹配的服务"
      description="换个关键词试试，或检查路由器是否开放了 init 脚本列表。"
    />
  </div>
</template>

<script setup lang="ts">
  import { computed, ref } from 'vue'
  import { Search, Server } from 'lucide-vue-next'
  import StatusBadge from '@/components/StatusBadge.vue'
  import EmptyState from '@/components/EmptyState.vue'
  import type { OpsService, OpsServiceAction } from '@/api/ops'

  const props = withDefaults(
    defineProps<{
      services: OpsService[]
      /** Service name → action that is currently running. */
      pending?: Record<string, OpsServiceAction>
      /** Local override for the autostart switch while a change is in flight. */
      overrides?: Record<string, boolean>
    }>(),
    { pending: () => ({}), overrides: () => ({}) }
  )

  const emit = defineEmits<{
    action: [service: string, action: OpsServiceAction]
    toggle: [service: string, enabled: boolean]
  }>()

  const keyword = ref('')

  const filtered = computed(() => {
    const term = keyword.value.trim().toLowerCase()
    if (!term) return props.services
    return props.services.filter((service) => service.name.toLowerCase().includes(term))
  })

  function pendingOf(name: string): OpsServiceAction | undefined {
    return props.pending[name]
  }

  function isBusy(name: string): boolean {
    return Boolean(props.pending[name])
  }

  function isAutostartBusy(row: OpsService): boolean {
    const action = props.pending[row.name]
    return action === 'enable' || action === 'disable'
  }

  /** Only init scripts can be enabled or disabled. */
  function switchable(row: OpsService): boolean {
    return row.enabled !== null
  }

  function autostartOf(row: OpsService): boolean {
    const override = props.overrides[row.name]
    if (override !== undefined) return override
    return row.enabled === true
  }

  function onToggle(row: OpsService, value: string | number | boolean): void {
    emit('toggle', row.name, Boolean(value))
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
    max-width: 280px;
  }

  .ops-count {
    color: var(--text-muted);
    font-size: 11.5px;
  }

  .ops-cell {
    display: flex;
    flex-direction: column;
    gap: 1px;
    min-width: 0;
  }

  .ops-name {
    color: var(--text);
    font-size: 12.5px;
    font-weight: 500;
  }

  .ops-sub {
    color: var(--text-muted);
    font-size: 11px;
  }

  .ops-actions {
    display: flex;
    justify-content: flex-end;
    gap: 6px;
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
    margin-bottom: 6px;
  }

  .ops-mobile-line {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    color: var(--text-muted);
    font-size: 11.5px;
    line-height: 2;
  }

  .ops-mobile-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    margin-top: 8px;
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
