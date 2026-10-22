# 排错手册

> **一句话**：按**现象**检索 —— 每节三块固定结构：**现象 → 排查步骤 → 原因 / 解法**。

标题就是检索词：遇到问题先在浏览器里搜现象里的关键词，搜到哪节看哪节。

> 本篇的示例命令里，`<路由器IP>` 需要换成你自己设备的地址
> （多数路由器的 LAN 地址是 `10.0.0.1`，那是默认网关的通行默认值，不是硬编码依赖）。

---

## 1. 页面白屏

### 现象

打开 <https://<路由器IP>/modern/> 是一片空白，控制台台标也看不到。
开发者工具里常见 `Failed to fetch dynamically imported module` 或一片空白控制台。

### 排查步骤

1. 浏览器 F12 → **Console**：看第一条**红色**错误；再看 **Network**，找状态码非 200 的请求。
2. 看 **Network** 里 `index.html` 的响应头：有没有 `Cache-Control`？
   > uhttpd **不发** `Cache-Control`，浏览器会启发式缓存 `index.html`。
3. 在路由器上确认静态文件在位：

   ```bash
   ssh root@<路由器IP> 'ls -la /www/modern | head; ls /www/modern/assets | head'
   ```

4. 打开 `/www/modern/index.html`，看它引用的入口 chunk 名，与 `/www/modern/assets/` 里实际的文件名**是否一致**。

### 原因 / 解法

| 原因 | 解法 |
| --- | --- |
| 浏览器缓存了旧 `index.html`，旧 chunk 已被新部署删掉 | 应用内置两道自愈：入口 chunk 404 时带 `?_reload=<时间戳>` 重载；`useBuildGuard` 每 30 秒用 `no-store` 拉一次 `index.html` 比对入口 chunk 名。仍不行就手动 **Ctrl+F5** |
| 部署时 `dist/index.html` 的引用路径不对（没带 `/modern/` 前缀） | 重新 `npm run build`。`vite.config.ts` 的 `base` 必须固定为 `/modern/` |
| `/www/modern` 根本不存在或权限不对 | 重新跑 `./deploy/deploy.sh`；`install-remote.sh` 结尾会 `chown -R root:root` + `chmod -R a+rX` |
| 整站资源 404（连 `/modern/assets/index-*.css` 都 404） | 多半是 `base` 不对或部署目录错位，见 [docs/MAINTENANCE.md](MAINTENANCE.md) 的部署链 |

---

## 2. 登录后立刻掉线

### 现象

输入 root 密码，登录页一闪就跳回登录页，或者刚进控制台几秒后被踢回登录页。

### 排查步骤

1. F12 → Console，看有没有 `登录状态已失效，请重新登录`（对应事件 `owrt:session-expired`）。
2. 确认 **Local Storage** 里有 `owrt-sid`；记下它的值。
3. 直接用这个 sid 查会话，看服务端认不认：

   ```bash
   ssh root@<路由器IP> "ubus call session get '{\"ubus_rpc_session\":\"<粘贴 sid>\"}'"
   ```

   期望看到 `"username"`；看到 `Access denied` 或 `Session not found` 就是服务端会话没了。
4. 看 **Network** 里 `/ubus` 的响应体，确认 `error.code` 是不是 `-32002`。

### 原因 / 解法

| 原因 | 解法 |
| --- | --- |
| 前端过期时间 fallback 曾经是 300 秒，与服务端 3600 秒不一致 | **已修**：`src/stores/session.ts` 现在是 `data.expires \|\| 3600`，与服务端 `timeout: 3600` 对齐。若仍被提前踢回登录页，按第 9 节比对 `owrt-sid-exp` 与服务端实际过期时间 |
| 服务端会话真的过期了（1 小时到了） | 重新登录。这是设计行为，不是 bug |
| 浏览器清掉了 localStorage | 重新登录；注意隐私模式 / 无痕窗口会在关闭后清掉 |
| `sid` 被复制到另一台设备上用 | ubus session 与客户端绑定（IP + UA），换设备就失效。重新登录 |

---

## 3. 路由报 401

### 现象

页面能打开，但数据全是空的，控制台报 `401 Unauthorized` / `{"error":"unauthorized"}`。

### 排查步骤

1. F12 → Network，看是**哪个请求** 401：`/ubus` 还是 `/cgi-bin/modern-*`。
2. `/ubus` 401 → 看响应体的 `error.code`：
   - `-32002` = 会话无效 → 见第 2 节；
   - 其他 = 权限不足（见第 4 节的 ACL 说明）。
3. CGI 401 → 检查 sid 是否带上了：URL 里应有 `?sid=…`，或请求带 `owrt_sid` Cookie。
4. 在路由器上确认会话还活着：

   ```bash
   ssh root@<路由器IP> "ubus call session get '{\"ubus_rpc_session\":\"<sid>\"}'"
   ```

### 原因 / 解法

| 原因 | 解法 |
| --- | --- |
| sid 没带（`cgiGet` 之外自己写的 fetch 忘了拼） | 统一用 `src/api/ubus.ts` 的 `cgiGet`，它会自动拼 sid |
| sid 里有非法字符 | sid 字符集是 `[A-Za-z0-9._~+/=-]`，别的字符会被 CGI 直接拒（401）。多半是复制时带了引号或空格 |
| rpcd 会话 ACL 不允许这个对象 | 普通登录会话能调 `system.*` / `network.*` / `luci-rpc.*` / `luci.*` / `service.*`；**`session.get` 不允许** —— 所以前端用 `system.info` 当会话存活探针，而不是 `session.get` |
| 登录会话过期 | 重新登录 |

---

## 4. 代理页看不到策略组

### 现象

「代理」页空白，或提示未检测到 ShellCrash 核心；下拉框里没有节点。

### 排查步骤

1. 先确认核心在跑、端口通（端口取自 `/tmp/ShellCrash/config.yaml` 的 `external-controller:`，默认 9999）：

   ```bash
   ssh root@<路由器IP> 'curl -s -m 5 http://127.0.0.1:9999/version'
   ```

   连不上 → 核心没跑或控制口不在该端口（不是控制台的问题）。

2. 确认 `secret` 存在（**只查在不在，别把值贴到聊天/工单里**）：

   ```bash
   ssh root@<路由器IP> "grep -c '^secret=' /etc/ShellCrash/configs/ShellCrash.cfg"
   ```

   输出 0 → CGI 会回 `503 {"error":"shellcrash not configured"}`。

3. 直接问 CGI（把 sid 换成你自己的）：

   ```bash
   curl -sk "https://<路由器IP>/cgi-bin/modern-proxy?path=/proxies&sid=<sid>"
   ```

4. 看返回里 `proxies` 的键 —— 是策略组名。

### 原因 / 解法

| 原因 | 解法 |
| --- | --- |
| 核心没运行 | 去 ShellCrash 起服务。注意实测设备上的 init 脚本处于「保守模式」（`start_old=ON`），`service_status` 显示 `inactive` 属正常，真实状态看 `running` |
| `secret` 没配 | 在 ShellCrash 里设置 secret |
| 核心控制口不在 9999 | 控制台与 CGI 都从 `/tmp/ShellCrash/config.yaml` 的 `external-controller:` 读端口（回退 9999）。先 `grep external-controller /tmp/ShellCrash/config.yaml` 确认真实端口，再试 `curl -s http://127.0.0.1:<端口>/version` |
| 路由器上没有 `curl` | 代理页所有请求都经过 CGI 的 `curl`，缺失时回 `503`「缺少 curl」。装：`apk add curl` 或 `opkg update && opkg install curl` |
| 主组入口选错（区域组被当成主组） | 现在按**类型优先**（Selector → URLTest → Fallback → LoadBalance）再按通用名称词（「节点选择」「Proxy」「Select」「手动切换」「GLOBAL」等）排序。若订阅用了非常规主组名，页面仍以类型优先，必要时在 `ShellcrashRules` 仓调整组定义 |
| 组名含控制台不支持的字符 | 引号、反斜杠、`/`、`..` 会被 CGI 拒（`invalid name`）；多数 emoji 与中文名可用 |
| 切换节点报 `switch failed` | 核心未运行或 secret 未配；先跑第 1 步 |

---

## 5. 诊断命令超时

### 现象

诊断页 ping / 路由跟踪跑很久才返回，或者返回空输出、提示超时。

### 排查步骤

1. 看响应里的 `duration_ms` 与 `exit_code`：
   - `duration_ms` 接近该工具的超时上限且 `exit_code ≠ 0` → **被看门狗杀了**
     （ping 30 秒 `T_PING` / dns 15 秒 `T_DNS` / trace 120 秒 `T_TRACE` / routes 与 ports 10 秒 `T_LOCAL`）；
   - `duration_ms` 很小且 `exit_code = 127` → **命令不存在**。
2. 在路由器上确认工具在位：

   ```bash
   ssh root@<路由器IP> 'for c in ping nslookup traceroute ip netstat; do printf "%s: " "$c"; command -v "$c" || echo MISSING; done'
   ```

3. 手动跑一次，看真实耗时：

   ```bash
   ssh root@<路由器IP> 'time ping -c 5 -s 56 -W 3 example.com'
   ```

4. 看目标是否可达：

   ```bash
   ssh root@<路由器IP> 'ping -c 3 -W 3 <你的目标>'
   ```

### 原因 / 解法

| 原因 | 解法 |
| --- | --- |
| 目标真的不通（DNS 解析失败、外网被墙） | 这是诊断结果，不是控制台的 bug。换目标或先修网络 |
| **超过该工具的超时上限** | 超时按工具区分：ping 30 秒、DNS 15 秒、路由跟踪 120 秒、路由表与监听端口 10 秒（`T_PING` / `T_DNS` / `T_TRACE` / `T_LOCAL`）。路由器没有 coreutils `timeout`，实现是「后台跑 + 看门狗 `sleep <超时>; kill -9`」。只能缩短目标 / 跳数或换工具 |
| 路由器上缺 `ping` / `nslookup` / `traceroute` / `ip` / `netstat` | 装对应的包（`apk add busybox-extras` 之类，按路由器实际情况）。脚本已用 `netstat` 代替缺失的 `ss` |
| 输出超过 200 KB 被截断 | 正常行为：`MAX_OUTPUT=204800`，尾部会标 `[输出超过 204800 字节，已截断]`，`truncated` 为 `true` |
| 目标带非法字符 / 以 `-` 开头 | `400 {"error":"目标地址包含非法字符"}` / `{"error":"目标地址不能以 - 开头"}` |

---

## 6. 部署后资源 404

### 现象

部署脚本跑完了，但页面白屏或某个 chunk 404；或者某些页面能开、某些不能。

### 排查步骤

1. **先看部署脚本的输出**。`deploy/deploy.sh` 成功时会打印两行：

   ```
   deployed to root@<路由器IP>:/www/modern (CGI helpers in /www/cgi-bin)
   open https://<路由器IP>/modern/
   ```

   **没有这两行 = 脚本中途退出了** —— 这不是「部分成功」，是**静默中止**。
2. 逐个核对 CGI 是否真的到位：

   ```bash
   ssh root@<路由器IP> 'ls -la /www/cgi-bin/modern-*'
   ```

   期望 **9 个**：`modern-login` `modern-data` `modern-read` `modern-exec` `modern-proxy`
   `modern-uci` `modern-pkg` `modern-sysupgrade` `modern-shellcrash`。
3. 核对静态资源：

   ```bash
   ssh root@<路由器IP> 'cat /www/modern/assets.manifest | head -20; ls /www/modern/assets | wc -l'
   ```

### 原因 / 解法

| 原因 | 解法 |
| --- | --- |
| 用的是旧版 `deploy/deploy.sh`（for 循环里有一个字面 `\n`） | **已在当前脚本修复**：第 7 次迭代曾把 `\n` 当成词 `n`，输入重定向指向不存在的 `deploy/n`，在 `set -eu` 下脚本直接退出 → `modern-pkg` / `modern-sysupgrade` / `modern-shellcrash` 三个 CGI 不部署、末尾 echo 也不打印。**若仍遇到**，说明用的是旧脚本 —— 更新本仓后重新跑，或按 [DEPLOY.md](DEPLOY.md) 的手动部署段补齐 |
| 旧 chunk 已被删除，旧标签页还在请求它 | 这是**设计如此**：uhttpd 不发 `Cache-Control`，浏览器启发式缓存 `index.html`。部署侧用 `/www/modern/assets.manifest` 保留「当前代 + 上一代」来兜底；命中 404 时应用会自动带 `?_reload=` 重载 |
| `dist/` 里的 `base` 不是 `/modern/` | 重新构建。`vite.config.ts` 的 `base` 固定为 `/modern/` |
| 路由器的 overlay 满了 | `df -h` 看 `/`；世代保留机制最多留两代（约 2.8 MB），多出来的要手工清 `/www/modern/assets` |

---

## 7. CGI 没生效

### 现象

改了 `deploy/modern-*` 之后，行为没变；或者 CGI 报 `No such file or directory`；
或者新加的 action 回 `不支持的操作`。

### 排查步骤

1. **确认文件真的传上去了**：

   ```bash
   ssh root@<路由器IP> 'md5sum /www/cgi-bin/modern-uci' ; md5sum deploy/modern-uci
   ```

   两边对不上 → 没传上去，或传的是旧版本。

2. **确认权限**：

   ```bash
   ssh root@<路由器IP> 'ls -l /www/cgi-bin/modern-*'
   ```

   必须有 `x` 位。

3. **确认换行符**：

   ```bash
   ssh root@<路由器IP> 'file /www/cgi-bin/modern-uci'   # 或
   ssh root@<路由器IP> 'head -1 /www/cgi-bin/modern-uci | od -c | head -2'
   ```

   看到 `\r` → **CRLF**，shebang 会报 `No such file or directory`。

4. **确认是原子替换**：CGI 必须用「同目录临时文件 + rename」更新，直接覆盖会与正在处理的请求竞态。

5. 新加 action 后，确认前端封装也更新了（否则前端还在发旧 action）。

### 原因 / 解法

| 原因 | 解法 |
| --- | --- |
| **CRLF 换行** | `sed -i 's/\r$//'` 或用 `deploy/deploy.sh` 重新部署（走 `cat` 传输不会引入 CRLF） |
| 少了可执行位 | `chmod +x /www/cgi-bin/modern-*` |
| 路由器上的 CGI 版本比前端旧 | `modern-pkg` 会回 `{"error":"不支持的操作","code":"unsupported_action"}`，前端据此判定「版本太旧」并回退。解法：把 CGI 全部重新传一遍 |
| **只更新了 `dist/`，没更新 CGI** | 客户端在线状态依赖 `modern-read` 新增的 `what=neighbors`，令牌动作依赖 `modern-uci` 的 `consume_token` 修复 —— 旧 CGI 不会有这些行为。重新跑 `deploy/deploy.sh`（它同时传 `dist/` 与 9 个 CGI） |
| 改的是源目录、本仓没同步 | 本仓是快照 —— 见 [MAINTENANCE.md](MAINTENANCE.md) §8「与源目录的同步状态」 |
| 脚本语法错误被 `set -e` 吞掉 | 在路由器上手动跑一遍 CGI，看 stderr |

---

## 8. 元素样式丢失

### 现象

新加的 Element Plus 组件（例如 `el-table`、`el-select`）**没有样式** ——
表格没有边框、下拉框是原生样式、按钮是灰的 —— 但页面上其它老组件正常。

### 排查步骤

1. 确认组件确实被用上了：F12 → Sources 看 `index-*.js` 里有没有 `element-plus/es/components/<name>/…`。
2. 看 **Network** 里有没有单独加载 `element-plus/es/components/<name>/style/css` 的 CSS 请求，
   以及它是在 `src/styles/element.css` **之后**还是**之前**注入的。
3. 打开 `src/plugins/element.ts`，看该组件的样式 import 在不在清单里。

### 原因 / 解法

**原因**：Element Plus 是**按需引入**的。`unplugin-vue-components` 会把模板里的 `<el-xxx>`
改写成对该组件及其样式表的显式 import。样式表因此落进**懒加载的 view chunk**，
在运行时被追加到 `<head>` 末尾 —— **晚于** `src/styles/element.css` 加载，
同优先级下覆盖掉了本项目的覆盖规则，表现为「样式丢了」。

**解法**：**把新组件的样式加进 `src/plugins/element.ts` 的 import 清单**，
让它随入口 chunk 一起加载（该文件里的样式会被 Rollup 提到入口，顺序稳定）。

```ts
import 'element-plus/es/components/table/style/css'   // 例：新增 el-table 时
```

> 命令式服务（`ElMessage` / `ElMessageBox` / `ElNotification` / `ElLoading`）
> **解析器根本看不见**（它们不是模板标签），只能靠这个文件引入 —— 这也是它存在的原因。
>
> 改完记得跑 `npm run build`，并在浏览器里确认该组件样式确实来自入口 chunk。

---

## 9. 会话过期

### 现象

用着用着突然弹「登录状态已失效，请重新登录」，或页面数据集体变空。

### 排查步骤

1. 看被踢出的时间点是不是**整点后 1 小时**（服务端 `timeout: 3600`）。
2. F12 → Application → **Local Storage**：
   - `owrt-sid` 是会话 id；
   - `owrt-sid-exp` 是前端记的过期时间戳（**毫秒**）。
3. 比对两者：`owrt-sid-exp` 是否**早于**服务端实际的过期时间。

### 原因 / 解法

| 原因 | 解法 |
| --- | --- |
| 前端 fallback 曾经是 300 秒，与服务端 3600 秒不一致 | **已修**：`src/stores/session.ts` 的 fallback 现在是 `3600`，与服务端一致。若仍提前过期，按上面的步骤 2–3 比对，并把 `owrt-sid-exp` 与服务端 `ubus call session get` 的剩余时间记下来排查 |
| 服务端会话真的过期（1 小时） | 重新登录。这是设计行为 |
| 路由器重启 | ubus 会话在 rpcd 重启后全部失效。重新登录 |
| `validateSession()` 把**临时网络抖动**当成了会话失效 | 不会：它只在 `SessionExpiredError`（ubus `-32002`）时清会话，普通网络错误保留会话 |
| 多标签页同时操作，一个标签页登出把另一个也带走了 | 登出会销毁服务端会话（`session.destroy`），所有标签页一起失效。重新登录 |

---

## 10. 保存失败，但配置其实已经改了

### 现象

点「保存」后报 `保存配置失败：Cannot read properties of null (reading 'message')`
或 `路由器返回的内容无法解析`，**可路由器上的配置其实已经变了**，刷新一下就看到了。

### 排查步骤

1. 打开 F12 → Network，找到那条 `config-write` 请求，看 **Response**。
2. 把 body 丢给 `JSON.parse`（F12 控制台里直接粘）——
   如果报 `Expected ',' or ']' after array element in JSON at position 36` 这类，
   就是**路由器拼出来的 JSON 不合法**，不是网络问题。
3. 或者在路由器上直接验：

```bash
sid=$(ubus call session login '{"username":"root","password":"…","timeout":60}' | jsonfilter -e @.ubus_rpc_session)
curl -sk -X POST -H 'Content-Type: application/json'   -d '{"action":"config-write","params":{"confirm":"yes","ipv6_support":"ON"}}'   "https://127.0.0.1/cgi-bin/modern-shellcrash?sid=$sid" | jsonfilter -e '@'
```

`jsonfilter` 报错 = body 不是合法 JSON。

### 原因 / 解法

| 原因 | 解法 |
| --- | --- |
| **CGI 拼的 JSON 不合法**：把 `"key":"value"` 直接塞进 `[]`（`["ipv6_support":"ON"]`）——这不是合法 JSON，浏览器整段解析失败 | 改成字符串数组 `["ipv6_support=ON"]` 或对象数组 `[{"ipv6_support":"ON"}]`。写完跑一遍 `send_json` 自检（见 [CGI-CONTRACT.md](CGI-CONTRACT.md) §0「应答自检」）|
| 变量没转义就插进 JSON 字符串 | 用 `modern-pkg` 的 `esc_json` / `modern-shellcrash` 的 `jstr` |
| 上游返回的不是 JSON（老的 `uci-changes` 返回 UCI diff 原文） | 这种 action 已经删掉；新加 action 必须保证应答是 JSON |

> 现在 6 个 shell CGI（`modern-exec` / `modern-proxy` / `modern-uci` / `modern-pkg` /
> `modern-sysupgrade` / `modern-shellcrash`）都走 `send_json()`，非法 JSON 会被路由器自己拦下并换成
> `{"ok":false,"error":"路由器生成了无效的响应，请查看系统日志"}`，
> 不会再出现「保存失败但配置已改」这种情况。

---

## 11. 重启 ShellCrash 后状态不更新

### 现象

点「重启」后状态区显示「核心进程未运行」，**手动刷新一下**才变成「运行中」。

### 排查步骤

1. 看状态区的 PID 有没有变。变了说明核心确实重启过，是**页面没跟上**，
   不是路由器的问题。
2. 路由器上看完成记录：`cat /tmp/ShellCrash/modern-shellcrash.last`
   → `<action> <rc> <时间戳>`。`rc` 非 0 表示状态没到位。
3. `pidof CrashCore` 看核心在不在、`netstat -lntp | grep CrashCore` 看端口在不在听。

### 原因 / 解法

| 原因 | 解法 |
| --- | --- |
| **路由器在 `start.sh` 返回时就写了完成记录**，而 start.sh 是把核心拉起来就返回的，核心这时还没起来 | runner 在写完成记录前先等 `pidof CrashCore` 出现（≤60 秒）/ 消失（≤30 秒），等不到写非 0 退出码 |
| **前端拿到完成记录就停止轮询**，之后再也不拉状态；那个每秒跳的计时器只更新计数 | 前端拿到完成记录后继续等 `running` 变成期望值（启动/重启等 true，停止等 false），任务进行中每 3 秒拉一次状态；核心起得慢时后台继续跟踪 |
| 核心真的没起来 | 看 `ps | grep CrashCore` 与 `/etc/ShellCrash/logs/`；ShellCrash 的 init 脚本是「保守模式」（`start_old=ON`），核心由 `start.sh` 拉起、不在 procd 下，所以 `service_status` 一直显示 `inactive` 属正常 |

---

## 12. 改密码失败

### 现象

「DHCP 与系统设置」页修改管理员密码后报「修改失败」或「令牌无效或已过期」，
密码实际没变。

### 排查步骤

1. 看响应状态码：
   - `403 {"error":"令牌无效或已过期"}` → 令牌路径的问题；
   - `500 {"error":"修改失败"}` → 改密工具执行失败；
   - `500 {"error":"系统缺少密码修改工具（chpasswd 或 passwd）"}` → 两个工具都不在。
2. 在路由器上确认 CGI 版本与工具：

   ```bash
   ssh root@<路由器IP> 'md5sum /www/cgi-bin/modern-uci'
   md5sum deploy/modern-uci
   ssh root@<路由器IP> 'command -v chpasswd; command -v passwd'
   ```

### 原因 / 解法

| 原因 | 解法 |
| --- | --- |
| 路由器上的 `modern-uci` 还是旧版 | 旧版的 `consume_token` 检查未定义的 `$got`，**所有令牌动作必然报令牌无效**。重新部署 CGI（见 [DEPLOY.md](DEPLOY.md)） |
| 固件只有 BusyBox `passwd`、没有 `chpasswd` | 当前版本已回退到 `passwd`（stdin 喂两行密码），确认 `command -v passwd` 有输出；若两边都没有，需要固件自带一个改密工具 |
| `passwd` 执行失败 | 检查根文件系统是否只读（`mount \| grep ' / '`）、用户名是否在当前系统里存在；CGI 只允许 `[A-Za-z0-9._-]` 且不以 `-` 开头的用户名 |
| 输入了非法用户名 | 返回 `400 {"error":"用户名包含非法字符"}`，换成字母 / 数字 / `.` `_` `-` |

---

## 13. 提示缺少 curl

### 现象

代理页、固件页的更新检查 / 下载返回 503，提示「缺少 curl」。

### 排查步骤

```bash
ssh root@<路由器IP> 'command -v curl || echo MISSING'
```

### 原因 / 解法

| 原因 | 解法 |
| --- | --- |
| 固件没带 `curl` | apk 固件：`apk add curl`；opkg 固件：`opkg update && opkg install curl` |
| 只关心本地动作 | 固件的 `info` / `upload` / `upgrade` / `backup` / `restore` **不需要** `curl`；只有 `check-update` 与 `download` 需要 |

---

## 14. 概览 / 无线 / 客户端页没有数据

### 现象

登录正常，但这三页的无线、终端、租约数据是空的；网络页和其它页正常。

### 排查步骤

```bash
ssh root@<路由器IP> 'ubus list | grep -E "^(luci|luci-rpc)$"'
```

两条都不在（或只有 `luci`）→ 固件缺少对应 ubus 对象。

### 原因 / 解法

| 原因 | 解法 |
| --- | --- |
| 精简固件没装 LuCI 相关包 | `apk add rpcd-mod-luci`（或 `apk add luci-base`）；opkg 固件用 `opkg update && opkg install rpcd-mod-luci` |
| 无线页仍为空，但 `luci-rpc` 在 | `modern-data` 会按 luci-rpc → `iwinfo devices` → `/sys/class/ieee80211/*/device/net/*` 逐级回退；再查 `iwinfo` 是否存在、无线是否启用 |
| 客户端页只显示部分设备 | 在线判定用「无线关联表 + 邻居表」；路由器上执行 `ip neigh show` 确认有对应条目。邻居表由 `modern-read?what=neighbors` 读取，**旧 CGI 没有这个 action** |

---

## 15. 软件包页提示只支持 apk

### 现象

软件包页所有操作都返回「此固件使用 opkg，控制台目前只支持 apk（OpenWrt 24.10+）」
（HTTP 501，`code: opkg_not_supported`）。

### 排查步骤

```bash
ssh root@<路由器IP> 'command -v apk; command -v opkg'
```

### 原因 / 解法

| 原因 | 解法 |
| --- | --- |
| 固件是 OpenWrt 24.10 之前的 opkg 版本 | 这是**已知限制，不是 bug**：控制台尚未实现 opkg 后端。升级固件到 24.10+，或继续用 LuCI / SSH 管理软件包 |
| 两个包管理器都没有 | 返回 `package_manager_missing`；该固件本身无法管理软件包 |

---

## 16. 固件页不判定可升级

### 现象

固件页不显示「有更新」，也不显示「已是最新」，只显示一条 warning。

### 排查步骤

```bash
ssh root@<路由器IP> 'ubus call system board'
```

看 `release.version` 与 `release.distribution`。

### 原因 / 解法

| 原因 | 解法 |
| --- | --- |
| 版本是 `SNAPSHOT` / `rNNNNN` / 自编版本号 | 三段式数字版本号才能与官方稳定版比较；无法比较时只给 warning，**不判「可升级」也不判「已是最新」**。升级前自行确认目标固件兼容性 |
| `distribution` 不是 `OpenWrt` | 非官方发行版同样只给 warning |
| 官方源没有该机型的镜像 | warning 写「官方源中暂时没有该机型的升级固件（.bin/.img.gz/.itb）」；可手动上传 `.bin` / `.tar` / `.img` / `.gz` / `.itb` |

---

## 17. 静态路由的「生效状态」显示未知

### 现象

「网络配置 → 静态路由」的生效状态一直显示「未知」，即使接口里有路由。

### 排查步骤

1. 在路由器上直接问 netifd：

   ```bash
   ssh root@<路由器IP> 'ubus call network route'
   ```

2. 若该命令报错或返回不含 `routes` 的结构，再看接口 dump：

   ```bash
   ssh root@<路由器IP> 'ubus call network.interface dump'
   ```

### 原因 / 解法

| 原因 | 解法 |
| --- | --- |
| netifd 版本不提供 `network route` | 当前版本已回退到 `network.interface dump` 的 `route` 数组（`target` + `mask`），生效状态仍可计算 |
| 两个来源都取不到 | 只有这时才显示「未知」；通常是 netifd 未运行或会话 ACL 异常 |
| 前端版本旧 | 该回退在 `src/api/networkConfig.ts` 的 `fetchActiveRoutes()` 里，重新部署 `dist/` |

---

## 18. 无线页没有 6 GHz / 多 SSID 显示不对

### 现象

无线页只列出一个 SSID，或频段筛选里没有 6 GHz，或信道显示的是配置值而不是实际值。

### 排查步骤

1. 看运行时数据：

   ```bash
   ssh root@<路由器IP> 'iwinfo; iwinfo phy0 info 2>/dev/null | head -20'
   ```

2. 看配置里的射频与 SSID 数量：

   ```bash
   ssh root@<路由器IP> 'uci show wireless | grep -E "wifi-device|wifi-iface|band|channel|htmode"'
   ```

### 原因 / 解法

| 原因 | 解法 |
| --- | --- |
| 设备本来没有 6 GHz 射频 | 频段筛选按**实际存在的射频**动态生成，没有 6 GHz 就不显示该筛选项 |
| 多个 SSID 挂在同一射频下 | 现在按射频聚合全部 SSID 的终端 / 信号 / 流量，标题显示「主 SSID +N」；SSID 数量按实际段数统计 |
| 信道显示的是配置值而不是实际值 | 页面优先显示 `iwinfo` 上报的信道；`iwinfo` 不可用时才回退配置值 |
| 6 GHz / DFS 信道缺失 | 可用性取决于国家码与驱动；配置页列出候选信道，最终以驱动接受为准 |

---

## 19. 侧栏和登录页没有 LuCI 入口

### 现象

侧栏底部或登录页显示「LuCI 未安装」，没有「应急入口：LuCI」链接。

### 排查步骤

1. 浏览器 F12 → Network，找 `/cgi-bin/luci/` 的 HEAD 请求：404 表示确实没装。
2. 在路由器上确认：

   ```bash
   ssh root@<路由器IP> 'ls /www/cgi-bin/luci >/dev/null 2>&1 && echo present || echo missing'
   ```

### 原因 / 解法

| 原因 | 解法 |
| --- | --- |
| 固件没装 LuCI | 装 `luci-base`（或对应 LuCI 包）后刷新页面 |
| LuCI 已装，但入口仍显示「未安装」 | 入口探测只把 **404** 当作未安装；200/302/403/405 都算已安装（LuCI 未登录时返回 403）。若仍隐藏，检查请求是否被代理或 uhttpd 改写成了 404 |
| 检测超时 | 探测上限 2 秒，路由器极慢时会判为未安装；刷新页面会重新探测 |
| HTTPS 提示不对 | 登录页按 `window.location.protocol` 显示：HTTPS 显示「HTTPS 已启用」，HTTP 显示「HTTP 连接（建议 HTTPS）」 |

---

## 20. 内核有新版本，但 ShellCrash 菜单里没有

### 现象

「ShellCrash 设置 → 内核更新」显示 GitHub 已有新版本（例如 `v1.19.33`），
但 ShellCrash 菜单的「更新内核」仍显示已是最新（版本表停在 `v1.19.28`）。

### 排查步骤

1. 在路由器上确认三个版本：

   ```bash
   ssh root@<路由器IP> '
   grep "^core_v=" /etc/ShellCrash/configs/ShellCrash.cfg
   curl -sI https://github.com/MetaCubeX/mihomo/releases/latest | grep -i "^location:"
   curl -s https://raw.githubusercontent.com/juewuy/ShellCrash/update/bin/version
   '
   ```

   第三行里的 `meta_v` 就是 ShellCrash 菜单会提供的版本。

2. 看 ShellCrash 上游的自动构建任务：

   ```bash
   gh run list -R juewuy/ShellCrash --workflow core_auto_update.yml --limit 5
   ```

   `core_auto_update` 每 3 天 18:00 UTC 跑一次；`sing-box` 构建失败会连带跳过
   `needs:` 的 meta 构建，`bin/version` 的 `meta_v` 就不会前进。

### 原因 / 解法

| 原因 | 解法 |
| --- | --- |
| 上游构建失败 / 尚未发布 | **等** `bin/version` 的 `meta_v` 前进后，在 ShellCrash 菜单里更新。这是最稳的路径：UPX 布局、`configs/command.env`、启动脚本都由 ShellCrash 自己处理 |
| 急于上官方最新版 | 不推荐：官方 release 只有 `.gz` 裸二进制（解压后几十 MB），这台机器 overlay 只剩约 37 MB、tmpfs 约 44 MB；需要先在 PC 上做 UPX 压缩，再替换 `CrashCore.upx` 并同步 `core_v`。动手前先 `df -h /` 与 `df -h /tmp` |
| 更新后内存变紧 | 确认 `configs/command.env` 仍有 `GOMEMLIMIT=64MiB`，且 `core_v` 与二进制实际版本一致 |
| 更新后有两个 CrashCore | `netstat -lntp | grep -E ':(7890\|7892\|1053)'` 看端口归属；没绑端口的是 procd 僵尸实例，按 [§11](#11-重启-shellcrash-后状态不更新) 处理，并保持 `/etc/init.d/shellcrash` disabled |

> **为什么控制台不直接替你更新**：内核替换要同时处理压缩布局、`command.env`、
> 单实例与端口验收，失败时代理会整体中断。控制台只负责「发现有新版 + 说明为什么
> ShellCrash 还没收录」，替换动作留在路由器上执行。
