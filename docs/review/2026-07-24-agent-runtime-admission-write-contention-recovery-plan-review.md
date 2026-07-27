# Agent Runtime Admission 写竞争恢复计划 Review

## 结论

**通过。** 计划以最小事务拓扑变更直接处理 60 分钟证据确认的 admission 写竞争，不改变外部契约、outbox 状态机、retry policy、retention、workload 或阈值；可以按 TDD 执行。

## Review 范围

- [Admission 写竞争恢复计划](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/docs/superpowers/plans/2026-07-24-agent-runtime-admission-write-contention-recovery.md)
- [60 分钟结果 Review](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/docs/review/2026-07-24-agent-runtime-60m-recovery-result-review.md)
- [trace outbox implementation](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/agent-runtime/src/storage/traceOutbox.ts)
- [trace outbox tests](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/agent-runtime/test/traceOutbox.test.ts)
- [Runtime database transaction](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/agent-runtime/src/storage/runtimeStorage.ts)
- [active OpenSpec design](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/openspec/changes/harden-agent-runtime-single-node-production/design.md)

## 主要发现

### Critical

无。

### Important

无未关闭项。

### 通过依据

1. 生产证据已把失败限定为 admission sustained breach，其他固定 gate 全部通过。
2. 当前代码的逐 event `database.transaction()` 与 307 万 delivered trace 是直接可复核的高频 `BEGIN IMMEDIATE` 来源。
3. transaction batching 保持每个 repository transition 的原 SQL 与条件，只改变事务分组。
4. Java delivery 仍在 transaction 外并发执行；不会在持锁期间等待网络。
5. Java 已记录、batch ack 尚未提交时崩溃，仍按既有 at-least-once 语义重投相同 committed event identity。
6. batch transaction 失败不会返回部分成功 report；SQLite rollback 保持未确认 rows 可重试。
7. TDD 同时覆盖混合成功/失败 outcome、bounded concurrency、retry timestamp 和 transaction count，能防止“只优化成功路径”。

### Advisory

单批 transaction 内最多执行 100 条 indexed update；它缩短的是 transaction acquisition/commit 次数，不改变总 row update 数。新固定回归仍是是否真正恢复 admission 的唯一准入证据。

## 最终建议

按计划先增加 transaction count RED，再实现 outcome collection + single transition transaction。任何需要修改 batch size、concurrency、retry、retention、schema 或 Java contract 的发现都应停止并重新做 OpenSpec 边界判断。

## 后续门禁

- **OpenSpec proposal：** 当前不需要新增。
- **Superpowers plan：** 当前计划已批准执行。
- **测试：** focused、full、typecheck、backend、OpenSpec、dashboard 与独立 Review 全部必需。
- **人工审批：** 本地实现不需要；正式 Gate D promotion 门禁不变。
- **归档：** 不得归档 active change。
