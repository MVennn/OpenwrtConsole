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
| [DESIGN.md](DESIGN.md) | 设计令牌与组件规范**正本**：视觉基线、信息层级、对比度标准（**源目录副本，待同步**：只读 / 可写的旧结论已过期，见 [MAINTENANCE.md](MAINTENANCE.md) §8） |

## 二、功能与实现

| 文档 | 一句话定位 |
|---|---|
| [FEATURES.md](FEATURES.md) | 功能清单**正本**：每个分区能做什么、读与写的分界、已验证环境 |
| [LIMITS.md](LIMITS.md) | 限制清单**正本**：十四条设计边界（授权白名单、诊断白名单、只支持 apk、内核更新只检测等）与为什么 |
| [WRITE-LAYER.md](WRITE-LAYER.md) | 写入层：rpcd 的 UCI 授权白名单、写入范式（读现状 → 本地草稿 → 暂存 → 提交 → 应用）、必须走 root CGI 且需要令牌 + 确认词的七类动作 |

## 三、流程与规范

| 文档 | 一句话定位 |
|---|---|
| [DEPLOY.md](DEPLOY.md) | 部署细则**正本**：前置条件与路由器运行时依赖、一键 / 手动部署、CGI 清单、缓存与世代保留、回退与排障 |
| [MAINTENANCE.md](MAINTENANCE.md) | 维护流程：构建与部署链、世代保留机制（`assets.manifest`）、回退步骤、组件规范、文档与代码的同步责任 |
| [TROUBLESHOOTING.md](TROUBLESHOOTING.md) | 排错手册：按「现象 → 排查步骤 → 原因 / 解法」组织的排查流程，标题即检索词 |
| [SECRETS.md](SECRETS.md) | 凭据位置**正本**（只写位置不写值）：本仓**不存任何凭据**、会话 sid 是运行时的（默认 1 小时）、危险动作靠 120 秒单次令牌 + 确认词、mihomo secret 只在路由器本地读 |
| [VERSIONING.md](VERSIONING.md) | 版本晋升规则**正本**：三段式进位（有功能更新 +0.1.0 / 没有 +0.0.1）、版本号**只在 CHANGELOG 的版本标题**维护、什么时候不动版本号；本仓**有产物但 `dist/` 不入库**，`package.json` 的 `version` **不是**版本号 |
| [DOC-RULES.md](DOC-RULES.md) | 文档规则**正本**：分类定位、单一正本映射表、链接纪律、变更触发矩阵 |

## 四、参考资料

| 位置 | 一句话定位 |
|---|---|
| [release-notes/](release-notes/README.md) | 面向用户的 Release 说明，文件名 = `versionName`（即**仓库发布号**，不带 `v` 前缀）；格式规范在它的 README |
| [V4-CONTRACT.md](V4-CONTRACT.md) | v4 开发契约（**正本**）：消灭假按钮、草稿状态持久化、按模块清单补新功能 |
| [V3-CONTRACT.md](V3-CONTRACT.md) | **历史文档**：v3 阶段的并行开发契约。其长期有效部分（rpcd 授权边界、写入范式）已提炼进 [WRITE-LAYER.md](WRITE-LAYER.md) |
| [V2-CONTRACT.md](V2-CONTRACT.md) | **历史文档**：v2 阶段的并行开发契约，其「文件归属表」已失效 |
| 仓库根 [README.md](../README.md) | 门面（面向使用者）：这是什么、环境要求、安装、反馈、免责声明、开源鸣谢、许可证 |
| 仓库根 [CHANGELOG.md](../CHANGELOG.md) | 开发者记录：变更历史 + **待修缺陷清单**（含「待补」项）；**版本号本身**在这里维护，规则见 [VERSIONING.md](VERSIONING.md) |
| 仓库根 [CONTRIBUTING.md](../CONTRIBUTING.md) | 参与贡献：怎么跑起来、改代码要守哪些规矩、提交前跑什么 |
| 仓库根 [SECURITY.md](../SECURITY.md) | 安全策略：怎么报告安全问题（**不要开公开 Issue**）、本控制台的权限边界 |
| 仓库根 [AGENTS.md](../AGENTS.md) | 机器协议：给自动化代理看的三条硬约定 |
| 仓库根 [PROGRESS.md](../PROGRESS.md) | 进度台账：追加式的批次日志 |
| 仓库根 [LICENSE](../LICENSE) | 许可证全文（**MIT**）—— 与根 [NOTICE](../NOTICE) 的第三方声明配套；本仓**不含**任何 GPL-3.0 派生件（ShellCrash 的 GPL-3.0 派生件在 `ShellcrashRules` 仓） |
| 仓库根 [third-party/](../third-party/README.md) | **随仓分发的上游文件**：每个子目录一份 `UPSTREAM.md`（来源 URL / 钉住的 commit / 许可 / 怎么用 / 怎么更新） |

### 正本归属速查

一类规则只在一篇文档里定义，别处只留一句话 + 链接。这张表是「去哪儿找」的速查，
**不构成第二份正本** —— 细则仍以指向的那篇为准（原则见 [DOC-RULES.md](DOC-RULES.md) §2）。

| 规则 | 正本 |
|---|---|
| 三层数据流、通道能力、目录分层 | [ARCHITECTURE.md](ARCHITECTURE.md) |
| CGI 的请求 / 响应 JSON 形状、错误码 | [CGI-CONTRACT.md](CGI-CONTRACT.md) |
| 设计令牌、组件规范、对比度标准 | [DESIGN.md](DESIGN.md) |
| 功能分区清单、能做什么 | [FEATURES.md](FEATURES.md) |
| 已知限制与设计边界 | [LIMITS.md](LIMITS.md) |
| UCI 授权白名单、写入范式、令牌动作清单 | [WRITE-LAYER.md](WRITE-LAYER.md) |
| 部署步骤、运行时依赖、世代保留、回退 | [DEPLOY.md](DEPLOY.md)（流程侧在 [MAINTENANCE.md](MAINTENANCE.md)） |
| 构建链路、收尾清单、与源目录的同步状态 | [MAINTENANCE.md](MAINTENANCE.md) |
| 排错步骤 | [TROUBLESHOOTING.md](TROUBLESHOOTING.md) |
| 凭据位置与危险动作机制 | [SECRETS.md](SECRETS.md) |
| 版本号进位规则 | [VERSIONING.md](VERSIONING.md) §1–§2（版本号本身在 [../CHANGELOG.md](../CHANGELOG.md) 的版本标题里） |
| Release 说明格式 | [release-notes/README.md](release-notes/README.md) |
| 文档怎么写、怎么互相引用 | [DOC-RULES.md](DOC-RULES.md) |

---

> 新增 / 删除文档后**必须同步更新本索引**（规则见 [DOC-RULES.md](DOC-RULES.md)）；
> **孤儿文档零容忍**：任何新文档必须至少被一处既有文档引用，否则等于没写。
