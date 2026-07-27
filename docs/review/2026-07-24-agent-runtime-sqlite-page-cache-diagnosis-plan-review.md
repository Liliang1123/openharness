# Agent Runtime SQLite Page Cache A/B Diagnosis Plan Review

## 结论

通过：ABBA 设计能在不修改 production source 的前提下检验 bounded cache/mmap 假设，并以 10% material improvement 和 RSS 安全性作为实施门槛。

## Review 范围

- [A/B plan](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/docs/superpowers/plans/2026-07-24-agent-runtime-sqlite-page-cache-diagnosis.md)
- [Attempt003 Result Review](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/docs/review/2026-07-24-agent-runtime-10m-mature-database-regression-attempt-003-result-review.md)
- [Runtime SQLite configuration](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/agent-runtime/src/storage/runtimeStorage.ts)
- [Lifecycle commands](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/agent-runtime/src/storage/lifecycleCommands.ts)

## 主要发现

### Critical / High

无。

### Medium

1. APFS clones 共享底层 page cache，单次 A→B 顺序会偏向后运行者；ABBA 顺序用于平衡该影响。
2. diagnostic 必须查询并记录实际 `synchronous`、`cache_size`、`mmap_size`，防止候选意外改变 durability。
3. trace rows 必须周期性批量 ack，避免 control/candidate 被非生产式无限 backlog 主导。

### Low

1. 直接 lifecycle benchmark 不等于 HTTP Gate；即使 A/B 通过，仍需 TDD 实施、全量验证和成熟库短回归。

## 最终建议

按同一 runner、相同计数和 fresh clone 执行 ABBA；报告保留各 run 原始分段数据与 aggregate，不只保留平均值。

## 后续门禁

- 不修改项目规则。
- 不需要新增 OpenSpec proposal；诊断仍属于 active change 的性能收口。
- A/B 结果必须落盘 Review；未通过不得实施。
