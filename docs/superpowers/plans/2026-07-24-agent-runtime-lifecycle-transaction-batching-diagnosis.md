# Agent Runtime Lifecycle Transaction Batching Diagnosis Plan

> **执行约束：** OpenSpec 精简模式，strict evidence profile；串行、无 subagent、无 Git 写操作。先诊断，未通过决策门槛不得修改 production source。

**Goal:** 判断成熟 4GB SQLite 上，单个无工具 execution 的 8 个相邻 runtime events 分别提交，是否因 writer lock、重复 cursor lookup 与 WAL page frames 放大而造成 admission 尾延迟。

## Gate 1

- Evidence：[Attempt003 Result Review](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/docs/review/2026-07-24-agent-runtime-10m-mature-database-regression-attempt-003-result-review.md)。
- 排除项：[Page Cache A/B Result Review](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/docs/review/2026-07-24-agent-runtime-sqlite-page-cache-diagnosis-result-review.md) 已证明 64 MiB cache + 256 MiB mmap aggregate throughput 仅改善 `0.9475%`，且 RSS 增加 `130.8384%`。
- Observed query plans：成熟库的 message `MAX(seq)`、event `MAX(cursor)` 与 execution lookup 均命中既有 covering/primary-key index，不以新增 index 为本轮候选。
- Hypothesis：现有固定 lifecycle 每 execution 产生 10 次写事务；其中 8 个相邻 event 可按 production 实际同步簇合并为两组，每组一次 cursor reservation 和一次 commit，把每 execution 写事务降至 4 次。
- Stop：任一 clone/hash/integrity/counter/event-order 失败、candidate 改变 durable event 内容或 candidate 不满足门槛，立即停止；不得进入 source 实施。

## Task 1：冻结诊断 runner

- Create：[Transaction A/B runner](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/docs/verification/agent-runtime-v1/gate-d/performance-recovery/gate-r7-20260724-001/run-lifecycle-transaction-ab.ts)。
- 使用真实 `RuntimeLifecycleCommands`、repositories、`openRuntimeDatabase` 与成熟 clone。
- 每个 run 固定 4,000 scopes × 2 rounds，共 8,000 executions；每 execution 写 2 messages、12 runtime events，trace/non-trace mix 与 Gate R6 相同，每 100 executions 批量 ack pending trace。
- Control：`startExecution` + 8 次 `recordEvent` + `completeExecution`，精确 10 次 lifecycle transaction。
- Candidate：`startExecution` + 两组各 4 events 的本地诊断 batch + `completeExecution`，精确 4 次 lifecycle transaction；每组只读取一次起始 cursor，在同一 `BEGIN IMMEDIATE` 内连续分配 cursor。
- Candidate 不跨模型/tool `await` 持有 transaction，不把整个 execution 合为单一长事务；只模拟 production 中同步相邻 event 簇。
- 两侧保持 event 顺序、event payload、message/execution/event 最终计数、trace outbox ack、schema、WAL、synchronous、foreign keys、autocheckpoint 与 page cache/mmap 完全相同。

## Task 2：ABBA 执行

- 从 [Attempt004 成熟主库](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/docs/verification/agent-runtime-v1/gate-d/performance-recovery/gate-r4-20260724-004/gate-r4-20260724-recovery-004.sqlite) 创建四个 fresh APFS clones，并绑定起始 size/SHA-256。
- 顺序：Control A1 → Candidate B1 → Candidate B2 → Control A2。
- 每次使用独立 Node process/SQLite connection，记录：
  - transaction count 与 transactions/execution；
  - total throughput；
  - first/last half、first/last quartile operation p50/p95；
  - RSS start/max/end；
  - WAL、DB growth；
  - event cursor 连续性与每 execution kind order 抽样；
  - final counters 与 `PRAGMA integrity_check`。
- 所有临时 clone 在报告、Result Review 与哈希校验落盘后按精确 prefix 清理。

## Task 3：决策

Candidate 只有同时满足才可实施：

1. 两次 candidate integrity 均 `ok`，计数、event order、cursor 连续性一致，无 source/schema/durability drift；
2. candidate 相对 control 的 aggregate last-half p95 或 throughput 改善至少 `15%`；
3. 两次 replicate 的主指标方向一致；
4. WAL/DB growth 不发生不可解释的放大，peak RSS 不引入新风险；
5. 候选语义可以用短事务 event batch 表达，不需要跨外部 I/O 持锁。

若不满足：结论 FAIL，禁止 transaction batching source 变更，转向 WAL checkpoint scheduling/commit frame 诊断。

若满足：创建独立 TDD implementation plan 与 Plan Review；先新增 `recordEvents` 原子批量契约、cursor/order/rollback 测试，再最小化改造 `AgentExecutionRunner` 的同步 event 簇。A/B 本身不授权 Attempt005。

## 完成边界

- 不修改 OpenSpec task、Dashboard、正式 Gate D、production promotion 或 archive 状态。
- 不修改 Runtime schema、durability、trace outbox 投递语义或 crash boundary。
- 不预批准 10 分钟 mature regression、Attempt005 或正式 24 小时 Gate D。
