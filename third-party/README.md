# third-party —— vendored 上游项目索引

> **一句话**：本目录是「本仓引用了哪些上游开源项目」的索引 —— 每个项目一条，
> 说清来源 URL、用途、许可证、vendor 的 commit SHA，以及**为什么 vendor 它**。

本仓把上游开源项目**原样 vendor 进仓**，用来保证「参照物不会漂走」：
设计令牌从 art-design-pro 派生，就把它的一份固定快照放在这里，
以后改色板时不必再去网上翻哪个版本。

## 目录

| 项目 | 上游 URL | 用途 | License | vendored commit SHA | 为什么 vendor |
|---|---|---|---|---|---|
| [art-design-pro](art-design-pro/) | https://github.com/Daymychen/art-design-pro | 本仓设计系统（CSS 令牌、组件规范）的**视觉基线**；`src/styles/tokens.css` 由它派生 | MIT | `f3aaf58eec1a0e988f162352c33862327a484f95` | **代码级关系**（令牌逐值对得上）+ **体积 3,108 KB < 5 MB** + **MIT 允许再分发** |

每个项目的详细来源凭证（clone 时间、commit 日期、逐文件核对方法、怎么更新、
本仓怎么用它）写在它自己的 [`UPSTREAM.md`](art-design-pro/UPSTREAM.md) 里。

## 约定

1. **不改上游一个字节。** vendor 时走 `git clone --depth 1` → 记下 commit SHA →
   删掉 `.git` → 复制入仓。落库前逐文件 sha256 与 clone 比对，必须全部一致。
2. **保留上游 LICENSE / NOTICE / 版权头。** 本目录里每个项目自己的许可文件都在。
3. **上游的 README / CHANGELOG 一并保留**，那是上游的东西，不是我们的。
4. **上游的 `.gitignore` 逐字保留，但它可能排除上游自己追踪的文件** ——
   `art-design-pro` 就有一例（`src/types/import/auto-imports.d.ts`）。
   处理办法写在
   [`art-design-pro/UPSTREAM.md`](art-design-pro/UPSTREAM.md) 的「唯一的例外」一节：
   在**更深一层**放一个只含取消排除规则的 `.gitignore`（git 里越深的优先级越高），
   上游规则的其余部分照旧生效。
5. **本目录不参与构建。** 前端的入口只有仓库根的 `src/`；`vite.config.ts` 与
   `tsconfig.json` 都不会扫到这棵树。这里的东西是**只读参照物**。
6. **更新必须同步两处**：项目自己的 `UPSTREAM.md` 和本文件的索引行。

## 明确不 vendor 的上游

| 上游 | 为什么只引用、不 vendor |
|---|---|
| [openwrt/openwrt](https://github.com/openwrt/openwrt) | 目标平台。本仓只**调用**它的 rpcd/ubus 接口与 LuCI CGI，不含其源码；GitHub 仓库 size 316,997 KB，远超 5 MB 门槛 |
| [openwrt/luci](https://github.com/openwrt/luci) | 同上；GitHub 仓库 size 596,030 KB（Apache-2.0，允许再分发，但体积超标） |

这两个项目在本仓 NOTICE 中以「目标平台」列出，并声明**不含其代码**。
