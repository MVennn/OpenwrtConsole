<div align="center">

<img src="https://gitlab.com/M.Venn/OpenwrtConsole/-/raw/main/assets/logo.png" width="128" alt="OpenwrtConsole">

# OpenwrtConsole

**给任意 OpenWrt 设备用的、替代 LuCI 的现代 Web 管理界面** —— 部署在路由器的 `/modern/` 路径下。

看状态、改配置、装软件、刷固件、重启，一个界面里做完。

![流水线](https://gitlab.com/M.Venn/OpenwrtConsole/badges/main/pipeline.svg) ![源码仓库](https://img.shields.io/badge/源码仓库-GitLab-FC6D26?logo=gitlab&logoColor=white) ![问题反馈](https://img.shields.io/badge/问题反馈-Issues-FC6D26?logo=gitlab&logoColor=white) ![Vue 3](https://img.shields.io/badge/Vue-3-4FC08D?logo=vuedotjs&logoColor=white) ![OpenWrt](https://img.shields.io/badge/OpenWrt-任意设备-00B5E2?logo=openwrt&logoColor=white) ![Node.js](https://img.shields.io/badge/Node.js-20%2B-339933?logo=node.js&logoColor=white) ![License](https://img.shields.io/badge/License-MIT-blue)

</div>

---

> **一句话**：Vue 3 + Vite + TypeScript 编译成静态文件丢进路由器的 `/www/modern/`，LuCI 只留作应急入口 —— 读走 ubus，写标准配置走 rpcd，特权动作走 9 个 root CGI。

## 这是什么

一个基于 [art-design-pro](https://github.com/Daymychen/art-design-pro) 设计语言的 OpenWrt 管理控制台。
它**不重造** OpenWrt 的管理能力，而是复用路由器本来就有的两套后端：

- **rpcd / ubus**：标准 UCI 配置的读写（`uci.get/set/add/delete/commit/apply`）；
- **9 个 root CGI**（`/www/cgi-bin/modern-*`）：rpcd 会话被 ACL 挡住的部分 —— 无线关联终端、
  dnsmasq 运行时状态、诊断命令、mihomo 代理桥、特权写操作、apk 软件包、固件刷写、ShellCrash 设置。

部署后访问 `https://<路由器IP>/modern/`（`10.0.0.1` 只是默认网关的通行默认值，以你设备实际地址为准）。
三层数据流与通道表见
[docs/ARCHITECTURE.md](https://gitlab.com/M.Venn/OpenwrtConsole/-/blob/main/docs/ARCHITECTURE.md)，
9 个 CGI 的请求 / 响应 JSON 形状见
[docs/CGI-CONTRACT.md](https://gitlab.com/M.Venn/OpenwrtConsole/-/blob/main/docs/CGI-CONTRACT.md)。

## 适用环境

| 项 | 要求 |
|---|---|
| 路由器 | 任意 OpenWrt（需 uhttpd + ubus/rpcd，默认配置即满足） |
| 前端工具链 | Node.js 20+（`npm` 随 Node 一起装）、npm 10+ |
| 路由器访问 | uhttpd 已启用 `/ubus` 与 CGI（默认即满足）；uhttpd 默认自签证书，浏览器首次访问会警告 |
| 登录方式 | SSH 到 `root@<路由器IP>`（密码登录需配 `SSH_ASKPASS`，见 [DEPLOY](https://gitlab.com/M.Venn/OpenwrtConsole/-/blob/main/DEPLOY.md)）；控制台登录用的就是路由器的 root 密码 |
| 可选依赖 | ShellCrash（不装也能用，只是「代理」「ShellCrash」页会显示未检测到服务） |

**已验证环境**（验证环境，不是支持范围 —— 上表满足就能用）：

| 设备 | 固件 | 芯片 |
|---|---|---|
| 小米 AX3000T | OpenWrt 25.12.6 | MT7981 |

## 快速开始

### 本地开发

```bash
npm install
npm run dev
```

打开 <http://localhost:5173/modern/>。Vite 把 `/ubus` 与 `/cgi-bin` 代理到你的路由器
（见 `vite.config.ts`），所以本地开发直接吃真实路由器数据，登录密码就是路由器 root 密码。
默认代理目标是 `https://10.0.0.1`；指向别的设备用环境变量覆盖：

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
完整步骤、缓存与世代保留机制、回退命令见 [DEPLOY](https://gitlab.com/M.Venn/OpenwrtConsole/-/blob/main/DEPLOY.md)。

## 功能

| 分区 | 能做什么 |
|---|---|
| **概览** | 设备型号、固件、WAN/LAN/IPv6、运行时间、实时流量曲线、接口、无线、最近客户端、ShellCrash 当前出口 |
| **网络** | WAN / WAN6 / LAN 摘要、全部接口表、网络设备计数与错误统计 |
| **无线** | 射频 / SSID / 信道 / 发射功率、平均信号、关联终端信号与链路速率 |
| **客户端** | DHCP 租约与无线终端的合并视图，支持搜索与有线/无线筛选 |
| **防火墙** | 安全区域、默认策略、区域转发、端口转发、出站规则、流量卸载 —— **可写** |
| **DNS** | dnsmasq 上游、地址池、静态租约、当前租约、自定义主机名 |
| **代理** | ShellCrash / mihomo 运行状态、策略组、当前出口（解析嵌套选择器）、活动连接、运行配置，可**直接切换策略组节点**（二次确认后写入 mihomo） |
| **诊断** | ping / DNS 解析 / 路由跟踪 / 路由表 / 监听端口，命令在路由器本地执行 |
| **系统** | 固件与内核信息、内存/存储/交换分区、系统日志、重启 |
| **配置（可写）** | 网络配置（接口 / 静态路由）、无线配置（SSID / 射频）、防火墙配置、DHCP 与系统设置（主机名 / 时区 / 地址池 / 静态租约 / 管理员密码）。四个页面统一「暂存 → 提交 → 应用」：改动先写**本地草稿**（浏览器 localStorage，刷新不丢）并**暂存进 UCI 暂存区**；点「保存并应用」才提交并重载对应服务，点「放弃修改」把暂存区回滚回当前生效的内容 |
| **软件包** | apk 已装列表、仓库检索、安装与卸载、索引更新与全量升级 |
| **固件与备份** | 固件上传与校验刷写、配置备份与恢复（需一次性令牌 + 确认词） |
| **监控与流量** | 资源曲线、接口速率、客户端在线与速率历史 |
| **服务与运维** | 服务启停与开机自启、进程、存储挂载、连接跟踪、备份、重启、恢复出厂 |
| **ShellCrash 设置** | 服务启停与开机自启、核心设置（白名单键）、覆写文件启停、订阅概览、运行日志与 CrashCore 自愈状态 |
| **首次配置向导** | 未配置状态下引导设置密码、时区、无线与上网方式 |

其它：深浅色主题、移动端抽屉导航、键盘焦点样式、4.5:1 文本对比度。

## 限制

- **rpcd 的 UCI 访问是按配置文件名授权的**：可写的只有
  `dhcp` / `firewall` / `network` / `system` / `wireless` / `dropbear` / `luci` / `opkg` / `ntp` / `timeserver`；
  其它配置文件一律 `Invalid argument`，**新建自定义配置文件也不行**。
- **诊断命令走白名单**：`ping` / `dns` / `trace` / `routes` / `ports` 五个固定工具，
  单次最长 12 秒，输出超过 200 KB 截断，目标地址只允许 `[A-Za-z0-9._:-]`。
- **`/www/modern` 不在 `sysupgrade.conf` 的保留清单里** —— 路由器刷机会**丢掉整个控制台**，需要重新部署。
- **特权动作分三档**：改密码 / 重启 / 恢复出厂 / 备份恢复 / 固件刷写要**一次性令牌 + 二次确认**
  （刷固件 / 恢复备份 / 恢复出厂还要手动输入确认词）；apk 安装卸载、ShellCrash 写入只要 `confirm=yes`；
  丢弃暂存 / 提交 / 应用 / 重载服务 / 服务启停服务端不拦。
- 各家设备的细节不一样（接口名、分区布局、包管理器、ShellCrash 安装路径），控制台对常见差异做了通用处理，个别字段以实际设备为准。
- `sid` 通过查询参数传给 CGI，可能出现在 uhttpd 访问日志里 —— 这是本机 LAN + HTTPS 下的折中。
- 开机引导（firstboot）、分区表编辑、swconfig 端口不在控制台范围内。

## 反馈

遇到页面不对、功能缺失或部署问题，到 [Issues](https://gitlab.com/M.Venn/OpenwrtConsole/-/issues) 反馈。
请尽量带上：设备型号与固件版本、浏览器与控制台版本、出问题的页面与复现步骤、
浏览器控制台报错原文。排错可以先查
[docs/TROUBLESHOOTING.md](https://gitlab.com/M.Venn/OpenwrtConsole/-/blob/main/docs/TROUBLESHOOTING.md)（按现象检索）。

想参与贡献（怎么跑起来、组件与样式规范、提交前自检），见
[CONTRIBUTING](https://gitlab.com/M.Venn/OpenwrtConsole/-/blob/main/CONTRIBUTING.md)；
安全问题按 [SECURITY](https://gitlab.com/M.Venn/OpenwrtConsole/-/blob/main/SECURITY.md) 报告。

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

| 项目 | 用途 |
|---|---|
| [**Vue**](https://github.com/vuejs/core) · [**Vue Router**](https://github.com/vuejs/router) | 前端框架与路由 |
| [**Vite**](https://github.com/vitejs/vite) · [**TypeScript**](https://github.com/microsoft/TypeScript) | 构建工具与类型系统 |
| [**Element Plus**](https://github.com/element-plus/element-plus) | UI 组件库（按需引入） |
| [**ECharts**](https://github.com/apache/echarts) · [**Lucide**](https://lucide-icons/lucide) | 图表（仅折线图）与图标 |
| [**art-design-pro**](https://github.com/Daymychen/art-design-pro) | 设计令牌的视觉基线（`src/styles/tokens.css` 的色值逐个对应它；未引入 Tailwind）—— 原样 vendor 在 [third-party/art-design-pro/](https://gitlab.com/M.Venn/OpenwrtConsole/-/tree/main/third-party/art-design-pro)，MIT |
| [**OpenWrt**](https://github.com/openwrt/openwrt) / [**LuCI**](https://github.com/openwrt/luci) | 目标平台与对照实现（只**调用**它们的接口，不含其代码） |

**随仓分发的上游项目**索引见
[third-party/README.md](https://gitlab.com/M.Venn/OpenwrtConsole/-/blob/main/third-party/README.md)；
第三方组件的完整许可证声明见 [NOTICE](https://gitlab.com/M.Venn/OpenwrtConsole/-/blob/main/NOTICE)。

## 许可证

本仓库以 [MIT License](https://gitlab.com/M.Venn/OpenwrtConsole/-/blob/main/LICENSE) 发布。

> 本仓不包含任何 GPL-3.0 派生件（ShellCrash 的派生件在兄弟仓 `ShellcrashRules`），
> 因此整仓 MIT 成立。引用的第三方组件各自适用其自己的许可证。
