# Agent Runtime 固定 60 分钟恢复回归结果 Review

## 结论

**需修改。** attempt 003 完成 120/120 固定样本、真实 Java/production Runtime/MCP/SQLite 链路、最终 integrity、冻结哈希和敏感信息扫描；持久化正确性、readiness、trace outbox、replay、RSS、FD、WAL 与 MCP child gate 均通过。唯一失败是 `admissionP95Ms` 连续 5 分钟以上超过 100 ms。当前实现不能晋升为本地 `local_verified`，应在现有 OpenSpec change 内先消除 trace acknowledgement 的逐事件写事务竞争，再执行新的固定回归。

## Review 范围

- [attempt 003 plan](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/docs/superpowers/plans/2026-07-24-agent-runtime-60m-recovery-regression-attempt-003.md)
- [attempt 003 preflight Review](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/docs/review/2026-07-24-agent-runtime-60m-recovery-attempt-003-plan-review.md)
- [attempt 003 report](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/docs/verification/agent-runtime-v1/gate-d/performance-recovery/gate-r4-20260724-003/gate-r4-20260724-recovery-003-report.json)
- [attempt 003 journal](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/docs/verification/agent-runtime-v1/gate-d/performance-recovery/gate-r4-20260724-003/gate-r4-20260724-recovery-003-journal.jsonl)
- [attempt 003 SQLite](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/docs/verification/agent-runtime-v1/gate-d/performance-recovery/gate-r4-20260724-003/gate-r4-20260724-recovery-003.sqlite)
- [attempt 003 Java log](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/docs/verification/agent-runtime-v1/gate-d/performance-recovery/gate-r4-20260724-003/java-gateway-18084.log)
- [trace outbox dispatcher batch](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/agent-runtime/src/storage/traceOutbox.ts)
- [SQLite transaction boundary](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/agent-runtime/src/storage/runtimeStorage.ts)
- [trace outbox tests](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/agent-runtime/test/traceOutbox.test.ts)
- [active OpenSpec design](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/openspec/changes/harden-agent-runtime-single-node-production/design.md)

## 主要发现

### Critical

无数据完整性、安全、隔离、dead-letter 或进程泄漏 Critical。

### Important

1. **Admission sustained failure。** 120 个样本中 96 个超过 100 ms；最长连续越线 95 个样本。首 10 样本 admission p95 median 为 `76.668 ms`，末 10 为 `191.831 ms`，全程 median `144.157 ms`、max `384.584 ms`。report 唯一 failure 为 `SUSTAINED_THRESHOLD_BREACH(admissionP95Ms)`。
2. **逐事件 acknowledgement 写锁竞争。** 60 分钟产生 `3,070,352` 个 delivered trace。当前 `dispatchTraceOutboxBatch()` 在并发 Java POST 成功后为每个 event 单独调用 `database.transaction()`；每次 transaction 都执行 `BEGIN IMMEDIATE`。这意味着约 307 万个 acknowledgement 写事务与 execution admission 的 lifecycle transaction 竞争同一单写者。
3. **当前 batching 只覆盖读取，不覆盖状态提交。** claim 已按 100 条批量、Java delivery 已限制 concurrency 20，但 delivered/retry/dead-letter transition 仍逐条获取写事务，抵消了批量 claim 的主要写锁收益。

### 已通过的 gate

- duration `3,600,266.946 ms`，120/120 samples，`runComplete=true`；
- source start/end SHA 完全相同，runner/plan/MCP config SHA 与 preflight 一致；
- SQLite final integrity `ok`；
- durable replay p95 median `153.542 ms`、max `425.887 ms`，22 个单点越线但最长连续仅 2，未形成 sustained failure；
- Runtime RSS max `1,257,619,456 bytes`（约 1,199 MiB），低于 1.5 GiB；
- FD max `136`，低于 1,024；
- WAL max `12,347,672 bytes`，低于 256 MiB；
- MCP child max `1`；
- trace backlog median `40.5`、max `195`、末值 `119`，retry max `0`、dead-letter max `0`；
- formal-incremental oracle median `92.608 ms`、max `443.505 ms`、末值 `46.117 ms`，无 oracle hard failure；
- report/journal/约 1.85 GB Java log 的 exact token、Bearer、`sk-`、canary 与 credential pattern 负向扫描通过；
- Runtime/MCP/Java 全部清理，`18084`、`3102` 已释放。

### Advisory

1. SQLite main 达 `4,090,228,736 bytes`，runtime event 高水位 `6,147,454`；Java log 增长 `1,849,536,286 bytes`。这证明正式 24 小时前仍必须复核 low-disk/WAL production wiring 与 Java trace sink 的容量边界。
2. Java `TraceService` 当前将 trace 保留在内存并逐条写 stdout；它不是本次 Runtime admission failure 的唯一已证实原因，但对 24 小时 Java 存活和磁盘容量是独立风险。
3. 一次 production-sized acknowledgement timing microbenchmark 已执行，但控制面未保留 stdout；本 Review 不引用、也不重复该无效 timing 结果，根因依据只使用可复核 report、SQLite counts 和代码 transaction topology。

## 最终建议

执行 [admission write-contention recovery plan](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/docs/superpowers/plans/2026-07-24-agent-runtime-admission-write-contention-recovery.md)：

1. Java delivery 保持 bounded concurrency；
2. worker 只产生 delivered/retry/dead-letter outcome，不在 worker 内开启事务；
3. 所有有效 outcomes 在一次 `database.transaction()` 中按现有 repository transition 提交；
4. batch transaction 失败时整个 dispatch 调用失败，未确认 rows 保持可重试，允许既有 at-least-once duplicate window；
5. 不修改 schema、status、API、batch size、concurrency、retry/dead-letter 阈值或正式性能阈值。

## 后续门禁

- **OpenSpec proposal：** 不需要新增；修复保持现有 durable outbox at-least-once 与状态语义，是 active `harden-agent-runtime-single-node-production` change 内的等价事务合并。
- **Superpowers plan：** 必须先通过 [新计划 Review](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/docs/review/2026-07-24-agent-runtime-admission-write-contention-recovery-plan-review.md) 再改代码。
- **测试：** TDD 必须先证明多 event 当前产生多个 transaction，再证明混合 delivered/retry/dead-letter outcomes 只使用一个 transition transaction；随后执行 focused、全量、OpenSpec、dashboard 和新的固定真实回归。
- **人工审批：** 本地实现/验证不需要额外审批；正式 24 小时 Gate D 与结果 promotion 仍受既有人工门禁约束。
- **归档：** active OpenSpec change 不得归档，task 4.2/4.3/4.5/4.6/5.2/5.3/5.4 不得勾选。
- **项目规则：** 本 Review 未修改项目规则。
