# Agent Runtime Admission Performance Diagnosis Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build and execute a local-only, no-overwrite Gate R1 diagnostic harness that identifies the primary cause of Gate D admission/replay degradation without changing formal Gate D thresholds, workload, report schema, or production behavior.

**Architecture:** Reuse the reviewed Gate D HTTP transport, 10,000-conversation deterministic workload, 20-worker driver, production Runtime child, Java fixtures, and MCP fixture. Add observation-only timing around the existing database oracle and a separate local diagnostic runner with three mutually exclusive variants: `full-oracle`, `incremental-oracle`, and `workload-only`. The offline profiler uses one diagnostic-only `/usr/bin/sqlite3` child and one `mode=ro&immutable=1` URI connection; it never falls back to the production `better-sqlite3` driver or a plain readonly path. Every diagnostic artifact is explicitly `track: "local"`, cannot parse as formal Gate D evidence, is mode-0600/no-overwrite, and uses a fresh database.

**Tech Stack:** TypeScript 5.8, Node.js 20 `spawnSync`, fixed system `/usr/bin/sqlite3`, Vitest, Fastify, existing production `better-sqlite3`, pnpm, Java Gateway deterministic fixtures, MCP stdio.

---

## Execution Contract

- Approved OpenSpec: [harden-agent-runtime-single-node-production proposal](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/openspec/changes/harden-agent-runtime-single-node-production/proposal.md), [design](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/openspec/changes/harden-agent-runtime-single-node-production/design.md), and [tasks](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/openspec/changes/harden-agent-runtime-single-node-production/tasks.md).
- Governing recovery decision: [Gate D recovery final plan](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/docs/review/2026-07-16-agent-runtime-gate-d-recovery-final-plan.md).
- Failure baseline: [Gate D attempt 002 failure Review](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/docs/review/2026-07-16-agent-runtime-gate-d-attempt-002-failure-review.md) and [immutable partial report](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/docs/verification/agent-runtime-v1/gate-d/gate-d-20260716-002/partial-report.json).
- Evidence profile: `strict`; capability profile: `control-plane-high` for diagnosis and decision, `cohesive-medium` for implementation.
- Worktree: continue only in [the existing feature worktree](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/). Do not create a second worktree and do not use `main`.
- Git authority: this plan authorizes no `git add`, commit, push, merge, tag, reset, clean, or worktree cleanup.
- Production authority: this plan authorizes no formal Gate D start, no OpenSpec archive, and no Dashboard state transition.
- Immutable artifacts: never open the [attempt 002 SQLite artifact](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/docs/verification/agent-runtime-v1/gate-d/gate-d-20260716-002/runtime.sqlite) in write mode. Offline profiling must pass its percent-encoded SQLite URI `file:...?mode=ro&immutable=1` as the filename argument to fixed `/usr/bin/sqlite3`; plain paths, plain readonly connections, `better-sqlite3` URI attempts, and all fallbacks are forbidden.
- Task 5 implementation-method approval: on `2026-07-17` the user explicitly approved the diagnostic-only system `sqlite3` extension. This approval changes only the profiler implementation method in [gateDPerformanceDiagnostics.ts](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/agent-runtime/src/baseline/gateDPerformanceDiagnostics.ts) and [gateDPerformanceDiagnostics.test.ts](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/agent-runtime/test/gateDPerformanceDiagnostics.test.ts). It authorizes no npm dependency, package/lockfile edit, production SQLite driver change, deployment prerequisite, persistence semantic change, actual attempt profile, 30-minute run, Gate D, Git publication, archive, merge, tag, or cleanup.
- OpenSpec decision: no new OpenSpec is required because the revision closes the existing strict immutable-input requirement without changing public/operator behavior, production storage, formal evidence, workload, or persistence lifecycle. Any need to leave the two approved files, add a dependency, modify deployment/production behavior, or relax immutable semantics is a stop condition and requires a new scope/OpenSpec decision.

## Non-Goals

- Do not fix outbox wiring, event retention, session-detail pagination, indexes, or formal oracle queries in this plan.
- Do not change `admissionP95Ms ≤ 100ms`, `durableReplayP95Ms ≤ 250ms`, 24 hours, 30-second sampling, 10,000 conversations, 20 concurrency, or 60/20/15/5 mix.
- Do not change public APIs, shared schemas, SQLite migrations, persistence lifecycle, or formal Gate D report validation.
- Do not add an npm/native dependency, change package or lockfiles, invoke a PATH-selected `sqlite3`, use a shell, or make system `sqlite3` a production/runtime dependency. It is a diagnostic-only local capability checked at profiler invocation.
- Do not claim the local 30-minute runs are Gate D evidence or a release qualification.

## Planned Files

- Modify [formalSoakExecution.ts](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/agent-runtime/src/baseline/formalSoakExecution.ts): add observation-only query timing and an explicit local diagnostic oracle mode while preserving `formal-full` as the constructor default and the only mode used by `executeGateDProductionSoak`.
- Create [gateDPerformanceDiagnostics.ts](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/agent-runtime/src/baseline/gateDPerformanceDiagnostics.ts): local report types, diagnostic-only single-child `/usr/bin/sqlite3` immutable offline profiler, diagnostic runner, percentile/slope analysis, no-overwrite writer.
- Create [gateDPerformanceDiagnosticCli.ts](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/agent-runtime/src/baseline/gateDPerformanceDiagnosticCli.ts): fail-closed `profile`, `run`, and `analyze` commands.
- Modify [agent-runtime package.json](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/agent-runtime/package.json): add `diagnostic:gate-d-performance` only.
- Create [gateDPerformanceDiagnostics.test.ts](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/agent-runtime/test/gateDPerformanceDiagnostics.test.ts): report, timing, mode isolation, CLI, and analyzer tests.
- Modify [formalSoakExecution.test.ts](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/agent-runtime/test/formalSoakExecution.test.ts): prove default formal behavior and formal executor invariants remain unchanged.
- Modify [formalSoakRuntimeChild.ts](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/agent-runtime/src/baseline/formalSoakRuntimeChild.ts): parse and forward an optional diagnostic expected database identity.
- Modify [server.ts](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/agent-runtime/src/server.ts), [productionRuntimeContext.ts](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/agent-runtime/src/storage/productionRuntimeContext.ts), and [runtimeStorage.ts](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/agent-runtime/src/storage/runtimeStorage.ts): propagate and enforce the optional identity before any write-capable SQLite statement.
- Modify [runtimeStorage.test.ts](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/agent-runtime/test/runtimeStorage.test.ts): prove matching identity initialization and mismatch-before-write behavior.
- Create evidence only under [Gate R1 evidence directory](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/docs/verification/agent-runtime-v1/gate-d/performance-recovery/gate-r1/).
- Create the final diagnosis Review under [Review directory](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/docs/review/).

## Gate 1 — Before Implementation

- Evidence gathered: attempt 002 has 49 samples; admission rises from about 13.37ms to 153.85ms, replay from about 11.09ms to 202.15ms; SQLite contains 2,671,288 runtime events and all are `pending`; current full duplicate scan takes about 1.7 seconds offline.
- Root-cause candidates: full database oracle contention, full session replay/history materialization, and pending outbox/backlog behavior.
- Allowed source scope: only the Runtime source/test files explicitly listed in Planned Files and the per-task file tables, plus new Gate R1 evidence and Review artifacts.
- Rollback: revert or park only the new diagnostic files and observation-only hooks. The formal executor must remain behaviorally identical with default `formal-full` mode.
- Stop conditions: any required public/schema/persistence semantic change, any attempt to edit the failed SQLite, any production report accepting local artifacts, unavailable/unsupported system `sqlite3`, any profiler input or sidecar mutation, any fallback, any file change beyond the current task's approved scope, or three unconfirmed hypotheses.

## Task 1: Add Query Timing Without Changing Formal Oracle Semantics

**Files:**

- Modify: [formalSoakExecution.ts](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/agent-runtime/src/baseline/formalSoakExecution.ts)
- Modify: [formalSoakExecution.test.ts](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/agent-runtime/test/formalSoakExecution.test.ts)

- [ ] **Step 1: Write RED tests for named timings and mode isolation**

Add tests that construct a fake `GateDReadOnlyDatabaseProbe`, capture every SQL call, inject a deterministic clock, and assert:

```ts
const timings: GateDDatabaseProbeTiming[] = [];
const formal = new GateDDatabaseObservationCursor({
  mode: "formal-full",
  now: sequenceClock(0, 2, 2, 5, 5, 9, 9, 14, 14, 20, 20, 27, 27, 35),
  onTiming: timing => timings.push(timing)
});

expect(formal.read(database).hardFailures).toEqual([]);
expect(timings.map(value => value.probe)).toEqual([
  "incremental-events",
  "dead-letter",
  "orphaned-approval",
  "duplicate-event",
  "sqlite-busy",
  "event-secret-canary",
  "message-secret-canary"
]);

const incrementalSql: string[] = [];
const incremental = new GateDDatabaseObservationCursor({
  mode: "diagnostic-incremental",
  onSql: sql => incrementalSql.push(sql)
});
incremental.read(database);
expect(incrementalSql).toHaveLength(1);
expect(incrementalSql[0]).toContain("WHERE rowid >");
```

Also retain the existing test that expects `DEAD_LETTER_OUTBOX`, `ORPHANED_APPROVAL`, `SQLITE_BUSY_RETRY_EXHAUSTED`, and `SECRET_CANARY_LEAK` in default construction.

- [ ] **Step 2: Run RED**

Run:

```bash
pnpm --filter @openharness/agent-runtime test -- formalSoakExecution
```

Expected: FAIL because `GateDDatabaseProbeTiming`, constructor options, `mode`, `onTiming`, and `onSql` do not exist.

- [ ] **Step 3: Implement the exact observation-only contract**

Add these exported types beside `GateDDatabaseObservations`:

```ts
export type GateDDatabaseObservationMode = "formal-full" | "diagnostic-incremental";

export type GateDDatabaseProbeName =
  | "incremental-events"
  | "dead-letter"
  | "orphaned-approval"
  | "duplicate-event"
  | "sqlite-busy"
  | "event-secret-canary"
  | "message-secret-canary";

export interface GateDDatabaseProbeTiming {
  probe: GateDDatabaseProbeName;
  durationMs: number;
  rowCount?: number;
}

export interface GateDDatabaseObservationCursorOptions {
  mode?: GateDDatabaseObservationMode;
  now?: () => number;
  onTiming?: (timing: GateDDatabaseProbeTiming) => void;
  onSql?: (sql: string) => void;
}
```

Update `GateDDatabaseObservationCursor` so:

```ts
private readonly mode: GateDDatabaseObservationMode;
private readonly now: () => number;
private readonly onTiming?: (timing: GateDDatabaseProbeTiming) => void;
private readonly onSql?: (sql: string) => void;

constructor(options: GateDDatabaseObservationCursorOptions = {}) {
  this.mode = options.mode ?? "formal-full";
  this.now = options.now ?? (() => performance.now());
  this.onTiming = options.onTiming;
  this.onSql = options.onSql;
}

private timed<T>(probe: GateDDatabaseProbeName, sql: string, query: () => T, rowCount?: (value: T) => number): T {
  this.onSql?.(sql);
  const startedAt = this.now();
  const value = query();
  this.onTiming?.({
    probe,
    durationMs: Math.max(0, this.now() - startedAt),
    ...(rowCount ? { rowCount: rowCount(value) } : {})
  });
  return value;
}
```

Wrap the existing incremental query and six existing global checks with `timed`. Immediately after incremental event-order validation, return `{ eventObservations, hardFailures }` when mode is `diagnostic-incremental`. Do not change the SQL text, failure codes, query order, or default behavior.

- [ ] **Step 4: Prove the production executor hardcodes the formal default**

Keep this exact production construction in `executeGateDProductionSoak`:

```ts
const databaseCursor = new GateDDatabaseObservationCursor();
```

Add a source-level test assertion that the formal executor does not pass `diagnostic-incremental`, and retain formal report invariant tests.

- [ ] **Step 5: Run GREEN**

Run:

```bash
pnpm --filter @openharness/agent-runtime test -- formalSoakExecution
pnpm --filter @openharness/agent-runtime typecheck
```

Expected: focused tests PASS; typecheck PASS; existing default full-oracle failure detection remains unchanged.

**Task 1 Step Evidence Gate:** record RED output, GREEN output, changed symbols, and confirmation that production construction remains default-only. Any formal behavior difference blocks Task 2.

## Task 2: Implement the Local Diagnostic Report and Offline Profiler

**Files:**

- Create: [gateDPerformanceDiagnostics.ts](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/agent-runtime/src/baseline/gateDPerformanceDiagnostics.ts)
- Create: [gateDPerformanceDiagnostics.test.ts](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/agent-runtime/test/gateDPerformanceDiagnostics.test.ts)

- [ ] **Step 1: Write RED report-boundary tests**

Tests must prove:

```ts
expect(createGateDPerformanceDiagnosticReport(validInput)).toMatchObject({
  schemaVersion: 1,
  track: "local",
  evidenceKind: "gate-d-performance-diagnostic",
  workload: {
    seededConversations: 10_000,
    concurrency: 20,
    mix: { noTool: 0.6, javaSandbox: 0.2, mcp: 0.15, approvalInterruption: 0.05 }
  }
});

expect(() => assertGateDPerformanceDiagnosticReport({
  ...validReport,
  track: "production"
})).toThrow(/local/);

expect(() => writeGateDPerformanceDiagnosticNoOverwrite(validReport, outputPath))
  .not.toThrow();
expect(statSync(outputPath).mode & 0o777).toBe(0o600);
expect(() => writeGateDPerformanceDiagnosticNoOverwrite(validReport, outputPath))
  .toThrow(/exists/i);
```

Add a `/private/tmp` live-WAL test that checkpoints schema plus row 1, leaves row 2 only in the live WAL, proves an ordinary readonly connection sees 2 rows, and proves the profiler's immutable URI sees only the checkpointed row 1. Snapshot main, `-wal`, and `-shm` bytes/SHA-256/size/mtime/ctime/ino immediately before profiling and assert every value is unchanged afterward. Independently invoke the same URI with a write statement and assert `/usr/bin/sqlite3` rejects it. Missing input must fail without creating a file; a symlink input must fail before spawn.

- [ ] **Step 2: Run RED**

Run:

```bash
pnpm --filter @openharness/agent-runtime test -- gateDPerformanceDiagnostics
```

Expected: FAIL because the diagnostics module does not exist.

- [ ] **Step 3: Implement the local-only report types**

Use these exact discriminants and fields:

```ts
export type GateDPerformanceDiagnosticVariant =
  | "full-oracle"
  | "incremental-oracle"
  | "workload-only";

export interface GateDPerformanceDiagnosticSample {
  sampleIndex: number;
  sampledAt: string;
  admissionP95Ms: number;
  durableReplayP95Ms: number;
  oracleDurationMs: number;
  probeTimings: GateDDatabaseProbeTiming[];
  databaseBytes: number;
  conversations: number;
  messages: number;
  executions: number;
  approvals: number;
  runtimeEvents: number;
  pendingEvents: number;
  hardFailures: string[];
}

export interface GateDPerformanceDiagnosticReport {
  schemaVersion: 1;
  track: "local";
  evidenceKind: "gate-d-performance-diagnostic";
  runId: string;
  variant: GateDPerformanceDiagnosticVariant;
  generatedAt: string;
  durationMs: 1_800_000;
  sampleIntervalMs: 30_000;
  workload: {
    seededConversations: 10_000;
    concurrency: 20;
    mix: { noTool: 0.6; javaSandbox: 0.2; mcp: 0.15; approvalInterruption: 0.05 };
  };
  environment: {
    nodeVersion: string;
    platform: string;
    architecture: string;
    databaseBasename: string;
  };
  samples: GateDPerformanceDiagnosticSample[];
  hardFailures: string[];
}
```

`assertGateDPerformanceDiagnosticReport` must reject unknown/missing fields, non-local track, a non-diagnostic evidence kind, configurable duration/sample interval, a changed workload, fewer than one sample, non-finite/negative metrics, or any string containing `Bearer `, `sk-`, `OPENHARNESS_SECRET_CANARY`, `API_KEY`, `ACCESS_TOKEN`, or `PASSWORD`.

- [ ] **Step 4: Implement immutable offline profiling with one fixed system SQLite child**

Export:

```ts
export interface GateDOfflineDatabaseProfile {
  schemaVersion: 1;
  track: "local";
  evidenceKind: "gate-d-offline-database-profile";
  generatedAt: string;
  databaseBytes: number;
  tableRows: Record<"conversations" | "messages" | "executions" | "approvals" | "runtime_events", number>;
  eventDeliveryStatus: Record<string, number>;
  objectBytes: { name: string; bytes: number }[];
  sessionCardinality: {
    messages: { p50: number; p95: number; max: number };
    executions: { p50: number; p95: number; max: number };
    runtimeEvents: { p50: number; p95: number; max: number };
  };
  queryPlans: { probe: GateDOfflineProbeName; plan: string[]; durationMs: number }[];
}

export type GateDOfflineProbeName = GateDDatabaseProbeName
  | "session-messages-p50"
  | "session-messages-p95"
  | "session-messages-max"
  | "session-events-p50"
  | "session-events-p95"
  | "session-events-max"
  | "active-execution"
  | "pending-approval";
```

The profiler execution contract is exact:

```ts
const SQLITE3_BINARY = "/usr/bin/sqlite3";
const SQLITE3_TIMEOUT_MS = 15 * 60 * 1_000;
const SQLITE3_MAX_BUFFER_BYTES = 8 * 1024 * 1024;
const databaseUri = `${pathToFileURL(databasePath).href}?mode=ro&immutable=1`;

const result = spawnSync(SQLITE3_BINARY, ["-batch", "-bail", databaseUri], {
  input: buildFixedGateDProfilerScript(),
  encoding: "utf8",
  timeout: SQLITE3_TIMEOUT_MS,
  maxBuffer: SQLITE3_MAX_BUFFER_BYTES,
  env: { LC_ALL: "C", LANG: "C" }
});
```

Use `spawnSync`, not a shell. The fixed binary and fixed `-batch`/`-bail` flags are not injectable by the CLI. Pass only `LC_ALL=C` and `LANG=C`; do not inherit the parent environment or service token. The database URI is the only data-bearing argv item. Every SQL statement, marker, and representative-scope selector is a fixed stdin script; no tenant/user/conversation value, SQL fragment, payload, message, or caller-controlled parameter may enter argv, environment, or a generated script.

Before spawn, `lstat` the absolute input and require a non-symlink regular file. Capture an exact main-file snapshot `{ dev, ino, size, mtimeNs, ctimeNs }`, plus an existence-tagged snapshot of `databasePath + "-wal"` and `databasePath + "-shm"`; any existing sidecar must also be a non-symlink regular file. After the child exits and before returning a profile, repeat all three snapshots. A changed main field, appeared/disappeared sidecar, or changed sidecar `dev`/`ino`/`size`/`mtimeNs`/`ctimeNs` is one fixed non-path-echoing failure. Tests additionally bind SHA-256 and full bytes for all present fixture files. These post-checks detect replacement/mutation but do not substitute for the immutable URI; the live-WAL behavior test proves the immutable semantics.

The single connection's fixed stdin script must:

1. Begin with `.bail on`, `.echo off`, `.headers on`, `.mode json`, `.explain off`, `PRAGMA query_only=ON`, and a single capability JSON record containing a fixed marker, `sqlite_version()`, `sqlite_compileoption_used('ENABLE_DBSTAT_VTAB')`, `json_valid('{}')`, the observed value from `pragma_query_only`, and the `main` row from `pragma_database_list`.
2. Emit fixed-marker JSON records for the five table counts, delivery-status distribution, `dbstat` object bytes, and message/execution/runtime-event p50/p95/max cardinality. All JSON must use SQLite JSON functions and fixed aliases; TypeScript must validate exact keys, integers, finite non-negative values, and known marker order.
3. Select p50/p95/max representative scopes and the combined max scope only inside SQL CTEs with deterministic count then identity ordering. The selected identifiers remain inside SQLite and are never emitted to TypeScript.
4. For each of the exact seven formal probes followed by the exact eight scoped probes, emit a known probe marker, run `EXPLAIN QUERY PLAN` with `.explain off`, then switch to `.mode off`, enable `.timer on`, execute and completely consume the real detail query, disable the timer, and restore `.mode json`. `.mode off` suppresses detail values but must not replace the query with `COUNT(*)` or `LIMIT`; all rows are traversed so the measured cost matches the detail path.
5. Finish with one fixed completion marker. The expected probe order is exactly `incremental-events`, `dead-letter`, `orphaned-approval`, `duplicate-event`, `sqlite-busy`, `event-secret-canary`, `message-secret-canary`, `session-messages-p50`, `session-messages-p95`, `session-messages-max`, `session-events-p50`, `session-events-p95`, `session-events-max`, `active-execution`, `pending-approval`.

Parse stdout as a strict ordered multiplexed protocol. On the approved macOS CLI, `.timer` writes `Run Time: real <seconds> user <seconds> sys <seconds>` to stdout, interleaved with one-line JSON arrays. Accept only exact known JSON markers/fields, valid `EXPLAIN QUERY PLAN` rows, the completion marker, and exactly 15 timer lines matching a fully anchored numeric regex. Convert only finite non-negative `real` seconds to `durationMs`; bind timings positionally to the fixed probe order. Successful stderr must be empty. Spawn error, missing binary, timeout, max-buffer overflow, signal, nonzero status, unsupported/unparseable version, `ENABLE_DBSTAT_VTAB !== 1`, JSON unavailable, `query_only !== 1`, unexpected main identity/path, malformed JSON/EXPLAIN/timer data, duplicate/missing/unknown/out-of-order marker, any extra stdout line, or any stderr produces a fixed diagnostic error that never includes raw stdout/stderr, database path/URI, identifiers, SQL, or child error text.

Profile exactly the seven named probes from Task 1, plus the aggregate counts, `delivery_status` distribution, `dbstat` object bytes, per-session cardinality, and eight scoped session-detail plans/timings. Store only aggregate counts/plans/timings; never store payloads, messages, approval data, tenant/user/conversation IDs, database paths, child output, or service credentials. Delete the old `better-sqlite3` URI open, `SQLITE_CANTOPEN` detection, ordinary readonly fallback, `query_only` write probe, and connection-level `now` timer; there is no compatibility path.

- [ ] **Step 5: Implement percentile and trend helpers**

Export deterministic helpers:

```ts
export function percentile95(values: readonly number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.ceil(sorted.length * 0.95) - 1]!;
}

export function leastSquaresSlope(values: readonly { x: number; y: number }[]): number {
  if (values.length < 2) return 0;
  const xMean = values.reduce((sum, value) => sum + value.x, 0) / values.length;
  const yMean = values.reduce((sum, value) => sum + value.y, 0) / values.length;
  const denominator = values.reduce((sum, value) => sum + (value.x - xMean) ** 2, 0);
  if (denominator === 0) return 0;
  return values.reduce((sum, value) => sum + (value.x - xMean) * (value.y - yMean), 0) / denominator;
}
```

Tests must cover empty, singleton, unsorted percentile input, flat slope, positive slope, and negative slope.

- [ ] **Step 6: Implement mode-0600 no-overwrite writers**

Use `openSync(path, "wx", 0o600)`, `fchmodSync`, full write, `fsyncSync`, and close. On validation or write failure, close the descriptor and remove only the newly-created incomplete target. Never offer an overwrite flag.

- [ ] **Step 7: Run GREEN**

Run:

```bash
pnpm --filter @openharness/agent-runtime test -- gateDPerformanceDiagnostics
pnpm --filter @openharness/agent-runtime typecheck
```

Expected: focused tests PASS; typecheck PASS.

**Task 2 Step Evidence Gate:** prove local-only discriminants, one fixed system SQLite child/connection, live-WAL immutable behavior, query-only capability, exact 15 plan/timing records, main/sidecar non-mutation, no fallback, no-overwrite permissions, aggregate-only output, and deterministic trend math.

## Task 3: Implement the Three-Variant Local A/B Runner

**Files:**

- Modify: [gateDPerformanceDiagnostics.ts](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/agent-runtime/src/baseline/gateDPerformanceDiagnostics.ts)
- Modify: [gateDPerformanceDiagnostics.test.ts](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/agent-runtime/test/gateDPerformanceDiagnostics.test.ts)
- Modify: [formalSoakExecution.ts](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/agent-runtime/src/baseline/formalSoakExecution.ts)
- Modify: [formalSoakRuntimeChild.ts](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/agent-runtime/src/baseline/formalSoakRuntimeChild.ts)
- Modify: [server.ts](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/agent-runtime/src/server.ts)
- Modify: [productionRuntimeContext.ts](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/agent-runtime/src/storage/productionRuntimeContext.ts)
- Modify: [runtimeStorage.ts](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/agent-runtime/src/storage/runtimeStorage.ts)
- Modify: [formalSoakExecution.test.ts](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/agent-runtime/test/formalSoakExecution.test.ts)
- Modify: [runtimeStorage.test.ts](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/agent-runtime/test/runtimeStorage.test.ts)

- [ ] **Step 1: Write RED orchestration tests with injected dependencies**

Define the test contract:

```ts
const result = await runGateDPerformanceDiagnostic({
  runId: "gate-r1-full-001",
  variant: "full-oracle",
  javaUrl: "http://127.0.0.1:8080",
  mcpConfigPath,
  sqlitePath,
  outputPath,
  serviceToken: "test-service-token"
}, {
  delay: async () => undefined,
  now: sequenceDateClock(),
  startRuntime: fakeRuntime.start,
  stopRuntime: fakeRuntime.stop,
  seed: fakeDriver.seed,
  startWorkload: fakeDriver.start,
  stopWorkload: fakeDriver.stop,
  drainMetrics: fakeDriver.drain,
  openProbe: fakeProbe.open,
  readDatabaseBytes: () => 1_024
});

expect(result.track).toBe("local");
expect(result.variant).toBe("full-oracle");
expect(result.samples).toHaveLength(60);
expect(fakeRuntime.events).toEqual(["start", "seed", "workload-start", "workload-stop", "stop"]);
```

Add negative tests proving:

- `full-oracle` constructs `GateDDatabaseObservationCursor({ mode: "formal-full" })`.
- `incremental-oracle` constructs `GateDDatabaseObservationCursor({ mode: "diagnostic-incremental" })`.
- `workload-only` makes no database-oracle calls but still records aggregate row counts through one timed snapshot query group after workload metrics drain.
- output/database paths must be absolute and initially absent.
- `sqlitePath` cannot equal attempt 001/002 paths and cannot be inside their packet directories.
- any runtime/workload/probe failure yields a local diagnostic report with a stable hard failure and still stops workload before Runtime.
- production track, formal approval, restart schedule, threshold flags, and custom workload input are not accepted.

Before any identity propagation implementation, add RED tests across `gateDPerformanceDiagnostics`, `formalSoakExecution`, and `runtimeStorage` that prove:

- the diagnostic runner passes the claimed `dev`/`ino`, while formal default spawn strips inherited identity environment variables and does not set identity;
- explicit identity is always emitted as a complete pair; partial, empty, negative, fractional, non-numeric, and greater-than-safe-integer values fail closed;
- a matching identity initializes a claimed zero-byte SQLite, but mismatch, missing `database_list` main, or `stat` failure closes the actual connection and returns the same fixed non-path-echoing error;
- an actual formal Runtime child startup is paused at the storage-open boundary, the claim is renamed, and a temporary sentinel SQLite is linked at the requested path before open; the child must fail before mutation;
- the destructive test records sentinel bytes, SHA-256, size, and mtime before startup and compares all four after failure;
- child stderr, journal, thrown errors, and diagnostic report contain neither service token, SQLite path, nor expected identity values.

- [ ] **Step 2: Run RED**

Run:

```bash
pnpm --filter @openharness/agent-runtime test -- gateDPerformanceDiagnostics
pnpm --filter @openharness/agent-runtime test -- formalSoakExecution
pnpm --filter @openharness/agent-runtime test -- runtimeStorage
```

Expected: the new Task 3 orchestration tests fail because `runGateDPerformanceDiagnostic`/dependency seams are absent, and the new identity tests fail because spawn propagation and pre-write storage identity validation are absent. No production implementation may be written until all three RED commands have been observed.

- [ ] **Step 3: Implement the fixed local execution constants**

Use exact constants:

```ts
const DIAGNOSTIC_DURATION_MS = 30 * 60 * 1_000;
const DIAGNOSTIC_SAMPLE_INTERVAL_MS = 30_000;
const DIAGNOSTIC_SEEDED_CONVERSATIONS = 10_000;
const DIAGNOSTIC_CONCURRENCY = 20;
```

The exported function accepts no duration, sampling, concurrency, mix, restart, threshold, track, or evidence-kind override. Dependency overrides for fast tests replace delay, clocks, Runtime/driver/probe I/O, and file-size reads only; the logical run still produces all 60 fixed samples, and no override is exposed through the CLI.

- [ ] **Step 4: Reuse reviewed Gate D components**

The real dependencies must:

1. Build the fixed workload with `buildDeterministicBaselineWorkload({ seededConversations: 10_000, concurrency: 20 })`.
2. Spawn the same [formal Runtime child](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/agent-runtime/src/baseline/formalSoakRuntimeChild.ts) using `buildGateDRuntimeChildSpawnSpec`, `spawnGateDRuntimeManagedChild`, and `waitUntilGateDRuntimeReady` on a diagnostic-only port selected once before start.
3. Construct `GateDRuntimeHttpTransport`, `GateDWorkloadDriver`, and `GateDContinuousWorkload`.
4. Seed all 10,000 scopes through public Runtime HTTP and call `assertGateDSeededConversationCount` on the fresh diagnostic database.
5. Start continuous workload only after seed verification.
6. Every 30 seconds drain admission/replay metrics, run the chosen oracle variant, read aggregate table/delivery counts and file size, and append one diagnostic sample.
7. Stop workload, then Runtime, then close all probes in `finally`.
8. Write exactly one validated local diagnostic report with no overwrite.

Do not schedule TS restarts: attempt 002 failed before hour 2, and Gate R1 is isolating pre-restart degradation.

- [ ] **Step 4A: Bind diagnostic Runtime storage open to the claimed SQLite inode**

The runner must pass the claimed SQLite `dev` and `ino` through the formal child spawn environment as an optional diagnostic-only expected identity. The Runtime child must validate both values as non-negative safe integers and forward them through `createProductionServer` and `openProductionRuntimeContext` into `openProductionRuntimeStorage`.

`openRuntimeDatabase` must open the actual `better-sqlite3` connection first, resolve the main database file from `PRAGMA database_list`, and compare its `stat` identity with the expected `dev` and `ino` **before** `journal_mode`, WAL, migration, integrity, reconciliation, or any other write-capable statement. On mismatch it must close the connection and throw a fixed non-path-echoing error.

The identity option is optional. The formal Gate D and normal production entrypoints must not set it, and their default storage-open behavior must remain unchanged.

Tests must prove:

- a matching expected identity permits zero-byte claimed SQLite initialization and migration;
- a mismatching identity fails before the sentinel database changes in bytes, hash, size, or mtime;
- the spawn spec carries identity only when explicitly supplied;
- the spawn spec removes identity variables inherited from `baseEnvironment` when identity is not explicitly supplied and replaces both values when it is;
- the child rejects partial, negative, non-integer, or unsafe identity environment values;
- formal default construction does not pass expected identity;
- the diagnostic destructive counterexample renames the claim, links a temporary sentinel SQLite at the original path, and leaves the sentinel byte-for-byte unchanged.
- identity mismatch, missing main database metadata, or identity `stat` failure closes the connection and produces the same fixed error without service token, path, `dev`, or `ino` values.

- [ ] **Step 5: Compute sample metrics without changing formal thresholds**

For each sample:

```ts
const admissionP95Ms = percentile95(metrics.admissionLatenciesMs);
const durableReplayP95Ms = percentile95(metrics.durableReplayLatenciesMs);
const oracleDurationMs = probeTimings.reduce((sum, timing) => sum + timing.durationMs, 0);
```

Record threshold exceedance as diagnostic data only. Do not call `createRuntimeBaselineReport` and do not reuse the formal report schema.

- [ ] **Step 6: Run GREEN and regression**

Run:

```bash
pnpm --filter @openharness/agent-runtime test -- gateDPerformanceDiagnostics
pnpm --filter @openharness/agent-runtime test -- formalSoakExecution
pnpm --filter @openharness/agent-runtime test -- runtimeStorage
pnpm --filter @openharness/agent-runtime typecheck
```

Expected: diagnostic tests PASS; formal execution tests PASS; typecheck PASS.

**Task 3 Step Evidence Gate:** prove fixed local constants, variant isolation, fresh-database enforcement, pre-write inode binding, shutdown ordering, and formal executor non-regression. Any sentinel mutation, default formal behavior change, or identity check occurring after a write-capable statement blocks Task 4.

## Task 4: Add the Fail-Closed Diagnostic CLI and Analyzer

**Files:**

- Create: [gateDPerformanceDiagnosticCli.ts](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/agent-runtime/src/baseline/gateDPerformanceDiagnosticCli.ts)
- Modify: [agent-runtime package.json](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/agent-runtime/package.json)
- Modify: [gateDPerformanceDiagnostics.test.ts](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/agent-runtime/test/gateDPerformanceDiagnostics.test.ts)

- [ ] **Step 1: Write RED CLI tests**

Required commands and flags:

```text
profile --project-root --input-sqlite --output
run --project-root --run-id --variant --java-url --mcp-config --sqlite-path --output
analyze --project-root --full-report --incremental-report --workload-report --output
```

Tests must reject unknown/duplicate/missing flags, relative paths, paths escaping canonical project root, existing outputs, existing run databases, attempt 001/002 SQLite targets, non-loopback Java URL, unknown variant, credential flags, duration/sample/workload/threshold/track/restart flags, and any output containing a secret canary. `OPENHARNESS_SERVICE_TOKEN` is read only by `run`, only after all path/config validation, and never appears in argv, stdout, stderr, journal, or report.

- [ ] **Step 2: Run RED**

Run:

```bash
pnpm --filter @openharness/agent-runtime test -- gateDPerformanceDiagnostics
```

Expected: FAIL because the CLI does not exist.

- [ ] **Step 3: Implement the three subcommands**

- `profile`: canonicalize the input, require it to exist, open immutable/read-only, write one `GateDOfflineDatabaseProfile`.
- `run`: validate all inputs and fresh outputs before reading `OPENHARNESS_SERVICE_TOKEN`; probe Java fixtures and MCP config; execute one fixed 30-minute variant; write one local report.
- `analyze`: require exactly one report per variant, validate distinct runId/database basename, compare environment fingerprint, calculate first/last 10-sample medians and slopes against `runtimeEvents`, and write one decision artifact.

Use this decision shape:

```ts
export interface GateDPerformanceDiagnosisDecision {
  schemaVersion: 1;
  track: "local";
  evidenceKind: "gate-d-performance-diagnosis";
  generatedAt: string;
  result: "confirmed" | "inconclusive";
  primaryCause:
    | "database-oracle-contention"
    | "session-replay-growth"
    | "outbox-backlog"
    | "combined"
    | "unresolved";
  findings: {
    hypothesis: string;
    status: "confirmed" | "rejected" | "contributing" | "unresolved";
    evidence: string[];
  }[];
  nextOpenSpecDecision: "existing-change" | "new-proposal-required" | "human-decision-required";
}
```

The analyzer may mark `database-oracle-contention` confirmed only when the full-oracle run reproduces a positive admission/replay slope or threshold breach and both control variants materially reduce the last-window latency or slope. It may mark `session-replay-growth` confirmed only when replay degradation persists in workload-only control and the immutable profile shows rising p50/p95/max scoped replay cost with session cardinality. It may mark `outbox-backlog` confirmed only when backlog/index growth remains correlated after oracle removal and the static production-wiring Review proves the delivery lifecycle is absent or stalled; otherwise outbox status must be quantified as `contributing` or `unresolved`, never guessed as primary. If no candidate satisfies its confirmation rule, result is `inconclusive` and primaryCause is `unresolved` or `combined`; the analyzer must not invent a fix.

- [ ] **Step 4: Add the package script**

Add exactly:

```json
"diagnostic:gate-d-performance": "tsx src/baseline/gateDPerformanceDiagnosticCli.ts"
```

Do not modify `qualification:gate-d-preflight` or `qualification:gate-d-run`.

- [ ] **Step 5: Run GREEN**

Run:

```bash
pnpm --filter @openharness/agent-runtime test -- gateDPerformanceDiagnostics
pnpm --filter @openharness/agent-runtime typecheck
```

Expected: CLI negative/positive tests PASS; typecheck PASS.

**Task 4 Step Evidence Gate:** prove no production/evidence escalation path, no overwrite, no secret path, and analyzer fail-closed behavior.

## Task 5: Replace the Unsafe Profiler Fallback, Verify, and Re-Review

**Files:**

- Modify only [gateDPerformanceDiagnostics.ts](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/agent-runtime/src/baseline/gateDPerformanceDiagnostics.ts).
- Modify only [gateDPerformanceDiagnostics.test.ts](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/agent-runtime/test/gateDPerformanceDiagnostics.test.ts).
- Review actual diffs for every Runtime source/test file in Planned Files and every expanded Task 3 file, including the complete identity propagation chain from diagnostic claim through storage open.
- Replace the current FAIL conclusion in [Task 5 implementation Review](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/docs/review/2026-07-17-agent-runtime-admission-performance-diagnosis-implementation-review.md) only after an independent strict re-Review. The implementer must not pre-write PASS.

- [ ] **Step 1: Write RED immutable-URI, parser, identity, and no-leak tests**

All new filesystem fixtures must be created under `/private/tmp`, registered for `afterEach`/`afterAll` cleanup, and be unrelated to the three existing Gate D SQLite/lock artifacts. Tests must not open, hash, copy, move, delete, or write those three artifacts.

Before the first Task 5 edit, record in the Task 5 evidence log both files' SHA-256 and exact diff baseline:

```bash
shasum -a 256 agent-runtime/package.json pnpm-lock.yaml
git diff --unified=0 -- agent-runtime/package.json
git diff -- pnpm-lock.yaml
```

Expected baseline: `pnpm-lock.yaml` has no diff from HEAD; `agent-runtime/package.json` has exactly one approved Task 4 hunk adding `"diagnostic:gate-d-performance": "tsx src/baseline/gateDPerformanceDiagnosticCli.ts",` and no other addition, removal, or modification. Task 5 must leave both SHA-256 values and both exact diffs unchanged.

Add one real live-WAL regression:

```ts
const writer = new Database(databasePath);
writer.pragma("journal_mode = WAL");
seedProfilerSchemaAndCheckpointedRow(writer);
writer.pragma("wal_checkpoint(TRUNCATE)");
writer.prepare("INSERT INTO runtime_events (...) VALUES (...)").run(/* second row */);

expect(readCountWithOrdinaryReadonlyConnection(databasePath)).toBe(2);
const before = snapshotMainWalShmWithHashes(databasePath);
const profile = profileGateDOfflineDatabase(databasePath, fixedGeneratedAtOptions);
const after = snapshotMainWalShmWithHashes(databasePath);

expect(profile.tableRows.runtime_events).toBe(1);
expect(after).toEqual(before);
writer.close();
```

The schema and first row must be checkpointed before the second row is left in WAL. Snapshot the main file and every present `-wal`/`-shm` sidecar after the ordinary-read control and immediately before profiling. Bind bytes, SHA-256, size, nanosecond mtime/ctime, dev, and ino. This is the required behavioral proof that the system CLI honors `immutable=1`; `query_only`, readonly flags, or after-only main mtime are insufficient.

Add real negative tests proving:

- `/usr/bin/sqlite3` given the same `file:...?mode=ro&immutable=1` URI rejects `CREATE TABLE` and leaves main/WAL/SHM snapshots unchanged;
- missing input fails without creating main, `-wal`, or `-shm`;
- a symlink input and symlink sidecar are rejected before the profiler child is spawned;
- a test seam swaps the claimed path after the pre-snapshot but before the real child; the profiler fails on post-identity validation and does not return a profile;
- URL-sensitive filenames are percent-encoded once and passed as one filename argv item, never treated as a literal filesystem URI collision;
- one profiler call invokes exactly one child with binary `/usr/bin/sqlite3`, args `-batch`, `-bail`, and one immutable URI; no SQL or seeded tenant/user/conversation values appear in argv/environment;
- the stdin script has `.explain off`, fifteen fixed probe markers, fifteen `.timer on` detail executions, `.mode off` around detail rows, and no interpolated fixture identifier.

Add table-driven injected-process parser tests for:

- valid semantic version, `ENABLE_DBSTAT_VTAB=1`, JSON result, `query_only=1`, main database identity, aggregate JSON, dbstat JSON, exact plan rows, exact fifteen timer lines, and the completion marker;
- missing binary/spawn error, timeout, signal, nonzero status, buffer overflow, unparseable version, disabled dbstat, unavailable JSON, `query_only != 1`, missing/wrong main record, invalid aggregate number, malformed JSON, malformed EXPLAIN row, malformed/negative/non-finite timer, 14 or 16 timer lines, duplicate/missing/out-of-order/unknown marker, trailing stdout, and non-empty stderr;
- every failure exposes only one fixed error class/message and contains none of the injected database path/URI, raw stdout/stderr, secret canary, tenant/user/conversation identifiers, `Bearer`, or `sk-` values;
- the returned profile contains exactly five table counts, delivery distribution, dbstat aggregate, three cardinality groups, and the fixed 15 plans/timings, with no identifier, payload, message, path, argv, stdout, or stderr field.

- [ ] **Step 2: Run RED and preserve the observed failure**

Run:

```bash
pnpm --filter @openharness/agent-runtime test -- gateDPerformanceDiagnostics
```

Expected: FAIL against the current implementation because it opens through `better-sqlite3`, takes the ordinary readonly fallback, does not spawn fixed `/usr/bin/sqlite3`, does not prove live-WAL immutable behavior, and does not implement the strict child protocol. Do not change implementation until this RED has been observed.

- [ ] **Step 3: Implement the minimal single-child profiler**

In [gateDPerformanceDiagnostics.ts](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/agent-runtime/src/baseline/gateDPerformanceDiagnostics.ts), replace the current connection-based profiler helpers with the Task 2 Step 4 final contract. Preserve `GateDOfflineDatabaseProfile`, `GateDOfflineProbeName`, the diagnostic CLI call signature, local-only discriminants, and the exact seven-plus-eight probe order.

The production function may expose only a dependency seam used by unit tests to observe/delegate the `spawnSync` call; the CLI cannot accept a binary, flags, SQL, timeout, buffer, URI mode, fallback, or capability override. Remove `now`-based profiler timing and `GateDOfflineReadOnlyConnectionObservation`; timer values must come from the same CLI connection that executes the detail queries. Capability observation, if retained for tests, may contain only parsed version/dbstat/JSON/query-only booleans and no path or raw child output.

Use one static script builder composed only from fixed module constants. Representative scope selection must remain inside SQL CTEs for every scoped EXPLAIN/detail pair. Do not first fetch IDs into TypeScript, do not substitute SQL parameters from TypeScript, and do not emit detail rows. Use `.mode off` so SQLite still walks all detail rows while stdout stays aggregate-only.

On every failure, complete the post-spawn main/sidecar identity check when it is safe to do so, then throw a stable sanitized error. Never include `result.error.message`, `stdout`, `stderr`, argv, URI, SQL, path, dev/ino, or parsed identifiers. There is no retry and no alternative open path.

- [ ] **Step 4: Run focused GREEN and negative fallback scans**

Run:

```bash
pnpm --filter @openharness/agent-runtime test -- gateDPerformanceDiagnostics
pnpm --filter @openharness/agent-runtime typecheck
rg -n "SQLITE_CANTOPEN|isSqliteCannotOpen|better-sqlite3 12|compatibility with that driver|const fallback" agent-runtime/src/baseline/gateDPerformanceDiagnostics.ts agent-runtime/test/gateDPerformanceDiagnostics.test.ts
shasum -a 256 agent-runtime/package.json pnpm-lock.yaml
git diff --unified=0 -- agent-runtime/package.json
git diff -- pnpm-lock.yaml
```

Expected: focused tests PASS with the real live-WAL invariant; typecheck PASS; the fallback scan returns no matches; both SHA-256 values and exact diffs equal the Step 1 baseline. `pnpm-lock.yaml` remains unchanged from HEAD. The only `agent-runtime/package.json` diff remains the single Task 4-approved `diagnostic:gate-d-performance` script line; Task 5 adds no package change. Any skipped live-WAL test, ordinary readonly path, second child, PATH lookup, shell invocation, raw child output, changed baseline hash/diff, lockfile change, or additional package change blocks full verification.

- [ ] **Step 5: Run focused and full Runtime verification**

Run:

```bash
pnpm --filter @openharness/agent-runtime test -- gateDPerformanceDiagnostics
pnpm --filter @openharness/agent-runtime test -- formalSoakExecution
pnpm --filter @openharness/agent-runtime test -- runtimeStorage
pnpm --filter @openharness/agent-runtime test -- formalSoakCli
pnpm --filter @openharness/agent-runtime test
pnpm --filter @openharness/agent-runtime typecheck
```

Expected: all commands PASS with zero failed tests and zero type errors.

Strict Review must independently replay both the profiler live-WAL test and the child-startup sentinel swap. It must verify profiler main/WAL/SHM bytes/SHA-256/size/mtime/ctime/ino invariants; confirm the profiler uses one fixed child/connection and the Runtime identity check precedes every write-capable SQLite statement; and prove normal production/formal defaults do not carry identity environment values.

- [ ] **Step 6: Run repository governance verification**

Run:

```bash
npx openspec validate harden-agent-runtime-single-node-production --strict --no-interactive
pnpm dashboard:check
git diff --check
git status --short
```

Expected: OpenSpec PASS; Dashboard check PASS without Dashboard edits; diff check PASS; status shows only scoped diagnostic/plan/Review changes plus the three pre-existing untracked SQLite/lock artifacts.

- [ ] **Step 7: Run negative and sensitive scans**

Search the complete diff and test-generated diagnostic outputs for raw bearer values, API-key patterns, password/token field names, `OPENHARNESS_SECRET_CANARY`, production-track claims, formal evidence kind, threshold/workload override flags, overwrite flags, raw SQLite child stdout/stderr/path/URI, shell calls, PATH-selected `sqlite3`, plain readonly profiler opens, fallback/retry logic, package/lockfile changes beyond the recorded Step 1 baseline, and references that would allow attempt 002 SQLite as an output target.

Expected: no secret/path/identifier value; no production escalation; no profiler fallback or shell; `pnpm-lock.yaml` remains diff-free; `agent-runtime/package.json` still contains only the one previously approved Task 4 script diff; only explicit negative-test literals, fixed `/usr/bin/sqlite3`, the required immutable URI builder, and invariant checks remain.

- [ ] **Step 8: Perform strict High Review**

The Review must inspect:

- production `executeGateDProductionSoak` still constructs default `GateDDatabaseObservationCursor()`;
- formal CLI flags and `assertFormalGateDReport` are unchanged;
- every diagnostic artifact is local-only and rejected by formal validation;
- all run databases/outputs are fresh and no-overwrite;
- the offline profiler uses exactly one fixed `/usr/bin/sqlite3` child/connection with one `mode=ro&immutable=1` URI, no fallback, strict capability/parser gates, and unchanged main/WAL/SHM;
- the live-WAL test proves ordinary readonly sees the WAL row while immutable profiling sees only checkpointed state, and attempt 002 remains an immutable input only;
- all profiler SQL and representative-scope selection stay in a fixed stdin script; no identifiers/detail rows/raw child output cross into TypeScript, report, argv, error, stdout, or stderr;
- the ending `agent-runtime/package.json` and `pnpm-lock.yaml` SHA-256/diffs exactly equal the recorded pre-Task-5 baseline; the package diff is still only the Task 4 diagnostic script and the lockfile has no diff;
- three variants differ by one database-oracle variable;
- workload, concurrency, fixture mapping, and seed count remain fixed;
- shutdown and redaction are fail-closed;
- analyzer cannot claim a fix or Gate D PASS.

Any finding returns to the same task for fix → full verification → High Review again.

**Task 5 rollback:** revert only the two Task 5 source/test edits to the pre-repair profiler and keep Task 6 blocked; do not restore the unsafe fallback as an accepted path. No artifact cleanup or Git command is authorized.

**Task 5 stop conditions:** stop and return for a new decision if `/usr/bin/sqlite3` is missing or lacks the required capability/format, if the fixed script cannot stay within the 8 MiB/15-minute bounds, if any main/WAL/SHM field changes, if a second process/connection or fallback appears necessary, if either package/lockfile SHA or exact diff differs from the recorded pre-Task-5 baseline, if any additional package/lockfile/production/deployment/persistence change is needed, if any protected attempt artifact is accessed during tests, or if strict Review is not PASS.

## Task 6: Execute Gate R1 Evidence Runs and Decide Root Cause

**Resume-004 authorization gate:** Task 6 attempt 001, `resume-001`, `resume-002`, and `resume-003` are historical `BLOCKED` attempts, not failed Gate R1 performance evidence. Resume-003 consumed only `java-gateway-18084-resume-003.log`; its Maven command-resolution failure occurred before Maven, Java application, readiness, observer, diagnostic CLI, Runtime, MCP, workload, sample, or analyze, its PID target remains absent/no-follow, and none of the ten run database/report/lock/decision targets was claimed. The user explicitly approved this new `resume-004` plan revision on `2026-07-21`. Maven was installed by the single already-completed Homebrew installation action, but the Preflight and execution chain MUST NOT run `brew`, install, reinstall, upgrade, relink, or repair any tool. They may use only the exact Maven installation bound below. This exact revised Task 6 MUST receive a fresh independent strict Preflight `PASS` before credential extraction, any fresh claim, Java start, run, or analyze. A prior Preflight does not authorize the new revision. This new Preflight and all nine future execution observers are bound to the current control-plane metadata: filesystem `unrestricted` / `danger-full-access` and approval policy `never`; `sandbox_permissions` is forbidden by the platform and every Task 6 `exec_command` call MUST omit that field. Each observer stage starts exactly one observer shell with one `exec_command` that also omits `justification`, uses fixed `yield_time_ms=10000`, and reads the host process table from that shell. If the initial result retains the same running shell instead of returning its numeric exit immediately, only bounded empty `write_stdin` polls of that exact session may collect the final result; no second observer shell or second observer `exec_command` is allowed. This no-sandbox host execution and same-session result collection are not an ordinary-sandbox attempt, fallback, escalation, observer retry, asynchronous correction, or another resume. Authorization excludes another profile, formal Gate D, performance repair, source/tests/OpenSpec/Dashboard changes, Git writes, OpenSpec archive, merge, tag, and evidence/worktree cleanup. Any metadata, host-access, envelope, Maven-binding, or other mismatch is `BLOCKED`; it never activates fallback, automatic retry, a fifth resume, a new basename/runId, a shortened run, a workload change, or artifact cleanup.

**Files and immutable bindings:**

- Preserve these eleven existing, consumed, non-symlink mode-`0600` artifacts under the [Gate R1 evidence directory](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/docs/verification/agent-runtime-v1/gate-d/performance-recovery/gate-r1/). Their mode, size, and SHA-256 are immutable bindings:
  - `attempt-002-profile.json`: size `10126`, SHA-256 `bd08cc930a1269814d2bde296ca13679574d9f4d5332c3f5ca3bc5efcb8e0541`
  - `java-gateway-18084.log`: size `4527`, SHA-256 `18ce69b6d16e9395e0ab62416f7bfbcf3b6cb1ae1169ed68a63ea5bba8049c02`
  - `java-gateway-18084.pid`: size `6`, SHA-256 `db053c15314038b9ec9b7c9e4efb3b5dd159f08825e35101660d70a527b91089`
  - `java-gateway-18084-resume-001.log`: size `99731235`, SHA-256 `5e103d31edf342e6ec0f6121141517a0c0196cbbe6c644985dda16351216c52f`
  - `java-gateway-18084-resume-001.pid`: size `6`, SHA-256 `4667fcf59d1f03c1db90f299b115525df71eb7da8d3cc46211e6a18fa8f5f1c7`
  - `gate-r1-full-001.sqlite`: size `240963584`, SHA-256 `cc90a03bbb4887b7b2705768fe3ef357e7b1c8889d9f7564d02c32abb596714f`
  - `gate-r1-full-001-report.json`: size `0`, SHA-256 `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855`
  - `gate-r1-full-001.sqlite.lock`: size `0`, SHA-256 `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855`
  - `java-gateway-18084-resume-002.log`: size `4527`, SHA-256 `311460c74635cc30a938b5f9d5a37b8018748c7e10a44f13da8aa598bc134c82`
  - `java-gateway-18084-resume-002.pid`: size `6`, SHA-256 `26769b0d0c1b476354ee6439b92c84a21c89bec06418a20fa8fa0663bd172393`
  - `java-gateway-18084-resume-003.log`: size `31`, SHA-256 `4707abc6949e53eb9225dc8181e2be5e3c6201ad35d9c33cab43bb627992dfd7`
- Create only these twelve fresh one-shot evidence targets:
  - `gate-r1-full-002.sqlite`
  - `gate-r1-full-002-report.json`
  - `gate-r1-full-002.sqlite.lock`
  - `gate-r1-workload-001.sqlite`
  - `gate-r1-workload-001-report.json`
  - `gate-r1-workload-001.sqlite.lock`
  - `gate-r1-incremental-001.sqlite`
  - `gate-r1-incremental-001-report.json`
  - `gate-r1-incremental-001.sqlite.lock`
  - `gate-r1-decision.json`
  - `java-gateway-18084-resume-004.log`
  - `java-gateway-18084-resume-004.pid`
- Create the final [Gate R1 diagnosis Review](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/docs/review/2026-07-17-agent-runtime-gate-r1-diagnosis-review.md).
- On any resume-004 execution `BLOCKED`, create only the contingent [resume-004 BLOCKED Review](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/docs/review/2026-07-21-agent-runtime-gate-r1-resume-004-review.md) after the narrow owned-process/protected-input checks that remain reachable. The diagnosis Review and BLOCKED Review are mutually exclusive outcomes; neither is an evidence file.

The existing [performance-recovery parent](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/docs/verification/agent-runtime-v1/gate-d/performance-recovery/) and [Gate R1 directory](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/docs/verification/agent-runtime-v1/gate-d/performance-recovery/gate-r1/) are non-symlink mode-`0700` directories. Resume MUST NOT recreate, chmod, rename, move, or delete either directory. All eleven existing files are immutable historical evidence and MUST NOT be opened for repair, appended, truncated, overwritten, chmodded, renamed, deleted, reused, or treated as fresh. `java-gateway-18084-resume-003.pid` MUST remain absent/no-follow and is not evidence. The twelve resume-004 targets are one-shot claims created mode `0600`; a target is consumed even if its command exits nonzero, is interrupted, or leaves an empty/partial file. No consumed target may be repaired or reused.

### Immutable attempt-001, resume-001, resume-002, and resume-003 history

- The authoritative [attempt-001 blocked Review](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/docs/review/2026-07-17-agent-runtime-gate-r1-execution-attempt-001-review.md), SHA-256 `9a1572d70dc2969d2e15eff3a1fddbf11d95051763516cb73e6476c7d34f44dc`, records the completed profile, blocked wrapper, evidence preservation, and owned cleanup.
- The first profile invocation encountered sandbox `tsx` spawn `EPERM` before the CLI and before output claim. The same exact approved command was then permitted and completed once; this is not authorization to profile again.
- The existing profile passed structure/baseline checks: `databaseBytes=1835978752`, `tableRows.runtime_events=2671288`, `eventDeliveryStatus.pending=2671288`, all non-pending delivery counts zero, and exactly fifteen ordered query plans. Its fixed SHA-256 is listed above.
- Original Java lifecycle readiness succeeded. The original log and PID were consumed, the owned PTY received Ctrl-C, the Java process exited, port `18084` was released, and Runtime/MCP orphan checks passed. Those files remain historical attempt-001 evidence only.
- The first full-run wrapper exited `97` before `pnpm`, diagnostic CLI, Java/MCP probes, Runtime child, or workload because macOS `/usr/bin/sed` did not implement the plan's GNU-style BRE `\+` capture. At the end of attempt 001 all three run database/report pairs and the decision were unclaimed; resume-001 later consumed only the full-001 pair and its automatic lock. No admission root-cause conclusion exists.
- The user approved `resume-001` with two new Java-control basenames. The fresh Java lifecycle succeeded and remained owned, but the full run was stopped by the control plane after an observer result provided empty stdout without a usable numeric exit code or structured chain.
- The authoritative [resume-001 Review](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/docs/review/2026-07-17-agent-runtime-gate-r1-resume-001-review.md) records an observer protocol/race `BLOCKED`, not a Java/MCP, Runtime, workload, admission-threshold, database-oracle, or performance conclusion. A corrected read-only observer later showed CLI `2167` → bridge `2173` → Runtime `2185` → MCP `2223/2229`, but arrived after the stop decision; it proves the chain was coherent at that later observation point and does not retroactively validate the interrupted run.
- `gate-r1-full-001.sqlite`, its empty report, and its singleton lock are consumed partial evidence. The partial database MUST NOT be opened to infer a trend, extrapolated, compared for a performance conclusion, or used to reconstruct a report.
- The authoritative [resume-002 Review](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/docs/review/2026-07-17-agent-runtime-gate-r1-resume-002-review.md), SHA-256 `52ca54c43523821351b3a0282a4c53a1802c7b4e345e99debceb58e77b0df88b`, records prestate, credential selfcheck, and the fresh Java lifecycle as successful, followed by the first `pre-run-clean` result exit `41` before any run command was submitted. It is an execution-protocol/host-observation `BLOCKED`, not a performance conclusion. All ten full-002/workload-001/incremental-001 database/report/lock and decision targets remain absent and fresh.
- The authoritative [resume-003 execution Review](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/docs/review/2026-07-21-agent-runtime-gate-r1-resume-003-review.md), SHA-256 `0186e3280832ef5ccb5addef762830bdd809c8b297d4cb4b960798daae120b0b`, and [resume-003 independent Review](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/docs/review/2026-07-21-agent-runtime-gate-r1-resume-003-independent-review.md), SHA-256 `954e2505601d903b04fc9151d14a937b07ff5d136555c456c61171b0759ba653`, bind resume-003 as `BLOCKED`: its unique log is consumed with the immutable binding above, its PID remains absent/no-follow and does not count as evidence, and no run began. No performance conclusion may be drawn from that attempt.
- Attempt 001, resume 001, resume 002, resume 003, and resume 004 MUST be distinct sections in the final diagnosis Review or contingent resume-004 BLOCKED Review.

**Resume-004 fresh independent strict Preflight contract:** Before any execution claim, a new independent strict Preflight MUST bind the revised plan SHA-256 and re-run the complete current-state proof. It MUST: (A) verify the exact Maven launcher symlink/readlink, exact non-symlink executable real target, both dereferenced SHA-256 values, and exact Maven `3.9.16` revision using `/opt/homebrew/bin/mvn -version`, without any `brew`, installation, upgrade, relink, wrapper, PATH lookup, or fallback; (B) prove exactly eleven immutable historical evidence bindings, resume-003 PID absent/no-follow, exactly twelve fresh resume-004/run targets, both mutually exclusive Review targets fresh, exact success evidence `23`, scan `24`, valid JSON `5`, and all three singleton locks; (C) prove the Task 6 section still contains exactly eighteen `bash` fences and that every fence passes both `bash -n` and `zsh -n`; (D) prove all nine observer stages use exactly one initial `exec_command` shell with fixed `yield_time_ms=10000`, omitted `sandbox_permissions` and `justification`, and only bounded same-session empty `write_stdin` result collection when retained; then run the one actual-host pre observer shell, the fresh seven-case control-plane result-state matrix, and the unchanged fresh thirteen-case no-file observer-shell matrix with the exact final exit/output contract; (E) repeat disk, nonprinting credential, port/listener, protected-input stat-only, sidecar, target freshness, and control-plane metadata checks; and (F) run negative/static scans proving every current Java owner/readiness/disk/cleanup/final-audit reference is resume-004, resume-003 appears only in immutable history/absence/audit text, the only Java start executable is exact `/opt/homebrew/bin/mvn`, no bare Maven command or Homebrew command exists in an execution fence, observer shell `exec_command` count is exactly one per stage, every observer `write_stdin` targets only the retained same session with empty `chars` and fixed `yield_time_ms=5000`, there is no second observer exec/fallback/unbounded poll, and the targeted diff changes only this Task 6 in this plan. Any mismatch is `BLOCKED`; earlier Preflight results cannot be reused.

- [ ] **Step 1: Verify the exact resume-004 prestate and Maven binding without opening the protected input**

Run the following as one exact exec block from the feature worktree. It performs all Step 1 checks in one fresh shell and emits only sanitized prestate/disk results:

```bash
exec 2>/dev/null
ROOT="$(git rev-parse --show-toplevel)" || exit 95
GATE_D_PARENT="$ROOT/docs/verification/agent-runtime-v1/gate-d"
PARENT="$GATE_D_PARENT/performance-recovery"
GATE_R1="$PARENT/gate-r1"
INPUT="$ROOT/docs/verification/agent-runtime-v1/gate-d/gate-d-20260716-002/runtime.sqlite"
MCP_CONFIG="$ROOT/docs/verification/agent-runtime-v1/gate-d/gate-d-20260716-002/mcp-config.json"
JAVA_URL="http://127.0.0.1:18084"
PROFILE="$GATE_R1/attempt-002-profile.json"
FULL_DB="$GATE_R1/gate-r1-full-002.sqlite"
FULL_REPORT="$GATE_R1/gate-r1-full-002-report.json"
FULL_LOCK="$GATE_R1/gate-r1-full-002.sqlite.lock"
WORKLOAD_DB="$GATE_R1/gate-r1-workload-001.sqlite"
WORKLOAD_REPORT="$GATE_R1/gate-r1-workload-001-report.json"
WORKLOAD_LOCK="$GATE_R1/gate-r1-workload-001.sqlite.lock"
INCREMENTAL_DB="$GATE_R1/gate-r1-incremental-001.sqlite"
INCREMENTAL_REPORT="$GATE_R1/gate-r1-incremental-001-report.json"
INCREMENTAL_LOCK="$GATE_R1/gate-r1-incremental-001.sqlite.lock"
DECISION="$GATE_R1/gate-r1-decision.json"
ORIGINAL_JAVA_LOG="$GATE_R1/java-gateway-18084.log"
ORIGINAL_JAVA_PID="$GATE_R1/java-gateway-18084.pid"
RESUME_004_JAVA_LOG="$GATE_R1/java-gateway-18084-resume-004.log"
RESUME_004_JAVA_PID="$GATE_R1/java-gateway-18084-resume-004.pid"
RESUME_001_JAVA_LOG="$GATE_R1/java-gateway-18084-resume-001.log"
RESUME_001_JAVA_PID="$GATE_R1/java-gateway-18084-resume-001.pid"
RESUME_002_JAVA_LOG="$GATE_R1/java-gateway-18084-resume-002.log"
RESUME_002_JAVA_PID="$GATE_R1/java-gateway-18084-resume-002.pid"
RESUME_003_JAVA_LOG="$GATE_R1/java-gateway-18084-resume-003.log"
RESUME_003_JAVA_PID="$GATE_R1/java-gateway-18084-resume-003.pid"
PARTIAL_FULL_DB="$GATE_R1/gate-r1-full-001.sqlite"
PARTIAL_FULL_REPORT="$GATE_R1/gate-r1-full-001-report.json"
PARTIAL_FULL_LOCK="$GATE_R1/gate-r1-full-001.sqlite.lock"
DIAGNOSIS_REVIEW="$ROOT/docs/review/2026-07-17-agent-runtime-gate-r1-diagnosis-review.md"
BLOCKED_REVIEW="$ROOT/docs/review/2026-07-21-agent-runtime-gate-r1-resume-004-review.md"
AUTH_FILTER="$ROOT/backend/src/main/java/org/openharness/backend/api/AuthFilter.java"
MAVEN_LAUNCHER="/opt/homebrew/bin/mvn"
MAVEN_REAL="/opt/homebrew/Cellar/maven/3.9.16/bin/mvn"
test ! -L "$GATE_D_PARENT"
test -d "$GATE_D_PARENT"
test ! -L "$PARENT"
test -d "$PARENT"
test "$(stat -f '%Lp' "$PARENT")" = "700"
test ! -L "$GATE_R1"
test -d "$GATE_R1"
test "$(stat -f '%Lp' "$GATE_R1")" = "700"
verify_maven_binding() {
  test -L "$MAVEN_LAUNCHER" || return 1
  test "$(/usr/bin/readlink "$MAVEN_LAUNCHER")" = "../Cellar/maven/3.9.16/bin/mvn" || return 1
  test ! -L "$MAVEN_REAL" && test -f "$MAVEN_REAL" && test -x "$MAVEN_REAL" || return 1
  test "$(shasum -a 256 "$MAVEN_LAUNCHER" | awk '{print $1}')" = "840832118022e6adc8d87150debb16cef405710799925d527b9adcd70a33ffa1" || return 1
  test "$(shasum -a 256 "$MAVEN_REAL" | awk '{print $1}')" = "840832118022e6adc8d87150debb16cef405710799925d527b9adcd70a33ffa1" || return 1
  MAVEN_VERSION_OUTPUT="$("$MAVEN_LAUNCHER" -version 2>&1)" || return 1
  MAVEN_VERSION_LINE="$(printf '%s\n' "$MAVEN_VERSION_OUTPUT" | /usr/bin/sed -n '1p')" || return 1
  test "$MAVEN_VERSION_LINE" = "Apache Maven 3.9.16 (2bdd9fddda4b155ebf8000e807eb73fd829a51d5)" || return 1
  unset MAVEN_VERSION_LINE MAVEN_VERSION_OUTPUT
}
verify_maven_binding
verify_existing_binding() {
  evidence="$1"
  expected_size="$2"
  expected_sha="$3"
  test ! -L "$evidence" || return 1
  test -f "$evidence" || return 1
  test "$(stat -f '%Lp' "$evidence")" = "600" || return 1
  test "$(stat -f '%z' "$evidence")" = "$expected_size" || return 1
  test "$(shasum -a 256 "$evidence" | awk '{print $1}')" = "$expected_sha" || return 1
}
verify_existing_binding "$PROFILE" 10126 bd08cc930a1269814d2bde296ca13679574d9f4d5332c3f5ca3bc5efcb8e0541
verify_existing_binding "$ORIGINAL_JAVA_LOG" 4527 18ce69b6d16e9395e0ab62416f7bfbcf3b6cb1ae1169ed68a63ea5bba8049c02
verify_existing_binding "$ORIGINAL_JAVA_PID" 6 db053c15314038b9ec9b7c9e4efb3b5dd159f08825e35101660d70a527b91089
verify_existing_binding "$RESUME_001_JAVA_LOG" 99731235 5e103d31edf342e6ec0f6121141517a0c0196cbbe6c644985dda16351216c52f
verify_existing_binding "$RESUME_001_JAVA_PID" 6 4667fcf59d1f03c1db90f299b115525df71eb7da8d3cc46211e6a18fa8f5f1c7
verify_existing_binding "$PARTIAL_FULL_DB" 240963584 cc90a03bbb4887b7b2705768fe3ef357e7b1c8889d9f7564d02c32abb596714f
verify_existing_binding "$PARTIAL_FULL_REPORT" 0 e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
verify_existing_binding "$PARTIAL_FULL_LOCK" 0 e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
verify_existing_binding "$RESUME_002_JAVA_LOG" 4527 311460c74635cc30a938b5f9d5a37b8018748c7e10a44f13da8aa598bc134c82
verify_existing_binding "$RESUME_002_JAVA_PID" 6 26769b0d0c1b476354ee6439b92c84a21c89bec06418a20fa8fa0663bd172393
verify_existing_binding "$RESUME_003_JAVA_LOG" 31 4707abc6949e53eb9225dc8181e2be5e3c6201ad35d9c33cab43bb627992dfd7
test ! -e "$RESUME_003_JAVA_PID" && test ! -L "$RESUME_003_JAVA_PID"
for fresh in \
  "$FULL_DB" "$FULL_REPORT" "$FULL_LOCK" "$WORKLOAD_DB" "$WORKLOAD_REPORT" "$WORKLOAD_LOCK" \
  "$INCREMENTAL_DB" "$INCREMENTAL_REPORT" "$INCREMENTAL_LOCK" "$DECISION" \
  "$RESUME_004_JAVA_LOG" "$RESUME_004_JAVA_PID"
do
  test ! -e "$fresh" && test ! -L "$fresh"
done
test ! -e "$DIAGNOSIS_REVIEW" && test ! -L "$DIAGNOSIS_REVIEW"
test ! -e "$BLOCKED_REVIEW" && test ! -L "$BLOCKED_REVIEW"
jq -e '
  .schemaVersion == 1 and
  .track == "local" and
  .evidenceKind == "gate-d-offline-database-profile" and
  .databaseBytes == 1835978752 and
  .tableRows.runtime_events == 2671288 and
  .eventDeliveryStatus.pending == 2671288 and
  ([.eventDeliveryStatus | to_entries[] | select(.key != "pending") | .value] | all(. == 0)) and
  (.tableRows as $rows |
    all(["conversations", "messages", "executions", "approvals"][];
      ($rows[.] | type) == "number" and $rows[.] >= 0 and ($rows[.] | floor) == $rows[.])) and
  (.queryPlans | length) == 15 and
  all(.queryPlans[]; (.plan | type) == "array" and (.durationMs | type) == "number" and .durationMs >= 0)
' "$PROFILE" >/dev/null
test ! -L "$INPUT"
test -f "$INPUT"
INPUT_IDENTITY_PRE="$(stat -f '%d:%i:%z:%m:%c' "$INPUT")" || exit 96
test "$INPUT_IDENTITY_PRE" = "16777232:165257457:1835978752:1784167299:1784167299"
test ! -e "${INPUT}-wal" && test ! -L "${INPUT}-wal"
test ! -e "${INPUT}-shm" && test ! -L "${INPUT}-shm"
test -z "$(lsof -nP -iTCP:18084 -sTCP:LISTEN -t)"
AVAILABLE_KIB="$(LC_ALL=C df -Pk "$GATE_R1" | LC_ALL=C awk 'NR == 2 { value = $4; rows += 1 } END { if (rows != 1 || value !~ /^[0-9]+$/) exit 1; print value }')" || exit 95
case "$AVAILABLE_KIB" in (*[!0-9]*|'') exit 95;; esac
test "$AVAILABLE_KIB" -ge 12582912 || exit 95
printf 'protected_input=pass tuple=16777232:165257457:1835978752:1784167299:1784167299 wal=absent shm=absent\n'
printf 'maven_binding=pass version=3.9.16 revision=2bdd9fddda4b155ebf8000e807eb73fd829a51d5 sha256=840832118022e6adc8d87150debb16cef405710799925d527b9adcd70a33ffa1\n'
printf 'disk_gate=pass available_kib=%s\n' "$AVAILABLE_KIB"
unset AVAILABLE_KIB MAVEN_LAUNCHER MAVEN_REAL
```

The protected attempt-002 main database may receive `stat` only. Do not hash, open, query, copy, move, rename, delete, write, chmod, or otherwise read its content. Do not create or touch its sidecars. The existing profile is the immutable aggregate authority; resume MUST NOT invoke the profiler again. Step 8 compares the same fixed tuple directly, not a shell variable from this exec. Process cleanliness is decided only by the single-shell structured observer protocol in Step 5.

The Maven binding and initial headroom gate both run before any new target is claimed. The launcher MUST remain the exact symlink `/opt/homebrew/bin/mvn` → `../Cellar/maven/3.9.16/bin/mvn`; the dereferenced target MUST remain the non-symlink regular executable `/opt/homebrew/Cellar/maven/3.9.16/bin/mvn`; both dereferenced SHA-256 values MUST equal `840832118022e6adc8d87150debb16cef405710799925d527b9adcd70a33ffa1`; and `-version` MUST exit `0` with first line `Apache Maven 3.9.16 (2bdd9fddda4b155ebf8000e807eb73fd829a51d5)`. Java `26.0.1` may be recorded as additional context but is not a substitute for any fixed Maven assertion. The execution chain MUST NOT use a bare `mvn`, PATH fallback, Maven wrapper, another launcher/target, or any Homebrew command. `brew list --versions maven` is not an execution dependency and MUST NOT be run.

`attempt-002` is `1,835,978,752` bytes; three fixed 30-minute variants can each materialize a database of that order, and the prior ~24-minute resume produced a `240,963,584`-byte partial database plus a `99,731,235`-byte Java log. `12 GiB` (`12,582,912 KiB`) is therefore a conservative, mechanically fixed reserve: it exceeds twice the three-input-size baseline and leaves room for continued database, report, lock, and log growth. The observed planning-time value `174,617,248 KiB` is context only and is not an execution-time promise.

Any Maven-binding/version/hash failure, disk parsing failure, or available space below `12,582,912 KiB` is immediately `BLOCKED`. Do not install, relink, repair, fall back, or delete, truncate, compress, relocate, or otherwise clean evidence/worktree files to make space.

- [ ] **Step 2: Prove credential extraction on this host before claiming resume evidence**

The backend constant is a complete HTTP header (`Bearer ` plus credential), while `OPENHARNESS_SERVICE_TOKEN` is the raw credential. Both the selfcheck and run wrapper use macOS/POSIX BRE interval syntax `[^"]\{1,\}`. The selfcheck MUST finish after the Maven availability gate and before creating either resume-004 Java target, and MUST emit no credential value, length, or source line.

```bash
ROOT="$(git rev-parse --show-toplevel)" || exit 97
AUTH_FILTER="$ROOT/backend/src/main/java/org/openharness/backend/api/AuthFilter.java"
credential_selfcheck() (
  set +x
  declaration_count="$(awk '
    /^[[:space:]]*private static final String TOKEN = "Bearer [^"]+";[[:space:]]*$/ { count += 1 }
    END { print count + 0 }
  ' "$AUTH_FILTER")" || exit 97
  test "$declaration_count" = "1" || exit 97
  raw_credential="$(/usr/bin/sed -n \
    's/^[[:space:]]*private static final String TOKEN = "Bearer \([^\"]\{1,\}\)";[[:space:]]*$/\1/p' \
    "$AUTH_FILTER")" || exit 97
  test -n "$raw_credential" || exit 97
  case "$raw_credential" in (*[[:space:]]*) exit 97;; esac
  case "$raw_credential" in (Bearer*) exit 97;; esac
  unset raw_credential
)
credential_selfcheck
```

Each run exec in Step 5 independently redefines the identical wrapper. No shell tracing, credential argv, `.env`, temporary credential file, token echo, complete-header export, or double `Bearer ` prefix is allowed.

- [ ] **Step 3: Rebind Maven and start the fresh resume-004 Java owner**

Never inspect, reuse, stop, or alter listeners on ports `8080` or `18080`. The Task 6 executor owns only a new listener on `127.0.0.1:18084`. In a controlled PTY session whose session id remains in the executor control plane, start from the [backend directory](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/backend/) with:

```bash
ROOT="$(git rev-parse --show-toplevel)" || exit 98
GATE_R1="$ROOT/docs/verification/agent-runtime-v1/gate-d/performance-recovery/gate-r1"
JAVA_URL="http://127.0.0.1:18084"
RESUME_004_JAVA_LOG="$GATE_R1/java-gateway-18084-resume-004.log"
RESUME_004_JAVA_PID="$GATE_R1/java-gateway-18084-resume-004.pid"
MAVEN_LAUNCHER="/opt/homebrew/bin/mvn"
MAVEN_REAL="/opt/homebrew/Cellar/maven/3.9.16/bin/mvn"
verify_maven_binding() {
  test -L "$MAVEN_LAUNCHER" || return 1
  test "$(/usr/bin/readlink "$MAVEN_LAUNCHER")" = "../Cellar/maven/3.9.16/bin/mvn" || return 1
  test ! -L "$MAVEN_REAL" && test -f "$MAVEN_REAL" && test -x "$MAVEN_REAL" || return 1
  test "$(shasum -a 256 "$MAVEN_LAUNCHER" | awk '{print $1}')" = "840832118022e6adc8d87150debb16cef405710799925d527b9adcd70a33ffa1" || return 1
  test "$(shasum -a 256 "$MAVEN_REAL" | awk '{print $1}')" = "840832118022e6adc8d87150debb16cef405710799925d527b9adcd70a33ffa1" || return 1
  MAVEN_VERSION_OUTPUT="$("$MAVEN_LAUNCHER" -version 2>&1)" || return 1
  MAVEN_VERSION_LINE="$(printf '%s\n' "$MAVEN_VERSION_OUTPUT" | /usr/bin/sed -n '1p')" || return 1
  test "$MAVEN_VERSION_LINE" = "Apache Maven 3.9.16 (2bdd9fddda4b155ebf8000e807eb73fd829a51d5)" || return 1
  unset MAVEN_VERSION_LINE MAVEN_VERSION_OUTPUT
}
verify_maven_binding || exit 98
test ! -e "$RESUME_004_JAVA_LOG" && test ! -L "$RESUME_004_JAVA_LOG" || exit 98
test ! -e "$RESUME_004_JAVA_PID" && test ! -L "$RESUME_004_JAVA_PID" || exit 98
cd "$ROOT/backend" || exit 98
umask 077
set -o pipefail
( set -C; : > "$RESUME_004_JAVA_LOG" ) || exit 98
test ! -L "$RESUME_004_JAVA_LOG"
test -f "$RESUME_004_JAVA_LOG"
test "$(stat -f '%Lp' "$RESUME_004_JAVA_LOG")" = "600"
/opt/homebrew/bin/mvn spring-boot:run -Dspring-boot.run.arguments=--server.port=18084 2>&1 | tee -a "$RESUME_004_JAVA_LOG"
```

The Maven/Java command receives no service credential. Wait for lifecycle readiness and bind the unique listener without printing health payload or command text:

```bash
ROOT="$(git rev-parse --show-toplevel)" || exit 98
GATE_R1="$ROOT/docs/verification/agent-runtime-v1/gate-d/performance-recovery/gate-r1"
JAVA_URL="http://127.0.0.1:18084"
RESUME_004_JAVA_LOG="$GATE_R1/java-gateway-18084-resume-004.log"
RESUME_004_JAVA_PID="$GATE_R1/java-gateway-18084-resume-004.pid"
test ! -L "$RESUME_004_JAVA_LOG" && test -f "$RESUME_004_JAVA_LOG" || exit 98
test "$(stat -f '%Lp' "$RESUME_004_JAVA_LOG")" = "600" || exit 98
test ! -e "$RESUME_004_JAVA_PID" && test ! -L "$RESUME_004_JAVA_PID" || exit 98
curl -fsS --max-time 2 "$JAVA_URL/actuator/health" | jq -e '.status == "UP"' >/dev/null
BOUND_JAVA_PID="$(lsof -nP -iTCP:18084 -sTCP:LISTEN -t)"
test -n "$BOUND_JAVA_PID"
test "$(printf '%s\n' "$BOUND_JAVA_PID" | wc -l | tr -d ' ')" = "1"
case "$BOUND_JAVA_PID" in (*[!0-9]*|'') exit 98;; esac
BOUND_JAVA_COMMAND="$(ps -p "$BOUND_JAVA_PID" -o command=)" || exit 98
case "$BOUND_JAVA_COMMAND" in (*org.openharness.backend.OpenHarnessBackendApplication*) :;; (*) exit 98;; esac
case "$BOUND_JAVA_COMMAND" in (*--server.port=18084*) :;; (*) exit 98;; esac
unset BOUND_JAVA_COMMAND
( umask 077; set -C; printf '%s\n' "$BOUND_JAVA_PID" > "$RESUME_004_JAVA_PID" ) || exit 98
test "$(stat -f '%Lp' "$RESUME_004_JAVA_LOG")" = "600"
test "$(stat -f '%Lp' "$RESUME_004_JAVA_PID")" = "600"
test "$(/usr/bin/sed -n '1p' "$RESUME_004_JAVA_PID")" = "$BOUND_JAVA_PID"
test "$(wc -l < "$RESUME_004_JAVA_PID" | tr -d ' ')" = "1"
printf 'java_binding=pass pid=%s port=18084\n' "$BOUND_JAVA_PID"
```

This readiness check does not replace the diagnostic CLI's reviewed Java/MCP probes. A second listener, changed fingerprint, early PTY exit, missing readiness, or existing PID target is `BLOCKED`; do not fall back to another port or process.

The executor retains the resume-004 Java PTY session id and bound PID for mandatory process cleanup. Only the process bound by `$RESUME_004_JAVA_PID` is owned. The original/resume-001/resume-002 PID records are historical proof, while resume-003 PID remains absent; none plays an ownership role. The same resume-004 Java process remains alive for all three serial runs and analyze; it is never restarted between variants.

- [ ] **Step 4: Apply the reviewed built-in start gate**

There is no diagnostic `probe` command and none may be invented. Step 4 is the reviewed atomic preamble inside every `diagnostic:gate-d-performance run`: after path/config validation, the CLI reads the token from its environment, probes Java health/catalog then `gate-d-no-tool`, `tool-time`, and `mcp-qualification-echo`, performs MCP initialize/catalog/echo/shutdown, and only after every probe passes calls `runDiagnostic` and spawns the Runtime child. The full run supplies the first reconfirmation; workload and incremental repeat the entire gate. The first probe failure exits `2`, no Runtime child may be created, and execution stops without retry.

`resume-004` adds no probe command or implementation change.

- [ ] **Step 5: Execute the three fixed variants strictly serially with single-shell control-plane observers**

The order is fixed: `gate-r1-full-002` → `gate-r1-workload-001` → `gate-r1-incremental-001`. All variants retain the fixed 30-minute duration, 30-second interval, and exactly 60 samples. Immediately before each variant, execute its corresponding independent pre-run gate below from a fresh worktree shell. Each gate emits only sanitized disk evidence; parsing failure, headroom below `12,582,912 KiB`, stale/fresh-target mismatch, or Java listener identity mismatch is `BLOCKED`.

Full-002 pre-run gate:

```bash
exec 2>/dev/null
ROOT="$(git rev-parse --show-toplevel)" || exit 95
GATE_R1="$ROOT/docs/verification/agent-runtime-v1/gate-d/performance-recovery/gate-r1"
JAVA_URL="http://127.0.0.1:18084"
RESUME_004_JAVA_PID="$GATE_R1/java-gateway-18084-resume-004.pid"
FULL_DB="$GATE_R1/gate-r1-full-002.sqlite"
FULL_REPORT="$GATE_R1/gate-r1-full-002-report.json"
FULL_LOCK="$GATE_R1/gate-r1-full-002.sqlite.lock"
AVAILABLE_KIB="$(LC_ALL=C df -Pk "$GATE_R1" | LC_ALL=C awk 'NR == 2 { value = $4; rows += 1 } END { if (rows != 1 || value !~ /^[0-9]+$/) exit 1; print value }')" || exit 95
case "$AVAILABLE_KIB" in (*[!0-9]*|'') exit 95;; esac
test "$AVAILABLE_KIB" -ge 12582912 || exit 95
test ! -L "$RESUME_004_JAVA_PID" && test -f "$RESUME_004_JAVA_PID" || exit 95
test "$(stat -f '%Lp' "$RESUME_004_JAVA_PID")" = "600" || exit 95
EXPECTED_JAVA_PID="$(/usr/bin/sed -n '1p' "$RESUME_004_JAVA_PID")" || exit 95
case "$EXPECTED_JAVA_PID" in (*[!0-9]*|'') exit 95;; esac
test "$(wc -l < "$RESUME_004_JAVA_PID" | tr -d ' ')" = "1" || exit 95
LISTENER_PID="$(lsof -nP -iTCP:18084 -sTCP:LISTEN -t)" || exit 95
test "$LISTENER_PID" = "$EXPECTED_JAVA_PID" || exit 95
JAVA_COMMAND="$(ps -p "$EXPECTED_JAVA_PID" -o command=)" || exit 95
case "$JAVA_COMMAND" in (*org.openharness.backend.OpenHarnessBackendApplication*) :;; (*) exit 95;; esac
case "$JAVA_COMMAND" in (*--server.port=18084*) :;; (*) exit 95;; esac
for fresh in "$FULL_DB" "$FULL_REPORT" "$FULL_LOCK"
do
  test ! -e "$fresh" && test ! -L "$fresh" || exit 95
done
printf 'disk_gate=pass available_kib=%s\n' "$AVAILABLE_KIB"
unset JAVA_COMMAND EXPECTED_JAVA_PID LISTENER_PID AVAILABLE_KIB
```

Workload-001 pre-run gate:

```bash
exec 2>/dev/null
ROOT="$(git rev-parse --show-toplevel)" || exit 95
GATE_R1="$ROOT/docs/verification/agent-runtime-v1/gate-d/performance-recovery/gate-r1"
JAVA_URL="http://127.0.0.1:18084"
RESUME_004_JAVA_PID="$GATE_R1/java-gateway-18084-resume-004.pid"
WORKLOAD_DB="$GATE_R1/gate-r1-workload-001.sqlite"
WORKLOAD_REPORT="$GATE_R1/gate-r1-workload-001-report.json"
WORKLOAD_LOCK="$GATE_R1/gate-r1-workload-001.sqlite.lock"
AVAILABLE_KIB="$(LC_ALL=C df -Pk "$GATE_R1" | LC_ALL=C awk 'NR == 2 { value = $4; rows += 1 } END { if (rows != 1 || value !~ /^[0-9]+$/) exit 1; print value }')" || exit 95
case "$AVAILABLE_KIB" in (*[!0-9]*|'') exit 95;; esac
test "$AVAILABLE_KIB" -ge 12582912 || exit 95
test ! -L "$RESUME_004_JAVA_PID" && test -f "$RESUME_004_JAVA_PID" || exit 95
test "$(stat -f '%Lp' "$RESUME_004_JAVA_PID")" = "600" || exit 95
EXPECTED_JAVA_PID="$(/usr/bin/sed -n '1p' "$RESUME_004_JAVA_PID")" || exit 95
case "$EXPECTED_JAVA_PID" in (*[!0-9]*|'') exit 95;; esac
test "$(wc -l < "$RESUME_004_JAVA_PID" | tr -d ' ')" = "1" || exit 95
LISTENER_PID="$(lsof -nP -iTCP:18084 -sTCP:LISTEN -t)" || exit 95
test "$LISTENER_PID" = "$EXPECTED_JAVA_PID" || exit 95
JAVA_COMMAND="$(ps -p "$EXPECTED_JAVA_PID" -o command=)" || exit 95
case "$JAVA_COMMAND" in (*org.openharness.backend.OpenHarnessBackendApplication*) :;; (*) exit 95;; esac
case "$JAVA_COMMAND" in (*--server.port=18084*) :;; (*) exit 95;; esac
for fresh in "$WORKLOAD_DB" "$WORKLOAD_REPORT" "$WORKLOAD_LOCK"
do
  test ! -e "$fresh" && test ! -L "$fresh" || exit 95
done
printf 'disk_gate=pass available_kib=%s\n' "$AVAILABLE_KIB"
unset JAVA_COMMAND EXPECTED_JAVA_PID LISTENER_PID AVAILABLE_KIB
```

Incremental-001 pre-run gate:

```bash
exec 2>/dev/null
ROOT="$(git rev-parse --show-toplevel)" || exit 95
GATE_R1="$ROOT/docs/verification/agent-runtime-v1/gate-d/performance-recovery/gate-r1"
JAVA_URL="http://127.0.0.1:18084"
RESUME_004_JAVA_PID="$GATE_R1/java-gateway-18084-resume-004.pid"
INCREMENTAL_DB="$GATE_R1/gate-r1-incremental-001.sqlite"
INCREMENTAL_REPORT="$GATE_R1/gate-r1-incremental-001-report.json"
INCREMENTAL_LOCK="$GATE_R1/gate-r1-incremental-001.sqlite.lock"
AVAILABLE_KIB="$(LC_ALL=C df -Pk "$GATE_R1" | LC_ALL=C awk 'NR == 2 { value = $4; rows += 1 } END { if (rows != 1 || value !~ /^[0-9]+$/) exit 1; print value }')" || exit 95
case "$AVAILABLE_KIB" in (*[!0-9]*|'') exit 95;; esac
test "$AVAILABLE_KIB" -ge 12582912 || exit 95
test ! -L "$RESUME_004_JAVA_PID" && test -f "$RESUME_004_JAVA_PID" || exit 95
test "$(stat -f '%Lp' "$RESUME_004_JAVA_PID")" = "600" || exit 95
EXPECTED_JAVA_PID="$(/usr/bin/sed -n '1p' "$RESUME_004_JAVA_PID")" || exit 95
case "$EXPECTED_JAVA_PID" in (*[!0-9]*|'') exit 95;; esac
test "$(wc -l < "$RESUME_004_JAVA_PID" | tr -d ' ')" = "1" || exit 95
LISTENER_PID="$(lsof -nP -iTCP:18084 -sTCP:LISTEN -t)" || exit 95
test "$LISTENER_PID" = "$EXPECTED_JAVA_PID" || exit 95
JAVA_COMMAND="$(ps -p "$EXPECTED_JAVA_PID" -o command=)" || exit 95
case "$JAVA_COMMAND" in (*org.openharness.backend.OpenHarnessBackendApplication*) :;; (*) exit 95;; esac
case "$JAVA_COMMAND" in (*--server.port=18084*) :;; (*) exit 95;; esac
for fresh in "$INCREMENTAL_DB" "$INCREMENTAL_REPORT" "$INCREMENTAL_LOCK"
do
  test ! -e "$fresh" && test ! -L "$fresh" || exit 95
done
printf 'disk_gate=pass available_kib=%s\n' "$AVAILABLE_KIB"
unset JAVA_COMMAND EXPECTED_JAVA_PID LISTENER_PID AVAILABLE_KIB
```

Each variant uses three distinct observer stages: `pre-run-clean` immediately before starting the run, `active-chain` immediately after the run exec session is known active, and `post-run-no-orphan` exactly once after that same exec session returns. Every stage MUST start exactly one observer shell with one control-plane `exec_command`; an immediate numeric result may be validated directly, while a retained running session may be collected only through the bounded same-session protocol below. The execution Agent MUST first verify the bound control-plane metadata is filesystem `unrestricted` / `danger-full-access` with approval policy `never`; any mismatch is `BLOCKED`. The sole shell-start call for each stage MUST omit both `sandbox_permissions` and `justification`, use fixed `yield_time_ms=10000`, and directly read the host process table. This is a no-sandbox host invocation, not an ordinary-sandbox attempt, fallback, escalation, second observer shell, second observer exec, or observer retry. The Task 6 execution Agent itself evaluates the complete collected result; it MUST NOT depend on another Agent, root, an asynchronous correction, or external coordination.

For each observation, execute the whole block below as one control-plane exec, setting only the first two constants to one authorized matrix row. Authorized rows are exactly the nine combinations of the three observer kinds with the corresponding runId:

| Variant | Pre | Active | Post |
|---|---|---|---|
| full-oracle | `pre-run-clean` / `gate-r1-full-002` | `active-chain` / `gate-r1-full-002` | `post-run-no-orphan` / `gate-r1-full-002` |
| workload-only | `pre-run-clean` / `gate-r1-workload-001` | `active-chain` / `gate-r1-workload-001` | `post-run-no-orphan` / `gate-r1-workload-001` |
| incremental-oracle | `pre-run-clean` / `gate-r1-incremental-001` | `active-chain` / `gate-r1-incremental-001` | `post-run-no-orphan` / `gate-r1-incremental-001` |

The nine authorized observer-shell start calls are exactly:

1. `pre-run-clean` / `gate-r1-full-002`: `exec_command`, `yield_time_ms=10000`; `sandbox_permissions` omitted (control plane unrestricted; field forbidden); `justification` omitted
2. `active-chain` / `gate-r1-full-002`: `exec_command`, `yield_time_ms=10000`; `sandbox_permissions` omitted (control plane unrestricted; field forbidden); `justification` omitted
3. `post-run-no-orphan` / `gate-r1-full-002`: `exec_command`, `yield_time_ms=10000`; `sandbox_permissions` omitted (control plane unrestricted; field forbidden); `justification` omitted
4. `pre-run-clean` / `gate-r1-workload-001`: `exec_command`, `yield_time_ms=10000`; `sandbox_permissions` omitted (control plane unrestricted; field forbidden); `justification` omitted
5. `active-chain` / `gate-r1-workload-001`: `exec_command`, `yield_time_ms=10000`; `sandbox_permissions` omitted (control plane unrestricted; field forbidden); `justification` omitted
6. `post-run-no-orphan` / `gate-r1-workload-001`: `exec_command`, `yield_time_ms=10000`; `sandbox_permissions` omitted (control plane unrestricted; field forbidden); `justification` omitted
7. `pre-run-clean` / `gate-r1-incremental-001`: `exec_command`, `yield_time_ms=10000`; `sandbox_permissions` omitted (control plane unrestricted; field forbidden); `justification` omitted
8. `active-chain` / `gate-r1-incremental-001`: `exec_command`, `yield_time_ms=10000`; `sandbox_permissions` omitted (control plane unrestricted; field forbidden); `justification` omitted
9. `post-run-no-orphan` / `gate-r1-incremental-001`: `exec_command`, `yield_time_ms=10000`; `sandbox_permissions` omitted (control plane unrestricted; field forbidden); `justification` omitted

The observer control-plane result collector is fail closed and applies identically to the Preflight actual-host observer and all nine execution stages:

- Every initial or poll result MUST contain an `output` string; the string may be empty before completion. Preserve every chunk verbatim and in return order.
- If the initial `exec_command` result contains an integer numeric `exit_code`, `session_id` MUST be absent. Stop collection immediately and validate that result; a numeric string, float, boolean, null, or other non-integer exit value is `BLOCKED`.
- If the initial result has no `exit_code`, it MUST contain one positive integer retained `session_id`. Preserve the initial output chunk and enter same-session collection. If both fields are absent, both are present, or the session value is not a positive integer, return `BLOCKED`.
- Same-session collection may call only `write_stdin` with that exact retained `session_id`, `chars` exactly empty, and fixed `yield_time_ms=5000`; it MUST send no byte, control character, newline, or signal. It may poll at most `20` times and spend at most `100` additional seconds. A poll with integer numeric `exit_code` MUST have no `session_id` and ends collection immediately. A poll without `exit_code` MUST return the same positive integer `session_id`. A missing/changed session, exit/session conflict, non-integer exit, malformed result, or tool error is immediately `BLOCKED`; no second `exec_command`, second observer shell, fallback, correction, or unbounded poll is permitted. If poll `20` returns no numeric exit, return timeout `BLOCKED`.
- Only after collection ends with a numeric exit does the Agent concatenate the initial and poll output chunks in exact return order and apply the unchanged stdout regex, exit/reason/role matrix, kind/runId checks, row counts, unique-PID rules, and ancestry proof below to that complete stdout. It MUST NOT accept or discard an early row before the final result. Any early, extra, duplicate, malformed, or non-string text remains present in the complete stdout and is `BLOCKED`.
- For every stage, record only the initial result form (`immediate-numeric` or `retained-session`), whether a retained session was used, poll count, final numeric exit, sanitized complete stdout, and final structural verdict. Do not record a numeric session identifier, command, environment, path, process snapshot, or secret.

The fresh independent strict Preflight MUST first inspect the actual tool-call/control-plane metadata and prove filesystem `unrestricted` / `danger-full-access` with approval policy `never`; a missing or different value is `BLOCKED`. It MUST then prove the exact sole shell-start envelope is `exec_command` with fixed `yield_time_ms=10000`, no `sandbox_permissions` field, and no `justification` field, and that there is no sandbox attempt, fallback, escalation, second observer exec, or retry path. Before reading the actual host, it MUST exercise a fresh no-file control-plane result-state synthetic matrix: immediate integer exit `0` plus one clean row is `PASS`; retained positive same session followed by integer exit `0` plus the same complete clean row is `PASS`; missing both exit and session is `BLOCKED`; changed session is `BLOCKED`; non-integer exit is `BLOCKED`; twenty same-session polls without an exit are timeout `BLOCKED`; and otherwise-clean exit `0` with extra stdout is `BLOCKED`. The retained-session PASS case MUST concatenate initial and poll chunks in return order, and the matrix MUST prove that every poll uses empty `chars`, fixed `yield_time_ms=5000`, the same session, at most `20` polls, and never a second `exec_command`.

Using the exact sole shell-start envelope, the Preflight MUST then start one actual-host observer shell executing the full block below as `pre-run-clean` / `gate-r1-full-002` and read the host process table directly. The initial result may be immediate numeric or a retained positive session collected only by the bounded protocol above, but the final numeric exit MUST be `0` and the complete stdout MUST be exactly one sanitized `observer=pre-run-clean runId=gate-r1-full-002 reason=clean role=none pid=0 ppid=0` row. A tool rejection, timeout, result-state violation, malformed/extra output, process-present result, or unavailable host process table is `BLOCKED`. It MUST also exercise the unchanged fresh thirteen-case no-file observer-shell matrix: synthetic pre/post clean, process-present, and snapshot-failure paths; selected current coherent active chain exit `0`; wrong ancestry, duplicate, current-missing, clean-timeout, and a coherent selected chain plus a separate fingerprinted foreign-run `gate-r1-*` CLI each exit `41`; and active snapshot acquisition failure exit `45`. The foreign-CLI fixture MUST emit sanitized `process-present` candidate rows for both the selected/current CLI and the foreign CLI, without command, environment, path, or secret text. Synthetic result-state collection and bounded polling do not read a process table or start another shell; same-session `write_stdin` is result collection, not an observer retry. This is a new independent Preflight of the revised same `resume-004`, not a fifth resume, and it does not claim any execution stage; after Preflight `PASS`, all nine future execution observers remain separate single-shell stages under the authorized envelopes above.

```bash
OBS_KIND='active-chain'
RUN_ID='gate-r1-full-002'
exec 2>/dev/null
observer_sample() {
  snapshot="$(LC_ALL=C ps -Ao pid=,ppid=,command=)" || return 45
  printf '%s\n' "$snapshot" | LC_ALL=C awk -v observer="$OBS_KIND" -v run_id="$RUN_ID" '
  function descendant(child, ancestor, p, hops) {
    p = parent[child]
    hops = 0
    while (p > 0 && hops < 4096) {
      if (p == ancestor) return 1
      p = parent[p]
      hops += 1
    }
    return 0
  }
  function mark_path(child, ancestor, p, hops) {
    p = parent[child]
    hops = 0
    while (p > 0 && p != ancestor && hops < 4096) {
      if (!(p in role)) role[p] = "bridge"
      p = parent[p]
      hops += 1
    }
  }
  function emit_candidates(i, pid) {
    for (i = 1; i <= rows; i += 1) {
      pid = order[i]
      if (pid in candidate_role)
        printf "observer=%s runId=%s reason=process-present role=%s pid=%d ppid=%d\n", observer, run_id, candidate_role[pid], pid, parent[pid]
    }
  }
  BEGIN {
    diagnostic = "gateDPerformanceDiagnostic" "Cli"
    runtime = "formalSoakRuntime" "Child.ts"
    fixture = "qualification-" "server.ts"
  }
  {
    pid = $1 + 0
    ppid = $2 + 0
    text = $0
    sub(/^[[:space:]]*[0-9]+[[:space:]]+[0-9]+[[:space:]]+/, "", text)
    parent[pid] = ppid
    order[++rows] = pid
    command[pid] = text
    if (index(text, diagnostic) && index(text, "gate-r1-")) {
      candidate_role[pid] = "cli"
      any_task6 = 1
      all_cli[++all_cli_count] = pid
      if (index(text, run_id)) selected_cli[++selected_cli_count] = pid
    }
    if (index(text, runtime)) {
      candidate_role[pid] = "runtime"
      runtime_pid[++runtime_count] = pid
      any_task6 = 1
    }
    if (index(text, fixture)) {
      candidate_role[pid] = "mcp"
      mcp[++mcp_count] = pid
      any_task6 = 1
    }
  }
  END {
    if (observer == "pre-run-clean" || observer == "post-run-no-orphan") {
      if (any_task6) {
        emit_candidates()
        exit 42
      }
      printf "observer=%s runId=%s reason=clean role=none pid=0 ppid=0\n", observer, run_id
      exit 0
    }
    if (observer != "active-chain") exit 45
    if (selected_cli_count == 0) {
      if (any_task6) {
        emit_candidates()
        exit 44
      }
      printf "observer=%s runId=%s reason=clean role=none pid=0 ppid=0\n", observer, run_id
      exit 42
    }
    if (all_cli_count != 1 || selected_cli_count != 1 || all_cli[1] != selected_cli[1] || runtime_count > 1) {
      emit_candidates()
      exit 44
    }
    if (runtime_count == 0 || mcp_count < 1) {
      emit_candidates()
      exit 43
    }
    c = selected_cli[1]
    r = runtime_pid[1]
    if (!descendant(r, c)) {
      emit_candidates()
      exit 44
    }
    role[c] = "cli"
    role[r] = "runtime"
    mark_path(r, c)
    for (i = 1; i <= mcp_count; i += 1) {
      if (!descendant(mcp[i], r)) {
        emit_candidates()
        exit 44
      }
      role[mcp[i]] = "mcp"
      mark_path(mcp[i], r)
    }
    for (i = 1; i <= rows; i += 1) {
      pid = order[i]
      if (pid in role)
        printf "observer=%s runId=%s reason=process-present role=%s pid=%d ppid=%d\n", observer, run_id, role[pid], pid, parent[pid]
    }
  }
'
}

snapshot_failure_result() {
  printf 'observer=%s runId=%s reason=snapshot-failure role=none pid=0 ppid=0\n' "$OBS_KIND" "$RUN_ID"
  exit 45
}

blocked_result() {
  if test -n "$last_result"
  then
    printf '%s\n' "$last_result"
  else
    printf 'observer=%s runId=%s reason=clean role=none pid=0 ppid=0\n' "$OBS_KIND" "$RUN_ID"
  fi
  exit 41
}

case "$OBS_KIND" in
  pre-run-clean)
    result="$(observer_sample)"
    sample_status=$?
    case "$sample_status" in
      0)
        printf '%s\n' "$result"
        exit 0
        ;;
      42)
        last_result="$result"
        blocked_result
        ;;
      *)
        snapshot_failure_result
        ;;
    esac
    ;;
  active-chain)
    attempt=0
    saw_cli=0
    last_result="observer=$OBS_KIND runId=$RUN_ID reason=clean role=none pid=0 ppid=0"
    while test "$attempt" -lt 240
    do
      result="$(observer_sample)"
      sample_status=$?
      case "$sample_status" in
        0)
          printf '%s\n' "$result"
          exit 0
          ;;
        42)
          last_result="$result"
          test "$saw_cli" -eq 0 || blocked_result
          ;;
        43)
          last_result="$result"
          saw_cli=1
          ;;
        44)
          last_result="$result"
          case "$result" in (*' role=cli '*) saw_cli=1;; esac
          ;;
        *)
          snapshot_failure_result
          ;;
      esac
      attempt=$((attempt + 1))
      test "$attempt" -lt 240 || break
      sleep 0.25 || snapshot_failure_result
    done
    blocked_result
    ;;
  post-run-no-orphan)
    attempt=0
    last_result=""
    while test "$attempt" -lt 240
    do
      result="$(observer_sample)"
      sample_status=$?
      case "$sample_status" in
        0)
          printf '%s\n' "$result"
          exit 0
          ;;
        42)
          last_result="$result"
          ;;
        *)
          snapshot_failure_result
          ;;
      esac
      attempt=$((attempt + 1))
      test "$attempt" -lt 240 || break
      sleep 0.25 || snapshot_failure_result
    done
    blocked_result
    ;;
  *)
    snapshot_failure_result
    ;;
esac
```

This is bounded readiness/settle sampling inside one observer command and one observer shell started by exactly one unrestricted/no-sandbox `exec_command`, not observer retry or later correction. Optional bounded `write_stdin` calls only collect that same shell's result and do not sample the process table, write to the shell, or start another shell. The command performs no writes, reads no process environment, keeps snapshots only in shell variables, suppresses all intermediate samples and command text, and emits no command, environment, path, or secret. `pre-run-clean` samples once. `active-chain` samples at most `240` times at `250 ms` intervals, continues silently while legal startup is not ready, and succeeds only when the count of all fingerprinted `gate-r1-*` CLIs and the count selected by `RUN_ID` are both exactly `1` and identify the same PID, followed by exactly one fingerprinted Runtime and one-or-more MCP descendants. A foreign-run CLI is an ambiguous `process-present` exit `41` state and MUST remain visible as a sanitized CLI candidate; it is never hidden by selected-run filtering. `post-run-no-orphan` uses the same bound to allow normal asynchronous process settling. Any `ps`/snapshot/sample acquisition failure immediately returns the single final `snapshot-failure` result with exit `45`; it is never folded into exit `41`.

The control plane MUST require every stdout line to match `^observer=(pre-run-clean|active-chain|post-run-no-orphan) runId=(gate-r1-full-002|gate-r1-workload-001|gate-r1-incremental-001) reason=(clean|process-present|snapshot-failure) role=(none|cli|bridge|runtime|mcp) pid=[0-9]+ ppid=[0-9]+$`, require kind/runId to equal the selected authorized matrix row, and reject all extra text. It validates the numeric exit/reason/role matrix exactly:

- pre/post exit `0`: exactly one `reason=clean role=none pid=0 ppid=0` line;
- pre/post exit `41`: one-or-more `reason=process-present` lines with roles limited to `cli|runtime|mcp`; post returns this only after the bounded settle window;
- any observer exit `45`: exactly one `reason=snapshot-failure role=none pid=0 ppid=0` line;
- active exit `0`: one-or-more `reason=process-present` rows containing exactly one CLI, exactly one Runtime, at least one MCP, optional bridges, unique positive PIDs, and complete Runtime→CLI plus MCP→Runtime PPID walks;
- active exit `41`: exactly one `reason=clean role=none pid=0 ppid=0` line when no candidate appears by the deadline or a previously seen CLI vanishes, otherwise one-or-more sanitized `reason=process-present role=(cli|runtime|mcp)` candidate rows for an incoherent/ambiguous final state.

After the bounded collector finishes, missing/non-numeric final exit code, result-state violation, exit/reason/role mismatch, empty complete stdout, duplicate PIDs, wrong runId/kind, extra text, or malformed structure is `BLOCKED`. There is exactly one final observer-shell outcome per stage, assembled only from the initial result and any same-session empty polls; neither the control plane nor another Agent may perform an external observer retry, start a second observer exec, await an asynchronous correction, introduce a sandbox/fallback path, or wait for root.

Start each diagnostic through a control-plane exec session with `yield_time_ms=10000` and require the returned tool result to identify that same still-running session. Immediately perform the single-shell `active-chain` observer above. After it passes, the execution Agent polls only that same diagnostic run session until its numeric exit code arrives; it does not wait for root or use asynchronous coordination. These long-running diagnostic exec sessions retain their existing run-session polling rules; the observer-only 20-poll/100-second result collector does not change or govern them. Execute exactly these commands in order and never overlap them:

```bash
set +x
ROOT="$(git rev-parse --show-toplevel)" || exit 97
GATE_R1="$ROOT/docs/verification/agent-runtime-v1/gate-d/performance-recovery/gate-r1"
MCP_CONFIG="$ROOT/docs/verification/agent-runtime-v1/gate-d/gate-d-20260716-002/mcp-config.json"
JAVA_URL="http://127.0.0.1:18084"
AUTH_FILTER="$ROOT/backend/src/main/java/org/openharness/backend/api/AuthFilter.java"
FULL_DB="$GATE_R1/gate-r1-full-002.sqlite"
FULL_REPORT="$GATE_R1/gate-r1-full-002-report.json"
FULL_LOCK="$GATE_R1/gate-r1-full-002.sqlite.lock"
for fresh in "$FULL_DB" "$FULL_REPORT" "$FULL_LOCK"
do
  test ! -e "$fresh" && test ! -L "$fresh" || exit 97
done
run_with_reviewed_token() (
  set +x
  declaration_count="$(awk '
    /^[[:space:]]*private static final String TOKEN = "Bearer [^"]+";[[:space:]]*$/ { count += 1 }
    END { print count + 0 }
  ' "$AUTH_FILTER")" || exit 97
  test "$declaration_count" = "1" || exit 97
  OPENHARNESS_SERVICE_TOKEN="$(/usr/bin/sed -n \
    's/^[[:space:]]*private static final String TOKEN = "Bearer \([^\"]\{1,\}\)";[[:space:]]*$/\1/p' \
    "$AUTH_FILTER")" || exit 97
  test -n "$OPENHARNESS_SERVICE_TOKEN" || exit 97
  case "$OPENHARNESS_SERVICE_TOKEN" in (*[[:space:]]*) exit 97;; esac
  case "$OPENHARNESS_SERVICE_TOKEN" in (Bearer*) exit 97;; esac
  export OPENHARNESS_SERVICE_TOKEN
  "$@"
  command_status=$?
  unset OPENHARNESS_SERVICE_TOKEN
  exit "$command_status"
)
cd "$ROOT/agent-runtime" || exit 97
run_with_reviewed_token pnpm diagnostic:gate-d-performance -- run \
  --project-root "$ROOT" \
  --run-id gate-r1-full-002 \
  --variant full-oracle \
  --java-url "$JAVA_URL" \
  --mcp-config "$MCP_CONFIG" \
  --sqlite-path "$FULL_DB" \
  --output "$FULL_REPORT"
```

```bash
set +x
ROOT="$(git rev-parse --show-toplevel)" || exit 97
GATE_R1="$ROOT/docs/verification/agent-runtime-v1/gate-d/performance-recovery/gate-r1"
MCP_CONFIG="$ROOT/docs/verification/agent-runtime-v1/gate-d/gate-d-20260716-002/mcp-config.json"
JAVA_URL="http://127.0.0.1:18084"
AUTH_FILTER="$ROOT/backend/src/main/java/org/openharness/backend/api/AuthFilter.java"
WORKLOAD_DB="$GATE_R1/gate-r1-workload-001.sqlite"
WORKLOAD_REPORT="$GATE_R1/gate-r1-workload-001-report.json"
WORKLOAD_LOCK="$GATE_R1/gate-r1-workload-001.sqlite.lock"
for fresh in "$WORKLOAD_DB" "$WORKLOAD_REPORT" "$WORKLOAD_LOCK"
do
  test ! -e "$fresh" && test ! -L "$fresh" || exit 97
done
run_with_reviewed_token() (
  set +x
  declaration_count="$(awk '
    /^[[:space:]]*private static final String TOKEN = "Bearer [^"]+";[[:space:]]*$/ { count += 1 }
    END { print count + 0 }
  ' "$AUTH_FILTER")" || exit 97
  test "$declaration_count" = "1" || exit 97
  OPENHARNESS_SERVICE_TOKEN="$(/usr/bin/sed -n \
    's/^[[:space:]]*private static final String TOKEN = "Bearer \([^\"]\{1,\}\)";[[:space:]]*$/\1/p' \
    "$AUTH_FILTER")" || exit 97
  test -n "$OPENHARNESS_SERVICE_TOKEN" || exit 97
  case "$OPENHARNESS_SERVICE_TOKEN" in (*[[:space:]]*) exit 97;; esac
  case "$OPENHARNESS_SERVICE_TOKEN" in (Bearer*) exit 97;; esac
  export OPENHARNESS_SERVICE_TOKEN
  "$@"
  command_status=$?
  unset OPENHARNESS_SERVICE_TOKEN
  exit "$command_status"
)
cd "$ROOT/agent-runtime" || exit 97
run_with_reviewed_token pnpm diagnostic:gate-d-performance -- run \
  --project-root "$ROOT" \
  --run-id gate-r1-workload-001 \
  --variant workload-only \
  --java-url "$JAVA_URL" \
  --mcp-config "$MCP_CONFIG" \
  --sqlite-path "$WORKLOAD_DB" \
  --output "$WORKLOAD_REPORT"
```

```bash
set +x
ROOT="$(git rev-parse --show-toplevel)" || exit 97
GATE_R1="$ROOT/docs/verification/agent-runtime-v1/gate-d/performance-recovery/gate-r1"
MCP_CONFIG="$ROOT/docs/verification/agent-runtime-v1/gate-d/gate-d-20260716-002/mcp-config.json"
JAVA_URL="http://127.0.0.1:18084"
AUTH_FILTER="$ROOT/backend/src/main/java/org/openharness/backend/api/AuthFilter.java"
INCREMENTAL_DB="$GATE_R1/gate-r1-incremental-001.sqlite"
INCREMENTAL_REPORT="$GATE_R1/gate-r1-incremental-001-report.json"
INCREMENTAL_LOCK="$GATE_R1/gate-r1-incremental-001.sqlite.lock"
for fresh in "$INCREMENTAL_DB" "$INCREMENTAL_REPORT" "$INCREMENTAL_LOCK"
do
  test ! -e "$fresh" && test ! -L "$fresh" || exit 97
done
run_with_reviewed_token() (
  set +x
  declaration_count="$(awk '
    /^[[:space:]]*private static final String TOKEN = "Bearer [^"]+";[[:space:]]*$/ { count += 1 }
    END { print count + 0 }
  ' "$AUTH_FILTER")" || exit 97
  test "$declaration_count" = "1" || exit 97
  OPENHARNESS_SERVICE_TOKEN="$(/usr/bin/sed -n \
    's/^[[:space:]]*private static final String TOKEN = "Bearer \([^\"]\{1,\}\)";[[:space:]]*$/\1/p' \
    "$AUTH_FILTER")" || exit 97
  test -n "$OPENHARNESS_SERVICE_TOKEN" || exit 97
  case "$OPENHARNESS_SERVICE_TOKEN" in (*[[:space:]]*) exit 97;; esac
  case "$OPENHARNESS_SERVICE_TOKEN" in (Bearer*) exit 97;; esac
  export OPENHARNESS_SERVICE_TOKEN
  "$@"
  command_status=$?
  unset OPENHARNESS_SERVICE_TOKEN
  exit "$command_status"
)
cd "$ROOT/agent-runtime" || exit 97
run_with_reviewed_token pnpm diagnostic:gate-d-performance -- run \
  --project-root "$ROOT" \
  --run-id gate-r1-incremental-001 \
  --variant incremental-oracle \
  --java-url "$JAVA_URL" \
  --mcp-config "$MCP_CONFIG" \
  --sqlite-path "$INCREMENTAL_DB" \
  --output "$INCREMENTAL_REPORT"
```

Each command MUST exit `0`, run the fixed 30-minute/30-second schedule, produce exactly 60 samples, have zero report-level and sample-level hard failures, preserve the expected runId/variant/database-basename binding, and leave both SQLite and report as mode `0600`. The full report has the exact seven-probe signature; workload-only has zero database-oracle timings; incremental-only has only `incremental-events`. Workload definition, seed count, concurrency, environment fingerprint class, Node/platform/architecture, Java PID/fingerprint, and MCP config remain fixed.

After the full-002 exec returns numeric exit `0`, run only this full-002 validator:

```bash
ROOT="$(git rev-parse --show-toplevel)" || exit 99
GATE_R1="$ROOT/docs/verification/agent-runtime-v1/gate-d/performance-recovery/gate-r1"
FULL_DB="$GATE_R1/gate-r1-full-002.sqlite"
FULL_REPORT="$GATE_R1/gate-r1-full-002-report.json"
FULL_LOCK="$GATE_R1/gate-r1-full-002.sqlite.lock"
verify_run_artifacts() {
  report="$1"
  database="$2"
  expected_run_id="$3"
  expected_variant="$4"
  expected_database_basename="$5"
  expected_signature="$6"
  test ! -L "$database" && test -f "$database" || return 99
  test ! -L "$report" && test -f "$report" || return 99
  test "$(stat -f '%Lp' "$database")" = "600" || return 99
  test "$(stat -f '%Lp' "$report")" = "600" || return 99
  jq -e \
    --arg runId "$expected_run_id" \
    --arg variant "$expected_variant" \
    --arg databaseBasename "$expected_database_basename" \
    --arg signature "$expected_signature" '
      ($signature | if . == "" then [] else split(",") end) as $expectedProbes |
      .schemaVersion == 1 and
      .track == "local" and
      .evidenceKind == "gate-d-performance-diagnostic" and
      .runId == $runId and
      .variant == $variant and
      .environment.databaseBasename == $databaseBasename and
      .durationMs == 1800000 and
      .sampleIntervalMs == 30000 and
      (.samples | length) == 60 and
      ([.samples[].sampleIndex] == [range(0; 60)]) and
      (.hardFailures | length) == 0 and
      all(.samples[]; (.hardFailures | length) == 0) and
      all(.samples[]; [.probeTimings[].probe] == $expectedProbes)
    ' "$report" >/dev/null
}

verify_run_artifacts "$FULL_REPORT" "$FULL_DB" \
  gate-r1-full-002 full-oracle gate-r1-full-002.sqlite \
  'incremental-events,dead-letter,orphaned-approval,duplicate-event,sqlite-busy,event-secret-canary,message-secret-canary'
test ! -L "$FULL_LOCK" && test -f "$FULL_LOCK" || exit 99
test "$(stat -f '%Lp' "$FULL_LOCK")" = "600" || exit 99
```

After the workload-001 exec returns numeric exit `0`, run only this workload-001 validator:

```bash
ROOT="$(git rev-parse --show-toplevel)" || exit 99
GATE_R1="$ROOT/docs/verification/agent-runtime-v1/gate-d/performance-recovery/gate-r1"
WORKLOAD_DB="$GATE_R1/gate-r1-workload-001.sqlite"
WORKLOAD_REPORT="$GATE_R1/gate-r1-workload-001-report.json"
WORKLOAD_LOCK="$GATE_R1/gate-r1-workload-001.sqlite.lock"
verify_run_artifacts() {
  report="$1"
  database="$2"
  expected_run_id="$3"
  expected_variant="$4"
  expected_database_basename="$5"
  expected_signature="$6"
  test ! -L "$database" && test -f "$database" || return 99
  test ! -L "$report" && test -f "$report" || return 99
  test "$(stat -f '%Lp' "$database")" = "600" || return 99
  test "$(stat -f '%Lp' "$report")" = "600" || return 99
  jq -e \
    --arg runId "$expected_run_id" \
    --arg variant "$expected_variant" \
    --arg databaseBasename "$expected_database_basename" \
    --arg signature "$expected_signature" '
      ($signature | if . == "" then [] else split(",") end) as $expectedProbes |
      .schemaVersion == 1 and
      .track == "local" and
      .evidenceKind == "gate-d-performance-diagnostic" and
      .runId == $runId and
      .variant == $variant and
      .environment.databaseBasename == $databaseBasename and
      .durationMs == 1800000 and
      .sampleIntervalMs == 30000 and
      (.samples | length) == 60 and
      ([.samples[].sampleIndex] == [range(0; 60)]) and
      (.hardFailures | length) == 0 and
      all(.samples[]; (.hardFailures | length) == 0) and
      all(.samples[]; [.probeTimings[].probe] == $expectedProbes)
    ' "$report" >/dev/null
}
verify_run_artifacts "$WORKLOAD_REPORT" "$WORKLOAD_DB" \
  gate-r1-workload-001 workload-only gate-r1-workload-001.sqlite ''
test ! -L "$WORKLOAD_LOCK" && test -f "$WORKLOAD_LOCK" || exit 99
test "$(stat -f '%Lp' "$WORKLOAD_LOCK")" = "600" || exit 99
```

After the incremental-001 exec returns numeric exit `0`, run only this incremental-001 validator:

```bash
ROOT="$(git rev-parse --show-toplevel)" || exit 99
GATE_R1="$ROOT/docs/verification/agent-runtime-v1/gate-d/performance-recovery/gate-r1"
INCREMENTAL_DB="$GATE_R1/gate-r1-incremental-001.sqlite"
INCREMENTAL_REPORT="$GATE_R1/gate-r1-incremental-001-report.json"
INCREMENTAL_LOCK="$GATE_R1/gate-r1-incremental-001.sqlite.lock"
verify_run_artifacts() {
  report="$1"
  database="$2"
  expected_run_id="$3"
  expected_variant="$4"
  expected_database_basename="$5"
  expected_signature="$6"
  test ! -L "$database" && test -f "$database" || return 99
  test ! -L "$report" && test -f "$report" || return 99
  test "$(stat -f '%Lp' "$database")" = "600" || return 99
  test "$(stat -f '%Lp' "$report")" = "600" || return 99
  jq -e \
    --arg runId "$expected_run_id" \
    --arg variant "$expected_variant" \
    --arg databaseBasename "$expected_database_basename" \
    --arg signature "$expected_signature" '
      ($signature | if . == "" then [] else split(",") end) as $expectedProbes |
      .schemaVersion == 1 and
      .track == "local" and
      .evidenceKind == "gate-d-performance-diagnostic" and
      .runId == $runId and
      .variant == $variant and
      .environment.databaseBasename == $databaseBasename and
      .durationMs == 1800000 and
      .sampleIntervalMs == 30000 and
      (.samples | length) == 60 and
      ([.samples[].sampleIndex] == [range(0; 60)]) and
      (.hardFailures | length) == 0 and
      all(.samples[]; (.hardFailures | length) == 0) and
      all(.samples[]; [.probeTimings[].probe] == $expectedProbes)
    ' "$report" >/dev/null
}
verify_run_artifacts "$INCREMENTAL_REPORT" "$INCREMENTAL_DB" \
  gate-r1-incremental-001 incremental-oracle gate-r1-incremental-001.sqlite 'incremental-events'
test ! -L "$INCREMENTAL_LOCK" && test -f "$INCREMENTAL_LOCK" || exit 99
test "$(stat -f '%Lp' "$INCREMENTAL_LOCK")" = "600" || exit 99
```

Immediately after each run, require that run exec result's numeric exit code is `0`, invoke only that run's self-contained validator, then invoke its single-shell `post-run-no-orphan` observer under the same bounded result-collection protocol. A validator MUST NOT touch a later variant's still-fresh report. Do not print samples, identifiers, paths, or probe rows.

Only PIDs returned in a successful active-chain result are observed descendants of that run. If cleanup is required, signal only an owned descendant whose current numeric PID, PPID ancestry, and split-string role fingerprint still match the existing Step 7 fresh ownership verification; that verification is not a second observer stage or observer exec. Never kill by name, port range, or broad pattern.

Any disk-gate parse/threshold failure, observer nonzero exit, observer result-state/timeout/final-exit/complete-stdout/structure failure, run nonzero exit, Java/MCP capability failure, identity/parser/fingerprint mismatch, sample count other than exactly `60`, output mode error, hard failure, orphan, or cleanup-proof failure immediately makes Task 6 `BLOCKED`. Do not start the next variant or analyze. A run may have claimed its database/report and created its corresponding full/workload/incremental lock before failure; every claimed or created target remains consumed partial evidence and MUST be preserved. There is no automatic retry and no fifth resume.

- [ ] **Step 6: Analyze the three immutable reports**

Only after all three run checks PASS, run this single self-contained analyze-and-validate exec block:

```bash
ROOT="$(git rev-parse --show-toplevel)" || exit 99
GATE_R1="$ROOT/docs/verification/agent-runtime-v1/gate-d/performance-recovery/gate-r1"
FULL_REPORT="$GATE_R1/gate-r1-full-002-report.json"
WORKLOAD_REPORT="$GATE_R1/gate-r1-workload-001-report.json"
INCREMENTAL_REPORT="$GATE_R1/gate-r1-incremental-001-report.json"
DECISION="$GATE_R1/gate-r1-decision.json"
for report in "$FULL_REPORT" "$WORKLOAD_REPORT" "$INCREMENTAL_REPORT"
do
  test ! -L "$report" && test -f "$report" || exit 99
  test "$(stat -f '%Lp' "$report")" = "600" || exit 99
done
test ! -e "$DECISION" && test ! -L "$DECISION" || exit 99
FULL_REPORT_SHA_PRE="$(shasum -a 256 "$FULL_REPORT" | awk '{print $1}')" || exit 99
WORKLOAD_REPORT_SHA_PRE="$(shasum -a 256 "$WORKLOAD_REPORT" | awk '{print $1}')" || exit 99
INCREMENTAL_REPORT_SHA_PRE="$(shasum -a 256 "$INCREMENTAL_REPORT" | awk '{print $1}')" || exit 99
cd "$ROOT/agent-runtime" || exit 99
pnpm diagnostic:gate-d-performance -- analyze \
  --project-root "$ROOT" \
  --full-report "$FULL_REPORT" \
  --incremental-report "$INCREMENTAL_REPORT" \
  --workload-report "$WORKLOAD_REPORT" \
  --output "$DECISION"
ANALYZE_STATUS=$?
test "$ANALYZE_STATUS" -eq 0 || exit "$ANALYZE_STATUS"
test "$(shasum -a 256 "$FULL_REPORT" | awk '{print $1}')" = "$FULL_REPORT_SHA_PRE" || exit 99
test "$(shasum -a 256 "$WORKLOAD_REPORT" | awk '{print $1}')" = "$WORKLOAD_REPORT_SHA_PRE" || exit 99
test "$(shasum -a 256 "$INCREMENTAL_REPORT" | awk '{print $1}')" = "$INCREMENTAL_REPORT_SHA_PRE" || exit 99
test ! -L "$DECISION" && test -f "$DECISION" || exit 99
test "$(stat -f '%Lp' "$DECISION")" = "600" || exit 99
jq -e '
  .schemaVersion == 1 and
  .track == "local" and
  .evidenceKind == "gate-d-performance-diagnosis" and
  (.result == "confirmed" or .result == "inconclusive") and
  ([.findings[].status] | all(. == "confirmed" or . == "rejected" or . == "contributing" or . == "unresolved"))
' "$DECISION" >/dev/null
```

Expected: exit `0`; the three report hashes remain unchanged; `$DECISION` is a fresh non-symlink mode-`0600` file; `result` is exactly `confirmed` or `inconclusive`; all findings use the closed status enum; no path, secret, raw report row, or proposed code fix appears. Any exit `2`, fingerprint/workload/report/structure mismatch, output mode error, or claimed partial decision is `BLOCKED` without overwrite or retry.

- [ ] **Step 7: Perform owned process cleanup on success, failure, or interruption**

Process cleanup is mandatory and is not evidence/worktree cleanup. On success, failure, or interruption, the executor first sends Ctrl-C through the exact retained diagnostic exec session when one is active and polls that same session to a numeric exit. It then sends Ctrl-C through the exact retained resume-004 Java PTY session, when one was returned, and waits for the Maven/Java tool session to exit. These are control-plane tool operations against retained session ids, not shell-variable references. Then run this complete fallback/verification block from a fresh worktree shell. It accepts an absent/no-follow resume-004 PID only when Java never reached PID binding and the subsequent listener/process proof is clean; an absent PID never authorizes a signal:

```bash
ROOT="$(git rev-parse --show-toplevel)" || exit 101
GATE_R1="$ROOT/docs/verification/agent-runtime-v1/gate-d/performance-recovery/gate-r1"
RESUME_004_JAVA_PID="$GATE_R1/java-gateway-18084-resume-004.pid"
test ! -L "$RESUME_004_JAVA_PID" || exit 101
OWNED_JAVA_PID=""
if test -e "$RESUME_004_JAVA_PID"
then
  test -f "$RESUME_004_JAVA_PID" || exit 101
  test "$(stat -f '%Lp' "$RESUME_004_JAVA_PID")" = "600" || exit 101
  OWNED_JAVA_PID="$(/usr/bin/sed -n '1p' "$RESUME_004_JAVA_PID")" || exit 101
  case "$OWNED_JAVA_PID" in (*[!0-9]*|'') exit 101;; esac
  test "$(wc -l < "$RESUME_004_JAVA_PID" | tr -d ' ')" = "1" || exit 101
fi
LISTENER_PID="$(lsof -nP -iTCP:18084 -sTCP:LISTEN -t 2>/dev/null || true)"
if test -n "$LISTENER_PID"
then
  test "$LISTENER_PID" = "$OWNED_JAVA_PID" || exit 101
  JAVA_COMMAND="$(ps -p "$OWNED_JAVA_PID" -o command=)" || exit 101
  case "$JAVA_COMMAND" in (*org.openharness.backend.OpenHarnessBackendApplication*) :;; (*) exit 101;; esac
  case "$JAVA_COMMAND" in (*--server.port=18084*) :;; (*) exit 101;; esac
  kill -TERM "$OWNED_JAVA_PID" || exit 101
  attempt=0
  while test "$attempt" -lt 40
  do
    LISTENER_PID="$(lsof -nP -iTCP:18084 -sTCP:LISTEN -t 2>/dev/null || true)"
    test -n "$LISTENER_PID" || break
    test "$LISTENER_PID" = "$OWNED_JAVA_PID" || exit 101
    attempt=$((attempt + 1))
    sleep 0.25 || exit 101
  done
  LISTENER_PID="$(lsof -nP -iTCP:18084 -sTCP:LISTEN -t 2>/dev/null || true)"
  if test -n "$LISTENER_PID"
  then
    test "$LISTENER_PID" = "$OWNED_JAVA_PID" || exit 101
    JAVA_COMMAND="$(ps -p "$OWNED_JAVA_PID" -o command=)" || exit 101
    case "$JAVA_COMMAND" in (*org.openharness.backend.OpenHarnessBackendApplication*) :;; (*) exit 101;; esac
    case "$JAVA_COMMAND" in (*--server.port=18084*) :;; (*) exit 101;; esac
    kill -KILL "$OWNED_JAVA_PID" || exit 101
  fi
fi
test -z "$(lsof -nP -iTCP:18084 -sTCP:LISTEN -t 2>/dev/null || true)" || exit 101
PROCESS_SNAPSHOT="$(LC_ALL=C ps -Ao pid=,ppid=,command=)" || exit 101
printf '%s\n' "$PROCESS_SNAPSHOT" | LC_ALL=C awk '
  BEGIN {
    diagnostic = "gateDPerformanceDiagnostic" "Cli"
    runtime = "formalSoakRuntime" "Child.ts"
    fixture = "qualification-" "server.ts"
  }
  {
    text = $0
    if ((index(text, diagnostic) && index(text, "gate-r1-")) ||
        index(text, runtime) || index(text, fixture)) found = 1
  }
  END { exit found ? 1 : 0 }
' || exit 101
printf 'cleanup=pass port=18084 listener=none runtime_orphans=0 mcp_orphans=0\n'
unset JAVA_COMMAND LISTENER_PID OWNED_JAVA_PID PROCESS_SNAPSHOT
```

Never signal ports `8080`/`18080`, the PID recorded in the original/resume-001/resume-002 Java PID evidence, the absent historical resume-003 PID target, a PID not written to the resume-004 PID evidence, an unobserved Runtime/MCP PID, or a command with a changed fingerprint.

The executor installs interruption handling before starting Java. On SIGINT/SIGTERM or host-tool interruption, it performs the same session-scoped operations and fresh-shell fallback verification, preserves every fresh/partial artifact, and returns `BLOCKED`. If ownership or cleanup cannot be proved, return `BLOCKED` and request human process inspection; do not broaden termination.

- [ ] **Step 8: Write the Gate R1 diagnosis Review and audit exactly 23 evidence files**

The Review must include:

- `结论` beginning with `通过`, `有风险`, or `需修改`;
- all reviewed artifacts as absolute `file:///` Markdown links;
- the exact sanitized pre/post `dev:ino:size:mtime:ctime` tuples for attempt 002 main and presence/absence of `-wal`/`-shm`, proving equality without a content hash;
- the exact mechanical profile assertions, including `tableRows.runtime_events == 2,671,288`, `eventDeliveryStatus.pending == 2,671,288`, zero non-pending delivery entries, and nonnegative-only treatment of the other four table counts;
- primary and contributing causes with quantitative evidence;
- rejected hypotheses and why;
- whether the minimal correction remains within the active OpenSpec;
- exact files allowed in the subsequent repair plan;
- residual risks and the 60-minute Gate R4 regression entry condition;
- Java PID/fingerprint ownership, port release, Runtime/MCP orphan checks, all command exit codes, target modes, and any preserved partial artifact;
- separate attempt-001, resume-001, resume-002, resume-003, and resume-004 sections. State that the original wrapper exit `97` occurred before CLI/Runtime/workload; resume-001 was observer protocol/race `BLOCKED`; resume-002 stopped on the first pre-run observer before any run began; resume-003 consumed only its 31-byte Java log, left its PID absent/no-follow, and started no run; the ten run/lock/decision targets remained fresh through resume-003; resume-004 is the new user-authorized execution; and no performance conclusion may be drawn from partial full-001 or any historical Java/observer evidence;
- all nine single-shell observer stage results, the bound `unrestricted` / approval-`never` control-plane metadata, each sole `exec_command` envelope with fixed `yield_time_ms=10000` and omitted `sandbox_permissions` / `justification`, initial result form, whether a retained session was used, poll count, final numeric exit, sanitized complete stdout `reason` rows, and the execution Agent's exit/reason/role structural verdict; do not record the numeric session identifier, internal intermediate samples, command, environment, path, process snapshot, or secret, and make no sandbox, second observer exec, fallback, retry, asynchronous-correction, or external-coordination claim;
- the initial and three per-variant `df -Pk` available-KiB values, all at least `12,582,912`, the threshold calculation basis, and confirmation that no evidence was cleaned to gain space;
- mode and SHA-256 for every one of the 23 evidence files; the eleven historical values must equal their immutable bindings, resume-003 PID absence must be stated separately, and all three singleton locks must be present. The Review正文 MUST NOT require, reserve, or later rewrite a field for its own SHA-256;
- explicit statement that Gate D, archive, merge, tag, and cleanup remain blocked.

After analyze and owned cleanup, repeat the protected-input stat-only proof before writing the Review:

```bash
ROOT="$(git rev-parse --show-toplevel)" || exit 100
INPUT="$ROOT/docs/verification/agent-runtime-v1/gate-d/gate-d-20260716-002/runtime.sqlite"
test ! -L "$INPUT" && test -f "$INPUT" || exit 100
INPUT_IDENTITY_POST="$(stat -f '%d:%i:%z:%m:%c' "$INPUT")" || exit 100
test "$INPUT_IDENTITY_POST" = "16777232:165257457:1835978752:1784167299:1784167299" || exit 100
test ! -e "${INPUT}-wal" && test ! -L "${INPUT}-wal"
test ! -e "${INPUT}-shm" && test ! -L "${INPUT}-shm"
printf 'protected_input=pass tuple=16777232:165257457:1835978752:1784167299:1784167299 wal=absent shm=absent\n'
```

After the Review is written, audit exactly these `23` evidence files: the existing `11` (profile `1` + original Java `2` + resume-001 Java `2` + full-001 database/report/lock `3` + resume-002 Java `2` + resume-003 Java log `1`), plus full-002 database/report/lock `3`, resume-004 Java log/PID `2`, workload database/report/lock `3`, incremental database/report/lock `3`, and decision `1`. The absent resume-003 PID is verified no-follow but does not count as evidence. The diagnosis Review is the additional twenty-fourth scanned and hashed document, not an evidence file. The contingent resume-004 BLOCKED Review must remain absent on this success path. JSON structure/path/raw checks apply only to the five valid JSON diagnostic artifacts; the zero-byte historical full-001 report is preserved and is not parsed as JSON.

```bash
ROOT="$(git rev-parse --show-toplevel)" || exit 100
GATE_R1="$ROOT/docs/verification/agent-runtime-v1/gate-d/performance-recovery/gate-r1"
AUTH_FILTER="$ROOT/backend/src/main/java/org/openharness/backend/api/AuthFilter.java"
PROFILE="$GATE_R1/attempt-002-profile.json"
ORIGINAL_JAVA_LOG="$GATE_R1/java-gateway-18084.log"
ORIGINAL_JAVA_PID="$GATE_R1/java-gateway-18084.pid"
RESUME_001_JAVA_LOG="$GATE_R1/java-gateway-18084-resume-001.log"
RESUME_001_JAVA_PID="$GATE_R1/java-gateway-18084-resume-001.pid"
PARTIAL_FULL_DB="$GATE_R1/gate-r1-full-001.sqlite"
PARTIAL_FULL_REPORT="$GATE_R1/gate-r1-full-001-report.json"
PARTIAL_FULL_LOCK="$GATE_R1/gate-r1-full-001.sqlite.lock"
RESUME_002_JAVA_LOG="$GATE_R1/java-gateway-18084-resume-002.log"
RESUME_002_JAVA_PID="$GATE_R1/java-gateway-18084-resume-002.pid"
RESUME_003_JAVA_LOG="$GATE_R1/java-gateway-18084-resume-003.log"
RESUME_003_JAVA_PID="$GATE_R1/java-gateway-18084-resume-003.pid"
FULL_DB="$GATE_R1/gate-r1-full-002.sqlite"
FULL_REPORT="$GATE_R1/gate-r1-full-002-report.json"
FULL_LOCK="$GATE_R1/gate-r1-full-002.sqlite.lock"
RESUME_004_JAVA_LOG="$GATE_R1/java-gateway-18084-resume-004.log"
RESUME_004_JAVA_PID="$GATE_R1/java-gateway-18084-resume-004.pid"
WORKLOAD_DB="$GATE_R1/gate-r1-workload-001.sqlite"
WORKLOAD_REPORT="$GATE_R1/gate-r1-workload-001-report.json"
WORKLOAD_LOCK="$GATE_R1/gate-r1-workload-001.sqlite.lock"
INCREMENTAL_DB="$GATE_R1/gate-r1-incremental-001.sqlite"
INCREMENTAL_REPORT="$GATE_R1/gate-r1-incremental-001-report.json"
INCREMENTAL_LOCK="$GATE_R1/gate-r1-incremental-001.sqlite.lock"
DECISION="$GATE_R1/gate-r1-decision.json"
DIAGNOSIS_REVIEW="$ROOT/docs/review/2026-07-17-agent-runtime-gate-r1-diagnosis-review.md"
BLOCKED_REVIEW="$ROOT/docs/review/2026-07-21-agent-runtime-gate-r1-resume-004-review.md"
verify_historical_binding() {
  evidence="$1"
  expected_size="$2"
  expected_sha="$3"
  test ! -L "$evidence" && test -f "$evidence" || return 100
  test "$(stat -f '%Lp' "$evidence")" = "600" || return 100
  test "$(stat -f '%z' "$evidence")" = "$expected_size" || return 100
  test "$(shasum -a 256 "$evidence" | awk '{print $1}')" = "$expected_sha" || return 100
}
verify_historical_binding "$PROFILE" 10126 bd08cc930a1269814d2bde296ca13679574d9f4d5332c3f5ca3bc5efcb8e0541
verify_historical_binding "$ORIGINAL_JAVA_LOG" 4527 18ce69b6d16e9395e0ab62416f7bfbcf3b6cb1ae1169ed68a63ea5bba8049c02
verify_historical_binding "$ORIGINAL_JAVA_PID" 6 db053c15314038b9ec9b7c9e4efb3b5dd159f08825e35101660d70a527b91089
verify_historical_binding "$RESUME_001_JAVA_LOG" 99731235 5e103d31edf342e6ec0f6121141517a0c0196cbbe6c644985dda16351216c52f
verify_historical_binding "$RESUME_001_JAVA_PID" 6 4667fcf59d1f03c1db90f299b115525df71eb7da8d3cc46211e6a18fa8f5f1c7
verify_historical_binding "$PARTIAL_FULL_DB" 240963584 cc90a03bbb4887b7b2705768fe3ef357e7b1c8889d9f7564d02c32abb596714f
verify_historical_binding "$PARTIAL_FULL_REPORT" 0 e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
verify_historical_binding "$PARTIAL_FULL_LOCK" 0 e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
verify_historical_binding "$RESUME_002_JAVA_LOG" 4527 311460c74635cc30a938b5f9d5a37b8018748c7e10a44f13da8aa598bc134c82
verify_historical_binding "$RESUME_002_JAVA_PID" 6 26769b0d0c1b476354ee6439b92c84a21c89bec06418a20fa8fa0663bd172393
verify_historical_binding "$RESUME_003_JAVA_LOG" 31 4707abc6949e53eb9225dc8181e2be5e3c6201ad35d9c33cab43bb627992dfd7
test ! -e "$RESUME_003_JAVA_PID" && test ! -L "$RESUME_003_JAVA_PID" || exit 100
test ! -e "$BLOCKED_REVIEW" && test ! -L "$BLOCKED_REVIEW" || exit 100
for json in "$PROFILE" "$FULL_REPORT" "$WORKLOAD_REPORT" "$INCREMENTAL_REPORT" "$DECISION"
do
  jq -e 'type == "object"' "$json" >/dev/null || exit 100
done

SCAN_TARGETS=(
  "$PROFILE" "$ORIGINAL_JAVA_LOG" "$ORIGINAL_JAVA_PID"
  "$RESUME_001_JAVA_LOG" "$RESUME_001_JAVA_PID"
  "$PARTIAL_FULL_DB" "$PARTIAL_FULL_REPORT" "$PARTIAL_FULL_LOCK"
  "$RESUME_002_JAVA_LOG" "$RESUME_002_JAVA_PID"
  "$RESUME_003_JAVA_LOG"
  "$FULL_DB" "$FULL_REPORT" "$FULL_LOCK" "$RESUME_004_JAVA_LOG" "$RESUME_004_JAVA_PID"
  "$WORKLOAD_DB" "$WORKLOAD_REPORT" "$WORKLOAD_LOCK"
  "$INCREMENTAL_DB" "$INCREMENTAL_REPORT" "$INCREMENTAL_LOCK" "$DECISION"
  "$DIAGNOSIS_REVIEW"
)
test "${#SCAN_TARGETS[@]}" = "24" || exit 100
if LC_ALL=C grep -a -E -i -q '(authorization[[:space:]]*:|bearer[[:space:]]+|api[_-]?key|password|OPENHARNESS_SERVICE_TOKEN|SECRET_CANARY)' "${SCAN_TARGETS[@]}"
then
  exit 100
fi

(
  set +x
  declaration_count="$(awk '
    /^[[:space:]]*private static final String TOKEN = "Bearer [^"]+";[[:space:]]*$/ { count += 1 }
    END { print count + 0 }
  ' "$AUTH_FILTER")" || exit 100
  test "$declaration_count" = "1" || exit 100
  reviewed_token="$(/usr/bin/sed -n \
    's/^[[:space:]]*private static final String TOKEN = "Bearer \([^\"]\{1,\}\)";[[:space:]]*$/\1/p' \
    "$AUTH_FILTER")" || exit 100
  test -n "$reviewed_token" || exit 100
  case "$reviewed_token" in (*[[:space:]]*) exit 100;; esac
  case "$reviewed_token" in (Bearer*) exit 100;; esac
  if LC_ALL=C grep -a -F -q -- "$reviewed_token" "${SCAN_TARGETS[@]}"; then exit 100; fi
  unset reviewed_token
)

for evidence in \
  "$PROFILE" "$ORIGINAL_JAVA_LOG" "$ORIGINAL_JAVA_PID" \
  "$RESUME_001_JAVA_LOG" "$RESUME_001_JAVA_PID" \
  "$PARTIAL_FULL_DB" "$PARTIAL_FULL_REPORT" "$PARTIAL_FULL_LOCK" \
  "$RESUME_002_JAVA_LOG" "$RESUME_002_JAVA_PID" \
  "$RESUME_003_JAVA_LOG" \
  "$FULL_DB" "$FULL_REPORT" "$FULL_LOCK" "$RESUME_004_JAVA_LOG" "$RESUME_004_JAVA_PID" \
  "$WORKLOAD_DB" "$WORKLOAD_REPORT" "$WORKLOAD_LOCK" \
  "$INCREMENTAL_DB" "$INCREMENTAL_REPORT" "$INCREMENTAL_LOCK" "$DECISION"
do
  test ! -L "$evidence" || exit 100
  test -f "$evidence" || exit 100
  test "$(stat -f '%Lp' "$evidence")" = "600" || exit 100
done
test ! -L "$DIAGNOSIS_REVIEW" || exit 100
test -f "$DIAGNOSIS_REVIEW" || exit 100

EVIDENCE_TARGETS=(
  "$PROFILE" "$ORIGINAL_JAVA_LOG" "$ORIGINAL_JAVA_PID"
  "$RESUME_001_JAVA_LOG" "$RESUME_001_JAVA_PID"
  "$PARTIAL_FULL_DB" "$PARTIAL_FULL_REPORT" "$PARTIAL_FULL_LOCK"
  "$RESUME_002_JAVA_LOG" "$RESUME_002_JAVA_PID"
  "$RESUME_003_JAVA_LOG"
  "$FULL_DB" "$FULL_REPORT" "$FULL_LOCK" "$RESUME_004_JAVA_LOG" "$RESUME_004_JAVA_PID"
  "$WORKLOAD_DB" "$WORKLOAD_REPORT" "$WORKLOAD_LOCK"
  "$INCREMENTAL_DB" "$INCREMENTAL_REPORT" "$INCREMENTAL_LOCK" "$DECISION"
)
test "${#EVIDENCE_TARGETS[@]}" = "23" || exit 100
shasum -a 256 "${EVIDENCE_TARGETS[@]}" "$DIAGNOSIS_REVIEW"

JSON_TARGETS=("$PROFILE" "$FULL_REPORT" "$WORKLOAD_REPORT" "$INCREMENTAL_REPORT" "$DECISION")
if LC_ALL=C grep -F -q -- "$ROOT" "${JSON_TARGETS[@]}"; then exit 100; fi
if LC_ALL=C grep -E -i -q '(file:.*immutable|raw.*stdout|raw.*stderr|child.*stdout|child.*stderr)' "${JSON_TARGETS[@]}"
then
  exit 100
fi
```

The control plane captures the final diagnosis Review SHA-256 from that final `shasum` tool result only after the Review is complete. Record that SHA externally in the execution Agent handoff and final user reply; do not write or backfill it into the Review itself.

Any secret or forbidden raw detail is `BLOCKED`; preserve the evidence and do not rewrite it.

On any resume-004 execution failure, stop before the next stage, preserve every claimed artifact, perform only the reachable owned-process and fixed protected-input post-stat checks, and create the fresh/no-follow [resume-004 BLOCKED Review](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/docs/review/2026-07-21-agent-runtime-gate-r1-resume-004-review.md). Its conclusion MUST begin `需修改 / BLOCKED`; it MUST bind the revised plan SHA and fresh Preflight SHA, identify the exact stopped stage and tool/result-state outcome, and for an observer stage record only the initial result form, whether a retained session was used, poll count, and final numeric exit or exact fail-closed reason without recording the numeric session identifier. It MUST distinguish attempts 001 and resumes 001/002/003/004, record the Maven binding result, control-plane metadata, resume-003 log binding/PID absence, every resume-004 target's actual present/absent/consumed state, available disk observations reached, protected stat/sidecars, retained diagnostic/Java session ownership, port/orphan outcome, and explicitly state that no performance conclusion, retry, fifth resume, repair, Gate D, Git write, archive, merge, tag, or cleanup is authorized. It MUST scan itself and every present evidence artifact for generic and exact-token secrets without printing the credential; its final SHA-256 is captured only from an external tool result after finalization and MUST NOT be written back. Failure does not run the success-only `23` evidence / `24` scan / `5` JSON audit, does not create the diagnosis Review, and does not alter any claimed evidence to make a later audit pass.

Gate R1 is PASS only when `$DECISION.result == "confirmed"` and a separate strict High Review accepts the claim-to-mechanism chain. `inconclusive` is a truthful completed diagnostic outcome: land the Review as `有风险` or `需修改`, do not choose the most plausible repair, and return one new single-variable hypothesis for a new plan decision. After three unconfirmed hypotheses, stop for architecture/human decision.

**Task 6 resume stop/rollback contract:** there is no artifact rollback, automatic retry, or fifth resume. Any Maven availability/version/hash mismatch, credential selfcheck failure, disk headroom parse/threshold failure, observer permission/transport/result-state/timeout/exit/reason/role/structure failure, run/analyze nonzero exit, capability/identity/parser/fingerprint mismatch, samples other than exactly `60`, output-mode failure, hard failure, service identity change, orphan, cleanup failure, secret finding, or external interruption stops the chain at once and preserves all existing and newly claimed evidence. Rollback is limited to processes proven owned by the resume-004 PTY, `$RESUME_004_JAVA_PID`, and the successful active-chain result. Do not retry, start a second observer shell or observer exec, invent a basename/runId, profile again, install/relink/upgrade/fall back to another Maven, delete/truncate/rename/overwrite/reuse/Git-stage evidence, run formal Gate D, implement a repair, modify source/tests/OpenSpec/Dashboard/Review outside the mutually exclusive required diagnosis or resume-004 BLOCKED Review, archive OpenSpec, merge, tag, clean evidence/worktree files, or modify project rules. Any further action requires a new user decision; this plan grants no further resume.

## Final Acceptance

This implementation plan is complete only when:

- the diagnostic code and tests pass strict implementation Review;
- the fixed system SQLite capability and live-WAL regression pass, and attempt 002 main/WAL/SHM remain immutable;
- all three fresh 30-minute local reports and one offline profile exist without overwrite;
- the analyzer and diagnosis Review identify a confirmed primary cause or truthfully declare `inconclusive`;
- no production contract, threshold, workload, schema, persistence lifecycle, Dashboard state, OpenSpec task checkbox, or release artifact changed;
- no fix was implemented before root-cause confirmation.

After Gate R1 PASS, create a separate [admission performance recovery implementation plan](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/docs/superpowers/plans/2026-07-16-agent-runtime-admission-performance-recovery.md). Do not append the repair implementation to this diagnostic plan.
