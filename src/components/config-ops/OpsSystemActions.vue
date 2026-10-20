<template>
  <div class="ops-actions">
    <div class="ops-action-row">
      <div class="ops-action-copy">
        <p class="ops-action-title">备份配置</p>
        <p class="ops-action-desc">
          生成一份包含 UCI 配置与已安装软件包的备份文件，保存在路由器的 /tmp 目录中。
          <span v-if="backupPath" class="mono ops-backup-path">{{ backupPath }}</span>
        </p>
      </div>
      <div class="ops-action-buttons">
        <el-button type="primary" plain :loading="backingUp" @click="handleCreateBackup">
          生成备份
        </el-button>
        <el-button
          type="danger"
          plain
          :disabled="!backupPath"
          :loading="restoring"
          @click="handleRestoreBackup"
        >
          恢复此备份
        </el-button>
      </div>
    </div>

    <div class="ops-action-row">
      <div class="ops-action-copy">
        <p class="ops-action-title">重启路由器</p>
        <p class="ops-action-desc">
          重启会立即中断所有有线与无线连接，当前页面会断开，路由器预计需要 1–2 分钟恢复。
        </p>
      </div>
      <el-button type="danger" plain :loading="rebooting" @click="reboot">重启</el-button>
    </div>

    <div class="ops-action-row">
      <div class="ops-action-copy">
        <p class="ops-action-title">恢复出厂设置</p>
        <p class="ops-action-desc">
          清空全部配置、恢复默认网络参数并重启设备，所有已保存的设置都会丢失且无法撤销。
        </p>
      </div>
      <el-button type="danger" plain :loading="resetting" @click="factoryReset">恢复出厂</el-button>
    </div>

    <p class="ops-hint">
      破坏性操作需要一次性令牌，令牌 120 秒内有效且只能使用一次。
    </p>
  </div>
</template>

<script setup lang="ts">
  import { ref } from 'vue'
  import { ElMessage, ElMessageBox } from 'element-plus'
  import { BACKUP_PATH, createBackup, factoryResetRouter, rebootRouter, restoreBackup } from '@/api/ops'

  const backingUp = ref(false)
  const restoring = ref(false)
  const rebooting = ref(false)
  const resetting = ref(false)
  const backupPath = ref('')

  function messageOf(err: unknown): string {
    return err instanceof Error ? err.message : '操作失败'
  }

  async function handleCreateBackup(): Promise<void> {
    if (backingUp.value) return
    backingUp.value = true
    try {
      const path = await createBackup(BACKUP_PATH)
      backupPath.value = path
      ElMessage.success(`备份已生成：${path}`)
    } catch (err) {
      ElMessage.error(messageOf(err))
    } finally {
      backingUp.value = false
    }
  }

  async function handleRestoreBackup(): Promise<void> {
    if (!backupPath.value || restoring.value) return
    try {
      await ElMessageBox.confirm(
        `恢复备份会用 ${backupPath.value} 覆盖当前配置并重启路由器，未备份的改动全部丢失。确定继续吗？`,
        '恢复备份',
        {
          type: 'warning',
          confirmButtonText: '确认恢复',
          cancelButtonText: '取消',
          confirmButtonClass: 'el-button--danger'
        }
      )
    } catch {
      return
    }

    restoring.value = true
    try {
      await restoreBackup(backupPath.value)
      ElMessage.success('恢复指令已发送，路由器将重启')
    } catch (err) {
      ElMessage.error(messageOf(err))
    } finally {
      restoring.value = false
    }
  }

  async function reboot(): Promise<void> {
    if (rebooting.value) return
    try {
      await ElMessageBox.confirm(
        '重启会立即中断所有有线与无线连接，当前页面会断开，路由器预计需要 1–2 分钟恢复。确定继续吗？',
        '重启路由器',
        {
          type: 'warning',
          confirmButtonText: '确认重启',
          cancelButtonText: '取消',
          confirmButtonClass: 'el-button--danger'
        }
      )
    } catch {
      return
    }

    rebooting.value = true
    try {
      await rebootRouter()
      ElMessage.success('重启指令已发送，请等待路由器恢复')
    } catch (err) {
      ElMessage.error(messageOf(err))
    } finally {
      rebooting.value = false
    }
  }

  async function factoryReset(): Promise<void> {
    if (resetting.value) return
    try {
      await ElMessageBox.prompt(
        '恢复出厂设置会清空全部配置并重启设备。请输入 RESET 以继续。',
        '恢复出厂设置',
        {
          type: 'error',
          confirmButtonText: '继续',
          cancelButtonText: '取消',
          inputPlaceholder: 'RESET',
          inputPattern: /^\s*RESET\s*$/,
          inputErrorMessage: '请输入 RESET 以确认恢复出厂设置'
        }
      )
    } catch {
      return
    }

    try {
      await ElMessageBox.confirm(
        '最后确认：设备将恢复出厂默认配置并重启，所有设置都会丢失且无法撤销。确定继续吗？',
        '再次确认',
        {
          type: 'error',
          confirmButtonText: '确认恢复出厂',
          cancelButtonText: '取消',
          confirmButtonClass: 'el-button--danger'
        }
      )
    } catch {
      return
    }

    resetting.value = true
    try {
      await factoryResetRouter()
      ElMessage.success('恢复出厂指令已发送，路由器将重启')
    } catch (err) {
      ElMessage.error(messageOf(err))
    } finally {
      resetting.value = false
    }
  }
</script>

<style scoped>
  .ops-action-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 20px;
    padding: 16px 0;
    border-bottom: 1px solid var(--border);
  }

  .ops-action-row:first-child {
    padding-top: 2px;
  }

  .ops-action-row:last-of-type {
    padding-bottom: 2px;
    border-bottom: 0;
  }

  .ops-action-copy {
    min-width: 0;
  }

  .ops-action-title {
    color: var(--text);
    font-size: var(--text-sm);
    font-weight: 500;
  }

  .ops-action-desc {
    margin-top: 2px;
    color: var(--text-muted);
    font-size: var(--text-xs);
    line-height: 1.6;
  }

  .ops-backup-path {
    display: inline-block;
    margin-top: 4px;
    color: var(--text-secondary);
    font-size: 11.5px;
  }

  .ops-action-buttons {
    display: flex;
    flex-shrink: 0;
    gap: var(--space-2);
  }

  .ops-hint {
    padding-top: 14px;
    color: var(--text-faint);
    font-size: 11.5px;
    line-height: 1.6;
    border-top: 1px solid var(--border);
  }

  @media (max-width: 640px) {
    .ops-action-row {
      align-items: flex-start;
      flex-direction: column;
      gap: 10px;
    }

    .ops-action-buttons {
      flex-wrap: wrap;
      width: 100%;
    }

    .ops-action-buttons :deep(.el-button) {
      flex: 1 1 auto;
      margin-left: 0;
    }
  }
</style>
