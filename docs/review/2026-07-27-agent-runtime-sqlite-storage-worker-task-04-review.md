# Agent Runtime SQLite Storage Worker Task 04 Review

## 结论

通过。Task 4 已将生产 lifecycle、history、memory、execution、approval 与 event 端口改为真正异步的 Worker RPC，并在所有生产调用点显式 await；durable commit acknowledgement 之前不会发布 live event 或暴露 HTTP 200/SSE headers。

## Review 范围

- [lifecycleCommands.ts](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/agent-runtime/src/storage/lifecycleCommands.ts)
- [history.ts](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/agent-runtime/src/history.ts)
- [runtimeEventStore.ts](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/agent-runtime/src/runtimeEventStore.ts)
- [sqliteRuntimeAdapters.ts](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/agent-runtime/src/storage/sqliteRuntimeAdapters.ts)
- [productionRuntimeContext.ts](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/agent-runtime/src/storage/productionRuntimeContext.ts)
- [agentExecutionRunner.ts](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/agent-runtime/src/agentExecutionRunner.ts)
- [agentStreamLoop.ts](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/agent-runtime/src/agentStreamLoop.ts)
- [server.ts](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/agent-runtime/src/server.ts)
- focused production persistence、stream、session、abort、context 与 adapter 测试。

## 主要发现

- 严重度：无阻塞项。
- `Awaitable<T>` 允许现有 in-memory 实现保持同步，同时 Worker-backed adapters 返回 Promise；TypeScript 全调用点审计已清零。
- `AgentExecutionHandle.admitted` 只在 `lifecycle.startExecution` commit acknowledgement 后 resolve；Runner 再发布 committed events，Stream 再写 200 和 flush headers。
- lifecycle recordEvent/tool/approval/terminal/injection/abort 的每个 durable boundary 均 await，不存在 fire-and-forget 写入。
- SSE 在 await replay 前订阅并缓冲 live events，先输出 replay，再按 durable event order drain buffer，并以 eventId 去重。
- `ProductionRuntimeContext` 不再包含 `database` 或 `repositories`，仅持有 Worker client、领域端口、live publisher、reconciliation 与异步 close。

## 验证记录

- Async admission RED：pending admission 时 `writeHead`/`flushHeaders` 提前发生，按预期失败。
- `pnpm --filter @openharness/agent-runtime test -- productionRunnerPersistence agentStreamLoop detachedStream sessionsApi abortApi productionRuntimeContext sqliteRuntimeAdapters`：通过，7 个测试文件、29 个测试。
- `pnpm --filter @openharness/agent-runtime typecheck`：通过。
- `git diff --check`：通过。

## 最终建议

进入 Task 5，冻结 two-phase outbox store、async monitor 无重叠调度、P0 critical drain，以及 Fastify→dispatcher/monitor→Worker close/join→lock release 的关闭顺序。

## 后续门禁

- OpenSpec：继续 active change `harden-agent-runtime-single-node-production`。
- Superpowers：继续串行 TDD。
- 测试：Task 5 必须覆盖 whole-batch apply 一次、checkpoint P2、critical P0 和生产 shutdown。
- 人工审批：无需新增审批；Git 提交、推送和发布仍未授权。
