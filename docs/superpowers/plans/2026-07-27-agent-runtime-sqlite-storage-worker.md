# Agent Runtime SQLite Storage Worker Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. This repository run is serial and must not dispatch subagents.

**Goal:** Move every production SQLite operation off the Node main thread into one typed, bounded, fail-closed Worker Thread without changing the database schema, public API/SSE contracts, lifecycle atomicity, trace-outbox semantics, or fixed Gate D thresholds.

**Architecture:** The main thread retains the singleton lock, Fastify/SSE, Agent Loop, Java/MCP I/O, and transient publisher. `RuntimeStorageWorkerClient` schedules typed semantic commands through bounded P0/P1/P2 queues and sends one command at a time to a Worker Thread that exclusively owns `better-sqlite3`, repositories, lifecycle commands, migration, integrity, reconciliation, checkpoint, and close. Existing synchronous repository implementations remain the worker kernel; production-facing adapters become genuinely asynchronous and publish durable events only after worker commit acknowledgement.

**Tech Stack:** Node.js 20 Worker Threads, TypeScript ESM/tsx, better-sqlite3, Fastify, Vitest, existing OpenSpec/SQLite repositories.

**Evidence profile:** strict.

**Git authority:** No `git add`, commit, push, reset, clean, PR, or publication step is authorized by this plan.

---

## File map

- Create [runtimeStorageWorkerProtocol.ts](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/agent-runtime/src/storage/runtimeStorageWorkerProtocol.ts): closed semantic command/response union and runtime validation.
- Create [runtimeStorageCommandScheduler.ts](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/agent-runtime/src/storage/runtimeStorageCommandScheduler.ts): 2,048-bound P0/P1/P2 scheduler with 32:1 foreground/background fairness.
- Create [runtimeStorageWorkerKernel.ts](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/agent-runtime/src/storage/runtimeStorageWorkerKernel.ts): synchronous worker-owned command dispatcher over existing repositories and lifecycle Unit of Work.
- Create [runtimeStorageWorker.ts](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/agent-runtime/src/storage/runtimeStorageWorker.ts): Worker Thread entrypoint and protocol fail-closed boundary.
- Create [runtimeStorageWorkerClient.ts](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/agent-runtime/src/storage/runtimeStorageWorkerClient.ts): singleton-lock owner, worker lifecycle, queue, request correlation, readiness, and async semantic adapters.
- Create focused tests with matching names under [agent-runtime/test](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/agent-runtime/test).
- Modify [lifecycleCommands.ts](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/agent-runtime/src/storage/lifecycleCommands.ts), [history.ts](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/agent-runtime/src/history.ts), [runtimeEventStore.ts](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/agent-runtime/src/runtimeEventStore.ts), and [sqliteRuntimeAdapters.ts](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/agent-runtime/src/storage/sqliteRuntimeAdapters.ts) only where async production ports require an `Awaitable<T>` contract.
- Modify [productionRuntimeContext.ts](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/agent-runtime/src/storage/productionRuntimeContext.ts), [server.ts](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/agent-runtime/src/server.ts), [agentExecutionRunner.ts](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/agent-runtime/src/agentExecutionRunner.ts), and [agentStreamLoop.ts](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/agent-runtime/src/agentStreamLoop.ts) to await durable commands.
- Modify [traceOutbox.ts](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/agent-runtime/src/storage/traceOutbox.ts), [traceOutboxDispatcher.ts](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/agent-runtime/src/storage/traceOutboxDispatcher.ts), and [runtimeStorageMonitor.ts](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/agent-runtime/src/storage/runtimeStorageMonitor.ts) to use worker semantic ports.

## Task 1: Freeze the typed protocol and bounded scheduler

**Files:**

- Create: [runtimeStorageWorkerProtocol.ts](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/agent-runtime/src/storage/runtimeStorageWorkerProtocol.ts)
- Create: [runtimeStorageCommandScheduler.ts](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/agent-runtime/src/storage/runtimeStorageCommandScheduler.ts)
- Create: [runtimeStorageWorkerProtocol.test.ts](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/agent-runtime/test/runtimeStorageWorkerProtocol.test.ts)
- Create: [runtimeStorageCommandScheduler.test.ts](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/agent-runtime/test/runtimeStorageCommandScheduler.test.ts)

- [x] **Step 1: Write protocol RED tests**

Cover a valid `bootstrap`, one lifecycle command, one scoped query, one outbox transition command, checkpoint, critical drain, and close. Reject unknown operations, missing `requestId`, functions, raw SQL fields, non-finite numbers, and invalid priority.

```ts
expect(parseStorageWorkerRequest({
  requestId: "r-1",
  priority: "p1",
  operation: "lifecycle.startExecution",
  payload: validStart
})).toMatchObject({ requestId: "r-1", operation: "lifecycle.startExecution" });

expect(() => parseStorageWorkerRequest({
  requestId: "r-2",
  priority: "p1",
  operation: "sql",
  payload: { sql: "SELECT 1" }
})).toThrow("invalid_storage_worker_request");
```

- [x] **Step 2: Run protocol RED**

Run:

```bash
pnpm --filter @openharness/agent-runtime test -- runtimeStorageWorkerProtocol
```

Expected: FAIL because the protocol parser/module does not exist.

- [x] **Step 3: Implement a closed semantic union**

Define `StoragePriority = "p0" | "p1" | "p2"`, `StorageWorkerRequest`, `StorageWorkerResponse`, `StorageWorkerFailure`, and explicit payload/result maps. Validation must recursively accept only structured-clone-safe primitives, arrays, and plain objects, then validate each operation's required fields. The union must include:

```ts
type StorageOperation =
  | "bootstrap"
  | `lifecycle.${LifecycleOperation}`
  | `history.${"get" | "append" | "replace" | "list" | "delete"}`
  | `memory.${"upsert" | "list" | "search" | "delete"}`
  | `execution.${"get" | "getActive" | "listNonTerminal"}`
  | `approval.${"get" | "listPending"}`
  | `event.${"since" | "forExecution" | "latestEventId" | "hasEvent"}`
  | "outbox.claim"
  | "outbox.applyOutcomes"
  | "outbox.hasDeadLetters"
  | "storage.checkpoint"
  | "storage.criticalDrain"
  | "storage.close";
```

Do not add a generic `query`, `execute`, or `sql` operation.

- [x] **Step 4: Write scheduler RED tests**

Verify:

1. P0 becomes exclusive and rejects normal enqueue until it completes.
2. P1 is chosen before waiting P2 for the first 32 consecutive P1 selections.
3. The 33rd eligible selection is P2.
4. FIFO is preserved within each lane.
5. Pending command 2,049 throws `RUNTIME_STORAGE_QUEUE_FULL`.
6. Closing rejects queued work and refuses new work.

```ts
for (let index = 0; index < 33; index += 1) {
  scheduler.enqueue("p1", command(`p1-${index}`));
}
scheduler.enqueue("p2", command("p2-1"));
expect(takeIds(scheduler, 33).at(-1)).toBe("p2-1");
```

- [x] **Step 5: Run scheduler RED**

```bash
pnpm --filter @openharness/agent-runtime test -- runtimeStorageCommandScheduler
```

Expected: FAIL because the scheduler is missing.

- [x] **Step 6: Implement the scheduler and reach GREEN**

Use three private FIFO arrays, `pendingCount`, `consecutiveP1`, `exclusive`, and `closed`. The scheduler returns one item only when the client has no in-flight worker request. Never drop or coalesce commands.

```bash
pnpm --filter @openharness/agent-runtime test -- runtimeStorageWorkerProtocol runtimeStorageCommandScheduler
pnpm --filter @openharness/agent-runtime typecheck
```

Expected: focused tests and typecheck PASS.

## Task 2: Build and verify the worker-owned synchronous kernel

**Files:**

- Create: [runtimeStorageWorkerKernel.ts](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/agent-runtime/src/storage/runtimeStorageWorkerKernel.ts)
- Create: [runtimeStorageWorker.ts](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/agent-runtime/src/storage/runtimeStorageWorker.ts)
- Create: [runtimeStorageWorkerKernel.test.ts](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/agent-runtime/test/runtimeStorageWorkerKernel.test.ts)
- Modify: [reconcile.ts](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/agent-runtime/src/storage/reconcile.ts)
- Modify: [traceOutbox.ts](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/agent-runtime/src/storage/traceOutbox.ts)

- [x] **Step 1: Write kernel bootstrap/lifecycle RED tests**

Use a real temporary SQLite file. Assert bootstrap performs migration, identity verification, integrity, reconciliation, and returns the reconciliation counts. Execute start/final lifecycle commands and assert the existing message/execution/event order.

```ts
const kernel = createRuntimeStorageWorkerKernel();
expect(kernel.execute(request("bootstrap", "p0", {}))).toMatchObject({
  schemaVersion: 2,
  integrity: "ok"
});
```

- [x] **Step 2: Write semantic store/outbox RED tests**

Test every operation family against current repository behavior. `outbox.claim` must return event plus `deliveryAttempts` and `nextAttemptAt`; main-thread Java delivery will use that immutable candidate. `outbox.applyOutcomes` must retain the existing whole-batch transaction and return delivered/retry/dead-letter counts.

```ts
const candidates = kernel.execute(request("outbox.claim", "p2", {
  now: Number.MAX_SAFE_INTEGER,
  limit: 100
}));
expect(candidates).toHaveLength(100);
expect(candidates[0]).toMatchObject({ deliveryAttempts: 0, event: { kind: "trace" } });
```

- [x] **Step 3: Run kernel RED**

```bash
pnpm --filter @openharness/agent-runtime test -- runtimeStorageWorkerKernel
```

Expected: FAIL because the kernel is missing.

- [x] **Step 4: Implement bootstrap and semantic dispatch**

The kernel starts without an open database. Only `bootstrap` may open/create the database; when an expected dev/inode identity is supplied it must verify that identity before migration, otherwise it records the identity of the newly opened file in the bootstrap result. The kernel may use existing `RuntimeDatabase`, repositories, `RuntimeLifecycleCommands`, and `reconcileRuntimeStartup` only inside the worker module. It must hold exactly one open database and fail an operation before bootstrap or after `storage.close`.

`storage.criticalDrain` must list non-terminal executions and invoke the existing `interruptExecution` Unit of Work once per execution, returning counts and committed events. `storage.checkpoint` must return `{busy, log, checkpointed}` from `PRAGMA wal_checkpoint(TRUNCATE)`.

- [x] **Step 5: Implement the Worker entrypoint**

Require `parentPort`, parse every request, execute serially, and post exactly one success/failure response. Error responses expose only stable error codes and classes; no SQL, bearer token, path payload, or stack is returned.

```ts
parentPort.on("message", raw => {
  const request = parseStorageWorkerRequest(raw);
  try {
    parentPort!.postMessage(success(request.requestId, kernel.execute(request)));
  } catch (error) {
    parentPort!.postMessage(failure(request.requestId, safeStorageError(error)));
  }
});
```

- [x] **Step 6: Verify kernel GREEN and existing repository invariants**

```bash
pnpm --filter @openharness/agent-runtime test -- runtimeStorageWorkerKernel lifecycleCommands sqliteRuntimeAdapters traceOutbox
pnpm --filter @openharness/agent-runtime typecheck
```

Expected: focused tests PASS with the existing schema and lifecycle crash matrix unchanged.

## Task 3: Implement the real Worker client, singleton ownership, and failure lifecycle

**Files:**

- Create: [runtimeStorageWorkerClient.ts](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/agent-runtime/src/storage/runtimeStorageWorkerClient.ts)
- Create: [runtimeStorageWorkerClient.test.ts](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/agent-runtime/test/runtimeStorageWorkerClient.test.ts)
- Create: [runtimeStorageWorkerCrashFixture.ts](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/agent-runtime/test/fixtures/runtimeStorageWorkerCrashFixture.ts)
- Modify: [singletonLock.ts](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/agent-runtime/src/storage/singletonLock.ts)

- [x] **Step 1: Write real-worker boot and correlation RED tests**

Spawn the actual TypeScript Worker through `new Worker(new URL("./runtimeStorageWorker.ts", import.meta.url))` while inheriting the current tsx loader. Assert bootstrap completes before readiness, two concurrent RPC promises receive the response matching their request ID, and only one request is in flight at the worker.

- [x] **Step 2: Write singleton/close RED tests**

Assert:

1. Main acquires the database lock before worker bootstrap.
2. A second client cannot open.
3. `close()` rejects new normal work, drains accepted work, sends P0 close, waits for worker exit, then releases the lock.
4. Another client can acquire only after the first close resolves.

- [x] **Step 3: Write unexpected-exit/protocol RED tests**

Use the fixture Worker or injected `WorkerLike` to exit with an outstanding request and to emit a malformed response. Assert one atomic transition to unavailable, all queued/in-flight promises reject `RUNTIME_STORAGE_UNAVAILABLE`, readiness remains false, and no replacement Worker is spawned.

- [x] **Step 4: Run client RED**

```bash
pnpm --filter @openharness/agent-runtime test -- runtimeStorageWorkerClient
```

Expected: FAIL because the client does not exist.

- [x] **Step 5: Implement the client**

The client owns:

```ts
interface RuntimeStorageWorkerClient {
  readonly databasePath: string;
  execute<O extends StorageOperation>(
    priority: StoragePriority,
    operation: O,
    payload: StoragePayloadMap[O]
  ): Promise<StorageResultMap[O]>;
  readiness(): { ready: boolean; reason?: "RUNTIME_STORAGE_QUEUE_FULL" | "RUNTIME_STORAGE_UNAVAILABLE" };
  close(): Promise<void>;
}
```

Acquire `acquireRuntimeSingletonLock(`${databasePath}.lock`)` before spawning. Release only after a successful/failed close path has joined or terminated the worker. Preserve the expected database dev/inode identity in bootstrap. Queue-full rejection must not enqueue or post a worker message.

- [x] **Step 6: Verify client GREEN**

```bash
pnpm --filter @openharness/agent-runtime test -- runtimeStorageWorkerProtocol runtimeStorageCommandScheduler runtimeStorageWorkerKernel runtimeStorageWorkerClient singletonLock
pnpm --filter @openharness/agent-runtime typecheck
```

Expected: all focused tests and typecheck PASS; no child worker remains.

## Task 4: Expose async production ports and preserve commit-before-publish

**Files:**

- Modify: [lifecycleCommands.ts](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/agent-runtime/src/storage/lifecycleCommands.ts)
- Modify: [history.ts](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/agent-runtime/src/history.ts)
- Modify: [runtimeEventStore.ts](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/agent-runtime/src/runtimeEventStore.ts)
- Modify: [sqliteRuntimeAdapters.ts](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/agent-runtime/src/storage/sqliteRuntimeAdapters.ts)
- Modify: [productionRuntimeContext.ts](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/agent-runtime/src/storage/productionRuntimeContext.ts)
- Modify: [agentExecutionRunner.ts](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/agent-runtime/src/agentExecutionRunner.ts)
- Modify: [agentStreamLoop.ts](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/agent-runtime/src/agentStreamLoop.ts)
- Test: [productionRunnerPersistence.test.ts](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/agent-runtime/test/productionRunnerPersistence.test.ts)
- Test: [agentStreamLoop.test.ts](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/agent-runtime/test/agentStreamLoop.test.ts)

- [x] **Step 1: Write asynchronous commit-order RED tests**

Inject a lifecycle writer whose promise remains pending. Assert no durable event is published and no stream admission header is flushed until it resolves. Resolve with committed events and assert publication/flush occurs afterward. Reject and assert no durable event is published.

```ts
const start = deferred<LifecycleCommit>();
const running = runner.start(input);
expect(publisher.events).toEqual([]);
start.resolve({ events: [agentStart] });
await running.admitted;
expect(publisher.events).toEqual([agentStart]);
```

- [x] **Step 2: Write asynchronous store/replay RED tests**

Add an `Awaitable<T> = T | Promise<T>` contract so existing in-memory stores remain valid while production adapters return promises. All consumers must `await` history, event reader, execution reader, approval reader, and lifecycle results.

For SSE replay/live, subscribe before awaiting worker replay, buffer live events while replay is pending, emit replay first, then drain buffered events in cursor order while deduplicating by `eventId`.

- [x] **Step 3: Run async RED**

```bash
pnpm --filter @openharness/agent-runtime test -- productionRunnerPersistence agentStreamLoop detachedStream sessionsApi
```

Expected: FAIL because persistence is still synchronous.

- [x] **Step 4: Implement async ports and context**

Keep `RuntimeLifecycleCommands` synchronous inside the worker. Change the public `RuntimeLifecycleWriter` return type to `Awaitable<LifecycleCommit>` and create worker-backed adapters that map each operation to P1. `openProductionRuntimeContext` becomes async and returns no raw database or repositories:

```ts
interface ProductionRuntimeContext {
  databasePath: string;
  storage: RuntimeStorageWorkerClient;
  lifecycle: RuntimeLifecycleWriter;
  history: HistoryStore;
  memory: MemoryStore;
  executions: ScopedExecutionReader;
  approvals: ScopedApprovalReader;
  events: RuntimeEventReader;
  liveEvents: RuntimeEventPublisher;
  reconciliation: ReconcileRuntimeStartupResult;
  close(): Promise<void>;
}
```

- [x] **Step 5: Await every production persistence boundary**

Convert durable `send`, execution start, approval, tool plan/result, terminal closure, injected messages, abort, and stream start to await worker results before `publishCommittedLifecycleEvents`. Do not fire-and-forget a durable command.

- [x] **Step 6: Verify async GREEN**

```bash
pnpm --filter @openharness/agent-runtime test -- productionRunnerPersistence agentStreamLoop detachedStream sessionsApi abortApi
pnpm --filter @openharness/agent-runtime typecheck
```

Expected: focused tests and typecheck PASS with in-memory development behavior unchanged.

## Task 5: Move outbox, monitor, critical drain, and shutdown behind semantic ports

**Files:**

- Modify: [traceOutbox.ts](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/agent-runtime/src/storage/traceOutbox.ts)
- Modify: [traceOutboxDispatcher.ts](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/agent-runtime/src/storage/traceOutboxDispatcher.ts)
- Modify: [runtimeStorageMonitor.ts](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/agent-runtime/src/storage/runtimeStorageMonitor.ts)
- Modify: [server.ts](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/agent-runtime/src/server.ts)
- Test: [traceOutbox.test.ts](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/agent-runtime/test/traceOutbox.test.ts)
- Test: [traceOutboxDispatcher.test.ts](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/agent-runtime/test/traceOutboxDispatcher.test.ts)
- Test: [runtimeStorageMonitor.test.ts](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/agent-runtime/test/runtimeStorageMonitor.test.ts)
- Test: [productionServerLifecycle.test.ts](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/agent-runtime/test/productionServerLifecycle.test.ts)

- [x] **Step 1: Write two-phase outbox RED tests**

Freeze an async `TraceOutboxStore`:

```ts
interface TraceOutboxStore {
  claim(now: number, limit: number): Promise<TraceOutboxCandidate[]>;
  applyOutcomes(outcomes: TraceOutboxDeliveryOutcome[]): Promise<TraceOutboxDispatchResult>;
  hasDeadLetters(): Promise<boolean>;
}
```

Assert Java delivery remains concurrent on the main thread, `applyOutcomes` occurs once after delivery, whole-batch rollback remains retryable, and identical committed event identities are retained.

- [x] **Step 2: Write async monitor/drain/shutdown RED tests**

Assert disk sampling remains main-thread filesystem work while checkpoint is one P2 worker command. Critical state latches, rejects new admission, invokes one P0 `storage.criticalDrain`, closes Fastify, stops monitor/dispatcher enqueue, awaits P0 worker close/join, and releases lock last.

- [x] **Step 3: Run operational RED**

```bash
pnpm --filter @openharness/agent-runtime test -- traceOutbox traceOutboxDispatcher runtimeStorageMonitor productionServerLifecycle
```

Expected: FAIL because server wiring still reads raw repositories/database.

- [x] **Step 4: Implement outbox and monitor ports**

Remove production uses of `context.database` and `context.repositories`. `TraceOutboxDispatcher.start()` must asynchronously establish dead-letter readiness before it can report ready. Monitor scheduling must await `checkNow()` and prevent overlapping cycles.

- [x] **Step 5: Implement fail-closed production lifecycle**

`createProductionServer` must await worker bootstrap before constructing routes. Combine monitor, dispatcher, queue, and worker readiness. On unexpected worker failure, stop admission and close/terminate the Runtime process through an injected process-exit seam in tests; never spawn a replacement worker.

- [x] **Step 6: Verify operational GREEN**

```bash
pnpm --filter @openharness/agent-runtime test -- traceOutbox traceOutboxDispatcher runtimeStorageMonitor productionServerLifecycle productionServerAuth runtimeStorageAdmission
pnpm --filter @openharness/agent-runtime typecheck
```

Expected: focused tests/typecheck PASS and no production raw database access outside worker modules.

## Task 6: Prove worker crash boundaries and event-loop isolation

**Files:**

- Create: [runtimeStorageWorkerCrash.test.ts](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/agent-runtime/test/runtimeStorageWorkerCrash.test.ts)
- Create: [runtimeStorageWorkerHeartbeat.test.ts](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/agent-runtime/test/runtimeStorageWorkerHeartbeat.test.ts)
- Modify: [formalSoakExecution.test.ts](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/agent-runtime/test/formalSoakExecution.test.ts)
- Modify: [productionServerLifecycle.test.ts](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/agent-runtime/test/productionServerLifecycle.test.ts)

- [x] **Step 1: Write real crash RED tests**

Use a separate Runtime process and fixture worker so the test can terminate the worker:

1. exit before commit → transaction absent after restart;
2. exit after commit/before response → committed state present after restart;
3. outstanding RPC promises reject;
4. process exits; no replacement worker;
5. next startup reconciliation terminates only persisted non-terminal executions;
6. Java/tool side effects are not replayed.

- [x] **Step 2: Write event-loop heartbeat RED test**

Seed a mature-shaped database, enqueue repeated 100-row outbox outcome transactions plus 20 concurrent lifecycle admissions, and sample `setImmediate` heartbeat delay. Assert no synchronous `better-sqlite3` stack appears on the main thread and no heartbeat sample exceeds 100ms.

- [x] **Step 3: Run crash/heartbeat RED**

```bash
pnpm --filter @openharness/agent-runtime test -- runtimeStorageWorkerCrash runtimeStorageWorkerHeartbeat
```

Expected: FAIL until all production calls use the worker.

- [x] **Step 4: Complete the explicit crash and isolation wiring**

Add one idempotent `onUnavailable(errorCode)` callback to `RuntimeStorageWorkerClient`. In production wiring it must latch admission/readiness unavailable, close Fastify, await dispatcher/monitor shutdown, release the singleton lock after the dead worker is joined, and invoke an injected `terminateRuntime(1)` dependency whose production default exits the process. Tests inject a recorder instead of terminating Vitest.

Move every database call identified by the negative scan into an existing semantic worker operation; if a missing operation is required, add one named domain operation plus parser/kernel/client tests before using it. Ensure lifecycle callers await the RPC promise, and ensure heartbeat sampling runs concurrently with the real worker workload. Do not alter SQLite pragmas, batch size, concurrency, retry/dead-letter policy, schema, or qualification thresholds.

- [x] **Step 5: Run crash/heartbeat GREEN and negative scans**

```bash
pnpm --filter @openharness/agent-runtime test -- runtimeStorageWorkerCrash runtimeStorageWorkerHeartbeat formalSoakExecution productionServerLifecycle
rg -n "openRuntimeDatabase|openProductionRuntimeStorage|createSqliteRuntimeRepositories|better-sqlite3" agent-runtime/src \
  -g '!storage/runtimeStorageWorker.ts' \
  -g '!storage/runtimeStorageWorkerKernel.ts' \
  -g '!storage/runtimeStorage.ts' \
  -g '!baseline/**'
rg -n "Atomics\\.wait|SharedArrayBuffer|deasync|operation:\\s*[\"']sql|rawSql" agent-runtime/src
```

Expected: tests PASS; first scan contains only explicitly reviewed offline/test or type-only references, second scan has no matches.

## Task 7: Full verification, Review, and mature database qualification

**Files:**

- Modify: [agent-runtime-v1-production-runbook.md](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/docs/architecture/agent-runtime-v1-production-runbook.md)
- Create: [Implementation Review](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/docs/review/2026-07-27-agent-runtime-sqlite-storage-worker-implementation-review.md)
- Update only after evidence: [tasks.md](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/openspec/changes/harden-agent-runtime-single-node-production/tasks.md)
- Update only at `verified`: [development-log.json](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/docs/project-dashboard/development-log.json)

- [x] **Step 1: Run focused worker matrix**

```bash
pnpm --filter @openharness/agent-runtime test -- \
  runtimeStorageWorkerProtocol \
  runtimeStorageCommandScheduler \
  runtimeStorageWorkerKernel \
  runtimeStorageWorkerClient \
  runtimeStorageWorkerCrash \
  runtimeStorageWorkerHeartbeat \
  productionRunnerPersistence \
  productionServerLifecycle \
  traceOutbox \
  traceOutboxDispatcher \
  runtimeStorageMonitor
```

Expected: all focused files PASS with no leaked worker.

- [x] **Step 2: Run the fresh full matrix**

```bash
pnpm test
pnpm typecheck
mvn -o -f backend/pom.xml test
npx openspec validate harden-agent-runtime-single-node-production --strict --no-interactive
npx openspec validate --all --strict --no-interactive
pnpm dashboard:check
git diff --check
```

Expected: zero test/type/validation failures; dashboard generated outputs current.

- [x] **Step 3: Run High Review**

Inspect the complete diff, worker production wiring, queue/protocol/crash mechanisms, async call sites, SSE replay/live order, no-secret output, temporary files, and out-of-scope changes. Rerun the worker heartbeat business-chain probe. Any finding returns to the same fix → verification → Review loop.

- [x] **Step 4: Update the production runbook and OpenSpec task evidence**

Document worker ownership, readiness, queue saturation, worker-exit behavior, shutdown order, operational diagnostics, and rollback compatibility. Mark 4.1b/4.1c only after implementation Review PASS; leave 4.1d open until mature regression passes.

- [x] **Step 5: Create and Preflight Review a fresh mature-database 10-minute regression packet**

Reuse the frozen Attempt003 workload, thresholds, source/evidence binding, cleanup, and correctness oracles. Add worker/queue/heartbeat metrics without changing admission/replay thresholds. Do not run until the packet Review is PASS.

- [x] **Step 6: Run the mature regression once**

The result must have 20/20 samples, admission median/p95 within the frozen threshold, no more than two consecutive samples above 100ms, clean replay/correctness/resource/oracle/integrity results, and no worker/queue failure.

- [x] **Step 7: Reconcile status**

If mature regression PASSes, mark 4.1d complete, sync Dashboard `verified` only if all other project-required local qualification conditions are satisfied, render/check Dashboard, and prepare Attempt005 Plan/Preflight. If it FAILs, leave Dashboard `proposed`, do not start Attempt005, and write a blocker Result Review with the exact resume condition.

## Stop conditions

- Any protocol permits raw SQL/callback/code across the worker boundary.
- Any production `better-sqlite3` operation remains on the main thread.
- Queue becomes unbounded, drops commands, or bypasses durable start.
- P2 can starve beyond 32 eligible P1 selections.
- Worker failure triggers in-process replacement or a second SQLite connection.
- Durable events publish before commit acknowledgement.
- SSE replay/live emits a gap, duplicate, or cursor reordering.
- Trace outbox batch/retry/dead-letter semantics change.
- Existing API/schema/identity/threshold contracts change.
- Any strict verification or High Review remains FAIL/BLOCKED.

## Rollback

Before source implementation, rollback is removal of this plan only. During implementation, revert only the current TDD slice using reviewed patches; never use destructive Git. The SQLite schema remains version 2, so test fixtures and existing databases require no data rollback. After any worker-backed production write, the approved forward-fix policy remains authoritative even though the physical schema is unchanged.
