# 架构说明

> **一句话**：控制台是**浏览器里的 SPA**，数据全部来自路由器上两个后端 ——
> rpcd / ubus（标准配置读写）与 9 个 root CGI（特权读写），本篇把这条链路拆成三层、
> 十个数据通道讲清楚。

本文只讲**结构与边界**。CGI 的请求 / 响应 JSON 形状在 [CGI-CONTRACT.md](CGI-CONTRACT.md)，
写入层的授权白名单与范式在 [WRITE-LAYER.md](WRITE-LAYER.md)。

---

## 1. 三层数据流

```
┌──────────────────────────────────────────────────────────────────────────┐
│ 第 1 层  浏览器 SPA（src/）                                            │
│                                                                          │
│  views/ ──► api/ ──► composables/ · stores/ · utils/                     │
│    │         │                                                           │
│    │         ├─ fetch('/ubus')          ← JSON-RPC over uhttpd          │
│    │         └─ fetch('/cgi-bin/…')    ← CGI，sid 走查询参数            │
│    │                                                                     │
│    └─ 路由守卫 src/router/index.ts（无 sid → /login）                    │
└──────────────────────────────┬───────────────────────────────────────────┘
                               │  HTTPS（LAN 内，自签证书）
                               │  传输：sid 走 ?sid=，uhttpd 不转发自定义头
┌──────────────────────────────▼───────────────────────────────────────────┐
│ 第 2 层  路由器 web 层（uhttpd）                                        │
│                                                                          │
│  /ubus ──────────────► rpcd（会话 ACL 生效）                            │
│  /cgi-bin/modern-* ──► 9 个 CGI 脚本（root 身份）                       │
└──────────────────────────────┬───────────────────────────────────────────┘
                               │
┌──────────────────────────────▼───────────────────────────────────────────┐
│ 第 3 层  路由器内部                                                     │
│                                                                          │
│  rpcd ──► ubus 对象（system / network.interface / luci / luci-rpc /     │
│           service / uci）                                               │
│  rpcd ──► UCI 配置库（/etc/config/*，按配置文件名授权）                 │
│  CGI ──► 本地 shell 与文件：                                              │
│          logread · iwinfo assoclist · ip route · ip neigh · netstat ·     │
│          /tmp/dhcp.leases · /tmp/hosts/dhcp.* · /etc/resolv.conf.auto · │
│          apk · sysupgrade · uci · /etc/init.d/* · ShellCrash 配置        │
│  CGI ──► 127.0.0.1:<核心控制口>（端口取自运行时配置，默认 9999，        │
│          secret 不出路由器）                                            │
└──────────────────────────────────────────────────────────────────────────┘
```

**运行时依赖**（不在本仓内，部署前需在路由器上具备）：`rpcd-mod-luci`（`luci` / `luci-rpc`
ubus 对象）、`curl`（代理页与固件更新检查 / 下载）、`apk`（软件包页，24.10+）。
缺少时的表现与装法见 [../DEPLOY.md](../DEPLOY.md)「路由器运行时依赖」。

**读与写的分工（记住这一条就够用）：**

| 想做的事 | 走哪条路 | 为什么 |
| --- | --- | --- |
| 读系统状态 | `/ubus` | rpcd 会话有 ACL，直接读最快 |
| 读 DHCP 租约 / hosts / resolv | CGI `modern-read` | 这些是 `/tmp` 下的运行时文件，rpcd 不暴露 |
| 读无线终端信号 | CGI `modern-data` | `iwinfo assoclist` 只有 root 能读 |
| 改标准配置 | `/ubus` → `uci.set/add/delete/commit` | rpcd 会话对白名单配置文件有写权 |
| 应用配置 | 提交走 rpcd（`uci.commit`），重载服务走 CGI `modern-uci` 的 `net-reload` / `wifi-reload` / `firewall-reload`（或 `uci-apply`，经 `/sbin/reload_config` 按差异重载） | 提交是标准 UCI 写，会话有权限；重载服务是特权动作，rpcd 被拒 |
| 丢弃暂存 / 改密码 / 重启 / 恢复出厂 | CGI `modern-uci` | rpcd 会话被明确拒绝 |
| 装软件 / 刷固件 / 代理切换 / ShellCrash 设置 | 对应 CGI | 全部超出 rpcd 会话权限 |

## 2. 数据通道表

**10 个通道 = 1 个 `/ubus` + 9 个 CGI。** 早前的分析报告记的是「7 个」，
那是 `modern-pkg` / `modern-sysupgrade` / `modern-shellcrash` 三个 CGI 加进来**之前**的口径；
按当前实现是 10 个。

下表把 `/ubus` 按 ubus 对象拆成三行（第 1–3 行）—— 它们共用同一个传输与同一套会话 ACL，
但**可调用的方法集合不同**，分三行写更贴近实际用法。`modern-login` 不在表里：
它是唯一**不需要 sid** 的 CGI，单列在下面的「特殊路径」里。

| # | 通道 | 走什么 | 返回什么 | 能读什么 | 能写什么 | 授权边界 |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | `/ubus`（`system` / `network.interface` / `service` / `uci`） | JSON-RPC `POST /ubus`，`params[0] = sid` | ubus 对象方法的返回值 | 板卡 / 系统信息、接口表、服务列表、UCI 配置 | 白名单 UCI 配置的 `set/add/delete/commit/changes/apply` | 会话 ACL；UCI **按配置文件名**授权，只有 `dhcp`/`firewall`/`network`/`system`/`wireless`/`dropbear`/`luci`/`opkg`/`ntp`/`timeserver` 可写；`uci.revert` **不可用** |
| 2 | `/ubus`（`luci-rpc`） | 同上 | JSON 对象 | `getNetworkDevices`、`getWirelessDevices`、`getDHCPLeases`、`getHostHints` | 无（只读对象） | 会话 ACL；对象由 `rpcd-mod-luci` 提供（随 `luci-base` 安装，精简固件需单独装） |
| 3 | `/ubus`（`luci`） | 同上 | JSON 对象 | `getProcessList`、`getMountPoints`、`getBlockDevices`、`getConntrackList`、`getLEDs`、`getTimezones` | 无（只读对象） | 会话 ACL |
| 4 | CGI `modern-data` | `GET ?what=stations\|logs\|identify` | `{stations:{iface:[…]}}` / `{lines:[…]}` / `{ip,tcp:[…],miio,mitv,gateway,ssdp,mdns:[…]}` | 无线关联终端（信号、速率）、系统日志、**设备指纹**（TCP 端口 / miIO / SSDP / mDNS） | 无 | sid 校验（`ubus session get`）；`identify` 只接受 IPv4，探测由 `/usr/lib/modern/probe.lua` 执行，不做网段扫描 |
| 5 | CGI `modern-read` | `GET ?what=leases\|hosts\|resolv\|neighbors` | `{leases:[…]}` / `{hosts:[…]}` / `{nameservers:[…],search:[…]}` / `{neighbors:[{ip,mac,device,state}]}` | dnsmasq 运行时状态、内核邻居表（IPv4 ARP + IPv6 NDP） | 无 | sid 校验；路径是**字面常量**，请求不能自带路径 |
| 6 | CGI `modern-exec` | `POST {tool,target,…}` | `{tool,target,command,params,output,exit_code,duration_ms,truncated}` | ping / nslookup / traceroute / 路由表 / 监听端口 | 无（只执行白名单命令） | sid 校验；工具名白名单 5 个；目标字符集 `[A-Za-z0-9._:-]`；单次超时 ping 30 秒 / DNS 15 秒 / 路由跟踪 120 秒 / 路由表与监听端口 10 秒；输出 >200 KB 截断 |
| 7 | CGI `modern-proxy` | `GET ?path=…` / `POST {group,node}` | 核心的原始 JSON | `/version` `/configs` `/proxies` `/connections`、单组详情、延迟探测 | **切换策略组节点**（PUT `/proxies/<组>`） | sid 校验；控制口端口取自 `/tmp/ShellCrash/config.yaml`（回退 9999）；名字白名单（可打印字符，去掉 `"` `\` `/` `..`）；真正的授权是**向核心回读组成员表**；延迟探测 URL 只允许三个固定地址；缺 `curl` → 503 |
| 8 | CGI `modern-uci` | `POST {action,…}` | `{ok:true}` / `{token,expires_in}` / 服务列表原文 | 服务清单（`svc-list`） | 丢弃暂存（`uci-revert`）、提交（`uci-commit`）、应用（`uci-apply`）、重载 network/wifi/firewall、服务启停（`svc-action`）、改时区（`set-localtime`）、**改密码**（`chpasswd`，缺失时回退 BusyBox `passwd`）、**重启**、**恢复出厂**、备份 / 恢复 | sid 校验；配置文件名与服务名双重白名单；**危险动作需一次性令牌（120 秒、单次使用）**；用户名限 `[A-Za-z0-9._-]` 且不以 `-` 开头 |
| 9 | CGI `modern-pkg` | `POST {action,…}` | 包列表 / 计数 / `{job_id,status,output}` | 已装列表、仓库列表、检索、统计 | **安装 / 卸载 / 更新索引 / 全量升级** | sid 校验；**只支持 apk**（24.10+），只有 opkg 的固件所有 action 返回 501；包名字符集 `[A-Za-z0-9._+-]` 且不以 `-` 开头；写动作必须 `confirm=yes`；写动作是**后台任务**，用 `status` 轮询 |
| 10 | CGI `modern-sysupgrade` | `POST ?action=…` | 板卡 / 版本 / 文件列表 / 任务状态 | 固件信息、`/tmp` 下的固件与备份清单、更新检查、**固件校验（`verify`：大小 + 校验和对比）** | **上传固件**、**刷写固件**、备份、**恢复备份**、下载官方固件 | sid 校验；上传只允许 `.bin` / `.tar` / `.img` / `.gz` / `.itb` 且 ≤64 字符；官方镜像识别 `.bin` / `.img.gz` / `.itb`；上传 ≤40 MB；**刷写与恢复需令牌**（用途 `firmware-upgrade` / `backup-restore`）；`check-update` / `download` 需要 `curl` |
| 11 | CGI `modern-shellcrash` | `POST {action,params}` | 服务状态 / 配置键值 / 覆写文件清单 / 订阅概览 / 日志 | ShellCrash 服务与核心状态、白名单配置键、覆写文件启用状态、订阅概览（不含 token）、日志、CrashCore 自愈状态、**监听端口（`ports`：默认五端口 + 运行时 mixed/redir/tproxy/dns/controller 的并集）**、**自愈历史（`heal`）**、**订阅热更新状态（`sub-update-state`）**、**内核更新检测（`core-check`：已安装 / GitHub 最新版 / ShellCrash 版本表）** | **服务启停与开机自启**、**写白名单配置键**、**启停覆写文件**、**订阅热更新（`sub-update`，需核心在运行）** | sid 校验；**所有路径是字面常量**；`secret` 与订阅 URL **永不下发到浏览器**；写动作（含服务启停）需 `confirm=yes`；**服务启停是后台任务**：完成记录写在 `/tmp/ShellCrash/modern-shellcrash.last`，**完成记录 = 状态已到位**，前端等 `running` 变成期望值才回报成功；`core-check` **只检测不更新**，结果缓存 1 小时 |

> 表里列了 11 行：`/ubus` 拆成 3 行（`system`/`uci`、`luci-rpc`、`luci`），
> 加上 8 个 CGI（`modern-login` 除外）。按「传输 + 权限模型」算，通道仍是 **10 个**。

### 通道之外的三条特殊路径

| 路径 | 干什么 | 注意 |
| --- | --- | --- |
| `POST /cgi-bin/modern-login` | 用 root 密码换 ubus 会话 | 唯一**不需要 sid** 的 CGI；`timeout: 3600`；密码只出现一次，不写前端存储 |
| `POST /ubus`（匿名会话，仅登录页） | 试着读 `system.board`，拿设备型号与固件版本 | **不需要 sid**（用匿名会话 id）；多数路由器的 rpcd 默认拒绝（`Access denied`），此时登录页显示通用文案，型号在登录后的「概览」页显示；失败一律静默回退，不影响登录 |
| `GET /cgi-bin/modern-login` 之外的 `/cgi-bin/luci/**` | LuCI 应急入口 | 控制台**不写** LuCI，只保留它可访问 |

## 3. 路由器端 9 个 CGI 清单

| 文件 | 运行时 | 职责 | 写操作 |
| --- | --- | --- | --- |
| `deploy/modern-login` | ucode | 用 root 密码换取 ubus 会话（`sid` + `expires`） | 创建会话 |
| `deploy/modern-data` | ucode | 无线关联终端（luci-rpc → `iwinfo devices` → sysfs 逐级探测）、系统日志（`logread`）与设备指纹（`what=identify`，转 `/usr/lib/modern/probe.lua`） | 无 |
| `deploy/modern-read` | ucode | dnsmasq 租约、自定义 hosts、解析器配置、内核邻居表（`ip neigh` / `ip -6 neigh`） | 无 |
| `deploy/modern-exec` | sh | ping / nslookup / traceroute / 路由表 / 监听端口 | 只执行白名单命令 |
| `deploy/modern-proxy` | sh | 转发核心控制口 API（端口取自运行时配置）、测速、切换策略组节点 | 切换节点（PUT `/proxies`） |
| `deploy/modern-uci` | sh | 丢弃暂存改动、提交、应用、重载服务、改密码、重启、恢复出厂、备份 / 恢复 | 需令牌的动作会改系统 |
| `deploy/modern-pkg` | sh | apk 软件包列表 / 安装 / 卸载 / 索引更新 / 全量升级（opkg 固件返回 501） | 安装与卸载 |
| `deploy/modern-sysupgrade` | sh | 固件信息、上传固件、刷写、备份与恢复、官方更新检查与下载（官方镜像 `.bin` / `.img.gz` / `.itb`） | 刷写与恢复（需令牌） |
| `deploy/modern-shellcrash` | sh | ShellCrash 服务控制、白名单配置键、覆写文件、订阅概览、日志、自愈状态 | 服务启停与配置改写 |

**两个部署脚本不是 CGI**：`deploy/deploy.sh`（本地编排）与 `deploy/install-remote.sh`
（在路由器上解包与世代保留）。

### 所有 CGI 的共同约定

1. **会话校验**：sid 可来自 `?sid=` 或 `owrt_sid` Cookie；两者都要过
   `ubus call session get`（或等价校验），校验不过一律 `401 {"error":"unauthorized"}`。
2. **sid 字符集**：`[A-Za-z0-9._~+/=-]`，其它字符直接 401 —— sid 会被拼进 ubus 的 JSON 参数，
   不能让它逃出字符串。
3. **响应头**：`Content-Type: application/json; charset=utf-8` + `Cache-Control: no-store`
   —— **9 个 CGI 全部都有**；`X-Content-Type-Options: nosniff` 现在**也全部 9 个都有**
   （`modern-uci` 与 `modern-sysupgrade` 是今天刚补齐的）。
4. **错误码**：`401` 会话无效 / `400` 参数或动作不合法 / `403` 缺令牌或缺确认 /
   `404` 对象不存在 / `405` 方法不对 / `409` 冲突（订阅更新已在执行 / 核心未运行）/
   `413` 请求体过大 / `500` 内部失败 / `503` 依赖未就绪。
5. **路径与参数不来自请求**：所有文件路径都是脚本里的字面常量；用户输入只作为
   **一个已校验的引号参数**传给命令（`modern-exec`）或作为 **JSON 字符串字段**（其余）。
6. **必须 LF 换行**：CRLF 会让 shebang 报 `No such file or directory`。
7. **文件改写**：**没有 CGI 调用 `rename(2)` / `mktemp`**，实际做法是
   「**先备份 + 写临时文件 + 覆盖原 inode**」——
   - `modern-shellcrash` 的 `config-write`：先备份成 `ShellCrash.cfg.bak-<时间戳>`，
     再把临时文件写回**原 inode**（`cat > ShellCrash.cfg`），因此**保留原文件的权限与属主**；
     中途被打断时的恢复路径就是那份备份；
   - `modern-sysupgrade` 的固件上传：先写 `/tmp/.openwrt-firmware.bin.part`，
     再 `mv` 到 `/tmp/openwrt-firmware.bin`。

## 4. 目录结构与分层规则

```
OpenwrtConsole/
├─ src/
│  ├─ api/            21 个模块：19 个功能域模块 + configPending.ts（四个配置页共享的暂存区工具）+ proxyState.ts（浏览器本地出口状态）；只做「取数 / 发请求 / 解析成类型」
│  ├─ views/          页面组件；只做「展示与交互」，不直接 fetch
│  ├─ components/     44 个非归档组件（按域分子目录，带前缀）；新增 cfg-pending/ 、config-sc/ 、fw-verify/ 三个子目录，proxy-* / monitor-* / DraftNotice.vue 平铺在根
│  ├─ composables/    7 个：与视图解耦的响应式逻辑（轮询、主题、刷新、构建自愈、useDraft 草稿与未保存守卫、useMediaQuery 媒体查询、useLuciAvailability 入口探测）
│  ├─ layouts/        AppLayout（侧栏 + 顶栏 + 滚动内容）
│  ├─ plugins/        Element Plus 的显式注册与样式清单
│  ├─ router/         路由表与路由守卫
│  ├─ stores/         全局状态（会话）
│  ├─ styles/         设计令牌(tokens.css) / Element Plus 覆盖 / 布局
│  └─ utils/          纯函数工具（格式化、客户端合并、代理组解析、WAN 角色识别、OUI 与设备类型识别）
├─ deploy/            路由器端：9 个 CGI + 1 个探测助手（modern-probe.lua）+ 2 个部署脚本（不是 Node 代码）
├─ docs/              本目录
├─ public/            静态资源（favicon）
├─ index.html         含首屏主题脚本与启动守卫
├─ vite.config.ts     base '/modern/'、Element Plus 按需引入、开发代理
├─ package.json       依赖与脚本
└─ tsconfig.json      `@` → src 的别名来源
```

### 分层规则（越层即视为缺陷）

| 层 | 可以依赖 | **不可以**做 |
| --- | --- | --- |
| `views/` | `components/` `composables/` `api/` `stores/` | 直接 `fetch`；直接读 `localStorage` 里的会话；持有跨页面的全局状态（**页面级草稿与暂存记录除外**，见下方例外） |
| `components/` | `composables/` `utils/` `api/`（只读型） | 依赖某个具体 view；改全局状态 |
| `api/` | `api/ubus.ts` `api/uci.ts` `api/systemOps.ts` | 依赖 `views/`；自己拼 URL 字符串（统一从常量来）；**依赖 `composables/`**（`configPending.ts` 一处，见下方例外） |
| `composables/` | `utils/` `api/` | 依赖 `views/` |
| `utils/` | 无（纯函数） | 依赖 `api/` `views/` |
| `stores/` | `api/ubus.ts` | 依赖 `views/` |
| `deploy/modern-*` | 无（路由器上的独立程序） | 依赖 `src/`；**接受请求传来的文件路径** |

> **v4 打破了两条分层规则（已知例外，不是新规范）**：
> ① `src/api/configPending.ts` **反向依赖** `composables/useDraft` 的 `Draft` 类型 ——
> 暂存区工具要读草稿的类型，只能从 `composables` 引；这是**纯类型 import**，不构成运行时依赖；
> ② 四个可写配置视图（网络 / 无线 / 防火墙 / DHCP 与系统设置）**自己持有草稿与暂存记录状态**
> —— 一份 `useDraft` 草稿 + 一份本地 `StagedEdit` 列表，页面级状态没有下沉到 `api/` 或 `composables/`。

### 两条命名硬规则

1. **视图文件统一 `XxxView.vue`**，并在文件里导出 `defineOptions({ name: 'XxxView' })`。
   > **已补齐**：20 个视图文件（含归档的 `_archive/FirewallView.vue`）**全部**导出了
   > `defineOptions({ name: 'XxxView' })`，`name` 与文件名逐个一致。
2. **新增 Element Plus 组件时，必须把它的样式加进 `src/plugins/element.ts`**。
   > 原因：该文件里的样式被**提到入口 chunk** 里加载；只写模板而不加样式，
   > 组件样式会落进懒加载的 view chunk，晚于 `src/styles/element.css` 加载而失效
   > （表现为「组件没有样式」）。命令式服务（`ElMessage` / `ElMessageBox`）
   > 更是解析器看不见的，只能靠这个文件引入。

## 5. 前端调用的三个统一入口

| 入口 | 文件 | 用途 |
| --- | --- | --- |
| `ubusCall(object, method, params)` | `src/api/ubus.ts` | 调 `/ubus`；自动带 sid；`-32002` 视为会话过期并广播 `owrt:session-expired` 事件 |
| `cgiGet(path)` | `src/api/ubus.ts` | GET 形式的 CGI；自动把 sid 拼进查询串；`401` 视为会话过期 |
| `runSystemOp(action, params)` | `src/api/systemOps.ts` | POST 形式的 `modern-uci`；带 sid；把错误码翻成中文 |

其它 CGI（`modern-pkg` / `modern-sysupgrade` / `modern-shellcrash` / `modern-proxy` /
`modern-exec`）各有一个自己的薄封装模块，**不共用** `runSystemOp` ——
它们的请求体形状与错误语义各不相同。全部薄封装模块（14 个）：
`packages` / `firmware` / `shellcrashConfig` / `proxyActions` / `proxyState` /
`diagnostics` / `ops` / `dns` / `monitor` / `setup` / `systemSettings` /
`firewallConfig` / `networkConfig` / `wirelessConfig`。

**会话过期的统一处理**：所有入口在判定会话失效时
`window.dispatchEvent(new Event('owrt:session-expired'))`，
由 `src/router/index.ts` 统一接住并跳回 `/login`。
