# Agent Runtime Lifecycle Transaction Batching Diagnosis Plan Review

## 结论

通过：允许冻结并预检 lifecycle transaction ABBA runner。诊断候选限定为两个短 event batches，不跨模型、工具、审批或任何外部 I/O 持有 SQLite transaction；本结论不授权 production source 变更。

## Review 范围

- [Transaction batching diagnosis plan](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/docs/superpowers/plans/2026-07-24-agent-runtime-lifecycle-transaction-batching-diagnosis.md)
- [Page Cache A/B Result Review](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/docs/review/2026-07-24-agent-runtime-sqlite-page-cache-diagnosis-result-review.md)
- [Attempt003 Result Review](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/docs/review/2026-07-24-agent-runtime-10m-mature-database-regression-attempt-003-result-review.md)
- [Lifecycle commands](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/agent-runtime/src/storage/lifecycleCommands.ts)
- [Runtime event store](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/agent-runtime/src/storage/sqliteRuntimeEventStore.ts)
- [Runtime storage](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/agent-runtime/src/storage/runtimeStorage.ts)
- [Agent execution runner](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/agent-runtime/src/agentExecutionRunner.ts)

## 主要发现

### Critical / High

无。

### Medium

1. 当前无工具 execution 的 production durable event 序列为 12 个 events；合成诊断对应 1 次 start、8 次单 event transaction、1 次 completion，共 10 次写事务。
2. 简单 final-answer 路径存在明确的同步相邻 event 簇；计划将候选限制为两个各 4 events 的短 batch，避免用“整个 execution 单事务”制造无法落地的虚假收益。
3. 成熟库 query plan 已确认 message cursor、event cursor 与 execution lookup 命中既有索引；因此本轮只检验 transaction/cursor reservation，不混入 schema/index 变化。
4. 冻结门槛要求 aggregate 主指标至少改善 `15%` 且 replicate 方向一致，高于 Gate R6 的观测噪声范围。

### Low

1. 若 batch 显著减少 WAL frames，它同时是 transaction coalescing 的预期结果；报告必须分别列出 transaction count、WAL 与 DB growth，不能把 WAL 改善错误归因于 page cache。
2. Candidate event cursor 必须在同一 `BEGIN IMMEDIATE` 中从一次 `MAX(cursor)` 连续分配，且需抽样核对 kind order。

## 最终建议

先实现只存在于验证目录的冻结 runner，完成 import、参数拒绝、source binding、event-order/counter assertions 与 `git diff --check`；随后另行落盘 Preflight Review，才可创建 4 个成熟 clone 并执行 ABBA。

## 后续门禁

- 不修改项目规则、OpenSpec task、Dashboard 或 production source。
- runner/preflight 未通过前不得创建/执行有效 ABBA。
- 即使 ABBA 通过，仍需独立 TDD implementation plan 与 Plan Review；不得直接进入 Attempt005。
