# Runtime Chat Lifecycle Logs Implementation Review

## 结论

通过。已批准的 `add-runtime-chat-lifecycle-logs` 在限定范围内完成实现、用户本地同步与真实 Local Trial smoke。同步和流式 chat 共用 `AgentExecutionRunner` 生命周期接线；accepted/terminal 记录使用精确字段白名单，日志 sink 失败不改变 execution 终态。六个 wrapper 命令均通过，最终服务已停止。此结论不是 Production Verified。

## Review 范围

- OpenSpec 与计划：
  - [proposal.md](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/main-local-trial/openspec/changes/add-runtime-chat-lifecycle-logs/proposal.md)
  - [design.md](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/main-local-trial/openspec/changes/add-runtime-chat-lifecycle-logs/design.md)
  - [tasks.md](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/main-local-trial/openspec/changes/add-runtime-chat-lifecycle-logs/tasks.md)
  - [agent-runtime spec delta](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/main-local-trial/openspec/changes/add-runtime-chat-lifecycle-logs/specs/agent-runtime/spec.md)
  - [implementation plan](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/main-local-trial/docs/superpowers/plans/2026-07-28-add-runtime-chat-lifecycle-logs.md)
- Runtime 实现：
  - [runtimeChatLifecycleLog.ts](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/main-local-trial/agent-runtime/src/runtimeChatLifecycleLog.ts)
  - [agentExecutionRunner.ts](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/main-local-trial/agent-runtime/src/agentExecutionRunner.ts)
  - [agentStreamLoop.ts](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/main-local-trial/agent-runtime/src/agentStreamLoop.ts)
  - [server.ts](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/main-local-trial/agent-runtime/src/server.ts)
- 测试：
  - [runtimeChatLifecycleLog.test.ts](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/main-local-trial/agent-runtime/test/runtimeChatLifecycleLog.test.ts)
  - [agentExecutionRunner.test.ts](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/main-local-trial/agent-runtime/test/agentExecutionRunner.test.ts)
  - [productionRunnerPersistence.test.ts](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/main-local-trial/agent-runtime/test/productionRunnerPersistence.test.ts)
  - [terminalErrors.test.ts](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/main-local-trial/agent-runtime/test/terminalErrors.test.ts)
  - [streamEventIds.test.ts](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/main-local-trial/agent-runtime/test/streamEventIds.test.ts)
- 运维与本地证据：
  - [wrapper guide](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/main-local-trial/docs/guides/openharness-local-cli-wrapper.md)
  - [user-local isolated Runtime source](file:///Users/elvis/.local/share/openharness/source/agent-runtime/src)
  - [timestamped backup](file:///Users/elvis/.local/state/openharness/backups/20260728T151700+0800-runtime-chat-lifecycle-logs)
  - [runtime.log](file:///Users/elvis/.local/state/openharness/logs/runtime.log)

## 主要发现

### Critical

无。

### Important

无未关闭项。独立 Review 首轮指出两项测试证据缺口：

1. durable admission 确认前后及拒绝路径未直接约束 accepted/terminal 调用边界；
2. throwing sink 未注入真实 runner 证明 execution 结果不变。

修正后，持久化 admission gate/rejection 测试证明确认前无日志、确认后 accepted 恰好一次、完成后 terminal 恰好一次、拒绝路径不写两类记录；runner 测试证明 accepted 与 terminal 两次 sink 写入均抛错时，结果仍为 `completed / FINAL_ANSWER / stream_done`。复审结论为 Ready，Critical、Important、Minor 均无。

### Minor / 残余风险

- lifecycle 记录是 best-effort process stdout，不是持久化、重放、trace ingestion 或审计权威；进程在 accepted 后硬崩溃时可能没有 terminal 记录。
- `runtime.log` 本次启动开头保留了一次 `EADDRINUSE 127.0.0.1:3001` 的 launchd/gateway 启动噪声，但随后 wrapper `up`、`status`、真实 chat、日志关联与 `down` 全部通过，readiness 正常，最终四端口关闭。该噪声不影响本 change 的验收，但后续若重复出现，应在独立 lifecycle-safety 诊断中调查，不在本次 change 扩展 wrapper 行为。
- 未运行全仓回归、24 小时 Gate 或生产环境验证；证据仅代表本机 Local Trial。

## 验证证据

- Codex CLI：`0.145.0`，模型 `gpt-5.6-sol`，reasoning effort `high`。
- TDD：serializer 缺失与 runner/server 未接线时均观察到精确 RED；实现后转 GREEN。
- 聚焦 Runtime matrix：7 个测试文件、初次 53/53 通过；Review 修正后新增 1 个 runner 测试并加强 persistence 断言，后续最终 matrix 应为 54/54。
- `pnpm --filter @openharness/agent-runtime typecheck`：工作树与用户本地隔离副本均通过。
- `bash -n /Users/elvis/.local/bin/openharness`：通过。
- `openspec validate add-runtime-chat-lifecycle-logs --strict --no-interactive`：change valid；仅有非阻塞离线 PostHog DNS warning。
- 用户本地同步：4 个生产 TypeScript 文件的工作树与隔离副本 SHA-256 逐一一致；3 个原文件备份 SHA-256 与同步前一致；manifest 权限为 `0600`。
- 真实 chat：
  - conversationId：`conv-07016281-2c02-46a2-b860-d40c97fc3bdc`
  - requestId：`req-eb4b53d3-31bb-4f21-96fd-37f413450753`
  - traceId：`trace-a92fef69-03a3-480d-9406-0ad795b2aa35`
  - executionId：`bc75ab33-f9cd-4906-a7a0-535747e2530c`
  - answer：`OPENHARNESS_RUNTIME_LOG_CLOSURE_OK`
  - stopReason：`FINAL_ANSWER`
- 精确日志探针：恰好两条记录；events 为 `runtime_chat_accepted,runtime_chat_terminal`；标识一致；terminal 为 completed/FINAL_ANSWER；字段集合严格匹配 allowlist；禁止字段不存在。
- 六命令：`doctor PASS`、`up PASS`、`status PASS`、`chat PASS`、`logs runtime PASS`、`down PASS`。
- 最终状态：wrapper `STOPPED`；8080、3001、3101、5173 均 `CLOSED`。

## 最终建议

保持 `add-runtime-chat-lifecycle-logs` 与 `add-codex-reasoning-effort-config` 为 active、verified、未归档状态。当前 Local CLI 试用闭环已达到 6/6；不要把该结论升级为 Production Verified，也不要在本 change 中追加 CLI 查询 API、持久化日志、Frontend 或 wrapper lifecycle 修改。

Project Learning Closeout 未发现需要新增通用规则的候选：两项 Review finding 是不同的任务内测试证据缺口，且已分别由确定性回归测试机械约束；无需新增 `CONTEXT.md`、ADR 或 engineering invariant。

## 后续门禁

- 本 change 的批准范围内不需要新的 OpenSpec。
- 若要改变正式 CLI 契约、日志持久化/查询、安装升级、配置凭据、Runtime 用户可见语义、wrapper lifecycle 或 Frontend，必须创建新的 OpenSpec proposal，严格验证并等待批准后再生成 Superpowers implementation plan。
- 本次不归档、不 commit、不 push、不合并、不跑全仓回归或 24 小时 Gate。
- 未修改项目规则。
