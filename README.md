<div align="center">

<img src="assets/logo.png" width="128" alt="OpenWrt 现代 Web 控制台">

</div>

# OpenWrt Console

> **可见性**：公开 —— 仓内**零凭据、零设备标识**；vendored 只有 art-design-pro（MIT）。第三方组件声明见 [NOTICE](NOTICE)。

> **一句话**：给**任意 OpenWrt 设备**用的、**替代 LuCI** 的现代 Web 管理界面 —— 部署在路由器的 `/modern/` 路径下，
> 看状态、改配置、装软件、刷固件、重启都在一个界面里做完，LuCI 只留作应急入口。

访问地址取决于你自己的路由器（多数是 `https://10.0.0.1/modern/`，`10.0.0.1` 只是默认网关的通行默认值）：
<https://<路由器IP>/modern/>

---

## 这是什么

一个基于 [art-design-pro](https://github.com/Daymychen/art-design-pro) 设计语言的 OpenWrt 管理控制台，
用 Vue 3 + Vite + TypeScript 写成，编译成静态文件丢进路由器的 `/www/modern/`。

它**不重造** OpenWrt 的管理能力，而是复用路由器本来就有的两套后端：

- **rpcd / ubus**：标准 UCI 配置的读写（`uci.get/set/add/delete/commit/apply`）；
- **9 个 root CGI**（`/www/cgi-bin/modern-*`）：rpcd 会话被 ACL 挡住的部分 —— 无线关联终端、
  dnsmasq 运行时状态、诊断命令、mihomo 代理桥、特权写操作、apk 软件包、固件刷写、ShellCrash 设置。

一句话分工：**读走 ubus，写标准配置走 rpcd，特权动作走 root CGI。**

## 适用环境

| 项 | 要求 |
| --- | --- |
| 路由器 | 任意 OpenWrt（需 uhttpd + ubus/rpcd，默认配置即满足） |
| 前端工具链 | Node.js 20+（`npm` 随 Node 一起装）、npm 10+ |
| 路由器访问 | 路由器已启用 uhttpd 的 `/ubus` 与 CGI（OpenWrt 默认配置即满足）；路由器 uhttpd 默认自签证书，浏览器首次访问会警告 |
| 登录方式 | SSH 到 `root@<路由器IP>`（密码登录需配 `SSH_ASKPASS`，见 [DEPLOY.md](DEPLOY.md)）；控制台登录用的就是路由器的 root 密码 |
| 可选依赖 | ShellCrash（不装也能用，只是「代理」「ShellCrash」页会显示未检测到服务） |

> `<路由器IP>` 需要你自己替换。多数路由器的 LAN 地址是 `10.0.0.1`（默认网关的通行默认值），
> 也有 `192.168.1.1` 之类 —— 以你设备实际能打开的那个地址为准。

### 已验证环境

下面是本控制台**真机装过、逐页点过**的组合。它是**验证环境**，不是**支持范围** ——
控制台不针对任何型号做特化，上表的要求满足就能用：

| 设备 | 固件 | 芯片 |
| --- | --- | --- |
| 小米 AX3000T | OpenWrt 25.12.6 | MT7981 |

> 登录页只显示通用文案 —— 多数路由器的 rpcd 默认不允许未登录读取 `system.board`。
> **设备型号与固件版本在登录后的「概览」页显示**（部分机型也允许未登录读取，那样登录页会直接显示型号）。

## 快速开始

### 本地开发

```bash
npm install
npm run dev
```

打开 <http://localhost:5173/modern/>。Vite 把 `/ubus` 与 `/cgi-bin` 代理到你的路由器
（见 `vite.config.ts`），所以本地开发直接吃真实路由器数据，登录密码就是路由器 root 密码。

默认代理目标是 `https://10.0.0.1`（默认网关的通行默认值）。**指向别的设备**用环境变量覆盖：

```bash
ROUTER_URL=https://192.168.1.1 npm run dev
```

> `base` 固定为 `/modern/`，本地也是 `/modern/` 路径，别用 `/` 打开。

### 构建与部署

```bash
npm run build                          # 产物在 dist/
ROUTER_HOST=root@<路由器IP> ./deploy/deploy.sh
```

> `ROUTER_HOST` 不设时默认是 `root@10.0.0.1`；`ROUTER_WEB` 可覆盖部署目录（默认 `/www/modern`）。

部署脚本把 `dist/` 推到 `/www/modern`，把 9 个 `deploy/modern-*` 推到 `/www/cgi-bin/`。
完整步骤、缓存与世代保留机制、回退命令见 [DEPLOY.md](DEPLOY.md)。

> ℹ️ `deploy/deploy.sh` 的 for 循环原先含一个字面 `\n`（反斜杠 + n），会让 `set -eu` 下
> 部署在第 7 次迭代静默退出，导致 `modern-pkg` / `modern-sysupgrade` / `modern-shellcrash`
> **三个 CGI 永远不会被部署**。**本版已修**（改成真换行 + 续行反斜杠，`sh -n` 通过）。
> 详见 [CHANGELOG.md](CHANGELOG.md) 的「修复」段与 [docs/TROUBLESHOOTING.md](docs/TROUBLESHOOTING.md#6-部署后资源-404)。

## 功能

| 分区 | 能做什么 |
| --- | --- |
| **概览** | 设备型号、固件、WAN/LAN/IPv6、运行时间、实时流量曲线、接口、无线、最近客户端、ShellCrash 当前出口 |
| **网络** | WAN / WAN6 / LAN 摘要、全部接口表、网络设备计数与错误统计 |
| **无线** | 射频 / SSID / 信道 / 发射功率、平均信号、关联终端信号与链路速率 |
| **客户端** | DHCP 租约与无线终端的合并视图，支持搜索与有线/无线筛选 |
| **防火墙** | 安全区域、默认策略、区域转发、端口转发、出站规则、流量卸载 —— **可写**（`src/views/config/FirewallConfigView.vue`，含「保存并应用 / 放弃修改」）；旧的只读页已归档到 `src/views/_archive/FirewallView.vue`，`firewall` 路由已删 |
| **DNS** | dnsmasq 上游、地址池、静态租约、当前租约、自定义主机名 |
| **代理** | ShellCrash / mihomo 运行状态、策略组、当前出口（解析嵌套选择器）、活动连接、运行配置，可**直接切换策略组节点**（二次确认后写入 mihomo） |
| **诊断** | ping / DNS 解析 / 路由跟踪 / 路由表 / 监听端口，命令在路由器本地执行 |
| **系统** | 固件与内核信息、内存/存储/交换分区、系统日志、重启 |
| **配置（可写）** | 网络配置（接口 / 静态路由）、无线配置（SSID / 射频）、防火墙配置（区域 / 默认策略 / 区域转发 / 端口转发 / 出站规则 / 流量卸载）、DHCP 与系统设置（主机名 / 时区 / 地址池 / 静态租约 / 管理员密码）。四个页面统一「暂存 → 提交 → 应用」：改动先写**本地草稿**（浏览器 localStorage，键前缀 `owrt-draft:*`，刷新不丢）并**暂存进 UCI 暂存区**；点「保存并应用」才提交并重载对应服务，点「放弃修改」把暂存区回滚回当前生效的内容 |
| **软件包** | apk 已装列表、仓库检索、安装与卸载、索引更新与全量升级 |
| **固件与备份** | 固件上传与校验刷写、配置备份与恢复（需一次性令牌 + 确认词） |
| **监控与流量** | 资源曲线、接口速率、客户端在线与速率历史 |
| **服务与运维** | 服务启停与开机自启、进程、存储挂载、连接跟踪、备份、重启、恢复出厂 |
| **ShellCrash 设置** | 服务启停与开机自启、核心设置（白名单键）、覆写文件启停、订阅概览、运行日志与 CrashCore 自愈状态 |
| **首次配置向导** | 未配置状态下引导设置密码、时区、无线与上网方式 |

其它：深浅色主题、移动端抽屉导航、键盘焦点样式、4.5:1 文本对比度。

## 技术栈与产物体积

- **Vue 3** + **Vite 6** + **TypeScript** + Vue Router（hash 路由）
- **Element Plus**（按需引入：模板级自动导入 + 命令式服务显式注册以保留中文 locale）
- **ECharts 5**（只注册折线图）
- **Lucide** 图标
- 原生 CSS 设计令牌（取自 art-design-pro，**未引入 Tailwind**）

### 产物体积（同步前基线）

| 产物 | 原始 | gzip |
| --- | --- | --- |
| 首屏入口 JS | 255 KB（261 568 B） | 94 KB（96 651 B） |
| 首屏入口 CSS | 160 KB（163 619 B） | 23 KB（23 708 B） |
| **首屏合计** | **415 KB** | **117 KB**（120 359 B） |

> ⚠️ **本节数字是「同步前基线」**：2026-10-20 17:49 在源目录上的一次构建实测值，
> 取自 **v4 / v5 / v6 三批改动之前**，**不代表当前产物的体积** —— 今天同步进来的
> 四个可写配置页、ShellCrash 保存链路修复与服务动作状态跟踪都还没进这组数字。
> 本仓是快照、不含 `dist/`，复测请先 `npm run build` 再量。
>
> 旧 README 与 `PROGRESS.md` 记的是「JS 250 KB / CSS 139 KB / 合计 389 KB / gzip 113 KB」，
> 那组数字对应的是更早的一次构建。

其它体积事实：

- Element Plus **全量引入**时首屏是 1.42 MB（gzip 396 KB）；按需引入后首屏降到上面的
  415 KB / gzip 117 KB —— 体积减少约 **71%**。
- 最大的剩余块是 **`BaseChart` chunk（483 406 B ≈ 472 KB）**，里面装的是 ECharts。
  旧 README 把它归因成「`DashboardView` 的 498 KB」——**归因错了**：`ECharts` 在 `BaseChart` 里，
  而 `BaseChart` 被 `DashboardView` 与 `config/MonitorView` **两个**页面引用，随页面懒加载。
- 每一代 chunk 约 1.4 MB；部署侧只保留「当前代 + 上一代」（见 [docs/MAINTENANCE.md](docs/MAINTENANCE.md)）。

## 认证链路

```
浏览器 ──POST /cgi-bin/modern-login {username,password}──▶ ucode CGI
                                                            └─ ubus session.login(timeout=3600) ─▶ rpcd
       ◀────────────── { sid, expires } ──────────────────┘
浏览器 ──POST /ubus   {params:[sid, object, method, params]}──▶ uhttpd ─▶ rpcd
                                                            └─ uci.set/add/delete/commit/changes（四个配置页的暂存与提交）
浏览器 ──GET  /cgi-bin/modern-data?sid=…   (stations / logs)
浏览器 ──GET  /cgi-bin/modern-read?sid=…    (leases / hosts / resolv)
浏览器 ──POST /cgi-bin/modern-exec?sid=…    (白名单诊断命令)
浏览器 ──GET  /cgi-bin/modern-proxy?path=…&sid=…  (mihomo 只读)
浏览器 ──POST /cgi-bin/modern-proxy?sid=…         (切换策略组节点)
浏览器 ──POST /cgi-bin/modern-uci?sid=…     (丢弃暂存/提交/应用/重载服务/服务启停/改时区/改密码/重启/备份)
浏览器 ──POST /cgi-bin/modern-pkg?sid=…     (apk 列表与安装)
浏览器 ──POST /cgi-bin/modern-sysupgrade?sid=…&action=… (固件上传与刷写)
浏览器 ──POST /cgi-bin/modern-shellcrash?sid=… (ShellCrash 服务与设置)
```

几个必须记住的实现约束（都是踩出来的坑）：

- LuCI 的 `sysauth` Cookie 是 **HttpOnly** 且路径限定在 `/cgi-bin/luci/`，**不能复用**。
- uhttpd **不转发自定义请求头**（如 `X-Session`），所以 CGI 认证只能走 Cookie 或查询参数；
  自签 HTTPS 下浏览器会拒收 `Secure` Cookie —— 最终统一改为**查询参数 + localStorage**。
- 登录会话的 ACL 能调 `system.*` / `network.*` / `luci-rpc.*`，但调 `session.get` 会 **Access denied**；
  前端因此用 `system.info` 当会话存活探针。
- `iwinfo assoclist` **只有 root 能读**，且 `luci-rpc getWirelessDevices` 返回的 `stations` 可能为空，
  所以无线终端由 CGI 调 `ubus call iwinfo assoclist`。
- assoclist 的 `rx.rate` / `tx.rate` 单位是 **Kbit/s**，不是 bit/s。
- CGI 脚本必须 **LF 换行**，CRLF 会让 shebang 报 `No such file or directory`。

## 数据来源

| 数据 | 来源 |
| --- | --- |
| 固件 / 型号 / 主机名 | `/ubus` → `system.board` |
| 负载 / 内存 / 存储 / 运行时间 | `/ubus` → `system.info` |
| 接口地址 / 网关 / DNS | `/ubus` → `network.interface dump` |
| 设备计数与错误统计 | `/ubus` → `luci-rpc.getNetworkDevices` |
| 无线射频 / SSID / 信道 / 功率 | `/ubus` → `luci-rpc.getWirelessDevices` |
| 无线终端信号与链路速率 | CGI `modern-data?what=stations`（内部 `ubus call iwinfo assoclist`） |
| DHCP 租约（合并视图） | `/ubus` → `luci-rpc.getDHCPLeases` + CGI `modern-read?what=leases` |
| 主机名 / MAC / IP 映射 | `/ubus` → `luci-rpc.getHostHints` |
| 防火墙区域 / 转发 / 规则 | `/ubus` → `uci.get firewall` |
| UCI 暂存区（待应用的改动） | `/ubus` → `uci.changes` |
| DNS 上游 / 地址池 / 静态租约 | `/ubus` → `uci.get dhcp` + CGI `modern-read?what=resolv|hosts` |
| 系统日志 | CGI `modern-data?what=logs`（内部 `logread`） |
| 诊断输出 | CGI `modern-exec`（命令白名单，路由器本地执行） |
| 进程 / 挂载 / 连接跟踪 / LED | `/ubus` → `luci.getProcessList` / `getMountPoints` / `getConntrackList` / `getLEDs` |
| 服务列表 | CGI `modern-uci` 的 `svc-list`（内部 `ubus call luci getInitList`）；`/ubus` → `service.list` 只补 running / instances |
| 时区表 | `/ubus` → `luci.getTimezones` |
| 代理状态 / 策略组 / 出口 | CGI `modern-proxy?path=/configs|/proxies`（转发 mihomo `127.0.0.1:9999`，secret 不出路由器） |
| 代理出口的变更时间 | 浏览器 localStorage `owrt:proxy-exit`（路由器不记住出口切换，浏览器自己记） |
| 软件包 | CGI `modern-pkg`（apk） |
| 固件 / 备份 | CGI `modern-sysupgrade` |
| 固件校验 | CGI `modern-sysupgrade` 的 `verify`（大小 + sha256） |
| ShellCrash 配置 / 覆写 / 订阅 / 日志 | CGI `modern-shellcrash` |
| ShellCrash 监听端口 / 自愈历史 | CGI `modern-shellcrash` 的 `ports`（5 个端口）/ `heal` |
| 配置页草稿 | 浏览器 localStorage `owrt-draft:*`（刷新不丢，提交后清除） |

通道的完整说明（走什么、返回什么、能读什么、能写什么、授权边界）见
[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)；9 个 CGI 的请求 / 响应 JSON 形状见
[docs/CGI-CONTRACT.md](docs/CGI-CONTRACT.md)。

## 限制

- **rpcd 的 UCI 访问是按配置文件名授权的**：可写的只有
  `dhcp` / `firewall` / `network` / `system` / `wireless` / `dropbear` / `luci` / `opkg` / `ntp` / `timeserver`；
  其它配置文件一律 `Invalid argument`，**新建自定义配置文件也不行**。
- **诊断命令走白名单**：`ping` / `dns` / `trace` / `routes` / `ports` 五个固定工具，
  单次最长 **12 秒**，输出超过 **200 KB（204 800 字节）截断**，目标地址只允许 `[A-Za-z0-9._:-]`。
- **`/www/modern` 不在 `sysupgrade.conf` 的保留清单里** —— 路由器刷机会**丢掉整个控制台**，
  需要重新部署。这是当前最容易被忘掉的一条风险。
- **特权动作分三档**（一次性令牌 120 秒、单次使用，由 CGI 自己签发与核销）：
  - **令牌 + 二次确认**：改密码、重启、恢复出厂、备份恢复、固件刷写
    （刷固件 / 恢复备份 / 恢复出厂这三项还要手动输入确认词 `UPGRADE` / `RESTORE` / `RESET`）；
  - **只要 `confirm=yes`**：apk 安装与卸载、ShellCrash 配置写入、覆写文件启停、订阅热更新；
  - **服务端不要求二次确认**：丢弃暂存、提交、应用、重载服务、服务启停
    （前端可能另弹一次确认框，服务端不拦）。
- 开机引导（firstboot）、分区表编辑不在控制台范围内。
- **swconfig 端口**未做移植：swconfig 是老式 MIPS 设备上配置交换芯片的框架，本控制台走
  netconfig 路线（`network.*` / `netifd`），在 netconfig 设备上本来就不适用。
- **各家设备的细节不一样**：接口名、分区布局、包管理器（apk / opkg）、ShellCrash 的安装路径都可能不同。
  控制台对常见差异做了通用处理，但个别页面的字段仍以实际设备为准。
- `sid` 通过查询参数传给 CGI，可能出现在 uhttpd 访问日志里 —— 这是本机 LAN + HTTPS 下的折中。
- **绝对不要在路由器上做递归扫描或全盘搜索**（`grep -r /etc /var`、`find /`、遍历 overlay 或 `/tmp`）：
  已有先例把 233 MB 内存打满并触发看门狗重启。只允许读**单个已知路径的文件**，或用 ubus 精确取数据。

## 仓库现状说明

本仓是**从上游 OpenWrt 运维仓的 `frontend/` 目录**复制出来的快照，用于让控制台能独立上传 GitLab、
独立看懂、独立演进。源目录仍在前端开发线里被活跃修改，两边**不会自动同步**。

- **快照时间**：初版 2026-10-20 18:24；**已同步到源目录 2026-10-20 23:20 的状态**。
- **当前与源目录的关系（2026-10-20 23:20 逐文件比对）**：

  | 范围 | 与源目录的关系 |
  | --- | --- |
  | `src/` + `deploy/` | **已同步**：`src/` + `deploy/` 共 **118 个文件**（源目录 117 + 本仓自有的 `src/api/device.ts`），本次同步实际改动 **59 个文件**（**44 改 + 15 新增**），含 v3 写入层收口、v4 四个配置页、v5 ShellCrash 保存链路修复、v6 服务动作状态跟踪。本仓自己的 **5 处更新**保留：`src/api/device.ts`（新）、`src/views/LoginView.vue`（真实机型）、`vite.config.ts`（`ROUTER_URL` 环境变量）、`src/api/firmware.ts`（脱敏注释）、`src/views/config/FirmwareView.vue`（注释脱敏） |
  | `README.md`、`DEPLOY.md`、`docs/` 全套 | **本仓重写版**，不再是源目录副本 |
  | `DESIGN.md`、`docs/V2-CONTRACT.md`、`docs/V3-CONTRACT.md` | 仍是源目录副本，待重写（见下表） |

  同步后 `vue-tsc --noEmit` 零报错、`vite build` 通过。

- **本仓已按独立仓库重写**：`README.md`（本文）、`AGENTS.md`、`CHANGELOG.md`、`NOTICE`、`.gitignore`、
  `docs/` 全套（索引、架构、CGI 契约、写入层、排错、维护、Release 说明）。
- **仍是源目录副本、需要后续同步的**：

  | 文件 | 现状 | 待办 |
  | --- | --- | --- |
  | ~~`PROGRESS.md`~~ | **已重写** | 阶段清单已补 v4/v5/v6 三批 |
  | `DESIGN.md` | 源目录副本 | 「防火墙与 DNS 页保持只读，修改仍交给 LuCI」已**过期** —— 防火墙（连同网络 / 无线 / DHCP 与系统设置）现已**可写**；**只有 DNS 状态页仍只读**，地址池与静态租约的修改入口在「DHCP 与系统设置」页 |
  | `docs/V2-CONTRACT.md` | 源目录副本 | 一次性的并行开发契约，其中「文件归属表」已失效 |
  | `docs/V3-CONTRACT.md` | 源目录副本 | 同上；其中**长期有效**的 rpcd 授权边界与写入范式已提炼进 [docs/WRITE-LAYER.md](docs/WRITE-LAYER.md) |
- **已知缺陷清单**（本仓文档已登记，代码未修）：**DHCP 配置被建模了两次** ——
  `src/api/dns.ts` 的 `getDhcpSettings` 与 `src/api/systemSettings.ts` 的
  `parseDnsmasq` / `parsePools` / `parseLeases` 读的是同一份 `uci.get dhcp`；
  `UciSection` 类型也定义了**两份**（`src/api/uci.ts` 与 `src/api/dns.ts`）。
  逐条见 [CHANGELOG.md](CHANGELOG.md) 的「修复」段 —— 那一段同时收录已修与待修，
  **带「待修」标记的**才是仍未动的。

## 记忆文档

`memories/` —— **只靠读代码和文档读不出来的事实**：踩过的坑、根因、实测结论、
已确认但未修的缺陷。同样的内容也存在于 ZCode 的记忆库（按项目 id 分目录），
那里是活的，这里是**随 git 版本化的快照**。

索引见 [memories/MEMORY.md](memories/MEMORY.md)，约定见
[memories/README.md](memories/README.md)。

## 免责声明

本项目仅供学习与个人使用。

- 本项目与各路由器厂商、OpenWrt 官方、LuCI、ShellCrash、mihomo 及其关联方**不存在任何隶属、合作、授权或支持关系**。
- 控制台以 **root 权限**在路由器上执行命令（诊断、配置写入、软件包安装、固件刷写、恢复出厂）。
  **刷固件 / 恢复出厂 / 改密码 / 重启属于不可逆或高风险操作**，务必确认固件来源可靠，并先做配置备份。
- 自行部署到生产路由器前，先在备份机上完整跑一遍「浏览 → 改一项配置 → 撤销 → 重启」。
- 本项目不对因使用本控制台造成的设备变砖、网络中断、配置丢失承担任何责任。
- 请勿把 `/modern/` 暴露到 WAN；本控制台**没有**做额外的访问控制，它复用的是路由器 root 账号的权限。

## 开源鸣谢

本项目建立在这些开源项目之上：

| 项目 | 用途 | 是否随仓分发 |
| --- | --- | --- |
| [**Vue**](https://github.com/vuejs/core) | 前端框架 | 否（构建时按包管理解析） |
| [**Vite**](https://github.com/vitejs/vite) · [**Vue Router**](https://github.com/vuejs/router) | 构建工具 / 路由 | 否 |
| [**TypeScript**](https://github.com/microsoft/TypeScript) | 类型系统 | 否 |
| [**Element Plus**](https://github.com/element-plus/element-plus) | UI 组件库（按需引入） | 否 |
| [**ECharts**](https://github.com/apache/echarts) | 图表（仅折线图） | 否 |
| [**Lucide**](https://lucide-icons/lucide) | 图标 | 否 |
| [**art-design-pro**](https://github.com/Daymychen/art-design-pro) | 设计令牌的视觉基线 —— 本仓 `src/styles/tokens.css` 的色值逐个对应它的 `--art-gray-*` / `--default-*`（未引入 Tailwind） | **是** —— 原样 vendor 在 [third-party/art-design-pro/](third-party/art-design-pro/)，commit `f3aaf58e`，MIT，上游 LICENSE 一并保留 |
| [**OpenWrt**](https://github.com/openwrt/openwrt) / [**LuCI**](https://github.com/openwrt/luci) | 目标平台与对照实现（本项目只**调用**它们的接口，不含其代码） | 否 |

**随仓分发的上游项目**索引见 [third-party/README.md](third-party/README.md) —— 每个项目的
来源 URL、许可证、vendor 的 commit SHA 与「为什么 vendor」都在那里；
单个项目的来源凭证在它自己的 `UPSTREAM.md` 里。

第三方组件的完整许可证声明见 [NOTICE](NOTICE)。


## 参与与治理

- [CONTRIBUTING.md](CONTRIBUTING.md) —— 怎么把项目跑起来、组件与样式规范、提交前要跑的自检
- [SECURITY.md](SECURITY.md) —— 安全问题怎么报、危险动作的边界在哪
- [tools/check-docs.py](tools/check-docs.py) —— 文档自检（链接 / 锚点 / 引言块 / 孤儿），CI 里跑的就是它
- CI：`.gitlab-ci.yml`（类型检查 + 构建 + 文档自检）

---

## 许可证

本仓库按 **MIT License** 发布 —— 许可证全文见 [LICENSE](LICENSE)。

> 本仓不包含任何 GPL-3.0 派生件（ShellCrash 的派生件在兄弟仓 `ShellcrashRules`），
> 因此整仓 MIT 成立。引用的第三方组件（Vue / Vite / TypeScript / Element Plus /
> ECharts / Lucide / art-design-pro）各自适用其自己的许可证。

第三方组件的版权与许可证声明见 [NOTICE](NOTICE)。

## 文档地图

- [docs/README.md](docs/README.md) —— docs 唯一索引
- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) —— 三层数据流与通道表
- [docs/CGI-CONTRACT.md](docs/CGI-CONTRACT.md) —— 9 个 CGI 的请求 / 响应 JSON 形状
- [docs/WRITE-LAYER.md](docs/WRITE-LAYER.md) —— 授权白名单与写入范式
- [docs/TROUBLESHOOTING.md](docs/TROUBLESHOOTING.md) —— 按现象排错
- [docs/MAINTENANCE.md](docs/MAINTENANCE.md) —— 构建、部署、世代保留、回退
- [docs/DOC-RULES.md](docs/DOC-RULES.md) —— 文档规则正本
- [DEPLOY.md](DEPLOY.md) —— 部署细则（源目录副本，待同步）
- [DESIGN.md](DESIGN.md) —— 设计令牌与组件规范（源目录副本，待同步）
- [third-party/README.md](third-party/README.md) —— 随仓分发的上游开源项目索引（来源 / 许可证 / SHA / 为什么 vendor）
- [AGENTS.md](AGENTS.md) —— 机器协议（子代理协作约定）
- [CHANGELOG.md](CHANGELOG.md) —— 变更历史与待修缺陷
