# 更新日志

> **一句话**：本仓的变更历史 —— 一段一个版本，写清**改了什么 / 为什么 / 怎么验证**；
> 同时集中登记**已确认但尚未修**的缺陷与「待补」项。

**版本命名规则（本文件头部是摘要，正本见 [docs/VERSIONING.md](docs/VERSIONING.md) §1–§2）**：三段式 `主.次.补丁`。
**有功能更新进次版本（+0.1.0，补丁归零）；没有功能更新进补丁版本（+0.0.1）。**
判断口诀：功能清单里能不能找到「以前没有的东西」或「行为变了」——
能 → 次版本；只是修 bug、调文案/样式、改文档、动构建脚本 → 补丁版本。

**「修复」段收录两类**：
① 本版**已修**的缺陷（写清症状 / 根因 / 改法 / 验证）；
② **已确认存在、但本版未动代码**的待修缺陷（每条标题带「**待修**」标记，
   并写清「为什么现在没修」「缺什么证据」）。
未修的写进 CHANGELOG 而不写进 Release 说明 —— Release 说明只讲用户能拿到的结果。

---

## [未发布] — 2026-10-22

### ShellCrash 配置页（2026-10-22）

- 调整 防火墙区域 —— 从数字输入框改为下拉选择：1 仅局域网（本机直连）/ 2 仅本机 /
  3 局域网 + 本机 / 4 纯净模式（不劫持）/ 5 旁路转发；每项带语义说明，避免记错编号。
  写值仍是 `firewall_area=1..5`，CGI 的 `valid_value` 白名单不变。

### Issue 表单（2026-10-22）

- 新增 `.github/ISSUE_TEMPLATE/` —— 问题反馈（Bug）与功能建议两套表单，外加 `config.yml`：
  Bug 表单要求填设备与固件、控制台版本、部署方式、浏览器报错与 `logread`；
  功能建议要求先写场景，并确认危险动作仍保留令牌与确认、不把 `/modern/` 暴露到 WAN

### 软件包仓库修复（2026-10-22）

软件包页的「更新仓库索引」以前必然报「路由器没有返回任务编号」，仓库列表也只能看到
字母序前 400 个包；现在索引能正常更新、仓库可翻页浏览，重启后索引丢失时打开仓库会自动补下载。

- 修复 任务编号 —— CGI 返回 `job_id` / `exit_code`（snake_case），页面读的是
  `jobId` / `exitCode`，`startPackageJob` 因此把每次写操作都判成失败（任务其实已在路由器上跑完）；
  `src/api/packages.ts` 在解析响应后统一归一化，`status` 轮询的 `exit_code` 也一并生效
- 修复 仓库列表 —— 原来一次最多 400 条且没有翻页，1.1 万个包只能看到字母序前 400 个；
  `modern-pkg` 新增 `offset` / `limit`，页面加 50/100/200 每页的分页条，
  `matchedCount` 是真实总数（不随分页变化）
- 优化 解析缓存 —— 整表解析成「一行一个包」的 pool 缓存到 `/tmp/modern-pkg-cache`，
  翻页/检索从每次重扫 3.3 MB（约 4 秒）降到 `grep` + 按行切片（0.2–1 秒）
- 修复 重启后仓库为空 —— `/tmp` 是内存盘，重启后 apk 索引没了，`available` 只回空列表；
  前端发现 `indexUpdatedAt=0` 会自动触发一次 `update` 任务，完成后自动刷新列表
- 修复 升级提示消失 —— `apk query --upgradable` 没带 `--cache-dir`，读的是 `/var/cache/apk`，
  重启后为空 → 所有包都显示「已是最新」；现在与其它查询共用同一索引缓存
- 修复 `indexUpdatedAt` 误报 —— 不再回落到 `/var/cache/apk`（apk 不读那个目录），
  避免「显示索引已下载、列表却是空的」
- 修复 表格标签残留 —— 翻页/换关键字后 `el-tag` 的过渡类卡住，新行被误标成「已安装」；
  表内标签改用 `disable-transitions`
- 验证 —— `npx vue-tsc --noEmit` ✓、`npm run build` ✓；真机临时副本（绕过 sid）：
  `stats` 冷 8 s / 热 2 s，`available` 翻页 0–1 s，`aria2` 检索 1 s，
  分页 / 检索 / 已装列表 / `status` 的响应全部通过 `jsonfilter -e '@'`；
  浏览器端到端（mock 数据）验证「索引缺失 → 自动建索引 → 分页 → 翻页 → 关键字检索」

### 深色模式修复（2026-10-22）

- 修复 深色模式 —— Element Plus 的语义色 `*-light-3…9` 没有接入暗色主题：
  `el-alert` / `el-tag` / `el-message` 的背景取 `*-light-9`（近白），
  在深色卡片上整片发白（warning 的橙底尤其刺眼）；`tokens.css` 的 `.dark`
  补上 Element Plus 官方暗色阶梯，基色与 `*-dark-2` 保持不变，
  实心按钮的白字对比度不受影响
- 影响范围 —— 全站所有 `el-alert`（ShellCrash 内核更新、固件、DHCP 警告等）
  以及 `el-tag` / `el-message`
- 验证 —— `npm run build` ✓；部署后 `index-*.css` 同时含亮色 `#fdf6ec`
  与暗色 `#292218`，且暗色规则在后

### 内核更新检测（2026-10-22）

ShellCrash 页新增「内核更新」卡片：并排显示已安装内核、GitHub 最新 mihomo 与
ShellCrash 自己的版本表，并在 GitHub 已发布、ShellCrash 尚未收录时说明原因。

- 新增 接口 —— `modern-shellcrash` 的 `core-check`：GitHub 最新 tag 读
  `/releases/latest` 的 302 Location（不耗 REST API 配额），失败回退 REST API；
  ShellCrash 版本表读 `bin/version` 的 `update` 分支；结果缓存 1 小时，`force=yes` 跳过缓存
- 新增 界面 —— `ShellCrashView` 的「内核更新」卡片：三版本对比、有新内核 /
  版本表落后 / 无法检查三种状态、Release 链接与上次检查时间
- 新增 提示 —— 版本表落后时说明「ShellCrash 菜单不会提供该版本」，并给出
  `start.sh restart`、不要用 `init.d restart`、保留 UPX 布局与 `command.env` 的更新路径
- 边界 —— 卡片**只检测，不下载、不替换内核**（见 [docs/LIMITS.md](docs/LIMITS.md) §14）
- 调整 文档 —— `docs/CGI-CONTRACT.md` / `ARCHITECTURE.md` / `FEATURES.md` /
  `LIMITS.md` / `TROUBLESHOOTING.md` 同步
- 验证 —— `npx vue-tsc --noEmit` 通过；路由器上用临时副本调用 `core-check` 返回
  `installed=v1.19.28`、`latest=v1.19.33`、`listed=v1.19.28`、
  `update_available=true`、`shellcrash_behind=true`；二次调用 `cached=true`；
  `jsonfilter -e '@'` 校验通过

### 客户端设备识别（2026-10-22）

无线客户端页新增「类型」列：新设备首次接入时自动识别一次，给出类别与厂商，
不再只显示一句「无线设备」。

- 新增 接口 —— `modern-data?what=identify&ip=<ipv4>`：路由器端用 Lua + nixio
  （LuCI 自带，不装包）做 TCP 端口 / miIO 握手 / 小米电视与网关 / SSDP / mDNS 探测，
  单台约 1 秒，只发少量单播包，不做网段扫描
- 新增 识别 —— `src/utils/identify.ts` + `src/utils/oui.ts`：主动信号优先，
  OUI 厂商 / 主机名 / 2.4G 11n 能力兜底；输出 手机 / 平板 / 电脑 / 电视 / 摄像头 /
  打印机 / NAS / 智能家居 / 未知
- 新增 界面 —— 客户端页「类型」列（标签 + 厂商 + 单行重新识别）；结果按 MAC 缓存 7 天，
  IP 变化自动重新探测
- 新增 工具 —— `tools/gen-oui.mjs`：从 IEEE OUI 注册表生成消费品牌前缀表
- 调整 部署 —— `deploy.sh` 增加 `/usr/lib/modern/probe.lua`；
  `docs/CGI-CONTRACT.md` / `ARCHITECTURE.md` / `FEATURES.md` / `LIMITS.md` / `MAINTENANCE.md` 同步

### 门面统一批次（2026-10-21）

在「README 收敛批次」之后再收一轮：门面压到与 GSAuxiliary 同款的七节，
开发者内容继续下沉 `docs/`，门面资源（logo / 社交预览）统一由 `assets/icon.svg` 渲染。

- 调整 文档 —— 根 README 收敛为七节（这是什么 / 环境要求 / 安装 / 反馈 / 免责声明 / 开源鸣谢 / 许可证）；
  顶部不写「一句话」引言块，定位由副标题承担（对齐 GSAuxiliary）
- 调整 文档 —— 「功能」分区表下沉新建的 [docs/FEATURES.md](docs/FEATURES.md)；「限制」十二条下沉新建的 [docs/LIMITS.md](docs/LIMITS.md)；
  本地开发细节（mock 路由器、`ROUTER_URL` 覆盖）下沉 [CONTRIBUTING.md](CONTRIBUTING.md)
- 新增 工具 —— `tools/make_social_preview.py`：自带 SVG 渲染器，从 `assets/icon.svg` 生成
  `assets/logo.png`（512×512）与 `assets/social-preview.png`（1280×640），不依赖 cairosvg 等外部程序
- 调整 资源 —— `assets/logo.png` 改为由 `assets/icon.svg` 渲染，图形不再有两份正本
- 调整 文档 —— `docs/DOC-RULES.md` 正本映射表与 `docs/README.md` 索引同步；
  各仓 docs 里指向根 README 章节的文字引用改指新正本
- 调整 仓库 —— GitHub 仓库描述与话题改成面向使用者的口径（与 README 副标题同调）

### 代理页布局修复（2026-10-22）

- 修复 代理组卡片横向溢出 —— 测速后节点芯片撑大左列，右侧「节点数 + 测速 + 节点下拉框」
  控件组被压到 184px（固有宽度 233px），溢出 49px 并撑出横向滚动条；
  `.group-side` 改为不收缩（`flex: 0 0 auto`），收缩改由左列（`min-width:0 + overflow:hidden`）承担
- 验证 —— 900px 视口下 `.group-list` 溢出 45px → 0；1280 / 1100 / 760 / 660 / 640 / 520
  全部为 0；≤640px 单列布局不受影响

### 收尾大扫除（2026-10-22）

- 清理 根目录 14 个未跟踪的 `tmp_*` 临时下载 / 测速产物 —— `tmp_dl_akam.bin`（17 MB）、
  `tmp_dl_hk.bin`（26 MB）、`tmp_dl_dom.bin`（31 MB）与 `tmp_playurl*.json`、`tmp_mcdn_*.txt`、
  `tmp_bili_rank.json`、`tmp_speedtest.ps1`、`tmp_url*.txt` 等；仓库体积 **357 MB → 284 MB**
  （释放 76 384 734 B，约 73 MB）
- 调整 `.gitignore` —— 新增 `/tmp_*`，根目录临时下载 / 测速 / 抓包产物不再出现在 `git status`
- 调整 文档 —— `docs/release-notes/README.md` 补「反馈入口」规则：加粗总结后紧接一行
  **绝对地址**的 Issue 链接，再进入 `## 本版内容`；模板同步
- 补记 代理页布局修复 —— v0.3.0 之后 `bc88133` 的条目缺失，现已补齐；
  当前 `v0.3.0..HEAD` 的提交逐条有对应条目
- 调整 文档 —— `docs/MAINTENANCE.md` §7 产物体积基线按 2026-10-22 构建重测
  （首屏 417 KB / gzip 118 KB），§2 与根 `DEPLOY.md` 的每代体积改为 2.1 MB，
  并新增 §9 维护记录
- 验证 —— `python tools/check-docs.py` ✓（26 篇）、`npx vue-tsc --noEmit` ✓、
  `npm run build` ✓（7.65 s）

---

## [0.3.0] — 2026-10-21

### 路由器端修复

- 修复 `uci-apply` 空操作 —— `modern-uci` 原来执行 `uci apply`，但 OpenWrt 的 uci
  命令行没有这个子命令（真机退出码 255），CGI 忽略退出码返回成功，导致
  「DHCP 与系统设置」页的静态租约、主机名、时区、syslog 大小保存后不生效。
  现在改用 `/sbin/reload_config`（缺失时回退 `ubus call uci apply`），
  只对真正变化的配置包触发 `config.change`。
- 修复 `modern-proxy` 的 sid 校验 —— 它是 6 个 shell CGI 里唯一没有
  `[A-Za-z0-9._~+/=-]` 白名单的，sid 会直接插进 ubus 的 JSON；现在与其余 CGI
  一致，越界直接 401。
- 修复 `modern-proxy` 切换失败的消息转义 —— mihomo 的 `message` 未转义就拼进
  JSON，含引号时整个应答非法；现在走统一的控制字符转义。
- 修复 `modern-sysupgrade` 的 `json_escape` —— 原来只处理 `\` 和 `"`，制表符与
  其他控制字符会原样留下，可能让整个应答非法；现在与其它 CGI 用同一套处理。
- 补 ShellCrash 服务启停的确认 —— `service` 现在与 `config-write` /
  `override-toggle` / `sub-update` 一样要求 `confirm=yes`；前端
  `runShellCrashService()` 在用户确认后带上该参数。
- 修复 `modern-exec` 输出首行粘连 —— 换行符原来在行后输出且第一行不输出，
  `ip route` 等多行结果的第一、二行会被拼在一起；现在改为行前输出。
- 清理 `modern-shellcrash` 的 `fail()` / `ok()` —— 去掉 printf 格式串里的真实
  换行，并删除未使用的 `_watch` 与错位注释。

### 路由器端性能

- 优化 JSON 转义 —— `esc_json` / `jstr` / `modern-exec` 的 `esc` /
  `modern-sysupgrade` 的 `json_escape` 从逐字符拼接改为 `gsub` 多遍；真机实测
  200 KB 输入的旧写法 20 秒仍未结束，新写法不到 1 秒。反斜杠用
  `sprintf("%c", 92)` 构造，避免 BusyBox awk 与 gawk 对 gsub 替换串的不同解释。
- 优化日志数组拼装 —— `modern-shellcrash` 的 `log` / `crash` /
  `sub-update-state` 原来每行起一个 awk，200 行日志约 400–600 个进程；现在一次
  awk 输出整个数组。真机回归：带引号 / 反斜杠 / 制表符的日志行回读与原文一致。
- 优化 `modern-data` 的日志读取 —— `logread | tail -n N` 改为 `logread -l N`，
  少一个进程，也不再缓冲整个环形缓冲区。
- 优化 `modern-shellcrash` 的 overrides 统计 —— `file_mtime_epoch` 改用
  `date -r`（原来解析 `ls --full-time` 再 `date -d`，多两个进程且依赖日期格式），
  并把 `override_description` / `override_summary` 合并为一个函数。
- 清理 `modern-pkg` 的缓存 —— 删除旧缓存时同时清掉 `.count` / `.free`，
  不再留下孤儿文件。

### 开发工具

- 新增 本地 mock 路由器 —— `tools/mock-router.mjs` 用合成数据提供 `/ubus` 与
  `/cgi-bin/modern-*`，没有路由器 / root 密码也能跑完整界面；只监听 `127.0.0.1`，
  不参与构建。用法见 [CONTRIBUTING](CONTRIBUTING.md#本地-ui-开发不需要路由器)。
- 调整 开发文档 —— 根 README 的「本地开发」与 CONTRIBUTING 补 mock 用法。

### 优化

- 优化 前端内存 —— 概览 / 无线 / 客户端 / 网络 / 系统 / 监控 / 代理的 ubus 返回
  改用 `shallowRef`，避免 Vue 对整棵返回对象做深层代理；`BaseChart` 的 option
  watch 去掉 `deep`，不再每轮轮询遍历整个图表配置。
- 实测口径 —— 路由器上 `uhttpd` RSS 约 **1.8 MB**（控制台是静态 SPA，不在路由器里跑），
  真正的大头是 CrashCore 约 **58 MB**；浏览器稳态 JS 堆约 **13–30 MB**，遍历全部页面
  来回切换无增长。本地开发时 Vite（约 270 MB）与 mock（约 60 MB）才是内存大头，
  与产物无关。

### 界面信息架构与无效入口修复

- 重构 侧栏信息架构 —— 18 个平铺入口收敛为 **10 个工作区**（概览 / 监控 / 网络 /
  无线 / 客户端 / 防火墙 / 代理 / 系统 / 运维 / 诊断）。同一任务的「看状态」与
  「改配置」用工作区标签页切换（例如 网络 → 接口状态 / 网络配置 / DNS）。
  所有路由、深链接与浏览器前进后退保持不变，侧栏在 710px 高度内无需滚动。
- 修复 工作区标签栏压住页面标题 —— `.app-main` 是带滚动的 flex 容器，
  页头没有 `flex-shrink: 0`，被压缩到 37px；标签栏按 `--header-h: 64px` 吸顶，
  于是向下压进内容区。现在页头固定为 64px，标签栏同时改为不透明背景，
  滚动时内容从下方干净地穿过，不再透出标题。
- 修复 页头刷新按钮无效 —— 软件包、DHCP 与系统设置两页没有订阅全局刷新信号，
  点击只转圈、不发请求；现在分别触发列表重读与配置重载。诊断页与首次配置向导
  没有可轮询的数据，直接隐藏该按钮，而不是留一个空动作。
- 修复 首次配置入口 —— 侧栏里的「首次配置」会把整页切到布局外的向导；现改为
  系统页「更多设置」中的入口，侧栏只保留日常页面。
- 修复 侧栏连接指示灯 —— 原来恒为绿色，断网时也显示正常；现在跟随浏览器
  `online` / `offline` 事件。
- 修复 草稿时间戳 —— 恢复 localStorage 草稿时，深度 watch 会把 `savedAt` 覆盖成
  当前时间，提示里的「修改时间」因此总是错的；恢复期间跳过持久化。
- 修复 重启按钮 —— 重启指令发送成功后按钮一直停在 loading；现在无论成功失败都复位。
- 修复 概览页游离定时器 —— 代理卡片预热用的 `setTimeout` 在组件卸载后仍会执行；
  移到 `onMounted` 并在卸载时清理。
- 清理 重复入口 —— 网络 / 无线 / 系统页头的主按钮与上方工作区标签重复，移除按钮；
  页内文字链接保留。
- 约束 代理组列表 —— 组名与节点名过长时在各自列内截断，下拉框可收缩到 140px；
  列表最高 `clamp(320px, 56vh, 560px)` 并在卡片内滚动，组数很多时不再把左栏
  拉得比右栏长，也不会横向溢出。
- 对齐 双栏卡片底部 —— `.side-stack` 改用 `justify-content: space-between`，
  右栏最后一张卡片与左侧较高卡片的底边对齐（代理页「运行配置」、概览页摘要卡）。

**验证**：`npx vue-tsc --noEmit` 零报错、`npm run build` 通过；mock 下 18 条路由逐页
回归，工作区标签激活态、面包屑、刷新按钮与页面渲染均正常，console 无错误。

### 整理批次（2026-10-21）

- 调整 工具 —— `tools/check-docs.py` 跳过 `.work/` 与 `.codegraph/`，本地工作区草稿与
  本机索引不再参与版本库文档检查。
- 调整 配置 —— `.gitignore` 补 `__pycache__/` / `*.py[cod]`（`tools/` 下的 Python 脚本
  会生成字节码缓存），并删除指向已不存在的 `PRIVACY-INVENTORY.md` 的空段注释。

---

## [0.2.0] — 2026-10-21

### 通用性修复批次（2026-10-21）

本批只做一件事：**把「只在实测设备（小米 AX3000T / OpenWrt 25.12.6 / MT7981）上成立」的假设逐条去掉** ——
换一台路由器、换一种包管理器、换一个 ShellCrash 端口，页面显示与特权动作仍然成立。
每条按「症状 / 根因 / 改法 / 验证」记录。

**本批验证**：`npx vue-tsc --noEmit` 零报错、`npm run build` 通过、改动过的 **5 个 shell CGI**
（`modern-pkg` / `modern-proxy` / `modern-shellcrash` / `modern-sysupgrade` / `modern-uci`）
全部 `sh -n` 通过；2 个 ucode CGI（`modern-data` / `modern-read`）由真机加载校验。
在实测设备上用**临时 ubus 会话 + `/tmp` 下的 CGI 副本**做了只读接口回归（不改路由器配置）：
`modern-read?what=neighbors`、`modern-data?what=stations`、`modern-shellcrash` 的 `ports`、
`modern-pkg` 的 `stats`、`modern-proxy?path=/version`、`modern-sysupgrade` 的 `info`
均返回合法 JSON 且数值与路由器实际状态一致；`modern-uci` 用“签发令牌 → 用非法用户名调用
`set-password`”验证到令牌校验与用户名校验都命中（400），**没有真正改密**。
**前端没有做浏览器端到端回归**，只做了 `vue-tsc` 与生产构建；
**写路径没有在回归中执行**（改密码 / 重启 / 恢复出厂 / 刷写），只做了代码路径核对与 `sh -n`。

#### 一、路由器 CGI

**1. `consume_token` 让所有令牌动作必然失败（本批最重要的修复）**

- **症状**：改密码、重启、恢复出厂、恢复备份**一律**回 `403 {"error":"令牌无效或已过期"}`，
  哪怕令牌是刚申请的、用途完全一致。用户无法通过控制台完成这四类动作。
- **根因**：`deploy/modern-uci` 的 `consume_token` 把参数读进 `$_got`，校验的却是未定义的 `$got`。
  `[ -n "$got" ]` 永远不成立，函数直接 `return 1`，所有令牌动作在到达实际操作前就被拒。
- **改法**：改为检查 `$_got`；令牌会拼成 `/tmp/modern-tokens/<token>` 的文件名，因此把字符集
  限制为 `[A-Za-z0-9-]`，点、斜杠等路径字符直接拒绝。
- **验证**：用临时会话 + `/tmp` 副本验证：签发令牌后，非法用户名能通过令牌校验并命中用户名校验（400）；未执行真实改密。
  真正的写动作（改密码 / 重启）需在真机上执行一次确认，登记在「待补」。

**2. `set-password` 的改密工具回退与用户名白名单**

- **症状**：部分固件改密码固定报 `500 {"error":"修改失败"}`；用户名可以传任意字符。
- **根因**：只调用 `chpasswd`，而 `chpasswd` 不是 BusyBox 自带，很多精简固件只有 `/bin/passwd`。
- **改法**：优先 `chpasswd`（stdin 读 `user:password`）；缺失时回退 `/bin/passwd`
  （stdin 喂两行密码）；两者都没有回 `500 {"error":"系统缺少密码修改工具（chpasswd 或 passwd）"}`。
  用户名限 `[A-Za-z0-9._-]` 且不能以 `-` 开头，否则 `400 {"error":"用户名包含非法字符"}`。
- **验证**：`sh -n` 通过；两条分支逐行核对（`command -v` 判断 + stdin 两行）。

**3. 「系统」页的重启改走一次性令牌路径**

- **症状**：`src/views/SystemView.vue` 直接 `ubus call system reboot`，绕过令牌，与「服务与运维」页行为不一致。
- **根因**：该页是早期只读页面，重启按钮没跟着 v3 写入层一起收口。
- **改法**：改用 `src/api/ops.ts` 的 `rebootRouter()` → `requestToken('reboot')` → `systemOps.reboot(token)`。
- **验证**：`vue-tsc --noEmit` 与 `npm run build` 通过；未做浏览器端到端（重启未执行）。

**4. `modern-data` 删除 MTK 专用的设备名兜底**

- **症状**：非 MTK 设备取不到无线接口时，终端列表直接为空；`phy0-ap0` / `phy1-ap0`
  只在个别板子上成立，猜错时还会去读不存在的接口。
- **根因**：`what=stations` 在 luci-rpc 返回空时硬编码了两个设备名。
- **改法**：按 **luci-rpc `getWirelessDevices` → `iwinfo devices` → `/sys/class/ieee80211/*/device/net/*` → 空数组**
  逐级探测，不再猜名字。
- **验证**：在路由器 `/tmp` 副本上用临时会话调用 `what=stations`，返回 200 与合法 JSON；ucode 加载时无语法错误。

**5. `modern-read` 新增 `what=neighbors`**

- **症状**：只有 DHCP 租约，静态 IP 设备与「有线是否在线」无法判断；未过期租约被误当在线。
- **根因**：只读 CGI 没有邻居表来源，前端只能拿租约当在线证据。
- **改法**：新增 `what=neighbors`，执行 `ip neigh show` 与 `ip -6 neigh show`，
  返回 `{neighbors:[{ip,mac,device,state}]}`；无 `lladdr` 与 `FAILED` 的条目丢弃。
- **验证**：在路由器 `/tmp` 副本上用临时会话调用 `what=neighbors`，返回 200 与 38 条 IPv4/IPv6 邻居；前端解析由 `vue-tsc` 覆盖。

**6. `modern-proxy` 控制口端口与 curl 检查**

- **症状**：ShellCrash 把控制口从 9999 改到别的端口时，代理页始终空白；
  路由器没有 `curl` 时浏览器只拿到空应答或一句无法解析的错误。
- **根因**：`API_BASE` 写死 `http://127.0.0.1:9999`；`curl` 缺失没有前置判断。
- **改法**：从 `/tmp/ShellCrash/config.yaml` 的 `external-controller:` 解析端口
  （接受 `:9999` 与 `127.0.0.1:9999`，读不到回退 9999）；`curl` 缺失回 `503` 并给出安装提示。
- **验证**：`sh -n` 通过；用临时会话调用 `?path=/version` 返回 `v1.19.28`，证明动态端口可用。

**7. `modern-sysupgrade` 的代理、curl、镜像格式与版本判定**

- **症状**：核心没运行时检查更新要等代理超时；只发 `.img.gz` / `.itb` 的机型永远显示「源里没有固件」；
  SNAPSHOT / 自编固件被误判成可升级；上传 `.img` / `.gz` / `.itb` 被拒；没有 `curl` 时更新检查
  只得到一句 `curl: not found`。
- **根因**：代理端口写死 7890 且不检查监听；官方镜像只匹配 `*.sysupgrade.bin`；
  版本比较不区分版本号形态；上传后缀只允许 `.bin` / `.tar`；缺少 `curl` 没有前置判断。
- **改法**：代理端口从 `mixed-port:` 解析（回退 7890），**未监听就不设代理**；
  新增 `curl` 前置检查并**只**放在 `check-update` / `download`，本地 `info` / `upload` / `backup` /
  `restore` / `upgrade` 不依赖 `curl`；官方镜像支持 `.bin` / `.img.gz` / `.itb`；
  只有三段式数字版本号才与官方稳定版比较，SNAPSHOT / 自编版本 / 非 OpenWrt 发行版只加 `warning`；
  上传接受 `.bin` / `.tar` / `.img` / `.gz` / `.itb`。
- **验证**：`sh -n` 通过；用临时会话调用 `action=info` 返回 200 与板卡信息；未执行 `check-update`（需要外网）。

**8. `modern-pkg` 只支持 apk**

- **症状**：opkg 固件上软件包页返回空列表或「不支持的操作」，看不出真实原因。
- **根因**：CGI 本身按 apk 编写，没在入口处说明包管理器不匹配。
- **改法**：所有 action 前置检查 —— 没有 `apk` 但有 `opkg` → `501` + `code:"opkg_not_supported"` +
  「此固件使用 opkg，控制台目前只支持 apk（OpenWrt 24.10+）」；两者都没有 → `501` +
  `code:"package_manager_missing"`。同时把 apk 代理检测从写死的 `127.0.0.1:7890` 改成按
  `mixed-port` 的端口匹配，修复 netstat 打印 `:::7890` 时匹配不到的问题。
- **验证**：`sh -n` 通过；用临时会话调用 `stats` 返回 200（installedCount 215）；opkg 分支未在 opkg 真机上执行。

**9. `modern-shellcrash` 的端口集合**

- **症状**：运行时端口不在默认五端口里时，端口区查不到实际监听。
- **根因**：`TRACKED_PORTS` 只看默认值。
- **改法**：改为**默认五端口 + 运行时 `mixed-port` / `redir-port` / `tproxy-port` /
  `listen`（dns）/ `external-controller` 的并集**，去重后逐个检查。
- **验证**：`sh -n` 通过；用临时会话调用 `ports` 返回 200，五个默认端口与 `netstat` 一致。

#### 二、前端

**10. WAN / WAN6 / LAN 按角色识别，实时流量跟随实际网卡**

- **症状**：接口不叫 `wan` / `wan6` / `lan` 的固件（自定义 network 配置）概览与网络页摘要空白；
  PPPoE 拨号下实时流量为 0。
- **根因**：按接口名硬找，流量只认 `iface.l3_device === 'wan'`。
- **改法**：新增 `src/utils/network.ts` 的 `pickWanInterfaces()` —— **名称 → 默认路由 → netdev 名**；
  实时流量用 `wanDeviceName()`（`l3_device || device`，如 `pppoe-wan`）。
- **验证**：`vue-tsc` / `build` 通过；未做浏览器端到端。

**11. 客户端统计文案与无线面板计数**

- **症状**：「在线设备 / 有线」把只有租约、没有关联的设备算成在线；无线面板只显示「射频数 · 终端数」。
- **根因**：用「总数 − 无线数」反推有线，没有在线证据。
- **改法**：文案改为「客户端 / 其他」；无线面板 footer 改为「射频数 · SSID 数 · 终端数」。
- **验证**：`vue-tsc` / `build` 通过；未做浏览器端到端。

**12. 无线页按射频聚合全部 SSID**

- **症状**：一个射频下挂多个 SSID 时，只统计第一个 SSID 的终端与流量；SSID 数量偏少；
  `phy0-ap0` 之类的接口名只显示一个。
- **根因**：`radio.interfaces[0]` 取第一个接口就停。
- **改法**：聚合该射频全部接口的终端、信号与流量；标题显示「主 SSID +N」；SSID 数按实际段数；
  信道优先用 `iwinfo` 实际上报值；频段筛选按实际存在的 2.4 / 5 / 6 GHz 动态生成，6 GHz 独立配色。
- **验证**：`vue-tsc` / `build` 通过；未做浏览器端到端。

**13. 客户端页的频段统计与「其他客户端」**

- **症状**：频段分布写死 2.4 / 5 GHz；「有线客户端」把租约设备也算进去。
- **根因**：统计按固定档位，没有按实际 `bandLabel` 汇总。
- **改法**：无线频段统计动态汇总（2.4 / 5 / 6 GHz + 未知）；原「有线客户端」改为「其他客户端」
  （仅有 DHCP 租约、未关联无线）。
- **验证**：`vue-tsc` / `build` 通过；未做浏览器端到端。

**14. 静态租约的在线状态**

- **症状**：未过期租约被当成在线；只配静态 IP（不在 DHCP 池）的设备完全看不到。
- **根因**：在线判定只看租约是否存在。
- **改法**：无线看 stations，有线看新的 neighbors；两者都没有的租约不再算在线；
  只有邻居表条目的静态 IP 设备也补进列表（`src/api/systemSettings.ts` 的 `readOnlineDevices()`）。
- **验证**：`vue-tsc` / `build` 通过；未做浏览器端到端。

**15. 监控页累计流量的口径**

- **症状**：累计流量把网桥、VLAN、物理设备累加，明显偏大。
- **根因**：直接求所有接口之和，没有去重。
- **改法**：优先 WAN 设备（`wan` → 名字含 `wan` 的 L3 设备）；找不到才合计全部接口，
  并在卡片上标注「全部接口合计（可能重复计数）」；「在线客户端」改为「客户端」。
- **验证**：`vue-tsc` / `build` 通过；未做浏览器端到端。

**16. 防火墙端口转发的「命中流量」**

- **症状**：端口转发的命中流量经常为 0 或匹配到别的规则。
- **根因**：用内网 `destPort` 去匹配 conntrack，而 DNAT 连接跟踪里记录的是外部端口。
- **改法**：改用 `src_dport`（支持单端口、`-` 与 `:` 范围）；没有外部端口限制的规则返回 0，
  不再猜。
- **验证**：`vue-tsc` / `build` 通过；未做浏览器端到端。

**17. 静态路由的「生效状态」**

- **症状**：`network route` 不可用的固件上，静态路由的生效状态永远显示「未知」。
- **根因**：只认 `network route` 一种应答形状，失败就直接返回不可用。
- **改法**：`network route` 失败或结构不认识时，回退 `network.interface dump` 的 `route` 数组，
  用 `target` + `mask` 组装目标网段（`src/api/networkConfig.ts`）。
- **验证**：`vue-tsc` / `build` 通过；未做浏览器端到端。

**18. 无线配置的信道与带宽**

- **症状**：2.4 GHz 只能选 1–11；5 GHz 缺少 DFS 信道；没有 HE160 / VHT160 / EHT；
  改频段后把 5 GHz 的 `VHT80` 留在 2.4 GHz 上。
- **根因**：信道表按常见监管域裁剪；频段切换没有重置信道与 htmode。
- **改法**：2.4 GHz 扩到 1–13；5 GHz 补 52–144；htmode 补 `HE160` / `VHT160` / `EHT20`–`EHT320`；
  改频段时重置信道与 htmode（`src/components/config-wifi/WifiRadioDialog.vue`）。
- **验证**：`vue-tsc` / `build` 通过；未做浏览器端到端。

**19. 首次配置向导的无线判定**

- **症状**：没有无线硬件的设备（x86、部分 VM、有线固件）永远被判「未配置」。
- **根因**：`configured` 要求存在活动 `wifi-iface`。
- **改法**：没有 `wifi-device` 段也没有 `wifi-iface` 段时跳过无线检查；
  频段识别优先用 runtime `band` / `iwinfo frequency`，再回退 `hwmode` 与顺序。
- **验证**：`vue-tsc` / `build` 通过；未做浏览器端到端。

**20. 代理页的主组排序、控制器端口与文案**

- **症状**：区域组（如「香港节点」）可能因为名字排序被当成主组；页面写死「mihomo 核心」与
  「API 127.0.0.1:9999」。
- **根因**：排序只看中文正则；版本与端口写死在模板里。
- **改法**：排序改为**类型优先**（Selector → URLTest → Fallback → LoadBalance）+ 通用名称词
  （「节点选择」「Proxy」「Select」「手动切换」「GLOBAL」等）；页面从 ShellCrash 状态读实际
  controller 端口（回退 9999）；文案改为「ShellCrash 核心」。
- **验证**：`vue-tsc` / `build` 通过；未做浏览器端到端。

**21. 登录页与侧栏的 LuCI 入口**

- **症状**：没装 LuCI 的固件上，LuCI 入口点了是 404；登录页固定显示「HTTPS 已启用」。
- **根因**：入口无条件渲染；HTTPS 文案写死。
- **改法**：新增 `src/composables/useLuciAvailability.ts`，对 `/cgi-bin/luci/` 做一次 HEAD 探测
  （2 秒超时，**只有 404 视为未安装**；200/302/403/405 都说明路径存在——LuCI 未登录时返回 403，HEAD 可能返回 405）；未安装时隐藏链接并显示「LuCI 未安装」；
  HTTPS 提示按 `window.location.protocol` 显示。
- **验证**：`vue-tsc` / `build` 通过；未做浏览器端到端。

**22. 固件页的 warning 与上传后缀**

- **症状**：SNAPSHOT / 非官方发行版明明无法比较，页面却显示「已是最新」；上传框只接受 `.bin` / `.tar`。
- **根因**：页面只判断 `upgradable`，不区分「不可比较」；扩展名清单没跟 CGI 同步。
- **改法**：`update.warning` 存在时显示 warning 卡片与「无法与官方源比较」，不再显示「已是最新」；
  上传接受 `.bin` / `.tar` / `.img` / `.gz` / `.itb`，与 CGI 一致。
- **验证**：`vue-tsc` / `build` 通过；未做浏览器端到端。

**23. 内置时区列表**

- **症状**：路由器不提供 `luci.getTimezones` 时，时区下拉只有上海 / UTC。
- **根因**：fallback 列表只有两条。
- **改法**：补齐香港、新加坡、东京、伦敦、柏林、纽约、洛杉矶；系统设置页与首次配置使用同一组时区。
- **验证**：`vue-tsc` / `build` 通过；未做浏览器端到端。

### README 收敛批次（2026-10-21）

参照系列仓 gsauxiliary 的门面格式，把根 `README.md` 收敛为**面向用户**的说明：

- 调整 文档 —— 根 README 顶部去掉「一句话」引言块，门面定位由副标题承担（对齐 gsauxiliary）；`tools/check-docs.py` 同步豁免根 README 的引言块检查

- 调整 文档 —— 根 README 重写为 logo 头 + 徽章 + 这是什么 / 适用环境 / 快速开始 / 功能 / 限制 / 反馈 / 免责声明 / 开源鸣谢 / 许可证
- 调整 文档 —— 「技术栈与产物体积」的体积基线与归因迁入 [docs/MAINTENANCE.md](docs/MAINTENANCE.md) §7
- 调整 文档 —— 「认证链路」「数据来源」两节删除（正本本就在 docs/ARCHITECTURE.md 的三层数据流与通道表，属重复）
- 调整 文档 —— 「仓库现状说明」迁入 [docs/MAINTENANCE.md](docs/MAINTENANCE.md) §8「与源目录的同步状态」；删掉「记忆文档」「文档地图」「参与与治理」等开发者向章节（docs 索引就是文档地图）

**本仓是首次建仓。** 内容不是一次功能发布，而是把上游 OpenWrt 运维仓的 `frontend/`
（源目录）的**快照**拆出来，做成能独立上传 GitHub、独立看懂、独立演进的仓库。

拆分动作只动**文档层**：`src/`、`deploy/`、`public/`、`package.json`、`vite.config.ts`、
`tsconfig.json`、`index.html`、`docs/V2-CONTRACT.md`、`docs/V3-CONTRACT.md`、`DESIGN.md`
**一个字节未改**。新写的文档在本仓「文档」章节逐条列出。

写文档的过程里把源目录若干处**与实现脱节**的地方逐条核对出来了，登记在下面的「修复」段（该段收录的是待修缺陷），
**本版不修** —— 修它们会改变行为，需要在有真机的前提下单独走一轮验证。

### 调整

- 调整 仓库 —— 从上游 OpenWrt 运维仓的 `frontend/` **复制**出独立仓库 `OpenwrtConsole`。
  快照时间为 2026-10-20 18:24 前后。写入时逐文件比对（`diff -rq` + `md5sum`）确认
  `README.md` / `DEPLOY.md` / `deploy/` / `DESIGN.md` / `PROGRESS.md` / `docs/V2-CONTRACT.md` /
  `docs/V3-CONTRACT.md` 与源目录**逐字节一致**；
  `src/` 已有 **1 处偏差**：`src/views/config/PackagesView.vue`（源目录 18:34 又改过，
  本仓快照停在 18:10 的版本）。源目录仍在被活跃修改，两边**不自动同步**，
  偏差由 [docs/MAINTENANCE.md](docs/MAINTENANCE.md) §8「与源目录的同步状态」登记。
- 调整 文档 —— 新写根 [README.md](README.md)：按「这是什么 → 适用环境 → 快速开始 → 功能 →
  技术栈与产物体积 → 认证链路 → 数据来源 → 限制 → 仓库现状说明 → 免责声明 → 开源鸣谢 → 许可证」
  重新组织；**补上旧 README 漏掉的 ShellCrash 设置页**，修正产物体积表与 ECharts 归因，
  补入「`/www/modern` 不在 `sysupgrade.conf` 保留清单」这条风险。
- 调整 文档 —— 新写 [docs/README.md](docs/README.md)：docs 唯一索引，四类分区 + 两列表格，
  每篇标「正本归属」；末尾写明「新增/删除文档必须同步更新本索引；孤儿文档零容忍」。
- 调整 文档 —— 新写 [docs/DOC-RULES.md](docs/DOC-RULES.md)：本仓文档规则正本
  （分类定位、单一正本映射表、链接纪律、变更触发矩阵、体量预算、索引与孤儿零容忍）。
- 调整 文档 —— 新写 [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)：三层数据流总图 +
  **10 个数据通道表**（走什么 / 返回什么 / 能读什么 / 能写什么 / 授权边界）+
  路由器端 9 个 CGI 清单 + 目录结构与分层规则。
  早前分析记的是「7 个通道」，那是 `modern-pkg` / `modern-sysupgrade` / `modern-shellcrash`
  三个 CGI 加进来**之前**的口径，现在按实际是 10 个。
- 调整 文档 —— 新写 [docs/CGI-CONTRACT.md](docs/CGI-CONTRACT.md)：9 个 CGI 的请求 / 响应 JSON 形状，
  逐节写路径、方法、请求字段、响应字段、错误码、一次性令牌机制（120 秒、单次使用）。
  全部形状**读 `deploy/modern-*` 源码得出**，没有编造字段。
- 调整 文档 —— 新写 [docs/WRITE-LAYER.md](docs/WRITE-LAYER.md)：从 [docs/V3-CONTRACT.md](docs/V3-CONTRACT.md)
  提炼 rpcd 的 UCI 授权白名单、写入范式（读现状 → 本地草稿 → 暂存 → 提交 → 应用）、
  必须走 root CGI 且需要令牌 + 确认词的七类动作，并登记 `uciApply` 这段死代码的历史
  （**本次同步已把它删掉**，应用一律走 `systemOps.applyChanges()` → CGI `modern-uci` 的 `uci-apply`）。
- 调整 文档 —— 新写 [docs/TROUBLESHOOTING.md](docs/TROUBLESHOOTING.md)：按「现象 → 排查步骤 → 原因/解法」
  固定三块结构，标题即检索词（页面白屏 / 登录后立刻掉线 / 路由报 401 / 代理页看不到策略组 /
  诊断命令超时 / 部署后资源 404 / CGI 没生效 / 元素样式丢失 / 会话过期）。
- 调整 文档 —— 新写 [docs/MAINTENANCE.md](docs/MAINTENANCE.md)：构建与部署链、世代保留机制
  （`/www/modern/assets.manifest`）、回退步骤、组件规范、文档与代码的同步责任。
- 调整 文档 —— 新写 [docs/release-notes/README.md](docs/release-notes/README.md)（Release 说明格式正本）
  与 [docs/release-notes/v0.1.0.md](docs/release-notes/v0.1.0.md)（首版说明）。
- 调整 文档 —— 新写 [AGENTS.md](AGENTS.md)：机器协议三条硬约定 ——
  ① PROGRESS 路径由**逻辑任务**决定、每个任务目录内有且仅有一个 `PROGRESS.md`、子代理只写自己的分片；
  ② 本仓的 ShellCrash 设置页是**受控编辑入口**，`config/yamls/*.yaml` 的唯一真源在 `ShellcrashRules` 仓；
  ③ CodeGraph 使用规则（无 `.codegraph/` 时跳过）。
- 调整 文档 —— 新写 [NOTICE](NOTICE)：第三方组件声明（Vue / Vite / TypeScript / Element Plus /
  ECharts / Lucide / art-design-pro / OpenWrt / LuCI），逐项写名称、来源、许可证、为何使用。
- 调整 源码 —— 把上游 OpenWrt 运维仓的 `frontend/`（源目录）的 **v3→v6 代码同步进本仓**：
  本仓 `src/` + `deploy/` 现共 **118 个文件**，本次同步实际改动 **59 个**
  （**44 改 + 15 新增**），全部更新到源目录的当前状态，含 v3 写入层的收口、
  v4 的四个配置页（暂存 → 提交 → 应用）与共享组件（`src/api/configPending.ts`、
  `src/composables/useDraft.ts`、`src/components/cfg-pending/`）、v5 的 ShellCrash 保存链路修复、
  v6 的服务动作状态跟踪。
  **本仓原有的 5 处更新没有覆盖**：新增的 `src/api/device.ts`（登录页显示真实机型）、
  改了品牌页的 `src/views/LoginView.vue`、`vite.config.ts` 的 `ROUTER_URL` 环境变量、
  `src/api/firmware.ts` 的注释脱敏（与源目录的 `verify` 功能**手工合并**，两边都保留）。
  同步后 `vue-tsc --noEmit` 零报错、`vite build` 通过。
- 调整 仓库 —— 新写 `.gitignore`：排除 `node_modules/`、`dist/`、`*.local`、`.env.local`、`*.log` 等；
  **源码与文档一律不排除**。`dist/` 明确标注为构建产物（每次构建 hash 都变，不应入库）。

### 修复

> 本段收录的是**已逐行核对源码确认存在**的缺陷。带「**待修**」标记的是本版未动代码的；
> 不带标记的是**本版已修复**的（每条都写清改法与验证依据）。

- 修复 部署脚本的字面 `\n` —— `deploy/deploy.sh` 的 for 循环里
  `modern-uci \n         modern-pkg modern-sysupgrade modern-shellcrash` 中的 `\n` 是
  **字面的反斜杠 + n**，不是换行符（`cat -A` 全文确认：**整份文件只有这一处**出现 `\n`）。
  sh 的词分割会把它当成一个独立的词 `n`，于是第 7 次迭代的输入重定向
  `< "$ROOT/deploy/n"` 指向一个不存在的文件 → 重定向失败 → 脚本在 `set -eu` 下**直接退出**。
  后果：`modern-pkg` / `modern-sysupgrade` / `modern-shellcrash` **三个 CGI 永远不会被部署**，
  且末尾的 `echo "deployed to ..."` **不会打印** —— 表现为「部署脚本跑完了但什么都没说」，
  看起来像部分成功，实际是**只有 6 个 CGI 上去了、软件包/固件/ShellCrash 三个页面必然 404**。
  **已修**：改成真换行 + 续行反斜杠；`sh -n` 通过，循环实测正确展开为 9 个 CGI。
  仍需真机验证：跑一次 `deploy.sh`，确认 9 个 CGI 全部出现在 `/www/cgi-bin/`
  且末尾两行 echo 有输出。
- 修复 会话过期时间的 fallback —— `src/stores/session.ts` 原来写的是
  `const expires = data.expires || 300`：服务端不返回 `expires` 时，前端按 **300 秒（5 分钟）**算过期，
  而 `deploy/modern-login` 实际用 `timeout: 3600` 申请的是 **3600 秒（1 小时）**。
  两者不一致：最坏情况下**用户还在用，页面却提前把会话判死**（回到登录页）。
  **已修**：`src/stores/session.ts` 现在是 `const expires = data.expires || 3600`，
  与 `deploy/modern-login` 的 `timeout: 3600` 对齐。
  验证：逐行核对两处常量（`src/stores/session.ts` 的 fallback 与 `deploy/modern-login`
  的 `timeout`）均为 **3600**。
- 修复 重复建模与死代码（**已修：归档 + 删死代码**） —— 原条目列了 5 处同一类问题
  （同一份数据被建模了两次以上），其中 **3 处已随本次同步落地**：

  | 对象 | 处置 | 证据 |
  | --- | --- | --- |
  | `src/api/firewall.ts`（只读解析器）vs `src/api/firewallConfig.ts`（可写解析器） | 只读那份**已归档**为 `src/api/_archive/firewall.readonly.ts` | 全仓已无任何 `from '@/api/firewall'` 的引用 |
  | `src/components/firewall/FirewallZoneCard.vue` vs `src/components/config-fw/FwZoneCard.vue` | 前者**已归档**为 `src/components/_archive/FirewallZoneCard.vue` | 只被同样归档的 `src/views/_archive/FirewallView.vue` 引用 |
  | `src/api/uci.ts` 的 `uciApply` | **死代码已删** | `src/api/uci.ts` 现在只导出 `uciGet` / `uciGetSection` / `uciSet` / `uciDelete` / `uciAdd` / `uciCommit` / `uciChanges` |

  `UciSection` 类型因此从**三份**收敛到**两份**（`src/api/uci.ts` 与 `src/api/dns.ts`，
  第三份在归档文件里）—— **仍未合并**，见下面「待修」的 DHCP 那条。
- 修复 孤儿只读路由 —— `name: 'firewall'` 的路由**已从 `src/router/index.ts` 删除**，
  只读视图移到 `src/views/_archive/FirewallView.vue`（`src/components/_archive/FirewallZoneCard.vue`
  随它一起归档），路由与侧栏里只剩可写的 `config-firewall`。
  验证：`src/router/index.ts` 里已搜不到 `name: 'firewall'`，只剩
  `path: 'config/firewall'` / `name: 'config-firewall'`。
- 修复 未使用的 `sass` 依赖 —— `package.json` 的 `devDependencies` 里**已没有 `sass`**；
  `src/` 下仍然 **0 个** `.scss` 文件，`vite.config.ts` 的注释明说
  「no sass toolchain」（Element Plus 走预编译的 theme-chunk css，不走 sass）。
  它原本是 `unplugin-vue-components` 的传递依赖被顺手写进来的，已随本次同步移除。
- 修复 视图缺 `defineOptions` —— 规则要求视图导出
  `defineOptions({ name: 'XxxView' })`（写在一份一次性的开发契约里，没进长期规范，所以无人遵守）。
  **已补齐**：20 个视图文件（含归档的 `src/views/_archive/FirewallView.vue`）**全部**导出了
  `defineOptions({ name: 'XxxView' })`，`name` 与文件名逐个一致。
  验证：逐文件 `grep defineOptions`，**0 个缺失**。
  > 口径更正：早前的分析报告写的是「11 个缺」，按当前源码逐文件核对是 **10 个**；
  > `config/ShellCrashView.vue` 在报告出具后补上了 `defineOptions`。
- 修复 重复建模：DHCP 被解析了两次（**待修**） —— 同一份数据被建模了两次以上；
  原先列的 5 处里，**只剩这一条仍成立**：

  | 对象 | 现状 | 证据 |
  | --- | --- | --- |
  | `src/api/dns.ts` vs `src/api/systemSettings.ts` | 两套 DHCP 解析（`getDhcpSettings` vs `parseDnsmasq`/`parsePools`/`parseLeases`），读同一份 `uci.get dhcp` | 池与租约各解析一次；`getDhcpSettings` 仍被 `src/views/dns/DnsView.vue` 调用 |

  另有残留：`UciSection` 类型仍有**两份**（`src/api/uci.ts` / `src/api/dns.ts`），随归档从三份收敛到两份，仍待合并。
  缺什么证据：合并要逐页核对渲染结果（DNS 页的地址池 / 租约展示），需要真机截图比对。
- 修复 ShellCrash 保存失败但配置其实已改（**破坏性变更：应答形状变了**） ——
  `deploy/modern-shellcrash` 的 `config-write` 把改动项拼成
  `"changed":["ipv6_support":"ON"]`：数组里放没有花括号的键值对，**这不是合法 JSON**，
  浏览器 `JSON.parse` 整段失败 → 前端拿到 `null` → 报
  「Cannot read properties of null (reading 'message')」，而路由器侧其实已经写成功并返回了 200。
  **已修**：`changed` 改成字符串数组 `["ipv6_support=ON"]`（与前端 `changed?: string[]` 一致），
  **6 个 shell CGI**（`modern-exec` / `modern-proxy` / `modern-uci` / `modern-pkg` /
  `modern-sysupgrade` / `modern-shellcrash`）的 `ok()` / `fail()` 统一走 `send_json()`：
  应答先落临时文件，再用 `jsonfilter -i <file> -e '@'` 自检，
  不合法就换成可读的错误而不是让浏览器报「无法解析」。
  **另 3 个 ucode CGI**（`modern-login` / `modern-data` / `modern-read`）用 ucode 的
  `printf("%J", payload)` 序列化 —— **结构上必然是合法 JSON**，
  不需要也不适合套 shell 的那套自检。
  前端另外保留了 `JSON.parse` 的报错位置与出错字符码，以后再出问题能直接定位。
  验证：浏览器内完整走通「改值 → 保存 → 确认 → 成功提示 → 草稿清空」；
  全部 CGI action 逐个 curl + `jsonfilter` 校验全部合法
  （action 型 CGI 共 4 个、合计 **46 个 action**：`modern-uci` 15 · `modern-pkg` 9 ·
  `modern-sysupgrade` 9 · `modern-shellcrash` 13；`modern-data` / `modern-read` 走 `what=` 参数，不计 action）。
- 修复 重启 ShellCrash 后状态不更新 —— 两处叠加：① `deploy/modern-shellcrash` 的后台 runner
  在 `start.sh start` 返回时就写完成记录，而 start.sh 是把核心拉起来就返回的，核心这时还没起来；
  ② 前端拿到完成记录就停止轮询，那个每秒跳的计时器只更新计数、不拉状态。
  于是页面停在「核心进程未运行」，直到手动刷新才变「运行中」。
  **已修**：runner 在写完成记录前先等核心真的起来（`pidof CrashCore`，≤60 秒）或真的消失（≤30 秒），
  等不到写非 0 退出码；前端拿到完成记录后继续等 `running` 变成期望值，任务进行中每 3 秒拉一次状态，
  核心起得慢时后台继续跟踪。状态行不再显示误导性的「服务 inactive」（保守模式下 procd 实例本就不活跃），
  改成「由 ShellCrash 直接拉起」。
  验证：浏览器内实测两次重启，卡片按真实过程变化 `运行中(PID 5269)` → `已停止` → `运行中(PID 9508)`，
  全程无需手动刷新；路由器侧完成记录 `restart 0`、核心进程 1 个、代理实测 204 正常。
- 修复 `modern-uci` 的 `uci-changes` 动作（**破坏性变更：action 没了**） ——
  它返回的是 `uci changes` 的原始文本而不是 JSON，违反「每个应答都是 JSON」的约定，
  而且前端本来就走 ubus 通道（全仓无调用方）。**已修**：删除该动作，
  前端 `src/api/systemOps.ts` 的 `SystemOpAction` 联合类型同步去掉 `'uci-changes'`。
- 修复 软件包页的 opkg 支持（**待修，明确不做**） —— 控制台目前**只支持 apk**，
  OpenWrt 24.10 之前的 opkg 固件上软件包页不可用。
  **本版已做的**：`modern-pkg` 在所有 action 前检查包管理器，opkg 固件返回
  `501 {"ok":false,"error":"此固件使用 opkg，控制台目前只支持 apk（OpenWrt 24.10+）","code":"opkg_not_supported"}`，
  两个包管理器都没有时返回 `code:"package_manager_missing"` —— 用户能看到可读错误，而不是空列表。
  **没做的**：opkg 的列表 / 检索 / 安装 / 卸载 / 升级后端。为什么现在不做：
  列表与检索的字段形状、任务模型与 apk 完全不同（`opkg list-installed` 是纯文本），
  需要一台 23.05 真机逐条核对输出，本轮没有该设备。缺什么证据：一台 opkg 固件设备的
  `opkg list-installed` / `opkg list` / `opkg install` 实际输出与耗时。

### 待补

- **只有 `DESIGN.md` / `docs/V2-CONTRACT.md` / `docs/V3-CONTRACT.md` 仍是源目录副本** ——
  `DEPLOY.md` 与 `PROGRESS.md` **已在本仓重写**（`DEPLOY.md` 改成环境变量占位符与
  「本仓根目录」的部署路径；`PROGRESS.md` 补齐 v4 / v5 / v6 三批），**不再是副本**。
  剩下的 `DESIGN.md` 仍有已确认的过期结论（「防火墙与 DNS 页保持只读，修改仍交给 LuCI」
  —— 防火墙现已**可写**，只有 DNS 状态页仍只读），逐条见
  [docs/MAINTENANCE.md](docs/MAINTENANCE.md) §8「与源目录的同步状态」的表格。
  **本版刻意不改**：它们是源目录的副本，改了就与源目录产生无谓偏差，等同步窗口一起处理。
- **令牌动作的写路径需要一次真机执行验证** —— 本批修复了 `consume_token`（旧代码让所有令牌动作
  必然失败），并核对了前端与 CGI 的调用链、跑过 `sh -n`；但 0.2.0 的回归是**只读**的，
  改密码 / 重启 / 恢复出厂 / 恢复备份都没有在真机上真正执行。发版后至少跑一次「改密码」，
  确认返回 `{"ok":true}` 且新密码能登录。
- **`docs/V2-CONTRACT.md` / `docs/V3-CONTRACT.md` 是一次性开发契约** ——
  其中的「文件归属表」已失效。V3 里长期有效的部分（rpcd 授权边界 + 写入范式）
  已提炼进 [docs/WRITE-LAYER.md](docs/WRITE-LAYER.md)，归档动作待办。

面向用户的说明见 [docs/release-notes/v0.2.0.md](docs/release-notes/v0.2.0.md)。

---

## [0.1.0] — 2026-10-20

首版：以 `art-design-pro` 的设计语言重做 OpenWrt 管理界面，覆盖 v1 只读页面、v2 只读扩展与节点切换、
v3 写入层与运维页面，并把默认入口从 LuCI 切到 `/modern/`。

面向用户的说明见 [docs/release-notes/v0.1.0.md](docs/release-notes/v0.1.0.md)。
