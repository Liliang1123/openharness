# Task 12C Deterministic Local Short Baseline Runner

Status: `local_verified` runner-prepared (local-only). This evidence covers deterministic runner primitives that connect workload seed, sampler, report schema, restart hook, and no-overwrite report writer. It does not prove that the 30-minute baseline has been executed, does not represent formal 24-hour soak, and does not close Gate B/Gate D.

## Scope

- Pre-implementation review: [2026-07-09-task12c-local-short-baseline-runner-preimplementation-review.md](file:///Users/elvis/file/develop/opensource/openharness/docs/review/2026-07-09-task12c-local-short-baseline-runner-preimplementation-review.md)
- Runner implementation: [localShortBaselineRunner.ts](file:///Users/elvis/file/develop/opensource/openharness/agent-runtime/src/baseline/localShortBaselineRunner.ts)
- Baseline schema / sampler implementation: [localBaseline.ts](file:///Users/elvis/file/develop/opensource/openharness/agent-runtime/src/baseline/localBaseline.ts)
- Runner tests: [localShortBaselineRunner.test.ts](file:///Users/elvis/file/develop/opensource/openharness/agent-runtime/test/localShortBaselineRunner.test.ts)
- Baseline oracle tests: [localBaseline.test.ts](file:///Users/elvis/file/develop/opensource/openharness/agent-runtime/test/localBaseline.test.ts)
- Sampler tests: [localBaselineSampler.test.ts](file:///Users/elvis/file/develop/opensource/openharness/agent-runtime/test/localBaselineSampler.test.ts)
- Implementation plan progress: [2026-07-03-agent-runtime-single-node-production-final-plan.md](file:///Users/elvis/file/develop/opensource/openharness/docs/superpowers/plans/2026-07-03-agent-runtime-single-node-production-final-plan.md)

## Runner contract

| Capability | Result | Evidence |
|---|---:|---|
| Default 30-minute config | pass | `createThirtyMinuteLocalBaselineConfig` defaults to 30 minutes, 30-second samples, minute-15 restart, 10,000 seeded conversations, and 20 concurrency. |
| Compressed deterministic test run | pass | `runDeterministicLocalShortBaseline` supports short injected `durationMs` and `sampleIntervalMs` so tests do not wait 30 minutes. |
| Seed + sampler + report schema wiring | pass | Runner passes deterministic workload to sampler and returns a validated `RuntimeBaselineReport`. |
| Restart hook | pass | Runner invokes `onRestart` once at configured `restartAtMs`; test validates compressed minute-15 equivalent. |
| Stable hash | pass | Repeated deterministic runner inputs produce an identical report and report hash. |
| No-overwrite report writer | pass | `writeRuntimeBaselineReport` rejects existing files by default and only overwrites with `overwrite=true`. |

## TDD evidence

### RED

```bash
/opt/homebrew/bin/pnpm --filter @openharness/agent-runtime test -- localShortBaselineRunner
```

Observed RED: `../src/baseline/localShortBaselineRunner` did not exist, so the runner test suite failed to load.

### GREEN / regression

```bash
/opt/homebrew/bin/pnpm --filter @openharness/agent-runtime test -- localShortBaselineRunner
/opt/homebrew/bin/pnpm --filter @openharness/agent-runtime test -- localBaseline localBaselineSampler localShortBaselineRunner
/opt/homebrew/bin/pnpm --filter @openharness/agent-runtime typecheck
/opt/homebrew/bin/pnpm --filter @openharness/shared-schema test
/opt/homebrew/bin/pnpm --filter @openharness/shared-schema typecheck
PATH=/opt/homebrew/bin:$PATH /opt/homebrew/bin/pnpm typecheck
/opt/homebrew/bin/pnpm --filter @openharness/agent-runtime test
```

Observed result:

- Runner focused: `1` file / `3` tests passed.
- Task 12 focused baseline: `3` files / `10` tests passed.
- Agent runtime typecheck: passed.
- Shared schema full: `49` tests passed.
- Root typecheck: shared-schema, agent-runtime, and frontend all passed.
- Agent runtime full: `62` files / `304` tests passed when run outside the restricted sandbox because stdio MCP fixture and SSE tests need local IPC/listen permissions.

## Remaining scope

- The actual 30-minute local baseline has not been executed.
- The minute-15 TS restart is represented by a runner hook; a real process restart still requires the execution environment to wire the hook to a runtime process manager.
- OpenSpec Stage 3 4.0/4.1 remain unchecked until an actual deterministic local short baseline report exists.
- Gate B remains pending production backup/import/quarantine/restore/RPO/RTO evidence.
- Gate D remains pending short baseline review plus later formal 24-hour soak evidence.
