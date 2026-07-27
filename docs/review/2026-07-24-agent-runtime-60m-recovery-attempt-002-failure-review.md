# Agent Runtime 60 分钟恢复回归 attempt 002 失败 Review

## 结论

**需修改。** attempt 002 已成功启动 production Runtime、通过 authenticated readiness、完成精确 10,000 scopes seed 并产出一个真实样本；production 指标、formal-incremental oracle、SQLite integrity、outbox 与 dead-letter 均正常。停止原因是证据 runner 对 trace partial index 的两条强制索引统计 SQL 缺少完整 partial predicate，属于本地观察器缺陷，不是 Runtime 实现失败。允许以修正后的新 runner、新 runId 和新证据目录执行 attempt 003。

## Review 范围

- [attempt 002 delta plan](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/docs/superpowers/plans/2026-07-24-agent-runtime-60m-recovery-regression-attempt-002.md)
- [attempt 002 preflight Review](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/docs/review/2026-07-24-agent-runtime-60m-recovery-attempt-002-plan-review.md)
- [attempt 002 report](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/docs/verification/agent-runtime-v1/gate-d/performance-recovery/gate-r4-20260724-002/gate-r4-20260724-recovery-002-report.json)
- [attempt 002 journal](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/docs/verification/agent-runtime-v1/gate-d/performance-recovery/gate-r4-20260724-002/gate-r4-20260724-recovery-002-journal.jsonl)
- [attempt 002 SQLite](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/docs/verification/agent-runtime-v1/gate-d/performance-recovery/gate-r4-20260724-002/gate-r4-20260724-recovery-002.sqlite)
- [attempt 002 Java log](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/docs/verification/agent-runtime-v1/gate-d/performance-recovery/gate-r4-20260724-002/java-gateway-18084.log)
- [attempt 002 runner](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/docs/verification/agent-runtime-v1/gate-d/performance-recovery/gate-r4-20260724-001/run-60m-recovery-regression.ts)
- [trace outbox migration](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/agent-runtime/src/storage/runtimeStorage.ts)

## 主要发现

### Critical

无。

### Important

1. **partial-index predicate 不完整。** runner 强制 `INDEXED BY runtime_event_trace_outbox`，但 pending/retry 子查询只写单值 equality；索引定义的 predicate 是 `kind='trace' AND delivery_status IN ('pending','retry')`。SQLite 不做该 equality 对 partial predicate 的蕴含推导，因此返回 `no query solution`。
2. **错误分类过宽。** runner 将 cursor、outbox snapshot 与 database stat 放在同一 catch，最终只记录 `DATABASE_EVIDENCE_PROBE_FAILURE`；逐项只读复核才定位到 outbox snapshot SQL。

### 已验证事实

- Runtime child 达到 `runtime_started`，seed 精确为 10,000 scopes；
- 首样本 admission p95 `90.716 ms`、durable replay p95 `120.975 ms`、RSS `395 MiB`、FD `93`、WAL `9 MiB`，都在固定阈值内；
- formal-incremental 七类 probe 全部完成，无 oracle hard failure；首批读取 218,225 个 event rows，oracle 总耗时约 `452.469 ms`；
- SQLite `PRAGMA integrity_check` 返回 `ok`；
- trace pending、retry、dead-letter 的修正后只读查询均返回 `0`；
- 修正后的查询 `EXPLAIN QUERY PLAN` 明确使用 `runtime_event_trace_outbox`；
- attempt 002 Runtime/MCP/Java 已清理，`18084`、`3102` 已释放；
- report 正确为 `fail`，没有被晋升或覆盖。

## 最终建议

生成 attempt 003 runner，只对 pending/retry 两个子查询补回完整 `delivery_status IN ('pending','retry')` predicate，再叠加各自 equality；其他代码保持字节级相同。继续从 `agent-runtime` cwd 执行，使用全新 runId、SQLite、report、journal、Java log 和 MCP config。attempt 001/002 保持不可变失败证据。

## 后续门禁

- **OpenSpec proposal：** 不需要；修正的是本地证据观察器 SQL，不改变 production schema、API 或运行时行为。
- **Superpowers plan：** 必须创建 attempt 003 delta plan 与 preflight Review。
- **测试：** attempt 002 真实 SQLite 已完成 RED（旧查询 `no query solution`）与 GREEN（新查询使用目标 partial index并返回 0）；attempt 003 仍需完整 preflight 和 120-sample 回归。
- **人工审批：** 本地重试不需要 production promotion 审批。
- **归档：** active OpenSpec change 不得归档，attempt 002 不得标记为通过。
