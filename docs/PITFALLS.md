# 踩坑总汇

> **一句话**：路由器端 CGI 与前端写入层的机制级坑 —— 现象、根因、怎么避。
> 按现象排查的步骤在 [TROUBLESHOOTING.md](TROUBLESHOOTING.md)，写入层约定在
> [WRITE-LAYER.md](WRITE-LAYER.md)，本篇只写「为什么会这样」。

## 1. `/tmp/*` 是 glob 前缀匹配，不规范化路径 —— `..` 能穿越

**现象**：备份 / 恢复接口接受 `/tmp/../../etc/cron.d/x`。

**根因**：`case "$path" in /tmp/*)` 只匹配字符串前缀，`*` 会吃掉 `../`。
`modern-sysupgrade` 的备份分支当时多了一道 basename 白名单，另外三个入口没有 ——
同一族逻辑只修了一半。

**怎么避**：任何「必须落在某个目录下」的路径，三道一起上：前缀匹配 + 拒绝 `..` +
basename 字符白名单；有 `realpath` 就先规范化再判。多个入口用**同一个函数**，不要各写各的。

## 2. CGI 吞退出码 = 「保存成功但没生效」

**现象**：保存后页面提示成功，配置没变；或重启后设置回到旧值。

**根因**：`uci revert/commit`、`/etc/init.d/<svc> reload`、`/sbin/reload_config`
执行完不看 `$?`，直接 `ok '{"ok":true}'`。0.3.0 修过 `uci apply`（命令不存在、退出码 255），
但同族的另外六个动作没跟着改 —— **同一个形状第二次出现**。

**怎么避**：特权动作统一走 `run_action`：失败回 500 + `exit_code`，成功回 `exit_code:0`；
确实允许失败的（例如没有 wifi init 脚本）显式回 `skipped`，不要用「假装成功」表示跳过。

## 3. ucode 不是 JavaScript

**现象**：`modern-login` 一上线就报
`Reference error: left-hand side expression is not an array or object`。

**根因**：用了 `limitFile.endsWith(...)`。ucode 的字符串**没有** `endsWith` / `includes`
这类方法；正则字面量（`/^[0-9]+$/`）、`match()` / `replace()` / `split()` / `sprintf()`
是可用的，但不要按 Node 的习惯写。

**怎么避**：判断后缀用 `index(str, "/x") >= 0` 或 `substr`；改完在真机上跑一遍 ——
本机没有 ucode 解释器，`sh -n` 也检查不了 ucode。

## 4. 限速要分桶，还要有全局退路

**现象**：登录接口失败只 `sleep(1)`，并行请求可以绕过；uhttpd 每个请求 fork 一个 CGI。

**根因**：固定延迟只限制单连接速率，不构成失败计数。

**怎么避**：按 `REMOTE_ADDR` 落 `/tmp` 计数（tmpfs，重启清零），5 次冷却 30 秒、
10 次冷却 300 秒，成功登录清零；拿不到 `REMOTE_ADDR` 时退化成全局桶并**放宽阈值**
（20/40），否则一处误输入会把所有人锁在门外。

## 5. 前端 busy 标志要在确认框之前置位

**现象**：刷写、恢复备份、保存、切节点连点两次会重复取令牌 / 并发写 UCI。

**根因**：`loading` 绑定的是 `flashing`，而 `flashing = true` 在 `ElMessageBox.confirm`
之后才执行；确认框挂起的那几秒里按钮仍可点。

**怎么避**：handler 入口先判自己的 in-flight 标志；确认框只是流程的一部分，
不能当成互斥锁。

## 6. 改 CGI 应答形状前，先列出所有调用点

**背景**：本批给 Tier-3 动作加了 `exit_code`，并把失败从「200 + `ok:false`」改成
「500 + `ok:false`」。前端 `runSystemOp` 对非 2xx 与 `ok:false` 都会抛错，
新增字段本身兼容，但**状态码变化**是行为变化。

**怎么避**：`grep -rn "runSystemOp\|cgiPost" src/` 列出调用点，逐个确认错误分支；
真机上把成功、失败、跳过三条路径都跑一遍。

## 7. 部署前先确认设备上跑的是哪个变体

**现象**：`AX3000TOpenwrt` 与 `OpenwrtOpsToolkit` 的 `guardian.sh` 落点相同
（`/etc/ShellCrash/guardian.sh`），但**不是同一份实现**（配置读取、变量名不同）。
2026-10-24 维护时先推了 Ops 版、又推 AX 版，中间几分钟设备上跑的是错误的变体。

**怎么避**：部署前先 `md5sum` 对比设备文件与两个仓的候选，确认血缘；部署后再核对 md5。

## 8. 「临时目录建失败就退回 /tmp」= 给 EXIT trap 递刀

**现象**：潜在 —— `modern-proxy` 原来在 `mkdir -p /tmp/modern-proxy.$$` 失败时把 `TMP`
改成 `/tmp`，而 `trap 'rm -rf "$TMP"' 0` 会在请求退出时删掉整个 `/tmp`。

**根因**：把「没有可用临时目录」当成「用 /tmp 顶一下」，但清理 trap 的目标变量已经变成
父目录。tmpfs 写满、权限异常或路径被占用时都可能触发。

**怎么避**：临时目录创建失败就回 503，绝不把 trap 的目标降级到父目录；
`rm -rf` 只允许作用于 `mkdir` 成功的那一个 `$TMP`。
