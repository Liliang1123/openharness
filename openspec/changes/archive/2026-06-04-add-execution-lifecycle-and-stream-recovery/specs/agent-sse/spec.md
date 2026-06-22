## MODIFIED Requirements

### Requirement: SSE Streaming Endpoint
The agent-runtime SHALL expose `POST /api/v1/agent/chat/stream` that returns a `text/event-stream` response with structured SSE events for each agent loop step. Every event MUST carry `eventId` (per-conversation monotonically increasing), `executionId`, `conversationId`, `traceId`, `requestId`, and `createdAt` fields in its data payload.

#### Scenario: Normal tool-call flow emits correct event sequence with ids
- **WHEN** a user sends a message that triggers a tool call
- **THEN** the SSE stream emits events in order: `agent_start`, `model_call_start`, `model_call_end`, `tool_call`, `tool_result`, `model_call_start`, `model_call_end`, `final_answer`, `agent_end`
- **AND** every event data payload contains `eventId`, `executionId`, `conversationId`, `traceId`, `requestId`, `createdAt`
- **AND** `eventId` values within the same conversation are strictly monotonically increasing

#### Scenario: No tool call emits minimal sequence
- **WHEN** a user sends a message that does not trigger a tool call
- **THEN** the SSE stream emits: `agent_start`, `model_call_start`, `model_call_end`, `final_answer`, `agent_end`

#### Scenario: Policy deny emits rejected tool_result
- **WHEN** a tool call is denied by policy
- **THEN** the SSE stream emits `tool_result` with `status: "denied"` and does not emit a `tool_call` event for that tool

#### Scenario: REQUIRE_APPROVAL emits approval_requested event
- **WHEN** policy returns `REQUIRE_APPROVAL` for a tool call
- **THEN** the SSE stream emits an `approval_requested` event carrying `toolCallId`, `toolName`, `argumentsRaw`, `reason`, `approvalToken`
- **AND** the SSE stream does not emit a `tool_call` or `tool_result` for that tool until the approval is decided

### Requirement: Frontend SSE Rendering
The frontend SHALL consume the SSE stream and render each event progressively, showing model thinking, tool execution, final answer, pending approvals, and terminal status as they arrive. The frontend MUST tolerate unknown event data fields without breaking parsing.

#### Scenario: Events render in order
- **WHEN** the SSE stream emits events
- **THEN** the frontend displays each step (model call, tool call, tool result, approval requested, final answer) as it arrives without waiting for stream completion

#### Scenario: Unknown fields do not break parsing
- **WHEN** an SSE event data payload contains a field the frontend does not recognize
- **THEN** the frontend ignores that field and continues to render the rest of the event

## ADDED Requirements

### Requirement: Session Events Replay SSE
The agent-runtime SHALL expose `GET /api/v1/sessions/:conversationId/events?last_event_id=...` returning a `text/event-stream` connection that first replays missed events since `last_event_id` and then continues to push live events for the conversation. The connection is a subscriber, not an executor: it does NOT create a new agent execution.

#### Scenario: Replay then live
- **WHEN** a client connects with `last_event_id=conv-1:5` and the latest stored event is `conv-1:8`
- **THEN** the server first emits the events with `eventId` `conv-1:6`, `conv-1:7`, `conv-1:8` in order
- **AND** then continues to emit subsequent events as they are appended

#### Scenario: Connect without last_event_id replays from start
- **WHEN** a client connects without `last_event_id`
- **THEN** the server replays all events available for the conversation from the earliest stored eventId, then continues live

#### Scenario: No new events stays connected
- **WHEN** the conversation has no new events
- **THEN** the connection stays open and emits heartbeats; it does not close

### Requirement: Stream Resync on Cursor Gap
When `last_event_id` references an event that has been evicted or never existed for the conversation, the server SHALL emit a `stream_resync_required` event and then close the connection. The frontend MUST treat this as a signal to refetch the full session via `GET /api/v1/sessions/:conversationId`.

#### Scenario: Cursor too old emits resync
- **WHEN** a client connects with `last_event_id=conv-1:1` but events before `conv-1:6` have been evicted
- **THEN** the server emits one `stream_resync_required` event with `lastAvailableEventId` and closes the connection

### Requirement: Stream Terminal Events
Every SSE stream (main and session events) SHALL emit exactly one terminal event before closing: `stream_done` on normal completion, `stream_error` on a runtime terminal error, or `stream_resync_required` on cursor gap. The terminal event MUST carry `executionId` and (for `stream_error`) the `errorClass` from the `RuntimeTerminalError` enum.

#### Scenario: Normal completion emits stream_done
- **WHEN** the agent execution reaches `FINAL_ANSWER`
- **THEN** the SSE stream emits `stream_done` with `executionId` and `stopReason: "FINAL_ANSWER"` before closing

#### Scenario: Terminal error emits stream_error
- **WHEN** the agent execution fails with `MODEL_ERROR`
- **THEN** the SSE stream emits `stream_error` with `executionId`, `errorClass: "MODEL_ERROR"`, and `errorMessage` before closing

### Requirement: Stream Heartbeat
Every SSE stream SHALL emit a heartbeat comment line (`: heartbeat\n\n`) every 30 seconds when no other events have been emitted, to keep proxies and load balancers from idle-timing-out the connection.

#### Scenario: Idle stream emits heartbeat
- **WHEN** an SSE stream has been open for 30 seconds without any other event
- **THEN** the server emits a heartbeat comment line and the connection stays open
