# CGI 契约

> **一句话**：路由器端 9 个 CGI 的**请求 / 响应 JSON 形状**、错误码与令牌机制 ——
> 全部按 `deploy/modern-*` 的源码逐条读出，不含推测。

配套阅读：[ARCHITECTURE.md](ARCHITECTURE.md)（通道总表）、
[WRITE-LAYER.md](WRITE-LAYER.md)（哪些动作需要令牌）。

---

## 0. 全局约定

| 项 | 约定 |
| --- | --- |
| 传输 | HTTPS（路由器本机 uhttpd，自签证书） |
| 会话 | `sid` 走 **查询参数 `?sid=`** 或 **Cookie `owrt_sid`**（查询参数优先）；`sid` 字符集 `[A-Za-z0-9._~+/=-]`，越界直接 401 |
| 响应头 | `Content-Type: application/json; charset=utf-8`、`Cache-Control: no-store`、`X-Content-Type-Options: nosniff` |
| 方法 | 除 `modern-login` 与 `modern-data` / `modern-read` / `modern-proxy` 的 GET 形式外，其余一律 **POST**；方法不对 → `405` |
| 请求体上限 | `modern-login` 4096 · `modern-exec` 4096 · `modern-uci` 8192 · `modern-pkg` 8192 · `modern-shellcrash` 65536 · `modern-sysupgrade` JSON 8192 / 固件 40 MB |
| 换行 | CGI 文件必须 **LF**；CRLF 会让 shebang 报 `No such file or directory` |
| 原子替换 | CGI 更新自己时用「同目录临时文件 + rename」 |
| 应答格式 | **每个应答都必须是合法 JSON**（直接透传上游 JSON 的除外，见下文） |

### 错误码（通用）

| 状态码 | 含义 | 典型 body |
| --- | --- | --- |
| `200` | 成功 | 见各节 |
| `400` | 参数 / 动作不合法 | `{"error":"..."}` |
| `401` | 会话无效 | `{"error":"unauthorized"}` |
| `403` | 缺令牌、令牌过期或缺确认 | `{"error":"令牌无效或已过期"}` |
| `404` | 对象不存在或已过期 | `{"error":"..."}` |
| `405` | 方法不允许 | `{"error":"只接受 POST 请求"}` |
| `413` | 请求体过大 | `{"error":"请求体过大"}` |
| `500` | 内部失败 | `{"error":"..."}` |
| `503` | 依赖未就绪 | `{"error":"shellcrash not configured"}` |

### 一次性令牌机制（`modern-uci` 签发，`modern-sysupgrade` 消费）

- **签发**：`POST /cgi-bin/modern-uci`，`action=token`，`purpose=<用途>` →
  `{"token":"<32位十六进制>","expires_in":120}`。
- **存放**：路由器上 `/tmp/modern-tokens/<token>`，内容是 `"<purpose> <expiry>"`（秒级 Unix 时间）。
- **有效期**：**120 秒**。
- **单次使用**：校验时**先把文件删掉再比对用途与有效期**。
  → **用途写错等于令牌作废**，必须重新申请；同一次操作不要重试同一个令牌。
- **用途必须完全一致**，已知用途：
  `set-password` · `reboot` · `factory-reset` · `backup-restore` · `firmware-upgrade`。
- **口令与固件刷写这类动作还要求界面上的确认词**（前端先弹确认框，用户输入确认词后才去申请令牌）。

---

### 应答自检（`send_json`）

**约定：每个 CGI 的每个应答都是合法 JSON。** 违反这条的症状很隐蔽：浏览器
`JSON.parse` 整段失败 → 前端拿到 `null` → 报「Cannot read properties of null」，
而路由器侧其实**已经写成功并返回了 200**，表现为「保存失败但配置已改」。

shell 拼 JSON 时最容易踩的两个坑：

- **数组里不能放没有花括号的键值对**。`["key":"value"]` 不是合法 JSON，
  要写成 `["key=value"]`（字符串数组）或 `[{"key":"value"}]`（对象数组）。
- **变量插进 JSON 字符串前要先转义**。用 `modern-pkg` 的 `esc_json`、
  `modern-shellcrash` 的 `jstr`，不要裸插。

为此 9 个 CGI 的 `ok()` / `fail()` 统一走 `send_json()`：应答先写进临时文件，
再用 `jsonfilter -i <file> -e '@'` 验一遍（非法 JSON 时 jsonfilter 非 0 退出），
不合法就换成 `{"ok":false,"error":"路由器生成了无效的响应，请查看系统日志"}`，
不会再让浏览器报一句没头没脑的「无法解析」。

**改完 CGI 必测**（`jsonfilter` 会拒绝非法 JSON）：

```bash
sid=$(ubus call session login '{"username":"root","password":"…","timeout":60}' | jsonfilter -e @.ubus_rpc_session)
curl -sk -X POST -H 'Content-Type: application/json'   -d '{"action":"status","params":{}}'   "https://<路由器IP>/cgi-bin/modern-shellcrash?sid=$sid" | jsonfilter -e '@'
```

> 例外：`modern-uci` 的 `svc-list` 直接透传 `ubus call luci getInitList` 的原始 JSON，
> `modern-proxy` 直接透传 mihomo 的应答 —— 两者上游本身就是 JSON，不经过拼装。

---

## 1. `modern-login` —— 换 ubus 会话

**路径**：`POST /cgi-bin/modern-login`
**运行时**：ucode。**唯一不需要 sid 的 CGI。**

**请求**

```json
{ "username": "root", "password": "…" }
```

- `username`：1–64 字符；`password`：1–256 字符；都不合法 → `400`。
- `Content-Length > 4096` → `413`。

**响应 `200`**

```json
{ "sid": "0123456789abcdef…", "expires": 3600 }
```

- `expires` 单位是**秒**。取值优先级：`ubus session.login` 返回的 `expires` → 其 `timeout` → 兜底 **300**。
- 服务端申请时用的是 `timeout: 3600`（1 小时）。

**响应 `401`**：`{"error":"用户名或密码错误"}`（服务端会先 `sleep(1)` 再回，用于拖慢暴力破解）。

**其它**：`405 {"error":"只接受 POST 请求"}` · `413 {"error":"请求体过大"}` ·
`400 {"error":"请输入用户名和密码"}`。

> 密码**只在这一次请求里出现**，不写前端存储。前端也不把密码放进 localStorage。

---

## 2. `modern-data` —— 无线终端与系统日志

**路径**：`GET /cgi-bin/modern-data?what=stations[&sid=]`
**路径**：`GET /cgi-bin/modern-data?what=logs&lines=<n>[&sid=]`
**运行时**：ucode。

**`what=stations` 响应 `200`**

```json
{ "stations": { "phy0-ap0": [ { "signal": -52, "noise": -95, "rx": { "rate": 144400 }, "tx": { "rate": 144400 } } ] } }
```

- 键是无线接口名，值是该接口的 `iwinfo assoclist` 结果数组。
- 取不到无线设备时**兜底**用 `phy0-ap0` / `phy1-ap0` 两个接口名去试。
- `rx.rate` / `tx.rate` 单位是 **Kbit/s**。

**`what=logs` 响应 `200`**

```json
{ "lines": ["…", "…"] }
```

- `lines` 参数默认 **120**，上限 **500**。

**其它**：`401 {"error":"unauthorized"}` · `400 {"error":"unknown action"}`。

---

## 3. `modern-read` —— dnsmasq 运行时状态

**路径**：`GET /cgi-bin/modern-read?what=leases|hosts|resolv[&sid=]`
**运行时**：ucode。**纯只读。**

**`what=leases` 响应 `200`**（读 `/tmp/dhcp.leases`）

```json
{ "leases": [ { "expiry": 1763000000, "mac": "aa:bb:cc:dd:ee:ff", "ip": "192.168.1.100", "hostname": "nas" } ] }
```

- 源文件每行是 `<expiry> <mac> <ip> <hostname> <client-id>`；只取前 4 段。
- `hostname` 为 `*` 时置空字符串。

**`what=hosts` 响应 `200`**（读 `/tmp/hosts/dhcp.*`）

```json
{ "hosts": [ { "ip": "192.168.1.1", "names": ["router", "gateway"] } ] }
```

**`what=resolv` 响应 `200`**（读 `/etc/resolv.conf.auto`，回退 `/tmp/resolv.conf.d/resolv.conf.auto`）

```json
{ "nameservers": ["192.168.1.1"], "search": ["lan"] }
```

**其它**：`401` · `400 {"error":"unknown action"}`。

> **文件路径是字面常量**，`what` 只能在三个读取器里选，请求无法到达任意路径。
> 文件缺失或读不到 → **返回空数组 + 200**，不是错误。

---

## 4. `modern-exec` —— 诊断命令

**路径**：`POST /cgi-bin/modern-exec?sid=<sid>`
**运行时**：sh（busybox）。

**请求**

```json
{ "tool": "ping", "target": "example.com" }
```

| `tool` | 实际命令 | 是否需要 `target` |
| --- | --- | --- |
| `ping` | `ping -c 3 -W 3 <target>` | 是 |
| `dns` | `nslookup <target>` | 是 |
| `trace` | `traceroute -n -w 1 -q 3 <target>` | 是 |
| `routes` | `ip route show` | 否（忽略） |
| `ports` | `netstat -lntup` | 否（忽略） |

- `target` 字符集 `[A-Za-z0-9._:-]`，最长 253 字符，**不能以 `-` 开头**（会被当成选项）。
- `target` 是唯一的用户输入，作为**一个带引号的参数**传给命令，shell 不会二次解析。

**响应 `200`**

```json
{
  "tool": "ping",
  "target": "example.com",
  "command": "ping -c 3 -W 3 example.com",
  "output": "PING example.com (…)\n…",
  "exit_code": 0,
  "duration_ms": 3012,
  "truncated": false
}
```

- `output` 是纯文本（已做 JSON 转义）；换行以 `\n` 呈现。
- **单次最长 12 秒**（`RUN_TIMEOUT=12`）：路由器没有 coreutils `timeout`，
  实现是「后台跑 + 看门狗 `sleep 12; kill -9`」。
- **输出超过 204 800 字节（200 KB）截断**，尾部追加 `[输出超过 204800 字节，已截断]`，
  同时 `truncated` 置 `true`。

**其它**：`401` · `405 {"error":"只接受 POST 请求"}` · `400 {"error":"请求体为空"}` ·
`413 {"error":"请求体过大"}` · `400 {"error":"不支持的诊断工具"}` ·
`400 {"error":"请填写诊断目标"}` · `400 {"error":"目标地址包含非法字符"}` ·
`400 {"error":"目标地址过长"}` · `400 {"error":"目标地址不能以 - 开头"}` ·
`500 {"error":"无法写入临时文件"}` · `500 {"error":"生成结果失败"}`。

---

## 5. `modern-proxy` —— mihomo 代理桥

**路径**：`GET /cgi-bin/modern-proxy?path=<路径>[&url=<延迟探测地址>][&sid=]`
**路径**：`POST /cgi-bin/modern-proxy?sid=<sid>`，body `{"group":"…","node":"…"}`
**运行时**：sh。

**GET 的 `path` 取值**

| `path` | 含义 |
| --- | --- |
| `/version` | mihomo 版本 |
| `/configs` | 运行配置 |
| `/proxies` | 全部策略组与节点 |
| `/connections` | 活动连接 |
| `/proxies/<组名>` | 单个策略组详情 |
| `/proxies/<节点名>/delay` | 延迟探测（可带 `url=`） |

- 响应体是 **mihomo 的原始 JSON**（透传，不加工）。
- `delay` 的 `url` **只允许三个固定地址**：
  `http://www.gstatic.com/generate_204`、`http://cp.cloudflare.com/generate_204`、
  `https://www.gstatic.com/generate_204`；不传则用第一个。

**POST 响应 `200`**

```json
{ "ok": true, "group": "🤖 AI接口#🚀 节点选择", "node": "日本-优化" }
```

失败时（mihomo 返回非 200/204）：

```json
{ "ok": false, "error": "switch failed" }
```

> **真正的授权在服务端**：切换前会先向 mihomo 回读该策略组的成员表，
> 节点不在组内 → `400 {"error":"node not in group"}`；组不存在 → `400 {"error":"group not found"}`。
> 名字白名单允许 emoji / 中文 / `#` / `&` / 空格，但拒绝控制字符、`"`、`\`、`/`、`..`，长度 ≤ 64 字符。

**其它**：`401` · `503 {"error":"shellcrash not configured"}`（读不到 `secret`）·
`400 {"error":"bad path"}` · `400 {"error":"invalid name"}` ·
`400 {"error":"url not allowed"}` · `400 {"error":"missing group or node"}`。

> `secret` 只在路由器本地从 `/etc/ShellCrash/configs/ShellCrash.cfg` 读取，**永不下发到浏览器**。

---

## 6. `modern-uci` —— 特权系统动作

**路径**：`POST /cgi-bin/modern-uci?sid=<sid>`
**运行时**：sh。请求体是**扁平**的 JSON：`{"action":"…","<参数>":"…"}`（参数不在 `params` 里）。

**动作一览**

| `action` | 参数 | 响应 `200` | 需要令牌 |
| --- | --- | --- | --- |
| `token` | `purpose` | `{"token":"…","expires_in":120}` | — |
| `uci-revert` | `config` | `{"ok":true}` | — |
| `uci-commit` | `config` | `{"ok":true}` | — |
| `uci-apply` | — | `{"ok":true}` | — |
| `svc-list` | — | **不是 JSON**：`ubus call luci getInitList` 的原始 JSON | — |
| `svc-action` | `service`、`svc_action` | `{"ok":true}` | — |
| `net-reload` | — | `{"ok":true}` | — |
| `wifi-reload` | — | `{"ok":true}` | — |
| `firewall-reload` | — | `{"ok":true}` | — |
| `set-localtime` | `time`（Unix 秒） | `{"ok":true}` | — |
| `set-password` | `username`、`password`、`token` | `{"ok":true}` | ✅ `set-password` |
| `reboot` | `token` | `{"ok":true}` | ✅ `reboot` |
| `factory-reset` | `token` | `{"ok":true}` | ✅ `factory-reset` |
| `backup-create` | `path`（默认 `/tmp/openwrt-backup.tar.gz`） | `{"ok":true,"path":"/tmp/openwrt-backup.tar.gz"}` | — |
| `backup-restore` | `path`、`token` | `{"ok":true}` | ✅ `backup-restore` |

**校验规则**

- `config` 必须在 `dhcp / firewall / network / system / wireless / dropbear / luci / opkg / ntp / timeserver` 里，
  否则 `400 {"error":"不支持的配置"}`。
- `service` 必须匹配 `[A-Za-z0-9_-]+` **且** `/etc/init.d/<service>` 存在，否则 `400 {"error":"服务不存在"}`。
- `svc_action` 只能是 `start|stop|restart|reload|enable|disable`，否则 `400 {"error":"不支持的动作"}`。
- 备份 / 恢复路径必须以 `/tmp/` 开头，否则 `400 {"error":"备份路径必须位于 /tmp"}`。
- `set-password`：`username ≤ 32`、`password ≤ 128`，否则 `400 {"error":"参数过长"}`。
- `reboot` / `factory-reset` / `backup-restore` 是**延迟执行**的（`sleep 1` 后在后台跑），
  返回 `{"ok":true}` 时设备**还没重启**。

**其它**：`401 {"error":"unauthorized"}` · `405 {"error":"只接受 POST 请求"}` ·
`400 {"error":"请求体为空"}` · `403 {"error":"令牌无效或已过期"}` ·
`400 {"error":"缺少用途"}` · `400 {"error":"缺少用户名或密码"}` · `400 {"error":"缺少时间"}` ·
`400 {"error":"缺少备份路径"}` · `400 {"error":"备份文件不存在"}` · `400 {"error":"不支持的操作"}` ·
`500 {"error":"无法签发令牌"}` · `500 {"error":"修改失败"}` · `500 {"error":"备份失败"}`。

---

## 7. `modern-pkg` —— apk 软件包

**路径**：`POST /cgi-bin/modern-pkg?sid=<sid>`
**运行时**：sh。请求体**扁平**：`{"action":"…","name":"…",…}`。

**动作与响应**

| `action` | 参数 | 响应 `200` |
| --- | --- | --- |
| `list` | — | `{"ok":true,"output":"…","packages":[…],"installedCount":N,"upgradableCount":N,"indexUpdatedAt":N}` |
| `available` | `keyword`（可选）、`limit`（可选） | `{"ok":true,"output":"…","packages":[…],"availableCount":N,"installedCount":N,"indexUpdatedAt":N}` |
| `stats` | — | `{"ok":true,"installedCount":N,"availableCount":N,"upgradableCount":N,"indexUpdatedAt":N}` |
| `search` | `keyword`、`scope`（`available` 或默认已装） | 同 `list` / `available` |
| `install` | `name`、`confirm=yes` | `{"ok":true,"job_id":"…","status":"running","output":"正在安装 <name>","packages":[]}` |
| `remove` | `name`、`confirm=yes` | `{"ok":true,"job_id":"…","status":"running","output":"正在卸载 <name>","packages":[]}` |
| `update` | `confirm=yes` | `{"ok":true,"job_id":"…","status":"running","output":"正在更新仓库索引","packages":[]}` |
| `upgrade` | `confirm=yes` | `{"ok":true,"job_id":"…","status":"running","output":"正在升级全部软件包","packages":[]}` |
| `status` | `job`（任务号） | `{"ok":true,"job_id":"…","status":"running\|done\|failed","exit_code":N,"output":"…"}` |

**`packages[]` 的元素形状**（来自 `apk query --format json`，字段名做了一处归一化）

```json
{
  "name": "curl",
  "version": "8.14.1-r1",
  "description": "Command line tool for transferring data with URLs",
  "installedSize": 123456,
  "fileSize": 234567,
  "arch": "aarch64_cortex-a53",
  "license": "curl",
  "origin": "curl"
}
```

- `installed-size` → `installedSize`，`file-size` → `fileSize`；其余字段保留 apk 原名。
- `available` 列表只取 `name / version / description / installed-size` 四个字段（仓库一万多个包，全字段太重）。
- 上限：已装最多 **600** 条，仓库最多 **300** 条（超出部分被丢弃，但**计数是真实总数**）。

**写动作是后台任务**：`apk upgrade` 可能跑好几分钟，uhttpd 会断连接，
所以写动作立刻返回 `job_id`，前端用 `status` 轮询直到 `status` 变成 `done` / `failed`。

**校验规则**

- 包名必须匹配 `[A-Za-z0-9._+-]{1,64}` 且**不以 `-` 开头**（否则会被 apk 当成选项），
  否则 `400 {"error":"软件包名称不合法"}`。
- 写动作必须带 `confirm=yes`，否则 `403 {"error":"操作需要确认"}`。

**其它**：`401` · `405` · `400 {"error":"请求体为空"}` · `413 {"error":"请求体过大"}` ·
`400 {"error":"缺少操作名称"}` · `400 {"error":"任务编号无效"}` ·
`404 {"error":"任务不存在或已过期"}` · `500 {"error":"无法创建临时目录"}` · `500 {"error":"无法启动任务"}` ·
`400 {"error":"不支持的操作","code":"unsupported_action"}`（**带 `code` 字段** ——
前端据此判定「路由器上的 CGI 版本太旧」，可以回退到旧路径）。

---

## 8. `modern-sysupgrade` —— 固件与备份

**路径**：`POST /cgi-bin/modern-sysupgrade?sid=<sid>&action=<action>`
**运行时**：sh。

**`action` 的解析顺序**（三个位置，取第一个非空）

1. 查询参数 `?action=`
2. 请求头 `X-Action`（uhttpd 导出为 `HTTP_X_ACTION`）
3. JSON 请求体里的 `"action"` 字段

> `upload` 的请求体是**二进制固件**，所以只能用 ① 或 ② 指定动作。

**参数来源**：`token` / `path` / `filename` 可以来自查询参数，也可以来自 JSON 体
（`Content-Type: application/json` 时才解析体，≤8192 字节）。
固件文件名来自 `X-Filename` 头（uhttpd 导出为 `HTTP_X_FILENAME`），回退到 `?filename=`。

**动作与响应**

| `action` | 参数 | 响应 `200` |
| --- | --- | --- |
| `info` | — | 见下（板卡 / 版本 / 文件清单 / 更新状态） |
| `upload` | `filename`（`X-Filename` 或 `?filename=`） | `{"ok":true,"path":"/tmp/openwrt-firmware.bin","size":N,"filename":"…"}` |
| `upgrade` | `token` | `{"ok":true,"started":true}`（**延迟执行**：1 秒后 `sysupgrade`） |
| `backup` | `path`（默认 `/tmp/openwrt-backup.tar.gz`） | `{"ok":true,"path":"/tmp/openwrt-backup.tar.gz","size":N}` |
| `restore` | `path`、`token` | `{"ok":true,"started":true}`（延迟执行） |
| `list-backups` | — | `{"ok":true,"backups":[…]}` |
| `check-update` | — | `{"ok":true,…}` 或任务未完成时 `{"ok":true,"pending":true,"job_id":"…"}` |
| `download` | `url`、`sha256`（可选） | `{"ok":true,"path":"…","size":N,"sha256":"…","verified":true\|false}` |
| `download-status` / `check-status` | `job` | `{"ok":true,"job_id":"…","status":"…","bytes":N,"total":N,"result":{…}}` |

**`info` 的响应形状**

```json
{
  "ok": true,
  "board": { "kernel": "…", "hostname": "…", "system": "…", "model": "…", "board_name": "…", "rootfs_type": "…" },
  "release": { "distribution": "OpenWrt", "version": "25.12.6", "revision": "r1", "target": "…", "description": "…", "firmware_url": "…" },
  "files": [ { "name": "openwrt-firmware.bin", "size": 123456 } ],
  "backups": [ { "name": "openwrt-backup.tar.gz", "size": 654321 } ],
  "update": null,
  "update_checked_at": 0
}
```

- `update` 是上次成功检查的结果（缓存在 `/tmp/modern-fw-update/result.json`），没有则为 `null`。
- `update_checked_at` 是上次检查的 Unix 秒。

**校验规则**

- 固件文件名只允许 `[A-Za-z0-9._-]`，≤64 字符，且后缀必须是 **`.bin` 或 `.tar`**。
- 上传 ≤ **40 MB**（41943040 字节）；空文件 → `400 {"error":"上传内容为空"}`。
- `upgrade` 前必须已有非空固件文件，否则 `400 {"error":"请先上传固件文件"}`。
- 备份 / 恢复路径必须以 `/tmp/` 开头，文件名只允许 `[A-Za-z0-9._-]`。
- 下载地址必须在官方源白名单内，否则 `400 {"error":"下载地址不在允许的官方源范围内"}`；
  下载后会**与官方校验值比对**，不一致 → `{"ok":false,"error":"固件校验失败，…"}`。

**其它**：`401` · `405` · `400 {"error":"缺少操作名称"}` · `413 {"error":"固件文件超过 40MB 上限"}` ·
`403 {"error":"令牌无效或已过期"}` · `400 {"error":"缺少固件文件名"}` ·
`400 {"error":"文件名只允许字母、数字、点、下划线和连字符"}` · `400 {"error":"文件名过长，最多 64 个字符"}` ·
`400 {"error":"只支持 .bin 或 .tar 固件文件"}` · `400 {"error":"固件文件为空"}` ·
`400 {"error":"备份文件不存在"}` · `500 {"error":"固件文件保存失败"}`。

---

## 9. `modern-shellcrash` —— ShellCrash 配置桥

**路径**：`POST /cgi-bin/modern-shellcrash?sid=<sid>`
**运行时**：sh。请求体是**嵌套**的：`{"action":"…","params":{…}}`。

**动作一览**

| `action` | `params` | 响应 `200` |
| --- | --- | --- |
| `status` | — | `{"ok":true,"installed":true,"running":true,"service_status":"…","pid":N,"core_version":"…","shellcrash_version":"…","redir_mod":"…","dns_mod":"…","firewall_mod":"…","ports":{"mixed":N,"redir":N,"tproxy":N,"socks":N,"dns":N,"controller":N},"subs_count":N,"autostart":true,"last_action":"…"}` |
| `config` | — | `{"ok":true,"values":{…},"url_host":"…","secret_set":true}` |
| `config-write` | 白名单键 + `confirm=yes` | `{"ok":true,"changed":["key=value",…],"backup":"/etc/ShellCrash/configs/ShellCrash.cfg.bak-20261020-101112","message":"需重启 ShellCrash 生效"}` |
| `service` | `action`（`start\|stop\|restart\|enable\|disable`） | `{"ok":true,"action":"restart","started":true,"message":"操作已提交，路由器正在执行"}`（`enable`/`disable` 另带 `autostart` 布尔与不同 message） |
| `overrides` | — | `{"ok":true,"files":[{"name":"config.yaml","enabled":true,"description":"…"}],"global_disabled":false}` |
| `override-toggle` | `file`、`enable=yes\|no`、`confirm=yes` | `{"ok":true,"file":"rules.yaml","enabled":true,"message":"覆写文件已启用，需重启 ShellCrash 生效"}` |
| `subs` | — | `{"ok":true,"count":N,"url_count":N,"provider_count":N,"url_id":"…","update_source":"…","alias":"…","subs":[…],"providers":[…]}` |
| `log` | `file`（可选） | `{"ok":true,"file":"…","lines":[…],"files":[…]}` |
| `crash` | — | `{"ok":true,"running":true,"pid":N,"core_version":"…","start_time":N,"uptime":N,"alive_ts":N,"alive_age":N,"probe_ts":N,"last_fallback_heal":N,"start_error":false,"guardian_cron":"…","guardian_log":[…]}` |

**白名单键（`config-write` 只能改这些）**

```
redir_mod dns_mod firewall_mod cn_ip_route cn_ipv6_route ipv6_support ipv6_redir
ipv6_dns hosts_opt dns_protect sniffer quic_rj my_alias ecs_subnet firewall_area
core_v crashcore url_id release_type hostdir disoverride
```

- 写之前会**逐个值校验**，任何一项不合法就整批拒绝（**不会留下写了一半的文件**）。
- 写之前会把原文件备份成 `ShellCrash.cfg.bak-<时间戳>`。
- **`secret`、`Url`、`custcorelink`、`dns_nameserver` 等键既不返回也不可写。**
  `config` 返回的 `secret_set` 只是布尔值，`url_host` 只是订阅地址的**主机名**部分。

**覆写文件清单（`override-toggle` 只能动这五个）**

```
config.yaml proxies.yaml proxy-groups.yaml rules.yaml user.yaml
```

- 停用 = 把 `X.yaml` 改名为 `X.yaml.bak`；启用 = 改回来。
  所以**停用一个不存在的覆写文件** → `404 {"error":"找不到覆写文件"}`；
  **启用一个没有 `.bak` 的** → `404 {"error":"找不到被停用的覆写文件"}`。

**其它**：`401` · `400 {"error":"缺少操作名称"}` · `403 {"error":"需要 confirm=yes 确认"}` ·
`400 {"error":"不支持的覆写文件"}` · `400 {"error":"缺少 enable=yes 或 enable=no"}` ·
`400 {"error":"值不合法：<key>"}` · `400 {"error":"没有需要修改的项"}` ·
`400 {"error":"不支持的服务"}` · `400 {"error":"不支持的动作"}` ·
`404 {"error":"ShellCrash 服务不存在"}` · `404 {"error":"找不到 ShellCrash 配置文件"}` ·
`500 {"error":"备份配置失败"}` · `500 {"error":"写入配置失败"}`。

> 服务启停是**后台执行**（核心要下载配置，可能要一分钟），请求立刻返回，
> 前端靠轮询 `status` 感知结果。
>
> **完成记录 = 状态到位，不是脚本跑完**。后台 runner 在写
> `/tmp/ShellCrash/modern-shellcrash.last`（`<action> <rc> <时间戳>`）之前，
> 会先等核心真的起来（`pidof CrashCore` 出现，最多 60 秒）或真的消失（停止动作，最多 30 秒）；
> 等不到就写非 0 退出码。`start.sh` 是把核心拉起来就返回的，
> 少了这一步，前端会在核心还没起来时读到「没在运行」。
>
> `service_status` 显示 `inactive` 属正常现象：实测设备上的 `/etc/init.d/shellcrash` 处于
> 「保守模式」（`start_old=ON`），核心由 `start_legacy.sh` 拉起、不在 procd 下。
> 真实运行态以 `running` 为准。

---

## 10. 改 CGI 时的连带义务

| 改了什么 | 必须同步 |
|---|---|
| 请求字段 / 响应字段 | 本篇对应小节 · [ARCHITECTURE.md](ARCHITECTURE.md) 的通道表 |
| 新增 / 删除一个 action | 本篇对应小节 · 前端 `src/api/` 里对应的封装模块 |
| 新增一个令牌用途 | 本篇 §0 的用途清单 · [WRITE-LAYER.md](WRITE-LAYER.md) §4 |
| 改白名单（配置文件 / 配置键 / 覆写文件） | 本篇对应小节 · [WRITE-LAYER.md](WRITE-LAYER.md) §1 |
| 改错误码 | 本篇对应小节 · 前端的错误码翻译表（如 `src/api/systemOps.ts` 的 `ERROR_TEXT`） |
| 改了应答的 JSON 形状 | 本篇对应小节 · **跑一遍 `send_json` 自检**（见 §0）· 前端 `src/api/` 里对应的封装模块的返回类型 |
