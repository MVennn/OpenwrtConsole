# 凭据与安全须知

> **一句话**：本仓**不存任何凭据** —— 控制台不保存 root 口令、mihomo secret、订阅凭据；
> 会话凭据是**运行时**的，危险动作靠**一次性令牌**而非长期密钥把关；
> 本篇**只写位置，不写值**。

---

## 1. 一句话结论

**本仓不存任何凭据。**

- 仓库里**没有** root 口令、mihomo secret、订阅 token、节点 uuid；
- `src/` 与 `deploy/` 里**没有**写死的密钥；
- 文档里出现的一切凭据引用都是**机制**（会话怎么换、令牌怎么签发、secret 怎么读），
  **不是值**。

> ⚠️ **但「仓库不存凭据」≠「运行时不落盘凭据」** —— v4 引入的配置草稿会把
> **表单值（含 WiFi 密码）写进浏览器 localStorage**。仓库这一侧仍然干净，
> 浏览器那一侧是**新增的凭据落盘路径**，见 §2 与 §8。

要理解为什么可以这样，看两条链路：**会话链路**（§2）与**危险动作链路**（§3）。

---

## 2. 会话凭据：运行时的，不落仓库

控制台**不保存**管理员口令 —— 口令只在 `POST /cgi-bin/modern-login` 这一次请求里出现，
换回来的是一枚 **ubus 会话 id（sid）**。

| 项 | 值 |
|---|---|
| 换取方式 | `POST /cgi-bin/modern-login`，请求体 `{ "username": "…", "password": "…" }` |
| 服务端实现 | [`deploy/modern-login`](../deploy/modern-login) —— 调 `ubus call session login`，申请 **`timeout: 3600`** |
| 会话时长 | **默认 1 小时**（3600 秒）；前端另存了 `owrt-sid-exp` 做本地过期判断 |
| sid 怎么带 | **走查询参数** `?sid=`（CGI 也接受 `owrt_sid` Cookie，历史兼容）；前端由 `src/api/ubus.ts` 统一拼 |
| sid 存在哪 | 浏览器 **`localStorage`**（键名 `owrt-sid`；早期版本用过 `sessionStorage`，已迁移） |
| **登录口令**存哪 | **哪都不存** —— 前端不写 `localStorage`，退出登录即销毁服务端会话 |
| **配置草稿**存哪 | ⚠️ **存 `localStorage`** —— 见下一段 |

> 换句话说：**sid 是「已经登录」的临时票据，口令才是真正的凭据** ——
> 而口令从进浏览器到离开请求体，只存在于那一次 POST 里。

sid 走查询参数意味着它**可能出现在 uhttpd 的访问日志里** ——
这是本机 LAN + HTTPS 场景下的折中，详见根 [../DEPLOY.md](../DEPLOY.md) 的「安全说明」。

### ⚠️ 配置草稿：新的凭据落盘路径（含 WiFi 密码）

**「口令哪都不存」只对登录口令成立。** v4 之后另一条路径会把凭据写进浏览器存储：

| 环节 | 事实 | 出处 |
| --- | --- | --- |
| 草稿怎么落盘 | `useDraft()` 用 `JSON.stringify` 把表单值写进 `localStorage`，键前缀 **`owrt-draft:*`** | [`src/composables/useDraft.ts`](../src/composables/useDraft.ts) |
| 哪个草稿最敏感 | **`owrt-draft:wifi-config`** —— 无线配置页的草稿，存的是**暂存值** | [`src/views/config/WirelessConfigView.vue`](../src/views/config/WirelessConfigView.vue) |
| 密码怎么进去的 | `stageWirelessConfig()` 把选项值**原样**塞进暂存记录（`value: String(value)`），**包括 UCI 选项 `key`（WiFi 密码）** | [`src/api/wirelessConfig.ts`](../src/api/wirelessConfig.ts) |
| 密码从哪来 | SSID 对话框把输入框的值原样塞进 `values.key` | [`src/components/config-wifi/WifiSsidDialog.vue`](../src/components/config-wifi/WifiSsidDialog.vue) |

**结论：浏览器里的 `owrt-draft:wifi-config` 里可能有明文 PSK ——
浏览器存储被拿到（XSS、扩展、备份、共享机器）就等于 PSK 泄露。**

草稿的生命周期：保存成功或用户点「放弃修改」时被清掉（`resetDraft` → `useDraft.clear()`），
但在那之前它**一直躺在 `localStorage` 里**（刷新页面也不丢 —— 这正是草稿存在的理由）。
**它不是仓库里的东西，但它是必须交代的凭据路径。**

---

## 3. 危险动作：一次性令牌 + 确认词（**机制，不是凭据**）

改密码、恢复出厂、重启、刷固件这类动作**不靠长期密钥把关**，靠两把锁：

| 锁 | 谁负责 | 机制 |
|---|---|---|
| **一次性令牌** | 路由器端 CGI | `deploy/modern-uci` 的 `action=token`，用途写进令牌文件；**120 秒有效期、单次使用**（校验时**先删文件再比对**用途与有效期） |
| **确认词** | 前端 | 界面上要用户**手动输入一个词**才放行；CGI 管不了，是前端的职责 |

已知令牌用途：`set-password` · `reboot` · `factory-reset` · `backup-restore` · `firmware-upgrade`。
令牌文件落在路由器上 `/tmp/modern-tokens/<token>`，内容是 `"<purpose> <expiry>"`。

**为什么要写在这里**：令牌是**机制**不是凭据（它 120 秒就过期、用一次就焚），
但**知道它在哪、怎么签发**，才排查得了「为什么点恢复出厂报 403」。
细节（签发 / 消费流程、用途与错误码）见 [CGI-CONTRACT.md](CGI-CONTRACT.md) 与
[WRITE-LAYER.md](WRITE-LAYER.md)。

> ⚠️ **令牌是一次的**：用途写错或请求失败，令牌都已经被消费掉了，**必须重新申请**；
> 不要在前端做「失败自动重试」。

---

## 4. mihomo secret：只在路由器本地读

控制台**不保存** mihomo 控制台 secret，也**不把它传给浏览器**。

- 读取点：[`deploy/modern-proxy`](../deploy/modern-proxy) ——
  从 `/etc/ShellCrash/configs/ShellCrash.cfg` 的 `secret=` 行取出，
  **只在路由器本地**用它向 `127.0.0.1:<控制器端口>` 的核心 API 发请求
  （端口取自 `/tmp/ShellCrash/config.yaml` 的 `external-controller:`，回退 9999；
  请求头 `Authorization: Bearer …`）；
- 该值**不出路由器**，浏览器侧只能看到 API 的**响应**（策略组、当前节点等），看不到 secret；
- ShellCrash 没配置 secret 时，CGI 回 `503 {"error":"shellcrash not configured"}`。

安全说明见根 [../DEPLOY.md](../DEPLOY.md#安全说明)。

---

## 5. ShellCrash 那批 yaml：唯一真源在兄弟仓

本仓的 ShellCrash 设置页（`src/views/config/ShellCrashView.vue` +
`src/api/shellcrashConfig.ts` + `deploy/modern-shellcrash`）操作的是路由器上的
**`/etc/ShellCrash/yamls/*.yaml`**（`proxies.yaml` / `proxy-groups.yaml` / `rules.yaml` /
`user.yaml` 等）。

**那批文件的唯一真源在兄弟仓 `ShellcrashRules`** ——
那边的 `docs/ARCHITECTURE.md` §3「文件所有权表」是 yaml 所有权表的正本；
本仓侧的对应约定写在根 [../AGENTS.md](../AGENTS.md) 第 2 条。

| 事实 | 含义 |
|---|---|
| 本仓**没有**这些 yaml 的副本 | 仓库里搜不到节点 uuid、策略组定义、规则条目 |
| 本仓**不自由文本覆写**它们 | 覆写文件的启停是受控动作，内容变更要回 `ShellcrashRules` 改 |
| 路由器上的文件**可能含订阅信息** | 那是**设备侧运行态**，不入本仓；订阅凭据归 `ShellcrashRules` 那条链路 |

---

## 6. 环境变量 → 谁在读

**本仓不需要任何凭据环境变量。**

| 环境变量 | 谁在读 | 说明 |
|---|---|---|
| （无） | — | 控制台**不读**任何环境变量取凭据 —— 凭据只在登录请求体里；secret 在路由器本地读；令牌由 CGI 现场签发 |

> `.gitignore` 已排除 `.env` / `.env.*`（本地环境文件，**可能含路由器口令**），
> 以及 `askpass.sh` / `*.ppk` / `id_rsa*`（SSH 免密材料）——
> **但排除规则只对未跟踪文件生效**，已跟踪的 vendored 文件除外（见 §7 的已知例外）。
> 本仓的部署脚本用的是 SSH 免密或 `SSH_ASKPASS`，
> **口令由部署者在本机准备，不进仓库**。

---

## 7. 上传公开仓库前的检查清单

```sh
# 1) 确认没有把凭据文件带进去
git ls-files | grep -E '\.env|askpass\.sh|\.(ppk|pem|key)$|id_rsa'

# 2) 确认忽略规则生效
git status --ignored --short | grep -E '^!!' | head -20

# 3) 扫一遍将要提交的内容里有没有裸密钥特征
git diff --cached | grep -nE 'password["'"']?\s*[:=]|secret=|Bearer |PrivateKey'
```

> **第 1 条命令在当前仓库会输出 3 行命中** —— 这是**已知例外**，不是泄漏：
>
> ```text
> third-party/art-design-pro/.env
> third-party/art-design-pro/.env.development
> third-party/art-design-pro/.env.production
> ```
>
> 这三个是 **vendored 上游 art-design-pro 自带的模板文件**（已随仓分发的上游内容，
> 必须逐字节保留），值是上游占位符 —— 其中 `.env` 里含 `VITE_LOCK_ENCRYPT_KEY`
> 这个上游自带的占位密钥，**不是本仓的凭据**。
> `.gitignore` 的 `.env` / `.env.*` 规则**管不到它们**：规则只对**未跟踪**文件生效，
> 而这三个文件**已被 git 跟踪**（`!third-party/**` 放行）。

**逐条确认清单**：

- [ ] 仓库里**没有** `.env` / `.env.*` ——
      **已知例外**：`third-party/art-design-pro/` 下 3 个 vendored 上游模板
      （`.env` / `.env.development` / `.env.production`），值是上游占位符；
- [ ] `askpass.sh` / `*.ppk` / `id_rsa*` 不在库里（`.gitignore` 已排除）；
- [ ] `router-*.json` / `*.har` 不在库里 —— 那是路由器上抓下来的运行时快照，**可能含会话 sid**；
- [ ] `src/` 与 `deploy/` 里**没有**明文口令 / secret / token
      （应只有「登录请求体」「读 `secret=` 行」「签发令牌」这几处**机制**）；
- [ ] `dist/` 不在库里（`.gitignore` 已排除）—— 产物里也不含凭据，但不入库更干净；
- [ ] 文档里没有真实口令 / secret / 订阅 token。
- [ ] **配置草稿这条路径要说清楚**：`src/composables/useDraft.ts` 会把**暂存值**
      （**含 WiFi PSK**）写进浏览器 `localStorage`（键前缀 `owrt-draft:*`）——
      这是**持久化**、**不是仓库**，但它是**要交代的凭据路径**，见 §2。

> **本仓当前的实情（2026-10-20）**：本仓**不存任何凭据**；
> 会话走 `modern-login` 换 sid（默认 1 小时），危险动作走 120 秒单次令牌 + 确认词，
> mihomo secret 只在路由器本地读。`.gitignore` 已排除 `.env*`、SSH 私钥、
> 运行时快照与 `dist/` —— **但 `.env*` 的排除规则只对未跟踪文件生效**，
> 已跟踪的文件（`third-party/art-design-pro/` 下那 3 个上游模板）它管不到。
> 浏览器侧另有一条**持久化**路径：`useDraft.ts` 把含 WiFi PSK 的暂存值写进
> `localStorage`（`owrt-draft:*`）—— 见 §2。
> 但**部署机上的 SSH 免密材料与 `.env` 仍然有效** ——
> **上传到公开远端前仍须确认它们没被带进去**。

---

## 8. 几条硬规矩

1. **新代码不许把凭据写死** —— 走会话（sid）或走路由器本地的 `secret=` 读取；
   拿不到就明确报错，绝不用空值去请求。
2. **文档里出现值只允许出现在历史记录里** —— 新的说明一律指向机制；
   需要举例时用 `<REDACTED-…>` 占位符。
3. **浏览器侧永远拿不到 secret** —— `deploy/modern-proxy` 的读取必须留在路由器本地，
   改这个 CGI 时不要为了「方便」把 secret 塞进响应。
4. **sid 不进 URL 之外的持久化** —— 前端只放 `localStorage`，退出登录即销毁服务端会话。
5. **令牌不重试** —— 一次性令牌用过即焚，失败重新申请。
6. **日志里不要打印凭据** —— `Authorization` 头、订阅 URL 的 token 段，打印前先打码。
7. **草稿里不要落凭据** —— `useDraft` 会把表单值原样写进 `localStorage`，
   而 `stageWirelessConfig()` 这类暂存函数会把选项值**原样**塞进去
   （**包括 WiFi 选项 `key` = PSK**）。**往草稿里放凭据 = 把凭据落盘**：
   - 要么改暂存函数，让**口令类选项不入草稿、不入暂存记录**（只记「已设置」）；
   - 要么在文档与代码注释里明确写出「草稿含明文 PSK」这一风险，并给出清理方式
     （保存成功 / 放弃修改时清草稿，见 `resetDraft`）。
   **不许因为「草稿只在本地」就当作没有风险。**

---

## 9. 相关文档

| 要查什么 | 去哪 |
|---|---|
| 会话怎么换、sid 怎么带、令牌机制与错误码 | [CGI-CONTRACT.md](CGI-CONTRACT.md) §0、§1 |
| 哪些动作要走 root CGI、令牌与确认词的先后顺序 | [WRITE-LAYER.md](WRITE-LAYER.md) §3、§4 |
| 三层数据流、CGI 清单、sid 校验约定 | [ARCHITECTURE.md](ARCHITECTURE.md) §2、§3 |
| 部署步骤、缓存与世代保留、回退 | [MAINTENANCE.md](MAINTENANCE.md) |
| 安全说明（不暴露 WAN、密码只出现一次、secret 不回传） | 根 [../DEPLOY.md](../DEPLOY.md#安全说明) |
| 本仓与兄弟仓的职责边界（yaml 唯一真源） | 根 [../AGENTS.md](../AGENTS.md) 第 2 条 |
| 版本号与发版 | [VERSIONING.md](VERSIONING.md) |
| 忽略规则 | 仓库根 `.gitignore` |
| 许可证（本仓**不含**任何 GPL-3.0 派生件） | 仓库根 [LICENSE](../LICENSE) |
