# Agent Runtime SQLite Storage Worker Task 02 Review

## 结论

通过。Task 2 已建立 Worker 独占的同步 SQLite Kernel 与 fail-closed Worker 消息边界；现有 schema v2、生命周期 Unit of Work、崩溃恢复和 trace-outbox 整批事务语义保持不变。

## Review 范围

- [runtimeStorageWorkerKernel.ts](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/agent-runtime/src/storage/runtimeStorageWorkerKernel.ts)
- [runtimeStorageWorker.ts](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/agent-runtime/src/storage/runtimeStorageWorker.ts)
- [runtimeStorageWorkerKernel.test.ts](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/agent-runtime/test/runtimeStorageWorkerKernel.test.ts)
- [runtimeStorageWorkerProtocol.ts](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/agent-runtime/src/storage/runtimeStorageWorkerProtocol.ts)
- [runtimeStorageWorkerProtocol.test.ts](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/agent-runtime/test/runtimeStorageWorkerProtocol.test.ts)
- 既有 lifecycle、crash matrix、SQLite adapters 与 trace-outbox 测试。

## 主要发现

- 严重度：无阻塞项。
- Kernel 在 bootstrap 前和 close 后拒绝语义命令，只允许打开一个数据库；bootstrap 执行 identity 校验、迁移、integrity check、schema version 读取及 startup reconciliation。
- 所有 repository 与 `RuntimeLifecycleCommands` 只由 Kernel 持有；主线程侧不暴露数据库、transaction、原始 SQL 或回调能力。
- `outbox.claim` 返回不可变事件候选及 attempts/next-attempt 状态；`outbox.applyOutcomes` 在一个事务中执行 retry/delivered/dead-letter CAS，并从持久化 dead-letter 状态计算 readiness degradation。
- `storage.criticalDrain` 对每个非终态 execution 调用既有 interrupt Unit of Work；`storage.checkpoint` 返回 SQLite WAL checkpoint 三元结果。
- Worker 响应仅包含 request correlation、结果或稳定 error code/class，不返回路径、SQL、stack 或原始错误消息。
- Review 期间发现全局禁止字段 `query` 会误伤合法 `memory.search.query`，已收窄为仅禁止原始 SQL/执行能力字段并补充回归覆盖。

## 验证记录

- Kernel RED：缺少 `runtimeStorageWorkerKernel` 模块，按预期失败。
- `pnpm --filter @openharness/agent-runtime test -- runtimeStorageWorkerKernel lifecycleUnitOfWork crashMatrix sqliteRuntimeAdapters traceOutbox runtimeStorageWorkerProtocol`：通过，7 个测试文件、48 个测试。
- `pnpm --filter @openharness/agent-runtime typecheck`：通过。
- `git diff --check`：通过。

## 最终建议

进入 Task 3：通过真实 Worker 与注入式 WorkerLike 双层测试冻结 bootstrap correlation、单 in-flight、singleton lock、优雅 close、异常 exit、畸形响应和不自动重启语义。

## 后续门禁

- OpenSpec：继续 active change `harden-agent-runtime-single-node-production`。
- Superpowers：继续串行 TDD；生产接线必须等待 Task 3 Client GREEN。
- 测试：真实 Worker 测试完成后必须确认无残留线程和锁文件语义正确。
- 人工审批：无需新增审批；Git 提交、推送和发布仍未授权。
