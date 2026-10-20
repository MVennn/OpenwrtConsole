# 文档规则

> **一句话**：docs/ 下的文档怎么分类、怎么互相引用、改动时连带改哪些 ——
> 本篇只管「怎么写、怎么保持一致」，不承载任何具体技术规则。

---

## 1. 分类与定位

docs/ 分四类（索引见 [README.md](README.md)）：

| 类别 | 收什么 | 现有成员 |
|---|---|---|
| 架构与契约 | 数据流怎么走、通道各能干什么、CGI 的请求响应形状 | ARCHITECTURE、CGI-CONTRACT |
| 功能与实现 | 一块具体能力的实现约束（怎么写、写到哪、谁能写） | WRITE-LAYER |
| 流程与规范 | 构建、发版、维护、排错、文档规则 | MAINTENANCE、TROUBLESHOOTING、DOC-RULES |
| 参考资料 | Release 说明、历史契约、仓库根的其它文档 | release-notes/、V2-CONTRACT、V3-CONTRACT |

每篇文档开头必须有一个 **「一句话」引言块**（`> **一句话**：…`），
让读者不用往下翻就知道这篇管什么。新文档没有它不算写完。

仓库根的 `README.md` / `DEPLOY.md` / `DESIGN.md` / `AGENTS.md` / `CHANGELOG.md` / `NOTICE`
不归 docs/ 管，但**必须**在 [docs/README.md](README.md) 的「参考资料」分区里登记，
否则它们就成了索引之外的孤儿。

## 2. 单一正本原则

**每条规则只在一篇文档里定义；其余位置只允许一句话概述 + 指向正本的链接。**
两处都写全文，迟早各改各的。

权威正本映射表：

| 规则 | 正本 |
|---|---|
| 三层数据流、通道能力边界、目录分层 | [ARCHITECTURE.md](ARCHITECTURE.md) |
| CGI 请求 / 响应 JSON 形状、错误码、令牌机制 | [CGI-CONTRACT.md](CGI-CONTRACT.md) |
| rpcd 的 UCI 授权白名单、写入范式、令牌动作清单 | [WRITE-LAYER.md](WRITE-LAYER.md) |
| 部署链、世代保留机制、回退步骤、组件规范 | [MAINTENANCE.md](MAINTENANCE.md) |
| 排错步骤 | [TROUBLESHOOTING.md](TROUBLESHOOTING.md) |
| 版本号进位规则 | [../CHANGELOG.md](../CHANGELOG.md) 头部 |
| Release 说明格式 | [release-notes/README.md](release-notes/README.md) |
| 文档怎么写、怎么互相引用 | 本篇 |

### 禁止重复清单

1. **部署步骤三写**：「构建 → 部署 → 回退」曾同时出现在根 `README.md`、
   根 `DEPLOY.md`、本仓 `docs/MAINTENANCE.md`。收敛为
   [MAINTENANCE.md](MAINTENANCE.md) 唯一正本；根 `README.md` 只留一句 + 链接。
2. **CGI 清单多写**：根 `DEPLOY.md` 的 CGI 表、[ARCHITECTURE.md](ARCHITECTURE.md) 的 CGI 清单、
   [CGI-CONTRACT.md](CGI-CONTRACT.md) 的逐篇小节三处都列了 9 个 CGI。
   约定：**清单与职责**在 [ARCHITECTURE.md](ARCHITECTURE.md)，
   **请求响应形状**在 [CGI-CONTRACT.md](CGI-CONTRACT.md)；
   根 `DEPLOY.md` 是源目录副本，允许保留自己那份，但**本仓新增文档不得再抄第三份**。
3. **授权白名单双写**：[WRITE-LAYER.md](WRITE-LAYER.md) 与 [V3-CONTRACT.md](V3-CONTRACT.md)
   都写了那 10 个可写配置文件名。约定：**白名单以 [WRITE-LAYER.md](WRITE-LAYER.md) 为准**，
   `V3-CONTRACT.md` 作为历史文档不再维护。

> 历史文档（`V2-CONTRACT.md` / `V3-CONTRACT.md`）里保留旧结论是**允许**的 ——
> 那是当时的事实。但凡**指向现役文档的链接**必须始终指向现役文档。

## 3. 事实与数字：逐字保留，计数必须同步

- **文件名、函数名、字段名、方法名、路径常量、ubus 方法名、CGI 的 action 名**
  在文档合并或修订时**必须逐字保留，一个不删** —— 哪怕当前代码里暂时没用到
  （那是下次路由器换版本后的排查依据）。
- **计数与清单必须随代码同步**：「9 个 CGI」「20 个视图」「10 个数据通道」
  这类数字不允许停留在旧版本状态。改了代码就重新数一遍，别抄上一版。
  > 实例：本仓建仓时实测为 20 个视图文件、10 个有 `defineOptions` / 10 个没有；
  > 早前分析报告写的是「11 个缺」—— 以逐文件核对的结果为准，并在文档里写明差异原因。
- **实测数字要标来源与时间**：体积、对比度、耗时这类数字写清「哪一次构建 / 哪一台设备 / 什么时候量的」，
  并注明**与旧文档不一致时以哪份为准**。

## 4. 链接纪律

- 统一用**相对链接 + 锚点**，写时用**半角括号**：链接目标写成 `文档名.md#锚点` 这样的相对形式，不用绝对路径。
- **锚点必须真实存在** —— 写之前确认目标标题真的在那一节里。
- **改动 / 删除 / 合并文档后必须双向点验**：
  - 出链：新文档里指向别处的链接目标还存在、锚点没变；
  - 入链：全仓搜旧文件名，把指向它的链接改成新位置 —— **禁止只删文档不改引用方**。
- 判断某段「重复」是否该收敛时，先看它被谁引用；收敛后引用方必须同步改。

## 5. 变更触发矩阵

改了什么，就必须连带改什么：

| 变更 | 必须同步 |
|---|---|
| 新增 / 删除 / 改名一个 CGI | [ARCHITECTURE.md](ARCHITECTURE.md) 的 CGI 清单、[CGI-CONTRACT.md](CGI-CONTRACT.md) 对应小节、[../DEPLOY.md](../DEPLOY.md) 的 CGI 表（同步窗口） |
| 改一个 CGI 的请求 / 响应形状或错误码 | [CGI-CONTRACT.md](CGI-CONTRACT.md) 对应小节 |
| 改 UCI 授权白名单 | [WRITE-LAYER.md](WRITE-LAYER.md) §1 |
| 新增 / 删除一个危险动作或令牌用途 | [WRITE-LAYER.md](WRITE-LAYER.md) §3 的令牌表、[CGI-CONTRACT.md](CGI-CONTRACT.md) 对应小节 |
| 新增 / 删除一个数据通道 | [ARCHITECTURE.md](ARCHITECTURE.md) 的通道表、根 [../README.md](../README.md) 的「数据来源」表 |
| 新增 / 删除 / 改名一个视图 | [ARCHITECTURE.md](ARCHITECTURE.md) §4 的目录结构、根 [../README.md](../README.md) 的「功能」表 |
| 新增 / 删除一个 Element Plus 组件 | [../DESIGN.md](../DESIGN.md) 与 `src/plugins/element.ts`（样式清单）、[TROUBLESHOOTING.md](TROUBLESHOOTING.md) 的「元素样式丢失」节 |
| 改构建 / 部署 / 部署脚本 | [MAINTENANCE.md](MAINTENANCE.md) 对应段、根 [../DEPLOY.md](../DEPLOY.md)（同步窗口） |
| 发版 | 根 [../CHANGELOG.md](../CHANGELOG.md)、[release-notes/<版本>.md](release-notes/README.md) |
| 新增 / 删除文档 | [docs/README.md](README.md) 索引（见 §7） |

## 6. 体量预算与样例时效

- **单篇 ≤ 800 行。** 超了就按「正文档 + 踩坑史」拆：正文档留结论与约束，
  历史 / 根因分析移到 HISTORY 篇。
- **样例时效**：带版本标注的样例（如「2026-10-20 实测」）可容忍过时 —— 它们是历史记录；
  但**功能计数、功能名清单**类内容必须随功能变更同步。

## 7. 索引维护与孤儿零容忍

- [README.md](README.md) 是 docs/ 的唯一索引，**新增 / 删除 / 改名文档必须同步更新**。
- **孤儿文档零容忍**：任何新文档必须至少被一处既有文档引用（或进索引并有明确入口），
  否则等于没写。
- 新文档开头必须有 `> **一句话**：…` 引言块。

## 8. 不确定的内容：写「待补」，不编

- 写不出来就写「**待补**」，并写清**缺什么证据**（需要哪台设备、哪次构建、哪次真机复现）。
- 不要用「大概」「应该是」把猜测写进正文。读者分不清哪句是事实哪句是猜的，
  猜错的那些会被当成依据去改路由器。
- 待补项集中登记在根 [../CHANGELOG.md](../CHANGELOG.md) 的「待补」段，
  别散落在各篇里 —— 散落的待补项没人会去收。
