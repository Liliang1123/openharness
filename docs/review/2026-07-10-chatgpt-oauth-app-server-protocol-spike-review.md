# ChatGPT/Codex OAuth 本机 app-server 协议 Spike Review

## 结论

通过。当前安装的 Codex CLI 已暴露可供 OpenHarness 对接的本机 app-server 传输与 JSON-RPC 协议面；在正常主机环境中，最小 stdio initialize 握手已取得有效响应并在 stdin EOF 后正常退出。可以进入 fake 协议适配与 TDD 实现阶段。

## Review 范围

- [OpenSpec proposal](file:///Users/elvis/file/develop/opensource/openharness/openspec/changes/add-chatgpt-oauth-auth/proposal.md)
- [OpenSpec design](file:///Users/elvis/file/develop/opensource/openharness/openspec/changes/add-chatgpt-oauth-auth/design.md)
- [OpenSpec provider-adapter delta](file:///Users/elvis/file/develop/opensource/openharness/openspec/changes/add-chatgpt-oauth-auth/specs/provider-adapter/spec.md)
- [OpenSpec backend-gateway delta](file:///Users/elvis/file/develop/opensource/openharness/openspec/changes/add-chatgpt-oauth-auth/specs/backend-gateway/spec.md)
- [Approved implementation plan](file:///Users/elvis/file/develop/opensource/openharness/docs/superpowers/plans/2026-07-10-add-chatgpt-oauth-auth.md)
- Local `codex app-server --help` and `codex app-server generate-json-schema --experimental` output from CLI `codex-cli 0.144.1`（schema 生成于仓库外的 [临时目录](file:///private/tmp/openharness-codex-app-server-schema)）。

## 主要发现

### 低风险：协议入口已确认

CLI 支持 `stdio://`（默认）、Unix socket 和 WebSocket 监听；`app-server proxy` 可转发到控制 socket。生成的 v1/v2 schema 包含 initialize、thread/start、turn/start、turn 完成/中断，以及 reasoning 增量事件。

### 已关闭：运行时握手门禁

沙箱内首次尝试因无权初始化 [Codex state runtime](file:///Users/elvis/.codex-account-a) 而退出。相同最小请求在正常主机环境执行成功，返回 `userAgent=Codex Desktop/0.144.1`、`platformFamily=unix`、`platformOs=macos`，并发送 `remoteControl/status/changed` 通知。客户端若在写入请求后立即关闭 stdin，会非确定性触发 `dropping message for disconnected connection`；保持连接直至收到响应后再 EOF，复验在 0.9 秒内以退出码 0 完成。因此实现必须以响应/超时驱动连接关闭，不能把“写完即 EOF”当作可靠握手。该验证未发送 thread/start 或 turn/start，未触发 Provider 调用，也未读取或打印 OAuth 凭据。

### 中风险：协议为实验性且随 CLI 版本变化

initialize 通过 `experimentalApi` 协商实验字段；当前 schema 同时包含 v1 与 v2 类型。因此实现必须记录启动时 CLI 版本，固定选用一套版本化方法，并在握手失败、未知事件或进程退出时进入 `unavailable/degraded`，不得静默回退到 mock、智谱或 API key。

### 高风险边界：OAuth token 不得进入 OpenHarness

schema 中的 ChatGPT token refresh 能力描述为由外部 host 提供并仅在内存中使用。OpenHarness 不应读取 [Codex state/credential directory](file:///Users/elvis/.codex-account-a)、接收/持久化/打印 token，也不应自行刷新 token；登录、登出和授权状态查询必须通过官方 Codex CLI/app-server 完成。

## 最终建议

1. 继续执行已批准计划的 Task 2 起步实现：Java Gateway provider contract/config，随后实现进程监督器、Unix socket/stdio IPC 客户端和状态机。
2. 首次握手只发送最小 initialize 参数，显式声明客户端名/版本；仅在需要时启用实验 API。
3. IPC 客户端保持双向连接直至收到对应 request id 的响应；关闭必须由响应、显式 shutdown 或超时驱动。
4. 对 thread/start、turn/start、turn/interrupt 与 reasoning/完成事件建立 fake app-server 测试矩阵，并验证日志脱敏。
5. 将 `codex-cli 0.144.1` 作为本地验证基线；真实 Provider smoke 仍需用户另行明确授权，且不得在本阶段自动执行。

## 后续门禁

- OpenSpec proposal/design/spec delta/tasks 已获用户批准，无需新 proposal。
- 实现代码必须遵循 TDD；先补 fake app-server/协议契约测试，再写生产代码。
- initialize 协议门禁已通过；后续实现继续遵循 TDD 与 fake app-server 优先。
- 真实 OAuth/Provider 调用、凭据读取和 Gate C 关闭均不在本次 spike 授权范围内。
