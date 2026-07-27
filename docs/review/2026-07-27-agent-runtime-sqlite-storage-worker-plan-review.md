# Agent Runtime SQLite Storage Worker Plan Review

## 结论

通过：计划完整覆盖已批准的 dedicated SQLite storage Worker Thread 合同，允许在当前隔离 worktree 中按 Task 1–7 串行、TDD、strict evidence 执行。该结论授权实现与本地验证，不授权 Git 写操作、Attempt005、正式 Gate D、production promotion 或 OpenSpec archive。

## Review 范围

- [Implementation Plan](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/docs/superpowers/plans/2026-07-27-agent-runtime-sqlite-storage-worker.md)
- [Active OpenSpec proposal](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/openspec/changes/harden-agent-runtime-single-node-production/proposal.md)
- [Active OpenSpec design](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/openspec/changes/harden-agent-runtime-single-node-production/design.md)
- [Active Agent Runtime delta](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/openspec/changes/harden-agent-runtime-single-node-production/specs/agent-runtime/spec.md)
- [Active OpenSpec tasks](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/openspec/changes/harden-agent-runtime-single-node-production/tasks.md)
- [Production Runtime context](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/agent-runtime/src/storage/productionRuntimeContext.ts)
- [Runtime storage](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/agent-runtime/src/storage/runtimeStorage.ts)
- [Lifecycle commands](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/agent-runtime/src/storage/lifecycleCommands.ts)
- [SQLite adapters](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/agent-runtime/src/storage/sqliteRuntimeAdapters.ts)
- [Production server wiring](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/agent-runtime/src/server.ts)
- [Trace outbox](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/agent-runtime/src/storage/traceOutbox.ts)
- [Storage monitor](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/agent-runtime/src/storage/runtimeStorageMonitor.ts)
- [Gate R9 Result Review](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/docs/review/2026-07-27-agent-runtime-trace-transition-chunking-diagnosis-result-review.md)

## 主要发现

### Critical / High

无。

### Medium

1. 现有 production context 暴露同步 `RuntimeDatabase` 和 repositories，Agent runner、session API、SSE replay、outbox、monitor、critical drain 与 shutdown 均存在直接或间接同步调用。计划没有用 `Atomics.wait`、SharedArrayBuffer 或 deasync 保留假异步，而是把 production-facing lifecycle/store/read ports 改为真正 awaited commands。
2. Worker kernel lazy bootstrap：singleton lock 先由主线程获取，worker 只在 `bootstrap` command 中打开/创建数据库；已有数据库校验 frozen dev/inode，新库由 bootstrap 返回实际 identity。此顺序保持第二实例 fencing 和 database identity contract。
3. Protocol 是 operation → payload/result map 的封闭泛型，不允许 generic SQL/query/execute、callback、SQLite handle 或 executable value；每个新增 operation 必须同时通过 parser/kernel/client tests。
4. Scheduler 明确 `2,048` pending bound、P0 exclusive、P1 foreground、P2 background 与 32:1 fairness；单 in-flight worker command 保证一个 SQLite owner/transaction execution stream。Queue full 复用现有 storage-pressure fail-closed schema。
5. Lifecycle commit-before-publish 有独立 RED/GREEN；所有 durable paths 必须 await RPC 后才发布。SSE subscribe-before-replay 在异步 worker 下新增 live buffer、cursor order 和 eventId dedup，关闭原同步 tick 假设失效后的 gap/reorder 风险。
6. Trace Java delivery保留主线程网络 concurrency，worker 只执行 claim 和 whole-batch outcome transition；不引入 Gate R9 被拒绝的 chunk crash boundary。
7. Worker exit/protocol corruption 通过 idempotent unavailable latch 关闭 admission/readiness、拒绝 pending RPC、关闭服务并终止 Runtime process；禁止 replacement worker。Normal close 的 worker checkpoint/close/join → singleton release 顺序有 real-worker tests。

### Low

1. Plan 不包含 Git add/commit/push/reset/clean 或外部发布步骤。
2. Plan 无 `TBD`、`TODO`、省略式“类似 Task N”或未定义 payload/result 泛型。
3. Runtime 继续使用现有 TypeScript ESM/tsx 与 `better-sqlite3`，不增加依赖或 SQLite migration；实际 Worker loader 路径由 real-worker boot test 先证实。

## 绑定证据

- Plan SHA-256：`01db4a19adb63f1b2933371bce548297a6c771e50baf807c462c7d46e28491cd`
- OpenSpec design SHA-256：`7d6bb15cc81116a9104fed2bb73c72080a833ef85dd46eafe55cae6696401858`
- Agent Runtime delta SHA-256：`b6397335efe0e80756ac2819b5057cbe884e6048aa656b1928f5b49501e71a64`
- `npx openspec validate harden-agent-runtime-single-node-production --strict --no-interactive`：PASS。
- `pnpm dashboard:check`：PASS，generated outputs current。
- `git diff --check`：PASS。

## 最终建议

从 Task 1 protocol/scheduler RED 开始，逐 slice 完成 RED → GREEN → focused verification → distinct Review。不得先批量改异步 call sites；Worker kernel/client real boot 通过前不得接入 production server。Task 6 heartbeat/crash 与 Task 7 full/mature regression 是进入 Attempt005 的硬门禁。

## 后续门禁

- **OpenSpec：** 已批准并 strict-valid；实现发现需要新增 public schema、SQLite schema、outbox crash boundary、queue/priority或退出语义时必须停下修订并重新批准。
- **Superpowers：** 使用 `executing-plans` 串行实施；行为改动必须 TDD，异常必须 systematic debugging。
- **Review：** strict slice Review 和最终 High Review 必须落盘；任何 finding 返回同 slice。
- **测试：** focused、full、worker crash/heartbeat 和成熟数据库 10 分钟回归缺一不可。
- **项目规则：** 未修改。
