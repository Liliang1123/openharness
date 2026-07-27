# Agent Runtime SQLite Checkpoint Ownership Diagnosis Result Review

## 结论

需修改：独立 PASSIVE checkpoint worker 候选在首个 candidate run 触发 `wal_size_limit_exceeded`，违反冻结的 `64 MiB` WAL hard ceiling。按计划停止 Candidate B2 与 Control A2，不形成性能 aggregate，不得实施 checkpoint ownership 变更。

## Review 范围

- [Diagnosis plan](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/docs/superpowers/plans/2026-07-24-agent-runtime-sqlite-checkpoint-ownership-diagnosis.md)
- [Preflight Review](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/docs/review/2026-07-24-agent-runtime-sqlite-checkpoint-ownership-diagnosis-preflight-review.md)
- [Checkpoint A/B runner](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/docs/verification/agent-runtime-v1/gate-d/performance-recovery/gate-r8-20260724-001/run-checkpoint-ownership-ab.ts)
- [PASSIVE checkpoint worker](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/docs/verification/agent-runtime-v1/gate-d/performance-recovery/gate-r8-20260724-001/passive-checkpoint-worker.mjs)
- [Control A1 原始结果](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/docs/verification/agent-runtime-v1/gate-d/performance-recovery/gate-r8-20260724-001/control-a1-result.json)
- [Candidate B1 failure](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/docs/verification/agent-runtime-v1/gate-d/performance-recovery/gate-r8-20260724-001/candidate-b1-failure.json)
- [聚合停止结论](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/docs/verification/agent-runtime-v1/gate-d/performance-recovery/gate-r8-20260724-001/gate-r8-20260724-001-summary.json)
- [Trace outbox dispatch](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/agent-runtime/src/storage/traceOutbox.ts)
- [Trace outbox dispatcher](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/agent-runtime/src/storage/traceOutboxDispatcher.ts)
- [SQLite WAL documentation](https://www.sqlite.org/wal.html)

## 主要发现

### High

1. Candidate B1 运行期 WAL 越过 `67,108,864` bytes 上限，runner 以 `wal_size_limit_exceeded` 阻塞。不得通过提高上限、无限 WAL 或把 shutdown checkpoint 当作运行期 bounded policy 来掩盖失败。
2. Candidate workload 实际完成了全部增量：
   - messages `+16,000`；
   - executions `+8,000`；
   - runtime events `+96,000`；
   - delivered trace `+48,000`；
   - pending trace `0`；
   - close/reopen 后 `integrity_check=ok`。
   但 worker 已在运行中违反 WAL ceiling，因此 runner 没有发出性能 report；这些 post-close 数据只证明恢复正确，不授权把该 run 纳入性能比较。
3. Worker 失败后，关闭最后连接完成 recovery/checkpoint，WAL/SHM sidecar 均消失且无残留 worker/runner 进程。恢复成功不能抵消运行期容量失控。

### Medium

1. Control A1：
   - throughput `88.582867/s`；
   - last-half p95 `5.994875ms`；
   - max `1,922.479166ms`；
   - `>100ms` operations `81`，最长连续 `1`；
   - WAL peak `4,412,552` bytes，shutdown WAL `0`；
   - correctness/integrity 全部通过。
2. `81` 次 `>100ms` 与 runner 固定的 `80` 个 trace ack intervals 近乎一一对应；每个 1,000-operation block 除首段 `11` 次外，其余均为 `10` 次。该 cadence 是“trace acknowledgement write burst 持有 writer lock”的强证据，但仍是推断，需要专用 A/B 证伪。
3. Production [Trace outbox dispatcher](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/agent-runtime/src/storage/traceOutboxDispatcher.ts) 默认 batch size 为 `100`；[dispatchTraceOutboxBatch](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/agent-runtime/src/storage/traceOutbox.ts) 会把一次 batch 的所有 delivered/retry/dead-letter transitions 放入单一 SQLite transaction。这与 Attempt003 admission 约 `100ms`、backlog max `174` 的数量级一致，但需在 production-equivalent 100-row transition workload 上验证。

### Low

1. Candidate B2 与 Control A2 按冻结 stop rule 未执行；不能把中止 ABBA 表述为候选 aggregate 性能失败，只能表述为 WAL safety hard failure。
2. 三份 JSON 均通过解析；summary SHA-256 为 `61965cbe9c76bd3944f032d530e0b37c890720f50ea9f3d6468db16d8fe79a6d`；`git diff --check` 通过。

## 最终建议

1. 放弃独立 checkpoint worker，不修改 [Runtime storage](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/agent-runtime/src/storage/runtimeStorage.ts)。
2. 下一严格诊断改为 trace-outbox transition chunking：
   - Control：一次 100-event outcome transaction；
   - Candidate：保持同一 claim/delivery batch，只把 transition 分为 5 个、每个 20 events 的短 transactions；
   - 同时运行小型 admission probes，记录每个 transition transaction 的 p50/p95/max、admission wait、总 drain throughput、backlog、WAL 与 correctness。
3. 候选必须保持 event-level retry/dead-letter 状态机、at-least-once delivery、最终一致计数和 batch failure semantics；若 chunking 改变“整批原子回滚”契约，必须先明确新的 crash boundary 并进行 crash matrix。

## 后续门禁

- 本次没有修改项目规则、OpenSpec task、Dashboard 或 production source。
- Active OpenSpec change 仍为 `harden-agent-runtime-single-node-production`。
- Trace transition chunking 会改变 durable outbox crash boundary；诊断可以在现有 change 下进行，但实施前必须 Review active design 是否明确要求整批原子回滚。若未覆盖或相冲突，必须先更新 OpenSpec proposal/design 并获批。
- Attempt005、正式 Gate D 24h、promotion 与 archive 继续保持阻塞。
