# Agent Runtime SQLite Storage Worker Task 06 Review

## 结论

通过。Task 6 已用真实 Worker、真实 SQLite 文件和 restart 证明 commit crash boundary；成熟形态 100-row outbox transitions 与 20 个并发 admission 期间，main-thread setImmediate heartbeat 满足冻结的 100ms 阈值。

## Review 范围

- [runtimeStorageWorkerCrash.test.ts](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/agent-runtime/test/runtimeStorageWorkerCrash.test.ts)
- [runtimeStorageWorkerHeartbeat.test.ts](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/agent-runtime/test/runtimeStorageWorkerHeartbeat.test.ts)
- [runtimeStorageWorkerCrashBoundaryFixture.ts](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/agent-runtime/test/fixtures/runtimeStorageWorkerCrashBoundaryFixture.ts)
- [runtimeStorageWorkerClient.ts](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/agent-runtime/src/storage/runtimeStorageWorkerClient.ts)
- [productionRuntimeContext.ts](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/agent-runtime/src/storage/productionRuntimeContext.ts)
- [server.ts](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/agent-runtime/src/server.ts)
- Worker Client、formal soak primitives 与 production lifecycle 回归。

## 主要发现

- 严重度：无阻塞项。
- before-commit crash：Worker 退出、outstanding RPC 拒绝为 unavailable，restart 后 execution/history 均不存在。
- after-commit-before-response crash：RPC 仍拒绝，但 restart 能观察 committed user message/execution；startup reconciliation 仅将该 persisted non-terminal execution 转为 interrupted，并追加一个 stream_error。
- `onUnavailable` 每个 Client 生命周期只触发一次；queued/current promises 全拒绝，不创建替代 Worker。
- 生产 onUnavailable seam 会关闭 Fastify，间接等待 monitor/dispatcher/Worker join 和 lock release，最后调用 production `process.exit(1)`；测试可注入 terminate recorder。
- heartbeat 工作负载包含 100 个 durable trace candidates、重复 100-row outcome transactions 与 20 个并发 lifecycle admissions；SQLite 工作全部在 Worker，main-thread sample 最大值低于 100ms。

## 验证记录

- `pnpm --filter @openharness/agent-runtime test -- runtimeStorageWorkerCrash runtimeStorageWorkerHeartbeat`：通过，2 个测试文件、3 个测试。
- `pnpm --filter @openharness/agent-runtime test -- runtimeStorageWorkerCrash runtimeStorageWorkerHeartbeat productionServerLifecycle runtimeStorageWorkerClient formalSoakExecution`：通过，5 个测试文件、67 个测试。
- `pnpm --filter @openharness/agent-runtime typecheck`：通过。
- `git diff --check`：通过。

## 最终建议

进入 Task 7：运行全仓正式验证、negative scan、OpenSpec strict 与 dashboard check；全部通过后先更新 verified 制品，再执行新的 Attempt 005 和正式 Gate D，禁止复用旧性能证据。

## 后续门禁

- OpenSpec：继续 active change `harden-agent-runtime-single-node-production`，实现与验证完成前不归档。
- Superpowers：完成 verification-before-completion 后才能声称 runtime 完整。
- 测试：必须运行全量 Agent Runtime、shared、integration、Java 与 Gate D。
- 人工审批：Git 提交、推送及发布仍未授权。
