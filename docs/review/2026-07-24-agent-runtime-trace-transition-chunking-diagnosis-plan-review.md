# Agent Runtime Trace Transition Chunking Diagnosis Plan Review

## 结论

通过：允许冻结 production-equivalent 100-row trace transition 与 20-row chunk/yield A/B runner。诊断不调用 Java delivery，但完整复用 claim 与 SQLite transition SQL，并通过真实 lifecycle admission 测量 event-loop 阻塞；本结论不授权 source 变更。

## Review 范围

- [Transition chunking diagnosis plan](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/docs/superpowers/plans/2026-07-24-agent-runtime-trace-transition-chunking-diagnosis.md)
- [Checkpoint ownership Result Review](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/docs/review/2026-07-24-agent-runtime-sqlite-checkpoint-ownership-diagnosis-result-review.md)
- [Trace outbox implementation](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/agent-runtime/src/storage/traceOutbox.ts)
- [Trace outbox dispatcher](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/agent-runtime/src/storage/traceOutboxDispatcher.ts)
- [Trace outbox tests](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/agent-runtime/test/traceOutbox.test.ts)
- [Active OpenSpec design](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/openspec/changes/harden-agent-runtime-single-node-production/design.md)
- [Active Agent Runtime spec](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/openspec/changes/harden-agent-runtime-single-node-production/specs/agent-runtime/spec.md)

## 主要发现

### Critical / High

无。

### Medium

1. Production transition transaction 发生在异步 Java delivery 完成后，随后在 Node 主线程同步执行；因此专用 runner 不需要重复 Java 网络调用，必须保留 claim order、100 outcomes 与真实 repository UPDATE。
2. Candidate 必须在 chunk 之间真实 `setImmediate` yield；仅把 100 updates 切成 5 个同步连续 transactions 而不 yield，仍会连续阻塞 event loop，不能验证 admission 假设。
3. Admission probe 必须执行真实 start transaction，而不只是空 setImmediate delay；这样可同时覆盖排队等待和成熟库 start write。
4. Active spec 的安全单位是 event identity，不是 dispatcher batch。Candidate 可能符合现有规范，但现有“whole delivered batch retryable”测试表明 crash boundary 会变化，实施前必须更新 design 并替换为 chunk-level crash matrix。

### Low

1. Seed 与 performance phase 必须分离，并在 seed 后 checkpoint/truncate，避免 seed checkpoint 污染首批结果。
2. Candidate 多 800 个 commits，drain throughput 允许最多 `20%` 退化；超过即说明降低 admission tail 的代价不可接受。

## 最终建议

runner 应输出完整原始分布而非只输出 percentile，并硬绑定 source/plan/runner/database hash。先做包目录 import、CLI rejection、small-clone functional probe、source binding 与 Preflight Review，再创建/执行成熟 ABBA。

## 后续门禁

- 不修改项目规则、OpenSpec task、Dashboard 或 production source。
- 未通过 Preflight Review 不得执行成熟 ABBA。
- A/B 通过后必须先更新 OpenSpec design/crash boundary，再按 TDD 实施；不得直接进入成熟库 10 分钟回归或 Attempt005。
