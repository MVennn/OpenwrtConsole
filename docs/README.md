# docs/ 索引

> **一句话**：这里只有索引与定位，不放正文 —— 每篇文档一句话说明「它管什么」，
> 规则本身按 [DOC-RULES.md](DOC-RULES.md) 的单一正本原则只在对应文档里定义。

文档分四类。每篇开头都有一个「一句话」引言块，先看它再决定要不要往下读。

---

## 一、架构与契约

| 文档 | 一句话定位 |
|---|---|
| [ARCHITECTURE.md](ARCHITECTURE.md) | 架构说明：浏览器 SPA → `/ubus` 与 `/cgi-bin/modern-*` → rpcd / 路由器本地 shell 的三层数据流，**10 个数据通道表**与目录分层规则 |
| [CGI-CONTRACT.md](CGI-CONTRACT.md) | 契约**正本**：路由器端 9 个 CGI 的请求 / 响应 JSON 形状、错误码与一次性令牌机制 |

## 二、功能与实现

| 文档 | 一句话定位 |
|---|---|
| [WRITE-LAYER.md](WRITE-LAYER.md) | 写入层：rpcd 的 UCI 授权白名单、写入范式（读现状 → 暂存 → 提交 → 应用）、必须走 root CGI 且需要令牌 + 确认词的七类动作 |

## 三、流程与规范

| 文档 | 一句话定位 |
|---|---|
| [MAINTENANCE.md](MAINTENANCE.md) | 维护流程：构建与部署链、世代保留机制（`assets.manifest`）、回退步骤、组件规范、文档与代码的同步责任 |
| [TROUBLESHOOTING.md](TROUBLESHOOTING.md) | 排错手册：按「现象 → 排查步骤 → 原因 / 解法」组织的排查流程，标题即检索词 |
| [DOC-RULES.md](DOC-RULES.md) | 文档规则**正本**：分类定位、单一正本映射表、链接纪律、变更触发矩阵 |
| [VERSIONING.md](VERSIONING.md) | 版本晋升规则**正本**：三段式进位（有功能更新 +0.1.0 / 没有 +0.0.1）、版本号**只在 CHANGELOG 的版本标题**维护、什么时候不动版本号；本仓**有产物但 `dist/` 不入库**，`package.json` 的 `version` **不是**版本号 |
| [SECRETS.md](SECRETS.md) | 凭据位置**正本**（只写位置不写值）：本仓**不存任何凭据**、会话 sid 是运行时的（默认 1 小时）、危险动作靠 120 秒单次令牌 + 确认词、mihomo secret 只在路由器本地读 |

## 四、参考资料

| 位置 | 一句话定位 |
|---|---|
| [release-notes/](release-notes/README.md) | 面向用户的 Release 说明，文件名 = 版本号；格式规范在它的 README |
| [V3-CONTRACT.md](V3-CONTRACT.md) | **历史文档**：v3 阶段的并行开发契约。其长期有效部分（rpcd 授权边界、写入范式）已提炼进 [WRITE-LAYER.md](WRITE-LAYER.md) |
| [V2-CONTRACT.md](V2-CONTRACT.md) | **历史文档**：v2 阶段的并行开发契约，其「文件归属表」已失效 |
| 仓库根 [CHANGELOG.md](../CHANGELOG.md) | 开发者记录：变更历史 + **待修缺陷清单**（含「待补」项）；**版本号本身**在这里维护，规则见 [VERSIONING.md](VERSIONING.md) |
| 仓库根 [DEPLOY.md](../DEPLOY.md) | 部署细则（源目录副本，**待同步**：CGI 数量等处已过期） |
| 仓库根 [DESIGN.md](../DESIGN.md) | 设计令牌与组件规范（源目录副本，**待同步**：只读/可写的旧结论已过期） |
| 仓库根 [README.md](../README.md) | 门面：这是什么、功能、技术栈、限制、仓库现状 |
| 仓库根 [AGENTS.md](../AGENTS.md) | 机器协议：给自动化代理看的三条硬约定 |
| 仓库根 [LICENSE](../LICENSE) | 许可证全文（**MIT**）—— 与根 [NOTICE](../NOTICE) 的第三方声明配套；本仓**不含**任何 GPL-3.0 派生件（ShellCrash 的 GPL-3.0 派生件在 `ShellcrashRules` 仓） |
| 仓库根 [third-party/](../third-party/README.md) | **随仓分发的上游文件**：每个子目录一份 `UPSTREAM.md`（来源 URL / 钉住的 commit / 许可 / 怎么用 / 怎么更新） |

### 正本归属速查

| 规则 | 正本 |
|---|---|
| 三层数据流、通道能力、目录分层 | [ARCHITECTURE.md](ARCHITECTURE.md) |
| CGI 的请求 / 响应 JSON 形状、错误码 | [CGI-CONTRACT.md](CGI-CONTRACT.md) |
| UCI 授权白名单、写入范式、令牌动作清单 | [WRITE-LAYER.md](WRITE-LAYER.md) |
| 部署链、世代保留、回退步骤 | [MAINTENANCE.md](MAINTENANCE.md) |
| 排错步骤 | [TROUBLESHOOTING.md](TROUBLESHOOTING.md) |
| 版本号进位规则 | [VERSIONING.md](VERSIONING.md) §1–§2（版本号本身在 [../CHANGELOG.md](../CHANGELOG.md) 的版本标题里） |
| 凭据位置与危险动作机制 | [SECRETS.md](SECRETS.md) |
| Release 说明格式 | [release-notes/README.md](release-notes/README.md) |
| 文档怎么写、怎么互相引用 | [DOC-RULES.md](DOC-RULES.md) |

---

> 新增 / 删除文档后**必须同步更新本索引**（规则见 [DOC-RULES.md](DOC-RULES.md)）；
> **孤儿文档零容忍**：任何新文档必须至少被一处既有文档引用，否则等于没写。
