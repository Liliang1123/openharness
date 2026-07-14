# Agent Runtime SQLite Write Authority Correction Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Correct the production Runtime request path so the already-cut-over SQLite database is the sole durable write authority, with mandatory tenant+user scope, atomic lifecycle transitions, deterministic startup reconciliation, and deterministic close/lock release.

**Architecture:** This is a forward-fix-only supplement to the approved Stage 0 plan. Production owns one `ProductionRuntimeContext` containing the already-implemented SQLite storage, repositories, `RuntimeLifecycleCommands`, scoped read adapters, and a non-durable live event publisher; the runner sends every durable lifecycle transition through the Unit of Work and publishes returned committed events only to the live publisher. Development/test injection remains available, but production construction is fail-closed and cannot instantiate JSON or in-memory durable authorities.

**Tech Stack:** TypeScript, Fastify, Vitest, `better-sqlite3`, pnpm, POSIX shell startup wrapper, OpenSpec.

---

## Authority And Baseline

- Approved OpenSpec change: `harden-agent-runtime-single-node-production`.
- Parent plan: [2026-07-03 Agent Runtime single-node production final plan](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/docs/superpowers/plans/2026-07-03-agent-runtime-single-node-production-final-plan.md).
- Blocking review: [Gate B Runtime write-authority reconciliation](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/docs/review/2026-07-12-gate-b-runtime-write-authority-reconciliation-review.md).
- Previous blocked preflight: [Runtime SQLite write-authority plan preflight](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/docs/review/2026-07-12-runtime-sqlite-write-authority-plan-preflight-review.md).
- Evidence profile: `strict`; persistence, recovery, production lifecycle, and tenant/user isolation require real file-backed evidence.
- Worktree: [add-openclacky-runtime-parity-roadmap](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/).
- Git authority: this plan grants no permission for `git add`, `git commit`, `git push`, destructive Git, or publication.

## Hard Scope Boundary

Allowed correction scope:

- Make user scope mandatory in request-path history, execution, approval, and durable-event contracts.
- Add one production Runtime context over the existing storage/repositories/lifecycle/reconciliation primitives.
- Route runner lifecycle writes through `RuntimeLifecycleCommands` and keep transient previews outside durable storage.
- Add scoped SQLite read adapters that reuse the context database and never open independent connections.
- Wire server and entrypoint lifecycle so reconciliation completes before readiness/listen and close releases database then singleton lock.
- Add strict focused/full verification, distinct implementation Review, and a separately reviewed production startup command.

Forbidden in this plan:

- Do not repeat Anthropic archive, backup, restore rehearsal, isolated import, production first write, quarantine acceptance, or SQLite permission forward-fix.
- Do not delete, replace, truncate, recreate, or import into the live SQLite database.
- Do not restore JSON writes, add SQLite/JSON dual-write, or treat JSON as rollback authority.
- Do not start the current Runtime or listen on port 3001 before correction implementation and independent implementation Review both PASS.
- Do not update Stage 0 `tasks.md`, dashboard state/generated dashboard files, or Runtime parity artifacts.
- Do not change approved schema, contention thresholds, recovery semantics, provider gates, Gate D thresholds, or public contracts beyond restoring the already-approved required scope.

## File Responsibility Map

### Contract and development/test stores

- Modify `agent-runtime/src/history.ts`: require `(tenantId,userId,conversationId)` for every conversation read/write/list/delete operation.
- Modify `agent-runtime/src/runtimeEventStore.ts`: separate scoped durable-event reads from post-commit live publication; require user scope everywhere.
- Modify `agent-runtime/src/executionStateStore.ts`: require user ownership for state and active-execution lookup/transition/abort.
- Modify `agent-runtime/src/approvalStore.ts`: require user ownership for pending lookup/list/decision and make raw approval tokens process-only.
- Modify `agent-runtime/src/historyFactory.ts`, `agent-runtime/src/jsonFileHistoryStore.ts`, `agent-runtime/src/memoryStore.ts`: retain explicit development/test compatibility only; production construction must never reach these factories.

### Production context and adapters

- Create `agent-runtime/src/storage/productionRuntimeContext.ts`: own storage open, repository bundle, lifecycle commands, startup reconciliation, scoped adapters, live publisher, and idempotent close.
- Create `agent-runtime/src/storage/sqliteRuntimeAdapters.ts`: expose scoped reads and standalone scoped memory operations using the context's one `RuntimeDatabase`; do not own lifecycle transactions or open connections.
- Modify `agent-runtime/src/storage/lifecycleCommands.ts`: expose all required terminal/abort/approval boundaries and publish-ready committed events without appending them to a second durable store.
- Modify `agent-runtime/src/storage/reconcile.ts`: keep reconciliation synchronous and fail-closed before readiness.

### Runner, server, and entrypoint

- Modify `agent-runtime/src/agentExecutionRunner.ts`: inject lifecycle commands and live publisher; remove production-path direct durable mutations.
- Modify `agent-runtime/src/agentStreamLoop.ts`: treat preview events as transient and committed events as already durable.
- Modify `agent-runtime/src/server.ts`: accept one runtime context, use its scoped readers/commands, register deterministic close, and reject production fallback construction.
- Modify `agent-runtime/src/index.ts`: validate production profile and absolute SQLite path before creating/listening; never call plain default `createServer()` in production.
- Create `agent-runtime/scripts/start-production-runtime.sh`: set `umask 077` and require the reviewed production environment; create only after implementation Review PASS.

### Tests

- Modify `agent-runtime/test/history.test.ts`, `runtimeEventStore.test.ts`, `executionStateStore.test.ts`, `approvalStore.test.ts`: required-scope contract RED/GREEN.
- Create `agent-runtime/test/productionRuntimeContext.test.ts`: open/reconcile/close ordering, second-instance fencing, and no fallback construction.
- Modify `agent-runtime/test/lifecycleUnitOfWork.test.ts`, `crashMatrix.test.ts`, `agentExecutionRunner.test.ts`, `approvalRecovery.test.ts`, `restartReconciliation.test.ts`: runner-to-UoW wiring and crash boundaries.
- Modify `agent-runtime/test/sessionsApi.test.ts`, `sessionEventsApi.test.ts`, `memoryApi.test.ts`, `approvalApi.test.ts`, `activeExecutionLock.test.ts`: scoped read/API IDOR coverage.
- Create `agent-runtime/test/productionServerLifecycle.test.ts`: production path, reconciliation-before-ready/listen, close/lock release, and JSON-constructor tripwires.
- Create `agent-runtime/test/productionEntrypoint.test.ts`: configuration refusal and startup lifecycle without binding a real port.

## Execution Gates

1. Tasks 1–5 are implementation slices and MUST use RED → GREEN. Any unexplained failure invokes `superpowers:systematic-debugging` before a fix.
2. Each slice records the Step Evidence Gate: goal, code facts, positive checks, negative searches, root cause, allowed/actual files, commands/results, self-review, residual risk, and next permission.
3. Task 6 is a distinct implementation Review. Any Critical/Important finding returns to the owning slice and restarts verify → Review.
4. Task 7 may create the production startup wrapper only after Task 6 PASS. It may not start the Runtime.
5. Task 8 controlled live startup/read/write evidence requires separate explicit production authorization. This plan and its Preflight PASS do not grant that authorization.

## Task 1: Make Tenant And User Scope Required

**Gate:** strict contract slice.

**Files:** contract/dev-store files and focused tests listed above.

**Acceptance:** no request-path history/event/execution/approval operation can omit `userId`; same-tenant cross-user collisions are isolated; no compatibility overload/default reintroduces unscoped access.

- [ ] **Step 1: Write RED type and behavior tests**

Add `@ts-expect-error` contract cases for every omitted `userId`, plus runtime cases using the same `conversationId`/`executionId` under `user-a` and `user-b`. The target public shapes are:

```ts
export interface HistoryStore {
  append(tenantId: string, userId: string, conversationId: string, message: AgentMessage): void;
  get(tenantId: string, userId: string, conversationId: string): AgentMessage[];
  replace(tenantId: string, userId: string, conversationId: string, messages: AgentMessage[]): void;
  save(tenantId: string, userId: string, conversationId: string): Promise<void>;
  load(tenantId: string, userId: string, conversationId: string): Promise<void>;
  list(tenantId: string, userId: string): Promise<SessionMeta[]>;
  delete(tenantId: string, userId: string, conversationId: string): Promise<void>;
}

export interface RuntimeEventReader {
  since(tenantId: string, userId: string, conversationId: string, afterEventId: EventId | null): SessionEvent[];
  latestEventId(tenantId: string, userId: string, conversationId: string): EventId | null;
  hasEvent(tenantId: string, userId: string, conversationId: string, eventId: EventId): boolean;
}

export interface RuntimeEventPublisher {
  publish(event: SessionEvent): void;
  subscribe(tenantId: string, userId: string, conversationId: string, listener: SessionEventListener): () => void;
}

export interface ExecutionStateStore {
  create(input: { executionId: ExecutionId; tenantId: string; userId: string; conversationId: string }): ExecutionState;
  get(tenantId: string, userId: string, conversationId: string, executionId: ExecutionId): ExecutionState | null;
  getActive(tenantId: string, userId: string, conversationId: string): ExecutionState | null;
  transition(tenantId: string, userId: string, conversationId: string, executionId: ExecutionId, status: ExecutionStatus, endReason?: string): ExecutionState | null;
  abort(tenantId: string, userId: string, conversationId: string, executionId: ExecutionId): boolean;
}
```

Approval reads and decisions MUST similarly accept complete tenant/user/conversation ownership plus the approval/execution identifier; `PendingApproval.userId` becomes required.

- [ ] **Step 2: Run RED**

```bash
pnpm --filter @openharness/agent-runtime test -- history runtimeEventStore executionStateStore approvalStore
pnpm --filter @openharness/agent-runtime typecheck
```

Expected: FAIL on missing required arguments and cross-user collisions in current keys/filters.

- [ ] **Step 3: Implement the minimal required-scope contracts and dev/test stores**

Use `(tenantId,userId,conversationId)` in keys and filtering. Update every caller explicitly; do not add optional parameters, global captured users, `user-001` defaults, overloads, or filtering after an unscoped durable read.

- [ ] **Step 4: Run GREEN and negative searches**

```bash
pnpm --filter @openharness/agent-runtime test -- history runtimeEventStore executionStateStore approvalStore sessionsApi sessionEventsApi approvalApi activeExecutionLock
pnpm --filter @openharness/agent-runtime typecheck
rg -n 'userId\?:|userScope === undefined|userId === undefined|default-user|user-001' agent-runtime/src/history.ts agent-runtime/src/runtimeEventStore.ts agent-runtime/src/executionStateStore.ts agent-runtime/src/approvalStore.ts agent-runtime/src/server.ts
```

Expected: tests/typecheck PASS; negative search returns no request-path optional/default user scope. Any justified non-request-path match is documented line-by-line in evidence.

## Task 2: Create One Production Runtime Context

**Gate:** strict production-lifecycle slice.

**Files:** `productionRuntimeContext.ts`, `runtimeStorage.ts`, `reconcile.ts`, `sqliteRuntimeAdapters.ts`, and `productionRuntimeContext.test.ts`.

**Acceptance:** one owner acquires the lock, opens/migrates SQLite, builds repositories, performs integrity/reconciliation, exposes dependencies, and closes exactly once; any open/reconcile failure releases resources; a second context cannot open the database.

- [ ] **Step 1: Write RED context lifecycle tests**

Use a real temporary file-backed SQLite database. Spy only on injected factories/order; do not mock the database behavior. Assert the sequence:

```text
acquire lock -> open/migrate -> integrity check -> reconcile -> expose ready context
close -> database close -> singleton lock release
```

Assert reconciliation failure closes the database/releases the lock, a second context fails before write readiness, and closing twice is safe.

- [ ] **Step 2: Run RED**

```bash
pnpm --filter @openharness/agent-runtime test -- productionRuntimeContext restartReconciliation runtimeStorage singletonLock
```

Expected: FAIL because `openProductionRuntimeContext` does not exist.

- [ ] **Step 3: Implement the production context**

Implement this owned boundary:

```ts
export interface ProductionRuntimeContext {
  readonly databasePath: string;
  readonly database: RuntimeDatabase;
  readonly repositories: SqliteRuntimeRepositories;
  readonly lifecycle: RuntimeLifecycleCommands;
  readonly history: HistoryStore;
  readonly memory: MemoryStore;
  readonly executions: ExecutionStateStore;
  readonly approvals: ApprovalStore;
  readonly events: RuntimeEventReader;
  readonly liveEvents: RuntimeEventPublisher;
  readonly reconciliation: ReconcileRuntimeStartupResult;
  close(): void;
}

export function openProductionRuntimeContext(databasePath: string): ProductionRuntimeContext;
```

The function MUST require an absolute path, reuse the single `RuntimeDatabase` for all adapters, run `PRAGMA integrity_check` and `reconcileRuntimeStartup` before returning, and close/release on every thrown path. Adapters may begin standalone transactions for memory/API mutations; lifecycle mutations remain exclusively owned by `RuntimeLifecycleCommands`.

- [ ] **Step 4: Run GREEN and connection-ownership search**

```bash
pnpm --filter @openharness/agent-runtime test -- productionRuntimeContext restartReconciliation runtimeStorage singletonLock
pnpm --filter @openharness/agent-runtime typecheck
rg -n 'openRuntimeDatabase|openProductionRuntimeStorage|new Database' agent-runtime/src/storage
```

Expected: context/storage are the only production open sites; adapters contain no connection open.

## Task 3: Route Runner Durable Transitions Through Lifecycle Unit Of Work

**Gate:** strict atomicity slice.

**Files:** `agentExecutionRunner.ts`, `agentStreamLoop.ts`, `lifecycleCommands.ts`, focused runner/UoW/crash tests.

**Acceptance:** execution start, tool-plan provisional persistence, approval wait/decision, tool-result closure, terminal success/error/abort, and restart interruption each commit through one lifecycle command; returned events publish only after commit; transient preview never enters history/events.

- [ ] **Step 1: Extend RED crash/wiring tests**

For each approved boundary inject `before_commit` and `after_commit`. Add runner-level spies proving production runner calls lifecycle commands rather than `HistoryStore.append`, `ExecutionStateStore.transition`, `ApprovalStore.createPending/decide`, or durable `RuntimeEventStore.append` directly.

Add a tripwire publisher whose `publish` throws after commit; assert durable rows remain committed and scoped replay returns them. Add a preview case asserting no SQLite message/event row is created.

- [ ] **Step 2: Run RED**

```bash
pnpm --filter @openharness/agent-runtime test -- lifecycleUnitOfWork crashMatrix agentExecutionRunner approvalRecovery detachedStream nonStreamRunner
```

Expected: FAIL because current runner still performs separate direct mutations.

- [ ] **Step 3: Complete lifecycle command coverage**

Add only missing approved boundaries, including terminal error/abort without a final assistant message. Keep commands shaped as complete business transitions and returning `LifecycleCommit`:

```ts
export interface LifecycleCommit {
  events: SessionEvent[];
}

export interface RuntimeLifecycleWriter {
  startExecution(input: StartExecutionInput): LifecycleCommit;
  recordToolPlan(input: RecordToolPlanInput): LifecycleCommit;
  enterApproval(input: EnterApprovalInput): LifecycleCommit;
  decideApproval(input: DecideApprovalInput): LifecycleCommit;
  completeTool(input: CompleteToolInput): LifecycleCommit;
  completeExecution(input: CompleteExecutionInput): LifecycleCommit;
  failExecution(input: FailExecutionInput): LifecycleCommit;
  abortExecution(input: AbortExecutionInput): LifecycleCommit;
  interruptExecution(input: InterruptExecutionInput): LifecycleCommit;
}
```

Replace `publishCommittedLifecycleEvents(store.append)` with publication to `RuntimeEventPublisher.publish(event)`. The publisher MUST preserve the committed `eventId`; it MUST NOT allocate a cursor or write SQLite.

- [ ] **Step 4: Refactor the production runner path**

Pass `RuntimeLifecycleWriter`, scoped readers, and `RuntimeEventPublisher` to the runner. Every lifecycle input carries `tenantId`, `userId`, `conversationId`, `executionId`, `traceId`, and `requestId`. Keep raw Java approval tokens only in the existing process-local waiter/token mechanism; durable commands receive non-sensitive approval metadata only.

- [ ] **Step 5: Run GREEN and direct-write searches**

```bash
pnpm --filter @openharness/agent-runtime test -- lifecycleUnitOfWork crashMatrix agentExecutionRunner approvalRecovery detachedStream activeExecutionLock nonStreamRunner
pnpm --filter @openharness/agent-runtime typecheck
rg -n 'history\.append|executionStateStore\.(create|transition)|approvalStore\.(createPending|decide)|runtimeEventStore\.append' agent-runtime/src/agentExecutionRunner.ts agent-runtime/src/agentStreamLoop.ts
rg -n 'preview_delta' agent-runtime/src/storage agent-runtime/src/history.ts
```

Expected: focused tests/typecheck PASS; no production runner direct durable write; no preview durability path.

## Task 4: Install Scoped SQLite Reads In Server APIs

**Gate:** strict IDOR/read-boundary slice.

**Files:** `sqliteRuntimeAdapters.ts`, `server.ts`, sessions/events/memory/approval/execution API tests.

**Acceptance:** server reads history, execution, approval, memory, and durable events with the same authenticated `(tenantId,userId,conversationId)` scope before identifier lookup; no read loads a broader tenant bucket and filters in memory.

- [ ] **Step 1: Write RED scoped API tests**

Seed identical conversation/execution/approval/event identifiers for two users in one tenant and another tenant. For sessions, SSE cursor, approvals, abort, active conflict, and memory APIs assert the wrong owner receives no data or existence signal. Add an adapter spy that fails if a server call omits user scope.

- [ ] **Step 2: Run RED**

```bash
pnpm --filter @openharness/agent-runtime test -- sessionsApi sessionEventsApi memoryApi approvalApi abortApi activeExecutionLock
```

Expected: FAIL at current tenant-wide reads and post-read filters.

- [ ] **Step 3: Implement scoped adapters and server reads**

Each adapter method executes against the context's database and pushes all ownership predicates into SQL/repository calls. The events adapter combines durable scoped replay from SQLite with scoped live subscription from `RuntimeEventPublisher`; it never re-appends replayed rows. Approval decisions and aborts call lifecycle commands, not repository/store mutations.

- [ ] **Step 4: Run GREEN and unscoped-read searches**

```bash
pnpm --filter @openharness/agent-runtime test -- sessionsApi sessionEventsApi memoryApi approvalApi abortApi activeExecutionLock sqliteHistory sqliteMemory sqliteExecution sqliteApproval sqliteRuntimeEvent
pnpm --filter @openharness/agent-runtime typecheck
rg -n 'since\(tenantId, conversationId|listPending\(tenantId, conversationId|getActive\(tenantId, conversationId|\.filter\(.*userId' agent-runtime/src/server.ts agent-runtime/src/storage/sqliteRuntimeAdapters.ts
```

Expected: tests/typecheck PASS; negative search has no tenant-wide durable read followed by user filtering.

## Task 5: Make Server And Entrypoint Lifecycle Fail Closed

**Gate:** strict startup/shutdown slice.

**Files:** `server.ts`, `index.ts`, `productionRuntimeContext.ts`, `productionServerLifecycle.test.ts`, `productionEntrypoint.test.ts`.

**Acceptance:** production requires an absolute database path; opens/reconciles before listen/readiness; never constructs JSON/in-memory durable stores; second instance never listens; failed listen closes context; normal/error/signal shutdown closes database and releases the lock.

- [ ] **Step 1: Write RED production-construction tests**

Tripwire `createHistoryStore`, `JsonFileMemoryStore`, `JsonFileApprovalStore`, `InMemoryExecutionStateStore`, and durable in-memory event construction. Assert none is reached through production construction. Assert missing/relative database path fails before server construction, reconciliation failure prevents `listen`, and a second instance remains unready and closes.

- [ ] **Step 2: Run RED**

```bash
pnpm --filter @openharness/agent-runtime test -- productionServerLifecycle productionEntrypoint serviceAuth restartReconciliation
```

Expected: FAIL because `index.ts` calls default `createServer()` and server owns fallback stores.

- [ ] **Step 3: Add explicit server modes**

Keep `createServer({ ...injectedStores })` for tests/development. Add a fail-closed production factory:

```ts
export interface CreateProductionServerOptions {
  databasePath: string;
  javaClient?: JavaClient;
  serviceToken: string;
}

export async function createProductionServer(options: CreateProductionServerOptions) {
  const context = openProductionRuntimeContext(options.databasePath);
  try {
    const app = await createServer({ runtimeContext: context, requireServiceAuth: true, ...options });
    app.addHook("onClose", async () => context.close());
    return app;
  } catch (error) {
    context.close();
    throw error;
  }
}
```

Production mode MUST reject individually injected legacy stores and MUST not call fallback constructors. Readiness returns success only after the context has returned from integrity/reconciliation.

- [ ] **Step 4: Wire entrypoint without starting it**

Extract a testable `main()` that validates `AGENT_RUNTIME_PROFILE=production`, an absolute `AGENT_RUNTIME_SQLITE_PATH`, service auth secret, host, and port; then creates the production server and listens. Register shutdown handlers that close once. Importing `index.ts` in tests MUST not listen; use an explicit direct-execution guard.

- [ ] **Step 5: Run GREEN and fallback searches**

```bash
pnpm --filter @openharness/agent-runtime test -- productionServerLifecycle productionEntrypoint serviceAuth restartReconciliation
pnpm --filter @openharness/agent-runtime typecheck
rg -n 'createServer\(\)|createHistoryStore\(|new JsonFileMemoryStore|new JsonFileApprovalStore|new InMemoryExecutionStateStore|new InMemoryRuntimeEventStore' agent-runtime/src/index.ts agent-runtime/src/server.ts
```

Expected: tests/typecheck PASS; matches are absent from production branches and any development fallback match is explicitly guarded and reviewed.

## Task 6: Strict Verification And Distinct Implementation Review

**Gate:** implementation Review; PASS required before startup wrapper or Runtime start.

- [ ] **Step 1: Run focused correction verification**

```bash
pnpm --filter @openharness/agent-runtime test -- history runtimeEventStore executionStateStore approvalStore productionRuntimeContext lifecycleUnitOfWork crashMatrix agentExecutionRunner approvalRecovery restartReconciliation sessionsApi sessionEventsApi memoryApi approvalApi abortApi activeExecutionLock productionServerLifecycle productionEntrypoint
pnpm --filter @openharness/agent-runtime typecheck
```

Expected: all selected files/tests PASS; typecheck exits 0.

- [ ] **Step 2: Run the full Runtime suite**

```bash
pnpm --filter @openharness/agent-runtime test
pnpm --filter @openharness/agent-runtime typecheck
```

Expected: complete Runtime suite PASS with zero skipped correction-critical test; typecheck exits 0.

- [ ] **Step 3: Run strict negative and scope searches**

```bash
rg -n 'HISTORY_STORE|HISTORY_DATA_DIR|JsonFileHistoryStore|JsonFileMemoryStore|JsonFileApprovalStore' agent-runtime/src
rg -n 'userId\?:|default-user|user-001|userScope === undefined|userId === undefined' agent-runtime/src
rg -n 'history\.append|runtimeEventStore\.append|executionStateStore\.(create|transition)|approvalStore\.(createPending|decide)' agent-runtime/src/agentExecutionRunner.ts agent-runtime/src/agentStreamLoop.ts
rg -n 'openRuntimeDatabase|openProductionRuntimeStorage|new Database' agent-runtime/src
rg -n 'approvalToken|preview_delta' agent-runtime/src/storage agent-runtime/src/server.ts
```

Expected: no production fallback, optional request scope, direct lifecycle write, second connection, raw approval-token durability, or preview durability. Every benign development/test/internal match is classified in the Review.

- [ ] **Step 4: Validate contract and repository hygiene**

```bash
npx openspec validate harden-agent-runtime-single-node-production --strict --no-interactive
git diff --check
git status --short
```

Expected: OpenSpec validation PASS, diff check PASS; status is audited without staging or committing. Confirm Stage 0 tasks/dashboard and production evidence are unchanged by implementation.

- [ ] **Step 5: Perform a distinct High Review**

Review actual source/test files and complete diff. Trace authenticated identity → scoped server API → shared database adapter/repository; runner transition → `RuntimeLifecycleCommands` → commit → live publish; entrypoint → lock/open/migrate/integrity/reconcile → ready/listen → close/release. Rerun the critical focused command and add one adversarial same-tenant cross-user probe plus one post-commit publisher-failure probe.

Result must be `PASS` or `FAIL/BLOCKED`. Any finding returns to Tasks 1–5 and requires fresh verification and a new Review artifact.

## Task 7: Create And Review The Production Startup Command

**Gate:** Task 6 Review PASS; creating the wrapper does not authorize execution.

**Files:** create [start-production-runtime.sh](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/agent-runtime/scripts/start-production-runtime.sh) and [productionStartupScript.test.ts](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/agent-runtime/test/productionStartupScript.test.ts).

- [ ] **Step 1: Write and run the static RED contract test**

```ts
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const scriptPath = fileURLToPath(new URL("../scripts/start-production-runtime.sh", import.meta.url));

describe("production Runtime startup wrapper", () => {
  it("establishes the fail-closed production boundary before launching the reviewed entrypoint", () => {
    expect(existsSync(scriptPath)).toBe(true);
    const script = readFileSync(scriptPath, "utf8");

    expect(script).toContain("set -eu");
    expect(script).toContain("umask 077");
    expect(script).toContain("AGENT_RUNTIME_SQLITE_PATH is required");
    expect(script).toContain("OPENHARNESS_SERVICE_TOKEN is required");
    expect(script).toContain("export AGENT_RUNTIME_PROFILE=production");
    expect(script).toContain("exec pnpm --filter @openharness/agent-runtime exec node --import tsx src/index.ts");
    expect(script.indexOf("umask 077")).toBeLessThan(script.indexOf("exec pnpm"));
  });
});
```

```bash
pnpm --filter @openharness/agent-runtime test -- productionStartupScript
```

Expected: FAIL because the reviewed wrapper does not exist yet.

- [ ] **Step 2: Create the fail-closed wrapper**

```sh
#!/bin/sh
set -eu
umask 077
: "${AGENT_RUNTIME_SQLITE_PATH:?AGENT_RUNTIME_SQLITE_PATH is required}"
: "${OPENHARNESS_SERVICE_TOKEN:?OPENHARNESS_SERVICE_TOKEN is required}"
export AGENT_RUNTIME_PROFILE=production
exec pnpm --filter @openharness/agent-runtime exec node --import tsx src/index.ts
```

Make the wrapper executable. Do not embed credentials, database contents, or a mutable default path. The reviewed operator command supplies the already-approved absolute live path externally. Do not use `pnpm --filter @openharness/agent-runtime start`: that package has no `start` script and pnpm returns success without launching a process when the selected package lacks that script. Do not invoke the `tsx` CLI directly: it creates an IPC pipe before loading the entrypoint and can fail under the production sandbox. `node --import tsx` uses the installed loader without that CLI IPC boundary.

- [ ] **Step 3: Run GREEN and verify without starting Runtime**

```bash
pnpm --filter @openharness/agent-runtime test -- productionStartupScript productionEntrypoint productionServerLifecycle serviceAuth
sh -n agent-runtime/scripts/start-production-runtime.sh
test -x agent-runtime/scripts/start-production-runtime.sh
rg -n 'umask 077|AGENT_RUNTIME_PROFILE=production|AGENT_RUNTIME_SQLITE_PATH|OPENHARNESS_SERVICE_TOKEN|exec node --import tsx src/index.ts' agent-runtime/scripts/start-production-runtime.sh
```

Expected: focused tests and syntax PASS, executable bit present, and all five fail-closed/entrypoint anchors present. Do not execute the wrapper.

- [ ] **Step 4: Review the wrapper and refreshed diff**

Confirm no secret/default live path, `umask 077` precedes Node/pnpm, the command cannot silently succeed without launching the reviewed `src/index.ts` entrypoint, and no alternate production entrypoint bypasses it. Any finding returns to correction and refreshes verification/Review.

## Task 8: Controlled Production Probe — Separate Authorization Required

**Gate:** Task 6 implementation Review PASS, Task 7 wrapper Review PASS, and explicit user authorization for the exact command/time/evidence path. Until then this task is `BLOCKED` by design.

- [x] **Step 1: Pre-probe immutable checks**

Confirm Runtime stopped/port 3001 unbound, live DB path unchanged, main/WAL/SHM owner modes, `PRAGMA integrity_check`, counts, production cutover state `forward_fix_only`, evidence output no-overwrite path, and process environment secret redaction. Do not rerun import/cutover.

- [x] **Step 2: Run one controlled startup/readiness/scoped read-write probe**

Use the reviewed wrapper under `umask 077`. Prove readiness follows reconciliation, a second instance is refused, one authorized tenant/user write is present only in SQLite, a cross-user read returns no data/existence signal, and graceful close releases the lock. Do not expose raw rows/message content in evidence.

- [x] **Step 3: Stop and reconcile evidence**

Stop Runtime immediately after the bounded probe. Verify port unbound, lock released, SQLite integrity `ok`, expected count delta only, main/WAL/SHM remain `0600`, no JSON file mtime/hash changed, and no raw secret/content appears in logs/evidence.

- [x] **Step 4: Gate B reconciliation**

Only after controlled probe evidence and independent production Review PASS may a later authorized closeout reconcile Stage 0 tasks 2.6/2.7 and dashboard. This plan does not perform that closeout.

## Stop And Forward-Fix Rules

- Any scope leak, dual-write, SQLite integrity error, second-instance readiness, pre-readiness traffic, missing reconciliation, lock leak, raw secret/content leak, or unexplained JSON mutation is immediate `FAIL`; stop Runtime if running and retain evidence.
- After the existing first production SQLite write, rollback means stop and forward-fix code. Never delete/recreate SQLite or restore JSON write authority.
- A failed production probe does not authorize import/restore/cutover reruns or task/dashboard promotion.
- Missing production authorization, unavailable live evidence, or a changed plan revision is `BLOCKED`, not permission to improvise.

## Plan Self-Review

- Spec coverage: required user scope maps to Task 1; production context to Task 2; Lifecycle Unit of Work to Task 3; scoped reads to Task 4; server/entrypoint lifecycle to Task 5; strict verification/Review to Task 6; reviewed `umask 077` startup to Task 7; separately authorized controlled evidence to Task 8.
- Mechanism check: durable commit and live publication are separate; the live publisher preserves committed IDs and never writes SQLite.
- Production ownership check: exactly one context owns exactly one storage/database/lock lifecycle; adapters reuse it and cannot open connections.
- Placeholder scan: no unresolved placeholder or unspecified test step remains. Task 8 is an explicit authorization gate, not a placeholder.
- Type consistency: all request-path ownership uses `(tenantId,userId,conversationId)`; lifecycle inputs also carry execution/trace/request identity; production path has no optional user.
- Scope check: no repeated migration/cutover work, no live DB deletion, no JSON rollback/dual-write, no Stage 0 tasks/dashboard update, no parity work, and no unauthorized Git step.
