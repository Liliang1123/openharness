# Agent Runtime Admission 写竞争恢复计划

> 模式：OpenSpec 精简模式；适用 change：`harden-agent-runtime-single-node-production`

## 目标

把 trace outbox 每批最多 100 个 delivered/retry/dead-letter 状态迁移，从“每个 event 一个 `BEGIN IMMEDIATE` transaction”收敛为“每个 dispatch batch 一个 transaction”，降低与新 execution admission 的 SQLite 单写者竞争，同时保持现有 at-least-once、重试、dead-letter、readiness、batch size 和 delivery concurrency 语义。

## 依据

- [60 分钟结果 Review](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/docs/review/2026-07-24-agent-runtime-60m-recovery-result-review.md)
- [trace outbox implementation](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/agent-runtime/src/storage/traceOutbox.ts)
- [trace outbox tests](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/agent-runtime/test/traceOutbox.test.ts)
- [Runtime database transaction](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/agent-runtime/src/storage/runtimeStorage.ts)
- [durable outbox OpenSpec delta](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/openspec/changes/harden-agent-runtime-single-node-production/specs/agent-runtime/spec.md)

## 边界

允许修改：

- [traceOutbox.ts](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/agent-runtime/src/storage/traceOutbox.ts)
- [traceOutbox.test.ts](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/agent-runtime/test/traceOutbox.test.ts)
- 必要的 Review、计划与新验证证据。

禁止修改：

- SQLite schema/migration 与 delivery status；
- dispatcher batch size `100`、delivery concurrency `20`、retry delay `1s`、max attempts `5`；
- Java trace request/identity、external API、retention、workload、sample interval 或性能阈值；
- 既有 attempt 001/002/003 证据。

## Task 1：TDD 锁定 batch transition 契约

1. 扩展 transaction-counting seam。
2. 新增五个 trace events、一个 Java failure、concurrency 2 的测试。
3. 断言结果仍为 delivered 4 / retried 1、maximum active deliveries 2、失败 event 状态为 retry。
4. 新增核心断言：整个 batch 只允许一次 state-transition `database.transaction()`。
5. 先运行该测试并观察当前实现 RED（预期 transaction count 为 5 而不是 1）。

## Task 2：最小实现

1. delivery workers 读取当前状态并调用 Java，只返回 typed outcome，不写 SQLite。
2. 跳过已不再 pending/retry 或 retry 尚未到期的 candidate。
3. `Promise.all` 完成后筛出有效 outcomes。
4. outcomes 非空时只调用一次 `database.transaction()`；在同一 transaction 内依次复用现有 `markAcknowledged`、`markRetry`、`markDeadLettered`。
5. transaction 成功后再汇总 processed/delivered/retried/deadLettered/readinessDegraded。
6. transaction 失败时让 batch reject；未确认记录继续由既有 dispatcher 重试，不返回虚假成功。

## Task 3：验证

1. 新 RED 测试转 GREEN。
2. 运行完整 `traceOutbox`、dispatcher、runtime storage、production lifecycle focused suite。
3. 运行 workspace full tests、typecheck、backend Maven、OpenSpec strict、dashboard check、`git diff --check`。
4. 进行独立实现 Review；确认没有改变 outbox lifecycle 与 at-least-once crash window。
5. Review 通过后另建新的固定真实恢复回归计划；不得覆盖 attempt 003 或直接声称 local_verified。

## Task 4：后续独立风险

本计划不顺带改变 retention 或 Java trace sink。新的固定回归通过后，必须继续单独闭合：

- low-disk/WAL monitor 的 production wiring；
- Java TraceService 的 24 小时容量与 stdout 增长风险；
- 正式 24 小时 Gate D 的 approval-bound execution。

这些风险不得用本次 transaction batching PASS 推断为已解决。
