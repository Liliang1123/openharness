# Agent Runtime SQLite Page Cache A/B Diagnosis Plan

> **执行约束：** 串行、无 subagent、无 Git 写操作。先诊断，未通过决策门槛不得修改 production source。

**Goal:** 判断 SQLite 默认约 2 MiB connection page cache / disabled mmap 是否造成成熟 4–5GB、10,000-scope lifecycle 写入的后段吞吐下降。

## Gate 1

- Evidence：[Attempt003 Result Review](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/docs/review/2026-07-24-agent-runtime-10m-mature-database-regression-attempt-003-result-review.md)。
- Observed：admission median `99.623ms`，末段连续超限 6；admission/database-size correlation `0.7480`，admission/execution-throughput correlation `-0.9782`。
- Hypothesis：10,000 scope 的 message/event cursor B-tree working set 超过默认 connection cache，随机 page lookup/insert 随文件增长退化。
- Evidence profile：strict。
- Stop：candidate 不满足门槛、改变 durability/schema、integrity 失败、RSS 风险过高，立即放弃，不进入 source 实施。

## Task 1：可复现 A/B runner

- Create：[A/B runner](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/docs/verification/agent-runtime-v1/gate-d/performance-recovery/gate-r6-20260724-001/run-lifecycle-cache-ab.ts)
- 使用真实 `RuntimeLifecycleCommands`、repositories 与成熟 clone。
- 每个 run 固定 4,000 scopes × 2 rounds，共 8,000 executions；每 execution 写 2 messages、12 runtime events，trace/non-trace mix 固定，并周期性批量 ack trace rows。
- Control：现有 Runtime pragmas。
- Candidate：额外设置 `cache_size=-65536`（64 MiB）与 `mmap_size=268435456`（256 MiB）。
- 两侧保持 `journal_mode=WAL`、foreign keys、wal_autocheckpoint、synchronous、schema 与 transaction 数量相同。

## Task 2：ABBA 执行

- 创建四个 fresh APFS clones，全部与 Attempt004 main SHA-256 一致。
- 顺序：Control A1 → Candidate B1 → Candidate B2 → Control A2。
- 每次独立 Node process/SQLite connection；记录：
  - total throughput；
  - first/last half、first/last quartile operation p50/p95；
  - RSS start/max/end；
  - WAL、DB growth；
  - observed pragmas；
  - final counters 与 `PRAGMA integrity_check`。
- 所有临时 clone 在报告落盘后按精确 prefix 清理。

## Task 3：决策

Candidate 只有同时满足才可实施：

1. 两次 candidate integrity 均 `ok`、计数一致、无 source/schema/durability drift；
2. candidate 相对 control 的 aggregate last-half p95 或 throughput 改善至少 10%；
3. candidate 两次结果方向一致；
4. peak RSS 增量可解释且不会威胁 `1.5 GiB` Gate 阈值。

若不满足：结论 FAIL，转向 lifecycle event transaction batching 诊断。

若满足：创建独立 TDD implementation plan；本 A/B 本身不授权源码变更或 Attempt005。

## 完成边界

不修改 OpenSpec task、Dashboard、正式 Gate D、production promotion 或 archive 状态。
