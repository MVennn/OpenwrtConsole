# Daymychen/art-design-pro —— 来源凭证

> **一句话**：本目录是 art-design-pro 的**原样快照**（395 个文件），它是本仓
> `/modern/` 控制台**设计系统的视觉基线** —— 本仓的 CSS 令牌是从它派生的。

---

## 1. 上游

| 项 | 值 |
| --- | --- |
| 仓库 | `Daymychen/art-design-pro` |
| URL | <https://github.com/Daymychen/art-design-pro> |
| 许可 | **MIT**（原文见本目录 `LICENSE`） |
| 钉住的 commit | `f3aaf58eec1a0e988f162352c33862327a484f95`（`main`） |
| 上游路径 | 仓库根（整仓快照） |
| 上游 star | 5.9k |

## 2. 包含哪些文件

**整仓快照**：395 个文件，约 3.0 MB（`src/` `public/` `scripts/` `docs/` 与全部配置文件）。

## 3. 逐字节一致性

| 项 | 结果 |
| --- | --- |
| 与上游逐字节一致 | **395 / 395** ✅ |
| 内容有差异 | **0** |
| 本仓新增 | **1** —— `src/types/import/.gitignore`（见下） |

> ⚠️ **坑**：从 Windows 上 `git clone` 出来再复制，会被 `core.autocrlf` **转换成 CRLF**，
> 于是「看起来没改」的文件其实**每个字节都不同**。本快照是用
> `codeload.github.com/<owner>/<repo>/tar.gz/<sha>` 取的**原始 blob 字节**，
> 并逐个 md5 与上游比对确认过。

## 4. 唯一一处本仓新增：`src/types/import/.gitignore`

```gitignore
!auto-imports.d.ts
```

**为什么需要它**：上游自己的 `.gitignore` 把 `src/types/import/auto-imports.d.ts`
当「自动生成物」排除，但上游仓库里**其实追踪着**这个文件
（`git ls-files` 能查到）。原样 vendor 这份快照时若照抄上游规则，
这一个文件会被 gitignore 挡在仓外 —— 也就是 **vendor 的内容不完整**。

git 的忽略规则里**越深的 `.gitignore` 优先级越高**，所以在同目录放一个同名
`.gitignore`、只写一条「取消排除」即可让该文件重新可入库；
上游 `.gitignore` 的其余规则（`node_modules` / `dist` / `*.local` …）全部照旧生效。

> 上游根目录的 `.gitignore` 本身**逐字未改**（md5 与上游一致）。

## 5. 与本仓的关系（为什么值得 vendor）

本仓的 `src/styles/tokens.css` 头部写着
`Design tokens derived from art-design-pro (MIT)` —— 令牌是**逐值对应**的，不是"借鉴"：

| 本仓令牌 | 上游令牌 | 值 |
|---|---|---|
| `--surface-3` | `--art-gray-100` | `#f9fafb` |
| `--text` | `--art-gray-800` | `#383853` |
| `--bg` | `--default-bg-color` | `#fafbfc` |
| `--text-muted` | `--art-gray-600` | `#7987a1` **调深后**的值（上游原值对比度只有 3.6:1，本仓调到 4.7:1 以满足无障碍） |

**存上游原件**的价值：任何时候都能回答"这个令牌原本长什么样、我们改了多少、为什么改"。

## 6. 怎么更新

```bash
SHA=$(git ls-remote https://github.com/Daymychen/art-design-pro.git refs/heads/main | cut -f1)
curl -sSL "https://codeload.github.com/Daymychen/art-design-pro/tar.gz/$SHA" -o /tmp/adp.tgz
# 解包覆盖本目录（保留 src/types/import/.gitignore）
```

**更新后必须做两件事**：
1. 逐文件 md5 与上游比对，确认 0 差异（除了那个 `.gitignore` 例外）；
2. 核对本仓 `src/styles/tokens.css` 的令牌是否需要跟着调整 —— 上游改了令牌名或值，
   本仓的对���表就会过期。

## 7. 许可

MIT —— 可自由再分发，只需保留版权声明与许可全文。本目录保留了上游的 `LICENSE`。
本仓整体也是 MIT（见仓库根 [LICENSE](../../LICENSE)），两者兼容。

> 本仓**不含**任何 GPL-3.0 派生件（ShellCrash 的派生件在兄弟仓 `ShellcrashRules`），
> 所以整仓 MIT 成立 —— 详见本仓 [NOTICE](../../NOTICE) 与
> [docs/UPSTREAM.md](../../docs/UPSTREAM.md)。
