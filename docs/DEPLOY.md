# 部署、排障与回退

> **一句话**：控制台部署到路由器的完整步骤、缓存与世代保留机制、以及回退方法。

目标：把 `dist/` 放到路由器 `/www/modern`，把九个 CGI 放到 `/www/cgi-bin/`。
**不会修改 LuCI、主题或 `/etc/config/luci`。**

## 前置条件

- 任意 OpenWrt（需 uhttpd + ubus/rpcd，默认配置即满足）
- 路由器已启用 HTTPS（路由器 uhttpd 默认自签证书）
- 路由器 root 密码
- ShellCrash 可选；未运行时“代理”页会显示未检测到服务

### 路由器运行时依赖

控制台**不随包安装**这些依赖，部署前在路由器上装好：

| 依赖 | 用途 | apk 固件（24.10+） | opkg 固件 |
| --- | --- | --- | --- |
| `rpcd-mod-luci` | 提供 `luci` / `luci-rpc` ubus 对象；概览 / 无线 / 客户端页依赖它们。随 `luci-base` 安装，**无 LuCI 的精简固件必须单独装** | `apk add rpcd-mod-luci`（或 `apk add luci-base`） | `opkg update && opkg install rpcd-mod-luci` |
| `curl` | 代理页访问 ShellCrash 控制接口；固件页的更新检查与下载 | `apk add curl` | `opkg update && opkg install curl` |
| `apk` | 软件包页的唯一后端（OpenWrt 24.10+）。只有 `opkg` 的固件上软件包页不可用，会返回可读错误 | 自带 | 无（软件包页不可用） |

缺少 `rpcd-mod-luci` 时，概览 / 无线 / 客户端页会取不到数据；缺少 `curl` 时，代理页的所有请求
与固件页的检查更新 / 下载会返回明确的 503 错误，而不是给出空应答。

> **部署必须同时更新 `/www/cgi-bin/modern-*`。** 只更新 `dist/` 会让新前端配旧 CGI：
> 客户端在线状态依赖 `modern-read` 新增的 `what=neighbors`，令牌动作依赖 `modern-uci` 里
> `consume_token` 的修复 —— 两者都在 CGI 里，旧 CGI 不会自动获得。
> 本版仍是 9 个 CGI，没有新增文件。

## 一键部署

在能 SSH 到路由器的机器上，于**本仓根目录**执行：

```bash
npm run build
ROUTER_HOST=root@<路由器IP> ./deploy/deploy.sh
```

> `ROUTER_HOST` 是环境变量，支持 `user@host` 形式；不设时默认 `root@10.0.0.1`
> （`10.0.0.1` 只是默认网关的通行默认值，按你的设备地址替换）。
> `ROUTER_WEB` 同样支持环境变量，默认 `/www/modern`。

脚本会：

1. 用 `tar` 把 `dist/` 覆盖到 `/www/modern`
2. 把 9 个 CGI —— `modern-login`、`modern-data`、`modern-read`、`modern-exec`、
   `modern-proxy`、`modern-uci`、`modern-pkg`、`modern-sysupgrade`、`modern-shellcrash` ——
   写入 `/www/cgi-bin/` 并 `chmod +x`（同目录临时文件 + rename 替换，避免与在处理的请求竞态）

如果使用密码登录，可先配置 SSH 免密，或用 `SSH_ASKPASS` 方式：

```bash
export SSH_ASKPASS=/tmp/owrt/askpass.sh
export SSH_ASKPASS_REQUIRE=force
./deploy/deploy.sh
```

## 手动部署

```bash
npm run build

tar -czf - -C dist . | ssh root@<路由器IP> \
  'rm -rf /www/modern.new && mkdir -p /www/modern.new && tar -xzf - -C /www/modern.new &&
   mv /www/modern /www/modern.old && mv /www/modern.new /www/modern && rm -rf /www/modern.old'

# CGI 用「同目录临时文件 + rename」替换：直接覆盖会与正在处理的请求竞态
for f in modern-login modern-data modern-proxy modern-read modern-exec modern-uci \
         modern-pkg modern-sysupgrade modern-shellcrash; do
  ssh root@<路由器IP> \
    "cat > /www/cgi-bin/.$f.new && chmod +x /www/cgi-bin/.$f.new && mv /www/cgi-bin/.$f.new /www/cgi-bin/$f" \
    < "deploy/$f"
done

ssh root@<路由器IP> 'chown -R root:root /www/modern && chmod -R a+rX /www/modern'
```

访问：<https://<路由器IP>/modern/>

> `<路由器IP>` 换成你自己的设备地址（多数路由器的 LAN 地址是 `10.0.0.1`）。
> 自签证书首次访问会有浏览器警告，接受后即可。不要把 `/modern/` 暴露到 WAN。

## 默认入口与 LuCI

- `https://<路由器IP>/` → 跳转到 `/modern/`（`/www/index.html` 带 `no-cache` meta）
- LuCI 保留在 `/cgi-bin/luci/`（或 `/index.luci.html`）作为**应急入口**
- LuCI 主题包已删除（`apk del luci-theme-bootstrap` + 手动装的 argon），因此应急入口
  打开时是无样式的纯 HTML；功能不受影响。恢复主题：
  `apk add luci-theme-bootstrap`

## 缓存与版本自愈

uhttpd 不发 `Cache-Control`，浏览器会启发式缓存 `index.html`，导致更新后旧标签页
继续跑旧版本（连样式都是旧的）。控制台内置两道保险：

1. `index.html` 里的启动守卫：入口 chunk 404 时带 `?_reload=<时间戳>` 重载；
2. `src/composables/useBuildGuard.ts`：每 30 秒用 `no-store` 拉一次 `index.html`，
   比对入口 chunk 名，不同就自动重载（带 15 秒防抖，避免循环）。

部署侧用 `/www/modern/assets.manifest` 记录本次发布的文件清单，保留「当前代 +
上一代」，更早的代际会被清掉——否则每次部署多占 2.1 MB，而 overlay 只有 57 MB。

## CGI 清单

| 文件 | 作用 | 写操作 |
| --- | --- | --- |
| `modern-login` | 用 root 密码换取 1 小时的 ubus 会话 | 创建会话 |
| `modern-data` | 无线关联终端（`iwinfo assoclist`）与系统日志 | 无 |
| `modern-read` | dnsmasq 租约、自定义 hosts、解析器配置、邻居表（`what=neighbors`） | 无 |
| `modern-exec` | ping / nslookup / traceroute / 路由表 / 监听端口 | 只执行白名单命令 |
| `modern-proxy` | 转发核心控制口 API（端口取自运行时配置，回退 9999）、测速、切换策略组节点 | 切换节点（PUT /proxies） |
| `modern-uci` | 丢弃暂存改动、重载服务、改密码、重启、恢复出厂、备份/恢复 | 需要令牌的动作会改系统 |
| `modern-pkg` | apk 软件包列表 / 安装 / 卸载 / 更新 | 安装与卸载 |
| `modern-sysupgrade` | 固件信息、上传固件、刷写、备份与恢复、官方更新检查与下载 | 刷写与恢复（需令牌） |
| `modern-shellcrash` | ShellCrash 服务控制、核心设置、覆写、订阅、日志、自愈状态 | 服务启停与配置改写 |

所有 CGI 都要求 `owrt_sid` Cookie 或 `?sid=` 参数，并用 `ubus session get` 校验会话。

**每个 CGI 的每个应答都必须是合法 JSON**（`svc-list` 这类直接透传上游 JSON 的除外）。
6 个 shell CGI 的 `ok()` / `fail()` 统一走 `send_json()`，发送前用 `jsonfilter` 自检，
不合法就换成可读的错误而不是让浏览器报「无法解析」；另 3 个 ucode CGI 用 `printf("%J", …)`
序列化，结构上必然是合法 JSON。
完整约定与自检命令见 [CGI-CONTRACT.md](CGI-CONTRACT.md) §0「应答自检」。

## ShellCrash 相关注意

以下两点是**实测设备**上的现状，不是所有设备都这样：

- 该设备的 `/etc/init.d/shellcrash` 处于「保守模式」（`start_old=ON`）：核心由
  `start_legacy.sh` 拉起，不在 procd 下。直接 `init.d/shellcrash restart` 会留下
  两个核心（旧核心还在、新核心抢不到端口，procd 还会持续 respawn）。
  `modern-shellcrash` 因此改走 `/etc/ShellCrash/start.sh`，并在 stop/restart 前先跑
  一次 init 脚本的 stop 以注销 procd 实例。`service_status` 显示 `inactive` 属于正常
  现象，真实运行态以核心进程（`running`）为准。

## 更新

重新 `npm run build` 并重复部署即可；CGI 只有改动时才需要重传。

部署脚本会**保留上一代带哈希的 chunk**：uhttpd 不发 `Cache-Control`，浏览器会按
启发式缓存 `index.html`，更新后旧标签页会拿着旧文件名去请求已被删除的 chunk。
保留一代旧 chunk 可以让已打开的标签页继续工作；万一仍然命中 404：

- 路由层面的 chunk 失败会被 `router.onError` 捕获，自动带 `?_reload=<时间戳>` 重载；
- 入口 chunk 本身失效时，`index.html` 里的启动守卫会发现 3 秒内应用没有 boot，
  同样带 `?_reload=` 重载，强制拿到新的 `index.html`。

由于 chunk 带哈希，每一代约 2.1 MB。`install-remote.sh` 用
`/www/modern/assets.manifest` 记录本次发布的文件清单，下次部署只保留
「当前代 + 上一代」，更早的代际会被清掉——否则每次部署都会多占 2.1 MB，
而路由器的 overlay 通常只有几十 MB（实测设备上只有 57 MB）。

## 回退

```bash
ssh root@<路由器IP> '
  rm -rf /www/modern
  rm -f /www/cgi-bin/modern-login /www/cgi-bin/modern-data /www/cgi-bin/modern-proxy \
        /www/cgi-bin/modern-read /www/cgi-bin/modern-exec /www/cgi-bin/modern-uci \
        /www/cgi-bin/modern-pkg /www/cgi-bin/modern-sysupgrade \
        /www/cgi-bin/modern-shellcrash
  # 把默认入口还回 LuCI
  cp /www/index.luci.html /www/index.html
'
```

默认入口已从 LuCI 换成控制台：`https://<路由器IP>/` 跳到 `/modern/`，
LuCI 保留在 `/cgi-bin/luci/`（或 `/index.luci.html`）作为**应急入口**。
LuCI 主题包已删除，应急入口打开时是无样式的纯 HTML，功能不受影响；
恢复主题用 `apk add luci-theme-bootstrap`。

## 排障

| 现象 | 原因 / 处理 |
| --- | --- |
| 提示 `Failed to fetch dynamically imported module` | 更新后浏览器缓存了旧 `index.html`，旧 chunk 已被删除。应用会自动带 `?_reload=` 重载；若仍失败请手动 Ctrl+F5 |
| 诊断页命令全部失败 | 路由器没有 `timeout`/`ss`，脚本已改用后台 watchdog 与 `netstat`；确认 `/bin/ping`、`/usr/bin/nslookup`、`/bin/traceroute` 存在 |
| 代理组下拉里没有节点 | 该组名或节点名含有控制台不支持的字符（引号、反斜杠、`/`、`..`）；多数 emoji 与中文名可用 |
| 切换节点报 `switch failed` | 核心未运行或 ShellCrash 未配置 secret；先确认 `curl -s http://127.0.0.1:<控制器端口>/version` 可访问（端口见「ShellCrash 设置」页，默认 9999） |
| 代理页 / 固件页提示缺少 curl | 在路由器上 `apk add curl`（opkg 固件用 `opkg update && opkg install curl`） |
| 概览 / 无线 / 客户端页没有数据 | 固件缺少 `luci` / `luci-rpc` ubus 对象，装 `rpcd-mod-luci` 或 `luci-base` |
| 软件包页提示只支持 apk | 该固件是 OpenWrt 24.10 之前的 opkg 固件；控制台暂不支持 opkg，属已知限制 |
| 打开 `/modern/` 空白 | 确认 `dist/index.html` 引用了 `/modern/assets/...`；重新构建（`base` 必须为 `/modern/`） |
| CGI 报 `No such file or directory` | 文件被写成了 CRLF；用 `sed -i 's/\r$//'` 或用 `deploy/deploy.sh` 重新部署 |
| 保存失败但配置其实已经改了 | 路由器拼的 JSON 不合法，浏览器整段解析失败。报错信息里带 `JSON.parse` 的出错位置；用 `curl ... | jsonfilter -e '@'` 验一下哪个 action 拼错了 |

## 安全说明

- 控制台只监听路由器的 LAN 地址（如 `10.0.0.1`），不要做端口映射。
- 登录密码只在 POST `/cgi-bin/modern-login` 中出现一次，不会写入前端存储。
- ubus 会话默认 1 小时，存于浏览器 `localStorage`；退出登录会同时销毁服务端会话。
- CGI 会校验 sid 后才返回无线终端、日志或 ShellCrash 数据；ShellCrash 的 secret
  只在路由器本地读取，不会返回给浏览器。
- sid 通过查询参数传给 CGI，可能出现在 uhttpd 访问日志中；这是在本机 LAN、
  HTTPS 下的折中方案，足以满足家庭路由器场景。
- 重启按钮有二次确认并走一次性令牌；网络 / 无线 / 防火墙 / DHCP 与系统设置等配置页
  **可以写**，走「暂存 → 提交 → 应用」三段式（详见 [WRITE-LAYER.md](WRITE-LAYER.md)）。
