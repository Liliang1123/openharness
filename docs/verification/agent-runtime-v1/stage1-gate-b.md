# Stage 1 Gate B Evidence

## Task 3 — Schema, Singleton Fence, And Disk Guard

Status: focused implementation verification passed for the local SQLite boundary. Gate B remains pending until the production backup/import/quarantine/restore and measured RPO/RTO evidence bundle passes review.

Observed on 2026-07-06:

- Focused suites: `runtimeStorage`, `migration`, `singletonLock`, `diskGuard` — 8/8 passed before the subprocess assertion was added.
- TypeScript: `pnpm --filter @openharness/agent-runtime typecheck` — passed.
- `PRAGMA integrity_check` — `ok`.
- `PRAGMA foreign_keys` on the Runtime connection — `1`.
- `PRAGMA wal_autocheckpoint` — `1000` pages.
- Negative search for bare conversation keys, stale leases, destructive down migrations, and `DROP TABLE` — no matches.

Schema inspection confirmed these application objects:

- tables: `schema_migrations`, `conversations`, `messages`, `executions`, `approvals`, `runtime_events`, `memory_facts`;
- partial unique index `one_active_execution_per_conversation` over `(tenant_id,user_id,conversation_id)` for `running|waiting_approval`;
- outbox index `runtime_event_outbox` for `pending|retry` delivery;
- conversation/message/event ownership and cursor keys include `tenant_id,user_id,conversation_id`.

The singleton fence is descriptor-owned rather than lease-based: Darwin uses non-blocking `O_EXLOCK`; Linux uses `flock` on an inherited open-file description. Closing the owning descriptor, including process death, releases the lock.

## Task 4 — Transaction-Bound Repositories

Status: focused implementation verification passed; SQLite repositories are transaction-bound and scoped by `(tenantId,userId,conversationId)` where applicable.

Observed on 2026-07-06:

- RED command: `pnpm --filter @openharness/agent-runtime test -- sqliteHistory sqliteMemory sqliteExecution sqliteApproval sqliteRuntimeEvent` — failed as expected before implementation because `sqliteHistoryStore`, `sqliteMemoryStore`, `sqliteExecutionStore`, `sqliteApprovalStore`, and `sqliteRuntimeEventStore` modules did not exist.
- Factory RED command: `pnpm --filter @openharness/agent-runtime test -- sqliteHistory` — failed as expected before factory implementation because `sqliteRuntimeRepositories` did not exist.
- GREEN focused command: `pnpm --filter @openharness/agent-runtime test -- sqliteHistory sqliteMemory sqliteExecution sqliteApproval sqliteRuntimeEvent` — 5 files passed, 9 tests passed.
- Regression command: `pnpm --filter @openharness/agent-runtime test -- history memoryStore executionStateStore approvalStore runtimeEventStore` — 11 files passed, 50 tests passed.
- TypeScript command: `pnpm --filter @openharness/agent-runtime typecheck` — passed.
- Repository lifecycle negative search: `rg -n "BEGIN|transaction\(" agent-runtime/src/storage/sqlite*Store.ts` — no matches; no repository starts its own transaction.
- Whitespace check: `git diff --check` — passed.

Behavior evidence:

- History repository preserves append order by scoped sequence and does not leak same-tenant same-conversation messages across users.
- Memory repository upserts, searches, lists, and deletes only inside tenant/user scope.
- Execution repository requires tenant/user/conversation scope for lookup and transition.
- Approval repository uses scoped compare-and-swap so a pending approval can be decided once.
- Runtime event repository replays by scoped cursor, exposes latest cursor watermark, preserves outbox event identity across retry/ack/dead-letter state transitions, and isolates same-tenant cross-user cursors.
- Multi-repository rollback test writes history and memory through the same `RuntimeTransaction`, throws, and observes no partial rows after rollback.

## Task 5 — Lifecycle Unit Of Work And Crash Matrix

Status: focused implementation verification passed for the SQLite lifecycle command boundary. Later local recovery/import/cursor/IDOR/WAL/low-disk/migration/outbox tests have since been added; Stage 1 Gate B still remains pending because production migration evidence is not attached.

Observed on 2026-07-06:

- RED command: `pnpm --filter @openharness/agent-runtime test -- lifecycleUnitOfWork crashMatrix` — failed before implementation because `agent-runtime/src/storage/lifecycleCommands.ts` did not exist.
- GREEN focused command: `pnpm --filter @openharness/agent-runtime test -- lifecycleUnitOfWork crashMatrix` — 2 files passed, 15 tests passed.
- Lifecycle regression command inside sandbox: `pnpm --filter @openharness/agent-runtime test -- agentExecutionRunner approvalRecovery detachedStream activeExecutionLock nonStreamRunner crashMatrix` — code suites passed, but `detachedStream` could not bind `127.0.0.1` and failed with `listen EPERM`; treated as sandbox permission failure.
- Lifecycle regression command outside sandbox with approved prefix: `pnpm --filter @openharness/agent-runtime test -- agentExecutionRunner approvalRecovery detachedStream activeExecutionLock nonStreamRunner crashMatrix` — 6 files passed, 38 tests passed.
- TypeScript command: `pnpm --filter @openharness/agent-runtime typecheck` — passed.
- Repository lifecycle negative search: `rg -n "BEGIN|transaction\(" agent-runtime/src/storage/sqlite*Store.ts` — no matches; SQLite repositories still do not start their own transactions.
- Post-commit publication search: `rg -n "publishCommittedLifecycleEvents|runtimeEventStore\.append|liveEvents\.append" agent-runtime/src agent-runtime/test -S` — found the new `publishCommittedLifecycleEvents` helper and existing legacy in-memory runner append path; SQLite lifecycle command tests cover durable events returning only after `RuntimeStorage.transaction` has committed.
- Provisional-context search: `rg -n "provisionalExecutionId|transient: true|EXECUTION_INTERRUPTED|invalidated" agent-runtime/src agent-runtime/test -S` — found lifecycle command marking and deletion of execution-owned provisional assistant tool-call context, `EXECUTION_INTERRUPTED` terminal state, and pending approval invalidation support.
- Whitespace check: `git diff --check` — passed.
- OpenSpec validation: `openspec validate harden-agent-runtime-single-node-production --strict --no-interactive` — change is valid, exit code 0; PostHog telemetry flush failed with `ENOTFOUND edge.openspec.dev`, matching the known network warning and not affecting local validation.

Behavior evidence:

- `startExecution` commits the stable user message, running execution row, and `agent_start` durable event in one `RuntimeStorage.transaction`.
- Durable live publication is explicit post-commit: lifecycle commands return committed events, and `publishCommittedLifecycleEvents` publishes them after the command returns.
- A post-commit publication failure does not roll back committed SQLite state; durable replay still returns the committed event.
- Six lifecycle boundaries have commit-before and commit-after crash matrix coverage: execution start, approval wait, approval decision, model tool-call provisional state, tool result closure, and terminal closure.
- Crash before commit leaves no visible transition for the targeted boundary.
- Crash after commit leaves durable replayable state and can be retried idempotently without duplicate messages, approvals, execution transitions, or runtime events.
- Interrupted execution removes execution-owned provisional assistant tool-call context from stable history, invalidates pending approvals, records `EXECUTION_INTERRUPTED`, and emits a durable `stream_error`.

## Task 6 — Restart Reconciliation, ApprovalId, And Private Service Auth

Status: focused implementation verification passed for startup reconciliation, service authentication, scoped approval/session/event/memory access, and public approval-token redaction. Stage 1 Gate B remains pending because production backup/import/quarantine/restore and measured RPO/RTO evidence are still absent.

Observed on 2026-07-06:

- RED command: `pnpm --filter @openharness/agent-runtime test -- restartReconciliation serviceAuth approvalApi sessionsApi memoryApi sessionEventsApi` — failed before implementation because `agent-runtime/src/storage/reconcile.ts` did not exist, production service auth did not reject missing/invalid credentials, same-tenant cross-user approval/session/event access was not scoped, and pending approval API shapes exposed `approvalToken`.
- GREEN focused command: `pnpm --filter @openharness/agent-runtime test -- restartReconciliation serviceAuth approvalApi sessionsApi memoryApi sessionEventsApi` — 6 files passed, 31 tests passed.
- Regression command: `pnpm --filter @openharness/agent-runtime test` — 54 files passed, 282 tests passed. `mcpRegistry` emitted expected stderr for malformed JSON and nonexistent binary isolation tests.
- TypeScript command: `pnpm --filter @openharness/agent-runtime typecheck` — passed.
- Shared schema command: `pnpm --filter @openharness/shared-schema test` — 1 file passed, 43 tests passed.
- Shared schema typecheck: `pnpm --filter @openharness/shared-schema typecheck` — passed.
- Secret/default scan: `rg -n "approvalToken|default-tenant|default-user" agent-runtime/src frontend/src packages/shared-schema/src` — no `default-tenant` or `default-user` matches. Remaining `approvalToken` matches are internal Runtime/Java policy and tool execution token plumbing plus explicit server-side response redaction; the public `AskUserRequest` schema no longer exposes `approvalToken`.
- OpenSpec validation: `openspec validate harden-agent-runtime-single-node-production --strict --no-interactive` — change is valid, exit code 0; PostHog telemetry flush failed with `ENOTFOUND edge.openspec.dev`, matching the known network warning and not affecting local validation.
- Whitespace check: `git diff --check` — passed.

Behavior evidence:

- `reconcileRuntimeStartup` scans SQLite non-terminal executions before readiness and atomically records `EXECUTION_INTERRUPTED`, invalidates pending approvals, removes execution-owned provisional context, and appends durable `stream_error`.
- Production service auth can be enabled with `requireServiceAuth` or `AGENT_RUNTIME_REQUIRE_SERVICE_AUTH=true`; missing or invalid bearer credentials fail with `401` before tenant state access.
- Production identity requires `X-Tenant-Id`, `X-User-Id`, `X-Trace-Id`, and `X-Request-Id`; body/query cannot override those headers.
- Session event replay and session detail APIs now apply same-tenant cross-user filtering when `X-User-Id` is supplied, while preserving legacy dev compatibility for requests that omit user identity outside production mode.
- Approval decisions reject same-tenant cross-user attempts without leaking raw token or cross-scope details.
- Pending approval API shapes are sanitized and do not include `approvalToken`; shared public ask-user schema also no longer accepts that raw-token field.

## Task 7 — Durable Trace Outbox

Status: focused implementation verification passed for durable Runtime trace outbox dispatch and Java trace-ingestion deduplication. Stage 1 Gate B remains pending because production migration and cutover validation evidence are still absent.

Observed on 2026-07-06:

- RED TypeScript command: `pnpm --filter @openharness/agent-runtime test -- traceOutbox` — failed before implementation because `agent-runtime/src/storage/traceOutbox.ts` did not exist.
- RED Java command: `mvn -f backend/pom.xml -Dtest='*Trace*Test' test` — failed before implementation because duplicate committed Runtime trace events were recorded as separate Java trace records.
- GREEN focused TypeScript command: `pnpm --filter @openharness/agent-runtime test -- traceOutbox sqliteRuntimeEventStore` — 2 files passed, 5 tests passed.
- Runtime storage regression command: `pnpm --filter @openharness/agent-runtime test -- traceOutbox sqliteRuntimeEventStore runtimeStorage` — 3 files passed, 9 tests passed.
- Runtime regression command: `pnpm --filter @openharness/agent-runtime test` — 55 files passed, 285 tests passed. `mcpRegistry` emitted expected stderr for malformed JSON and nonexistent binary isolation tests.
- Runtime typecheck command: `pnpm --filter @openharness/agent-runtime typecheck` — passed.
- Focused backend trace command: `mvn -f backend/pom.xml -Dtest='*Trace*Test' test` — passed.
- Backend regression command outside sandbox with approved prefix: `mvn -f backend/pom.xml test` — 28 tests passed, 0 failures, 0 errors. The same command inside sandbox failed earlier because Mockito inline ByteBuddy could not self-attach to the test JVM.
- Outbox state negative search: `rg -n "DELETE FROM runtime_events|delivery_status = 'acknowledged'|delivery_status = 'dead_lettered'|acknowledged_at|dead_lettered_at|prune" agent-runtime/src agent-runtime/test backend/src -S` — no matches.
- Trace dispatch search: `rg -n "postTrace\(" agent-runtime/src backend/src -S` — found the new durable SQLite outbox dispatcher and existing legacy direct trace calls in `agentLoop.ts` and `agentExecutionRunner.ts`; the legacy non-SQLite path remains a cutover residual and is not part of the new durable outbox dispatcher.

Behavior evidence:

- `dispatchTraceOutboxBatch` reads committed Runtime outbox rows, skips non-trace events, checks due retry state inside `RuntimeStorage.transaction`, sends trace records to Java with `attributes.committedEventId`, then persists local delivery state.
- Crash after Java record but before local acknowledgement is idempotent because redelivery carries the same committed event identity.
- Java outage persists `retry` state with incremented attempt count and `nextAttemptAt`, then resumes delivery after restart.
- Exhausted delivery persists durable `dead_letter` state and reports readiness degradation.
- Runtime event outbox states are now `pending | retry | delivered | dead_letter`; delivered and dead-letter rows are retained for observability and are not pruned by the new implementation.
- Java `TraceService` records one logical trace event per committed Runtime event identity, preserving the first record and dropping duplicate deliveries.

## Task 8 — JSON Import, Quarantine, And Gate B

Status: focused implementation verification passed for deterministic JSON import, quarantine manifest redaction, backup hash manifest, and forward-fix-only marker. Human approval was received on 2026-07-06 at 15:55 CST. Gate B remains evidence-blocked because the current bundle is fixture-level and does not contain the required production backup manifest, production import report, quarantine decision, restore output, or measured production RPO/RTO. No real production SQLite cutover write is authorized yet.

Observed on 2026-07-06:

- RED command: `pnpm --filter @openharness/agent-runtime test -- jsonImporter` — failed before implementation because `agent-runtime/src/storage/jsonImporter.ts` did not exist.
- GREEN focused command: `pnpm --filter @openharness/agent-runtime test -- jsonImporter` — 1 file passed, 2 tests passed.
- Migration/crash-matrix command: `pnpm --filter @openharness/agent-runtime test -- jsonImporter migration crashMatrix` — 2 files passed, 15 tests passed.
- TypeScript command: `pnpm --filter @openharness/agent-runtime typecheck` — passed.
- Repository test command: `pnpm test` — shared-schema 43 tests, agent-runtime 287 tests, frontend 24 tests, and integration-tests 17 tests passed.
- Repository typecheck command: `pnpm typecheck` — shared-schema, agent-runtime, and frontend typechecks passed.
- Dashboard command: `pnpm dashboard:check` — generated dashboard outputs are current.
- OpenSpec validation: `openspec validate harden-agent-runtime-single-node-production --strict --no-interactive` — change is valid, exit code 0; PostHog telemetry flush failed with `ENOTFOUND edge.openspec.dev`, matching the known network warning and not affecting local validation.
- Secret/content negative search: `rg -n "sk-test-canary|must not import|needs owner mapping|should never appear" docs/verification/agent-runtime-v1 docs/superpowers/plans/2026-07-03-agent-runtime-single-node-production-final-plan.md agent-runtime/src/storage/jsonImporter.ts -S` — no Task 8 importer or verification-artifact leaks. The only match is the existing Stage 2 plan line that names the future redaction canary fixture.
- Quarantine-shape negative search: `rg -n "quarantine.*content|content.*quarantine|raw.*quarantine|token.*quarantine|message.*quarantine|memory.*quarantine" agent-runtime/src/storage/jsonImporter.ts docs/verification/agent-runtime-v1/task8-json-import-restore-rehearsal.md docs/verification/agent-runtime-v1/stage1-gate-b.md -S` — matches are descriptive evidence text only; importer quarantine entries contain only `path`, `sha256`, and `error`.
- Whitespace check: `git diff --check` — passed.
- Restore/forward-fix rehearsal record: `docs/verification/agent-runtime-v1/task8-json-import-restore-rehearsal.md`.

Behavior evidence:

- Import writes a backup hash manifest before any SQLite import write; the manifest records source path and SHA-256 for each discovered legacy JSON source file.
- Valid legacy history requires an explicit owner mapping for records lacking `userId`; missing mappings quarantine the record instead of guessing ownership.
- Valid legacy history imports into SQLite stable messages through `SqliteHistoryStore.replace`, making reruns idempotent for the same source data.
- Valid legacy memory imports through scoped SQLite memory upserts, preserving tenant/user ownership and memory IDs across reruns.
- Malformed JSON, path/body scope mismatch, missing owner mapping, and wrong-scope secret-bearing memory inputs are quarantined without copying raw message/memory content or tokens into the quarantine manifest.
- Non-empty quarantine sets `automaticCutoverAllowed=false`.
- After the first SQLite import write, the cutover marker records `mode=forward_fix_only` and `legacyWritesAllowed=false`, blocking old-binary rollback semantics after cutover.

Residual Gate B requirements:

- Human approval was explicitly received on 2026-07-06. It becomes effective for Gate B promotion only after the required production evidence bundle is attached and verified; approval cannot substitute for absent strict migration evidence.
- The production backup manifest, import report, quarantine decision, restore output, forward-fix-only marker, and measured production backup RPO/RTO must still be attached before the first real SQLite cutover write.
- The fixture-level restore rehearsal records the approved RTO target and marker semantics; the real production backup RPO/RTO measurement remains a manual Gate B artifact.
