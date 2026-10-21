# 已知限制

> **一句话**：控制台做不到什么、为什么做不到 —— 本篇是「限制清单」的**唯一正本**，
> 根 README 只留一句概述 + 链接。

配套阅读：[WRITE-LAYER.md](WRITE-LAYER.md)（授权边界）、
[ARCHITECTURE.md](ARCHITECTURE.md)（通道能力）、
[TROUBLESHOOTING.md](TROUBLESHOOTING.md)（按现象排错）。

---

## 1. rpcd 的 UCI 访问按配置文件名授权

控制台的登录会话是一个 ubus session，rpcd 对它做了 ACL。
**能写哪几个配置文件是按文件名授权的**，只有这 10 个可写：

`dhcp` / `firewall` / `network` / `system` / `wireless` / `dropbear` / `luci` / `opkg` / `ntp` / `timeserver`

- 其它配置文件一律返回 `Invalid argument`。
- **新建自定义配置文件也不行** —— `uci.add` 只能往已授权的配置文件里加 section。
- `uci.revert`（丢弃暂存改动）会话被明确拒绝，必须走 root CGI `modern-uci`。

白名单正本见 [WRITE-LAYER.md](WRITE-LAYER.md) §1。

## 2. 诊断命令走白名单

- 只支持 `ping` / `dns` / `trace` / `routes` / `ports` 五个固定工具。
- 单次超时按工具区分：ping **30 秒**、DNS **15 秒**、路由跟踪 **120 秒**、路由表与监听端口 **10 秒**。
- 输出超过 200 KB 截断；目标地址只允许 `[A-Za-z0-9._:-]`。

## 3. 软件包页只支持 apk

只支持 apk（OpenWrt 24.10+）。只有 `opkg` 的固件上，软件包页所有操作都返回
「此固件使用 opkg，控制台目前只支持 apk」；opkg 的完整支持尚未实现。

## 4. 没有 `rpcd-mod-luci` 的固件

概览、无线、客户端页依赖 `luci` / `luci-rpc` 两个 ubus 对象，
缺这两个对象时这些页面取不到数据（装 `luci-base` 或单独的 `rpcd-mod-luci`）。

## 5. SNAPSHOT / 自编固件 / 非 OpenWrt 发行版

固件页只显示 warning，不判定「有更新」或「已是最新」，
升级前需自行确认兼容性。

## 6. 多 WAN 只展示主 WAN

概览与网络页的 WAN 摘要按「接口名 → 默认路由 → 网卡名」识别**一个**主 WAN，
其余 WAN 只出现在接口表里。

## 7. 6 GHz 与 DFS 信道取决于国家码与驱动

配置页列出候选信道，驱动不接受时以设备实际能力为准。

## 8. `/www/modern` 不在 `sysupgrade.conf` 的保留清单里

路由器刷机会**丢掉整个控制台**，需要重新部署。
（加进保留清单属于另一条线的决策，见 [MAINTENANCE.md](MAINTENANCE.md) §3.3。）

## 9. 特权动作分三档

| 档 | 动作 | 服务端要求 |
|---|---|---|
| 一档 | 改密码 / 重启 / 恢复出厂 / 备份恢复 / 固件刷写 | **一次性令牌 + 二次确认**（刷固件 / 恢复备份 / 恢复出厂还要手动输入确认词） |
| 二档 | apk 安装卸载 / ShellCrash 写入 | 只要 `confirm=yes` |
| 三档 | 丢弃暂存 / 提交 / 应用 / 重载服务 / 服务启停 | 服务端不拦 |

逐个动作的令牌用途与确认词清单见 [WRITE-LAYER.md](WRITE-LAYER.md) §3（正本）。

## 10. `sid` 会进 uhttpd 访问日志

`sid` 通过查询参数传给 CGI，可能出现在 uhttpd 访问日志里 ——
这是本机 LAN + HTTPS 下的折中。

## 11. 开机引导、分区表编辑、swconfig 端口不在范围

控制台不做 firstboot 引导，不编辑分区表，也不管理 swconfig 端口。

## 12. 各家设备细节不一样

接口名、分区布局、包管理器、ShellCrash 安装路径各家不同。
控制台对常见差异做了通用处理，个别字段以实际设备为准。

## 13. 设备识别只能到「类别 + 部分型号」

客户端页的类型来自 **OUI 厂商 + 主机名 + Wi-Fi 能力 + 主动指纹**，不是设备自报的身份：

- 小米 miIO 设备（插座、净化器、摄像头等）能确认「小米智能家居」，但**拿不到具体型号** ——
  `miIO.info` 需要设备 token，token 在米家账号里，控制台不碰账号。
- 只有**主动广播型号**的设备能精确到型号：小米电视（mitv）、小米网关（lumi）、
  打印机（IPP / mDNS）、Chromecast / AirPlay 设备。
- 手机、平板、电脑大多不响应探测，只能靠 OUI、主机名和 2.4G / 5G 能力推断；
  开了随机 MAC 的手机厂商一栏会显示「未知厂商」。
- 主动指纹依赖 **nixio**（随 LuCI 提供）。没有 nixio 的精简固件上，
  `what=identify` 返回 `500`，页面自动退回纯被动识别，不会报错。

---

> 以上是**设计边界**，不是待修缺陷。待修缺陷清单见根
> [../CHANGELOG.md](../CHANGELOG.md) 的「待补」段。
