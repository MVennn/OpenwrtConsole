# 排错手册

> **一句话**：按**现象**检索 —— 每节三块固定结构：**现象 → 排查步骤 → 原因 / 解法**。

标题就是检索词：遇到问题先在浏览器里搜现象里的关键词，搜到哪节看哪节。

---

## 1. 页面白屏

### 现象

打开 <https://10.0.0.1/modern/> 是一片空白，控制台台标也看不到。
开发者工具里常见 `Failed to fetch dynamically imported module` 或一片空白控制台。

### 排查步骤

1. 浏览器 F12 → **Console**：看第一条**红色**错误；再看 **Network**，找状态码非 200 的请求。
2. 看 **Network** 里 `index.html` 的响应头：有没有 `Cache-Control`？
   > uhttpd **不发** `Cache-Control`，浏览器会启发式缓存 `index.html`。
3. 在路由器上确认静态文件在位：

   ```bash
   ssh root@10.0.0.1 'ls -la /www/modern | head; ls /www/modern/assets | head'
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
   ssh root@10.0.0.1 "ubus call session get '{\"ubus_rpc_session\":\"<粘贴 sid>\"}'"
   ```

   期望看到 `"username"`；看到 `Access denied` 或 `Session not found` 就是服务端会话没了。
4. 看 **Network** 里 `/ubus` 的响应体，确认 `error.code` 是不是 `-32002`。

### 原因 / 解法

| 原因 | 解法 |
| --- | --- |
| **前端过期时间 fallback 是 300 秒，服务端是 3600 秒** | 已知缺陷：`src/stores/session.ts` 的 `data.expires || 300`。服务端不返回 `expires` 时前端按 5 分钟算过期。修法：把 fallback 改成与服务端一致的 3600，或去掉 fallback 直接用服务端值。登记见根 [../CHANGELOG.md](../CHANGELOG.md) |
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
   ssh root@10.0.0.1 "ubus call session get '{\"ubus_rpc_session\":\"<sid>\"}'"
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

「代理」页空白，或提示未检测到 ShellCrash / mihomo；下拉框里没有节点。

### 排查步骤

1. 先确认 mihomo 在跑、端口通：

   ```bash
   ssh root@10.0.0.1 'curl -s -m 5 http://127.0.0.1:9999/version'
   ```

   连不上 → mihomo 没跑（不是控制台的问题）。

2. 确认 `secret` 存在（**只查在不在，别把值贴到聊天/工单里**）：

   ```bash
   ssh root@10.0.0.1 "grep -c '^secret=' /etc/ShellCrash/configs/ShellCrash.cfg"
   ```

   输出 0 → CGI 会回 `503 {"error":"shellcrash not configured"}`。

3. 直接问 CGI（把 sid 换成你自己的）：

   ```bash
   curl -sk "https://10.0.0.1/cgi-bin/modern-proxy?path=/proxies&sid=<sid>"
   ```

4. 看返回里 `proxies` 的键 —— 是策略组名。

### 原因 / 解法

| 原因 | 解法 |
| --- | --- |
| mihomo 没运行 | 去 ShellCrash 起服务。注意这台机器的 init 脚本处于「保守模式」（`start_old=ON`），`service_status` 显示 `inactive` 属正常，真实状态看 `running` |
| `secret` 没配 | 在 ShellCrash 里设置 secret |
| **控制台把策略组名硬编码成了中文正则** | `src/utils/proxy.ts` 用硬编码中文正则匹配组名（如「节点选择」「手动切换」「GLOBAL」）。**组名改了、正则没跟上，页面就显示不出出口。** 这是本仓已登记的耦合点 —— 见 [../AGENTS.md](../AGENTS.md) 第 2 条：策略组与规则的真源在 `ShellcrashRules` 仓 |
| 组名含控制台不支持的字符 | 引号、反斜杠、`/`、`..` 会被 CGI 拒（`invalid name`）；多数 emoji 与中文名可用 |
| 切换节点报 `switch failed` | mihomo 未运行或 secret 未配；先跑第 1 步 |

---

## 5. 诊断命令超时

### 现象

诊断页 ping / 路由跟踪跑很久才返回，或者返回空输出、提示超时。

### 排查步骤

1. 看响应里的 `duration_ms` 与 `exit_code`：
   - `duration_ms ≈ 12000` 且 `exit_code ≠ 0` → **被看门狗杀了**（12 秒上限）；
   - `duration_ms` 很小且 `exit_code = 127` → **命令不存在**。
2. 在路由器上确认工具在位：

   ```bash
   ssh root@10.0.0.1 'for c in ping nslookup traceroute ip netstat; do printf "%s: " "$c"; command -v "$c" || echo MISSING; done'
   ```

3. 手动跑一次，看真实耗时：

   ```bash
   ssh root@10.0.0.1 'time ping -c 3 -W 3 example.com'
   ```

4. 看目标是否可达：

   ```bash
   ssh root@10.0.0.1 'ping -c 3 -W 3 <你的目标>'
   ```

### 原因 / 解法

| 原因 | 解法 |
| --- | --- |
| 目标真的不通（DNS 解析失败、外网被墙） | 这是诊断结果，不是控制台的 bug。换目标或先修网络 |
| **超过 12 秒硬上限** | `modern-exec` 的 `RUN_TIMEOUT=12`：路由器没有 coreutils `timeout`，实现是「后台跑 + 看门狗 `sleep 12; kill -9`」。只能缩短目标或换工具 |
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
   deployed to root@10.0.0.1:/www/modern (CGI helpers in /www/cgi-bin)
   open https://10.0.0.1/modern/
   ```

   **没有这两行 = 脚本中途退出了** —— 这不是「部分成功」，是**静默中止**。
2. 逐个核对 CGI 是否真的到位：

   ```bash
   ssh root@10.0.0.1 'ls -la /www/cgi-bin/modern-*'
   ```

   期望 **9 个**：`modern-login` `modern-data` `modern-read` `modern-exec` `modern-proxy`
   `modern-uci` `modern-pkg` `modern-sysupgrade` `modern-shellcrash`。
3. 核对静态资源：

   ```bash
   ssh root@10.0.0.1 'cat /www/modern/assets.manifest | head -20; ls /www/modern/assets | wc -l'
   ```

### 原因 / 解法

| 原因 | 解法 |
| --- | --- |
| **`deploy/deploy.sh` 的 for 循环里有一个字面 `\n`** | **已知缺陷（待修）**，见根 [../CHANGELOG.md](../CHANGELOG.md)。第 7 次迭代会把 `\n` 当成词 `n`，输入重定向指向不存在的 `deploy/n` → 重定向失败 → `set -eu` 下脚本直接退出 → **`modern-pkg` / `modern-sysupgrade` / `modern-shellcrash` 三个 CGI 永不部署**，末尾那两行 echo 也不打印。**临时绕行**：手工把这三个 CGI 传上去（见 [../DEPLOY.md](../DEPLOY.md) 的手动部署段） |
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
   ssh root@10.0.0.1 'md5sum /www/cgi-bin/modern-uci' ; md5sum deploy/modern-uci
   ```

   两边对不上 → 没传上去，或传的是旧版本。

2. **确认权限**：

   ```bash
   ssh root@10.0.0.1 'ls -l /www/cgi-bin/modern-*'
   ```

   必须有 `x` 位。

3. **确认换行符**：

   ```bash
   ssh root@10.0.0.1 'file /www/cgi-bin/modern-uci'   # 或
   ssh root@10.0.0.1 'head -1 /www/cgi-bin/modern-uci | od -c | head -2'
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
| 改的是源目录、本仓没同步 | 本仓是快照 —— 见根 [../README.md](../README.md) 的「仓库现状说明」 |
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
| **前端 fallback 是 300 秒，服务端是 3600 秒** | 已知缺陷（待修）。`src/stores/session.ts` 的 `const expires = data.expires || 300`。服务端正常会返回 `expires`，但**一旦没返回，前端就按 5 分钟算** —— 表现为「明明才登录几分钟就被踢」。修法见根 [../CHANGELOG.md](../CHANGELOG.md) |
| 服务端会话真的过期（1 小时） | 重新登录。这是设计行为 |
| 路由器重启 | ubus 会话在 rpcd 重启后全部失效。重新登录 |
| `validateSession()` 把**临时网络抖动**当成了会话失效 | 不会：它只在 `SessionExpiredError`（ubus `-32002`）时清会话，普通网络错误保留会话 |
| 多标签页同时操作，一个标签页登出把另一个也带走了 | 登出会销毁服务端会话（`session.destroy`），所有标签页一起失效。重新登录 |
