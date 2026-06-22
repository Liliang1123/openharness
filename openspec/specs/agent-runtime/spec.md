# agent-runtime Specification

## Purpose
TBD - created by archiving change implement-p0a-skeleton. Update Purpose after archive.
## Requirements
### Requirement: Agent Chat API
The TypeScript Agent Runtime SHALL expose synchronous `POST /api/v1/agent/chat` and SHALL NOT expose or require SSE for P0a.

#### Scenario: User sends chat request
- **WHEN** the frontend sends a chat request with `conversationId` and `message`
- **THEN** the TS Runtime returns a synchronous assistant answer payload

### Requirement: Header and Trace Propagation
The TS Runtime SHALL reuse `X-Trace-Id` when provided, generate one in P0a dev mode when omitted, and propagate the same `X-Trace-Id`, `X-Request-Id`, `X-User-Id`, and `X-Tenant-Id` to every Java request.

#### Scenario: Frontend provides trace id
- **WHEN** a chat request includes `X-Trace-Id: trace-001`
- **THEN** every TS-to-Java request uses `X-Trace-Id: trace-001`

### Requirement: In-Memory Message History
The TS Runtime SHALL maintain MessageHistory in memory isolated by `(tenantId, conversationId)` and SHALL strip internal fields in `toModelMessages()` before sending messages to Java model gateway.

#### Scenario: Internal fields are stripped
- **WHEN** a stored message contains `systemInjected`, `transient`, `compressedSummary`, `requestId`, or `conversationId`
- **THEN** `toModelMessages()` omits those internal fields from the Java model request

### Requirement: Tool Registry Catalog Freeze
The TS Runtime SHALL fetch Java tool catalog through `GET /api/v1/tools/catalog` and freeze the tools schema definition, `catalogVersion`, and `catalogHash` for each `(tenantId, conversationId)` session lifecycle to prevent caching disruption from tool catalog mutations. However, tool execution permissions and security revocations MUST remain dynamic and dynamically audited via the `beforeToolUse` gateway on each step.

#### Scenario: Same conversation reuses catalog schema
- **WHEN** the same tenant and conversation sends two chat turns
- **THEN** the TS Runtime presents the identical tools schema to the model to preserve cache matching
- **AND** still dynamically validates permission policies on tool execution in `beforeToolUse`

### Requirement: P0a beforeToolUse Hook
The TS Runtime SHALL provide a beforeToolUse hook with P0b-compatible function signature and SHALL implement pass-through ALLOW behavior for P0a.

#### Scenario: Safe tool passes through hook
- **WHEN** the model requests `get_current_time`
- **THEN** beforeToolUse returns an ALLOW decision and the TS Runtime calls Java tool execution

### Requirement: Synchronous Agent Loop
The TS Runtime SHALL implement a minimal loop `callModel -> beforeToolUse -> executeTool -> callModel/final`.

#### Scenario: Time query completes tool loop
- **WHEN** the user asks `现在几点`
- **THEN** the TS Runtime receives a Java model tool call, parses `argumentsRaw`, executes Java `get_current_time`, appends tool result, calls Java model again, and returns a final assistant answer

### Requirement: Tool Argument Parse Error
The TS Runtime SHALL parse `ToolCall.argumentsRaw` into an object before Java tool execution and SHALL return a model-visible tool result with `MODEL_TOOL_PARSE_ERROR` if parsing fails.

#### Scenario: Invalid argumentsRaw is model visible
- **WHEN** the model returns a tool call with invalid JSON in `argumentsRaw`
- **THEN** the TS Runtime appends a tool result with `status: "error"` and `errorClass: "MODEL_TOOL_PARSE_ERROR"`

### Requirement: Agent Runtime CORS
The TS Runtime SHALL allow only `FRONTEND_URL` as CORS origin and SHALL expose `X-Trace-Id` and `X-Request-Id`.

#### Scenario: CORS exposes trace headers
- **WHEN** the frontend calls the chat endpoint from the configured origin
- **THEN** the response exposes `X-Trace-Id` and `X-Request-Id`

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

### Requirement: Tool Result Provenance Persistence
The agent-runtime SHALL classify every tool result as `trusted` or `untrusted` before appending it to `HistoryStore`. Java catalog tool responses without explicit provenance SHALL default to `trusted`; MCP tool responses without explicit provenance SHALL default to `untrusted`. The runtime SHALL persist the classification in internal `AgentMessage.toolResultProvenance` metadata.

#### Scenario: Java catalog tool defaults trusted
- **WHEN** a Java catalog tool returns `status: "ok"` without `provenance`
- **THEN** the runtime appends a tool message with `toolResultProvenance: "trusted"`

#### Scenario: MCP tool defaults untrusted
- **WHEN** an MCP tool returns `status: "ok"` without explicit provenance
- **THEN** the runtime appends a tool message with `toolResultProvenance: "untrusted"`

### Requirement: Untrusted Tool Output Boundary
The agent-runtime SHALL wrap model-visible content for untrusted tool results in a stable boundary that marks the content as data, not instructions. The runtime SHALL NOT expose internal provenance fields as separate model message fields.

#### Scenario: Untrusted output is wrapped for model input
- **WHEN** a tool result with `toolResultProvenance: "untrusted"` is appended to history
- **THEN** the model-visible tool message content starts with `<tool_output trust="untrusted"` and ends with `</tool_output>`
- **AND** `toModelMessages()` does not include `toolResultProvenance` as a message field

#### Scenario: Trusted output keeps existing content shape
- **WHEN** a trusted tool result is appended to history
- **THEN** the model-visible content remains the serialized tool result without the untrusted boundary wrapper

### Requirement: Untrusted Context Policy Forwarding
Before calling Java policy evaluation, the agent-runtime SHALL detect whether any untrusted tool output exists after the latest user message and SHALL include that state in `ReviewPolicyEvaluateRequest.context.untrustedToolOutputSinceLastUser`. The runtime SHALL also include frozen tool permission metadata in `context.toolPermissions`.

#### Scenario: Runtime forwards untrusted context
- **GIVEN** the latest history after the last user message contains an untrusted tool result
- **WHEN** the model asks to call `submit_payment`
- **THEN** the runtime calls policy evaluate with `context.untrustedToolOutputSinceLastUser: true`
- **AND** `context.toolPermissions.submit_payment: "sensitive"`

#### Scenario: Runtime forwards trusted context as false
- **GIVEN** the latest history after the last user message contains only trusted tool results
- **WHEN** the model asks to call `echo`
- **THEN** the runtime calls policy evaluate with `context.untrustedToolOutputSinceLastUser: false`

### Requirement: ContextBuilder Model Calls
The agent-runtime SHALL call the Java model gateway for each Agent Loop step using model-call messages built by ContextBuilder, the frozen tool catalog, catalog metadata, and cache hints computed from the selected context.

#### Scenario: Model call uses selected context
- **WHEN** an execution step begins
- **THEN** the runtime builds model-call messages from stable history through ContextBuilder
- **AND** sends those selected messages to Java `/api/v1/model/chat`

#### Scenario: History remains the durable source
- **WHEN** ContextBuilder omits older messages from a model call due to budget
- **THEN** those omitted messages remain in `HistoryStore`
- **AND** are still eligible for future compression or replay according to their stable history rules

### Requirement: Prompted Model Calls
The agent-runtime SHALL prepend a versioned system prompt from PromptRegistry to model-call messages before sending them to the Java model gateway. The prompt message MUST be transient model-call input and MUST NOT be appended to stable history.

#### Scenario: Runner sends prompted context
- **WHEN** an execution step calls the Java model gateway
- **THEN** the first message is the resolved system prompt
- **AND** subsequent messages are the ContextBuilder-selected conversation context

#### Scenario: Prompt does not pollute history
- **WHEN** the execution completes
- **THEN** stable history contains the user, assistant, and tool messages but not the system prompt

### Requirement: Agent Definition Trace Attribution
The agent-runtime SHALL attach the selected Agent Definition `agentId` to TS Runtime trace events emitted during an agent execution.

#### Scenario: Trace events include selected agent id
- **GIVEN** a chat request selects Agent Definition `support-agent`
- **WHEN** the Agent Runtime emits trace events for that execution
- **THEN** each TS Runtime trace event includes top-level `agentId` equal to `support-agent`

#### Scenario: Default trace events include default agent id
- **GIVEN** a chat request omits `agentId`
- **WHEN** the Agent Runtime emits trace events for that execution
- **THEN** each TS Runtime trace event includes top-level `agentId` equal to `default-agent`

### Requirement: Agent runtime SHALL maintain child execution identity for subagents

Each subagent run MUST have a child execution identity that is linked to the parent `executionId`, `tenantId`, `conversationId`, `toolCallId`, and skill name. Child execution identity MUST be emitted in trace metadata and MUST NOT acquire the parent conversation active execution lock as a second top-level user execution.

#### Scenario: Child execution is attributable to parent
- **WHEN** a forked skill starts a subagent run
- **THEN** trace events include both the parent `executionId` and the child execution identity
- **AND** a second user chat request for the same parent conversation still sees the parent execution as the active lock holder

### Requirement: Agent runtime SHALL propagate abort and timeout controls into subagents

A subagent execution MUST observe the parent execution `AbortSignal`. The subagent timeout MUST be the minimum of the parent execution's remaining deadline and `SUBAGENT_TIMEOUT_MS` when configured. If the parent execution is aborted, any running subagent MUST stop and return a child terminal classification that can be mapped to the parent tool result.

#### Scenario: Parent abort cancels running subagent
- **WHEN** a parent execution is aborted while a subagent is running
- **THEN** the subagent stops without launching additional model or tool calls
- **AND** the parent execution terminates with `EXECUTION_ABORTED`

### Requirement: Agent runtime SHALL forward subagent logical model id without owning provider credentials

When skill metadata provides `subagent_model`, the TS Runtime MUST pass that value as the child model logical id in Java model requests. TS Runtime MUST NOT resolve provider credentials, duplicate Java model-router configuration, or block unknown logical model ids beyond existing request validation.

#### Scenario: Subagent model is forwarded as logical id
- **WHEN** a forked skill declares `subagent_model: "cheap-worker"`
- **THEN** the child model request sent to Java uses `model: "cheap-worker"`
- **AND** provider routing remains owned by Java Backend

### Requirement: Agent runtime SHALL aggregate subagent usage and cost from provider responses

The TS Runtime MUST aggregate child model usage and `costUsdMicros` values reported by Java `ModelChatResponse.usage` into subagent trace metadata and parent execution observability. TS Runtime MUST NOT recalculate provider cost locally; missing child usage MUST NOT block successful summary return.

#### Scenario: Child cost is attributed without local recalculation
- **WHEN** child model responses include `usage.costUsdMicros`
- **THEN** the subagent trace summary includes the aggregated child `costUsdMicros`
- **AND** the value is the sum of Java-provided child usage values, not a TS-side price calculation

