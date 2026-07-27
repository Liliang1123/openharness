## MODIFIED Requirements

### Requirement: SSE Streaming Endpoint
The agent-runtime SHALL expose `POST /api/v1/agent/chat/stream` as `text/event-stream` with two explicit envelopes. Durable lifecycle events MUST carry opaque durable `eventId`, `executionId`, `conversationId`, `traceId`, `requestId`, and `createdAt`, and MUST publish only after commit. Transient `preview_delta` events MAY appear only on the current main connection, MUST carry a connection-local `previewSeq`, MUST NOT carry durable `eventId`, and MUST NOT enter session replay.

#### Scenario: Normal tool flow emits committed lifecycle sequence
- **WHEN** a user message triggers a tool call and completes normally
- **THEN** the stream emits committed lifecycle events in order for agent start, model/tool work, final answer, agent end, and stream done
- **AND** each durable event carries the required identity fields and monotonically increasing durable event identity

#### Scenario: Preview is connection-local
- **WHEN** a provider emits streaming fragments
- **THEN** the main stream may emit ordered `preview_delta` events with `previewSeq`, while session replay never returns them

#### Scenario: Policy deny emits rejected tool result
- **WHEN** a tool call is denied by policy
- **THEN** the durable stream emits a denied tool result and does not claim tool execution occurred

#### Scenario: REQUIRE_APPROVAL exposes approvalId only
- **WHEN** policy returns `REQUIRE_APPROVAL`
- **THEN** the durable `approval_requested` event carries non-sensitive `approvalId`, `toolCallId`, `toolName`, safe argument summary, and reason
- **AND** it carries no raw Java approval token or full tool arguments
- **AND** no tool execution/result event is emitted until a decision commits

### Requirement: Session Events Replay SSE
The agent-runtime SHALL expose `GET /api/v1/sessions/:conversationId/events?last_event_id=...` as a subscriber-only `text/event-stream` for durable events. With `last_event_id`, it replays committed events after that cursor and then switches to live; without it, it replays from the earliest retained event. Within one connection events MUST be ordered without gap or duplicate. Across reconnects delivery SHALL be at-least-once and clients MUST deduplicate by opaque durable `eventId`. Transient previews MUST NOT be replayed.

#### Scenario: Replay then live preserves watermark
- **WHEN** a client supplies a retained cursor and committed events exist after it
- **THEN** the server replays later events in order and switches to live without missing a committed event

#### Scenario: Connect without cursor replays retained history
- **WHEN** a client connects without `last_event_id`
- **THEN** the server replays all retained durable events from the low watermark and continues live

#### Scenario: Reconnect may repeat last durable event
- **WHEN** a connection drops after delivery but before the client persists its cursor
- **THEN** replay may deliver the same eventId again and the client deduplicates it

#### Scenario: Idle replay connection stays open
- **WHEN** no new durable event exists
- **THEN** the connection stays open using heartbeat comments

### Requirement: Stream Resync on Cursor Gap
When a scoped `last_event_id` is below the retained low watermark or unknown for that same tenant, user, and conversation, the server SHALL emit one scoped `stream_resync_required` control event and close. Cross-scope cursors SHALL return no event or existence signal. The frontend MUST refetch the scoped session snapshot after resync.

#### Scenario: Retention gap emits and closes
- **WHEN** a caller supplies a valid scoped cursor older than the low watermark
- **THEN** the server emits one `stream_resync_required` with safe watermark metadata and closes

#### Scenario: Cross-scope cursor discloses nothing
- **WHEN** a cursor belongs to another tenant or user
- **THEN** no event identity or resource existence is disclosed

### Requirement: Stream Terminal Events
When the server closes a main or session-events SSE connection because execution reached terminal state or a cursor gap was detected, it SHALL emit exactly one terminal outcome before its close attempt: durable `stream_done`, durable `stream_error`, or scoped `stream_resync_required`. Client cancellation or transport loss does not guarantee terminal-frame delivery; clients recover through durable replay. `preview_delta` never counts as terminal. Normal/error terminal events carry `executionId`; errors carry `RuntimeTerminalError`. Resync closes immediately after its control event.

#### Scenario: Normal completion emits one terminal event
- **WHEN** execution reaches final answer
- **THEN** the stream emits exactly one durable `stream_done` before closing

#### Scenario: Runtime error emits one terminal event
- **WHEN** execution terminates with a runtime error
- **THEN** the stream emits exactly one durable `stream_error` with its error class before closing

#### Scenario: Restart interruption is replayable
- **WHEN** Runtime restarts during transient streaming
- **THEN** reconciliation commits one `stream_error/EXECUTION_INTERRUPTED`, and reconnect sees it without preview replay
