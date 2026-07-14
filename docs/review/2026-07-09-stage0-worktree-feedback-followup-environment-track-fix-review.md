# Stage 0 Worktree Feedback Follow-up Environment Track Fix Review

## 结论

通过：已闭合 [feedback follow-up re-verification](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/docs/review/2026-07-09-stage0-worktree-feedback-followup-reverification.md) 中残留的 Medium 问题。压缩 formal soak 报告现在同时写入顶层 `track="local"` 与 `environment.track="local"`，不会再在同一份 compressed simulation report 内混入 `environment.track="production"`。这只修复本地压缩证据的一致性，不关闭 Gate B/C/D，也不改变 Stage 0 完成状态。

## Review 范围

- [feedback follow-up re-verification](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/docs/review/2026-07-09-stage0-worktree-feedback-followup-reverification.md)
- [formalSoakRunner.ts](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/agent-runtime/src/baseline/formalSoakRunner.ts)
- [formalSoakRunner.test.ts](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/agent-runtime/test/formalSoakRunner.test.ts)
- [task13-formal-soak-preflight-harness.md](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/docs/verification/agent-runtime-v1/task13-formal-soak-preflight-harness.md)
- [active change tasks.md](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/openspec/changes/harden-agent-runtime-single-node-production/tasks.md)

## 主要发现

### Pass - RED reproduced the review finding

Added a regression assertion that compressed simulations must expose `environment.track="local"`. Before the fix, `pnpm --filter @openharness/agent-runtime test -- formalSoakRunner` failed with actual `environment.track="production"`, proving the review finding was real and specifically located in report environment construction.

### Pass - Runtime report track fields are now aligned

[formalSoakRunner.ts](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/agent-runtime/src/baseline/formalSoakRunner.ts) now writes `track: reportTrack` inside the report `environment` after spreading the config environment. Formal non-compressed runs still resolve to `production`; compressed test simulations resolve to `local`.

### Pass - Gate semantics unchanged

This patch does not relax `assertFixedTwentyFourHourSoakStartAllowed`, fixed duration, restart schedule, workload, thresholds, preflight, or Gate D approval checks. It only removes inconsistent report metadata from compressed local evidence.

### Pass - Failure report path is also covered

The resource-growth failure test now asserts `environment.track="local"` for compressed local reports that end with `result="fail"`. This is test-only coverage for the same report construction path and does not change runtime behavior.

### Important - Stage 0 remains incomplete

The current [active change tasks.md](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/openspec/changes/harden-agent-runtime-single-node-production/tasks.md) status remains `16/30`. Keep 2.1, 2.3, 2.4, 2.5, and 4.4 checked; keep 2.6/2.7, 3.1/3.2, 4.2/4.3, 4.5/4.6, and 5.x pending.

## 验证记录

RED:

```bash
pnpm --filter @openharness/agent-runtime test -- formalSoakRunner
```

Observed failure before implementation: `expected environment.track local, received production`.

GREEN and regression:

```bash
pnpm --filter @openharness/agent-runtime test -- formalSoakRunner
pnpm --filter @openharness/agent-runtime typecheck
pnpm test
pnpm typecheck
mvn -f backend/pom.xml test
npx openspec validate --all --strict --no-interactive
pnpm dashboard:check
```

Observed result:

- Focused formal soak runner: `1` file / `5` tests passed.
- Agent Runtime typecheck: passed.
- Full repository tests: shared schema `49` tests, Agent Runtime `64` files / `311` tests, frontend `24` tests, integration `17` tests passed.
- Full repository typecheck: passed.
- Backend Maven suite: `45` tests passed.
- OpenSpec strict validation: `23` items passed, `0` failed; PostHog DNS flush warning did not affect exit code.
- Dashboard check: passed, generated outputs current.
- Follow-up focused verification after failure-path assertion: formal soak runner `1` file / `5` tests passed; Agent Runtime typecheck passed; `git diff --check` passed; review path check found `18` `file:///` links, `0` missing, `0` bare local paths.

## 最终建议

接受该补丁并保留五个 local/docs checkbox。下一步仍应推进 Gate B 生产证据，或在用户显式批准后推进 Gate C/Gate D；不要将本补丁解读为 Stage 0 完成、Gate D 通过、Runtime v1 freeze 或 OpenClacky parity Stage 1-9 可启动。

## 后续门禁

- 需要 OpenSpec proposal：否，属于已批准 active change 内的窄修复。
- 需要 TDD：已完成，RED/GREEN 已观察。
- 需要人工审批：是，Gate B/C/D 仍需独立审批。
- 是否修改项目规则：否。
