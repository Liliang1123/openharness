# ChatGPT OAuth Task 8 Real Qualification Preflight Review

## 结论

有风险。Task 8 的执行范围、证据 schema、停止条件和最终 promotion 规则已经锁定，
技术上可以执行；但真实 OAuth/app-server smoke 仍受显式人工授权门禁阻塞。授权前
不得运行官方 Codex login/status/app-server/provider 命令，不得读取现有会话状态。

## Review 范围

- [Task 8 approved plan](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-chatgpt-oauth-auth-task4/docs/superpowers/plans/2026-07-10-add-chatgpt-oauth-auth.md)
- [OpenSpec tasks](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-chatgpt-oauth-auth-task4/openspec/changes/add-chatgpt-oauth-auth/tasks.md)
- [provider adapter delta](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-chatgpt-oauth-auth-task4/openspec/changes/add-chatgpt-oauth-auth/specs/provider-adapter/spec.md)
- [backend gateway delta](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-chatgpt-oauth-auth-task4/openspec/changes/add-chatgpt-oauth-auth/specs/backend-gateway/spec.md)
- [CodexAppServerClient.java](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-chatgpt-oauth-auth-task4/backend/src/main/java/org/openharness/backend/service/provider/CodexAppServerClient.java)
- [CodexProcessSupervisor.java](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-chatgpt-oauth-auth-task4/backend/src/main/java/org/openharness/backend/service/provider/CodexProcessSupervisor.java)
- [CodexAppServerAdapter.java](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-chatgpt-oauth-auth-task4/backend/src/main/java/org/openharness/backend/service/provider/CodexAppServerAdapter.java)
- [QualificationReportPromoter.java](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-chatgpt-oauth-auth-task4/backend/src/main/java/org/openharness/backend/qualification/QualificationReportPromoter.java)
- [fake evidence baseline](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-chatgpt-oauth-auth-task4/docs/verification/agent-runtime-v1/providers/2026-07-12-codex-app-server-fake.json)
- [Task 7 High Review](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-chatgpt-oauth-auth-task4/docs/review/2026-07-12-chatgpt-oauth-task7-high-review.md)
- [Task 6 High Review](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-chatgpt-oauth-auth-task4/docs/review/2026-07-12-chatgpt-oauth-task6-high-review.md)

## 主要发现

### High：显式授权仍缺失

当前会话没有用户对 Task 8 真实本地 OAuth qualification 的明确授权。既有“后续
Task 8 需要真实 OAuth 明确授权”是门禁说明，不是授权本身。因此不得调用真实
Codex login/status，不得启动真实 app-server，不得利用当前官方会话发起模型请求。

### High：production evidence 必须覆盖六类独立 oracle

授权后的仓库外一次性 probe 应直接驱动项目内 `CodexAppServerClient` 与本地 stdio
app-server，并生成以下 required rows：

1. `codex-real-sync`：非空 terminal assistant result、无 fallback。
2. `codex-real-reasoning`：reasoning event 被解析为非空 reasoning block。
3. `codex-real-usage`：integral non-negative input/output/cached counters。
4. `codex-real-stream`：JSONL proxy 至少观察一个 assistant delta method，最终聚合
   内容非空；proxy 只保留 method counter，不保留 frame 或文本。
5. `codex-real-cancellation`：真实 dynamic tool pending 后发送 responder failure 与
   exact `turn/interrupt`，得到结构化 cancelled outcome，子进程最终清理。
6. `codex-real-redaction`：tool-result synthetic Authorization-like canary 在出站 frame
   前被替换；probe 只记录 `rawCanaryObserved=false` 与 `redactionMarkerObserved=true`，
   不把 canary 或 frame 写入 evidence。

若真实模型未产生 required reasoning/dynamic-tool behavior、协议不兼容、无登录或
本地 CLI 不可用，对应 row 与 overall report 必须为 `blocked` 或 `fail`；禁止用 fake
row、Task 4/7 单测或普通聊天成功替代。

### Medium：执行与证据边界

- probe 文件只能位于 [系统临时目录](file:///tmp)，不写入生产 source tree；执行后
  项目内只允许新增 immutable production evidence 和最终 Review。
- probe 可在内存中逐行转发 JSONL，但只能持久化事件方法计数、布尔 oracle、usage、
  duration、SHA-256 request hash 与脱敏环境指纹。
- evidence 目标为
  [2026-07-12-codex-app-server-production.json](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-chatgpt-oauth-auth-task4/docs/verification/agent-runtime-v1/providers/2026-07-12-codex-app-server-production.json)，
  `track=production`；全部 required rows PASS 时 overall 才能为 `pass`。
- 环境只记录 CLI version、OS/arch、stdio transport、provider、model、协议版本、
  authorized-session 布尔状态和固定命令 fingerprint；禁止记录 home path、用户名、
  PID、credential path、token、原始 prompt/response、thread/turn/call/bridge id。
- 新 evidence 必须先由 Java validator 与 shared-schema parser 双重校验，再计算稳定
  SHA；不得覆盖既有 fake evidence。

### Medium：停止条件

立即停止并保留 BLOCKED/FAIL 证据的条件：token/credential/Authorization 泄漏、
CLI 原始输出进入日志、远程 endpoint、silent fallback、未知协议 frame、非精确
cancellation、app-server orphan、required row 只能靠弱代理推断、任何项目文件并发
漂移。

### Low：仓库外 probe dry-run

- [CodexOAuthQualificationProbe.java](file:///tmp/CodexOAuthQualificationProbe.java) 已独立
  编译通过，SHA-256 为
  `d97a2ae7d5a2f2022ab394e601a7749b28a10e3654a3b014d01423ebd1c02fa2`。
- 未设置授权环境门禁时，probe 在创建进程前固定 exit 3。
- 使用 `/usr/bin/false` 的 unavailable dry-run 生成六个 required BLOCKED rows，overall
  `blocked`，Java promoter validation 通过。
- 使用 [fake-codex-task8](file:///tmp/fake-codex-task8) 的纯 synthetic dry-run 覆盖六行
  oracle，overall `pass`，证明 observer、cleanup、cancellation、redaction 和 report
  schema plumbing 可工作；该临时报告仅位于
  [fake-pass 临时目录](file:///tmp/openharness-task8-probe-fake-pass-20260712)，模型和
  CLI fingerprint 均明确为 fake，绝不能复制到项目 evidence 或用于 Task 8 PASS。
- 两种 dry-run 均未启动真实 Codex、未读取登录状态、未使用真实 OAuth/provider。

## 最终建议

等待用户以明确文本授权 Task 8。授权后先只读记录 CLI version 和 operator status；
若 needs-login，再由官方登录界面完成登录，不请求用户粘贴 token。随后生成并独立
复核已编译的 [CodexOAuthQualificationProbe.java](file:///tmp/CodexOAuthQualificationProbe.java)，
执行六行真实矩阵，校验/扫描 evidence，最后运行 approved Task 8 full gates。任何一行
不能被强证据证明时，不得推进 dashboard verified 或 archive。

## 后续门禁

- 当前不需要新增 OpenSpec proposal；Task 8 已包含在 active approved change。
- 当前不需要新增 Superpowers plan；现有 plan 已明确 Task 8。
- 未获授权前，Task 8、OpenSpec 23/23、dashboard verified、archive 和 Runtime parity
  worktree 均保持未完成。
- 获得 PASS 后才可勾选 23/23，并重新运行 OpenSpec strict、backend/runtime/schema
  full tests、typecheck、dashboard render/check、secret scan、`git diff --check`。
- 本 Preflight 未修改项目规则、实现、OpenSpec checkbox 或 dashboard。
