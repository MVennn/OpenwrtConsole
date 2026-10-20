<template>
  <div class="page">
    <PageHeader title="ShellCrash 设置" description="服务控制、核心设置、覆写文件、订阅与运行日志">
      <el-button :icon="RefreshCw" :loading="refreshing" @click="refresh">刷新</el-button>
    </PageHeader>

    <el-alert v-if="error" type="error" :title="error.message" :closable="false" show-icon />

    <el-alert
      v-if="notice"
      type="warning"
      :title="notice"
      :closable="!restartPending"
      show-icon
      @close="notice = ''"
    >
      <template v-if="restartPending" #default>
        <div class="alert-row">
          <span class="alert-hint">核心需要重新加载配置才能生效</span>
          <el-button size="small" type="warning" plain :loading="restarting" @click="restartNow">
            立即重启
          </el-button>
        </div>
      </template>
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
          label="mihomo 版本"
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
              @click="runService('start', '启动 ShellCrash 服务？')"
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
            <el-switch
              :model-value="status.autostart"
              :loading="busy"
              :disabled="busy"
              @update:model-value="toggleAutostart(Boolean($event))"
            />
          </div>
        </div>

        <p class="card-note">
          服务动作由路由器后台执行，可能需要数十秒（核心会重新拉取订阅并重建防火墙规则）。
          页面会自动刷新运行状态。
        </p>
      </PanelCard>

      <!-- 核心设置 -->
      <PanelCard title="核心设置" subtitle="ShellCrash.cfg 的白名单配置项，保存后需重启生效">
        <template #actions>
          <el-button
            v-if="Object.keys(changes).length"
            size="small"
            type="danger"
            plain
            :icon="RotateCcw"
            :disabled="busy"
            @click="discardChanges"
          >
            放弃修改
          </el-button>
          <el-button
            size="small"
            type="primary"
            :icon="Save"
            :loading="saving"
            :disabled="busy || !Object.keys(changes).length"
            @click="saveConfig"
          >
            保存<template v-if="Object.keys(changes).length">（{{ Object.keys(changes).length }}）</template>
          </el-button>
        </template>

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
                :model-value="draft[item.key] === 'ON'"
                :disabled="busy || item.readonly"
                @update:model-value="setDraft(item.key, $event ? 'ON' : 'OFF')"
              />
              <el-select
                v-else-if="item.type === 'select'"
                :model-value="draft[item.key]"
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
                :model-value="Number(draft[item.key] || 0)"
                :min="item.min ?? 0"
                :max="item.max ?? 99"
                :disabled="busy || item.readonly"
                size="small"
                class="setting-number"
                @update:model-value="setDraft(item.key, String($event ?? 0))"
              />
              <el-input
                v-else-if="item.type === 'text'"
                :model-value="draft[item.key]"
                :disabled="busy || item.readonly"
                size="small"
                class="setting-text"
                @update:model-value="setDraft(item.key, String($event ?? ''))"
              />
              <span v-else class="setting-value mono">{{ draft[item.key] || '—' }}</span>

              <StatusBadge
                v-if="isChanged(item.key)"
                label="已修改"
                tone="warning"
                :dot="false"
              />
            </div>
          </div>
        </div>

        <p class="card-note">
          修改只提交改动项。写入前路由器会把原文件备份为
          <code class="mono">ShellCrash.cfg.bak-&lt;时间戳&gt;</code>，写完需要重启 ShellCrash 才会生效。
        </p>
      </PanelCard>

      <!-- 端口 -->
      <PanelCard title="监听端口" subtitle="来自 mihomo 运行配置 /tmp/ShellCrash/config.yaml，只读">
        <div class="port-grid">
          <div v-for="port in portList" :key="port.key" class="port-cell">
            <span class="port-name">{{ port.label }}</span>
            <span class="port-value num mono">{{ port.value || '—' }}</span>
            <span class="port-hint">{{ port.hint }}</span>
          </div>
        </div>
        <p class="card-note">
          端口由核心配置文件决定，修改需要在「覆写设置」里编辑 config.yaml 或 user.yaml，
          然后重启 ShellCrash。
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
                <div class="table-sub">{{ row.description || '（文件头没有说明）' }}</div>
              </template>
            </el-table-column>
            <el-table-column label="大小" width="100">
              <template #default="{ row }">
                <span class="table-mono num">{{ formatBytes(row.size) }}</span>
              </template>
            </el-table-column>
            <el-table-column label="修改时间" width="170">
              <template #default="{ row }">
                <span class="table-mono">{{ row.mtime || '—' }}</span>
              </template>
            </el-table-column>
            <el-table-column label="启用" width="90">
              <template #default="{ row }">
                <el-switch
                  :model-value="row.enabled"
                  :disabled="busy"
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
                :disabled="busy"
                @update:model-value="toggleOverride(row, Boolean($event))"
              />
            </div>
            <div class="mobile-line">
              <span>说明</span>
              <span>{{ row.description || '（文件头没有说明）' }}</span>
            </div>
            <div class="mobile-line">
              <span>大小 / 修改时间</span>
              <span class="mono">{{ formatBytes(row.size) }} · {{ row.mtime || '—' }}</span>
            </div>
          </div>
        </div>

        <EmptyState
          v-if="!overrides.files.length"
          :icon="FileStack"
          title="没有覆写文件"
          description="/etc/ShellCrash/yamls 下没有可管理的覆写文件。"
        />

        <div class="override-global">
          <div class="switch-copy">
            <span class="switch-label">全局禁用覆写</span>
            <span class="switch-hint">
              开启后核心直接使用基础配置文件，yamls 目录下的所有覆写都不会合并
            </span>
          </div>
          <el-switch
            :model-value="draft.disoverride === '1'"
            :disabled="busy"
            @update:model-value="setDraft('disoverride', $event ? '1' : '0')"
          />
        </div>

        <p class="card-note">
          停用某个覆写文件会把文件改名为 <code class="mono">xxx.yaml.bak</code>，
          重新启用会改回来，整个过程可逆。
        </p>
      </PanelCard>

      <!-- 订阅 -->
      <PanelCard title="订阅" subtitle="订阅源与机场提供方，令牌不会显示在页面上">
        <div v-if="subs.subs.length" class="desktop-only">
          <el-table :data="subs.subs" style="width: 100%">
            <el-table-column label="别名" min-width="150">
              <template #default="{ row }">
                <span class="table-primary">{{ row.alias || '—' }}</span>
              </template>
            </el-table-column>
            <el-table-column label="更新源 ID" width="120">
              <template #default="{ row }">
                <span class="table-mono num">{{ row.url_id || '—' }}</span>
              </template>
            </el-table-column>
            <el-table-column label="地址" min-width="220">
              <template #default="{ row }">
                <span class="table-mono">{{ row.masked }}</span>
              </template>
            </el-table-column>
          </el-table>
        </div>

        <div v-if="subs.subs.length" class="mobile-only mobile-list">
          <div v-for="row in subs.subs" :key="row.index" class="mobile-row">
            <div class="mobile-row-head">
              <strong class="truncate">{{ row.alias || '订阅 ' + row.index }}</strong>
              <span class="pill num">ID {{ row.url_id || '—' }}</span>
            </div>
            <div class="mobile-line">
              <span>地址</span>
              <span class="mono">{{ row.masked }}</span>
            </div>
          </div>
        </div>

        <div v-if="subs.providers.length" class="provider-list">
          <div class="provider-title">机场提供方</div>
          <div v-for="row in subs.providers" :key="row.name" class="provider-row">
            <span class="provider-name truncate">{{ row.name }}</span>
            <span class="provider-host mono">{{ row.masked }}</span>
          </div>
        </div>

        <EmptyState
          v-if="!subs.subs.length && !subs.providers.length"
          :icon="Link2"
          title="没有订阅"
          description="ShellCrash.cfg 里没有配置订阅链接，也没有机场提供方。"
        />
      </PanelCard>

      <!-- 日志与自愈 -->
      <PanelCard title="日志与自愈" subtitle="ShellCrash 运行日志、CrashCore 状态与网络守护">
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
  import { computed, onMounted, ref, watch } from 'vue'
  import { ElMessage, ElMessageBox } from 'element-plus'
  import {
    Cpu,
    FileStack,
    Link2,
    Network,
    Play,
    RefreshCw,
    RotateCcw,
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
  import { useRefreshSignal } from '@/composables/useRefresh'
  import {
    fetchShellCrashConfig,
    fetchShellCrashCrash,
    fetchShellCrashLog,
    fetchShellCrashOverrides,
    fetchShellCrashStatus,
    fetchShellCrashSubs,
    runShellCrashService,
    toggleShellCrashOverride,
    writeShellCrashConfig,
    type ShellCrashConfigResult,
    type ShellCrashCrashResult,
    type ShellCrashLogResult,
    type ShellCrashOverrideEntry,
    type ShellCrashStatus,
    type ShellCrashSubsResult
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
  const config = ref<ShellCrashConfigResult>({ ok: true, values: {}, url_host: '', secret_set: false })
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
    alias: '',
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

  /** The values as they are on the router right now. */
  const baseline = ref<Record<string, string>>({})
  /** The values the user is editing. */
  const draft = ref<Record<string, string>>({})

  const loaded = ref(false)
  const error = ref<Error | null>(null)
  const refreshing = ref(false)
  const busy = ref(false)
  const saving = ref(false)
  const restarting = ref(false)
  const loadingLog = ref(false)
  const notice = ref('')
  const restartPending = ref(false)
  const logFile = ref('')

  const refreshSignal = useRefreshSignal()

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

  const changes = computed<Record<string, string>>(() => {
    const out: Record<string, string> = {}
    for (const [key, value] of Object.entries(draft.value)) {
      if (baseline.value[key] !== value) out[key] = value
    }
    return out
  })

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
    if (status.value.service_status && status.value.service_status !== 'unknown') {
      parts.push(`服务 ${status.value.service_status}`)
    }
    return parts.join(' · ')
  })

  const subsMeta = computed(() => {
    if (!subs.value.count) return '没有配置订阅'
    const parts: string[] = []
    if (subs.value.url_count) parts.push(`${subs.value.url_count} 个订阅链接`)
    if (subs.value.provider_count) parts.push(`${subs.value.provider_count} 个机场提供方`)
    return parts.join(' · ')
  })

  const portList = computed(() => {
    const ports = status.value.ports
    return [
      { key: 'mixed', label: 'mixed', value: ports.mixed, hint: '混合端口（HTTP + SOCKS）' },
      { key: 'redir', label: 'redir', value: ports.redir, hint: '透明代理（TCP 重定向）' },
      { key: 'tproxy', label: 'tproxy', value: ports.tproxy, hint: '透明代理（UDP）' },
      { key: 'socks', label: 'socks', value: ports.socks, hint: 'SOCKS 监听端口' },
      { key: 'dns', label: 'dns', value: ports.dns, hint: '核心 DNS 监听端口' },
      { key: 'controller', label: 'controller', value: ports.controller, hint: '控制面板 API 端口' }
    ]
  })

  async function load(): Promise<void> {
    const [nextStatus, nextConfig, nextOverrides, nextSubs, nextCrash] = await Promise.all([
      fetchShellCrashStatus(),
      fetchShellCrashConfig(),
      fetchShellCrashOverrides(),
      fetchShellCrashSubs(),
      fetchShellCrashCrash()
    ])

    status.value = nextStatus
    config.value = nextConfig
    overrides.value = nextOverrides
    subs.value = nextSubs
    crash.value = nextCrash

    const values: Record<string, string> = { ...nextConfig.values }
    // The global override switch is derived from the cfg, not from the
    // override list, so it is kept in sync with the file.
    values.disoverride = nextOverrides.global_disabled ? '1' : '0'
    baseline.value = { ...values }
    draft.value = { ...values }
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

  async function refresh(): Promise<void> {
    refreshing.value = true
    try {
      await load()
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

  function isChanged(key: string): boolean {
    return baseline.value[key] !== draft.value[key]
  }

  function setDraft(key: string, value: string): void {
    draft.value = { ...draft.value, [key]: value }
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

  /* -------------------------------------------------------------- actions */

  async function saveConfig(): Promise<void> {
    const pending = { ...changes.value }
    if (!Object.keys(pending).length) {
      ElMessage.info('没有需要保存的改动')
      return
    }

    const summary = Object.entries(pending)
      .map(([key, value]) => `${key} → ${value}`)
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
      await load()
      restartPending.value = true
      notice.value = '配置已保存，需重启 ShellCrash 生效'
      ElMessage.success(result.message || '配置已保存，需重启 ShellCrash 生效')
    } catch (err) {
      ElMessage.error(`保存配置失败：${messageOf(err)}`)
    } finally {
      saving.value = false
    }
  }

  function discardChanges(): void {
    draft.value = { ...baseline.value }
    notice.value = ''
    restartPending.value = false
    ElMessage.info('已放弃未保存的改动')
  }

  async function runService(action: 'start' | 'stop' | 'restart', question: string): Promise<void> {
    const ok = await confirm(question, '确认操作 ShellCrash 服务')
    if (!ok) return

    busy.value = true
    if (action === 'restart') restarting.value = true
    try {
      await runShellCrashService(action)
      ElMessage.success('操作已提交，路由器正在执行')
      await pollStatus()
    } catch (err) {
      ElMessage.error(`操作失败：${messageOf(err)}`)
    } finally {
      busy.value = false
      restarting.value = false
    }
  }

  async function restartNow(): Promise<void> {
    const ok = await confirm(
      '立即重启 ShellCrash？重启期间代理会短暂中断，核心会重新拉取订阅并重建规则。',
      '确认重启 ShellCrash'
    )
    if (!ok) return

    restarting.value = true
    try {
      await runShellCrashService('restart')
      notice.value = 'ShellCrash 正在重启，请稍候'
      ElMessage.success('重启已提交，路由器正在执行')
      await pollStatus()
      restartPending.value = false
      notice.value = 'ShellCrash 已重启，配置已生效'
    } catch (err) {
      ElMessage.error(`重启失败：${messageOf(err)}`)
    } finally {
      restarting.value = false
    }
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
      restartPending.value = true
      notice.value = result.message || '覆写状态已更新，需重启 ShellCrash 生效'
      ElMessage.success('覆写状态已更新，需重启 ShellCrash 生效')
    } catch (err) {
      ElMessage.error(`修改覆写状态失败：${messageOf(err)}`)
    } finally {
      busy.value = false
    }
  }

  /** Polls the status while the router is working on a service action. */
  async function pollStatus(): Promise<void> {
    for (let round = 0; round < 15; round += 1) {
      await new Promise((resolve) => window.setTimeout(resolve, 2000))
      try {
        status.value = await fetchShellCrashStatus()
        crash.value = await fetchShellCrashCrash()
      } catch {
        // the router may be busy, the next round tries again
      }
    }
  }
</script>

<style scoped>
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

  .port-grid {
    display: grid;
    grid-template-columns: repeat(6, minmax(0, 1fr));
    gap: var(--space-3);
  }

  .port-cell {
    display: flex;
    flex-direction: column;
    gap: 3px;
    padding: 10px 12px;
    background: var(--surface-2);
    border-radius: var(--radius);
  }

  .port-name {
    color: var(--text-muted);
    font-size: 11px;
    font-family: var(--font-mono);
  }

  .port-value {
    color: var(--text);
    font-size: var(--text-lg);
    font-weight: 600;
  }

  .port-hint {
    color: var(--text-faint);
    font-size: 10.5px;
    line-height: 1.4;
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

  .table-mono {
    color: var(--text-secondary);
    font-size: 12px;
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

  .provider-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-3);
    padding: 7px 12px;
    background: var(--surface-2);
    border-radius: var(--radius);
  }

  .provider-row + .provider-row {
    margin-top: 6px;
  }

  .provider-name {
    color: var(--text);
    font-size: var(--text-sm);
  }

  .provider-host {
    color: var(--text-muted);
    font-size: 11.5px;
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

  @media (max-width: 1180px) {
    .port-grid {
      grid-template-columns: repeat(3, minmax(0, 1fr));
    }
  }

  @media (max-width: 900px) {
    .crash-grid {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  }

  @media (max-width: 640px) {
    .port-grid {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }

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

    .log-select {
      width: 100%;
    }
  }
</style>
