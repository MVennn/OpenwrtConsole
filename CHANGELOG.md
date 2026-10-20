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

## [未发布] — 2026-10-20

**本仓是首次建仓。** 内容不是一次功能发布，而是把上游 OpenWrt 运维仓的 `frontend/`
（源目录）的**快照**拆出来，做成能独立上传 GitLab、独立看懂、独立演进的仓库。

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
  偏差由 [README.md](README.md) 的「仓库现状说明」登记。
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
  提炼 rpcd 的 UCI 授权白名单、写入范式（读现状 → 暂存 → 提交 → 应用）、
  必须走 root CGI 且需要令牌 + 确认词的七类动作，并登记 `uciApply` 零调用这件事。
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
  共 **116 个文件**（`src/` + `deploy/`）更新到源目录的当前状态，含 v3 写入层的收口、
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
> 不带标记的是**本版已修复**的（改动很小、影响面明确，且已在本地用 `sh -n` 与循环展开验证）。

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
- 修复 DEPLOY.md 的 CGI 数量（**待修**） —— `DEPLOY.md` 第 3 行写「把**三个** CGI 放到 `/www/cgi-bin/`」，
  实际磁盘上有 **9 个** `deploy/modern-*`（`login` / `data` / `read` / `exec` / `proxy` / `uci` /
  `pkg` / `sysupgrade` / `shellcrash`）。同一文件里的 CGI 清单表已经是 9 行（正确），
  只有开头那句与「脚本会……」那段的描述是旧的。
  缺什么证据：纯文档修正，改完比对手工部署片段里的循环列表（已是 9 个）即可，无需真机。
- 修复 会话过期时间的 fallback（**待修**） —— `src/stores/session.ts` 的
  `const expires = data.expires || 300`：服务端不返回 `expires` 时，前端按 **300 秒（5 分钟）**算过期，
  而 `deploy/modern-login` 实际用 `timeout: 3600` 申请的是 **3600 秒（1 小时）**。
  两者不一致：最坏情况下**用户还在用，页面却提前把会话判死**（回到登录页）。
  缺什么证据：需要一台真机复现「服务端不返回 expires」这条路径 —— 当前 `modern-login`
  在 `ubus` 返回 `expires` 时会带上该值，fallback 分支只在 `session.login` 异常返回时才走到，
  需要构造该场景才能确认线上是否真的踩到。
- 修复 重复建模与死代码（**待修**） —— 以下五处是同一类问题（同一份数据被建模了两次以上）：

  | 对象 | 现状 | 证据 |
  | --- | --- | --- |
  | `src/api/firewall.ts` vs `src/api/firewallConfig.ts` | 两套平行解析器读同一份 `/etc/config/firewall`（`parseFirewallConfig` vs `parseFirewallModel`） | 前者是只读模型，后者是可写模型 |
  | `src/components/firewall/FirewallZoneCard.vue` vs `src/components/config-fw/FwZoneCard.vue` | 两个近乎逐行同构的组件，`<style scoped>` 高度重合 | 类名集合只差 2 项 |
  | `src/api/dns.ts` vs `src/api/systemSettings.ts` | 两套 DHCP 解析（`getDhcpSettings` vs `parseDnsmasq`/`parsePools`/`parseLeases`），读同一份 `uci.get dhcp` | 池与租约各解析一次 |
  | `UciSection` 类型 | **三份**定义：`src/api/uci.ts`、`src/api/dns.ts`、`src/api/firewall.ts` | 三处各写各的 |
  | `src/api/uci.ts` 的 `uciApply` | **零调用**的死代码 | 全仓只在定义处命中；`docs/V3-CONTRACT.md` 却把它写进「写入范式」 |

  另外 `src/api/firewall.ts` 里的 `luciZoneUrl` / `luciFirewallUrl` 也是零调用的残留。
  缺什么证据：合并要逐页核对渲染结果（尤其防火墙页的规则表格），需要真机截图比对。
- 修复 孤儿只读路由（**待修**） —— `src/views/firewall/FirewallView.vue` 的路由
  （`path: 'firewall'` / `name: 'firewall'`）在 `src/router/index.ts` 里注册了，
  但 `src/components/AppSidebar.vue` **只注册了 `config-firewall`**，
  全仓找不到任何指向 `name: 'firewall'` 的链接 → 只能手敲 `#/firewall` 访问。
  它与 `src/views/config/FirewallConfigView.vue`（可写，1215 行）职责重叠。
  缺什么证据：决定「归档」还是「并入可写页」需要产品口径，代码层面无从判断。
- 修复 未使用的 `sass` 依赖（**待修**） —— `package.json` 的 `devDependencies` 里有
  `"sass": "^1.83.0"`，但 `src/` 下 **0 个** `.scss` 文件，`vite.config.ts` 的注释明说
  「no sass toolchain」（Element Plus 走预编译的 theme-chunk css，不走 sass）。
  它是 `unplugin-vue-components` 的传递依赖被顺手写进来的。
  缺什么证据：删掉后跑一次 `npm install && npm run build`，确认产物字节数不变。
- 修复 视图缺 `defineOptions`（**待修**） —— 规则要求视图导出
  `defineOptions({ name: 'XxxView' })`（写在一份一次性的开发契约里，没进长期规范，所以无人遵守）。
  实测 20 个视图文件中 **10 个有、10 个没有**（缺：`ClientsView` / `DashboardView` / `LoginView` /
  `NetworkView` / `ProxyView` / `SystemView` / `WirelessView` / `config-MonitorView` /
  `config-WirelessConfigView` / `setup-SetupWizardView`）。
  > 口径更正：早前的分析报告写的是「11 个缺」，按当前源码逐文件核对是 **10 个**；
  > `config/ShellCrashView.vue` 在报告出具后补上了 `defineOptions`。
  缺什么证据：无功能风险，但会改变组件名（影响 `keep-alive` 与调试器里的组件树），改完要在浏览器里过一遍。

- 修复 ShellCrash 保存失败但配置其实已改（**破坏性变更：应答形状变了**） ——
  `deploy/modern-shellcrash` 的 `config-write` 把改动项拼成
  `"changed":["ipv6_support":"ON"]`：数组里放没有花括号的键值对，**这不是合法 JSON**，
  浏览器 `JSON.parse` 整段失败 → 前端拿到 `null` → 报
  「Cannot read properties of null (reading 'message')」，而路由器侧其实已经写成功并返回了 200。
  **已修**：`changed` 改成字符串数组 `["ipv6_support=ON"]`（与前端 `changed?: string[]` 一致），
  9 个 CGI 的 `ok()` / `fail()` 统一走 `send_json()`：应答先落临时文件，
  再用 `jsonfilter -i <file> -e '@'` 自检，不合法就换成可读的错误而不是让浏览器报「无法解析」。
  前端另外保留了 `JSON.parse` 的报错位置与出错字符码，以后再出问题能直接定位。
  验证：浏览器内完整走通「改值 → 保存 → 确认 → 成功提示 → 草稿清空」；
  15 个 CGI 动作逐个 curl + `jsonfilter` 校验全部合法。
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

### 待补

- **本仓自身的许可证尚未定稿** —— 仓库内没有 `LICENSE` 文件。
  待定：许可证名称与版本；定完需新增 `LICENSE`、在 [README.md](README.md) 的「许可证」段写清、
  并让 GitLab 项目元信息与 [NOTICE](NOTICE) 一致。
- **`DEPLOY.md` / `PROGRESS.md` / `DESIGN.md` 仍是源目录副本** —— 三者都有已确认的过期内容
  （CGI 数量、页面/CGI 计数、「防火墙与 DNS 页只读」的旧结论）。逐条见
  [README.md](README.md) 的「仓库现状说明」表格。**本版刻意不改**：它们是源目录的副本，
  改了就与源目录产生无谓偏差，等同步窗口一起处理。
- **发版前要把版本号推到 `0.2.0`** —— 按 [docs/VERSIONING.md](docs/VERSIONING.md) §1–§2：
  本次同步改了 `src/` 里的页面逻辑（→ 次版本），且有两处**破坏性变更**
  （`modern-shellcrash` 的 `config-write` 应答形状、`modern-uci` 少了 `uci-changes` 动作），
  必须走次版本并在 CHANGELOG 里显式标注。待办：写
  `docs/release-notes/v0.2.0.md`、更新 VERSIONING.md §4 的「当前版本」。
- **`DEPLOY.md` / `PROGRESS.md` / `DESIGN.md` 仍是源目录副本** —— 本次同步已把
  `DEPLOY.md` 的「应答格式约定」写进 [docs/CGI-CONTRACT.md](docs/CGI-CONTRACT.md)，
  但根 `DEPLOY.md` 与 `PROGRESS.md` 仍需按本仓的文档规则重写（它们描述的是源目录的形态）。
- **`docs/V2-CONTRACT.md` / `docs/V3-CONTRACT.md` 是一次性开发契约** ——
  其中的「文件归属表」已失效。V3 里长期有效的部分（rpcd 授权边界 + 写入范式）
  已提炼进 [docs/WRITE-LAYER.md](docs/WRITE-LAYER.md)，归档动作待办。

---

## [0.1.0] — 2026-10-20

首版：以 `art-design-pro` 的设计语言重做 OpenWrt 管理界面，覆盖 v1 只读页面、v2 只读扩展与节点切换、
v3 写入层与运维页面，并把默认入口从 LuCI 切到 `/modern/`。

面向用户的说明见 [docs/release-notes/v0.1.0.md](docs/release-notes/v0.1.0.md)。
