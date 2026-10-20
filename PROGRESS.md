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
  （`["key":"value"]` 非法，要写 `["key=value"]`）；6 个 shell CGI 的 `ok()`/`fail()` 走 `send_json()`，
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
# 2026-10-21 README 收敛

## 背景
- 参照系列仓 gsauxiliary 的门面格式，根 `README.md` 收敛为面向用户的说明。

## 已完成变更
- [x] 重写根 `README.md`（logo 头 + 徽章 + 九节用户门面）
- [x] 产物体积基线 → docs/MAINTENANCE.md §7；仓库现状说明 → §8「与源目录的同步状态」
- [x] 「认证链路」「数据来源」删除（正本在 docs/ARCHITECTURE.md，属重复）
- [x] docs/README.md 门面一行同步；CHANGELOG 增补「README 收敛批次」

## 自检
- `python tools/check-docs.py` ✓（22 篇）
- 未触碰 src/ 与 deploy/（CI 的 vue-tsc + build 不受影响）

## 状态: 已完成

---

# 2026-10-21 通用性修复批次（v0.2.0）

## 背景
- 控制台从 AX3000T 真机直接开源，审计发现多处「只在这台设备上成立」的假设：
  设备名（`phy0-ap0`、`wan`）、端口（9999 / 7890）、双频写死、按租约当在线、
  端口转发匹配错端口、`network route` 方法不存在等。
- 同时发现两个阻断性旧缺陷：`modern-uci` 的 `consume_token` 读错变量，导致
  **所有令牌动作必然报「令牌无效」**；`set-password` 依赖固件没有的 `chpasswd`。

## 完成项
- [x] CGI 通用化：`modern-data` 无线设备三级枚举；`modern-proxy` 控制口动态解析；
  `modern-sysupgrade` 代理/curl/镜像格式/SNAPSHOT 判定；`modern-pkg` opkg 明确报错 +
  apk 代理检测修复；`modern-shellcrash` 端口并集；`modern-read` 新增 `what=neighbors`
- [x] 凭据链路：`consume_token` 修复；`set-password` 回退 BusyBox `passwd`；用户名白名单；
  「系统」页重启改走一次性令牌
- [x] 统计口径：端口转发命中流量按 `src_dport`；累计流量优先 WAN；在线状态用
  stations + neighbors；客户端文案改为「客户端 / 其他」
- [x] 设备假设：WAN/WAN6/LAN 按角色识别；无线页聚合多 SSID、实际信道、6 GHz 动态筛选；
  无线配置补 1–13 / DFS / HE160+；改频段重置信道与 htmode
- [x] 首次配置：无无线硬件不再判「未配置」；频段优先按 runtime/iwinfo 识别
- [x] 代理与入口：主组类型优先 + 通用名称词；LuCI 入口探测后才显示；HTTPS 文案动态
- [x] 文档与版本：README/DEPLOY/CHANGELOG/docs 全量同步，新增 `docs/release-notes/v0.2.0.md`
- [x] 部署回归：已部署到 `root@10.0.0.1`，`/modern/` 与 9 个 CGI 哈希一致；
  发现并修正 LuCI 未登录时 `HEAD /cgi-bin/luci/` 返回 403 被误判为「未安装」的问题

## 自检
- `npx vue-tsc --noEmit` ✓
- `npm run build` ✓
- 6 个 shell CGI `sh -n` ✓（含未改动的 `modern-exec`）
- 真机只读接口回归（临时 ubus 会话 + `/tmp` CGI 副本）：neighbors / stations /
  shellcrash ports / pkg stats / proxy version / sysupgrade info ✓
- 令牌链路：签发令牌后用非法用户名调用 `set-password`，命中 400 用户名校验 ✓
- 未执行写路径（改密 / 重启 / 恢复出厂 / 刷写）；前端未做浏览器端到端
- `python tools/check-docs.py` ✓（23 篇）
- 部署后回归：`https://10.0.0.1/modern/` 200；入口 JS/CSS 200；
  `modern-read?what=neighbors`、`modern-data?what=stations`、`modern-proxy?path=/version`
  与 `modern-uci` 令牌流程均通过 uhttpd 实测；回滚备份在
  `/root/modern-backup-20261021-030330.tgz`

## 状态: 已完成

---
