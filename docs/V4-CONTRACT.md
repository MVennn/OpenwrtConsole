# OpenWrt Console · v4 开发契约（假按钮清理 + 状态持久化 + 新功能）

> **一句话**：v4 这一批的**开发契约** —— 消灭假按钮、草稿状态持久化、按清单补功能；
> 三件事的判定标准与各模块的改动清单都在本篇。

本批目标是三件事：

1. **消灭假按钮**——页面上每个可点的东西都必须真的做事；
2. **状态不丢**——改了一半的草稿刷新页面后还在；
3. **补功能**——按下面各模块清单加新东西。

## 1. 假按钮判定标准（所有页面适用）

逐个检查你负责区域里的每个按钮 / 开关 / 下拉 / 链接：

- 点击后必须**真的发生一件事**：发起请求、打开对话框、跳转到一个存在的路由、或展开内容。
- 禁止「点了只弹一句提示」「占位敬请期待」「TODO」这类空壳。
- 禁止跳到不存在的路由或外部死链。
- 表单提交后必须有明确反馈：成功提示 / 失败原因 / 可重试。
- 列表为空时要说清原因，并给出下一步可点的操作（而不是干巴巴一句「暂无数据」）。
- 任何会覆盖/删除/重启的动作，要么可回滚，要么有二次确认，并写清影响面。
- 如果某个能力**确实做不到**（比如 rpcd ACL 拒绝），就把入口去掉，不要留一个点了没用的按钮。

## 2. 草稿持久化（共享层已写好，直接用）

```ts
import { useDraft, useUnsavedGuard } from '@/composables/useDraft'
import DraftNotice from '@/components/DraftNotice.vue'

const draft = useDraft('shellcrash-core', { redir_mod: '', dns_mod: '', ... })
// draft.value.xxx 读写；draft.dirty 是否有未保存修改；draft.savedAt 上次编辑时间
// draft.clear() 保存成功或用户点「放弃修改」后调用
useUnsavedGuard(draft.dirty)
```

模板里在卡片头部下方放：

```vue
<DraftNotice :dirty="draft.dirty" :saved-at="draft.savedAt" @discard="onDiscard" />
```

规则：**保存成功后必须 `draft.clear()`**；用户点「放弃修改」时把 `draft.value` 恢复成服务端现值并 `clear()`。
草稿 key 用 `'<页面>-<对象>'` 命名，避免互相覆盖。

## 3. 共享层禁用清单（谁都不许改）

`src/router/index.ts`、`src/components/AppSidebar.vue`、`src/styles/**`、
`src/plugins/element.ts`、`src/composables/useDraft.ts`、`src/components/DraftNotice.vue`、
`src/api/openwrt.ts`、`src/api/ubus.ts`、`src/api/types.ts`、`src/utils/**`。
需要新能力就在自己的模块里新建文件。

## 4. 路由器约束（踩过的坑）

- 路由器**没有** `timeout` / `ss` / `od` / `file`；用 `netstat`；超时用「后台进程 + 看门狗」
- 出网要显式走代理：`http_proxy=https_proxy=http://127.0.0.1:7890`（ShellCrash 混合端口）
- **绝对不要**在路由器上跑 `grep -r` / `find /` 之类递归扫描（会打爆 233MB 内存并触发看门狗重启）
- 只允许读单个已知文件、`ls` 已知目录、精确路径的 ubus 调用
- CGI 会话校验照抄 `deploy/modern-uci`；写操作要 `confirm=yes` 或一次性令牌
- 不要运行 `npm install` / `npm run build`；自检用 `npx vue-tsc --noEmit`（只修自己文件的报错）

## 5. 交付要求

回复里给出：文件清单、每个「假按钮」的处置（修好 / 删除 / 说明做不到的原因）、
新功能清单、用到的 ubus 方法与 CGI action、类型检查结果。
