---
name: openwrt-modern-console
description: OpenWrt 现代控制台（/modern，已完全替代 LuCI）的源码位置、认证与写入链路、部署约束
metadata:
  node_type: memory
  type: project
  originSessionId: sess_25e83748d8270bc19f614e4163f6e9d0
---

2026-10-20 做了一套**通用**控制台（art-design-pro 设计语言），最初在小米 AX3000T 上验证；
源码有两份：git 仓库 `OpenwrtConsole\`（2026-10-20 建仓，独立上传 GitHub）与开发副本 `frontend\`（上游 OpenWrt 运维仓）；线上 <https://<路由器IP>/modern/>。
改完要把开发副本同步回仓库：`src/` + `deploy/` 全量覆盖，但仓库独有的 `src/api/device.ts`、`src/views/LoginView.vue`、`vite.config.ts` 不要覆盖（`firmware.ts` 要手工合并）。
**根路径 `/` 已指向它，LuCI 降级为应急入口**（`/cgi-bin/luci/`、`/index.luci.html`）。
LuCI 主题包已删除（`apk del luci-theme-bootstrap` + 手动装的 argon），
所以应急入口打开是无样式的纯 HTML，功能不受影响；恢复主题用 `apk add luci-theme-bootstrap`。

页面（17 个）：概览、监控与流量、网络、无线、客户端、DNS、网络配置、无线配置、
防火墙（只读）、防火墙配置、代理、诊断、系统、DHCP 与系统设置、软件包管理、
固件升级与备份、服务与运维、首次配置向导。

认证与写入链路（关键约束）：

- 认证不复用 LuCI Cookie（HttpOnly 且路径限定 `/cgi-bin/luci/`）。前端用自己的
  `/cgi-bin/modern-login` 调 `ubus call session login`（timeout 3600），sid 存
  localStorage。
- uhttpd **不转发自定义请求头**给 CGI；自签 HTTPS 下浏览器也拒收 `Secure` Cookie。
  因此 CGI 认证走查询参数 `?sid=`（CGI 内部仍用 `session get` 校验）。
- 登录会话可调 `system.*` / `network.*` / `luci-rpc.*` / `uci.*`（含写），
  但 **`session.get` 被拒**（用 `system.info` 当存活探针）。
- rpcd 对「会话失效」和「该方法没有权限」**都返回 -32002**。控制台必须用
  `system.info` 探针区分，否则某一个受限调用就会把用户踢回登录页（这坑踩过一次）。
- rpcd 的 UCI 访问**按配置文件名授权**：只能改 dhcp/firewall/network/system/
  wireless/dropbear/luci/opkg/ntp/timeserver；`uci.revert` 被拒 → 丢弃暂存改动走
  root CGI `modern-uci`。
- 特权动作（重载服务、改密码、重启、恢复出厂、备份、固件刷写、apk 安装）都在
  root CGI 里（modern-uci / modern-pkg / modern-sysupgrade），危险动作需要
  一次性令牌（`modern-uci` 的 `token` 动作签发，120 秒、单次使用）+ 确认词。
- `iwinfo assoclist` 只有 root 能读（`modern-data` CGI）；assoclist 的
  `rx.rate`/`tx.rate` 单位是 **Kbit/s**。
- **ShellCrash 的「操作完成」必须以状态为准**：后台 runner 跑完 `start.sh` 就回报完成是不行的
  ——start.sh 把核心拉起来就返回，核心这时还没起来，控制台读到的是「没在运行」。
  现在 runner 先等 `pidof CrashCore` 出现（≤60 秒）或消失（≤30 秒）再写完成记录，
  退出码非 0 表示状态没到位；前端也要在拿到完成记录后继续等 `running` 变成期望值，
  否则页面会停在「未运行」直到手动刷新。
- **ShellCrash 的 init 脚本处于保守模式**（cfg 里 `start_old=ON`）：核心由
  `start_legacy.sh` 拉起、不在 procd 下。直接 `init.d/shellcrash restart` 会留下
  两个核心（旧核心还在、新核心抢不到端口、procd 持续 respawn）。正确做法是用
  `/etc/ShellCrash/start.sh`，并在 stop/restart 前先跑一次 init 的 stop 注销实例。
  `service_status` 显示 `inactive` 属正常，真实状态看核心进程。
- 路由器出网要显式走代理：`http_proxy=https_proxy=http://127.0.0.1:7890`
  （ShellCrash 混合端口），否则访问 downloads.openwrt.org / apk 源会超时。
- **apk 索引别用默认的 `/var/cache/apk`**：apk 查询时会把它清掉，仓库列表刚更新完
  又变空。控制台用独立缓存目录 `/tmp/modern-pkg-cache/apk`（内存盘，不占 overlay）。
- OpenWrt 官方更新日志的有效地址是 `https://openwrt.org/releases/<major.minor>/notes-<版本>`
  （`openwrt.org/docs/rel-.../notes` 不存在）；固件在
  `downloads.openwrt.org/releases/<版本>/targets/<target>/`，镜像名含 `-squashfs-`。
- CGI 必须 LF 换行、必须原子替换（临时文件 + rename），否则会与请求竞态。
- **每个 CGI 的每个应答都必须是合法 JSON**：shell 拼 JSON 时，
  把 `"key":"value"` 直接塞进 `[]` 不是合法 JSON（浏览器整段 parse 失败，
  表现为「保存失败」但路由器其实已经写进去了）。所有 `ok()`/`fail()` 统一走
  `send_json()`，发送前用 `jsonfilter -i <file> -e '@'` 自检，非法就换成可读错误。
  写 CGI 后必测：`curl -sk -X POST -d '{"action":"x","params":{}}' ... | jsonfilter -e '@'`。
- uhttpd 不发 `Cache-Control`，浏览器启发式缓存 `index.html` → 重新部署后旧标签页会
  请求已删除的哈希 chunk。部署用 `assets.manifest` 只保留「当前代 + 上一代」，
  前端另有 `?_reload=` 自愈重载。

**验证设备缺的系统工具**：`timeout`、`ss`、`od`、`file` 都没有；只有 busybox 的
`ping`/`traceroute`/`netstat`/`ip`/`awk`/`sed`/`grep`/`md5sum`，`nslookup` 在
`/usr/bin/nslookup`，`ucode` 有 `fs.readfile`/`fs.glob`/`fs.lsdir`（无 `fs.read`）。

**不要在路由器上做递归扫描**（`grep -r /etc /var`）：已因此把 233MB 内存打满并触发
mtk-wdt 看门狗重启过一次。

回退：

```sh
rm -rf /www/modern
rm -f /www/cgi-bin/modern-{login,data,proxy,read,exec,uci,pkg,sysupgrade}
cp /www/index.luci.html /www/index.html
```

文档在 `frontend/README.md`、`DESIGN.md`、`DEPLOY.md`、`docs/V3-CONTRACT.md`。
相关环境见 [[ax3000t-router-environment]]，代理链路见 [[shellcrash-ai-routing-fix]]。
