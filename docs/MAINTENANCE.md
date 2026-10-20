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
ROUTER_HOST=root@10.0.0.1 ./deploy/deploy.sh
```

脚本做三件事：

1. `tar` 打包 `dist/` → 通过 SSH 传到路由器 `/tmp/modern-payload.tgz`；
2. 把 `deploy/install-remote.sh` 传到路由器并执行（解包 + 世代保留 + 原子换目录）；
3. 逐个把 9 个 `deploy/modern-*` 传到 `/www/cgi-bin/`（**同目录临时文件 + rename**）。

> ⚠️ **当前 `deploy/deploy.sh` 有一个会让它中途静默退出的缺陷**：
> for 循环里有一个**字面 `\n`**（不是换行符），第 7 次迭代的输入重定向指向不存在的
> `deploy/n` → 重定向失败 → `set -eu` 下脚本直接退出 →
> **`modern-pkg` / `modern-sysupgrade` / `modern-shellcrash` 三个 CGI 永不部署**，
> 且末尾那两行 `echo` 不打印。现象与绕行办法见
> [TROUBLESHOOTING.md](TROUBLESHOOTING.md#6-部署后资源-404) 与根
> [../CHANGELOG.md](../CHANGELOG.md)。

### 1.3 手动部署（脚本不可用时）

```bash
npm run build

tar -czf - -C dist . | ssh root@10.0.0.1 \
  'rm -rf /www/modern.new && mkdir -p /www/modern.new && tar -xzf - -C /www/modern.new &&
   mv /www/modern /www/modern.old && mv /www/modern.new /www/modern && rm -rf /www/modern.old'

for f in modern-login modern-data modern-proxy modern-read modern-exec modern-uci \
         modern-pkg modern-sysupgrade modern-shellcrash; do
  ssh root@10.0.0.1 \
    "cat > /www/cgi-bin/.$f.new && chmod +x /www/cgi-bin/.$f.new && mv /www/cgi-bin/.$f.new /www/cgi-bin/$f" \
    < "deploy/$f"
done

ssh root@10.0.0.1 'chown -R root:root /www/modern && chmod -R a+rX /www/modern'
```

**注意**：手动部署**不做**世代保留（没有 `assets.manifest`），
旧 chunk 会被直接删掉 —— 已经打开的标签页会拿到 404（应用会自动带 `?_reload=` 重载，
但用户会看到一次闪屏）。生产环境优先用 `deploy.sh`。

### 1.4 部署后自检

```bash
ssh root@10.0.0.1 'ls /www/cgi-bin/modern-* | wc -l'      # 期望 9
ssh root@10.0.0.1 'head -1 /www/cgi-bin/modern-uci | od -c | head -1'   # 期望无 \r
curl -sk https://10.0.0.1/modern/ | head -5             # 期望能看到 <!doctype html>
```

浏览器里走一遍：登录 → 概览有数 → 无线页能列出终端 → 诊断页 ping 一下 →
代理页能看到策略组 → 软件包页能看到已装列表。

## 2. 世代保留机制

**问题**：uhttpd 不发 `Cache-Control`，浏览器会启发式缓存 `index.html`。
更新后旧标签页仍拿着**旧 chunk 文件名**去请求已被删除的文件 → 404 → 白屏。

**做法**：保留两代。

| 位置 | 作用 |
| --- | --- |
| `/www/modern/assets.manifest` | 记录**本次发布**带进 `assets/` 的文件清单 |
| `install-remote.sh` | 解包新版本后，按**旧 manifest** 把上一代的文件**拷进新目录**；旧 manifest 里没有的文件不再保留 |

于是 `/www/modern/assets/` 里最多有「当前代 + 上一代」，**每一代约 1.4 MB**。
再多就会把路由器的 overlay（这台机器只有 57 MB）吃满。

> `assets.manifest` 是**部署产物**，不进版本库；它只在路由器上。
> 手工部署（§1.3）不产生 manifest —— 想恢复世代保留，手工把上一代文件拷回去。

**前端侧还有两道自愈**（与世代保留互补）：

1. `index.html` 里的启动守卫：3 秒内应用没 boot → 带 `?_reload=<时间戳>` 重载；
2. `src/composables/useBuildGuard.ts`：每 30 秒用 `no-store` 拉一次 `index.html`，
   比对入口 chunk 名，不同就重载（15 秒防抖）。

## 3. 回退

### 3.1 整站回退

```bash
ssh root@10.0.0.1 '
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
- 回退后 `https://10.0.0.1/` 回到 LuCI 应急入口（无样式但功能完整）。

### 3.2 只回退一个 CGI

```bash
ssh root@10.0.0.1 'cat > /www/cgi-bin/.modern-uci.new && chmod +x /www/cgi-bin/.modern-uci.new &&
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
  > 实测 20 个视图里 10 个有、10 个没有。缺口清单见根 [../CHANGELOG.md](../CHANGELOG.md)。
- 一个视图只做「展示与交互」，**不直接 `fetch`** —— 取数一律走 `src/api/`。
- 每页一个主动作；配置页的主动作是「保存并应用」。

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
- 危险动作要令牌 + 确认；新增令牌用途要同步 [WRITE-LAYER.md](WRITE-LAYER.md) §4。
- **LF 换行**；更新用「同目录临时文件 + rename」。

## 5. 文档与代码的同步责任

**改了代码没改文档 = 没改完。** 触发矩阵见 [DOC-RULES.md](DOC-RULES.md) §5，最常踩的四条：

| 你改了什么 | 必须同时改 |
| --- | --- |
| 加 / 删 / 改一个 CGI | [CGI-CONTRACT.md](CGI-CONTRACT.md) · [ARCHITECTURE.md](ARCHITECTURE.md) 的 CGI 清单 |
| 加 / 删 / 改一个数据通道 | [ARCHITECTURE.md](ARCHITECTURE.md) 的通道表 · 根 [../README.md](../README.md) 的「数据来源」表 |
| 加 / 删一个视图 | 根 [../README.md](../README.md) 的「功能」表 · [ARCHITECTURE.md](ARCHITECTURE.md) §4 |
| 改构建 / 部署 | 本篇 · 根 [../DEPLOY.md](../DEPLOY.md)（同步窗口） |

**计数类内容必须重新数**，不许抄上一版：视图数、CGI 数、通道数、
「有 / 无 `defineOptions` 的视图数」、产物体积。

### 本仓的特殊情况：快照

本仓是源目录（`F:\Project\Openwrt\frontend\`）的**快照**，两边不自动同步。
- 本仓的改动**不会**回流源目录；源目录的改动**不会**回流本仓。
- 根 `DEPLOY.md` / `PROGRESS.md` / `DESIGN.md` / `docs/V2-CONTRACT.md` / `docs/V3-CONTRACT.md`
  仍是源目录副本 —— 它们有过期内容，但**刻意不在本仓修**（改了反而与源目录产生无谓偏差）。
  已登记的过期点见根 [../README.md](../README.md) 的「仓库现状说明」表格。
- 需要同步时：**以源目录为准**做一次定向 diff，把真正需要的内容并过来。

## 6. 收尾清单

每次交付前逐条过：

- [ ] `npx vue-tsc --noEmit` 无新增报错
- [ ] `npm run build` 通过，`dist/index.html` 的引用带 `/modern/` 前缀
- [ ] 部署到路由器（**修好 `deploy.sh` 之前**，手动传 CGI 别信脚本的静默退出）
- [ ] 9 个 CGI 都在 `/www/cgi-bin/`、都有 `x` 位、都是 LF
- [ ] 浏览器里走一遍：登录 → 概览 → 无线 → 诊断 → 代理 → 软件包 → 固件
- [ ] 新加的 Element Plus 组件样式已进 `src/plugins/element.ts`
- [ ] 新视图已导出 `defineOptions`
- [ ] 文档按 [DOC-RULES.md](DOC-RULES.md) §5 的触发矩阵同步
- [ ] 根 [../CHANGELOG.md](../CHANGELOG.md) 追加了本次变更（内部改动**按对象单列一行**）
- [ ] 计数类内容重新数过
