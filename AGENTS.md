# AGENTS.md

> **一句话**：给自动化代理（子代理 / AI 助手）看的协作协议 —— 三条硬约定，
> 违反其中任何一条都会造成**不可恢复的破坏**（覆盖别人的进度、改坏别人的真源）。

本文件是**机器协议**，不是给人读的设计文档。人读的规范在 [docs/](docs/README.md)，
根 [README.md](README.md) 是门面。

---

## 1. PROGRESS 的路径由「逻辑任务」决定，不是物理目录

**硬约定。**

- **一个逻辑任务 = 一个 `PROGRESS.md`**，放在该逻辑任务自己的目录里，
  **每个任务目录内有且仅有一个** `PROGRESS.md`。
- 判断依据是**逻辑任务**，不是物理目录。同一个物理目录下可以并存多个互不相干的逻辑任务，
  它们各有各的 `PROGRESS.md`，放在各自的子目录里。
- **子代理只写自己的分片文件**，绝不写任何共享文件。分片命名约定：
  `docs/agent-<name>.md`、`audit/agent-<name>.md` 这类**任务内**路径。

### 为什么

历史上出过事故：本仓的上游工作目录曾有 **13 个并行子代理**同时往**根目录那一份** `PROGRESS.md` 写，
**后写覆盖前写** —— 进度记录整段丢失，而且没人知道丢了什么。

结构性原因在于把「任务根目录」理解成了**物理目录**（某个具体的工作目录路径），
于是「路由器运维」「规则审计」「模型接入」「前端开发」四个互不相关的逻辑任务全都往同一个物理文件写，
结果同一份文件里出现了两个「第八轮」标题，步骤清单没勾完状态却写着「已完成」。

### 落地

- 本仓的逻辑任务进度写在**本仓根目录的 `PROGRESS.md`**（一个文件，对应「控制台」这一个逻辑任务）。
- 派子代理时，把分片落点写进 prompt，并明确写「**不要修改任何 `PROGRESS.md`**」。
- 主代理收尾时把各分片的结论**汇总**进本仓的 `PROGRESS.md`，而不是让子代理各写各的。

## 2. ShellCrash 设置页是「受控编辑入口」，不是自由文本编辑器

**硬约定。**

- `config/yamls/*.yaml`（`proxies.yaml` / `proxy-groups.yaml` / `user.yaml` 等）
  的**唯一真源**在 **`ShellcrashRules` 仓**，不在本仓。
- 本仓的 ShellCrash 设置页（`src/views/config/ShellCrashView.vue` +
  `src/api/shellcrashConfig.ts` + `deploy/modern-shellcrash`）**只允许**做这些事：
  - 启停覆写文件（`config.yaml` / `proxies.yaml` / `proxy-groups.yaml` / `rules.yaml` / `user.yaml`）；
  - 读写 `ShellCrash.cfg` 里**白名单键**（`CFG_KEYS`）；
  - 查看服务状态、订阅概览、日志、CrashCore 自愈状态；
  - **触发订阅热更新**（`modern-shellcrash` 的 `sub-update`，**必须带 `confirm=yes`**），
    以及查它的进度（`sub-update-state`）；
  - **启停 ShellCrash 服务**（`modern-shellcrash` 的 `service`），并且**跟踪状态到「已就绪」**：
    **完成记录 ≠ 状态到位** —— 路由器侧的完成记录只说明「脚本跑完了」，
    前端必须继续等 `running` 变成期望值（启动 / 重启等 `running === true`，停止等 `running === false`），
    才算这次动作做完了。
- **不得**在本仓里自由文本覆盖那批 yaml 的内容，**不得**在本仓里新建 / 复制那批 yaml 的真源副本。
  规则、节点、策略组的**内容变更**必须回 `ShellcrashRules` 仓改，再由那边的脚本下发到路由器。

### 为什么

那批 yaml 与 `ShellcrashRules` 仓管理的文件**同名同物**（路由器上的 `/etc/ShellCrash/yamls/`）。
两个地方各改一份，迟早各改各的 —— 最终路由器上的策略组和仓库里记的对不上，
而排查这种不一致的人不会想到去另一个仓看。

### 落地

- 改本仓的 ShellCrash 页时，先确认改动属于「受控编辑入口」的范围内；
  越界的需求（改规则内容 / 改节点 / 改策略组定义）**不在本仓做**，指回 `ShellcrashRules`。
- `deploy/modern-shellcrash` 的路径常量（`CFG_FILE` / `YAMLS_DIR` / `OVERRIDE_FILES`）是**字面常量**，
  请求永远不能自带路径 —— 改这个 CGI 时不要为了「方便」把路径改成参数。

## 3. CodeGraph

- 本仓**当前没有** `.codegraph/` 目录（索引由 SessionStart 钩子按需建立）。
- **没有 `.codegraph/` 时直接跳过 CodeGraph**，用常规的文件检索 / 阅读工具。
- 一旦本仓根目录出现 `.codegraph/`，就**先**用 CodeGraph 定位符号与调用链，
  再决定要不要读文件 —— 别先 grep 一轮再回头索引。
- 索引由维护者决定是否建立；**不要**自行 `git init` 或提交。

## 4. 策略组排序（ShellcrashRules）

- **硬约定**：新增 / 改名 / 删除策略组时，必须同步
  `ShellcrashRules/config/hooks/reorder-groups.sh` 的 `order[]`
  （组顺序；需要出现在 `🚀 节点选择` 的再加成员顺序；节点需要排序的加节点排序目标）。
- **排序正本**：`ShellcrashRules/docs/ARCHITECTURE.md` 的
  「代理组排序规则（新增组必须遵守）」。不要按 `proxy-groups.yaml` 文件顺序或订阅顺序排。
- 漏加不会报错，但该组会掉到面板最后；改完用配置副本跑
  `sh reorder-groups.sh /tmp/test.yaml`，验证「组顺序 / 主选择器成员 / 节点顺序」三处。

---

## 附：动手之前必须知道的三条

1. **不要在路由器上做递归扫描或全盘搜索**（`grep -r /etc /var`、`find /`、遍历 overlay 或 `/tmp`）。
   已有先例把 233 MB 内存打满并触发看门狗重启。只读**单个已知路径**的文件，或用 ubus 精确取数据。
2. **不要并发对路由器做写操作**。多个代理同时写 UCI 会互相破坏；
   写路径的验证由主代理统一串行执行。
3. **不要 `npm install`、不要改 `package.json` / `vite.config.ts` / `tsconfig.json`**（除非任务明确要求），
   不要并发跑 `npm run build`（会和其他代理抢占 `dist/`）。类型自检用 `npx vue-tsc --noEmit`（只读）。
