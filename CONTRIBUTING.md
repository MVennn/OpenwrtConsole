# 参与贡献

> **一句话**：怎么把代码跑起来、改代码要守哪些规矩、提交前跑什么。

## 把它跑起来

```bash
npm install          # 或 npm ci（锁文件已入库）
npm run dev
```

打开 <http://localhost:5173/modern/>。

- `base` 固定为 `/modern/`，**本地也是 `/modern/` 路径**，别用 `/` 打开。
- 开发时 Vite 会把 `/ubus` 与 `/cgi-bin` 代理到路由器（见 `vite.config.ts`），
  所以本地开发直接吃真实路由器数据，登录密码就是路由器 root 密码。
- 默认代理目标是 `https://10.0.0.1`（默认网关的通行默认值，按你的设备地址替换）；
  指向别的设备用环境变量覆盖：

  ```bash
  ROUTER_URL=https://192.168.1.1 npm run dev
  ```

### 本地 UI 开发（不需要路由器）

没有路由器、没有 root 密码时，用随仓的 mock 路由器跑完整界面：

```bash
node tools/mock-router.mjs                    # 终端 1：合成数据，监听 127.0.0.1:5199
ROUTER_URL=http://127.0.0.1:5199 npm run dev  # 终端 2：Vite
```

打开 <http://localhost:5173/modern/>，**用户名和密码随便填**。mock 覆盖
`/ubus` 与 `/cgi-bin/modern-*`，数据全部是合成的（文档地址段、假 MAC、假 SSID、
假节点名），不会碰到真实设备。

- `MOCK_PORT=5199` 改端口；`MOCK_NO_LUCI=1` 模拟未安装 LuCI 的精简固件。
- mock **只监听 127.0.0.1**，且接受任意登录，**不要**把它暴露到 LAN 或用在生产。
- 它不参与构建：`tools/` 不在 Vite 的入口里，`dist/` 不会包含它。

## 组件规范

- 视图文件统一 `XxxView.vue`，并在里面写 `defineOptions({ name: 'XxxView' })` ——
  名字要和文件名一致，否则 Element Plus 的 `keep-alive` 与 devtools 标签会串。
- 视图按**功能域**分目录：`src/views/config/` `src/views/diagnostics/` …，
  不要同时存在"按可读/可写"和"按功能域"两套分法。
- 数据获取一律走 `src/api/` 里的封装，不要在组件里直接 `fetch('/ubus')`。
- 路由与侧栏菜单要**成对**加 —— 只加路由会出现进不去的孤儿页面（这个坑踩过）。
- 样式：Element Plus 按需引入。**新增组件必须把它的样式加进 `src/plugins/element.ts`**，
  否则样式会落在视图 chunk 里、晚于 `src/styles/element.css` 加载而失效。

## 改路由器端 CGI

`deploy/modern-*` 是 ucode / busybox sh，跑在路由器上。

- **必须用 LF 换行** —— CRLF 会让 shebang 直接报 `No such file or directory`。
- 改完先 `sh -n`（sh 脚本）/ 让 ucode 语法检查器过一遍。
- 新增 CGI 要同时加进 `deploy/deploy.sh` 的循环列表**和** `docs/DEPLOY.md` 的清单表 ——
  这两处历史上各写各的，漏一处就等于没部署。

## 文档

文档规则见 [docs/DOC-RULES.md](docs/DOC-RULES.md)（单一正本、每篇开头一句话引言块、
索引唯一、孤儿零容忍）。改文档后跑：

```bash
python tools/check-docs.py
```

## 提交前自检

```bash
npx vue-tsc --noEmit        # 类型
npm run build               # 构建
python tools/check-docs.py   # 文档链接 / 锚点 / 引言块 / 孤儿
```

## 提交信息

按 Conventional Commits：`feat:` `fix:` `docs:` `chore:` `refactor:` `test:`
`perf:`。涉及多个改动的**按对象拆行**（一行一个对象），不要打包成"代码整理"。

## 不要改的地方

- `third-party/` —— vendored 的上游，一个字节都不动。
- `docs/` 里的历史归档（`archive/`）。
