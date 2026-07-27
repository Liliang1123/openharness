## ADDED Requirements

### Requirement: Transactional Runtime Lifecycle
The single-node production profile SHALL run exactly one Runtime process and worker and SHALL use SQLite as the sole post-cutover write authority. Cross-store lifecycle transitions MUST execute through one Unit of Work using `BEGIN IMMEDIATE`. Durable SSE events MUST publish only after commit; the main stream MAY separately publish explicitly transient previews.

#### Scenario: Execution starts atomically
- **WHEN** a new execution is accepted
- **THEN** execution state, stable user message, and `agent_start` event commit in one transaction before client acknowledgement

#### Scenario: Approval transition commits atomically
- **WHEN** a tool call enters approval
- **THEN** approval record, waiting state, and `approval_requested` event commit in one transaction

#### Scenario: Terminal transition commits atomically
- **WHEN** an execution completes or terminates
- **THEN** final stable message when present, terminal state, and terminal event commit in one transaction

#### Scenario: Post-commit notification fails
- **WHEN** live notification fails after commit
- **THEN** committed state remains authoritative and reconnect replay returns the event

#### Scenario: Second Runtime instance is fenced
- **WHEN** another process already holds the database-adjacent OS advisory lock
- **THEN** the second Runtime never becomes ready or accepts traffic and exits without opening the database for writes

### Requirement: Deterministic Restart Reconciliation
Before readiness, the Runtime MUST migrate, integrity-check, and reconcile persisted state. Persisted `running` and `waiting_approval` executions SHALL atomically become terminal with `EXECUTION_INTERRUPTED`; pending approvals SHALL become invalidated. The Runtime MUST NOT reconstruct runners or replay unproven model/tool side effects.

#### Scenario: Pending approval is invalidated
- **WHEN** Runtime restarts with a waiting approval
- **THEN** execution, approval, and terminal event atomically record interruption and the old approval token cannot be used

#### Scenario: Migration failure blocks readiness
- **WHEN** migration, integrity checking, or reconciliation fails
- **THEN** readiness remains false and no business request is accepted

### Requirement: Approval Secret Handling
Raw Java approval tokens SHALL remain process-memory secrets, have a TTL, and be single-use. SQLite MAY persist only an HMAC-SHA-256 digest and lifecycle metadata. Clients SHALL receive only a non-sensitive `approvalId` and submit decisions through an authenticated tenant+user scoped compare-and-set endpoint. Raw Java tokens MUST NOT appear in durable events, API responses, traces, stdout, or file logs.

#### Scenario: Restart invalidates token
- **WHEN** Runtime restarts
- **THEN** no persisted value can be used as the raw approval token and the pending approval is invalidated

### Requirement: Transient Streaming Preview
Streaming fragments SHALL be transient previews: they MUST NOT be persisted or assigned durable cursors. Only the final assistant message and terminal event become durable in one transaction. An interrupted stream SHALL discard its preview and reconcile to `EXECUTION_INTERRUPTED`.

#### Scenario: Crash during stream
- **WHEN** a client has received transient fragments and Runtime crashes before final commit
- **THEN** replay does not claim those fragments are durable and returns interrupted/resync state for explicit client retry

### Requirement: Tenant-And-User-Scoped Durable Event Replay
Durable events SHALL use a unique `(tenantId, userId, conversationId, seq)` key with sequence allocation and insert in one transaction. Replay MUST use the complete tenant/user/conversation scope. Pruned, unknown, cross-scope, or stale cursors MUST produce `stream_resync_required` or a scoped not-found response without disclosing another tenant or user's existence.

#### Scenario: Cross-tenant cursor is rejected
- **WHEN** an authenticated caller presents another tenant's conversation and cursor
- **THEN** no event or existence metadata is returned

#### Scenario: Replay switches to live without a gap
- **WHEN** committed events arrive while replay transitions to subscription
- **THEN** no committed event is missed; reconnect delivery is at-least-once and clients deduplicate by opaque event identity

### Requirement: Private Service Authentication
In production, every business route SHALL authenticate a rotating service bearer token before reading scoped state and SHALL require tenant, user, trace, and request identity headers. Production MUST NOT supply default identities, and body/query fields MUST NOT override authenticated headers.

#### Scenario: Missing or invalid service credential fails closed
- **WHEN** a request lacks a valid service credential
- **THEN** it is rejected before tenant state access

#### Scenario: Authenticated IDOR attempt is rejected
- **WHEN** an authenticated gateway request enumerates a conversation, execution, approval, event, or memory identifier outside its tenant+user scope
- **THEN** the Runtime returns no cross-scope data or existence signal

### Requirement: SQLite Contention And Disk Protection
SQLite SHALL enable WAL and foreign keys and enforce one 5-second wall-clock contention deadline across at most three attempts, with each busy timeout bounded by the remaining deadline. WAL at 256 MiB SHALL trigger checkpoint attempts and admission degradation when blocked. Free disk below 2 GiB or 10 percent SHALL stop new admission while reserving 512 MiB for in-flight terminal writes; the critical watermark SHALL drain and stop the process for startup reconciliation.

#### Scenario: Lock contention is bounded
- **WHEN** a write remains busy after the bounded retry budget
- **THEN** the transition fails with a structured persistence error and is not acknowledged

#### Scenario: Low disk prevents new execution
- **WHEN** free disk crosses the configured low-water mark
- **THEN** new execution and mutation requests are rejected before writing

### Requirement: Fixed Single-Node Qualification Gate
Runtime v1 MUST pass a 24-hour deterministic soak with 10,000 seeded conversations, 20 concurrent executions, a fixed 60/20/15/5 no-tool/Java/MCP/approval workload, 30-second sampling, and TS Runtime restarts at hours 2, 12, and 22 while Java remains running. The fixed correctness and resource thresholds in the approved design SHALL be evaluated without post-run relaxation.

#### Scenario: Correctness failure blocks promotion
- **WHEN** any cross-tenant or same-tenant cross-user leak, duplicate Runtime-caused side effect, integrity/order/secret/reconciliation failure, unexpected exit, or exhausted `SQLITE_BUSY` occurs
- **THEN** the run stops and promotion is blocked

#### Scenario: Sustained resource breach blocks promotion
- **WHEN** a resource or latency threshold is exceeded continuously for 5 minutes
- **THEN** the qualification result is FAIL

## MODIFIED Requirements

### Requirement: Runtime Terminal Errors
The agent-runtime SHALL classify every terminal execution using `EMPTY_MODEL_RESPONSE`, `MODEL_ERROR`, `TOOL_ERROR`, `POLICY_DENY`, `APPROVAL_TIMEOUT`, `EXECUTION_TIMEOUT`, `STEP_BUDGET_EXHAUSTED`, `EVENT_REPLAY_GAP`, `EXECUTION_ABORTED`, or `EXECUTION_INTERRUPTED`. The class MUST appear consistently in durable `stream_error`, `ExecutionState.endReason`, session detail, and trace events.

#### Scenario: Restart interruption uses dedicated class
- **WHEN** startup reconciles a persisted running or waiting execution
- **THEN** state, session detail, trace, and durable terminal SSE use `EXECUTION_INTERRUPTED`

#### Scenario: Execution timeout remains supported
- **WHEN** an execution exceeds its configured execution timeout
- **THEN** state, session detail, trace, and durable terminal SSE use `EXECUTION_TIMEOUT`

### Requirement: Execution Identifiers
The agent-runtime SHALL generate a unique `executionId` per turn and a durable event sequence per `(tenantId,userId,conversationId)`. Execution, request, trace, conversation, tenant, and user identities remain distinct, and every durable event carries the complete ownership scope.

#### Scenario: Same conversationId under different users has independent sequences
- **WHEN** two users in one tenant use the same conversationId
- **THEN** their execution and event sequences remain isolated and cannot address each other

### Requirement: Runtime Event Store
The agent-runtime SHALL provide scoped `append`, `since`, `latestEventId`, and `subscribe` operations requiring `(tenantId,userId,conversationId)`. Within one connection replay and live committed events MUST be ordered without gap or duplicate; across reconnects delivery is at-least-once and deduplicated by event identity.

#### Scenario: Scoped replay then live
- **WHEN** a subscriber replays and subscribes with one tenant/user/conversation scope
- **THEN** it receives only that scope's committed events without a gap during the replay-live transition

#### Scenario: Same conversationId does not merge users
- **WHEN** two users append events using the same conversationId
- **THEN** each scoped `since` call returns only its owner's events

### Requirement: Execution State Store
The agent-runtime SHALL track active and recently terminal executions with `tenantId`, `userId`, `conversationId`, status, timestamps, terminal reason, and runtime-only cancellation handle. Durable fields SHALL be persisted; process-only cancellation handles SHALL be recreated only for new executions and never treated as restart checkpoints.

#### Scenario: Execution lookup enforces owner scope
- **WHEN** a different user in the same tenant queries an executionId
- **THEN** no state or existence signal is returned

### Requirement: Active Execution Lock
The agent-runtime SHALL allow at most one non-terminal execution per `(tenantId,userId,conversationId)` and SHALL acquire that lock atomically in SQLite. Running and waiting executions reject another request for the same owner scope with the existing executionId; another user using the same conversationId has an independent lock.

#### Scenario: Same owner is rejected while active
- **WHEN** the same tenant, user, and conversation starts a second request while one is active
- **THEN** the request returns the appropriate running or waiting `409` response

#### Scenario: Different user has independent lock
- **WHEN** another user in the same tenant uses the same conversationId
- **THEN** that user does not observe or conflict with the first user's active execution

## ADDED Requirements

### Requirement: Durable Trace Outbox
Committed runtime events destined for Java trace/audit ingestion SHALL act as a durable outbox with delivery status, attempts, and next-attempt. Pending or retrying rows MUST NOT be pruned. Exhausted rows MUST enter durable dead-letter state, degrade readiness, and require explicit operator resolution. Java delivery is at-least-once and deduplicated by committed event identity.

#### Scenario: Crash before acknowledgement retries
- **WHEN** Runtime crashes after Java records an event but before acknowledgement is persisted
- **THEN** restart retries the same event identity and Java retains one logical trace event

#### Scenario: Dead letter is not pruned
- **WHEN** delivery exhausts its retry policy
- **THEN** the row remains durable, readiness is degraded, and retention does not delete it

### Requirement: Dedicated Asynchronous SQLite Storage Worker
Production Runtime SHALL acquire and retain the singleton database lock on the main thread while exactly one dedicated Worker Thread exclusively owns the `better-sqlite3` connection. Migration, identity/integrity verification, startup reconciliation, lifecycle transactions, scoped persistence queries and mutations, trace-outbox database state, checkpoint/monitor database operations, and close MUST execute through typed asynchronous semantic commands in that worker. Raw SQL, transaction callbacks, SQLite handles, and executable code MUST NOT cross the worker boundary. Existing database schema, public API/SSE contracts, tenant/user isolation, lifecycle atomicity, outbox semantics, and fixed qualification thresholds SHALL remain unchanged.

#### Scenario: Durable admission does not execute SQLite on the main thread
- **WHEN** an authenticated execution start is admitted under the fixed mature workload
- **THEN** the main thread asynchronously awaits one worker lifecycle command, and durable events are published only after that command reports a successful commit

#### Scenario: Typed boundary rejects executable database access
- **WHEN** a caller attempts to submit raw SQL, a transaction callback, an unknown operation, or a malformed command payload
- **THEN** the worker protocol rejects it without executing database work or weakening readiness evidence

### Requirement: Bounded Priority Storage Scheduling
The storage worker client SHALL bound pending commands at `2,048` and SHALL distinguish exclusive P0 bootstrap/drain/shutdown, P1 execution/lifecycle/scoped request work, and P2 outbox/retention/checkpoint/monitor work. P0 SHALL exclude normal work. During normal operation P1 MAY take priority, but after at most 32 consecutively selected P1 commands an already-waiting P2 command MUST be selected. Queue saturation MUST stop new execution/external mutation admission using the existing storage-pressure fail-closed response schema; commands MUST NOT be silently dropped and durable start MUST NOT be bypassed.

#### Scenario: Foreground admission cannot starve maintenance forever
- **WHEN** P1 commands remain continuously available while a P2 command is waiting
- **THEN** the scheduler selects that P2 command after no more than 32 additional P1 selections

#### Scenario: Queue saturation fails closed
- **WHEN** the pending command count reaches 2,048
- **THEN** new execution and external mutation admission is rejected without a database write while accepted terminal work follows the existing emergency-headroom policy

### Requirement: Storage Worker Failure And Shutdown
Unexpected worker exit or protocol corruption SHALL atomically make storage unavailable, reject pending and new storage commands, make Runtime unready, stop new admission, and terminate the Runtime process without opening a replacement SQLite connection. The next process start SHALL reacquire the singleton lock and run normal migration, integrity, and reconciliation. Normal shutdown SHALL stop external admission, drain accepted lifecycle work, stop background enqueue, checkpoint and close SQLite in the worker, join the worker, and only then release the singleton lock.

#### Scenario: Worker exits after a committed lifecycle transaction
- **WHEN** the storage worker exits after SQLite commit but before the main thread receives the response
- **THEN** the Runtime process terminates and startup reconciliation/replay observes the committed state without replaying model or tool side effects

#### Scenario: Worker exits before commit
- **WHEN** the storage worker exits while a lifecycle transaction has not committed
- **THEN** SQLite rolls back the transaction and the next startup reconciliation observes no partial lifecycle boundary

#### Scenario: Normal close releases ownership last
- **WHEN** Runtime performs a normal shutdown
- **THEN** SQLite checkpoint and close plus worker join complete before the singleton lock is released
