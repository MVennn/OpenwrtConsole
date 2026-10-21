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

# 2026-10-21 本地开发模式（mock 路由器）

## 背景
- 控制台登录必须用 root 密码换 ubus 会话，SSH key 不提供密码；没有路由器时无法做浏览器端到端。
- 目标：不引入生产后门，用 dev-only 的 mock 路由器提供完整界面数据。

## 完成项
- [x] 新增 `tools/mock-router.mjs`：零依赖，监听 `127.0.0.1:5199`，覆盖 `/ubus` 与
  `/cgi-bin/modern-*`；数据全部合成（文档地址段 / 假 MAC / 假 SSID / 假节点名）
- [x] mock 覆盖登录、概览、无线（含 6 GHz）、客户端、网络、系统、代理、ShellCrash、
  软件包、固件、运维、DNS、配置页、监控、诊断、首次配置
- [x] `CONTRIBUTING.md` 与根 README 补 mock 用法；`CHANGELOG` 记入 `[未发布]`
- [x] 验证：浏览器登录后逐页渲染；诊断执行 Ping；系统设置改主机名出现待生效改动，
  「放弃修改」确认后回滚；端口转发命中流量显示 1 条连接 / 259.3 KB

## 自检
- `node --check tools/mock-router.mjs` ✓
- `npx vue-tsc --noEmit` ✓（源码未改）
- `python tools/check-docs.py` ✓
- mock 与 dev server 只在本地运行，未部署到路由器

## 状态: 已完成

---

# 2026-10-21 内存占用核查与前端优化

## 测量
- 路由器：总 239 MB，已用约 155 MB；`uhttpd` RSS 1.8 MB；`CrashCore` RSS 58 MB
  —— 控制台是静态 SPA，不在路由器进程里跑，主题不是路由器内存大头。
- 浏览器（生产构建）：概览页 GC 后约 13 MB；遍历全部页面后约 30 MB；
  来回切换无增长，canvas 始终 1 个，没有图表泄漏。
- 本地开发：Vite dev 约 271 MB、mock 约 60 MB、preview 约 242 MB；
  preview 已在测量后停止，dev/mock 保留供查看。

## 完成项
- [x] 概览 / 无线 / 客户端 / 网络 / 系统 / 监控 / 代理的 ubus 数据改用 `shallowRef`
- [x] `BaseChart` 的 option watch 去掉 `deep`，避免每轮轮询深度遍历
- [x] 测量结论写入 CHANGELOG 的 `[未发布]`

## 自检
- `npx vue-tsc --noEmit` ✓
- `npm run build` ✓
- mock 下逐页渲染无报错，`NaN` / `undefined` / `Cannot read` 均为 0

## 状态: 已完成

---

# 2026-10-21 界面自检与信息架构收敛

## 背景
- 侧栏 18 个平铺入口已经排满，且「状态页 / 配置页」成对出现；
  页头全局刷新按钮在软件包 / 系统设置页没有订阅，点击只转圈不发请求。

## 完成项
- [x] 侧栏收敛为 10 个工作区（概览 / 监控 / 网络 / 无线 / 客户端 / 防火墙 /
  代理 / 系统 / 运维 / 诊断），新增工作区标签页；所有路由、深链接与前进后退不变
- [x] 修复页头在 flex 容器里被压缩（64px → 37px）导致标签栏压住页面标题；
  标签栏改为不透明背景
- [x] 修复软件包 / 系统设置页头刷新无效；诊断与首次配置隐藏刷新按钮
- [x] 首次配置入口移到系统页；侧栏连接指示灯跟随 online / offline
- [x] 修复草稿 `savedAt` 被覆盖、重启按钮卡死、概览页游离定时器
- [x] 移除网络 / 无线 / 系统页头与标签重复的主按钮
- [x] 约束代理组：长组名 / 节点名截断，列表最高 56vh 内部滚动，避免左右栏错位与横向溢出
- [x] 对齐双栏底部：代理页「运行配置」与概览页摘要卡的最后一张卡贴齐左栏底边

## 自检
- `npx vue-tsc --noEmit` ✓
- `npm run build` ✓
- mock + dev 下 18 条路由逐页回归：标签激活态、面包屑、刷新按钮均正常，
  console 无错误；刷新按钮实测会触发请求（软件包 2 次、系统设置 12 次）
- 未触碰 `deploy/` 与 `third-party/`

## 状态: 已完成

---

# 2026-10-21 策略组列表隐藏内置 GLOBAL

## 变更
- `src/utils/proxy.ts` 新增 `isVisibleGroup`：排除 mihomo 内置 `GLOBAL`
  （全局选择器，不是用户配置的策略组）。
- `ProxyView` 的代理组列表、`Dashboard` 的策略组计数改用 `isVisibleGroup`；
  `GLOBAL` 不再作为普通策略组显示。
- `isProxyGroup` 保留给 `resolveNode` 等内部解析使用。

## 自检
- `npx vue-tsc --noEmit` ✓
- `npm run build` ✓
- `ROUTER_HOST=root@10.0.0.1 ./deploy/deploy.sh` ✓
- 部署校验：入口 chunk `index-RqUMl49-.js` 本地/线上一致；
  `ProxyView-CLzfonbm.js`、`DashboardView-D53RY2il.js` 的 sha256 本地/线上一致；
  共享 `proxy-BEDlQoPq.js` 已包含 `GLOBAL` 过滤集合。
- 旧标签页需硬刷新（Ctrl+F5）；刷新后策略组数 25 → 24，`GLOBAL` 行消失。

## 状态: 已完成

---
