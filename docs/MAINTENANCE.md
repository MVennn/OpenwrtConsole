# 维护流程

> **一句话**：改了代码之后怎么构建、怎么部署、怎么回退、怎么让文档跟上 ——
> 本篇管**流程**，不管某个具体功能怎么实现。

配套阅读：[ARCHITECTURE.md](ARCHITECTURE.md)（结构与通道）、
[WRITE-LAYER.md](WRITE-LAYER.md)（写入约束）、
[TROUBLESHOOTING.md](TROUBLESHOOTING.md)（出问题了看哪节）。

---

## 1. 构建与部署链

```
src/  ──npm run build──▶  dist/  ──deploy.sh──▶  /www/modern
deploy/modern-*  ──────────────────────────────▶  /www/cgi-bin/
```

### 1.1 本地构建

```bash
npm install
npm run build
```

- 产物在 `dist/`，`base` 固定为 `/modern/`（`vite.config.ts`）。
- **不要**把 `dist/` 提交进版本库（`.gitignore` 已排除）：每次构建的文件名 hash 都变，
  入库只会让仓库无限膨胀，且永远对不上任何一个已部署的版本。
- 类型自检（只读、不产物）：

  ```bash
  npx vue-tsc --noEmit
  ```

- **不要并发跑 `npm run build`** —— 会和其他进程抢占 `dist/`。

### 1.2 一键部署

```bash
ROUTER_HOST=root@<路由器IP> ./deploy/deploy.sh
```

> `ROUTER_HOST` / `ROUTER_WEB` 都是环境变量；不设时默认 `root@10.0.0.1` 与 `/www/modern`
> （`10.0.0.1` 只是默认网关的通行默认值，按你的设备地址替换）。

脚本做三件事：

1. `tar` 打包 `dist/` → 通过 SSH 传到路由器 `/tmp/modern-payload.tgz`；
2. 把 `deploy/install-remote.sh` 传到路由器并执行（解包 + 世代保留 + 原子换目录）；
3. 逐个把 9 个 `deploy/modern-*` 传到 `/www/cgi-bin/`（**同目录临时文件 + rename**）。

> ✅ **`deploy/deploy.sh` 的字面 `\n` 缺陷已修** —— for 循环已改成真换行 + 续行反斜杠，
> `sh -n` 通过，循环实测展开为 **9 个 CGI**（`modern-login` / `modern-data` / `modern-proxy` /
> `modern-read` / `modern-exec` / `modern-uci` / `modern-pkg` / `modern-sysupgrade` /
> `modern-shellcrash`）。**但首次修复后仍需一次真机部署验证**：跑一遍 `deploy.sh`，
> 确认 9 个 CGI 全部出现在 `/www/cgi-bin/` 且末尾两行 `echo` 有输出。

### 1.3 手动部署（脚本不可用时）

```bash
npm run build

tar -czf - -C dist . | ssh root@<路由器IP> \
  'rm -rf /www/modern.new && mkdir -p /www/modern.new && tar -xzf - -C /www/modern.new &&
   mv /www/modern /www/modern.old && mv /www/modern.new /www/modern && rm -rf /www/modern.old'

for f in modern-login modern-data modern-proxy modern-read modern-exec modern-uci \
         modern-pkg modern-sysupgrade modern-shellcrash; do
  ssh root@<路由器IP> \
    "cat > /www/cgi-bin/.$f.new && chmod +x /www/cgi-bin/.$f.new && mv /www/cgi-bin/.$f.new /www/cgi-bin/$f" \
    < "deploy/$f"
done

ssh root@<路由器IP> 'chown -R root:root /www/modern && chmod -R a+rX /www/modern'
```

**注意**：手动部署**不做**世代保留（没有 `assets.manifest`），
旧 chunk 会被直接删掉 —— 已经打开的标签页会拿到 404（应用会自动带 `?_reload=` 重载，
但用户会看到一次闪屏）。生产环境优先用 `deploy.sh`。

### 1.4 部署后自检

```bash
ssh root@<路由器IP> 'ls /www/cgi-bin/modern-* | wc -l'      # 期望 9
ssh root@<路由器IP> 'head -1 /www/cgi-bin/modern-uci | od -c | head -1'   # 期望无 \r
curl -sk https://<路由器IP>/modern/ | head -5             # 期望能看到 <!doctype html>
```

浏览器里走一遍：登录 → 概览有数 → 无线页能列出终端 → 诊断页 ping 一下 →
代理页能看到策略组 → 软件包页能看到已装列表。

### 1.5 路由器运行时依赖

控制台不随包安装这些依赖，部署前确认它们在路由器上存在：

| 依赖 | 谁在用 | apk 固件（24.10+） | opkg 固件 |
| --- | --- | --- | --- |
| `rpcd-mod-luci` | `luci` / `luci-rpc` ubus 对象；概览、无线、客户端页 | `apk add rpcd-mod-luci`（或 `apk add luci-base`） | `opkg update && opkg install rpcd-mod-luci` |
| `curl` | 代理页；固件页的更新检查与下载 | `apk add curl` | `opkg update && opkg install curl` |
| `apk` | 软件包页（唯一后端） | 自带 | 无 —— 软件包页不可用（返回 501） |

缺少时的现象与排错见 [TROUBLESHOOTING.md](TROUBLESHOOTING.md) 第 13–15 节。

> **部署必须同时更新 `dist/` 与 `/www/cgi-bin/modern-*`。** 只传 `dist/` 会让新前端配旧 CGI：
> 客户端在线状态依赖 `modern-read` 新增的 `what=neighbors`，令牌动作依赖 `modern-uci`
> 对 `consume_token` 的修复 —— 两者都在 CGI 里，`deploy/deploy.sh` 会一起传。

## 2. 世代保留机制

**问题**：uhttpd 不发 `Cache-Control`，浏览器会启发式缓存 `index.html`。
更新后旧标签页仍拿着**旧 chunk 文件名**去请求已被删除的文件 → 404 → 白屏。

**做法**：保留两代。

| 位置 | 作用 |
| --- | --- |
| `/www/modern/assets.manifest` | 记录**本次发布**带进 `assets/` 的文件清单 |
| `install-remote.sh` | 解包新版本后，按**旧 manifest** 把上一代的文件**拷进新目录**；旧 manifest 里没有的文件不再保留 |

于是 `/www/modern/assets/` 里最多有「当前代 + 上一代」，**每一代约 1.4 MB**。
再多就会把路由器的 overlay（实测设备上只有 57 MB）吃满。

> `assets.manifest` 是**部署产物**，不进版本库；它只在路由器上。
> 手工部署（§1.3）不产生 manifest —— 想恢复世代保留，手工把上一代文件拷回去。

**前端侧还有两道自愈**（与世代保留互补）：

1. `index.html` 里的启动守卫：3 秒内应用没 boot → 带 `?_reload=<时间戳>` 重载；
2. `src/composables/useBuildGuard.ts`：每 30 秒用 `no-store` 拉一次 `index.html`，
   比对入口 chunk 名，不同就重载（15 秒防抖）。

## 3. 回退

### 3.1 整站回退

```bash
ssh root@<路由器IP> '
  rm -rf /www/modern
  rm -f /www/cgi-bin/modern-login /www/cgi-bin/modern-data /www/cgi-bin/modern-proxy \
        /www/cgi-bin/modern-read /www/cgi-bin/modern-exec /www/cgi-bin/modern-uci \
        /www/cgi-bin/modern-pkg /www/cgi-bin/modern-sysupgrade \
        /www/cgi-bin/modern-shellcrash
  # 把默认入口还回 LuCI
  cp /www/index.luci.html /www/index.html
'
```

- **不会影响 LuCI** —— 控制台只往 `/www/modern` 和 `/www/cgi-bin/modern-*` 写，
  不碰 `/etc/config/luci`、不碰 LuCI 的主题包。
- 回退后 `https://<路由器IP>/` 回到 LuCI 应急入口（无样式但功能完整）。

### 3.2 只回退一个 CGI

```bash
ssh root@<路由器IP> 'cat > /www/cgi-bin/.modern-uci.new && chmod +x /www/cgi-bin/.modern-uci.new &&
  mv /www/cgi-bin/.modern-uci.new /www/cgi-bin/modern-uci' < deploy/modern-uci
```

**必须用「临时文件 + rename」**，直接覆盖会与正在处理的请求竞态。

### 3.3 回退不了的东西

**`/www/modern` 不在 `/etc/sysupgrade.conf` 的保留清单里** —— 路由器刷机会**丢掉整个控制台**。
刷机前必须先把控制台重新部署一遍，或把 `/www/modern` 加进 `sysupgrade.conf`（属于另一条线的决策）。

## 4. 组件规范

### 4.1 视图

- 文件名统一 `XxxView.vue`（放在 `src/views/` 或 `src/views/<域>/`）。
- **必须**导出 `defineOptions({ name: 'XxxView' })`。
  > **已补齐**：20 个视图文件（含归档的 `_archive/FirewallView.vue`）**全部**导出了
  > `defineOptions({ name: 'XxxView' })`，`name` 与文件名逐个一致。
- 一个视图只做「展示与交互」，**不直接 `fetch`** —— 取数一律走 `src/api/`。
- 配置页的主动作是**「暂存 → 提交 → 应用」三段式**，不是一次性「保存并应用」：
  1. **暂存** —— 编辑先落浏览器侧草稿（`localStorage`），再暂存进 UCI 暂存区；
     界面上要能看到「旧值 → 新值」的待生效改动清单；
  2. **提交** —— `uci.commit` 落盘（此刻配置已改，但**还没生效**）；
  3. **应用** —— 重载对应服务，让改动真正生效。
  配套的「放弃修改」是**两层**（清本地草稿 + 回滚 UCI 暂存区），只做一层会两边不一致 ——
  详见 [WRITE-LAYER.md](WRITE-LAYER.md) §2。
- **四个可写配置页（网络 / 无线 / 防火墙 / DHCP 与系统设置）必须共用**同一套共享件：
  `src/api/configPending.ts`（暂存区工具）+ `src/components/cfg-pending/ConfigPendingPanel.vue`
  （渲染「旧值 → 新值」）+ `src/components/DraftNotice.vue`（草稿状态提示）。
  **不许各页自己另起一套** —— 各页自搞一套会让「旧值」与「放弃修改」的语义各页不同。

### 4.2 API 模块

- 一个功能域一个文件（`src/api/<域>.ts`），只做「取数 / 发请求 / 解析成类型」。
- **不要自己拼 URL 字符串**：CGI 路径用模块顶部的常量。
- 统一入口只有三个：`ubusCall` / `cgiGet`（`src/api/ubus.ts`）与 `runSystemOp`（`src/api/systemOps.ts`）。
- 错误码翻成中文的映射表放在**对应 API 模块**里（如 `systemOps.ts` 的 `ERROR_TEXT`）。

### 4.3 Element Plus

- **新增组件时，必须把它的样式加进 `src/plugins/element.ts`**（原因见
  [TROUBLESHOOTING.md](TROUBLESHOOTING.md#8-元素样式丢失)）。
- 命令式服务（`ElMessage` / `ElMessageBox` / `ElNotification` / `ElLoading`）
  **只能**靠这个文件引入 —— 解析器看不见它们。

### 4.4 样式

- `src/styles/tokens.css` 是**视觉唯一真源**；新组件不要自带一套颜色。
- 只用 CSS 变量，深浅色都要能用。
- 动效遵守 `prefers-reduced-motion`。

### 4.5 路由器端 CGI

- 改 CGI 前先读 [CGI-CONTRACT.md](CGI-CONTRACT.md) 对应小节；改完同步更新它。
- **文件路径一律用字面常量**，永远不接受调用方传来的路径。
- 危险动作要令牌 + 确认；新增令牌用途要同步 [WRITE-LAYER.md](WRITE-LAYER.md) §3 的令牌表与 [SECRETS.md](SECRETS.md) §3。
- **LF 换行**；更新用「同目录临时文件 + rename」。

## 5. 文档与代码的同步责任

**改了代码没改文档 = 没改完。** 触发矩阵见 [DOC-RULES.md](DOC-RULES.md) §5，最常踩的五条：

| 你改了什么 | 必须同时改 |
| --- | --- |
| 加 / 删 / 改一个 CGI | [CGI-CONTRACT.md](CGI-CONTRACT.md) · [ARCHITECTURE.md](ARCHITECTURE.md) 的 CGI 清单 |
| 加 / 删 / 改一个数据通道 | [ARCHITECTURE.md](ARCHITECTURE.md) 的通道表 · 根 [../README.md](../README.md) 的「数据来源」表 |
| 加 / 删一个视图 | 根 [../README.md](../README.md) 的「功能」表 · [ARCHITECTURE.md](ARCHITECTURE.md) §4 |
| 改「暂存 → 提交 → 应用」范式（`src/api/configPending.ts` / `src/composables/useDraft.ts` / `src/components/cfg-pending/` / `src/components/DraftNotice.vue`） | [WRITE-LAYER.md](WRITE-LAYER.md) §2（写入范式与「放弃修改」的两层）· [CGI-CONTRACT.md](CGI-CONTRACT.md) 的对应 action（`uci-revert` / `uci-commit` / `uci-apply` / `net-reload` / `wifi-reload` / `firewall-reload`） |
| 改构建 / 部署 | 本篇 · 根 [../DEPLOY.md](../DEPLOY.md)（同步窗口） |

**计数类内容必须重新数**，不许抄上一版：视图数、CGI 数、通道数、
「有 / 无 `defineOptions` 的视图数」、产物体积。

### 本仓的特殊情况：快照

本仓是上游 OpenWrt 运维仓的 `frontend/` 目录的**快照**，两边不自动同步。
- 本仓的改动**不会**回流源目录；源目录的改动**不会**回流本仓。
- 根 `DEPLOY.md` 与 `PROGRESS.md` **已在本仓重写**（DEPLOY.md 改成环境变量占位符与
  「本仓根目录」的部署路径；PROGRESS.md 补齐 v4 / v5 / v6 三批），**不再是源目录副本**。
- 仍是源目录副本的只有 `DESIGN.md` / `docs/V2-CONTRACT.md` / `docs/V3-CONTRACT.md` ——
  它们有过期内容，但**刻意不在本仓修**（改了反而与源目录产生无谓偏差）。
  已登记的过期点见本篇 §8「与源目录的同步状态」表格。
- 需要同步时：**以源目录为准**做一次定向 diff，把真正需要的内容并过来。

## 6. 收尾清单

每次交付前逐条过：

- [ ] `npx vue-tsc --noEmit` 无新增报错
- [ ] `npm run build` 通过，`dist/index.html` 的引用带 `/modern/` 前缀
- [ ] 部署到路由器（`deploy.sh` 的字面 `\n` 缺陷已修，**首次修复后仍要真机跑一次**，
      确认 9 个 CGI 全部到位、末尾两行 `echo` 有输出）
- [ ] 路由器运行时依赖在位：`rpcd-mod-luci`、`curl`、`apk`（见 §1.5）
- [ ] 9 个 CGI 都在 `/www/cgi-bin/`、都有 `x` 位、都是 LF
- [ ] 浏览器里走一遍：登录 → 概览 → 无线 → 诊断 → 代理 → 软件包 → 固件
- [ ] 新加的 Element Plus 组件样式已进 `src/plugins/element.ts`
- [ ] 新视图已导出 `defineOptions`
- [ ] 文档按 [DOC-RULES.md](DOC-RULES.md) §5 的触发矩阵同步
- [ ] 根 [../CHANGELOG.md](../CHANGELOG.md) 追加了本次变更（内部改动**按对象单列一行**）
- [ ] 计数类内容重新数过


## 7. 产物体积基线

> 数据是 2026-10-20 17:49 在源目录上的一次构建实测（**v4 / v5 / v6 三批改动之前**），
> 不代表当前产物 —— 复测请先 `npm run build` 再量。

| 产物 | 原始 | gzip |
|---|---|---|
| 首屏入口 JS | 255 KB（261 568 B） | 94 KB（96 651 B） |
| 首屏入口 CSS | 160 KB（163 619 B） | 23 KB（23 708 B） |
| **首屏合计** | **415 KB** | **117 KB**（120 359 B） |

- Element Plus **全量引入**时首屏是 1.42 MB（gzip 396 KB）；按需引入后降到 415 KB / gzip 117 KB，**减少约 71%**。
- 最大的剩余块是 **`BaseChart` chunk（483 406 B ≈ 472 KB）**，里面装的是 ECharts；
  它被 `DashboardView` 与 `config/MonitorView` **两个**页面引用，随页面懒加载。
- 每一代 chunk 约 1.4 MB；部署侧只保留「当前代 + 上一代」（见 §2）。

## 8. 与源目录的同步状态

本仓是**从上游 OpenWrt 运维仓的 `frontend/` 目录**复制出来的快照，用于让控制台能独立上传 GitLab、
独立看懂、独立演进。源目录仍在前端开发线里被活跃修改，两边**不会自动同步**。

- **快照时间**：初版 2026-10-20 18:24；**已同步到源目录 2026-10-20 23:20 的状态**。
- **当前与源目录的关系（2026-10-20 23:20 逐文件比对）**：

  | 范围 | 与源目录的关系 |
  |---|---|
  | `src/` + `deploy/` | **已同步**：共 **118 个文件**（源目录 117 + 本仓自有的 `src/api/device.ts`），同步实际改动 **59 个文件**（**44 改 + 15 新增**），含 v3 写入层收口、v4 四个配置页、v5 ShellCrash 保存链路修复、v6 服务动作状态跟踪。本仓自己的 **5 处更新**保留：`src/api/device.ts`（新）、`src/views/LoginView.vue`（真实机型）、`vite.config.ts`（`ROUTER_URL` 环境变量）、`src/api/firmware.ts`（脱敏注释）、`src/views/config/FirmwareView.vue`（注释脱敏） |
  | `README.md`、`DEPLOY.md`、`docs/` 全套 | **本仓重写版**，不再是源目录副本 |
  | `DESIGN.md`、`docs/V2-CONTRACT.md`、`docs/V3-CONTRACT.md` | 仍是源目录副本，待重写（见下表） |

  同步后 `vue-tsc --noEmit` 零报错、`vite build` 通过。

- **仍是源目录副本、需要后续同步的**：

  | 文件 | 现状 | 待办 |
  |---|---|---|
  | `PROGRESS.md` | **已重写** | 阶段清单已补 v4/v5/v6 三批 |
  | `DESIGN.md` | 源目录副本 | 「防火墙与 DNS 页保持只读，修改仍交给 LuCI」已**过期** —— 防火墙（连同网络 / 无线 / DHCP 与系统设置）现已**可写**；**只有 DNS 状态页仍只读**，地址池与静态租约的修改入口在「DHCP 与系统设置」页 |
  | `docs/V2-CONTRACT.md` | 源目录副本 | 一次性的并行开发契约，其中「文件归属表」已失效 |
  | `docs/V3-CONTRACT.md` | 源目录副本 | 同上；其中**长期有效**的 rpcd 授权边界与写入范式已提炼进 [WRITE-LAYER.md](WRITE-LAYER.md) |

- **已知缺陷清单**（文档已登记，代码未修）：**DHCP 配置被建模了两次** ——
  `src/api/dns.ts` 的 `getDhcpSettings` 与 `src/api/systemSettings.ts` 的
  `parseDnsmasq` / `parsePools` / `parseLeases` 读的是同一份 `uci.get dhcp`；
  `UciSection` 类型也定义了**两份**（`src/api/uci.ts` 与 `src/api/dns.ts`）。
  逐条见根 [../CHANGELOG.md](../CHANGELOG.md) 的「修复」段 —— 带「待修」标记的才是仍未动的。
