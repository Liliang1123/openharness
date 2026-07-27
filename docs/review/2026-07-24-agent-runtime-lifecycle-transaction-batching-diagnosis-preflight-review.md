# Agent Runtime Lifecycle Transaction Batching Diagnosis Preflight Review

## 结论

通过：允许按 Control A1 → Candidate B1 → Candidate B2 → Control A2 串行执行四个 8,000-execution lifecycle transaction diagnostics。该结论只授权冻结 A/B，不授权 production source 变更、成熟库短回归或 Attempt005。

## Review 范围

- [Transaction A/B runner](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/docs/verification/agent-runtime-v1/gate-d/performance-recovery/gate-r7-20260724-001/run-lifecycle-transaction-ab.ts)
- [Diagnosis plan](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/docs/superpowers/plans/2026-07-24-agent-runtime-lifecycle-transaction-batching-diagnosis.md)
- [Plan Review](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/docs/review/2026-07-24-agent-runtime-lifecycle-transaction-batching-diagnosis-plan-review.md)
- [Control A1 clone](file:///private/tmp/openharness-gate-r7.osn2L1/control-a1.sqlite)
- [Candidate B1 clone](file:///private/tmp/openharness-gate-r7.6NR5rb/candidate-b1.sqlite)
- [Candidate B2 clone](file:///private/tmp/openharness-gate-r7.55sV62/candidate-b2.sqlite)
- [Control A2 clone](file:///private/tmp/openharness-gate-r7.J1xzXK/control-a2.sqlite)
- [Attempt004 mature source](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/docs/verification/agent-runtime-v1/gate-d/performance-recovery/gate-r4-20260724-004/gate-r4-20260724-recovery-004.sqlite)

## 主要发现

### Critical / High

无。

### Medium

1. 四个 clone 与成熟 source 均为 `4,092,854,272` bytes，SHA-256 均为 `f4a8e3b227b9947828c19cca45151635e43657e4b1fc22a95e3ff1c2f5a7ec7a`。
2. runner 固定 control 每 execution `10` 次 lifecycle transactions，candidate 每 execution `4` 次；housekeeping trace ack transaction 独立执行且不计入该计数。
3. Candidate 只把 8 个同步相邻 events 分为两个 4-event batch，每个 batch 内一次 cursor reservation；start/completion 保持真实 `RuntimeLifecycleCommands`，没有跨外部 I/O 持锁。
4. runner 会硬断言 transaction count、2 messages / 12 events、6 delivered trace events、pending trace `0`、三处 execution event kind order、cursor 连续性、pragmas、source binding 与 `integrity_check`。

### Low

1. runner 从 [Agent Runtime package](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/agent-runtime) 目录使用 `node --import tsx` 导入通过；无参数调用按预期以 exit `2`、`invalid_argument_set` 拒绝。
2. 从仓库根目录直接解析 `tsx` 会失败，属于已在 Gate R5 Attempt001 证明的 cwd 约束；ABBA 命令固定从 Agent Runtime package 目录运行。
3. 脱离项目 tsconfig 的单文件 `tsc` 只观察到既有 [shared-schema](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/packages/shared-schema/src/index.ts) Zod 类型噪声，没有 runner 文件错误；真实包 import 与 `git diff --check` 均通过。
4. 临时卷可用约 `135 GiB`。

## 绑定证据

- Runner SHA-256：`afe8c504f0a249fbbd663f75c167e43f6d95181f64ad5d0793d840e771027875`
- Plan SHA-256：`bb249202dcfab98e4244f5510112f80570c268c4d0b67ac6c03ba56655315cd6`
- Source state SHA-256：`177958470736e6c96b66779cda1fb5d17863190b05d726971c000f868b7b135c`
- 起始数据库 SHA-256：`f4a8e3b227b9947828c19cca45151635e43657e4b1fc22a95e3ff1c2f5a7ec7a`

## 最终建议

严格按 ABBA 顺序逐个运行并保留完整单行 JSON stdout。任一 run 的 hash、transaction count、event order、counter、pragma 或 integrity assertion 失败时立即停止后续；四个有效 run 完成后计算 aggregate 与 replicate 方向，再落盘 Result Review。

## 后续门禁

- 不修改项目规则、OpenSpec task、Dashboard 或 production source。
- Candidate aggregate last-half p95 或 throughput 改善不足 `15%`，或 replicate 方向不一致，不得实施。
- 即使通过，也必须先创建独立 TDD implementation plan 与 Plan Review；本 Preflight 不批准成熟库 10 分钟回归、Attempt005 或正式 Gate D。
