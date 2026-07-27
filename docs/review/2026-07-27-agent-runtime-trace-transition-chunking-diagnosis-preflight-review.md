# Agent Runtime Trace Transition Chunking Diagnosis Preflight Review

## 结论

通过：允许按 Control A1 → Candidate B1 → Candidate B2 → Control A2 串行创建并执行四个成熟数据库 Gate R9 diagnostics。该结论只授权冻结的 100-row control 与 20-row chunk/yield candidate A/B，不授权 production source 变更、Attempt005、正式 Gate D、production promotion 或 OpenSpec archive。

## Review 范围

- [Transition chunking diagnosis plan](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/docs/superpowers/plans/2026-07-24-agent-runtime-trace-transition-chunking-diagnosis.md)
- [Plan Review](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/docs/review/2026-07-24-agent-runtime-trace-transition-chunking-diagnosis-plan-review.md)
- [Transition A/B runner](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/docs/verification/agent-runtime-v1/gate-d/performance-recovery/gate-r9-20260724-001/run-trace-transition-chunk-ab.ts)
- [Control functional probe](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/docs/verification/agent-runtime-v1/gate-d/performance-recovery/gate-r9-20260724-001/control-probe-result.json)
- [Candidate functional probe](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/docs/verification/agent-runtime-v1/gate-d/performance-recovery/gate-r9-20260724-001/candidate-probe-result.json)
- [Attempt004 mature source](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/docs/verification/agent-runtime-v1/gate-d/performance-recovery/gate-r4-20260724-004/gate-r4-20260724-recovery-004.sqlite)
- [Production trace outbox implementation](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/agent-runtime/src/storage/traceOutbox.ts)
- [Production trace outbox dispatcher](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/agent-runtime/src/storage/traceOutboxDispatcher.ts)
- [Active OpenSpec design](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/openspec/changes/harden-agent-runtime-single-node-production/design.md)
- [Active Agent Runtime spec](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/openspec/changes/harden-agent-runtime-single-node-production/specs/agent-runtime/spec.md)

## 主要发现

### Critical / High

无。

### Medium

1. Runner 将成熟模式冻结为 `200 × 100 = 20,000` 个 deterministic trace events；control 每批一个 transaction，candidate 每批五个 20-row transactions，并在前四个 chunk 后执行真实 `setImmediate` yield。
2. Admission probe 在 transition 前排入 event loop，并执行真实 `RuntimeLifecycleCommands.startExecution` 与 completion；runner 同时验证 admission message/event counter、`agent_start → final_answer → agent_end → stream_done` 顺序和连续 cursor。
3. Runner fail closed 绑定绝对 clone 路径、起始数据库 SHA-256、runner/plan/source-state SHA-256、PRAGMA、WAL `64 MiB` hard ceiling、transaction/yield 数、最终 counter、shutdown TRUNCATE 与 `integrity_check`。
4. Control probe 通过：4 batches、400 events、4 transactions、0 yields；最终 delivered `+400`、pending/retry/dead-letter `0`，WAL peak `638,632` bytes，integrity `ok`。
5. Candidate probe 通过：4 batches、400 events、20 transactions、16 yields；最终 delivered `+400`、pending/retry/dead-letter `0`，WAL peak `1,030,032` bytes，integrity `ok`。
6. Probe 仅证明 runner 协议和安全断言可执行；4-sample latency 不作为成熟 ABBA 的性能结论。

### Low

1. Runner 包目录 import 通过；未知 CLI 参数返回 `invalid_argument_set` 与 exit `2`。
2. 成熟 source 主文件为 `4,092,854,272` bytes，SHA-256 与 Attempt003/R6/R7/R8 绑定一致；source WAL 为 `0` bytes。
3. `git diff --check` 通过；未观察到 Gate R9 runner 或 probe 残留进程。

## 绑定证据

- Runner SHA-256：`756411702c9c2098511dfabc9725acc2eebdbb702c2a2d5c2debf06107aca909`
- Plan SHA-256：`b4b30680df6f324ec4d93603f4253695401bfd0d112ddbe2ebd069fc52bb626b`
- Source state SHA-256：`0aecf1019b7eab0e1ea3eb33e143d33a4fe50e39bf521b6d4a42397d4e877bce`
- 起始数据库 SHA-256：`f4a8e3b227b9947828c19cca45151635e43657e4b1fc22a95e3ff1c2f5a7ec7a`
- Control probe SHA-256：`69767301b91c0e27e68c397869e7963ff9169dba37b4c68779de4e2b2bf042e7`
- Candidate probe SHA-256：`837a0a7243bd99848536d4c0c03ca83778507140612fdd84ea79c2489d72b0f4`

## 最终建议

创建四个 fresh APFS clones，逐个校验 `4,092,854,272` bytes 与冻结 SHA-256 后，严格按 ABBA 顺序串行运行。任一 run 的绑定、WAL、transaction/yield shape、counter、event order、checkpoint 或 integrity assertion 失败时立即停止后续；四个有效 run 完成后才计算 aggregate、replicate 方向和门槛。

## 后续门禁

- 不修改项目规则、OpenSpec task、Dashboard 或 production source。
- Candidate 只有同时满足 admission p95 改善至少 `30%`、`>100ms` 数量减少至少 `80%`、candidate p95 `<=100ms`、replicate 方向一致、drain throughput 退化不超过 `20%` 和全部安全硬约束，才允许进入设计更新。
- A/B 通过后必须先更新 active OpenSpec design 的 event-level chunk commit/crash boundary，再创建独立 TDD implementation plan；不得直接修改 source。
- A/B 未通过时禁止 source 变更，并按计划形成当前单连接/成熟库容量 blocker Review。
