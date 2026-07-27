# Agent Runtime Trace Transition Chunking Diagnosis Plan

> **执行约束：** OpenSpec 精简模式，strict evidence profile；串行、无 subagent、无 Git 写操作。先诊断，未通过门槛不得修改 production source。

**Goal:** 验证 production trace outbox 一次 100-event outcome transaction 是否阻塞 Node event loop 并造成成熟库 admission 尾延迟；判断 20-event 短事务 + event-loop yield 是否能在保持 drain capacity 与 event-level at-least-once 语义下消除该阻塞。

## Gate 1

- Evidence：[Checkpoint ownership Result Review](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/docs/review/2026-07-24-agent-runtime-sqlite-checkpoint-ownership-diagnosis-result-review.md)。
- Control evidence：8,000 operations 中 `81` 次 `>100ms`，而诊断固定存在 `80` 个 trace ack intervals；每个 1,000-operation block 除首段 `11` 次外均为 `10` 次。
- Production shape：
  - [TraceOutboxDispatcher](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/agent-runtime/src/storage/traceOutboxDispatcher.ts) 默认 batch size `100`。
  - [dispatchTraceOutboxBatch](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/agent-runtime/src/storage/traceOutbox.ts) 在 Java delivery 完成后，把本批所有 transitions 放入一个 `BEGIN IMMEDIATE` transaction，逐条执行 `markAcknowledged` / retry / dead-letter。
- OpenSpec boundary：
  - [Active design](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/openspec/changes/harden-agent-runtime-single-node-production/design.md) 与 [Agent Runtime spec](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/openspec/changes/harden-agent-runtime-single-node-production/specs/agent-runtime/spec.md) 要求 event-level durable outbox、at-least-once、idempotent Java ingest、retry/dead-letter；没有要求多个 event acknowledgement 整批原子提交。
  - [现有单测](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/agent-runtime/test/traceOutbox.test.ts) 对整批回滚的断言是当前实现行为，不高于 spec。
- Hypothesis：100-row transition transaction 的同步锁持有/SQL 执行直接阻塞 admission；每 20 rows commit 并 `setImmediate` yield，可把单次 event-loop block 压到 `<=100ms`，而总 drain throughput 仍足够覆盖当前 backlog。

## Task 1：冻结 transition A/B runner

- Create：[Transition A/B runner](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/docs/verification/agent-runtime-v1/gate-d/performance-recovery/gate-r9-20260724-001/run-trace-transition-chunk-ab.ts)。
- 从成熟 clone 中先创建 `200` 个 deterministic batches，每批 `100` 个 pending trace events，共 `20,000` rows；seed 阶段不计入性能。
- Seed 后执行 `wal_checkpoint(TRUNCATE)`，校验 pending `20,000`、dead-letter `0`、integrity `ok`，再开始计时。
- 每个 batch：
  1. 用真实 `claimOutbox(..., limit=100)` 读取 exactly 100；
  2. 在 transition 前用 `setImmediate` 排队一个真实 `RuntimeLifecycleCommands.startExecution` admission，并在记录 admission wait+start latency 后完成该 execution；
  3. Control：100 个 `markAcknowledged` 在一个 transaction 内完成；
  4. Candidate：按 20 rows 分成 5 个 transactions，每个 chunk 后（最后一个除外）`await setImmediate`；
  5. 记录 admission、单 transaction block、整批 drain duration。
- 两侧保持 event rows、claim order、ack SQL、WAL/synchronous/cache/mmap、admission lifecycle、最终计数完全相同；唯一差异为 transition transaction boundary + chunk 间 yield。

## Task 2：安全与性能度量

记录：

- 200 个 admission latency p50/p95/max、`>100ms` 数量、最长连续；
- transition transaction p50/p95/max；
- transition batch p50/p95/max；
- acknowledged events/second 与总 elapsed；
- transaction count：control `200`，candidate `1,000`；
- WAL peak/final、RSS、DB growth；
- pending/delivered delta、重复/遗漏、sample status；
- admission execution message/event/order/cursor；
- shutdown checkpoint 与 `PRAGMA integrity_check`。

硬约束：

1. 每批 claim exactly 100，所有 event identity 唯一且最终 exactly once transition 为 delivered；
2. final pending/retry `0`，delivered `+20,000`，dead-letter 不增加；
3. admission executions 全部 completed，message/event counter 与顺序正确；
4. journal/synchronous/cache/mmap/schema/source 无 drift，WAL peak `<=64 MiB`，shutdown WAL `0`；
5. Candidate transaction count/chunk size/yield count 与冻结值一致。

## Task 3：ABBA 与决策

- 创建四个 fresh APFS mature clones。
- 顺序：Control A1 → Candidate B1 → Candidate B2 → Control A2。
- Candidate 只有同时满足才可实施：
  1. aggregate admission p95 改善至少 `30%`；
  2. aggregate `>100ms` admission 数减少至少 `80%`，且 candidate admission p95 `<=100ms`；
  3. 两次 replicate 的 admission p95 与 `>100ms` 方向一致；
  4. aggregate drain throughput 退化不超过 `20%`；
  5. transition/WAL/counter/order/integrity 硬约束全部通过。
- 未通过：禁止 source 变更；把 Attempt003 admission 记录为当前单连接/成熟库容量边界，停止继续无证据微调并形成最终 blocker Review。
- 通过：先更新 active OpenSpec design，明确 event-level chunk commit/crash boundary；再创建独立 TDD implementation plan。

## 实施前必需 crash boundary

若 candidate 通过，实施前必须明确并测试：

- crash 在 chunk 之间：已提交 event 不重投，未提交 event 保持 pending/retry 并在 restart 重投；
- crash 在 chunk transaction 内：该 chunk 全回滚；
- Java 已记录但本地未 ack：允许同 identity 重投，由 Java 幂等去重；
- 任一 chunk transition 失败：函数抛错，dispatcher 后续重试未提交 rows，已提交 rows不得回退。

## 禁止项与完成边界

- 禁止减小 delivery batch/并发来伪造低 backlog，禁止丢弃/采样 trace，禁止改变 retry/dead-letter policy。
- 不修改 OpenSpec task、Dashboard、production source、正式 Gate D、promotion 或 archive。
- 所有临时 clone 在结果与 Review 落盘后按精确 prefix 清理。
