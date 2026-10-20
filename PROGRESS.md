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

## 关键实现约束
- 认证：自建 ubus 会话（1 小时），sid 存 localStorage；CGI 认证走 `?sid=`
  （uhttpd 不转发自定义请求头，自签 HTTPS 下浏览器拒收 Secure Cookie）
- 写入：rpcd 授权的标准配置可用 `uci.set/add/delete/commit/apply`；
  `uci.revert`、服务重载、改密码、重启、恢复出厂、固件刷写走 root CGI + 一次性令牌
- rpcd 的 UCI 访问按配置文件名授权，别的配置文件一律 `Invalid argument`
- 路由器上没有 `timeout` / `ss` / `od` / `file`，脚本要用替代实现
- CGI 必须 LF 换行、必须原子替换（临时文件 + rename）
- **不要在路由器上做递归扫描**（`grep -r /etc /var` 会打爆内存并触发看门狗重启）
- chunk 带哈希且 uhttpd 不发 Cache-Control：部署保留「当前代 + 上一代」，
  并有 `?_reload=` 自愈重载

## 交付物
- `src/` — 17 个页面、共享 API 与组件
- `deploy/` — 8 个 CGI + deploy.sh / install-remote.sh
- `README.md` / `DESIGN.md` / `DEPLOY.md` / `docs/V3-CONTRACT.md`
- 线上：<https://10.0.0.1/modern/>，根路径 `/` 已指向控制台
