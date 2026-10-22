<div align="center">

<img src="https://raw.githubusercontent.com/MVennn/OpenwrtConsole/main/assets/logo.png" width="128" alt="OpenwrtConsole">

# OpenwrtConsole

**给任意 OpenWrt 设备用的、替代 LuCI 的现代 Web 管理界面**

看状态、改配置、装软件、刷固件，一个界面里做完。

![CI](https://github.com/MVennn/OpenwrtConsole/actions/workflows/ci.yml/badge.svg) ![源码仓库](https://img.shields.io/badge/源码仓库-GitHub-181717?logo=github&logoColor=white) ![问题反馈](https://img.shields.io/badge/问题反馈-Issues-181717?logo=github&logoColor=white) ![OpenWrt](https://img.shields.io/badge/OpenWrt-任意设备-00B5E2?logo=openwrt&logoColor=white) ![Vue 3](https://img.shields.io/badge/Vue-3-4FC08D?logo=vuedotjs&logoColor=white) ![Node.js](https://img.shields.io/badge/Node.js-20%2B-339933?logo=node.js&logoColor=white) ![License](https://img.shields.io/badge/License-MIT-blue)

</div>

---

## 这是什么

一个装在你自己路由器上的 Web 管理界面，用来替代 LuCI。部署完成后浏览器打开
`https://<你的路由器IP>/modern/` 就能用，登录用的就是路由器的 root 密码。

它不重造 OpenWrt 的管理能力，而是复用路由器本来就有的两套后端：**rpcd / ubus** 负责标准 UCI 配置的读写；**9 个 root CGI** 负责 rpcd 够不着的那部分 —— 无线关联终端、dnsmasq 运行时状态、诊断命令、代理桥、特权写操作、apk 软件包、固件刷写、ShellCrash 设置。

它只往路由器的 `/www/modern` 与 `/www/cgi-bin/modern-*` 写，不改 LuCI、不碰 `/etc/config/luci`，LuCI 仍留在 `/cgi-bin/luci/` 作为应急入口。

每个分区能做什么，见 [功能一览](https://github.com/MVennn/OpenwrtConsole/blob/main/docs/FEATURES.md)；做不到的地方，见 [已知限制](https://github.com/MVennn/OpenwrtConsole/blob/main/docs/LIMITS.md)。

## 环境要求

| 项 | 要求 |
|---|---|
| 路由器 | 任意 OpenWrt，需 uhttpd + ubus/rpcd（默认配置即满足） |
| 必需依赖 | `rpcd-mod-luci` —— 提供 `luci` / `luci-rpc` 两个 ubus 对象，精简固件要单独装 |
| 按需依赖 | `curl`（代理页与固件更新检查）、`apk`（软件包页，需 OpenWrt 24.10+） |
| 登录 | 路由器的 root 密码 |
| 浏览器 | 任意现代浏览器；uhttpd 默认自签证书，首次访问会有警告 |
| 本地开发 | Node.js 20+（只在本地跑前端时需要） |

## 安装

1. 取源码并构建前端产物
2. 部署到路由器（脚本会把 `dist/` 推到 `/www/modern`、把 9 个 `modern-*` 推到 `/www/cgi-bin/`）：

   ```bash
   git clone https://github.com/MVennn/OpenwrtConsole.git && cd OpenwrtConsole
   npm install && npm run build
   ROUTER_HOST=root@<你的路由器IP> ./deploy/deploy.sh
   ```

3. 浏览器打开 `https://<你的路由器IP>/modern/`，用 root 密码登录
4. 本地开发（可选）：`npm run dev` 之后打开 <http://localhost:5173/modern/>，Vite 会把 `/ubus` 与 `/cgi-bin` 代理到你的路由器；没有路由器也能用随仓的 mock 跑起来 —— 细节见 [贡献指南](https://github.com/MVennn/OpenwrtConsole/blob/main/CONTRIBUTING.md)。

运行时依赖怎么装、缓存怎么处理、怎么回退，见 [部署文档](https://github.com/MVennn/OpenwrtConsole/blob/main/docs/DEPLOY.md)。

## 反馈

遇到页面不对、功能缺失或者部署问题，到 [Issues](https://github.com/MVennn/OpenwrtConsole/issues) 反馈；
排错可以先按现象查 [排错手册](https://github.com/MVennn/OpenwrtConsole/blob/main/docs/TROUBLESHOOTING.md)。

请尽量带上：

- 设备型号与固件版本
- 控制台版本（[CHANGELOG](https://github.com/MVennn/OpenwrtConsole/blob/main/CHANGELOG.md) 里的版本号）
- 出问题的页面与复现步骤
- 浏览器控制台的报错原文

安全问题按 [安全策略](https://github.com/MVennn/OpenwrtConsole/blob/main/SECURITY.md) 报告，不要开公开 Issue。

## 免责声明

本项目仅供学习与个人使用。

- 本项目与各路由器厂商、OpenWrt 官方、LuCI、ShellCrash、mihomo 及其关联方**不存在任何隶属、合作、授权或支持关系**。
- 控制台以 **root 权限**在路由器上执行命令（诊断、配置写入、软件包安装、固件刷写、恢复出厂）。
  **刷固件 / 恢复出厂 / 改密码 / 重启属于不可逆或高风险操作**，务必确认固件来源可靠，并先做配置备份。
- 自行部署到生产路由器前，先在备份机上完整跑一遍「浏览 → 改一项配置 → 撤销 → 重启」。
- 本项目不对因使用本控制台造成的设备变砖、网络中断、配置丢失承担任何责任。
- 请勿把 `/modern/` 暴露到 WAN；本控制台**没有**做额外的访问控制，它复用的是路由器 root 账号的权限。

「OpenWrt」「LuCI」等商标、标识的权利均归其权利人所有。本项目与之不存在任何隶属、合作、授权、认可或支持关系。

## 开源鸣谢

本项目建立在这些开源项目之上：

| 项目 | 用途 |
|---|---|
| [**Vue**](https://github.com/vuejs/core) · [**Vue Router**](https://github.com/vuejs/router) | 前端框架与路由 |
| [**Vite**](https://github.com/vitejs/vite) · [**TypeScript**](https://github.com/microsoft/TypeScript) | 构建工具与类型系统 |
| [**Element Plus**](https://github.com/element-plus/element-plus) | UI 组件库（按需引入） |
| [**ECharts**](https://github.com/apache/echarts) · [**Lucide**](https://lucide-icons/lucide) | 图表（仅折线图）与图标 |
| [**art-design-pro**](https://github.com/Daymychen/art-design-pro) | 设计令牌的视觉基线 —— 原样 vendor 在 `third-party/art-design-pro/`，MIT |
| [**OpenWrt**](https://github.com/openwrt/openwrt) / [**LuCI**](https://github.com/openwrt/luci) | 目标平台与对照实现（只**调用**它们的接口，不含其代码） |

随仓分发的上游项目索引见 [third-party/README.md](https://github.com/MVennn/OpenwrtConsole/blob/main/third-party/README.md)；
第三方组件的完整许可证声明见 [NOTICE](https://github.com/MVennn/OpenwrtConsole/blob/main/NOTICE)。

## 许可证

本仓库以 [MIT License](https://github.com/MVennn/OpenwrtConsole/blob/main/LICENSE) 发布，
引用的第三方组件各自适用其自己的许可证。
