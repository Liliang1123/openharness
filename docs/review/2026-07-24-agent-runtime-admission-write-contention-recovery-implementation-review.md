# Agent Runtime Admission 写竞争恢复实现 Review

## 结论

**通过。** 本次实现把同一 trace outbox dispatch batch 的 delivered、retry 与 dead-letter 状态迁移收敛为一次 SQLite transaction，直接消除了“每个 event 一次 `BEGIN IMMEDIATE`”的高频写锁竞争来源；实现没有改变外部 API、SQLite schema、delivery status、retry policy、retention、batch size 或 delivery concurrency，可以进入新的真实恢复回归。

本结论仅批准该实现进入后续验证，不等同于 `local_verified`，也不替代正式 24 小时 Gate D 与 post-result promotion 审批。

## Review 范围

- [Admission 写竞争恢复计划](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/docs/superpowers/plans/2026-07-24-agent-runtime-admission-write-contention-recovery.md)
- [计划 Review](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/docs/review/2026-07-24-agent-runtime-admission-write-contention-recovery-plan-review.md)
- [trace outbox 实现](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/agent-runtime/src/storage/traceOutbox.ts)
- [trace outbox 测试](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/agent-runtime/test/traceOutbox.test.ts)
- [dispatcher 默认值与生命周期](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/agent-runtime/src/storage/traceOutboxDispatcher.ts)
- [durable outbox OpenSpec delta](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/openspec/changes/harden-agent-runtime-single-node-production/specs/agent-runtime/spec.md)

## 主要发现

### Critical

无。

### Important

无未关闭项。

### 通过依据

1. Java delivery workers 只执行当前状态读取、per-event header 构造与 `postTrace` 网络调用，并返回 discriminated outcome；网络等待未进入 SQLite transaction。
2. 全批 delivery 完成后，所有有效 outcomes 才在一次 `database.transaction()` 中依次调用原有 `markAcknowledged`、`markRetry` 或 `markDeadLettered`。
3. transaction 成功后才汇总并返回 processed、delivered、retried、deadLettered 与 readinessDegraded，避免数据库提交失败时报告虚假成功。
4. transaction 抛错会让整个 dispatch promise reject；SQLite rollback 保留未确认 rows，dispatcher 后续按相同 committed event identity 重投，因此既有 at-least-once crash window 与 Java 幂等要求不变。
5. 混合结果测试锁定五个 events 仅一次 state-transition transaction，同时保持 delivered 4 / retried 1、并发上限 2 与 retry timestamp。
6. 新增 transaction failure 测试锁定“一次 transaction 尝试、Java 已见两条、dispatch reject、两条 rows 均保持 pending/attempts 0”的失败语义。
7. dispatcher 默认值仍为 batch size `100`、delivery concurrency `20`、max attempts `5`、retry delay `1000ms`；本次没有修改这些参数。
8. focused suite 已通过 7 files / 80 tests；workspace tests 已通过 729 tests（shared 60、Runtime 628、Frontend 24、Integration 17）；Java backend 已通过 208 tests；TypeScript typecheck、OpenSpec strict、dashboard check 与 `git diff --check` 均已通过。最终新增的 transaction-failure 测试之后又单独复跑 trace outbox 5/5、Runtime typecheck 与 `git diff --check`，均通过。

### Advisory

1. SQLite 单写者仍需执行同样数量的 indexed row updates；本实现降低 transaction acquisition/commit 次数，但是否恢复 admission latency 必须由新一轮固定真实负载验证。
2. low-disk/WAL production wiring 与 Java trace sink 的长期容量风险是独立未完成项，不能由本次 Review 推断为已解决。

## 最终建议

保留当前最小实现。先按已批准 OpenSpec 契约补齐 low-disk/WAL monitor 的 production wiring，再用同一最终源状态执行一次新的固定 60 分钟真实恢复回归，避免每个独立修复后重复运行一小时。

任何 batch size、concurrency、retry、retention、schema、Java trace contract 或 workload/threshold 变更，都必须停止当前实施并重新做 OpenSpec 边界判断。

## 后续门禁

- **OpenSpec proposal：** transaction batching 不需要新增 proposal；low-disk/WAL wiring 已属于 active change 的批准范围。
- **Superpowers plan：** low-disk/WAL wiring 必须另建单次可执行计划并完成计划 Review。
- **测试：** storage monitor 单元测试、production lifecycle/admission 测试、完整回归和一次新的固定 60 分钟真实恢复回归。
- **人工审批：** 本地实现与本地恢复回归不需要；正式 Gate D start approval 与 post-result promotion approval 仍不可预授权。
- **归档：** 当前不得归档 active change，也不得同步 dashboard 为 `verified`。
