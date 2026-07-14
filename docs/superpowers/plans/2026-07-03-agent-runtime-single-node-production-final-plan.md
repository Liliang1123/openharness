# Agent Runtime Single-Node Production Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Promote the existing Agent Runtime MVP to a single-process, SQLite-backed production v1 with deterministic restart recovery, private-service security, auditable real provider/tool qualification, and a fixed 24-hour stability gate.

**Architecture:** One TypeScript Runtime process owns a SQLite Lifecycle Unit of Work and durable outbox; Java remains the credential, provider, sandbox, policy, and trace-ingestion owner. Durable SSE events are committed and replayable, streaming previews are transient, interrupted runners terminate as `EXECUTION_INTERRUPTED`, and every persisted resource is scoped by tenant+user ownership.

**Tech Stack:** TypeScript, Zod, Fastify, Vitest, React, pnpm, SQLite via `better-sqlite3`, Java 21/Spring Boot/Maven, MCP stdio, Bash/Node qualification harnesses.

---

## Execution Contract

- OpenSpec change: `harden-agent-runtime-single-node-production` (approved 2026-07-03).
- Evidence profile: `strict`.
- Batch profile: `staged`.
- Implementation discipline: TDD for every behavior change; systematic debugging for unexplained failures; verification-before-completion for every promotion claim.
- Git rule: this plan contains no automatic commit step because repository rules require explicit user authorization before `git add` or `git commit`.
- Scope rule: do not implement platform login, model configuration UI, PostgreSQL, multi-worker Runtime, or Java restart durability.

## Stage Gates

| Gate | Required evidence | Human approval |
|---|---|---|
| Gate A — dependency/driver | `better-sqlite3` transaction, WAL, busy deadline, advisory-lock spike on target Node/platform | Required before durable implementation |
| Gate B — pre-cutover | backup hashes, import report, quarantine report, restore rehearsal, crash matrix, full deterministic tests | Required before first real SQLite write |
| Gate C — real integrations | redacted OpenAI-compatible, Anthropic, Java sandbox, and MCP matrix reports; no skipped required row | Required before real credentials/tools run and before Stage 3 |
| Gate D — soak promotion | short baseline passed, then fixed 24h report passed without threshold relaxation | Required before Runtime v1 freeze |

## Planned Files

### Shared contracts and frontend

- Modify `packages/shared-schema/src/index.ts`: terminal enum, durable `SessionEvent`, transient `PreviewDeltaEvent`, discriminated wire union.
- Modify `packages/shared-schema/test/schema.test.ts`: positive/negative union and terminal tests.
- Modify `frontend/src/api.ts`: consume shared wire vocabulary rather than the local loose event shape.
- Modify `frontend/src/App.tsx`, `frontend/src/runtimeProgress.ts`: preview versus durable handling and reconnect deduplication.
- Modify `frontend/test/App.test.tsx`, `frontend/test/runtimeProgress.test.ts`: interrupted rendering and replay behavior.

### Runtime storage and lifecycle

- Create `agent-runtime/src/storage/runtimeStorage.ts`: connection ownership, Unit of Work, 5-second contention deadline.
- Create `agent-runtime/src/storage/schema.ts`: migration registry and schema version.
- Create `agent-runtime/src/storage/migrations/001_runtime_v1.ts`: tables, indexes, constraints, outbox columns.
- Create `agent-runtime/src/storage/singletonLock.ts`: database-adjacent OS advisory lock.
- Create `agent-runtime/src/storage/diskGuard.ts`: WAL checkpoint and low/critical disk admission state.
- Create `agent-runtime/src/storage/sqliteHistoryStore.ts`, `sqliteMemoryStore.ts`, `sqliteExecutionStore.ts`, `sqliteApprovalStore.ts`, `sqliteRuntimeEventStore.ts`: scoped repositories bound to transactions.
- Create `agent-runtime/src/storage/jsonImporter.ts`: validation, idempotent import, quarantine manifest.
- Create `agent-runtime/src/storage/reconcile.ts`: interrupted execution/approval/provisional-context reconciliation.
- Create `agent-runtime/src/storage/traceOutbox.ts`: durable delivery, retry, dead-letter.
- Modify `agent-runtime/src/historyFactory.ts`, `server.ts`, `agentExecutionRunner.ts`, `runtimeEventStore.ts`, `executionStateStore.ts`, `approvalStore.ts`, `memoryStore.ts`, `types.ts`, `index.ts`.

### Security and qualification

- Create `agent-runtime/src/security/serviceAuth.ts`: production service-token authentication and identity parsing.
- Create `agent-runtime/src/security/redaction.ts`: shared secret/payload redaction.
- Create `agent-runtime/src/qualification/reportSchema.ts`, `providerMatrix.ts`, `mcpMatrix.ts`, `soakHarness.ts`, `soakWorker.ts`.
- Create `agent-runtime/fixtures/mcp/qualification-server.ts`.
- Modify `backend/src/main/java/org/openharness/backend/service/provider/OpenAiCompatibleAdapter.java`, `AnthropicAdapter.java`, trace ingestion and sandbox code only when an evidence-backed matrix row fails.
- Add focused Java tests beside changed classes.
- Create `docs/operations/agent-runtime-single-node.md` and qualification report templates under `docs/verification/agent-runtime-v1/`.

## Stage 1 — SQLite Durability, Recovery, And Wire Contracts

### Task 1: Driver Spike And Baseline Gate

**Gate:** Gate A, manual.

**Allowed files:** `agent-runtime/package.json`, `pnpm-lock.yaml`, `agent-runtime/test/storageDriverSpike.test.ts`, `docs/verification/agent-runtime-v1/driver-spike.md`.

**Code fact anchors:** Node runtime is currently Node 20 types; Runtime stores are injected through `createServer`; existing persistent stores are JSON/in-memory.

**Negative searches:** `rg -n "sqlite|better-sqlite3|HISTORY_STORE" agent-runtime/src agent-runtime/package.json` must show no hidden second SQLite owner.

- [x] **Step 1: Add the driver dependency only**

Run:

```bash
pnpm --filter @openharness/agent-runtime add better-sqlite3
```

Expected: dependency and lockfile change only; installation succeeds on the target Node/platform.

- [x] **Step 2: Write a failing driver spike**

Create tests proving WAL/foreign keys, `BEGIN IMMEDIATE`, rollback, a single 5-second wall-clock busy deadline, and temporary-file cleanup. Use a real temporary database, two connections for contention, and assert elapsed time is `<= 5500ms`.

- [x] **Step 3: Run RED**

```bash
pnpm --filter @openharness/agent-runtime test -- storageDriverSpike
```

Expected: FAIL because the storage wrapper does not exist.

- [x] **Step 4: Implement only the spike wrapper and run GREEN**

Expose this initial contract:

```ts
export interface RuntimeDatabase {
  readonly path: string;
  transaction<T>(work: (tx: RuntimeTransaction) => T): T;
  close(): void;
}

export interface RuntimeTransaction {
  run(sql: string, params?: readonly unknown[]): { changes: number };
  get<T>(sql: string, params?: readonly unknown[]): T | undefined;
  all<T>(sql: string, params?: readonly unknown[]): T[];
}
```

Run the focused test and `pnpm --filter @openharness/agent-runtime typecheck`.

- [x] **Step 5: Record Gate A evidence and stop**

Record Node/OS/architecture, installed driver version, native build result, WAL result, measured contention deadline, cancellation limitation, and rollback result. Human approval is required before Task 2.

**Signoff:** real file-backed spike passes; no production store has been cut over; Gate A explicitly approved.

### Task 2: Shared Durable/Transient Wire Contract

**Gate:** step-critical.

**Allowed files:** shared schema and frontend files listed above, plus runtime `types.ts`/event serialization tests.

**Expected anchors:** `RuntimeTerminalErrorSchema`, `SessionEventSchema`, new `PreviewDeltaEventSchema`, new `SSEWireEventSchema`.

**Negative searches:** no frontend production type may retain `event: string; data: Record<string, unknown>`; no `preview_delta` may accept `eventId`.

- [x] **Step 1: Write RED schema tests**

Add cases for durable event requiring `userId`; preview requiring positive `previewSeq`; preview rejecting `eventId`; durable rejecting missing `eventId`; both terminal schemas accepting `EXECUTION_TIMEOUT` and `EXECUTION_INTERRUPTED`.

- [x] **Step 2: Run RED**

```bash
pnpm --filter @openharness/shared-schema test -- schema
```

Expected: FAIL on missing union/new enum.

- [x] **Step 3: Implement the strict discriminated union**

Use strict Zod objects and a discriminant such as `durability: "durable" | "transient"`; do not make `eventId` optional on one broad shape. Export inferred types.

- [x] **Step 4: Write and run frontend RED tests**

Assert preview renders progressively but is absent after session reload; durable reconnect duplicates are deduped by `eventId`; `EXECUTION_INTERRUPTED` renders terminal state.

- [x] **Step 5: Migrate Runtime and Frontend parsers, then GREEN**

Run:

```bash
pnpm --filter @openharness/shared-schema test
pnpm --filter @openharness/shared-schema typecheck
pnpm --filter @openharness/frontend test
pnpm --filter @openharness/frontend typecheck
pnpm --filter @openharness/agent-runtime test -- streamEventIds sessionEventsApi terminalErrors
pnpm --filter @openharness/agent-runtime typecheck
```

**Signoff:** union is mutually exclusive; user ownership is required; existing durable event behavior remains compatible where specified.

### Task 3: SQLite Schema, Migrations, Singleton Fence, And Disk Guard

**Gate:** step-critical.

**Allowed files:** `agent-runtime/src/storage/**`, focused storage tests, runtime startup/readiness wiring.

**Schema anchors:** `schema_migrations`, `conversations`, `messages`, `executions`, `approvals`, `runtime_events`, `memory_facts`; unique ownership keys; outbox status/attempt/dead-letter fields.

**Negative searches:** no table keyed by bare `conversation_id`; no time-based stale singleton lease; no destructive down migration.

- [x] **Step 1: Write RED migration/schema tests**

Assert ordered idempotent migrations, FK enforcement, `(tenant_id,user_id,conversation_id)` ownership, `(tenant_id,user_id,conversation_id,seq)` uniqueness, one active execution partial unique constraint, and schema refusal on unknown newer version.

- [x] **Step 2: Write RED singleton/disk tests**

Spawn a second lock holder and assert readiness fails; simulate low and critical free-space probes; assert low stops admission while internal terminal writes remain allowed.

- [x] **Step 3: Run RED**

```bash
pnpm --filter @openharness/agent-runtime test -- runtimeStorage migration singletonLock diskGuard
```

- [x] **Step 4: Implement minimal schema and guards**

Migration must create ownership/index constraints and outbox retention state. Singleton lock is acquired before database mutation/readiness. Disk guard exposes `normal | low | critical` and separate `allowAdmission`/`allowInternalTerminalWrite` decisions.

- [x] **Step 5: Run GREEN and inspect schema**

Run focused tests, typecheck, and `PRAGMA integrity_check`; save `.schema` output to Gate B evidence.

**Signoff:** second instance cannot become ready; schema/integrity tests pass; contention deadline is bounded.

### Task 4: Transaction-Bound Repositories

**Gate:** step-critical.

**Allowed files:** SQLite repository files, store interfaces, factories, focused repository tests.

**Expected anchors:** every mutation accepts a `RuntimeTransaction`; repository code never starts its own transaction inside a Unit of Work.

**Negative searches:** `rg -n "BEGIN|transaction\(" agent-runtime/src/storage/sqlite*Store.ts` must show no repository-owned lifecycle transaction.

- [x] **Step 1: Write RED repository contract tests**

Cover history chronological reads, user isolation, memory user isolation, execution scoped lookup, approval CAS, event cursor/watermark, replay at-least-once identity, outbox status, and rollback across multiple repositories.

- [x] **Step 2: Run RED**

```bash
pnpm --filter @openharness/agent-runtime test -- sqliteHistory sqliteMemory sqliteExecution sqliteApproval sqliteRuntimeEvent
```

- [x] **Step 3: Implement repositories and factories**

Keep existing interfaces injectable but add `userId` to every scoped operation. JSON/in-memory implementations remain test/dev compatibility paths until cutover.

- [x] **Step 4: Run GREEN plus existing store regression suites**

```bash
pnpm --filter @openharness/agent-runtime test -- history memoryStore executionStateStore approvalStore runtimeEventStore
pnpm --filter @openharness/agent-runtime typecheck
```

**Signoff:** same-tenant cross-user tests pass; rollback leaves no partial row.

### Task 5: Lifecycle Unit Of Work And Crash Matrix

**Gate:** strict step-critical.

**Allowed files:** execution runner/server/store integration and crash-matrix tests.

**Atomic anchors:** six boundaries from approved design: execution start; approval wait; approval CAS; model tool-call provisional state; tool result closure; terminal/interrupted closure.

**Negative searches:** no direct multi-store mutation outside `RuntimeStorage.transaction`; no committed SSE publish before transaction return.

- [x] **Step 1: Build the failing crash matrix**

For every atomic boundary, inject failure immediately before commit and immediately after commit. Before commit expects no visible transition; after commit expects durable replay and idempotent recovery. Include dangling assistant tool-call exclusion.

- [x] **Step 2: Run RED**

```bash
pnpm --filter @openharness/agent-runtime test -- lifecycleUnitOfWork crashMatrix
```

- [x] **Step 3: Refactor runner to lifecycle commands**

Introduce explicit commands such as `startExecution`, `enterApproval`, `recordToolPlan`, `completeTool`, `completeExecution`, `interruptExecution`; each owns one Unit of Work and returns committed durable events for post-commit publication.

- [x] **Step 4: Run GREEN and lifecycle regressions**

```bash
pnpm --filter @openharness/agent-runtime test -- agentExecutionRunner approvalRecovery detachedStream activeExecutionLock nonStreamRunner crashMatrix
pnpm --filter @openharness/agent-runtime typecheck
```

**Signoff:** all commit-before/after cases pass; no provisional context reaches the next turn after interruption.

### Task 6: Restart Reconciliation, ApprovalId, And Private Service Auth

**Gate:** strict security step-critical.

**Allowed files:** reconciliation, approval, service-auth, server routes, session/memory APIs, focused tests.

**Expected anchors:** `EXECUTION_INTERRUPTED`; memory-only Java approval token; durable HMAC digest; non-sensitive `approvalId`; production service token checked before identity parsing.

**Negative searches:** no production default tenant/user; no `approvalToken` in SSE/API/event/trace/log; no body/query identity override.

- [x] **Step 1: Write RED restart/security tests**

Cover running/waiting reconciliation, approval invalidation, stale approvalId rejection, missing/invalid service token, missing/duplicate identity headers, cross-tenant and same-tenant cross-user IDOR for conversation/execution/approval/event/memory.

- [x] **Step 2: Run RED**

```bash
pnpm --filter @openharness/agent-runtime test -- restartReconciliation serviceAuth approvalApi sessionsApi memoryApi sessionEventsApi
```

- [x] **Step 3: Implement reconciliation/auth/approval boundary**

Authenticate first; parse immutable headers second; scope all repositories third. Store raw Java approval token only in a process-local map keyed by approvalId; persist HMAC/TTL/single-use state; invalidate on startup.

- [x] **Step 4: Run GREEN and secret scan**

```bash
pnpm --filter @openharness/agent-runtime test
pnpm --filter @openharness/agent-runtime typecheck
rg -n "approvalToken|default-tenant|default-user" agent-runtime/src frontend/src packages/shared-schema/src
```

Expected: only explicitly justified internal provider-response handling may mention raw token; no public/durable shape does.

**Signoff:** all authentication/IDOR negatives pass; raw token canary absent from artifacts.

### Task 7: Durable Trace Outbox

**Gate:** strict step-critical.

**Allowed files:** Runtime outbox, Java trace ingest dedup, related TypeScript/Java tests.

**Expected anchors:** `pending | retry | delivered | dead_letter`; committed event identity; Java unique/dedup behavior.

**Negative searches:** no pruning of pending/retry/dead-letter; no best-effort-only post-commit trace call.

- [x] **Step 1: Write RED TypeScript and Java tests**

Cover crash before ack, crash after Java record/before local ack, Java outage retry, delivered retention eligibility, exhausted dead-letter/readiness degradation, duplicate Java delivery.

- [x] **Step 2: Run RED**

```bash
pnpm --filter @openharness/agent-runtime test -- traceOutbox
mvn -f backend/pom.xml -Dtest='*Trace*Test' test
```

- [x] **Step 3: Implement dispatcher and Java dedup**

Dispatcher reads committed outbox rows, applies bounded retry, persists state changes, resumes after restart. Java records one logical event per committed identity.

- [x] **Step 4: Run GREEN**

Run focused TypeScript/Java tests, Runtime typecheck, and backend Maven tests.

**Signoff:** at-least-once evidence passes; dead letters are durable and observable.

### Task 8: JSON Import, Quarantine, And Gate B

**Gate:** Gate B, manual; this is the SQLite cutover gate.

**Allowed files:** importer, migration tests/fixtures, operations docs, verification reports.

**Expected anchors:** backup hash manifest; idempotent import; quarantine path/hash/error only; explicit human acceptance; forward-fix-only marker.

**Negative searches:** quarantine contains no message/memory content or token; no JSON/SQLite dual-write.

- [x] **Step 1: Write RED fixture tests**

Use valid, duplicate, malformed, wrong-scope, missing-user, and secret-bearing JSON fixtures. Assert valid rows import once, invalid rows quarantine without raw content, non-empty quarantine blocks automatic cutover, and rerun is idempotent.

- [x] **Step 2: Implement importer and report schema**

Import only after backup hash creation. Require an explicit owner mapping for legacy records lacking userId. Persist a cutover state that prevents old binary writes after first SQLite write.

- [x] **Step 3: Run migration/crash matrix**

```bash
pnpm --filter @openharness/agent-runtime test -- jsonImporter runtimeStorage crashMatrix
pnpm --filter @openharness/agent-runtime typecheck
```

- [x] **Step 4: Rehearse pre-cutover restore and post-cutover forward-fix**

Record RTO ≤30 minutes, backup RPO, counts/hashes, quarantine decision, restore output, and forward migration rehearsal.

- [x] **Step 5: Stop for human Gate B**

No real SQLite cutover write is authorized until the user approves the evidence bundle.

Human approval was received on 2026-07-06 at 15:55 CST. Production backup/import/quarantine/restore, measured RPO/RTO, forward-fix-only cutover, owner-only SQLite artifacts, sole Runtime write authority, and the bounded production startup/read/write probe passed final Gate B reconciliation on 2026-07-14. Gate C, Gate D, final production qualification, contract freeze, and archive remain open.

**Stage 1 formal verification:** full `pnpm test`, `pnpm typecheck`, relevant Maven tests, OpenSpec strict validation, dashboard check, negative secret/legacy-path searches.

## Stage 2 — Real Provider And Tool Qualification

### Task 9: Shared Qualification Report And Redaction Boundary

**Gate:** strict step-critical.

**Allowed files:** qualification/report/redaction modules, tests, report templates; logger call sites only as required.

**Expected anchors:** shared Zod/TypeScript matrix row fields `track: "local" | "production"`, `environment`, `protocolVersion`, `capabilities`, `requestHash`, `observed`, `oracle`, `usage`, `cost`, `durationMs`, `result`; report aggregation rejects overall `pass` when any required row is `blocked` or `fail`.

- [x] **Step 1: Write shared report-schema RED tests** in `packages/shared-schema/test/schema.test.ts` for required `track`, invalid track rejection, complete row parsing, and blocked/failed required rows preventing overall pass. Run `pnpm --filter @openharness/shared-schema test -- schema` and observe failure because the qualification schemas do not exist.
- [x] **Step 2: Implement shared report schema** in `packages/shared-schema/src/index.ts` with strict row/report objects and cross-row aggregate validation. Run the focused schema tests and shared-schema typecheck GREEN.
- [x] **Step 3: Write Runtime redaction RED tests** in `agent-runtime/test/qualificationRedaction.test.ts` using nested Authorization, bearer, API-key, token, error, header, stdout/file/trace/report-shaped values. Run the focused test and observe failure because `agent-runtime/src/qualification/redaction.ts` does not exist.
- [x] **Step 4: Implement the Runtime redaction boundary** in `agent-runtime/src/qualification/redaction.ts`; recursively return a sanitized copy, redact secret keys and secret-bearing strings, preserve non-secret structure, and never mutate the input. Run focused tests and Runtime typecheck GREEN.
- [x] **Step 5: Write and implement the Java equivalent with RED/GREEN** in `backend/src/test/java/org/openharness/backend/qualification/QualificationRedactorTest.java` and `backend/src/main/java/org/openharness/backend/qualification/QualificationRedactor.java`. Cover nested maps/lists, Authorization, bearer/API-key/token strings, and input immutability; run `mvn -f backend/pom.xml -Dtest=QualificationRedactorTest test`.
- [x] **Step 6: Run strict Task 9 verification**: shared-schema and Runtime focused/full tests and typechecks, backend tests, OpenSpec strict validation, dashboard check, `git diff --check`, and a canary scan proving the fixture value appears only in test sources and explicit future-test plan text.

**Signoff:** canary count is zero outside test source fixtures; required-row `BLOCKED` prevents overall PASS.

### Task 10: OpenAI-Compatible And Anthropic Real Matrix

**Gate:** Gate C credential authorization required before any real call.

**Gate C required family (amended 2026-07-09 via `defer-anthropic-from-gate-c`):** OpenAI-compatible only. Anthropic real matrix is deferred / post-Gate-C and MUST NOT block Gate C when Anthropic credentials are absent. OpenAI-compatible PASS does not qualify Anthropic.

**Allowed files:** qualification harness plus evidence-backed adapter fixes/tests. The first implementation slice is limited to [RealProviderQualificationRunner.java](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/backend/src/main/java/org/openharness/backend/qualification/RealProviderQualificationRunner.java), [RealProviderQualificationConfig.java](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/backend/src/main/java/org/openharness/backend/qualification/RealProviderQualificationConfig.java), [RealProviderQualificationMatrix.java](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/backend/src/main/java/org/openharness/backend/qualification/RealProviderQualificationMatrix.java), [QualificationExchangeCapture.java](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/backend/src/main/java/org/openharness/backend/qualification/QualificationExchangeCapture.java), [QualificationReportWriter.java](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/backend/src/main/java/org/openharness/backend/qualification/QualificationReportWriter.java), their same-package tests, and the two existing Provider adapters only where the scoped capture tests require sanitized protocol/usage evidence. Do not change routing, production configuration loading, retry thresholds, provider defaults, or public APIs.

**Runner contract:** invoke the Java entry point with `mvn -f backend/pom.xml -q compile exec:java -Dexec.mainClass=org.openharness.backend.qualification.RealProviderQualificationRunner -Dexec.args='--real --provider <openai-compatible|anthropic> --endpoint <https-base-url> --model <model-id> --report-path <new-json-path> --cost-budget-usd-micros <positive-integer> --max-output-tokens <positive-integer> --input-cost-usd-micros-per-million-tokens <nonnegative-integer> --output-cost-usd-micros-per-million-tokens <nonnegative-integer> [--cache-read-cost-usd-micros-per-million-tokens <nonnegative-integer> --cache-write-cost-usd-micros-per-million-tokens <nonnegative-integer>]'`. `--real` and exactly one supported `--provider` are mandatory. Endpoint, model, report path, cost budget, maximum output tokens, and provider pricing are CLI metadata, never environment fallbacks. OpenAI-compatible reads only `OPENAI_COMPATIBLE_API_KEY`; Anthropic reads only `ANTHROPIC_API_KEY`. The runner MUST NOT accept credential CLI flags, read `.env`, enumerate the environment, or print credential values. Anthropic protocol version is fixed to adapter header `2023-06-01`; OpenAI-compatible records `openai-chat-completions` plus the configured model identifier.

**Fixed production rows:** every report contains exactly these required provider-prefixed row ids in this order: `sync`, `stream`, `single-tool-call`, `multi-step-tool-call`, `structured-arguments`, `reasoning`, `usage`, `cost`, `503-retry`, `timeout`, `cancellation`, `terminal-error`, `redaction`. No row is optional. A missing row, duplicate row, wrong order, wrong `track`, or any required `blocked`/`fail` row vetoes overall `pass`. Unsupported reasoning, stream, multi-step tool, retry observability, timeout, or cancellation is `blocked`, never skipped or rewritten as pass. Each row records `track=production`, sanitized environment fingerprint, provider protocol and model version, capability prerequisites, a SHA-256 of the canonical redacted outbound request or blocked request intent, sanitized observed response/event sequence, explicit oracle, exact raw-provider versus adapter usage counters, recomputed USD micros, duration, and result.

**Safety and stop conditions:** configuration/preflight completes before constructing an adapter or HTTP client. Missing credential produces a schema-valid production report with all 13 rows `blocked`, uses hashes of canonical redacted request intents, writes it atomically only when `--report-path` does not exist, exits non-zero, and makes zero DNS/socket/HTTP attempts. Invalid/missing CLI values, non-HTTPS endpoint, endpoint user-info/query/fragment, zero/negative budget or max-output tokens, incomplete Anthropic cache pricing, existing report path, or temp/report path collision fail closed before external I/O. The report writer creates a sibling temp file, fsyncs it, validates fixed-row/schema/veto/redaction/cost invariants, atomically moves it without replacement, and deletes the temp file on failure. There is no overwrite flag. Every fixture has a fixed UTF-8-byte upper bound for input tokens; combine that conservative bound with `--max-output-tokens` and authorized pricing before each dispatch. The runner stops scheduling rows when that worst-case next-call cost would exceed the remaining budget; unrun rows become `blocked`, and the report cannot pass. Qualification-scoped request metadata MUST enforce the same maximum output tokens in both adapters. The `503-retry` row requires an owner-authorized provider-backed fault-injection mechanism at the same real endpoint; absence of that capability is `blocked`, and a loopback/mock proxy cannot satisfy it. No call may exceed one shared row deadline. Timeout and cancellation must terminate the in-flight request within their oracle deadline and leave no active request/capture entry.

- [x] **Step 1: Write report-builder RED tests** in `agent-runtime/test/qualificationReport.test.ts` for shared-schema validation, recursive redaction, `promptTokens`/`completionTokens` preservation, track consistency, and required-row veto. Implement `agent-runtime/src/qualification/report.ts` minimally and run focused GREEN plus Runtime typecheck.
- [x] **Step 2: Write OpenAI-compatible fake-server RED matrix tests** in `backend/src/test/java/org/openharness/backend/qualification/OpenAiFakeProviderMatrixTest.java` covering sync, structured tool calls, exact usage, 503 retry, timeout, terminal error, Authorization redaction, and explicit blocked rows for unsupported stream/cancellation/reasoning capabilities.
- [x] **Step 3: Implement only evidence-backed OpenAI adapter/harness changes**, then run the focused matrix. Do not relax a required oracle or convert unsupported capability to PASS.
- [x] **Step 4: Write Anthropic fake-server RED matrix tests** in `backend/src/test/java/org/openharness/backend/qualification/AnthropicFakeProviderMatrixTest.java` covering sync, structured tool use, exact usage/cache usage, 503 retry, timeout, terminal error, API-key redaction, and explicit blocked rows for unsupported stream/cancellation/reasoning capabilities. (Supporting / local evidence; not Gate C required.)
- [x] **Step 5: Implement only evidence-backed Anthropic adapter/harness changes**, then run the focused matrix. Preserve the fixed protocol version and required capability semantics. (Supporting; Anthropic real matrix remains deferred.)
- [x] **Step 6: Generate immutable local reports** under `docs/verification/agent-runtime-v1/providers/`, validate them through the shared schema, verify intentional fail/blocked fixtures prevent overall PASS, and scan reports for secret canaries.
- [x] **Step 7: Run Task 10 local verification**: focused/full Runtime and Backend tests, typecheck, OpenSpec strict validation, dashboard check, and `git diff --check`.
- [x] **Step 8: Write CLI/config RED tests** in [RealProviderQualificationRunnerTest.java](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/backend/src/test/java/org/openharness/backend/qualification/RealProviderQualificationRunnerTest.java) and [RealProviderQualificationConfigTest.java](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/backend/src/test/java/org/openharness/backend/qualification/RealProviderQualificationConfigTest.java). Use an injected `Map<String,String>` environment and a counting `HttpClient`/transport factory. Assert the exact runner contract above, provider-specific credential allowlist, rejection of credential arguments and unsafe endpoints, missing-credential schema-valid `blocked` output, non-zero exit, and zero transport construction/calls. Run `mvn -f backend/pom.xml -Dtest=RealProviderQualificationRunnerTest,RealProviderQualificationConfigTest test`; expected RED is compilation failure because the real runner/config do not exist.
- [x] **Step 9: Implement minimal secret-safe config preflight** in [RealProviderQualificationConfig.java](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/backend/src/main/java/org/openharness/backend/qualification/RealProviderQualificationConfig.java) and orchestration in [RealProviderQualificationRunner.java](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/backend/src/main/java/org/openharness/backend/qualification/RealProviderQualificationRunner.java). Define `ProviderKind { OPENAI_COMPATIBLE("OPENAI_COMPATIBLE_API_KEY"), ANTHROPIC("ANTHROPIC_API_KEY") }`, parse only the documented flags, retain the credential only in a private in-memory field excluded from `toString`/records/report maps, and return the blocked report before adapter/transport creation when it is absent. Run the Step 8 tests; expected GREEN with no outbound attempts and no credential/canary in captured stdout, stderr, exception text, or report.
- [x] **Step 10: Write fixed-row/schema/veto RED tests** in [RealProviderQualificationMatrixTest.java](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/backend/src/test/java/org/openharness/backend/qualification/RealProviderQualificationMatrixTest.java). Assert the exact 13-row ordered set for each provider; production track; provider/model/protocol/capability/request-hash/observed/oracle/usage/cost/duration/result fields; Anthropic cache usage; missing/duplicate/reordered row rejection; unsupported required capability becoming `blocked`; and overall `pass` only when all rows pass. Run `mvn -f backend/pom.xml -Dtest=RealProviderQualificationMatrixTest test`; expected RED because the production matrix validator does not exist.
- [x] **Step 11: Implement the fixed matrix and scoped exchange evidence** in [RealProviderQualificationMatrix.java](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/backend/src/main/java/org/openharness/backend/qualification/RealProviderQualificationMatrix.java) and [QualificationExchangeCapture.java](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/backend/src/main/java/org/openharness/backend/qualification/QualificationExchangeCapture.java). Reuse [OutboundRequestTracker.java](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/backend/src/main/java/org/openharness/backend/qualification/OutboundRequestTracker.java) for canonical redacted request hashes. Add only qualification-scoped, bounded, consume-once capture hooks to [OpenAiCompatibleAdapter.java](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/backend/src/main/java/org/openharness/backend/service/provider/OpenAiCompatibleAdapter.java) and [AnthropicAdapter.java](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/backend/src/main/java/org/openharness/backend/service/provider/AnthropicAdapter.java) for sanitized status/event order/raw usage/protocol evidence. Ordinary calls outside a capture retain nothing. Implement a two-call tool conversation for `multi-step-tool-call`, compare structured JSON rather than strings, compare raw provider usage exactly with adapter usage, and recompute `ceil(tokens * configuredMicrosPerMillion / 1_000_000)` per usage class using overflow-safe integer arithmetic. Run Step 10 plus existing fake matrix/tracker tests; expected GREEN without changing local report hashes.
- [x] **Step 12: Write timeout/cancel/budget RED tests** in [RealProviderQualificationMatrixTest.java](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/backend/src/test/java/org/openharness/backend/qualification/RealProviderQualificationMatrixTest.java). With a controllable in-process transport fixture, assert one shared deadline includes retries/backoff, timeout produces no late success, cancellation interrupts and joins the request thread, captures are empty afterward, accumulated cost never exceeds `--cost-budget-usd-micros`, and budget exhaustion blocks every unscheduled row without another call. Run the focused test; expected RED until matrix scheduling owns deadline/cancellation/cost accounting.
- [x] **Step 13: Implement deadline, cancellation cleanup, and budget admission** in [RealProviderQualificationMatrix.java](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/backend/src/main/java/org/openharness/backend/qualification/RealProviderQualificationMatrix.java). Pass remaining deadline through request metadata, cancel by request id, join within the oracle bound, consume/clear request and exchange captures in `finally`, and check worst-case next-row budget before dispatch. Preserve existing adapter retry count/delays. Run the Step 12 tests and `mvn -f backend/pom.xml -Dtest=OpenAiFakeProviderMatrixTest,AnthropicFakeProviderMatrixTest,OutboundRequestTrackerTest test`; expected GREEN.
- [x] **Step 14: Write atomic/no-overwrite/redaction RED tests** in [QualificationReportWriterTest.java](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/backend/src/test/java/org/openharness/backend/qualification/QualificationReportWriterTest.java) and process-level [RealProviderQualificationRunnerTest.java](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/backend/src/test/java/org/openharness/backend/qualification/RealProviderQualificationRunnerTest.java). Assert existing targets are byte-identical, concurrent writers yield one winner, failed validation/move leaves no target/temp file, same-directory atomic move is used without replacement, and Authorization/bearer/`sk-qualification-canary` strings are absent from stdout, stderr, thrown messages, capture snapshots, and report bytes. Run the two focused tests; expected RED because the production writer does not exist.
- [x] **Step 15: Implement immutable report writing** in [QualificationReportWriter.java](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/backend/src/main/java/org/openharness/backend/qualification/QualificationReportWriter.java). Redact a copied report, validate the strict production/fixed-row/veto/cost contract, write and fsync a sibling temp, perform `ATOMIC_MOVE` without `REPLACE_EXISTING`, fail closed when atomic move is unavailable, and delete the temp in `finally`. The CLI prints only provider, result, row counts, report path, and report SHA-256 after the move. Run Step 14; expected GREEN.
- [x] **Step 16: Run runner-local strict acceptance without real credentials.** Run `env -u OPENAI_COMPATIBLE_API_KEY -u ANTHROPIC_API_KEY mvn -f backend/pom.xml -Dtest=RealProviderQualificationRunnerTest,RealProviderQualificationConfigTest,RealProviderQualificationMatrixTest,QualificationReportWriterTest,OpenAiFakeProviderMatrixTest,AnthropicFakeProviderMatrixTest,OutboundRequestTrackerTest,QualificationRedactorTest test`, then `mvn -f backend/pom.xml test`, `pnpm --filter @openharness/shared-schema test`, `pnpm --filter @openharness/shared-schema typecheck`, `pnpm --filter @openharness/agent-runtime test -- qualificationReport qualificationRedaction`, and `pnpm --filter @openharness/agent-runtime typecheck`. Expected: all tests/typechecks pass; process tests prove missing credentials are `BLOCKED` with zero external call. Run the canary search `rg -n --hidden --glob '!**/target/**' --glob '!**/node_modules/**' 'sk-qualification-canary|Bearer qualification-canary' backend docs/verification/agent-runtime-v1/providers`; expected matches only in designated test source, never generated reports/logs. Run `openspec validate harden-agent-runtime-single-node-production --strict --no-interactive` and `git diff --check`; expected PASS. This completes runner implementation acceptance only; it does not satisfy OpenSpec 3.1/3.2 or authorize a real endpoint.
- [x] **Step 17: Stop for credential-owner authorization.** Record explicit authorization separately for one provider at a time: exact HTTPS endpoint, model, pricing inputs, maximum `--cost-budget-usd-micros`, maximum output tokens, provider-backed 503 fault-injection capability or an explicit acknowledgement that the required row will remain `blocked`, designated report path, credential environment variable owner/injection method, and allowed execution window. Do not place the credential value in the authorization record. Without this current authorization, do not invoke the real CLI even if a credential happens to exist in the shell.
- [x] **Step 18: Run OpenAI-compatible production qualification only after Step 17 authorization.** Use the exact authorized values with `--real --provider openai-compatible`; inject `OPENAI_COMPATIBLE_API_KEY` only into that process, leave `ANTHROPIC_API_KEY` unset, and choose a new report path under [provider evidence](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/docs/verification/agent-runtime-v1/providers/). A `blocked` or `fail` report remains evidence but does not close 3.1. Immediately scan captured stdout/stderr/report/temp directory for the fixed canaries and the credential SHA-256 supplied out-of-band by its owner; any hit is a hard FAIL requiring artifact isolation and incident handling, not report promotion.
- [ ] **Step 19: Run Anthropic production qualification only after a separate Step 17 authorization.** Use `--real --provider anthropic`, the authorized endpoint/model/pricing/budget/new report path, fixed protocol version `2023-06-01`, and only `ANTHROPIC_API_KEY`. Preserve/cache-account `cache_read_input_tokens` and `cache_creation_input_tokens`. Apply the same immutable write and secret scan rules. Any `blocked`/`fail` row keeps 3.2 open.
- [x] **Step 20: Independently review real evidence before promotion.** Verify report SHA-256, exact fixed rows, production track, endpoint/environment fingerprint, model/protocol version, request hashes, observed sequences, raw-versus-adapter usage equality, cost recomputation and total budget, timeout/cancel cleanup, required-row veto, and negative secret scans. Only a Review PASS on each provider's actual immutable report may support checking OpenSpec 3.1 or 3.2; runner-local acceptance, credentials being present, or owner authorization alone never qualifies either provider.

**Formal commands:** Step 16 is the mandatory no-network runner implementation gate. Steps 18 and 19 are separately authorized production executions and MUST NOT be folded into tests, CI, preflight, or implementation verification. Dashboard remains `proposed` and OpenSpec 3.1/3.2 remain unchecked until the corresponding immutable real report and independent Review both PASS.

### Task 11: Java Sandbox And MCP Real Matrix

**Gate:** Gate C tool execution authorization required.

**Allowed files:** MCP fixture/harness, qualification modules, evidence-backed sandbox/MCP fixes/tests.

- [x] Write deterministic RED matrix tests for sandbox fingerprint, read/search/run-command workspace escape, output cap, timeout, policy, idempotency, cancellation, audit evidence, and trace dedup.
- [x] Write deterministic RED MCP rows for initialize, tools/list, catalog conflict, multi-step call, provenance, approvalId, timeout, process crash, supported cancellation, SIGTERM shutdown.
- [x] Implement the real stdio qualification server and matrix runner.
- [x] Run deterministic matrices first; then stop for explicit real sandbox/MCP authorization.
- [x] Run real matrices and save redacted reports under `docs/verification/agent-runtime-v1/tools/`.

**Stage 2 signoff:** every required row PASS; no skip; canary scan clean; full TS/Java regression green; human Gate C promotion approved.

## Stage 3 — Baseline, Soak, And Runtime v1 Freeze

### Task 12: Deterministic Load Harness And Short Baseline

**Gate:** strict step-critical.

**Allowed files:** soak harness/worker, deterministic fixtures, report schema/tests.

**Fixed workload:** 10,000 seeded conversations; 20 concurrent executions; 60% no-tool, 20% Java sandbox fixture, 15% MCP fixture, 5% approval/interruption; 30-second samples.

- [x] Write RED report/oracle tests for every hard failure and sustained five-minute threshold breach.
- [x] Implement seed generation with tenant+user collision cases and deterministic operation IDs.
- [x] Implement metrics for admission/replay p95, RSS, FD, WAL, MCP children, integrity, duplicates, ordering, cross-scope leakage, and canary leakage.
- [x] Prepare the deterministic local short baseline runner and no-overwrite report writer for a future 30-minute local run.
- [x] Run a 30-minute baseline with one TS restart at minute 15.
- [x] Verify: admission p95 ≤100ms; replay p95 ≤250ms; RSS ≤1.5GiB; FD ≤1,024; checkpointed WAL ≤256MiB; no hard failure; no post-warmup upward leak trend.
- [x] Freeze environment fingerprint and report hash; do not relax thresholds after observation.

**Signoff:** short baseline PASS and reviewed before scheduling 24-hour run.

### Task 13: Fixed 24-Hour Soak

**Gate:** Gate D, manual before start and manual promotion after result.

- [ ] Confirm Java Gateway stays running; only TS Runtime restarts at hours 2, 12, and 22.
- [ ] Confirm deterministic provider/tool fixtures, disk headroom, report path, monitoring, and interruption procedure.
- [ ] Obtain explicit user approval to start the 24-hour run.
- [ ] Run the soak without changing code/config/thresholds.
- [ ] Stop immediately on a hard failure; retain partial report and do not promote.
- [ ] On completion, verify all thresholds, first/last two-hour RSS/FD median growth ≤10%, SQLite integrity, outbox/dead-letter state, event ordering, cross-scope isolation, and secret scan.
- [ ] Obtain explicit human promotion approval.

### Task 14: Final Verification, Contract Freeze, And Closeout

**Gate:** final-critical.

- [ ] Run full verification:

```bash
pnpm test
pnpm typecheck
mvn -f backend/pom.xml test
npx openspec validate harden-agent-runtime-single-node-production --strict --no-interactive
npx openspec validate --all --strict --no-interactive
pnpm dashboard:check
git diff --check
```

- [ ] Run negative searches for raw approval/provider secrets, default production identities, JSON dual-write, bare conversation keys, preview durability, pending outbox pruning, and threshold changes.
- [ ] Update operations documentation with backup/restore, forward-fix cutover, quarantine, singleton lock, low disk, dead-letter, credential rotation, and incident procedures.
- [ ] Mark OpenSpec tasks complete only where evidence exists.
- [ ] Sync dashboard to `verified`, render generated artifacts, and create the required review/closeout documents.
- [ ] Request independent code review and resolve all Critical/Important findings.
- [ ] Do not archive until deployment/qualification evidence and explicit user approval satisfy project rules.

## Step Evidence Gate Template

Every executable task must record:

1. Goal and acceptance criteria.
2. `path:line` code facts for entry point, call chain, schema/spec, tests, and old behavior.
3. Positive capability checks.
4. Negative searches relevant to the task.
5. Root-cause/gap analysis.
6. Minimal implementation strategy.
7. Allowed versus actually changed files.
8. Formal verification commands.
9. Observed pass/fail output.
10. Scope/fake-contract/self-review result.
11. Residual risks.
12. Explicit next-step permission.

## Plan Self-Review

- Spec coverage: all approved agent-runtime, agent-sse, shared-schema, message-history, long-term-memory, provider-adapter, mcp-tools, and backend-gateway deltas map to Tasks 1–14.
- Placeholder scan: no TBD/TODO/fill-in step remains; environment-dependent actions are explicit human gates, not placeholders.
- Type consistency: `EXECUTION_INTERRUPTED`, `approvalId`, durable `eventId`, transient `previewSeq`, tenant+user+conversation scope, and outbox states are consistent across stages.
- Scope: platform login/model UI/session product work remains excluded.
