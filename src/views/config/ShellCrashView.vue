<template>
  <div class="page">
    <PageHeader title="ShellCrash 设置" description="服务控制、核心设置、端口占用、覆写文件、订阅与自愈记录">
      <el-button :icon="RefreshCw" :loading="refreshing" @click="refresh">刷新</el-button>
      <el-button
        v-if="pendingCount"
        type="primary"
        :icon="Save"
        :loading="saving"
        :disabled="busy"
        @click="saveConfig"
      >
        保存（{{ pendingCount }}）
      </el-button>
    </PageHeader>

    <el-alert v-if="error" type="error" :title="error?.message || '操作失败'" :closable="false" show-icon />

    <!-- 长任务进度：重启服务、订阅热更新 -->
    <div v-if="task" class="task-banner">
      <div class="task-head">
        <span class="task-title">{{ task.title }}</span>
        <span class="task-hint">{{ task.hint }}</span>
      </div>
      <div class="task-track">
        <span class="task-fill" :style="{ width: `${task.percent}%` }" />
      </div>
      <span class="task-elapsed mono num">已等待 {{ task.elapsed }} 秒</span>
    </div>

    <!-- 改动已经落盘，但需要重启才生效 -->
    <el-alert
      v-if="restartNeeded && !task"
      type="warning"
      title="改动已经写进配置文件，重启 ShellCrash 后才会生效"
      :closable="false"
      show-icon
    >
      <div class="alert-row">
        <span class="alert-hint">重启期间代理会短暂中断，核心会重新拉取订阅并重建防火墙规则</span>
        <el-button size="small" type="warning" plain :loading="restarting" @click="restartNow">
          立即重启
        </el-button>
      </div>
    </el-alert>

    <template v-if="loaded">
      <div class="grid grid-4">
        <StatCard
          label="运行状态"
          :value="status.running ? '运行中' : '已停止'"
          :meta="statusMeta"
          :icon="status.running ? ShieldCheck : ShieldOff"
          :tone="status.running ? 'success' : 'danger'"
        />
        <StatCard
          label="核心版本"
          :value="status.core_version"
          :meta="`ShellCrash ${status.shellcrash_version}`"
          :icon="Cpu"
          tone="brand"
        />
        <StatCard
          label="当前模式"
          :value="modeLabel"
          :meta="`DNS ${status.dns_mod || '—'} · 防火墙 ${status.firewall_mod || '—'}`"
          :icon="Network"
          tone="warning"
        />
        <StatCard
          label="订阅数"
          :value="subs.count"
          :meta="subsMeta"
          :icon="Link2"
          tone="neutral"
        />
      </div>

      <!-- 内核更新 -->
      <PanelCard
        title="内核更新"
        subtitle="对比已安装内核、GitHub 最新版与 ShellCrash 自己的版本表"
      >
        <template #actions>
          <StatusBadge :label="coreCheckBadge.label" :tone="coreCheckBadge.tone" :dot="false" />
          <el-button
            size="small"
            :icon="RefreshCw"
            :loading="coreCheckLoading"
            :disabled="coreCheckLoading"
            @click="loadCoreCheck(true)"
          >
            检查更新
          </el-button>
        </template>

        <div class="crash-grid">
          <div class="crash-cell">
            <span class="crash-label">已安装（ShellCrash 记录）</span>
            <span class="crash-value mono">
              {{ status.core_version || coreCheck.installed || '—' }}
            </span>
            <span
              v-if="coreCheck.binary && coreCheck.binary !== coreCheck.installed"
              class="crash-hint"
            >
              二进制实际为 {{ coreCheck.binary }}
            </span>
          </div>
          <div class="crash-cell">
            <span class="crash-label">GitHub 最新版</span>
            <span class="crash-value mono">
              {{ coreCheck.latest || '—' }}
              <a
                v-if="coreCheck.release_url"
                class="release-link"
                :href="coreCheck.release_url"
                target="_blank"
                rel="noopener"
              >
                Release
              </a>
            </span>
            <span class="crash-hint">
              {{ coreCheck.latest_ok ? 'MetaCubeX/mihomo' : '暂时读取不到' }}
            </span>
          </div>
          <div class="crash-cell">
            <span class="crash-label">ShellCrash 版本表</span>
            <span class="crash-value mono">{{ coreCheck.listed || '—' }}</span>
            <span class="crash-hint">
              {{ coreCheck.listed_ok ? 'ShellCrash 菜单会提供的版本' : '暂时读取不到' }}
            </span>
          </div>
        </div>

        <el-alert
          v-if="coreUpdateAlert"
          class="core-alert"
          :type="coreUpdateAlert.tone"
          :title="coreUpdateAlert.title"
          :description="coreUpdateAlert.description"
          :closable="false"
          show-icon
        />

        <p class="card-note">
          最后检查 {{ formatEpoch(coreCheck.checked_at) }}
          <span v-if="coreCheck.cached" class="muted">· 来自一小时缓存</span>
          <span v-if="coreCheck.stale" class="muted">· 部分数据来自上次检查</span>
        </p>

        <p v-if="coreCheck.update_available" class="card-note">
          更新内核请在路由器上执行：<code class="mono">sh /etc/ShellCrash/start.sh restart</code>
          才会用新内核重建配置；<code class="mono">/etc/init.d/shellcrash restart</code>
          会留下第二个核心。手动替换时保留 <code class="mono">CrashCore.upx</code> 的压缩布局与
          <code class="mono">configs/command.env</code>，更新后确认只有一个
          <code class="mono">CrashCore</code> 进程、7890/7892/1053 都在监听。
        </p>
      </PanelCard>

      <!-- 服务控制 -->
      <PanelCard title="服务控制" subtitle="启动、停止、重启 ShellCrash 与开机自启">
        <template #actions>
          <StatusBadge
            :label="status.running ? '运行中' : '已停止'"
            :tone="status.running ? 'success' : 'danger'"
          />
        </template>

        <div class="service-row">
          <div class="service-buttons">
            <el-button
              type="primary"
              :icon="Play"
              :disabled="busy || status.running"
              @click="runService('start', '启动 ShellCrash 服务？核心会重新拉取订阅并重建规则，代理会短暂中断。')"
            >
              启动
            </el-button>
            <el-button
              type="danger"
              plain
              :icon="Square"
              :disabled="busy || !status.running"
              @click="runService('stop', '停止 ShellCrash 服务？代理会立即中断，所有设备的代理流量都会恢复直连。')"
            >
              停止
            </el-button>
            <el-button
              :icon="RefreshCw"
              :loading="restarting"
              :disabled="busy"
              @click="runService('restart', '重启 ShellCrash 服务？重启期间代理会短暂中断，核心会重新拉取订阅并重建规则。')"
            >
              重启
            </el-button>
          </div>

          <div class="service-switch">
            <div class="switch-copy">
              <span class="switch-label">开机自启</span>
              <span class="switch-hint">重启路由器后自动拉起 ShellCrash</span>
            </div>
            <div class="switch-side">
              <StatusBadge
                :label="status.autostart ? '已开启' : '已关闭'"
                :tone="status.autostart ? 'success' : 'neutral'"
                :dot="false"
              />
              <el-switch
                :model-value="status.autostart"
                :loading="busy"
                :disabled="busy"
                @update:model-value="toggleAutostart(Boolean($event))"
              />
            </div>
          </div>
        </div>

        <p class="card-note">
          服务动作由路由器后台执行，核心要重新下载配置，通常需要几十秒。执行期间页面会显示进度，
          结束后本页状态会自动刷新，不用手点刷新。
        </p>
      </PanelCard>

      <!-- 核心设置 -->
      <PanelCard title="核心设置" subtitle="ShellCrash.cfg 的白名单配置项，保存后需重启生效">
        <template #actions>
          <StatusBadge
            :label="pendingCount ? `待保存 ${pendingCount} 项` : '已保存'"
            :tone="pendingCount ? 'warning' : 'success'"
            :dot="false"
          />
        </template>

        <DraftNotice :dirty="draftDirty" :saved-at="draftSavedAt" @discard="discardChanges" />

        <div class="setting-list">
          <div v-for="item in settingItems" :key="item.key" class="setting-row">
            <div class="setting-copy">
              <span class="setting-label">
                {{ item.label }}
                <code class="setting-key mono">{{ item.key }}</code>
              </span>
              <span v-if="item.hint" class="setting-hint">{{ item.hint }}</span>
            </div>

            <div class="setting-control">
              <el-switch
                v-if="item.type === 'switch'"
                :model-value="isOn(formValue(item.key))"
                :disabled="busy || item.readonly"
                @update:model-value="setDraft(item.key, $event ? 'ON' : 'OFF')"
              />
              <el-select
                v-else-if="item.type === 'select'"
                :model-value="formValue(item.key)"
                :disabled="busy || item.readonly"
                size="small"
                class="setting-select"
                @update:model-value="setDraft(item.key, String($event))"
              >
                <el-option
                  v-for="option in item.options"
                  :key="option.value"
                  :label="option.label"
                  :value="option.value"
                />
              </el-select>
              <el-input-number
                v-else-if="item.type === 'number'"
                :key="`num-${item.key}-${draftEpoch}`"
                :model-value="Number(formValue(item.key) || 0)"
                :min="item.min ?? 0"
                :max="item.max ?? 99"
                :disabled="busy || item.readonly"
                size="small"
                class="setting-number"
                @update:model-value="setDraft(item.key, String($event ?? 0))"
              />
              <el-input
                v-else-if="item.type === 'text'"
                :model-value="formValue(item.key)"
                :disabled="busy || item.readonly"
                size="small"
                class="setting-text"
                @update:model-value="setDraft(item.key, String($event ?? ''))"
              />
              <span v-else class="setting-value mono">{{ formValue(item.key) || '—' }}</span>

              <StatusBadge
                v-if="isPending(item.key)"
                label="待保存"
                tone="warning"
                :dot="false"
              />
            </div>
          </div>
        </div>

        <p class="card-note">
          改动先存在本地草稿里，刷新页面不会丢；点「保存」才写进路由器。写入前路由器会把原文件备份为
          <code class="mono">ShellCrash.cfg.bak-&lt;时间戳&gt;</code>，写完需要重启 ShellCrash 才会生效。
        </p>
      </PanelCard>

      <!-- 端口占用 -->
      <PanelCard title="端口占用" subtitle="路由器上这五个端口有没有进程在监听">
        <template #actions>
          <StatusBadge
            :label="status.running ? '核心在运行' : '核心已停止'"
            :tone="status.running ? 'success' : 'warning'"
          />
        </template>

        <ScPortGrid :ports="portEntries" :configured="configuredPorts" />

        <p class="card-note">
          数据来自 <code class="mono">netstat -lntp</code>。核心没有运行时这些端口不会被监听，
          页面会标成「未监听」；端口号可以在「核心设置」之外通过
          <code class="mono">/etc/ShellCrash/yamls/config.yaml</code> 调整，改完要重启。
        </p>
        <p class="card-note">
          运行配置里的端口：mixed {{ status.ports.mixed || '—' }} · redir {{ status.ports.redir || '—' }} ·
          tproxy {{ status.ports.tproxy || '—' }} · socks {{ status.ports.socks || '—' }} ·
          dns {{ status.ports.dns || '—' }} · controller {{ status.ports.controller || '—' }}
        </p>
      </PanelCard>

      <!-- 覆写设置 -->
      <PanelCard title="覆写设置" subtitle="/etc/ShellCrash/yamls 下的覆写文件，停用后重启即不再合并">
        <template #actions>
          <StatusBadge
            :label="overrides.global_disabled ? '全局已禁用' : '正常'"
            :tone="overrides.global_disabled ? 'warning' : 'success'"
          />
        </template>

        <div v-if="overrides.files.length" class="desktop-only">
          <el-table :data="overrides.files" style="width: 100%">
            <el-table-column label="文件" min-width="150">
              <template #default="{ row }">
                <div class="table-primary mono">{{ row.name }}</div>
                <div class="table-sub">{{ row.summary || '（文件头没有说明）' }}</div>
              </template>
            </el-table-column>
            <el-table-column label="大小 / 行数" width="120">
              <template #default="{ row }">
                <span class="table-mono num">{{ formatBytes(row.size) }}</span>
                <div class="table-sub-tight num">{{ row.lines }} 行</div>
              </template>
            </el-table-column>
            <el-table-column label="修改时间" width="160">
              <template #default="{ row }">
                <span class="table-mono">{{ row.mtime || '—' }}</span>
              </template>
            </el-table-column>
            <el-table-column label="生效状态" width="130">
              <template #default="{ row }">
                <StatusBadge
                  :label="overrideStateLabel(row)"
                  :tone="overrideStateTone(row)"
                  :dot="false"
                />
              </template>
            </el-table-column>
            <el-table-column label="启用" width="90">
              <template #default="{ row }">
                <el-switch
                  :model-value="row.enabled"
                  :disabled="busy || row.state === 'missing'"
                  @update:model-value="toggleOverride(row, Boolean($event))"
                />
              </template>
            </el-table-column>
          </el-table>
        </div>

        <div v-if="overrides.files.length" class="mobile-only mobile-list">
          <div v-for="row in overrides.files" :key="row.name" class="mobile-row">
            <div class="mobile-row-head">
              <strong class="mono truncate">{{ row.name }}</strong>
              <el-switch
                :model-value="row.enabled"
                :disabled="busy || row.state === 'missing'"
                @update:model-value="toggleOverride(row, Boolean($event))"
              />
            </div>
            <div class="mobile-line">
              <span>用途</span>
              <span>{{ row.summary || '（文件头没有说明）' }}</span>
            </div>
            <div class="mobile-line">
              <span>大小 / 行数</span>
              <span class="mono">{{ formatBytes(row.size) }} · {{ row.lines }} 行</span>
            </div>
            <div class="mobile-line">
              <span>修改时间</span>
              <span class="mono">{{ row.mtime || '—' }}</span>
            </div>
            <div class="mobile-line">
              <span>生效状态</span>
              <span>
                <StatusBadge
                  :label="overrideStateLabel(row)"
                  :tone="overrideStateTone(row)"
                  :dot="false"
                />
              </span>
            </div>
          </div>
        </div>

        <EmptyState
          v-if="!overrides.files.length"
          :icon="FileStack"
          title="没有覆写文件"
          description="/etc/ShellCrash/yamls 下没有可管理的覆写文件，核心会直接使用订阅生成的配置。"
        />

        <div class="override-global">
          <div class="switch-copy">
            <span class="switch-label">全局禁用覆写</span>
            <span class="switch-hint">
              开启后核心直接使用基础配置文件，yamls 目录下的所有覆写都不会合并（保存后需重启生效）
            </span>
          </div>
          <div class="switch-side">
            <StatusBadge
              :label="isPending('disoverride') ? '待保存' : '已保存'"
              :tone="isPending('disoverride') ? 'warning' : 'success'"
              :dot="false"
            />
            <el-switch
              :model-value="isOn(formValue('disoverride'))"
              :disabled="busy"
              @update:model-value="setDraft('disoverride', $event ? '1' : '0')"
            />
          </div>
        </div>

        <p class="card-note">
          ShellCrash 在启动时按文件是否存在合并：<code class="mono">xxx.yaml</code> 存在即生效，
          <code class="mono">xxx.yaml.bak</code> 存在即停用。停用某个覆写文件会把文件改名成
          <code class="mono">.bak</code>，重新启用会改回来，整个过程可逆；改完都要重启才生效。
        </p>
      </PanelCard>

      <!-- 订阅 -->
      <PanelCard title="订阅" subtitle="订阅源与机场提供方，令牌不会显示在页面上">
        <template #actions>
          <el-button
            size="small"
            :icon="Download"
            :loading="subUpdateBusy"
            :disabled="busy || !status.running || subUpdateRunning"
            @click="updateSubscription"
          >
            {{ subUpdateRunning ? '更新中…' : '立即更新订阅' }}
          </el-button>
        </template>

        <div v-if="subs.subs.length" class="sub-grid">
          <ScSubscriptionCard
            v-for="sub in subs.subs"
            :key="sub.index"
            :title="sub.source || `订阅 ${sub.index}`"
            :alias="subs.alias"
            :source="sourceLabel(sub)"
            :entries="sub.entries"
            :masked="sub.masked"
            :enabled="sub.enabled"
          />
        </div>

        <div v-if="subs.providers.length" class="provider-list">
          <div class="provider-title">机场提供方</div>
          <div class="provider-grid">
            <ScSubscriptionCard
              v-for="row in subs.providers"
              :key="row.name"
              :title="row.name"
              :alias="subs.alias"
              :source="`更新源 ID ${subs.url_id || '—'}`"
              :entries="row.entries"
              :masked="row.masked"
              :enabled="row.enabled"
            />
          </div>
        </div>

        <EmptyState
          v-if="!subs.subs.length && !subs.providers.length"
          :icon="Link2"
          title="没有订阅"
          description="ShellCrash.cfg 里没有配置订阅链接，也没有机场提供方，核心只能使用本地覆写文件。"
        />

        <dl v-if="subs.subs.length || subs.providers.length" class="sub-summary">
          <div class="kv">
            <dt>运行配置里的节点</dt>
            <dd>{{ subs.node_count }} 个（其中自定义 {{ subs.custom_count }} 个）</dd>
          </div>
          <div class="kv">
            <dt>更新源</dt>
            <dd>{{ subs.update_source || '—' }}<span v-if="subs.url_id" class="muted"> · ID {{ subs.url_id }}</span></dd>
          </div>
        </dl>

        <pre v-if="subUpdateLines.length" class="log-view mono">{{ subUpdateLines.join('\n') }}</pre>

        <p class="card-note">
          「立即更新订阅」执行的是 ShellCrash 自带的 <code class="mono">task.sh hotupdate</code>：
          重新下载订阅、重建运行配置并推送给正在运行的核心，不会中断代理，但需要核心处于运行状态。
        </p>
      </PanelCard>

      <!-- 自愈历史 -->
      <PanelCard title="自愈历史" subtitle="CrashCore 拉起、运行配置回退修复与守护动作">
        <template #actions>
          <StatusBadge :label="`${heal.entries.length} 条记录`" tone="neutral" :dot="false" />
        </template>

        <ScHealList v-if="heal.entries.length" :entries="heal.entries" />

        <EmptyState
          v-else
          :icon="ShieldCheck"
          title="还没有自愈记录"
          description="守护脚本 guardian.sh 每 5 分钟检查一次核心，只有在核心被 OOM 杀掉、出口被改或运行配置回退时才会留下记录。"
        />
      </PanelCard>

      <!-- 日志 -->
      <PanelCard title="运行日志" subtitle="ShellCrash 与守护脚本的日志尾部">
        <template #actions>
          <el-select
            v-if="log.files.length"
            v-model="logFile"
            size="small"
            class="log-select"
            @change="loadLog"
          >
            <el-option
              v-for="file in log.files"
              :key="file.path"
              :label="file.name"
              :value="file.path"
            />
          </el-select>
          <el-button size="small" :icon="RefreshCw" :loading="loadingLog" @click="loadLog">
            刷新日志
          </el-button>
        </template>

        <div class="crash-grid">
          <div class="crash-cell">
            <span class="crash-label">核心进程</span>
            <span class="crash-value">
              <StatusBadge
                :label="crash.running ? `运行中 (PID ${crash.pid})` : '已停止'"
                :tone="crash.running ? 'success' : 'danger'"
              />
            </span>
          </div>
          <div class="crash-cell">
            <span class="crash-label">运行时长</span>
            <span class="crash-value num mono">{{ formatDuration(crash.uptime) }}</span>
          </div>
          <div class="crash-cell">
            <span class="crash-label">守护探活</span>
            <span class="crash-value num mono">
              {{ crash.alive_age >= 0 ? `${crash.alive_age} 秒前` : '—' }}
            </span>
          </div>
          <div class="crash-cell">
            <span class="crash-label">上次回退修复</span>
            <span class="crash-value num mono">{{ formatEpoch(crash.last_fallback_heal) }}</span>
          </div>
          <div class="crash-cell">
            <span class="crash-label">自启失败标记</span>
            <span class="crash-value">
              <StatusBadge
                :label="crash.start_error ? '存在' : '无'"
                :tone="crash.start_error ? 'danger' : 'success'"
                :dot="false"
              />
            </span>
          </div>
          <div class="crash-cell crash-cron">
            <span class="crash-label">守护定时任务</span>
            <span class="crash-value mono small">{{ crash.guardian_cron || '未注册' }}</span>
          </div>
        </div>

        <pre class="log-view mono">{{ log.lines.join('\n') || '暂无日志' }}</pre>
      </PanelCard>

      <p class="page-note">
        所有写操作都会在路由器上留下备份：配置为 ShellCrash.cfg.bak-&lt;时间戳&gt;，
        覆写文件为 xxx.yaml.bak。回滚时把备份改回原名即可。
      </p>
    </template>

    <div v-else class="card">
      <div class="card-body">
        <el-skeleton :rows="6" animated />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
  import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
  import { ElMessage, ElMessageBox } from 'element-plus'
  import {
    Cpu,
    Download,
    FileStack,
    Link2,
    Network,
    Play,
    RefreshCw,
    Save,
    ShieldCheck,
    ShieldOff,
    Square
  } from 'lucide-vue-next'
  import PageHeader from '@/components/PageHeader.vue'
  import PanelCard from '@/components/PanelCard.vue'
  import StatCard from '@/components/StatCard.vue'
  import StatusBadge from '@/components/StatusBadge.vue'
  import EmptyState from '@/components/EmptyState.vue'
  import DraftNotice from '@/components/DraftNotice.vue'
  import ScPortGrid from '@/components/config-sc/ScPortGrid.vue'
  import ScHealList from '@/components/config-sc/ScHealList.vue'
  import ScSubscriptionCard from '@/components/config-sc/ScSubscriptionCard.vue'
  import { useDraft, useUnsavedGuard } from '@/composables/useDraft'
  import { useRefreshSignal } from '@/composables/useRefresh'
  import {
    fetchShellCrashConfig,
    fetchShellCrashCoreCheck,
    fetchShellCrashCrash,
    fetchShellCrashHeal,
    fetchShellCrashLog,
    fetchShellCrashOverrides,
    fetchShellCrashPorts,
    fetchShellCrashStatus,
    fetchShellCrashSubs,
    fetchShellCrashSubUpdate,
    runShellCrashService,
    startShellCrashSubUpdate,
    toggleShellCrashOverride,
    writeShellCrashConfig,
    type ShellCrashCoreCheck,
    type ShellCrashCrashResult,
    type ShellCrashHealResult,
    type ShellCrashLogResult,
    type ShellCrashOverrideEntry,
    type ShellCrashPortsResult,
    type ShellCrashStatus,
    type ShellCrashSubsResult,
    type ShellCrashSubscription
  } from '@/api/shellcrashConfig'

  defineOptions({ name: 'ShellCrashView' })

  interface SettingItem {
    key: string
    label: string
    type: 'switch' | 'select' | 'number' | 'text' | 'readonly'
    hint?: string
    readonly?: boolean
    options?: Array<{ label: string; value: string }>
    min?: number
    max?: number
  }

  interface RunningTask {
    title: string
    hint: string
    startedAt: number
    elapsed: number
    percent: number
  }

  /**
   * A change that is already written to the router but needs a restart. It is
   * kept in the browser storage, so the notice survives a page reload and the
   * user still sees that a restart is pending.
   */
  interface PendingRestart {
    /** Epoch milliseconds of the change. */
    at: number
    /** The override files that were toggled. */
    files: string[]
  }

  const PENDING_KEY = 'owrt-shellcrash:pending-restart'

  function readPending(): PendingRestart | null {
    try {
      const raw = localStorage.getItem(PENDING_KEY)
      if (!raw) return null
      const parsed = JSON.parse(raw) as PendingRestart
      if (!parsed || typeof parsed.at !== 'number') return null
      return { at: parsed.at, files: Array.isArray(parsed.files) ? parsed.files : [] }
    } catch {
      return null
    }
  }

  const status = ref<ShellCrashStatus>({
    ok: true,
    installed: true,
    running: false,
    service_status: '',
    pid: 0,
    core_version: '',
    shellcrash_version: '',
    redir_mod: '',
    dns_mod: '',
    firewall_mod: '',
    ports: { mixed: 0, redir: 0, tproxy: 0, socks: 0, dns: 0, controller: 0 },
    subs_count: 0,
    autostart: false,
    last_action: ''
  })
  const overrides = ref<{ ok: boolean; files: ShellCrashOverrideEntry[]; global_disabled: boolean }>({
    ok: true,
    files: [],
    global_disabled: false
  })
  const subs = ref<ShellCrashSubsResult>({
    ok: true,
    count: 0,
    url_count: 0,
    provider_count: 0,
    url_id: '',
    update_source: '',
    update_url: '',
    alias: '',
    node_count: 0,
    custom_count: 0,
    subs: [],
    providers: []
  })
  const log = ref<ShellCrashLogResult>({ ok: true, file: '', lines: [], files: [] })
  const crash = ref<ShellCrashCrashResult>({
    ok: true,
    running: false,
    pid: 0,
    core_version: '',
    start_time: 0,
    uptime: 0,
    alive_ts: 0,
    alive_age: -1,
    probe_ts: 0,
    last_fallback_heal: 0,
    start_error: false,
    guardian_cron: '',
    guardian_log: []
  })
  const portEntries = ref<ShellCrashPortsResult['ports']>([])
  const heal = ref<ShellCrashHealResult>({ ok: true, entries: [] })
  const coreCheck = ref<ShellCrashCoreCheck>({
    ok: true,
    installed: '',
    binary: '',
    latest: '',
    listed: '',
    latest_ok: false,
    listed_ok: false,
    update_available: false,
    shellcrash_behind: false,
    release_url: '',
    checked_at: 0,
    cached: false,
    stale: false,
    error: ''
  })
  const coreCheckLoading = ref(false)

  /** The values as they are on the router right now. */
  const baseline = ref<Record<string, string>>({})
  /** The changes the user made and did not save yet. */
  const draftState = useDraft<Record<string, string>>('shellcrash-core', {})
  const draftValue = draftState.value
  const draftSavedAt = draftState.savedAt
  const clearDraft = draftState.clear

  const loaded = ref(false)
  const error = ref<Error | null>(null)
  const refreshing = ref(false)
  const busy = ref(false)
  const saving = ref(false)
  const restarting = ref(false)
  const loadingLog = ref(false)
  const pendingRestart = ref<PendingRestart | null>(readPending())
  const logFile = ref('')
  const task = ref<RunningTask | null>(null)
  const subUpdateBusy = ref(false)
  const subUpdateRunning = ref(false)
  const subUpdateLines = ref<string[]>([])
  /**
   * Bumped whenever the draft is reset. The number input keeps its own value
   * while it has focus, so it is remounted to show the restored value.
   */
  const draftEpoch = ref(0)

  const refreshSignal = useRefreshSignal()

  /** A restart is needed before the saved changes take effect. */
  const restartNeeded = computed(() => pendingRestart.value !== null)
  /** The override files that were toggled since the last restart. */
  const touchedOverrides = computed(() => pendingRestart.value?.files ?? [])

  watch(
    pendingRestart,
    (value) => {
      try {
        if (value) localStorage.setItem(PENDING_KEY, JSON.stringify(value))
        else localStorage.removeItem(PENDING_KEY)
      } catch {
        // A full storage must never break the page.
      }
    },
    { deep: true }
  )

  /* ---------------------------------------------------------------- data */

  const settingItems = computed<SettingItem[]>(() => [
    {
      key: 'redir_mod',
      label: '代理模式',
      type: 'select',
      hint: 'Redir 只劫持 TCP，Tproxy 支持 UDP，Mix 同时接管两者',
      options: [
        { label: 'Redir（仅 TCP）', value: 'Redir' },
        { label: 'Tproxy（TCP + UDP）', value: 'Tproxy' },
        { label: 'Mix（混合）', value: 'Mix' },
        { label: 'Tun（虚拟网卡）', value: 'Tun' }
      ]
    },
    {
      key: 'dns_mod',
      label: 'DNS 模式',
      type: 'select',
      hint: 'redir_host 劫持 53 端口，fake-ip 走 fake-ip 模式',
      options: [
        { label: 'redir_host（劫持 53）', value: 'redir_host' },
        { label: 'redir_host_ipv6（劫持 53 + IPv6）', value: 'redir_host_ipv6' },
        { label: 'fake-ip', value: 'fake-ip' },
        { label: 'mix', value: 'mix' },
        { label: 'route', value: 'route' }
      ]
    },
    {
      key: 'firewall_mod',
      label: '防火墙实现',
      type: 'select',
      hint: 'nftables 与 iptables 二选一，切换后必须重启',
      options: [
        { label: 'nftables', value: 'nftables' },
        { label: 'iptables', value: 'iptables' }
      ]
    },
    {
      key: 'firewall_area',
      label: '防火墙区域',
      type: 'number',
      hint: '1 本机代理 / 2 旁路由 / 3 主路由 / 4 纯模式 / 5 主旁转发',
      min: 1,
      max: 5
    },
    {
      key: 'release_type',
      label: '更新通道',
      type: 'select',
      hint: '决定从哪个分支拉取 ShellCrash 与内核',
      options: [
        { label: 'dev（开发版）', value: 'dev' },
        { label: 'stable（稳定版）', value: 'stable' },
        { label: 'master（正式版）', value: 'master' }
      ]
    },
    { key: 'my_alias', label: '命令别名', type: 'text', hint: 'SSH 登录后用来调用 ShellCrash 菜单的别名' },
    { key: 'cn_ip_route', label: '国内 IP 绕过', type: 'switch', hint: '国内地址直连，不走代理' },
    { key: 'cn_ipv6_route', label: '国内 IPv6 绕过', type: 'switch' },
    { key: 'ipv6_support', label: 'IPv6 支持', type: 'switch' },
    { key: 'ipv6_redir', label: 'IPv6 代理', type: 'switch', hint: '把 IPv6 流量也交给核心接管' },
    { key: 'ipv6_dns', label: 'IPv6 DNS', type: 'switch' },
    { key: 'hosts_opt', label: '自定义 hosts', type: 'switch', hint: '把路由器 hosts 写入核心' },
    { key: 'dns_protect', label: 'DNS 保护', type: 'switch', hint: '防止 DNS 污染与泄漏' },
    { key: 'sniffer', label: '流量嗅探', type: 'switch', hint: '从 TLS 流量里还原域名，提升分流精度' },
    { key: 'quic_rj', label: '拒绝 QUIC', type: 'switch', hint: '阻断 QUIC，回落到 TCP，避免 UDP 泄漏' },
    { key: 'ecs_subnet', label: 'ECS 优化', type: 'switch', hint: '使用 EDNS Client Subnet 提升 CDN 命中率' },
    { key: 'core_v', label: '内核版本', type: 'readonly', hint: '由更新脚本维护' },
    { key: 'crashcore', label: '内核类型', type: 'readonly', hint: '由安装脚本维护' },
    { key: 'url_id', label: '更新源 ID', type: 'readonly', hint: 'ShellCrash 更新服务器编号' },
    { key: 'hostdir', label: '面板地址', type: 'readonly', hint: '外部控制面板的监听路径' }
  ])

  /** The pending edits. The draft only holds the keys the user changed. */
  const pendingCount = computed(() => Object.keys(draftValue.value).length)
  const draftDirty = computed(() => pendingCount.value > 0)

  useUnsavedGuard(draftDirty, 'ShellCrash 核心设置还有未保存的修改')

  const modeLabel = computed(() => {
    const mode = status.value.redir_mod
    if (!mode) return '—'
    if (mode.toLowerCase() === 'tproxy') return 'TProxy'
    if (mode.toLowerCase() === 'mix') return 'Mix'
    if (mode.toLowerCase() === 'tun') return 'TUN'
    return mode
  })

  const statusMeta = computed(() => {
    if (!status.value.running) return '核心进程未运行'
    const parts = [`PID ${status.value.pid}`]
    const service = status.value.service_status
    if (service && service !== 'unknown' && service !== 'inactive') {
      parts.push(`服务 ${service}`)
    } else if (service === 'inactive') {
      // The init script runs in conservative mode: the core is started by
      // ShellCrash's own start script, so the procd instance stays inactive
      // even while the core is up. Saying that is more useful than showing
      // a bare "inactive".
      parts.push('由 ShellCrash 直接拉起')
    }
    return parts.join(' · ')
  })

  const subsMeta = computed(() => {
    if (!subs.value.count) return '没有配置订阅'
    const parts: string[] = []
    if (subs.value.url_count) parts.push(`${subs.value.url_count} 个订阅链接`)
    if (subs.value.provider_count) parts.push(`${subs.value.provider_count} 个机场提供方`)
    parts.push(`${subs.value.node_count} 个节点`)
    return parts.join(' · ')
  })

  const coreCheckBadge = computed<{
    label: string
    tone: 'success' | 'warning' | 'neutral'
  }>(() => {
    if (coreCheckLoading.value) return { label: '检查中', tone: 'neutral' }
    if (!coreCheck.value.latest_ok) return { label: '无法检查', tone: 'warning' }
    if (coreCheck.value.update_available) return { label: '有新内核', tone: 'warning' }
    return { label: '已是最新', tone: 'success' }
  })

  /** The one explanation that fits the three versions, or null when calm. */
  const coreUpdateAlert = computed<{
    tone: 'warning' | 'info'
    title: string
    description: string
  } | null>(() => {
    const check = coreCheck.value
    if (!check.latest_ok) {
      if (coreCheckLoading.value) return null
      return {
        tone: 'warning',
        title: '暂时无法获取 GitHub 上的最新内核',
        description:
          check.error || '路由器连不上 GitHub 或 ShellCrash 版本表，请检查代理后重试。'
      }
    }
    if (!check.update_available) return null
    if (!check.listed_ok) {
      return {
        tone: 'info',
        title: `GitHub 已有 ${check.latest}`,
        description: 'ShellCrash 版本表暂时读取失败，无法判断菜单里是否已经提供这个版本。'
      }
    }
    if (check.shellcrash_behind) {
      return {
        tone: 'warning',
        title: `GitHub 已有 ${check.latest}，但 ShellCrash 的版本表还停在 ${check.listed}`,
        description:
          'ShellCrash 菜单只会提供版本表里的版本，所以现在在菜单里看不到这个更新。' +
          '通常是上游的自动构建任务失败或尚未发布；等版本表更新后再走 ShellCrash 自己的更新流程最稳。'
      }
    }
    return {
      tone: 'info',
      title: `有新内核 ${check.latest}`,
      description: 'ShellCrash 的版本表已经收录，可以在 ShellCrash 菜单里更新，按提示重启核心即可。'
    }
  })

  /** The port the running configuration uses for every default port. */
  const configuredPorts = computed<Record<string, number>>(() => {
    const ports = status.value.ports
    return {
      '7890': ports.mixed,
      '7892': ports.redir,
      '7893': ports.tproxy,
      '1053': ports.dns,
      '9999': ports.controller
    }
  })

  async function load(): Promise<void> {
    const [nextStatus, nextConfig, nextOverrides, nextSubs, nextCrash, nextPorts, nextHeal] =
      await Promise.all([
        fetchShellCrashStatus(),
        fetchShellCrashConfig(),
        fetchShellCrashOverrides(),
        fetchShellCrashSubs(),
        fetchShellCrashCrash(),
        fetchShellCrashPorts(),
        fetchShellCrashHeal()
      ])

    status.value = nextStatus
    overrides.value = nextOverrides
    subs.value = nextSubs
    crash.value = nextCrash
    portEntries.value = nextPorts.ports
    heal.value = nextHeal

    // A core update changes core_v; the cached comparison still describes the
    // old binary, so it is refreshed right away instead of after the TTL.
    if (
      coreCheck.value.installed &&
      nextStatus.core_version &&
      coreCheck.value.installed !== nextStatus.core_version
    ) {
      void loadCoreCheck(true)
    }

    const values: Record<string, string> = { ...nextConfig.values }
    // The global override switch is derived from the cfg, not from the
    // override list, so it is kept in sync with the file.
    values.disoverride = nextOverrides.global_disabled ? '1' : '0'
    baseline.value = values

    // A core that was started after the change already runs the new
    // configuration, so the pending restart notice can go.
    if (pendingRestart.value && nextCrash.start_time) {
      if (nextCrash.start_time * 1000 > pendingRestart.value.at) {
        pendingRestart.value = null
      }
    }
  }

  async function loadLog(): Promise<void> {
    loadingLog.value = true
    try {
      const next = await fetchShellCrashLog(logFile.value || undefined)
      log.value = next
      if (!logFile.value && next.file) logFile.value = next.file
    } catch (err) {
      error.value = err instanceof Error ? err : new Error(String(err))
    } finally {
      loadingLog.value = false
    }
  }

  /**
   * The update check talks to GitHub and is cached on the router for an hour.
   * It runs on its own so a slow or blocked GitHub never holds up the page.
   */
  async function loadCoreCheck(force = false): Promise<void> {
    if (coreCheckLoading.value) return
    coreCheckLoading.value = true
    try {
      coreCheck.value = await fetchShellCrashCoreCheck(force)
    } catch (err) {
      coreCheck.value = {
        ...coreCheck.value,
        latest_ok: false,
        cached: false,
        stale: false,
        error: messageOf(err)
      }
    } finally {
      coreCheckLoading.value = false
    }
  }

  async function refresh(): Promise<void> {
    refreshing.value = true
    try {
      await load()
      void loadCoreCheck()
      await loadLog()
      error.value = null
      loaded.value = true
    } catch (err) {
      error.value = err instanceof Error ? err : new Error(String(err))
    } finally {
      refreshing.value = false
    }
  }

  onMounted(() => void refresh())
  watch(refreshSignal, () => void refresh())

  /* ------------------------------------------------------------- helpers */

  function messageOf(err: unknown): string {
    return err instanceof Error ? err.message : String(err)
  }

  function formatBytes(size: number): string {
    if (!size) return '0 B'
    if (size < 1024) return `${size} B`
    if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`
    return `${(size / 1024 / 1024).toFixed(1)} MB`
  }

  function formatDuration(seconds: number): string {
    if (!seconds || seconds < 0) return '—'
    const days = Math.floor(seconds / 86400)
    const hours = Math.floor((seconds % 86400) / 3600)
    const minutes = Math.floor((seconds % 3600) / 60)
    if (days) return `${days} 天 ${hours} 小时`
    if (hours) return `${hours} 小时 ${minutes} 分钟`
    return `${minutes} 分钟`
  }

  function formatEpoch(epoch: number): string {
    if (!epoch) return '—'
    const date = new Date(epoch * 1000)
    const pad = (value: number) => String(value).padStart(2, '0')
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(
      date.getHours()
    )}:${pad(date.getMinutes())}`
  }

  /** The value the form shows: the pending edit, otherwise the server value. */
  function formValue(key: string): string {
    const pending = draftValue.value[key]
    if (pending !== undefined) return pending
    return baseline.value[key] ?? ''
  }

  function isPending(key: string): boolean {
    return draftValue.value[key] !== undefined
  }

  /**
   * Records one edit. A value that equals the one on the router removes the
   * key again, so the draft only holds the real differences.
   */
  function setDraft(key: string, value: string): void {
    const next = { ...draftValue.value }
    if ((baseline.value[key] ?? '') === value) delete next[key]
    else next[key] = value
    draftValue.value = next
  }

  function isOn(value: string): boolean {
    const normalized = (value || '').toUpperCase()
    return normalized === 'ON' || normalized === '1' || normalized === 'TRUE'
  }

  function labelOfKey(key: string): string {
    const item = settingItems.value.find((entry) => entry.key === key)
    return item ? `${item.label}（${key}）` : key
  }

  function sourceLabel(sub: ShellCrashSubscription): string {
    const parts: string[] = []
    if (sub.source) parts.push(sub.source)
    if (sub.url_id) parts.push(`ID ${sub.url_id}`)
    return parts.join(' · ') || '—'
  }

  function overrideStateLabel(row: ShellCrashOverrideEntry): string {
    if (row.state === 'active') {
      return touchedOverrides.value.includes(row.name) && restartNeeded.value ? '待重启生效' : '生效中'
    }
    if (row.state === 'disabled') return '已停用'
    return '文件不存在'
  }

  function overrideStateTone(row: ShellCrashOverrideEntry): 'success' | 'warning' | 'neutral' {
    if (row.state === 'active') {
      return touchedOverrides.value.includes(row.name) && restartNeeded.value ? 'warning' : 'success'
    }
    if (row.state === 'disabled') return 'neutral'
    return 'warning'
  }

  async function confirm(
    message: string,
    title: string,
    type: 'warning' | 'error' | 'info' = 'warning'
  ): Promise<boolean> {
    try {
      await ElMessageBox.confirm(message, title, {
        type,
        confirmButtonText: '继续',
        cancelButtonText: '取消',
        distinguishCancelAndClose: true
      })
      return true
    } catch {
      return false
    }
  }

  function delay(ms: number): Promise<void> {
    return new Promise((resolve) => window.setTimeout(resolve, ms))
  }

  /* --------------------------------------------------------------- tasks */

  let ticker: number | null = null
  let statusTicker: number | null = null

  function startTicker(): void {
    stopTicker()
    ticker = window.setInterval(() => {
      if (!task.value) return
      const elapsed = Math.floor((Date.now() - task.value.startedAt * 1000) / 1000)
      task.value = {
        ...task.value,
        elapsed,
        percent: Math.min(96, Math.round((elapsed / 90) * 100))
      }
    }, 1000)
    // While the router works the status card would show a stale state - a
    // restart looked like "not running" until somebody hit refresh. The
    // status is therefore pulled in the background every few seconds.
    statusTicker = window.setInterval(() => {
      if (!task.value) return
      void pullStatus()
    }, 3000)
  }

  function stopTicker(): void {
    if (ticker !== null) {
      window.clearInterval(ticker)
      ticker = null
    }
    if (statusTicker !== null) {
      window.clearInterval(statusTicker)
      statusTicker = null
    }
  }

  /** Pulls the status without touching the rest of the page. */
  async function pullStatus(): Promise<void> {
    try {
      status.value = await fetchShellCrashStatus()
    } catch {
      // The router is busy while it rebuilds the configuration, the next
      // tick tries again.
    }
  }

  /**
   * Keeps the status card in sync with the router after an action. The core
   * can need a minute to come up, so the loop keeps running in the
   * background even when the action itself was already reported as done.
   */
  function keepStatusFresh(expectRunning: boolean): void {
    let rounds = 0
    const tick = async (): Promise<void> => {
      rounds += 1
      if (rounds > 60) return
      await delay(3000)
      await pullStatus()
      if (status.value.running === expectRunning) return
      void tick()
    }
    void tick()
  }

  onBeforeUnmount(() => stopTicker())

  /* -------------------------------------------------------------- actions */

  async function saveConfig(): Promise<void> {
    const pending = { ...draftValue.value }
    if (!Object.keys(pending).length) {
      ElMessage.info('没有需要保存的改动')
      return
    }

    const summary = Object.entries(pending)
      .map(([key, value]) => `${labelOfKey(key)} → ${value}`)
      .join('，')

    const ok = await confirm(
      `即将写入 ${Object.keys(pending).length} 项配置：${summary}。` +
        '写入只改配置文件，不会自动重启服务，是否继续？',
      '确认保存核心设置'
    )
    if (!ok) return

    saving.value = true
    try {
      const result = await writeShellCrashConfig(pending)
      draftValue.value = {}
      draftEpoch.value += 1
      await nextTick()
      clearDraft()
      await load()
      pendingRestart.value = { at: Date.now(), files: touchedOverrides.value }
      // The router reports what it wrote as "key=value" pairs, so the toast
      // can name the fields instead of only counting them.
      const written = (result?.changed ?? []).map((entry) => {
        const [key, ...rest] = entry.split('=')
        return `${labelOfKey(key)} → ${rest.join('=')}`
      })
      const detail = written.length ? `已写入 ${written.join('，')}；` : ''
      ElMessage.success(`${detail}${result?.message || '配置已保存，重启 ShellCrash 后生效'}`)
    } catch (err) {
      ElMessage.error(`保存配置失败：${messageOf(err)}`)
    } finally {
      saving.value = false
    }
  }

  async function discardChanges(): Promise<void> {
    draftValue.value = {}
    draftEpoch.value += 1
    await nextTick()
    clearDraft()
    ElMessage.info('已放弃未保存的修改，表单恢复为路由器上的现值')
  }

  /**
   * Waits until the router reports the service action as finished. The CGI
   * writes "<action> <rc> <timestamp>" into its state file when the action
   * is over, so the browser can tell "still running" from "done".
   * The return value is the exit code of the action, or null when the router
   * never reported back.
   */
  async function waitForServiceAction(action: string, since: number): Promise<number | null> {
    for (let round = 0; round < 90; round += 1) {
      await delay(2000)
      try {
        const next = await fetchShellCrashStatus()
        status.value = next
        const parts = (next.last_action || '').split(/\s+/)
        if (parts.length >= 3 && parts[0] === action) {
          const stamp = Number(parts[2])
          if (Number.isFinite(stamp) && stamp >= since - 10) {
            const rc = Number(parts[1])
            return Number.isFinite(rc) ? rc : 0
          }
        }
      } catch {
        // The router is busy while it rebuilds the configuration, the next
        // round tries again.
      }
    }
    return null
  }

  /**
   * The router reports the action as done when the start/stop script
   * returns, which is before the new core is up. The console waits for the
   * state itself, so a restart never leaves the page showing "not running"
   * until somebody hits refresh.
   */
  async function waitForExpectedState(action: 'start' | 'stop' | 'restart'): Promise<boolean> {
    const expectRunning = action !== 'stop'
    for (let round = 0; round < 60; round += 1) {
      if (status.value.running === expectRunning) return true
      await delay(2000)
      await pullStatus()
    }
    return status.value.running === expectRunning
  }

  async function runService(action: 'start' | 'stop' | 'restart', question: string): Promise<void> {
    const ok = await confirm(question, '确认操作 ShellCrash 服务')
    if (!ok) return

    busy.value = true
    if (action === 'restart') restarting.value = true
    const startedAt = Math.floor(Date.now() / 1000)
    task.value = {
      title: action === 'stop' ? '正在停止 ShellCrash' : action === 'start' ? '正在启动 ShellCrash' : '正在重启 ShellCrash',
      hint: '核心会重新拉取订阅并重建防火墙规则，完成后本页状态会自动刷新',
      startedAt,
      elapsed: 0,
      percent: 2
    }
    startTicker()

    try {
      await runShellCrashService(action)
      ElMessage.success('操作已提交，路由器正在执行')
      const rc = await waitForServiceAction(action, startedAt)
      const settled = await waitForExpectedState(action)
      await refresh()
      if (rc === null) {
        ElMessage.warning('路由器没有回报完成结果，请看下面的运行状态')
      } else if (rc !== 0) {
        ElMessage.error(
          action === 'stop'
            ? '停止失败，核心进程还在，请看下面的运行状态'
            : '操作失败，核心没有正常启动，请看下面的运行状态'
        )
      } else if (!settled) {
        // The core is still coming up. The page keeps polling in the
        // background, so the card catches up on its own.
        keepStatusFresh(action !== 'stop')
        ElMessage.warning(
          action === 'stop'
            ? '核心进程还在运行，页面会继续跟踪'
            : '核心还没有起来，页面会继续跟踪，请看下面的运行状态'
        )
      } else {
        if (action === 'restart') {
          pendingRestart.value = null
        }
        ElMessage.success(
          action === 'stop'
            ? 'ShellCrash 已停止'
            : action === 'start'
              ? 'ShellCrash 已启动'
              : 'ShellCrash 已重启，配置已生效'
        )
      }
    } catch (err) {
      ElMessage.error(`操作失败：${messageOf(err)}`)
    } finally {
      busy.value = false
      restarting.value = false
      task.value = null
      stopTicker()
    }
  }

  async function restartNow(): Promise<void> {
    await runService(
      'restart',
      '立即重启 ShellCrash？重启期间代理会短暂中断，核心会重新拉取订阅并重建规则。'
    )
  }

  async function toggleAutostart(enable: boolean): Promise<void> {
    const ok = await confirm(
      enable
        ? '开启开机自启？路由器重启后会通过 /etc/rc.d 自动拉起 ShellCrash。'
        : '关闭开机自启？路由器重启后不会再自动拉起 ShellCrash，需要手动或由守护脚本启动。',
      '确认修改开机自启'
    )
    if (!ok) {
      await refresh()
      return
    }

    busy.value = true
    try {
      const result = await runShellCrashService(enable ? 'enable' : 'disable')
      status.value = { ...status.value, autostart: result.autostart ?? enable }
      ElMessage.success(result.message || (enable ? '开机自启已开启' : '开机自启已关闭'))
    } catch (err) {
      ElMessage.error(`修改开机自启失败：${messageOf(err)}`)
    } finally {
      busy.value = false
    }
  }

  async function toggleOverride(row: ShellCrashOverrideEntry, enable: boolean): Promise<void> {
    const isCore = row.name === 'config.yaml'
    const ok = await confirm(
      enable
        ? `启用覆写文件 ${row.name}？重启 ShellCrash 后该文件会重新合并进运行配置。`
        : `停用覆写文件 ${row.name}？` +
          (isCore
            ? 'config.yaml 是核心的基础配置文件，停用后核心可能无法启动，需要手动改回文件名才能恢复。'
            : '重启 ShellCrash 后该文件的内容不再合并进运行配置。'),
      isCore ? '确认停用核心配置' : '确认停用覆写文件',
      isCore ? 'error' : 'warning'
    )
    if (!ok) {
      await refresh()
      return
    }

    busy.value = true
    try {
      const result = await toggleShellCrashOverride(
        row.name as Parameters<typeof toggleShellCrashOverride>[0],
        enable
      )
      await load()
      pendingRestart.value = {
        at: Date.now(),
        files: Array.from(new Set([...touchedOverrides.value, row.name]))
      }
      ElMessage.success(result.message || '覆写状态已更新，重启 ShellCrash 后生效')
    } catch (err) {
      ElMessage.error(`修改覆写状态失败：${messageOf(err)}`)
    } finally {
      busy.value = false
    }
  }

  /**
   * Runs the hot update of the online subscription. The task lives on the
   * router, so the browser only submits it and then polls the state.
   */
  async function updateSubscription(): Promise<void> {
    if (!status.value.running) {
      ElMessage.warning('核心没有运行，热更新无法把新配置推送给核心')
      return
    }
    const ok = await confirm(
      '立即更新订阅？会重新下载订阅、重建运行配置并推送给正在运行的核心。' +
        '过程中代理不会中断，但机场的订阅转换服务不稳定时可能失败。',
      '确认更新订阅'
    )
    if (!ok) return

    subUpdateBusy.value = true
    subUpdateRunning.value = true
    subUpdateLines.value = []
    const startedAt = Math.floor(Date.now() / 1000)
    task.value = {
      title: '正在更新订阅',
      hint: '正在重新下载订阅并把新配置推送给核心',
      startedAt,
      elapsed: 0,
      percent: 2
    }
    startTicker()

    try {
      await startShellCrashSubUpdate()
      ElMessage.success('订阅更新已提交，路由器正在执行')

      let finished = false
      for (let round = 0; round < 90 && !finished; round += 1) {
        await delay(2000)
        try {
          const state = await fetchShellCrashSubUpdate()
          subUpdateLines.value = state.lines ?? []
          if (state.done) {
            finished = true
            if (state.success) {
              await load()
              ElMessage.success('订阅已更新，节点已经重新加载')
            } else {
              ElMessage.error(`订阅更新失败（退出码 ${state.rc ?? 0}），下面是任务日志`)
            }
          }
        } catch {
          // The router is busy downloading, the next round tries again.
        }
      }
      if (!finished) {
        ElMessage.warning('订阅更新还没有结束，路由器可能还在下载，请稍后刷新查看')
      }
    } catch (err) {
      ElMessage.error(`订阅更新失败：${messageOf(err)}`)
    } finally {
      subUpdateBusy.value = false
      subUpdateRunning.value = false
      task.value = null
      stopTicker()
    }
  }
</script>

<style scoped>
  /* Element Plus 给相邻按钮加了 12px 左边距，和外层 flex 的 gap 叠加后
     同一行的按钮会被拉到 20px 间距；这里把间距统一交回给 gap 控制。 */
  .el-button + .el-button {
    margin-left: 0;
  }

  .task-banner {
    display: flex;
    align-items: center;
    gap: 14px;
    padding: 12px 16px;
    margin-bottom: 12px;
    background: var(--brand-soft);
    border: 1px solid color-mix(in srgb, var(--brand) 26%, transparent);
    border-radius: var(--radius);
  }

  .task-head {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 220px;
  }

  .task-title {
    color: var(--brand-text);
    font-size: var(--text-sm);
    font-weight: 600;
  }

  .task-hint {
    color: var(--text-muted);
    font-size: 11.5px;
  }

  .task-track {
    flex: 1 1 auto;
    height: 6px;
    overflow: hidden;
    background: var(--surface-2);
    border-radius: 999px;
  }

  .task-fill {
    display: block;
    height: 100%;
    background: var(--brand);
    border-radius: inherit;
    transition: width 0.4s ease;
  }

  .task-elapsed {
    flex-shrink: 0;
    color: var(--text-secondary);
    font-size: 12px;
  }

  .service-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-4);
    flex-wrap: wrap;
  }

  .service-buttons {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-2);
  }

  .service-switch {
    display: flex;
    align-items: center;
    gap: var(--space-3);
    padding: 8px 12px;
    background: var(--surface-2);
    border-radius: var(--radius);
  }

  .switch-side {
    display: flex;
    align-items: center;
    gap: 10px;
  }

  .switch-copy {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
  }

  .switch-label {
    color: var(--text);
    font-size: var(--text-sm);
    font-weight: 500;
  }

  .switch-hint {
    color: var(--text-muted);
    font-size: 11.5px;
  }

  .setting-list {
    display: flex;
    flex-direction: column;
  }

  .setting-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-4);
    padding: 10px 0;
    border-bottom: 1px solid var(--border);
  }

  .setting-row:last-child {
    border-bottom: 0;
  }

  .setting-copy {
    display: flex;
    flex-direction: column;
    gap: 3px;
    min-width: 0;
  }

  .setting-label {
    display: flex;
    align-items: center;
    gap: 8px;
    color: var(--text);
    font-size: 13px;
    font-weight: 500;
  }

  .setting-key {
    color: var(--text-faint);
    font-size: 11px;
    font-weight: 400;
  }

  .setting-hint {
    color: var(--text-muted);
    font-size: 11.5px;
    line-height: 1.5;
  }

  .setting-control {
    display: flex;
    flex-shrink: 0;
    align-items: center;
    gap: 10px;
  }

  .setting-select {
    width: 210px;
  }

  .setting-number {
    width: 120px;
  }

  .setting-text {
    width: 160px;
  }

  .setting-value {
    color: var(--text-secondary);
    font-size: 12.5px;
  }

  .table-primary {
    color: var(--text);
    font-size: var(--text-sm);
    font-weight: 500;
  }

  .table-sub {
    margin-top: 2px;
    overflow: hidden;
    color: var(--text-muted);
    font-size: 11px;
    line-height: 1.5;
    text-overflow: ellipsis;
    word-break: break-all;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
  }

  .table-sub-tight {
    color: var(--text-faint);
    font-size: 11px;
  }

  .table-mono {
    color: var(--text-secondary);
    font-size: 12px;
  }

  .sub-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
    gap: var(--space-3);
  }

  .provider-list {
    margin-top: var(--space-4);
    padding-top: var(--space-3);
    border-top: 1px solid var(--border);
  }

  .provider-title {
    margin-bottom: 8px;
    color: var(--text-muted);
    font-size: 11.5px;
  }

  .provider-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
    gap: var(--space-3);
  }

  .sub-summary {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 12px 20px;
    margin-top: var(--space-4);
    padding-top: var(--space-3);
    border-top: 1px solid var(--border);
  }

  .sub-summary dt {
    margin: 0 0 2px;
    color: var(--text-muted);
    font-size: var(--text-xs);
  }

  .sub-summary dd {
    margin: 0;
    color: var(--text);
    font-size: var(--text-sm);
    font-weight: 500;
  }

  .muted {
    color: var(--text-muted);
    font-weight: 400;
  }

  .override-global {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-4);
    margin-top: var(--space-4);
    padding: 10px 12px;
    background: var(--surface-2);
    border-radius: var(--radius);
  }

  .crash-grid {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: var(--space-3);
    margin-bottom: var(--space-4);
  }

  .crash-cell {
    display: flex;
    flex-direction: column;
    gap: 4px;
    padding: 10px 12px;
    background: var(--surface-2);
    border-radius: var(--radius);
  }

  .crash-cron {
    grid-column: 1 / -1;
  }

  .crash-label {
    color: var(--text-muted);
    font-size: 11px;
  }

  .crash-value {
    color: var(--text);
    font-size: var(--text-sm);
    font-weight: 500;
  }

  .crash-value.small {
    font-size: 11.5px;
    font-weight: 400;
    word-break: break-all;
  }

  .crash-hint {
    color: var(--text-faint);
    font-size: 11px;
    line-height: 1.5;
  }

  .release-link {
    margin-left: 6px;
    color: var(--brand-text);
    font-size: 11px;
    font-weight: 500;
    text-decoration: none;
  }

  .release-link:hover {
    text-decoration: underline;
  }

  .core-alert {
    margin-top: var(--space-3);
  }

  .log-view {
    max-height: 320px;
    margin: 0;
    padding: 12px 14px;
    overflow: auto;
    color: var(--text-secondary);
    font-size: 11.5px;
    line-height: 1.7;
    white-space: pre-wrap;
    word-break: break-all;
    background: var(--surface-2);
    border-radius: var(--radius);
  }

  .log-select {
    width: 190px;
  }

  /* 卡片头部的下拉和按钮是同一档高度（small = 30px），否则两者在
     同一行里会一高一矮。 */
  .log-select :deep(.el-select__wrapper) {
    min-height: 30px;
  }

  .alert-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-3);
    flex-wrap: wrap;
  }

  .alert-hint {
    color: var(--text-muted);
    font-size: var(--text-xs);
  }

  .card-note {
    margin-top: var(--space-3);
    color: var(--text-muted);
    font-size: var(--text-xs);
    line-height: 1.6;
  }

  .page-note {
    padding: 0 4px;
    color: var(--text-muted);
    font-size: var(--text-xs);
  }

  .mobile-list {
    padding: 4px 16px 12px;
  }

  .mobile-row {
    padding: 12px 0;
    border-bottom: 1px solid var(--border);
  }

  .mobile-row:last-child {
    border-bottom: 0;
  }

  .mobile-row-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    margin-bottom: 6px;
    color: var(--text);
    font-size: var(--text-sm);
  }

  .mobile-line {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    color: var(--text-muted);
    font-size: 11.5px;
    line-height: 1.8;
  }

  .mobile-line span:last-child {
    color: var(--text-secondary);
    text-align: right;
    word-break: break-all;
  }

  @media (max-width: 900px) {
    .crash-grid {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  }

  @media (max-width: 640px) {
    .crash-grid {
      grid-template-columns: minmax(0, 1fr);
    }

    .setting-row {
      align-items: flex-start;
      flex-direction: column;
      gap: 8px;
    }

    .setting-control {
      width: 100%;
    }

    .setting-select,
    .setting-number,
    .setting-text {
      flex: 1 1 auto;
      width: auto;
    }

    .service-switch,
    .override-global {
      width: 100%;
    }

    .service-switch,
    .override-global {
      justify-content: space-between;
    }

    .log-select {
      width: 100%;
    }

    .task-banner {
      flex-direction: column;
      align-items: stretch;
      gap: 8px;
    }

    .sub-summary {
      grid-template-columns: minmax(0, 1fr);
    }
  }
</style>
