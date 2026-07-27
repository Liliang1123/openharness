# Agent Runtime SQLite Checkpoint Ownership Diagnosis Plan

> **执行约束：** OpenSpec 精简模式，strict evidence profile；串行、无 subagent、无 Git 写操作。先诊断，未通过门槛不得修改 production source。

**Goal:** 判断 `wal_autocheckpoint=1000` 在提交线程执行 PASSIVE checkpoint，是否是成熟 4GB SQLite admission 尾延迟的主因；验证由独立 worker connection 承担相同 1,000-frame threshold 的 bounded PASSIVE checkpoint 是否能稳定移除尖峰。

## Gate 1

- Evidence：[Transaction batching Result Review](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/docs/review/2026-07-24-agent-runtime-lifecycle-transaction-batching-diagnosis-result-review.md)。
- Observed：transactions/execution 从 `10` 降到 `4` 后，last-half p50 改善 `25.5481%`，但 p95 退化 `12.3636%`；四组 max 仍约 `0.98–1.25s`。
- SQLite version：`3.53.2`，compile option `THREADSAFE=2`。
- 官方语义：
  - [SQLite WAL 文档](https://www.sqlite.org/wal.html) 说明默认跨过阈值的 COMMIT 会在同一线程执行 checkpoint，偶发 COMMIT 因而显著变慢；可以关闭 autocheckpoint 并由独立线程/进程执行。
  - [SQLite wal_checkpoint 文档](https://www.sqlite.org/pragma.html#pragma_wal_checkpoint) 说明 PASSIVE 不等待 reader/writer，且不会调用 busy handler；返回 log/checkpointed frame 计数。
- Hypothesis：保持 WAL、`synchronous=NORMAL` 与 1,000-frame policy 不变，只把 checkpoint I/O/sync 从 Runtime event-loop/commit thread 移到独立 worker，可降低 operation/admission tail；若不能，则 checkpoint 不是足够解释。
- Stop：任何 source/schema/durability drift、checkpoint worker error、WAL 不受限、integrity/counter/order 失败或候选不达门槛，立即停止。

## Task 1：冻结 checkpoint worker 与 A/B runner

- Create：[Checkpoint worker](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/docs/verification/agent-runtime-v1/gate-d/performance-recovery/gate-r8-20260724-001/passive-checkpoint-worker.mjs)。
- Create：[Checkpoint A/B runner](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/docs/verification/agent-runtime-v1/gate-d/performance-recovery/gate-r8-20260724-001/run-checkpoint-ownership-ab.ts)。
- Workload 与 Gate R7 control 完全一致：4,000 scopes × 2 rounds、8,000 executions、每 execution 2 messages / 12 runtime events、10 lifecycle transactions、每 100 executions ack trace。
- Control：
  - main connection `wal_autocheckpoint=1000`；
  - 不启动 worker。
- Candidate：
  - main connection `wal_autocheckpoint=0`；
  - 独立 Node worker thread + 独立 better-sqlite3 connection；
  - 每 `25ms` 用 `wal_checkpoint(NOOP)` 观测 frame backlog；达到 `1,000` frames 时执行 `wal_checkpoint(PASSIVE)`；
  - worker 不执行 application SQL，不使用 FULL/RESTART/TRUNCATE 参与运行期 checkpoint。
- 两侧在 workload 计时结束后执行一次 shutdown `TRUNCATE` checkpoint，并记录 duration/result；shutdown checkpoint 不计入 throughput。

## Task 2：度量与安全断言

每个 run 记录：

- total throughput；
- first/last half、quartile p50/p95/max；
- operations `>100ms` 数量与最长连续数；
- transaction count/累计/最大 duration；
- WAL peak/final bytes；
- candidate NOOP polls、PASSIVE attempts、duration、busy/log/checkpointed/backlog max；
- shutdown TRUNCATE duration/result；
- event order/cursor sample、message/execution/event/trace counter；
- pragmas、RSS、DB growth 与 `PRAGMA integrity_check`。

硬约束：

1. Candidate 必须精确保持 10 lifecycle transactions/execution；
2. worker PASSIVE 不得出现异常，WAL peak `<=64 MiB`，shutdown TRUNCATE 必须成功并将 WAL 降为 `0` bytes；
3. 两侧最终计数、event order、cursor、integrity、journal mode、foreign keys、synchronous、page cache/mmap 一致；
4. Candidate 唯一允许的运行期差异是 main connection autocheckpoint `0` + 独立 worker ownership。

## Task 3：ABBA 与决策

- 从 [Attempt004 成熟主库](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/docs/verification/agent-runtime-v1/gate-d/performance-recovery/gate-r4-20260724-004/gate-r4-20260724-recovery-004.sqlite) 创建四个 fresh APFS clones。
- 顺序：Control A1 → Candidate B1 → Candidate B2 → Control A2。
- Candidate 只有同时满足才可进入 crash/reopen qualification：
  1. aggregate last-half p95 改善至少 `20%`，或 throughput 改善至少 `15%`；
  2. 两次 candidate 主指标方向一致；
  3. aggregate `>100ms` operations 不高于 control，且 max latency 不恶化超过 `10%`；
  4. checkpoint/WAL/正确性硬约束全部通过。
- 未通过：结论 FAIL，禁止 checkpoint ownership source 变更；基于结果决定是调优现有 autocheckpoint threshold，还是把 Attempt003 的 `~100ms` 视为当前单节点成熟库容量边界并停止无证据优化。
- 通过：追加独立 crash/reopen + bounded-WAL qualification；通过后才能创建 OpenSpec design delta（如需要）与 TDD implementation plan。

## 禁止项

- 禁止 `synchronous=OFF`、rollback/memory journal、丢弃/采样 durable events、停用 trace outbox、无限 WAL、运行期 FULL/RESTART/TRUNCATE checkpoint。
- 禁止把 diagnostic worker 直接复制进 production。
- 禁止预批准 10 分钟 mature regression、Attempt005、正式 24 小时 Gate D、promotion 或 archive。

## 完成边界

不修改 OpenSpec task、Dashboard、production source 或项目规则。所有临时 clone 在结果、Review 与哈希落盘后按精确 prefix 清理。
