# OpenWrt Console · v2 开发契约

> **一句话**：**历史文档** —— v2 只读扩展阶段的一次性并行开发契约，其中「文件归属表」已失效；
> 现役坐标在 [ARCHITECTURE.md](ARCHITECTURE.md)（结构与通道）与 [WRITE-LAYER.md](WRITE-LAYER.md)（可写部分）。

所有并行子代理都按本文件开发。**共享文件谁都不许改**，避免冲突。

## 1. 项目概况

- 路径：仓库根目录（本仓是快照，源目录在上游 OpenWrt 运维仓的 `frontend/`）
- 技术栈：Vue 3.5 + Vite 6 + TypeScript 5.7 + Element Plus 2.9 + ECharts 5 + lucide-vue-next
- 路由：`vue-router` 的 hash 模式，`src/router/index.ts`（**共享，勿改**）
- 样式：纯 CSS 设计令牌（`src/styles/tokens.css`、`layout.css`、`element.css`），无 Tailwind
- 构建：`npm run build`；产物 base 为 `/modern/`
- 已部署：<https://<路由器IP>/modern/>（CGI 在 `/www/cgi-bin/modern-*`，部署脚本 `deploy/deploy.sh`）

## 2. 文件归属（硬性）

| 你可以创建/修改 | 你不可以碰 |
| --- | --- |
| `src/views/<你的页面>/**` | `src/router/index.ts`（主代理统一注册） |
| `src/api/<你的模块>.ts`（新建） | `src/api/openwrt.ts`（共享读接口） |
| `src/components/<你的前缀>/**`（新建，组件名带前缀） | `src/api/ubus.ts`、`src/api/types.ts`（共享） |
| `src/styles/<你的前缀>.css`（如需） | `src/styles/*.css`（共享） |
| `deploy/<你专属的 CGI 文件名>` | 其他 `deploy/modern-*` |
| `src/utils/<你的模块>.ts`（新建） | `src/utils/format.ts`、`src/utils/clients.ts`、`src/utils/proxy.ts`（共享） |

- **不要**运行 `npm install`、不要改 `package.json` / `vite.config.ts` / `tsconfig.json`
- **不要**运行 `npm run build`（会和其他代理抢占 `dist/`）。自检用
  `npx vue-tsc --noEmit`（只读），只修**自己文件**里的报错；其他文件的报错忽略
- 需要共享能力时，**不要**改共享文件：在自己的 `src/api/<模块>.ts` 里直接调用
  `ubusCall` / `cgiGet`（见下）

## 3. 数据通道

### 3.1 ubus（JSON-RPC over `/ubus`）

```ts
import { ubusCall } from '@/api/ubus'

// 读配置
const firewall = await ubusCall<{ values: Record<string, UciSection> }>('uci', 'get', {
  config: 'firewall'
})
// 写配置（先 set，再 commit，可回滚）
await ubusCall('uci', 'set', { config: 'wireless', section: 'default_radio0', values: { disabled: '1' } })
await ubusCall('uci', 'commit', { config: 'wireless' })
```

`uci.get` 返回结构：

```jsonc
{
  "values": {
    "cfg01e63d": { ".type": "defaults", ".name": "cfg01e63d", ".index": 0, "input": "REJECT" },
    "zone_lan":  { ".type": "zone", ".name": "zone_lan", ".index": 1, "name": "lan", "network": ["lan"] }
  }
}
```

- 匿名段用 `.name` 作为稳定标识（`cfg01e63d` 这类），不要用数组下标
- 已知可用：`uci.get/set/add/delete/commit/apply/revert/changes`、`system.board/info/reboot`、
  `network.interface.dump`、`network.reload`、`luci-rpc.getNetworkDevices/getWirelessDevices/getHostHints/getDHCPLeases/getBoardJSON`
- **被拒绝**：`iwinfo.*`、`file.read`、`dhcp.ipv4leases`（这些只能走 CGI）

### 3.2 CGI（`/cgi-bin/...`）

```ts
import { cgiGet } from '@/api/ubus'
// cgiGet 会自动带上 ?sid=<session>，CGI 内部校验后返回 JSON
const hosts = await cgiGet<{ hosts: Array<{ ip: string; name: string }> }>('/cgi-bin/modern-read?what=hosts')
```

CGI 约定（你新增的 CGI 必须遵守）：

- 只接受 GET/POST；用 `QUERY_STRING` 或 JSON body 传参
- 必须用 `owrt_sid` Cookie **或** `?sid=` 校验会话（照抄 `deploy/modern-data` 的写法）
- 输出 `Content-Type: application/json; charset=utf-8`，正文用 `%J` 打印
- **必须 LF 换行**（CRLF 会让 shebang 报 `No such file or directory`）
- 命令执行类 CGI 必须：命令白名单、参数白名单校验、禁止拼接用户输入、
  超时强制结束、输出长度截断
- 参考实现：`deploy/modern-data`（ucode）、`deploy/modern-proxy`（sh）

## 4. 现有组件（直接复用，别重写）

| 组件 | 关键 props / slots |
| --- | --- |
| `src/components/PageHeader.vue` | `title`、`description`；默认插槽放页面级动作按钮 |
| `src/components/PanelCard.vue` | `title`、`subtitle`、`flush`；`actions` 插槽、`footer` 插槽（底部摘要条） |
| `src/components/StatCard.vue` | `label`、`value`、`suffix`、`meta`、`badge`、`tone`(brand/success/warning/danger/neutral)、`icon`(组件)、`progress`(0-100) |
| `src/components/StatusBadge.vue` | `label`、`tone`、`dot` |
| `src/components/SignalBars.vue` | `level`(0-4)、`dbm` |
| `src/components/EmptyState.vue` | `title`、`description`、`icon` |
| `src/components/BaseChart.vue` | `option`(EChartsCoreOption)、`height`；ECharts 需按需注册，见 `src/components/BaseChart.vue` |

## 5. 工具函数（共享，直接 import）

```ts
import {
  formatBytes, formatBitrate, formatUptime, formatDurationShort, formatAgo,
  formatPercent, formatNumber, formatClock, signalLevel, signalLabel,
  bandLabel, encryptionLabel, protoLabel, ipv4Of, ipv6Of, withAlpha
} from '@/utils/format'
```

## 6. 组合式函数

```ts
import { usePolling } from '@/composables/usePolling'
const { loaded, error, refreshing, refresh } = usePolling(async () => { /* 拉数据 */ }, 10000)
// loaded: 首次成功；error: Error；refreshing: 手动刷新中；refresh(): 立即刷新
```

- 轮询间隔：状态类 10s，列表类 15s
- 页面卸载自动停止；标签页隐藏时暂停

## 7. 视觉规范（refactoring-ui）

- 一级信息 = 页面标题 + 最重要的 1 个结论；三级文字 `#68758e`（12px）
- 每个页面只有一个主按钮（放在 PageHeader 右侧），其余是次级/文字链接
- 卡片内边距 20px（移动端 16px），卡片间距 16px
- 状态语义色：`--success` / `--warning` / `--danger`，软底用 `--*-soft`
- 数字用 `num` class（等宽数字）；路径/MAC/地址用 `mono-value` 或 `.mono`
- **移动端**：≤640px 时表格换成卡片列表（参考 `src/views/ClientsView.vue` 的
  `.mobile-only` / `.desktop-only` 写法）
- 深浅色都要能用：只使用 CSS 变量，不写死颜色
- 危险操作（重启、切换节点、提交配置）必须二次确认，用
  `ElMessageBox.confirm(...)`
- 不要 `v-html`；不要把用户数据拼进 HTML

## 8. 页面骨架

```vue
<template>
  <div class="page">
    <PageHeader title="标题" description="一句话说明">
      <el-button type="primary" :icon="Plus">动作</el-button>
    </PageHeader>

    <el-alert v-if="error" type="error" :title="error.message" :closable="false" show-icon />

    <template v-if="loaded">
      <div class="grid grid-4">…</div>
      <PanelCard title="…">…</PanelCard>
    </template>

    <div v-else class="card"><div class="card-body"><el-skeleton :rows="6" animated /></div></div>
  </div>
</template>
```

- 页面样式写在 `<style scoped>` 里，用 CSS 变量
- 组件名统一 `XxxView.vue`；导出 `defineOptions({ name: 'XxxView' })`
- 中文界面文案；技术名词保留英文（SSID、MAC、DHCP、OpenWrt…）

## 9. 交付要求

完成后你的回复里必须给出：

1. 新建/修改的文件清单（绝对路径）
2. 数据来源（用了哪些 ubus 方法 / 哪个 CGI）
3. 写操作的回滚方式（如果做了写操作）
4. `npx vue-tsc --noEmit` 的结果（自己文件的报错必须清零）
