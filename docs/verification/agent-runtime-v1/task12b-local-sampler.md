# Task 12B Local Runtime Sampler

Status: `local_verified` (local-only). This evidence covers local sampler/report runner primitives for Task 12 metrics. It does not run the 30-minute baseline, does not represent formal 24-hour soak, does not close Gate B/Gate D, and does not authorize production SQLite writes.

## Scope

- Pre-implementation review: [2026-07-09-task12b-local-sampler-preimplementation-review.md](file:///Users/elvis/file/develop/opensource/openharness/docs/review/2026-07-09-task12b-local-sampler-preimplementation-review.md)
- Baseline harness implementation: [localBaseline.ts](file:///Users/elvis/file/develop/opensource/openharness/agent-runtime/src/baseline/localBaseline.ts)
- Sampler tests: [localBaselineSampler.test.ts](file:///Users/elvis/file/develop/opensource/openharness/agent-runtime/test/localBaselineSampler.test.ts)
- Baseline oracle tests: [localBaseline.test.ts](file:///Users/elvis/file/develop/opensource/openharness/agent-runtime/test/localBaseline.test.ts)
- Implementation plan progress: [2026-07-03-agent-runtime-single-node-production-final-plan.md](file:///Users/elvis/file/develop/opensource/openharness/docs/superpowers/plans/2026-07-03-agent-runtime-single-node-production-final-plan.md)

## Local sampler contract

| Metric / invariant | Result | Evidence |
|---|---:|---|
| Admission p95 | pass | `collectRuntimeBaselineSample` computes p95 from injected admission latency measurements. |
| Durable replay p95 | pass | `collectRuntimeBaselineSample` computes p95 from injected replay latency measurements. |
| RSS | pass | Defaults to `process.memoryUsage().rss`; tests inject deterministic RSS. |
| Open FD count | pass | Defaults to `/proc/self/fd` or `/dev/fd`; tests inject deterministic FD count. |
| WAL bytes | pass | Runs `PRAGMA wal_checkpoint(PASSIVE)` when a database probe is provided, then measures `*-wal` bytes. |
| MCP child count | pass | Supports deterministic injected count/function for later harness binding. |
| SQLite integrity | pass | Runs `PRAGMA integrity_check`; non-`ok` returns `SQLITE_INTEGRITY_FAILURE`. |
| Duplicate operation IDs | pass | Duplicate deterministic operation IDs return `DUPLICATE_OPERATION_ID`. |
| Event ordering | pass | Non-monotonic cursor ordering per tenant/user/conversation returns `EVENT_ORDERING_FAILURE`. |
| Cross-scope leakage | pass | Explicit visible tenant/user mismatch returns `CROSS_SCOPE_LEAKAGE`; intentional `conversationId` collision alone is not treated as leakage. |
| Secret canary leakage | pass | `OPENHARNESS_SECRET_CANARY` in inspected text returns `SECRET_CANARY_LEAK`. |

## TDD evidence

### RED

```bash
/opt/homebrew/bin/pnpm --filter @openharness/agent-runtime test -- localBaselineSampler
```

Observed RED:

- Initial sampler tests failed because `collectRuntimeBaselineSample` was not exported.
- Invariant test failed because duplicate operation, ordering, and scope-leakage hard failures were not implemented.

### GREEN / regression

```bash
/opt/homebrew/bin/pnpm --filter @openharness/agent-runtime test -- localBaseline localBaselineSampler
/opt/homebrew/bin/pnpm --filter @openharness/agent-runtime typecheck
/opt/homebrew/bin/pnpm --filter @openharness/shared-schema test
/opt/homebrew/bin/pnpm --filter @openharness/shared-schema typecheck
PATH=/opt/homebrew/bin:$PATH /opt/homebrew/bin/pnpm typecheck
/opt/homebrew/bin/pnpm --filter @openharness/agent-runtime test
```

Observed result:

- Baseline focused tests: `2` files / `7` tests passed.
- Agent runtime typecheck: passed.
- Shared schema full: `49` tests passed.
- Root typecheck: shared-schema, agent-runtime, and frontend all passed.
- Agent runtime full: `61` files / `301` tests passed when run outside the restricted sandbox because stdio MCP fixture and SSE tests need local IPC/listen permissions.

## Remaining scope

- Task 12C must still assemble the deterministic local short baseline runner and produce the actual short baseline report.
- Task 12C must still run the 30-minute baseline with one TS restart at minute 15 if local environment permits.
- Formal 24-hour soak, production backup/restore rehearsal, production RPO/RTO evidence, and Gate B/Gate D closure remain pending.
