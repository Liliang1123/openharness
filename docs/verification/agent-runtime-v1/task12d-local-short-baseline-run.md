# Task 12D Actual 30-minute Local Short Baseline Run

Status: `local_verified` (local-only). This evidence covers an actual 30-minute deterministic local short baseline run with 60 samples, a minute-15 TS runtime restart hook, 10,000 persisted SQLite conversations, 10,000 executions, and 10,000 runtime events. It does not represent formal 24-hour soak, does not close Gate B/Gate D, and does not authorize production SQLite writes.

## Scope

- Runner execution implementation: [localShortBaselineExecution.ts](file:///Users/elvis/file/develop/opensource/openharness/agent-runtime/src/baseline/localShortBaselineExecution.ts)
- Runner primitives: [localShortBaselineRunner.ts](file:///Users/elvis/file/develop/opensource/openharness/agent-runtime/src/baseline/localShortBaselineRunner.ts)
- Baseline seed / sampler / oracle: [localBaseline.ts](file:///Users/elvis/file/develop/opensource/openharness/agent-runtime/src/baseline/localBaseline.ts)
- Execution tests: [localShortBaselineExecution.test.ts](file:///Users/elvis/file/develop/opensource/openharness/agent-runtime/test/localShortBaselineExecution.test.ts)
- Final baseline report: [2026-07-09-local-short-baseline-v2.json](file:///Users/elvis/file/develop/opensource/openharness/docs/verification/agent-runtime-v1/baseline/2026-07-09-local-short-baseline-v2.json)
- Superseded first attempt: [2026-07-09-local-short-baseline.json](file:///Users/elvis/file/develop/opensource/openharness/docs/verification/agent-runtime-v1/baseline/2026-07-09-local-short-baseline.json)
- Implementation plan: [2026-07-03-agent-runtime-single-node-production-final-plan.md](file:///Users/elvis/file/develop/opensource/openharness/docs/superpowers/plans/2026-07-03-agent-runtime-single-node-production-final-plan.md)
- Active OpenSpec tasks: [tasks.md](file:///Users/elvis/file/develop/opensource/openharness/openspec/changes/harden-agent-runtime-single-node-production/tasks.md)

## Result summary

| Item | Observed |
|---|---:|
| Track | `local` |
| Result | `local_verified` |
| Samples | `60` |
| Sample interval | `30s` |
| Generated at | `2026-07-09T02:25:09.511Z` |
| First sample | `2026-07-09T02:25:39.511Z` |
| Last sample | `2026-07-09T02:55:09.511Z` |
| Restart hook | `{ elapsedMs: 900000, sampleIndex: 29 }` |
| Report hash | `da12fb2fdc458cd4575f23493bd35dcb2ed996c32f017edcbae982e94404cddf` |
| Report file SHA-256 | `4a73980cf7b9687bbfe79a7ed5a5501c764c8371dac20fa115f11fe32464c6bc` |
| Failures | `[]` |

## Threshold audit

| Metric | Observed max / trend | Threshold | Result |
|---|---:|---:|---:|
| admission p95 | `0.8064589998684824ms` | `≤100ms` | pass |
| durable replay p95 | `1.0927500000034343ms` | `≤250ms` | pass |
| RSS | `177668096 bytes` | `≤1610612736 bytes` | pass |
| open FD | `27` | `≤1024` | pass |
| WAL bytes | `6550832 bytes` | `≤268435456 bytes` | pass |
| MCP child count | `0` | `≤2` | pass |
| RSS trend | `-17.904310989284824%` first/last 10-sample median | no upward leak trend | pass |
| FD trend | `0%` first/last 10-sample median | no upward leak trend | pass |

## SQLite persistence audit

The first attempt report was generated before a seed bug was found. The root cause was that `conversationId` collision could repeat within the same tenant/user scope, so SQLite `INSERT OR IGNORE` persisted only `5,000` conversations while executions/events were `10,000`. The bug was fixed in [localBaseline.ts](file:///Users/elvis/file/develop/opensource/openharness/agent-runtime/src/baseline/localBaseline.ts) and covered by [localBaseline.test.ts](file:///Users/elvis/file/develop/opensource/openharness/agent-runtime/test/localBaseline.test.ts). The superseded report remains immutable and is not used as final evidence.

Final v2 audit:

| Table | Rows |
|---|---:|
| conversations | `10000` |
| executions | `10000` |
| runtime_events | `10000` |

## TDD evidence

### RED

```bash
/opt/homebrew/bin/pnpm --filter @openharness/agent-runtime test -- localShortBaselineExecution
```

Observed RED: `../src/baseline/localShortBaselineExecution` did not exist.

```bash
/opt/homebrew/bin/pnpm --filter @openharness/agent-runtime test -- localBaseline
```

Observed RED after first run audit: scoped conversation key uniqueness test failed with `expected 4 to be 8`, proving same-scope conversation collision.

### GREEN / regression

```bash
/opt/homebrew/bin/pnpm --filter @openharness/agent-runtime test -- localBaseline localBaselineSampler localShortBaselineRunner localShortBaselineExecution
/opt/homebrew/bin/pnpm --filter @openharness/agent-runtime typecheck
/opt/homebrew/bin/pnpm --filter @openharness/shared-schema test
/opt/homebrew/bin/pnpm --filter @openharness/shared-schema typecheck
PATH=/opt/homebrew/bin:$PATH /opt/homebrew/bin/pnpm typecheck
/opt/homebrew/bin/pnpm --filter @openharness/agent-runtime test
```

Observed result:

- Task 12 focused: `4` files / `12` tests passed.
- Runtime typecheck: passed.
- Shared schema full: `49` tests passed.
- Root typecheck: shared-schema, agent-runtime, and frontend all passed.
- Agent runtime full: `63` files / `306` tests passed when run outside the restricted sandbox because stdio MCP fixture and SSE tests need local IPC/listen permissions.

## Actual run command

```bash
/opt/homebrew/bin/pnpm --filter @openharness/agent-runtime exec tsx -e '(async () => { const { runLocalThirtyMinuteBaseline } = await import("/Users/elvis/file/develop/opensource/openharness/agent-runtime/src/baseline/localShortBaselineExecution.ts"); const result = await runLocalThirtyMinuteBaseline({ outputPath: "/Users/elvis/file/develop/opensource/openharness/docs/verification/agent-runtime-v1/baseline/2026-07-09-local-short-baseline-v2.json" }); console.log(JSON.stringify({ outputPath: result.outputPath, databasePath: result.databasePath, result: result.report.result, samples: result.report.samples.length, restartEvents: result.restartEvents, reportHash: result.report.reportHash }, null, 2)); })();'
```

Observed output:

```json
{
  "outputPath": "/Users/elvis/file/develop/opensource/openharness/docs/verification/agent-runtime-v1/baseline/2026-07-09-local-short-baseline-v2.json",
  "databasePath": "/var/folders/yg/pjyg7nhj2ln3kg6dks4dxhkc0000gn/T/openharness-local-baseline-Sm88Wn/runtime-baseline.db",
  "result": "local_verified",
  "samples": 60,
  "restartEvents": [
    {
      "elapsedMs": 900000,
      "sampleIndex": 29
    }
  ],
  "reportHash": "da12fb2fdc458cd4575f23493bd35dcb2ed996c32f017edcbae982e94404cddf"
}
```

## Secret scan

```bash
grep -R "OPENHARNESS_SECRET_CANARY\\|sk-\\|Bearer " -n docs/verification/agent-runtime-v1/baseline/2026-07-09-local-short-baseline-v2.json
```

Observed result: no matches.

## Remaining gates

- Gate B remains `pending_production_evidence`; it requires production backup/import/quarantine/restore/RPO/RTO evidence and is not a background job.
- Gate D remains pending formal promotion; this local short baseline is not a 24-hour soak.
- Stage 3 formal 24-hour workload remains out of scope for Task 12D.
