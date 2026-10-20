# 写入层

> **一句话**：控制台改配置的**授权边界**与**写法范式** ——
> 哪些配置文件能写、写入要走哪几步、哪些动作必须走 root CGI 并带一次性令牌。

本文是 [docs/V3-CONTRACT.md](V3-CONTRACT.md) 的**长期部分提炼**，也是这块知识的**唯一正本**。
`V3-CONTRACT.md` 是一次性的并行开发契约，不再维护；其「文件归属表」已失效。

配套阅读：[CGI-CONTRACT.md](CGI-CONTRACT.md)（每个动作的请求 / 响应形状）、
[ARCHITECTURE.md](ARCHITECTURE.md)（通道能力总表）。

---

## 1. rpcd 的 UCI 授权白名单

控制台的登录会话是一个 **ubus session**。rpcd 对它做了 ACL：
能调 `system.*` / `network.*` / `luci-rpc.*` / `luci.*` / `service.*`，
UCI 对象也能用 —— 但**能写哪几个配置文件是按文件名授权的**。

### 可写的配置文件（全部 10 个）

| 配置文件 | 是什么 |
| --- | --- |
| `dhcp` | dnsmasq：地址池、静态租约、DNS 上游 |
| `firewall` | 防火墙：区域、端口转发、出站规则、流量卸载 |
| `network` | 接口、静态路由、IPv6 |
| `system` | 主机名、时区、主机名解析 |
| `wireless` | SSID、射频、信道、功率 |
| `dropbear` | SSH 服务 |
| `luci` | LuCI 自身设置 |
| `opkg` | 软件包源（apk 的对应项） |
| `ntp` | 时间服务器 |
| `timeserver` | 时间服务器（另一套键名） |

### 不可写的

- **其它一切配置文件** —— 一律返回 `Invalid argument`。
- **新建自定义配置文件** —— 不允许。`uci.add` 只能往**已授权的配置文件**里加 section。
- **`uci.revert`（丢弃暂存改动）** —— 会话被明确拒绝，必须走 root CGI `modern-uci`。
- **重载服务**（network / wifi / firewall reload）、**改密码**、**重启**、**恢复出厂**、
  **备份 / 恢复配置**、**刷固件** —— 全部走 root CGI。

> 这条白名单同时是 `modern-uci` 的 `valid_config()` 判定：
> CGI 侧再校验一遍，两层都过才放行。

## 2. 写入范式：读现状 → 本地草稿 → 暂存 → 提交 → 应用

**所有配置修改都必须按这五步走**，不许跳步 —— v4 之后范式跨**两个存储层**：
**路由器侧的 UCI 暂存区**（`/tmp/.uci/<config>`）+ **浏览器侧的 localStorage 草稿**。

```ts
// ① 读现状（uci.get）—— 界面上的默认值必须来自设备的真实配置，不是硬编码
// ② 用户编辑（先落 localStorage 草稿，不写设备）
// ③ 暂存到 UCI 暂存区（uci.set / uci.add / uci.delete）—— 写进路由器的未提交区
// ④ 提交（uci.commit）—— 落盘
// ⑤ 应用（重载服务）—— 让改动真正生效
await uciSet('network', 'lan', { ipaddr: '10.0.0.1/24' })
await uciCommit('network')
await systemOps.reloadNetwork()
```

### 每一步的硬性要求

| 步骤 | 要求 |
| --- | --- |
| ① 读现状 | 表单初值必须来自 `uci.get` 的返回，**不许用前端写死的默认值** |
| ② 用户编辑（本地草稿） | 编辑先落 `localStorage`（`src/composables/useDraft.ts`，键前缀 `owrt-draft:*`），刷新不丢；页面上用 `src/components/DraftNotice.vue` 提示草稿状态（「有未保存的修改」+「放弃修改」），用 `src/components/cfg-pending/ConfigPendingPanel.vue` 逐条渲染「旧值 → 新值」；出错要能回滚 |
| ③ 暂存 | 高风险操作（改 IP、断网、改防火墙策略）必须先给**明确的影响提示**并要求确认；暂存记录（旧值、改动明细）统一由 `src/api/configPending.ts` 维护 |
| ④ 提交 | `uci.commit` 之后配置已落盘，但**还没生效** —— 必须继续第 5 步 |
| ⑤ 应用 | 重载服务会**断网**（`net-reload`）或**踢掉无线**（`wifi-reload`），界面上要提示 |

> **四个可写配置页（网络 / 无线 / 防火墙 / DHCP 与系统设置）共用同一套共享件**：
> `src/api/configPending.ts` + `src/components/cfg-pending/ConfigPendingPanel.vue` +
> `src/components/DraftNotice.vue`。**不许各页自己另起一套** ——
> 另起一套就意味着「旧值」与「放弃修改」的语义各页不同，用户会踩到不一致。

### 「放弃修改」是**两层**，两边都要做

| 层 | 做什么 | 代码 |
| --- | --- | --- |
| 浏览器侧本地草稿 | 删掉 `localStorage` 里的草稿 | `resetDraft(draft)`（`src/api/configPending.ts`）→ `useDraft.clear()` |
| 路由器侧 UCI 暂存区 | 回滚 `/tmp/.uci/<config>` 里的未提交改动 | `systemOps.revertConfig(config)` → CGI `modern-uci` 的 `uci-revert` |

**只回滚一边会留下两边不一致**：

- 只清草稿 → 路由器暂存区里的改动还在，刷新后「待生效改动」又冒出来；
- 只回滚暂存区 → 浏览器里的草稿还在，页面会拿旧草稿再暂存一遍。

第二层必须走 root CGI —— rpcd 会话**没有** `uci.revert` 权限。

### 应用走 `uci-apply`

**历史**：早期 `src/api/uci.ts` 里导出过一个零调用的 `uciApply()`（对应 rpcd 的 `uci.apply`），
是死代码。**这段死代码已删** —— `src/api/uci.ts` 现在只导出
`uciGet` / `uciGetSection` / `uciSet` / `uciDelete` / `uciAdd` / `uciCommit` / `uciChanges`。

**应用一律走 `systemOps.applyChanges()` → CGI `modern-uci` 的 `uci-apply`（`uci apply`）。**
本篇与 [CGI-CONTRACT.md](CGI-CONTRACT.md) 都以这条为准。

## 3. 哪些动作必须走 root CGI

判据很简单：**rpcd 会话被拒的，一律走 root CGI**。

| 动作 | 走哪条 | CGI action | 令牌 | 确认词 |
| --- | --- | --- | --- | --- |
| 丢弃暂存改动 | root CGI | `modern-uci` `uci-revert` | — | — |
| 重载网络 / 无线 / 防火墙 | root CGI | `modern-uci` `net-reload` / `wifi-reload` / `firewall-reload` | — | 建议 |
| **改管理员密码** | root CGI | `modern-uci` `set-password` | ✅ `set-password` | ✅ |
| **重启设备** | root CGI | `modern-uci` `reboot` | ✅ `reboot` | ✅ |
| **恢复出厂设置** | root CGI | `modern-uci` `factory-reset` | ✅ `factory-reset` | ✅ |
| **恢复配置备份** | root CGI | `modern-uci` `backup-restore` | ✅ `backup-restore` | ✅ |
| **刷写固件** | root CGI | `modern-sysupgrade` `upgrade` | ✅ `firmware-upgrade` | ✅ |
| **安装软件包** | root CGI | `modern-pkg` `install` | —（`confirm=yes`） | ✅ |
| 卸载软件包 | root CGI | `modern-pkg` `remove` | —（`confirm=yes`） | ✅ |
| 更新仓库索引 / 全量升级 | root CGI | `modern-pkg` `update` / `upgrade` | —（`confirm=yes`） | ✅ |
| 切换代理策略组节点 | root CGI | `modern-proxy` `POST` | —（组内成员校验） | ✅ |
| ShellCrash 服务启停 | root CGI | `modern-shellcrash` `service` | —（不要求 confirm） | — |
| ShellCrash 配置键写入 | root CGI | `modern-shellcrash` `config-write` | —（`confirm=yes`） | — |
| ShellCrash 覆写文件启停 | root CGI | `modern-shellcrash` `override-toggle` | —（`confirm=yes`） | — |
| ShellCrash 订阅热更新 | root CGI | `modern-shellcrash` `sub-update` | —（`confirm=yes`） | — |
| ShellCrash 订阅热更新状态 | root CGI | `modern-shellcrash` `sub-update-state` | — | — |

> 「令牌」列指**一次性令牌**（见 [CGI-CONTRACT.md](CGI-CONTRACT.md) §0：120 秒、单次使用、用途必须完全一致）。
> 「确认词」列指界面上要用户**手动输入一个词**（如 `RESET`）才放行 —— 这是前端的责任，CGI 管不了。

> ⚠️ **待办（安全缺口）**：ShellCrash 服务启停（`service`）是本表里**最危险的动作**，
> 却**不要求 `confirm=yes`** —— `deploy/modern-shellcrash` 的 `action_service()` 里**没有** `_confirm` 判断，
> 而同一文件里的 `config-write` / `override-toggle` / `sub-update` 都有。
> 也就是「停核心 / 重启核心」比「改一个配置键」更容易触发 —— **最危险的动作反而没有确认保护**，
> 是本表当前最明显的安全缺口，待补。

### 令牌与确认词的先后顺序

```
用户点「恢复出厂」
  → 弹确认框，要求输入确认词        ← 前端
  → 确认词正确
  → requestToken('factory-reset')    ← 申请一次性令牌（120 秒）
  → runSystemOp('factory-reset', { token })
  → 令牌被消费（用完即焚）
```

**令牌是一次的**：用途写错、参数错了导致请求失败，令牌都已经被消费掉了，必须重新申请。
不要在前端做「失败自动重试」。

## 4. 「已授权」不等于「能改任何东西」

三条边界，逐条记住：

1. **rpcd 的白名单是按配置文件名的**，不是「所有 UCI 都能写」。
   写一个不在白名单里的配置 → `Invalid argument`。
2. **root CGI 是 root 权限**，它做的是「绕过 rpcd ACL」，不是「绕过参数校验」。
   每个 CGI 都有自己的一份参数白名单（配置文件名、服务名、包名字符集、文件名后缀、路径前缀）。
3. **CGI 从不接受调用方传来的文件路径**。所有路径都是脚本里的字面常量；
   用户输入只作为**已校验的单个参数**使用。

## 5. 前端封装在哪

| 需要什么 | 用哪个 |
| --- | --- |
| 读 / 写 UCI 配置 | `src/api/uci.ts`（`uciGet` / `uciGetSection` / `uciSet` / `uciDelete` / `uciAdd` / `uciCommit` / `uciChanges`） |
| 暂存区工具（旧值 → 新值、改动明细、草稿清理） | `src/api/configPending.ts`（`stageEdits` / `buildPendingEntries` / `applyEdits` / `resetDraft`） |
| 特权系统动作 + 令牌 | `src/api/systemOps.ts`（`runSystemOp` / `requestToken` / `systemOps.*`） |
| 代理出口的本地状态（切节点时间、已持续时长） | `src/api/proxyState.ts` |
| 设备身份（登录页显示真实机型） | `src/api/device.ts` |
| 各功能域的读写封装 | `src/api/<域名>.ts`（`networkConfig` / `wirelessConfig` / `firewallConfig` / `systemSettings` / `packages` / `firmware` / `shellcrashConfig` / `proxyActions` / `setup` / `ops` / `monitor` / `diagnostics` / `dns`） |

**统一入口**（详见 [ARCHITECTURE.md](ARCHITECTURE.md) §5）：

- `ubusCall(object, method, params)` —— `/ubus`；自动带 sid。
- `cgiGet(path)` —— GET 形式的 CGI；自动拼 sid。
- `runSystemOp(action, params)` —— POST 形式的 `modern-uci`。

## 6. 写操作的硬性纪律

- **不要在路由器上做递归扫描或全盘搜索**（`grep -r /etc /var`、`find /`、遍历 overlay 或 `/tmp`）。
  已有先例把 233 MB 内存打满并触发看门狗重启。只读**单个已知路径**的文件，或用 ubus 精确取数据。
- **不要并发对路由器做写操作** —— 多个进程同时写 UCI 会互相破坏。
  写路径的验证由一个执行者串行完成。
- **写之前先备份**：高风险动作在界面上先给影响提示；ShellCrash 的配置写入 CGI 会自动留 `.bak-<时间戳>`。
- **危险按钮一律二次确认**，且危险样式（`type="danger" plain`）+ 确认词。
