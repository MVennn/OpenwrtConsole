<template>
  <div class="ops-processes">
    <div class="ops-toolbar">
      <el-input
        v-model="keyword"
        class="ops-search"
        placeholder="按命令关键字过滤，例如 dnsmasq"
        clearable
        :prefix-icon="Search"
      />
      <span class="ops-count num">{{ filtered.length }} / {{ processes.length }} 个进程</span>
    </div>

    <div v-if="filtered.length" class="desktop-only">
      <el-table :data="pageRows" style="width: 100%">
        <el-table-column label="PID" width="80">
          <template #default="{ row }">
            <span class="mono num">{{ row.pid }}</span>
          </template>
        </el-table-column>
        <el-table-column label="用户" width="110">
          <template #default="{ row }">
            <span class="mono">{{ row.user }}</span>
          </template>
        </el-table-column>
        <el-table-column label="CPU" width="88" align="right">
          <template #default="{ row }">
            <span class="num" :class="row.cpu >= 50 ? 'is-hot' : ''">{{ row.cpu.toFixed(1) }}%</span>
          </template>
        </el-table-column>
        <el-table-column label="内存" width="120" align="right">
          <template #default="{ row }">
            <div class="ops-mem">
              <span class="num" :class="row.memoryPercent >= 50 ? 'is-hot' : ''">
                {{ row.memoryPercent.toFixed(1) }}%
              </span>
              <span class="ops-sub num">{{ formatBytes(row.memoryBytes) }}</span>
            </div>
          </template>
        </el-table-column>
        <el-table-column label="命令" min-width="260">
          <template #default="{ row }">
            <span class="mono ops-command" :title="row.command">{{ row.command || '—' }}</span>
          </template>
        </el-table-column>
      </el-table>

      <div class="ops-pager">
        <el-pagination
          v-model:current-page="page"
          v-model:page-size="pageSize"
          :page-sizes="[20, 50, 100]"
          :total="filtered.length"
          layout="total, sizes, prev, pager, next"
          background
        />
      </div>
    </div>

    <div v-if="filtered.length" class="mobile-only ops-mobile">
      <div v-for="row in pageRows" :key="row.pid" class="ops-mobile-row">
        <div class="ops-mobile-head">
          <span class="mono ops-name">PID {{ row.pid }}</span>
          <span class="ops-sub mono">{{ row.user }}</span>
        </div>
        <div class="ops-mobile-line">
          <span>CPU / 内存</span>
          <span class="num">
            {{ row.cpu.toFixed(1) }}% · {{ row.memoryPercent.toFixed(1) }}%
            <span class="ops-sub">（{{ formatBytes(row.memoryBytes) }}）</span>
          </span>
        </div>
        <div class="ops-mobile-command mono">{{ row.command || '—' }}</div>
      </div>

      <div class="ops-pager">
        <el-pagination
          v-model:current-page="page"
          v-model:page-size="pageSize"
          :page-sizes="[20, 50, 100]"
          :total="filtered.length"
          layout="prev, pager, next"
          background
        />
      </div>
    </div>

    <EmptyState
      v-if="!filtered.length"
      :icon="Terminal"
      title="没有匹配的进程"
      description="换个命令关键字试试，或等待路由器刷新进程列表。"
    />
  </div>
</template>

<script setup lang="ts">
  import { computed, ref, watch } from 'vue'
  import { Search, Terminal } from 'lucide-vue-next'
  import EmptyState from '@/components/EmptyState.vue'
  import { formatBytes } from '@/utils/format'
  import type { OpsProcess } from '@/api/ops'

  const props = defineProps<{
    processes: OpsProcess[]
  }>()

  const keyword = ref('')
  const page = ref(1)
  const pageSize = ref(20)

  const filtered = computed(() => {
    const term = keyword.value.trim().toLowerCase()
    if (!term) return props.processes
    return props.processes.filter(
      (row) =>
        row.command.toLowerCase().includes(term) ||
        row.user.toLowerCase().includes(term) ||
        String(row.pid) === term
    )
  })

  const pageRows = computed(() => {
    const start = (page.value - 1) * pageSize.value
    return filtered.value.slice(start, start + pageSize.value)
  })

  // A new filter or a shorter list must not leave the reader on an empty page.
  watch([keyword, pageSize], () => {
    page.value = 1
  })

  watch(filtered, (rows) => {
    const maxPage = Math.max(1, Math.ceil(rows.length / pageSize.value))
    if (page.value > maxPage) page.value = maxPage
  })
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

  .ops-mem {
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    line-height: 1.4;
  }

  .ops-sub {
    color: var(--text-muted);
    font-size: 11px;
  }

  .is-hot {
    color: var(--warning-text);
    font-weight: 500;
  }

  .ops-command {
    display: block;
    overflow: hidden;
    color: var(--text-secondary);
    font-size: 12px;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .ops-pager {
    display: flex;
    justify-content: flex-end;
    padding: 12px 16px;
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

  .ops-name {
    color: var(--text);
    font-size: 12.5px;
    font-weight: 500;
  }

  .ops-mobile-line {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 12px;
    color: var(--text-muted);
    font-size: 11.5px;
  }

  .ops-mobile-command {
    margin-top: 4px;
    overflow: hidden;
    color: var(--text-secondary);
    font-size: 11.5px;
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

    .ops-pager {
      justify-content: center;
      padding: 10px 8px;
    }
  }
</style>
