# Task 13 Formal Soak Preflight Harness Review

## 结论

有风险：本轮在已批准的 [harden-agent-runtime-single-node-production](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/stage0-runtime-production-closeout/openspec/changes/harden-agent-runtime-single-node-production) 范围内补齐了正式 24 小时 soak 的可执行 harness / preflight / TDD 证据；但这只是 Gate D 启动前工程能力补强，不是正式 24 小时运行结果，不能勾选 OpenSpec 4.2 或 4.3，也不能进入 Runtime v1 freeze / archive。

## Review 范围

- [formalSoakRunner.ts](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/stage0-runtime-production-closeout/agent-runtime/src/baseline/formalSoakRunner.ts)
- [formalSoakRunner.test.ts](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/stage0-runtime-production-closeout/agent-runtime/test/formalSoakRunner.test.ts)
- [task13-formal-soak-preflight-harness.md](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/stage0-runtime-production-closeout/docs/verification/agent-runtime-v1/task13-formal-soak-preflight-harness.md)
- [active change tasks.md](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/stage0-runtime-production-closeout/openspec/changes/harden-agent-runtime-single-node-production/tasks.md)
- [approved implementation plan](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/stage0-runtime-production-closeout/docs/superpowers/plans/2026-07-03-agent-runtime-single-node-production-final-plan.md)

## 主要发现

### Pass — Gate D start is now code-gated

`runFixedTwentyFourHourSoak` calls `assertFixedTwentyFourHourSoakStartAllowed` before sampling. The assertion rejects missing Gate D approval, missing preflight, blocked preflight, non-production track, non-24-hour duration, non-30-second sampling, changed restart schedule, changed `10,000 / 20` workload, changed deterministic workload operations, changed `60/20/15/5` mix, changed thresholds, and unmarked custom delay.

### Pass — Preflight has explicit blocked reasons

The preflight validates operator-attested Java Gateway, deterministic fixtures, disk headroom, report path, monitoring, and interruption procedure fields. Missing items produce stable failure codes, which makes the later human Gate D review auditable instead of relying on prose. It is not an automatic environment probe.

### Pass — Formal schedule and resource-growth oracle are covered by TDD

The test suite verifies the fixed hour `2`, `12`, and `22` restart hooks under a compressed local simulation, verifies unmarked no-op delay cannot produce Gate D evidence, and verifies first/last two-hour RSS/FD median growth over `10%` becomes hard report failure.

### Important — This does not close Gate D

No real 24-hour run was started. OpenSpec 4.2 and 4.3 must remain pending until explicit Gate D approval exists, the real run completes under unchanged thresholds, and the final report passes review.

## 验证记录

```bash
pnpm --filter @openharness/agent-runtime test -- formalSoakRunner
pnpm --filter @openharness/agent-runtime test
pnpm --filter @openharness/agent-runtime typecheck
```

Observed result:

- Focused formal soak runner: `1` file / `5` tests passed.
- Agent Runtime full test suite: `64` files / `311` tests passed.
- Agent Runtime typecheck: passed.

## 最终建议

保留本实现作为 Task 13 启动前条件。不要勾选 4.2、4.3、5.x；下一步只能在用户明确批准 Gate D 后运行真实 24 小时 soak，并在完成后重新 review 报告与阈值。

## 后续门禁

- 需要 OpenSpec proposal：否，本轮属于已批准 active change 内的 Task 13 harness/preflight。
- 需要 TDD：已完成，RED/GREEN 见 [task13-formal-soak-preflight-harness.md](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/stage0-runtime-production-closeout/docs/verification/agent-runtime-v1/task13-formal-soak-preflight-harness.md)。
- 需要人工审批：是，Gate D 开始真实 24 小时运行前仍需显式审批。
- 需要 Superpowers plan：已有 [approved implementation plan](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/stage0-runtime-production-closeout/docs/superpowers/plans/2026-07-03-agent-runtime-single-node-production-final-plan.md)。
- 是否修改项目规则：否。
