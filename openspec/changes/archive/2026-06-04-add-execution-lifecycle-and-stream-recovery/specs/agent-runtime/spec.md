## ADDED Requirements

### Requirement: Execution Identifiers
The agent-runtime SHALL generate a unique `executionId` for every agent turn started via `POST /api/v1/agent/chat` or `POST /api/v1/agent/chat/stream`. The agent-runtime SHALL also generate per-conversation monotonically increasing `eventId` values for every event recorded in the `RuntimeEventStore`. `executionId` MUST be distinct from `requestId`, `traceId`, and `conversationId`.

#### Scenario: Each agent turn has a unique executionId
- **WHEN** the same conversation receives two sequential chat requests
- **THEN** the two executions have different `executionId` values

#### Scenario: eventId is monotonically increasing within a conversation
- **WHEN** events `e1`, `e2`, `e3` are appended to the `RuntimeEventStore` for a conversation in that order
- **THEN** the `eventId` values satisfy `e1.eventId < e2.eventId < e3.eventId`

### Requirement: Runtime Event Store
The agent-runtime SHALL provide a `RuntimeEventStore` interface supporting `append`, `since(afterEventId)`, `latestEventId`, and `subscribe(listener)` operations. The implementation MUST guarantee that a subscriber registered via `subscribe` receives both the events that exist at subscription time (replay) and all subsequent events (live), with no gap and in correct order.

#### Scenario: Subscribe receives replay then live events
- **WHEN** a subscriber calls `subscribe` while events `e1`, `e2` already exist and `e3`, `e4` are appended afterwards
- **THEN** the subscriber receives `e1`, `e2`, `e3`, `e4` in order without duplicates or gaps

#### Scenario: Since returns events after the cursor
- **WHEN** a caller invokes `since(e2.eventId)` and events `e1`, `e2`, `e3`, `e4` are stored
- **THEN** the result is `[e3, e4]` in order

### Requirement: Execution State Store
The agent-runtime SHALL provide an `ExecutionStateStore` that tracks every active and recently terminal execution by `executionId`. State MUST include `conversationId`, `tenantId`, `status` (`running` / `waiting_approval` / `completed` / `aborted` / `errored`), `startedAt`, `updatedAt`, `endedAt`, and an `AbortController` reference. Terminal executions are retained for at least 5 minutes for client reconciliation.

#### Scenario: Status transitions through running to completed
- **WHEN** a runner starts and reaches FINAL_ANSWER without approval
- **THEN** the execution status transitions `running` → `completed` and `endedAt` is set

#### Scenario: REQUIRE_APPROVAL transitions to waiting_approval
- **WHEN** the runner encounters a `REQUIRE_APPROVAL` decision for a tool call
- **THEN** the execution status transitions to `waiting_approval` and stays there until the approval is decided or times out

### Requirement: Active Execution Lock
The agent-runtime SHALL allow at most one non-terminal execution per `(tenantId, conversationId)`. New chat requests arriving while an existing execution is `running` SHALL be rejected with `409 EXECUTION_ALREADY_RUNNING`. New chat requests arriving while an existing execution is `waiting_approval` SHALL be rejected with `409 EXECUTION_WAITING_APPROVAL`. The `409` response MUST include the existing `executionId` so the client can subscribe to its events.

#### Scenario: Running execution rejects new request
- **WHEN** conversation `conv-1` has a running execution and a second chat request arrives
- **THEN** the second request returns `409` with `errorClass: "EXECUTION_ALREADY_RUNNING"` and the running `executionId`

#### Scenario: Waiting_approval rejects new request
- **WHEN** conversation `conv-1` is `waiting_approval` and a second chat request arrives
- **THEN** the second request returns `409` with `errorClass: "EXECUTION_WAITING_APPROVAL"`, the existing `executionId`, and a `pendingApprovals` list

#### Scenario: Terminal execution allows new request
- **WHEN** conversation `conv-1`'s last execution is `completed` and a new chat request arrives
- **THEN** the new request creates a fresh execution and proceeds normally

### Requirement: Detached Runner
The agent-runtime SHALL run agent executions through an `AgentExecutionRunner` whose lifecycle is independent of any HTTP connection. When the main stream HTTP connection disconnects, the runner MUST continue to completion. The final assistant message MUST be appended to `HistoryStore` regardless of whether any client was still connected at completion time.

#### Scenario: Client disconnect does not cancel execution
- **WHEN** a client closes the main stream HTTP connection mid-execution
- **THEN** the runner continues, the final assistant message lands in `HistoryStore`, and a client reconnecting via session events SSE receives the remaining events including `stream_done`

#### Scenario: Reconnecting client sees terminal event
- **WHEN** a client disconnects mid-execution and reconnects via `GET /api/v1/sessions/:conversationId/events?last_event_id=...` after the runner has terminated
- **THEN** the client receives the buffered events and the terminal `stream_done` event

### Requirement: Abort Execution API
The agent-runtime SHALL expose `POST /api/v1/sessions/:conversationId/executions/:executionId/abort` that triggers the runner's `AbortController` and transitions the execution to `aborted` with `stopReason: "EXECUTION_ABORTED"`. Aborting a terminal execution SHALL be a no-op returning `200 OK`.

#### Scenario: Abort running execution
- **WHEN** a client calls the abort endpoint for a `running` execution
- **THEN** the execution transitions to `aborted`, the runner emits a terminal `stream_error` with `errorClass: "EXECUTION_ABORTED"`, and the response is `200 OK`

#### Scenario: Abort already-terminal execution is no-op
- **WHEN** a client calls abort for an execution that is already `completed`
- **THEN** the response is `200 OK` with no further state change

### Requirement: Runtime Terminal Errors
The agent-runtime SHALL classify every execution termination using the `RuntimeTerminalError` enum: `EMPTY_MODEL_RESPONSE`, `MODEL_ERROR`, `TOOL_ERROR`, `POLICY_DENY`, `APPROVAL_TIMEOUT`, `STEP_BUDGET_EXHAUSTED`, `EVENT_REPLAY_GAP`, `EXECUTION_ABORTED`. The classification MUST appear in the terminal SSE event, in `ExecutionState.endReason`, and in trace events.

#### Scenario: Approval timeout produces correct terminal class
- **WHEN** an execution sits in `waiting_approval` past `APPROVAL_TIMEOUT_MS`
- **THEN** the execution transitions to `errored` with `endReason: "APPROVAL_TIMEOUT"` and emits `stream_error` carrying `errorClass: "APPROVAL_TIMEOUT"`

#### Scenario: Tool error produces correct terminal class
- **WHEN** a tool execution returns `status: "error"` and the model cannot continue
- **THEN** the execution transitions to `errored` with `endReason: "TOOL_ERROR"` and emits `stream_error` carrying `errorClass: "TOOL_ERROR"`

### Requirement: Execution and Approval Timeouts
The agent-runtime SHALL enforce two configurable timeouts: `EXECUTION_TIMEOUT_MS` (default 1800000, 30 minutes) limiting total execution wall time and `APPROVAL_TIMEOUT_MS` (default 3600000, 1 hour) limiting `waiting_approval` duration. Exceeding either timeout SHALL produce a corresponding `RuntimeTerminalError`.

#### Scenario: Execution timeout terminates a stuck runner
- **WHEN** an execution has been `running` longer than `EXECUTION_TIMEOUT_MS`
- **THEN** the runner is aborted with `endReason: "EXECUTION_ABORTED"` (or a future dedicated `EXECUTION_TIMEOUT` class as defined by the change)

#### Scenario: Approval timeout terminates pending approval
- **WHEN** an execution has been `waiting_approval` longer than `APPROVAL_TIMEOUT_MS`
- **THEN** the execution transitions to `errored` with `endReason: "APPROVAL_TIMEOUT"`
