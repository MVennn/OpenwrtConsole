# OpenWrt Console · 项目进度

> **一句话**：控制台前端的开发进度台账（追加式批次日志，规则见 [docs/DOC-RULES.md](docs/DOC-RULES.md)）。

状态: 已完成
开始时间: 2026-10-20
完成时间: 2026-10-20

## 目标
用 art-design-pro 的设计语言重做 OpenWrt 管理界面，并做到 **完全替代 LuCI**：
日常操作（看状态、改配置、装软件、刷固件、重启）都在控制台内完成，
LuCI 只保留为应急入口。

## 阶段
- [x] v1 设计系统与骨架：令牌、侧栏/顶栏、卡片、状态色、深浅色、响应式
- [x] v1 只读页面：概览、网络、无线、客户端、代理、系统
- [x] v2 只读扩展：防火墙、DNS、诊断、代理节点切换
- [x] v2 体积优化：Element Plus 按需引入，首屏 1.42MB → 389KB
- [x] v3 写入层：root CGI（modern-uci）+ 共享 `src/api/uci.ts` / `systemOps.ts`
- [x] v3 可写页面：网络配置、无线配置、防火墙配置、DHCP 与系统设置
- [x] v3 运维页面：服务与运维、软件包管理、固件升级与备份、监控与流量、首次配置向导
- [x] v3 收口：默认入口 `/` 切到 `/modern/`，LuCI 降级为应急入口
- [x] v3 收尾：清掉页面里的 LuCI 文字链接，页头主按钮全部指向内部配置页
- [x] v4 写入层收口：四个配置页（网络 / 无线 / 防火墙 / DHCP 与系统设置）全部走
  「暂存 → 提交 → 应用」，草稿落 localStorage，待生效改动可视化并可一键放弃
- [x] v4 页面增强：接口链路状态与速率、静态路由生效情况、SSID 客户端数与信号、
  射频实际信道 / 带宽、区域当前连接数、端口转发命中流量、静态租约在线状态
- [x] v5 ShellCrash 保存链路修复：`config-write` 应答改为合法 JSON 数组，
  9 个 CGI 的应答统一自检
- [x] v6 服务动作状态跟踪：完成记录 = 状态到位；前端等 `running` 变成期望值，
  卡片跟真实状态走，不再停在「未运行」等手动刷新

## 关键实现约束
- 认证：自建 ubus 会话（1 小时），sid 存 localStorage；CGI 认证走 `?sid=`
  （uhttpd 不转发自定义请求头，自签 HTTPS 下浏览器拒收 Secure Cookie）
- 写入：rpcd 授权的标准配置可用 `uci.set/add/delete/commit/apply`；
  `uci.revert`、服务重载、改密码、重启、恢复出厂、固件刷写走 root CGI + 一次性令牌
- rpcd 的 UCI 访问按配置文件名授权，别的配置文件一律 `Invalid argument`
- 路由器上没有 `timeout` / `ss` / `od` / `file`，脚本要用替代实现
- CGI 必须 LF 换行、必须原子替换（临时文件 + rename）
- **每个 CGI 的应答都必须是合法 JSON**：数组里不能放没有花括号的键值对
  （`["key":"value"]` 非法，要写 `["key=value"]`）；`ok()`/`fail()` 统一走 `send_json()`，
  发送前用 `jsonfilter` 自检 —— 详见 [docs/CGI-CONTRACT.md](docs/CGI-CONTRACT.md) §0
- **服务动作的「完成」以状态为准**：`start.sh` 是把核心拉起来就返回的，
  完成记录必须在核心真的起来之后才写
- **不要在路由器上做递归扫描**（`grep -r /etc /var` 会打爆内存并触发看门狗重启）
- chunk 带哈希且 uhttpd 不发 Cache-Control：部署保留「当前代 + 上一代」，
  并有 `?_reload=` 自愈重载

## 交付物
- `src/` — 20 个视图、共享 API 与组件
- `deploy/` — 9 个 CGI + deploy.sh / install-remote.sh
- `README.md` / `DESIGN.md` / `DEPLOY.md` / `docs/CGI-CONTRACT.md` / `docs/WRITE-LAYER.md`
- 线上：<https://<路由器IP>/modern/>，根路径 `/` 已指向控制台
