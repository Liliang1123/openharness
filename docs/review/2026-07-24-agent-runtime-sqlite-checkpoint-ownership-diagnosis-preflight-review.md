# Agent Runtime SQLite Checkpoint Ownership Diagnosis Preflight Review

## 结论

通过：允许按 Control A1 → Candidate B1 → Candidate B2 → Control A2 串行执行四个 8,000-execution checkpoint ownership diagnostics。该结论只授权冻结 A/B，不授权 production source 变更、crash qualification、成熟库短回归或 Attempt005。

## Review 范围

- [Checkpoint A/B runner](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/docs/verification/agent-runtime-v1/gate-d/performance-recovery/gate-r8-20260724-001/run-checkpoint-ownership-ab.ts)
- [PASSIVE checkpoint worker](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/docs/verification/agent-runtime-v1/gate-d/performance-recovery/gate-r8-20260724-001/passive-checkpoint-worker.mjs)
- [Diagnosis plan](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/docs/superpowers/plans/2026-07-24-agent-runtime-sqlite-checkpoint-ownership-diagnosis.md)
- [Plan Review](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/docs/review/2026-07-24-agent-runtime-sqlite-checkpoint-ownership-diagnosis-plan-review.md)
- [Control A1 clone](file:///private/tmp/openharness-gate-r8.ZCYfGY/control-a1.sqlite)
- [Candidate B1 clone](file:///private/tmp/openharness-gate-r8.yAZ72r/candidate-b1.sqlite)
- [Candidate B2 clone](file:///private/tmp/openharness-gate-r8.1Y78ta/candidate-b2.sqlite)
- [Control A2 clone](file:///private/tmp/openharness-gate-r8.rO6AeZ/control-a2.sqlite)
- [Attempt004 mature source](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/docs/verification/agent-runtime-v1/gate-d/performance-recovery/gate-r4-20260724-004/gate-r4-20260724-recovery-004.sqlite)
- [SQLite WAL documentation](https://www.sqlite.org/wal.html)
- [SQLite checkpoint pragma documentation](https://www.sqlite.org/pragma.html#pragma_wal_checkpoint)

## 主要发现

### Critical / High

无。

### Medium

1. 四个 clone 与成熟 source 均为 `4,092,854,272` bytes，SHA-256 均为 `f4a8e3b227b9947828c19cca45151635e43657e4b1fc22a95e3ff1c2f5a7ec7a`。
2. Candidate worker 使用独立 worker thread、独立 better-sqlite3 connection、`execArgv: []`，防止父进程 `--import tsx` 污染 worker module resolution；runner 要求 PASSIVE attempts 大于 `1`，从而排除“只在 shutdown 前做一次 final PASSIVE”的假阳性。
3. Candidate 主 connection 与 worker connection 均显式保持 WAL、`synchronous=NORMAL`；主 connection 唯一差异为 autocheckpoint `0`，worker 以同一 `1,000` frames threshold、`25ms` NOOP poll 触发 PASSIVE。
4. worker 小库协议 probe 通过：
   - ready：WAL / synchronous `1` / autocheckpoint `0`；
   - `19` 次 NOOP polls、`3` 次 PASSIVE、busy `0`；
   - maximum backlog `1,130` frames、maximum WAL `8,507,832` bytes；
   - shutdown TRUNCATE 成功，final WAL `0` bytes，worker exit `0`。
5. Control shutdown probe 使用真实 `openRuntimeDatabase` 后，`PRAGMA wal_checkpoint(TRUNCATE)` 返回 busy/log/checkpointed 全 `0`。

### Low

1. runner 包目录 import、无参数 `invalid_argument_set` exit `2` 与 `git diff --check` 通过。
2. 脱离项目 tsconfig 的单文件静态检查只观察到既有 [shared-schema](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/packages/shared-schema/src/index.ts) Zod 类型噪声，没有 runner 文件错误。
3. SQLite runtime version 为 `3.53.2`，compile option 为 `THREADSAFE=2`。

## 绑定证据

- Runner SHA-256：`30ad9a2012969610c858ecfbc0d9ae8648e2b50272de486ed71242cd188d7630`
- Worker SHA-256：`f5a97573e86011994a0f37c21d1438b7ada149037a7dae97ad7414bce2b11290`
- Plan SHA-256：`9ce6f98a4768fa9cf9d88c1b2499ca9614f04c66214eccab6e43ac1e4e0faf64`
- Source state SHA-256：`177958470736e6c96b66779cda1fb5d17863190b05d726971c000f868b7b135c`
- 起始数据库 SHA-256：`f4a8e3b227b9947828c19cca45151635e43657e4b1fc22a95e3ff1c2f5a7ec7a`

## 最终建议

严格按 ABBA 顺序逐个运行并保留完整单行 JSON stdout。任一 run 的 hash、worker protocol、WAL ceiling、transaction count、event order、counter、pragma、shutdown truncate 或 integrity assertion 失败时立即停止后续；四个有效 run 完成后再计算 aggregate 与 replicate 方向。

## 后续门禁

- 不修改项目规则、OpenSpec task、Dashboard 或 production source。
- Candidate 未达到 aggregate last-half p95 `>=20%` 或 throughput `>=15%` 改善，不得进入 crash/reopen qualification。
- 即使 A/B 通过，也必须先完成 bounded-WAL crash/reopen qualification；本 Preflight 不批准实现、成熟库 10 分钟回归、Attempt005 或正式 Gate D。
