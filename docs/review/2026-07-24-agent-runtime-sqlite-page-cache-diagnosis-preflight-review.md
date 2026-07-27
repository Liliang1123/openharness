# Agent Runtime SQLite Page Cache A/B Diagnosis Preflight Review

## 结论

通过：允许按 Control A1 → Candidate B1 → Candidate B2 → Control A2 串行执行四个 8,000-execution lifecycle diagnostics。结论只授权诊断，不授权 production source 变更。

## Review 范围

- [A/B runner](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/docs/verification/agent-runtime-v1/gate-d/performance-recovery/gate-r6-20260724-001/run-lifecycle-cache-ab.ts)
- [A/B plan](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/docs/superpowers/plans/2026-07-24-agent-runtime-sqlite-page-cache-diagnosis.md)
- [Plan Review](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/docs/review/2026-07-24-agent-runtime-sqlite-page-cache-diagnosis-plan-review.md)
- [Attempt003 Result Review](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/docs/review/2026-07-24-agent-runtime-10m-mature-database-regression-attempt-003-result-review.md)
- [Control A1 clone](file:///private/tmp/openharness-gate-r6.tqeBEN/control-a1.sqlite)
- [Candidate B1 clone](file:///private/tmp/openharness-gate-r6.Q5Loy1/candidate-b1.sqlite)
- [Candidate B2 clone](file:///private/tmp/openharness-gate-r6.d5HaPd/candidate-b2.sqlite)
- [Control A2 clone](file:///private/tmp/openharness-gate-r6.bQWrKo/control-a2.sqlite)

## 主要发现

### Critical / High

无。

### Medium

1. 四个 clone 均为 `4,092,854,272` bytes，SHA-256 均为 `f4a8e3b227b9947828c19cca45151635e43657e4b1fc22a95e3ff1c2f5a7ec7a`。
2. runner 固定 4,000 scopes × 2 rounds、8,000 executions、每 execution 2 messages / 12 events；每 100 executions 批量 ack pending trace，control/candidate transaction 序列一致。
3. candidate 只设置 `cache_size=-65536` 与 `mmap_size=268435456`；runner 会拒绝 synchronous、journal mode、foreign keys、page size、autocheckpoint 漂移。
4. ABBA 用于平衡 APFS clone 共享 host page cache 的顺序效应；每个 run 使用独立 Node/SQLite connection。

### Low

1. 临时卷可用约 `135 GiB`。
2. runner import 与 `git diff --check` 通过。

## 绑定证据

- Runner SHA-256：`bcf77ca97178db7437a779edc87841d1a579aad3cc07c621ab7abd58ba549b4b`
- Plan SHA-256：`651ab938bb6e57fc8ac15e7c034aa3fa4d3b26e2ada2beb259465e796799506b`
- Control/Candidate source、schema、原数据库、iterations、scope 顺序、event/message mix 与 ack interval 相同。

## 最终建议

逐个运行并保留完整单行 JSON stdout；任一 run integrity/counter/pragma failure 立即停止后续。四个 run 完成后计算 replicate aggregate 与方向一致性，再落盘报告和 Result Review。

## 后续门禁

- 不修改项目规则、OpenSpec task 或 Dashboard。
- Candidate aggregate last-half p95 或 throughput 改善不足 10%，不得实施。
- 即使通过，也必须先创建独立 TDD implementation plan，不能直接进入 Attempt005。
