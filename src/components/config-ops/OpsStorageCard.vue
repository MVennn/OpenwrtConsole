<template>
  <div class="ops-storage">
    <div class="ops-section">
      <p class="ops-section-title">挂载点</p>
      <div v-if="mounts.length" class="desktop-only">
        <el-table :data="mounts" style="width: 100%">
          <el-table-column label="设备" min-width="170">
            <template #default="{ row }">
              <span class="mono ops-device truncate" :title="row.device">{{ row.device }}</span>
            </template>
          </el-table-column>
          <el-table-column label="挂载点" min-width="130">
            <template #default="{ row }">
              <span class="mono ops-device">{{ row.mountpoint }}</span>
            </template>
          </el-table-column>
          <el-table-column label="已用 / 总量" min-width="170">
            <template #default="{ row }">
              <div class="ops-usage">
                <span class="num ops-usage-text">
                  {{ formatBytes(row.usedBytes) }} / {{ formatBytes(row.totalBytes) }}
                </span>
                <span class="ops-track">
                  <span
                    class="ops-fill"
                    :class="`tone-${toneOf(row)}`"
                    :style="{ width: `${percentOf(row)}%` }"
                  />
                </span>
              </div>
            </template>
          </el-table-column>
          <el-table-column label="可用" width="110" align="right">
            <template #default="{ row }">
              <span class="num">{{ formatBytes(row.availableBytes) }}</span>
            </template>
          </el-table-column>
        </el-table>
      </div>

      <div v-if="mounts.length" class="mobile-only ops-mobile">
        <div v-for="row in mounts" :key="row.mountpoint" class="ops-mobile-row">
          <div class="ops-mobile-head">
            <span class="mono ops-device">{{ row.mountpoint }}</span>
            <span class="num ops-sub">{{ percentOf(row) }}%</span>
          </div>
          <div class="ops-mobile-line">
            <span>设备</span>
            <span class="mono truncate">{{ row.device }}</span>
          </div>
          <div class="ops-mobile-line">
            <span>已用 / 总量</span>
            <span class="num">
              {{ formatBytes(row.usedBytes) }} / {{ formatBytes(row.totalBytes) }}
            </span>
          </div>
          <div class="ops-mobile-line">
            <span>可用</span>
            <span class="num">{{ formatBytes(row.availableBytes) }}</span>
          </div>
        </div>
      </div>

      <EmptyState
        v-if="!mounts.length"
        :icon="HardDrive"
        title="没有挂载点信息"
        description="路由器未返回挂载表，可能是内核未提供该信息。"
      />
    </div>

    <div class="ops-section">
      <p class="ops-section-title">块设备</p>
      <div v-if="blocks.length" class="desktop-only">
        <el-table :data="blocks" style="width: 100%">
          <el-table-column label="设备" min-width="170">
            <template #default="{ row }">
              <span class="mono ops-device truncate" :title="row.device">{{ row.device }}</span>
            </template>
          </el-table-column>
          <el-table-column label="容量" width="120" align="right">
            <template #default="{ row }">
              <span class="num">{{ formatBytes(row.sizeBytes) }}</span>
            </template>
          </el-table-column>
          <el-table-column label="类型" width="110">
            <template #default="{ row }">
              <span class="muted">{{ row.type || '—' }}</span>
            </template>
          </el-table-column>
          <el-table-column label="型号" min-width="140">
            <template #default="{ row }">
              <span class="truncate">{{ row.model || '—' }}</span>
            </template>
          </el-table-column>
          <el-table-column label="挂载点" min-width="120">
            <template #default="{ row }">
              <span class="mono ops-device">{{ row.mounted || '—' }}</span>
            </template>
          </el-table-column>
        </el-table>
      </div>

      <div v-if="blocks.length" class="mobile-only ops-mobile">
        <div v-for="row in blocks" :key="row.device" class="ops-mobile-row">
          <div class="ops-mobile-head">
            <span class="mono ops-device">{{ row.device }}</span>
            <span class="num ops-sub">{{ formatBytes(row.sizeBytes) }}</span>
          </div>
          <div class="ops-mobile-line">
            <span>类型</span>
            <span>{{ row.type || '—' }}</span>
          </div>
          <div class="ops-mobile-line">
            <span>型号</span>
            <span class="truncate">{{ row.model || '—' }}</span>
          </div>
          <div class="ops-mobile-line">
            <span>挂载点</span>
            <span class="mono">{{ row.mounted || '—' }}</span>
          </div>
        </div>
      </div>

      <EmptyState
        v-if="!blocks.length"
        :icon="Disc3"
        title="没有块设备"
        description="该设备使用 UBI 或 NAND 直挂，没有暴露块设备节点。"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
  import { Disc3, HardDrive } from 'lucide-vue-next'
  import EmptyState from '@/components/EmptyState.vue'
  import { formatBytes } from '@/utils/format'
  import type { OpsBlockDevice, OpsMount } from '@/api/ops'

  defineProps<{
    mounts: OpsMount[]
    blocks: OpsBlockDevice[]
  }>()

  function percentOf(row: OpsMount): number {
    if (!row.totalBytes) return 0
    return Math.min(100, Math.max(0, Math.round((row.usedBytes / row.totalBytes) * 100)))
  }

  function toneOf(row: OpsMount): 'danger' | 'warning' | 'brand' {
    const percent = percentOf(row)
    if (percent >= 90) return 'danger'
    if (percent >= 75) return 'warning'
    return 'brand'
  }
</script>

<style scoped>
  .ops-section + .ops-section {
    margin-top: 20px;
    padding-top: 18px;
    border-top: 1px solid var(--border);
  }

  .ops-section-title {
    margin-bottom: 8px;
    color: var(--text-muted);
    font-size: 11.5px;
    font-weight: 500;
    letter-spacing: 0.02em;
  }

  .ops-device {
    color: var(--text-secondary);
    font-size: 12px;
  }

  .ops-usage {
    display: flex;
    flex-direction: column;
    gap: 5px;
  }

  .ops-usage-text {
    color: var(--text-secondary);
    font-size: 12px;
  }

  .ops-track {
    display: block;
    width: 100%;
    height: 5px;
    overflow: hidden;
    background: var(--surface-2);
    border-radius: 999px;
  }

  .ops-fill {
    display: block;
    height: 100%;
    background: var(--brand);
    border-radius: inherit;
    transition: width 0.3s ease;
  }

  .ops-fill.tone-warning {
    background: var(--warning);
  }

  .ops-fill.tone-danger {
    background: var(--danger);
  }

  .ops-mobile {
    padding: 0 0 4px;
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

  .ops-sub {
    color: var(--text-muted);
    font-size: 11.5px;
  }
</style>
