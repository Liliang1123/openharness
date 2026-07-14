# Task 13 Formal 24-hour Soak Preflight Harness

Status: `preflight_ready` (local harness only). This evidence covers fixed Gate D start checks, fixed 24-hour schedule construction, three TS Runtime restart hooks, no threshold relaxation checks, compressed-test isolation, and first/last two-hour RSS/FD median growth hard failures. It does not represent a formal 24-hour run, does not close Gate D, and does not authorize production promotion.

## Scope

- Formal soak runner: [formalSoakRunner.ts](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/agent-runtime/src/baseline/formalSoakRunner.ts)
- Formal soak tests: [formalSoakRunner.test.ts](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/agent-runtime/test/formalSoakRunner.test.ts)
- Baseline seed / sampler / oracle: [localBaseline.ts](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/agent-runtime/src/baseline/localBaseline.ts)
- Active OpenSpec tasks: [tasks.md](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/openspec/changes/harden-agent-runtime-single-node-production/tasks.md)
- Approved implementation plan: [2026-07-03-agent-runtime-single-node-production-final-plan.md](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/docs/superpowers/plans/2026-07-03-agent-runtime-single-node-production-final-plan.md)

## Result Summary

| Item | Result |
|---|---|
| Fixed duration | `24h` |
| Sample interval | `30s` |
| Fixed restart schedule | hour `2`, `12`, `22` |
| Workload | `10,000` seeded conversations, `20` concurrency |
| Mix | `60%` no-tool, `20%` Java sandbox, `15%` MCP, `5%` approval/interruption |
| Formal track | `production` only |
| Compressed test track | `local` / `local_verified`; never Gate D evidence |
| Gate D approval required before start | pass |
| Preflight block on missing Java Gateway / fixtures / disk / report path / monitoring / interruption procedure | pass |
| Threshold relaxation guard | pass |
| Custom no-op delay without compressed-test marker | blocked |
| RSS/FD first-vs-last two-hour median growth hard failure | pass |

## TDD Evidence

### RED

```bash
pnpm --filter @openharness/agent-runtime test -- formalSoakRunner
```

Observed RED:

- `../src/baseline/formalSoakRunner` did not exist, so the new test suite failed before implementation.
- After independent review, tests were tightened and failed because custom no-op delay could still produce `track=production` / `result=pass`; the runner now rejects unmarked custom delay and downgrades compressed simulations to `track=local` / `result=local_verified`.

### GREEN / Regression

```bash
pnpm --filter @openharness/agent-runtime test -- formalSoakRunner
pnpm --filter @openharness/agent-runtime test
pnpm --filter @openharness/agent-runtime typecheck
```

Observed result:

- Focused formal soak runner: `1` file / `5` tests passed.
- Agent Runtime full test suite: `64` files / `311` tests passed.
- Agent Runtime typecheck: passed.

## Remaining Gates

- Gate D still requires explicit approval before the real 24-hour run starts.
- Preflight fields are operator-attested inputs, not automatic probes.
- The real run must use the fixed schedule and thresholds without code/config/threshold changes after approval.
- Custom delay is allowed only for compressed test simulation, whose report is local-only.
- Fixed workload operation order is guarded against mutation before start.
- A partial or failed real run must retain its report and must not be promoted.
- OpenSpec task 4.2 and 4.3 remain unchecked until the real 24-hour report exists and passes review.
