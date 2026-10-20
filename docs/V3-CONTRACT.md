# OpenWrt Console · v3 开发契约（可写版本）

> **一句话**：v3 可写层的开发契约（一次性多代理协作契约；长期有效的授权边界与写入范式已提炼到 [WRITE-LAYER.md](WRITE-LAYER.md)）。

v3 的目标：把控制台做成 **LuCI 的完整替代品** —— 不只是看，而是能改、能应用、能运维。
本文件是所有并行子代理的共同约定。

## 0. 现状与边界

- **绝对不要在路由器上做递归扫描或全盘搜索**（`grep -r /etc /var /usr/share`、`find /`、
  遍历 overlay 或 `/tmp`）。已经有代理这么干过：233MB 内存被吃满、I/O 打满，路由器
  疑似触发看门狗重启。只允许读**单个已知路径的文件**，或用 ubus 精确取数据。
- 路由器的 rpcd 会话**可以**写标准 UCI 配置：`uci.get/set/add/delete/commit/changes/apply` 全部可用。
- rpcd 会话**不能**做：丢弃未提交的改动（`uci.revert`）、重载服务、修改密码、恢复出厂、
  重启。这些走 root CGI `deploy/modern-uci`（已由主代理写好并部署）。
- rpcd 的 UCI 访问是**按配置文件名授权**的：只有 `dhcp / firewall / network / system /
  wireless / dropbear / luci / opkg / ntp / timeserver` 可写；其它配置文件一律
  `Invalid argument`。新建自定义配置文件是不允许的。
- LuCI 仍然在线（`/cgi-bin/luci/`）作为应急入口，直到 v3 收尾才切换默认入口。

## 1. 共享层（主代理已写好，直接用，不要重复实现）

```ts
import {
  uciGet, uciGetSection, uciSet, uciDelete, uciAdd, uciCommit, uciChanges, uciApply,
  uciString, uciNumber, uciBool, uciList, uciByType,
  type UciConfig, type UciSection, type UciChange
} from '@/api/uci'

import { systemOps, requestToken, runSystemOp } from '@/api/systemOps'
```

写入范式（**所有配置修改必须遵守**）：

```ts
// 1) 读现状 → 2) 用户编辑 → 3) 暂存(set) → 4) 提交(commit) → 5) 应用(apply 或重载服务)
await uciSet('network', 'lan', { ipaddr: '10.0.0.1/24' })
await uciCommit('network')
await systemOps.reloadNetwork()   // 或 uciApply()
```

- 提交前必须能在界面上看到「将生效的改动」；出错要能回滚。
- 高风险操作（改 IP、断网、改防火墙策略）必须先给出明确的影响提示，并要求用户确认。
- 需要「放弃修改」时用 `systemOps.revertConfig(config)`（`uci.revert` 走 CGI）。
- 破坏性系统操作（重启、恢复出厂、恢复备份、改密码）必须先 `requestToken(purpose)`
  拿一次性令牌，再带令牌调用，`令牌 120 秒内有效且只能用一次`。

## 2. 文件归属（硬性）

| 你可以创建/修改 | 你不可以碰 |
| --- | --- |
| `src/views/<你的模块>/**` | `src/router/index.ts`（主代理注册） |
| `src/api/<你的模块>.ts`（新建） | `src/api/uci.ts`、`src/api/systemOps.ts`、`src/api/ubus.ts` |
| `src/components/<你的前缀>/**`（新建，组件名带前缀） | `src/components/**` 里已有的组件 |
| `src/utils/<你的模块>.ts`（新建） | `src/utils/format.ts` 等共享工具 |
| `src/styles/<你的前缀>.css`（如需） | `src/styles/*.css` |
| `deploy/<你专属的 CGI>` | 其它 `deploy/modern-*` |

- 不要 `npm install`、不要改 `package.json` / `vite.config.ts` / `tsconfig.json`
- 不要运行 `npm run build`（会和其他代理抢占 `dist/`）。自检用 `npx vue-tsc --noEmit`
  （只读），只修**自己文件**里的报错
- **不要对路由器做写操作**（多个代理并发写 UCI 会互相破坏）。只读验证可以用；
  写路径的验证交给主代理统一做

## 3. 现有组件（直接复用）

`PageHeader`（title/description/默认插槽=页面动作）、`PanelCard`（title/subtitle/flush/
actions 插槽/footer 插槽=卡片底部摘要）、`StatCard`、`StatusBadge`、`SignalBars`、
`EmptyState`、`BaseChart`。

Element Plus 组件（el-form/el-table/el-dialog/el-select/el-switch/el-input-number…）
在模板里直接用即可（已配置按需自动导入）。**新增 Element Plus 组件时**要把它加进
`src/plugins/element.ts` 的样式清单（主代理会在合并时统一补齐，你只需在回复里列出
用到的组件名）。

## 4. 视觉与交互规范（refactoring-ui）

- 每页一个主动作；配置页的主动作是「保存并应用」
- 表单：label 13px/500，必填项标红，错误信息紧贴字段下方
- 状态语义色：`--success` / `--warning` / `--danger`，软底 `--*-soft`
- 数字用 `num` class；IP/路径/MAC 用 `mono-value`
- 移动端 ≤640px：表格换成卡片列表（参考 `src/views/ClientsView.vue`）
- 深浅色都要能用，只用 CSS 变量
- 危险按钮用 `type="danger" plain`，并配 `ElMessageBox.confirm`
- 不要 `v-html`；不要把用户数据拼进 HTML

## 5. 交付要求

回复里给出：新建/修改文件清单（绝对路径）、用到的 ubus 方法与 CGI 动作、
写操作的回滚方式、用到的 Element Plus 组件名、类型检查结果（自己文件零报错）。
