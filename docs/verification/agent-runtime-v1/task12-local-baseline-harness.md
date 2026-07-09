# Task 12A Local Runtime Baseline Harness

Status: `local_verified` (local-only). This evidence covers deterministic local baseline schema, workload seed generation, threshold oracle, hard-fail oracle, and canonical report hash only. It does not represent a formal 24-hour soak, does not close Gate B/Gate D, and does not authorize production SQLite writes or production promotion.

## Scope

- Shared schema contract: [index.ts](file:///Users/elvis/file/develop/opensource/openharness/packages/shared-schema/src/index.ts)
- Shared schema tests: [schema.test.ts](file:///Users/elvis/file/develop/opensource/openharness/packages/shared-schema/test/schema.test.ts)
- Runtime local baseline harness: [localBaseline.ts](file:///Users/elvis/file/develop/opensource/openharness/agent-runtime/src/baseline/localBaseline.ts)
- Runtime local baseline tests: [localBaseline.test.ts](file:///Users/elvis/file/develop/opensource/openharness/agent-runtime/test/localBaseline.test.ts)
- Pre-implementation review: [2026-07-09-task12-local-baseline-preimplementation-review.md](file:///Users/elvis/file/develop/opensource/openharness/docs/review/2026-07-09-task12-local-baseline-preimplementation-review.md)

## Local baseline contract

| Area | Result | Evidence |
|---|---:|---|
| `track` separation | pass | `RuntimeBaselineReportSchema` accepts `track=local` with `result=local_verified` and rejects local `pass`; production `local_verified` is rejected. |
| Workload mix | pass | Shared schema requires `seededConversations`, `concurrency`, and 60/20/15/5 mix fields that sum to 1. |
| Operation seed | pass | `buildDeterministicBaselineWorkload` emits deterministic `operationId`, tenant/user scope, repeated `conversationId`, and operation kind distribution. |
| Hard failures | pass | `evaluateRuntimeBaselineSamples` turns any `hardFailures[]` code into a hard failure row. |
| Sustained breach oracle | pass | Ten 30-second samples are required to represent a 5-minute sustained threshold breach; shorter spikes do not fail. |
| Canonical report hash | pass | `createRuntimeBaselineReport` computes deterministic SHA-256 over canonical sorted JSON excluding `reportHash`. |

## Thresholds

```json
{
  "admissionP95Ms": 100,
  "durableReplayP95Ms": 250,
  "rssBytes": 1610612736,
  "openFileDescriptors": 1024,
  "walBytes": 268435456,
  "mcpChildCount": 2,
  "sustainedBreachMs": 300000
}
```

## TDD evidence

### RED

```bash
/opt/homebrew/bin/pnpm --filter @openharness/shared-schema test -- schema.test.ts
```

Observed RED: `RuntimeBaselineReportSchema` was undefined and the new schema test failed.

```bash
/opt/homebrew/bin/pnpm --filter @openharness/agent-runtime test -- localBaseline
```

Observed RED: `../src/baseline/localBaseline` did not exist and the new runtime test suite failed to load.

### GREEN / regression

```bash
/opt/homebrew/bin/pnpm --filter @openharness/shared-schema test -- schema.test.ts
/opt/homebrew/bin/pnpm --filter @openharness/agent-runtime test -- localBaseline
/opt/homebrew/bin/pnpm --filter @openharness/agent-runtime typecheck
/opt/homebrew/bin/pnpm --filter @openharness/shared-schema typecheck
/opt/homebrew/bin/pnpm --filter @openharness/shared-schema test
/opt/homebrew/bin/pnpm --filter @openharness/agent-runtime test
PATH=/opt/homebrew/bin:$PATH /opt/homebrew/bin/pnpm typecheck
npx openspec validate harden-agent-runtime-single-node-production --strict --no-interactive
```

Observed result:

- Shared schema focused: `49` tests passed.
- Runtime focused baseline: `3` tests passed.
- Shared schema full: `49` tests passed.
- Agent runtime full: `60` files / `297` tests passed when run outside the restricted sandbox because stdio MCP fixture and SSE tests need local IPC/listen permissions.
- Root typecheck: shared-schema, agent-runtime, and frontend all passed.
- OpenSpec validate: change `harden-agent-runtime-single-node-production` is valid; PostHog DNS flush warning is non-blocking telemetry.

## Remaining scope

- This Task 12A slice does not yet run the 30-minute local short baseline workload.
- This slice does not implement real metric sampling from live process RSS/FD/WAL or MCP child process census; it provides injectable schema/oracle primitives for that harness.
- Formal 24-hour soak, production backup/restore rehearsal, production RPO/RTO evidence, and Gate B/Gate D closure remain pending.
