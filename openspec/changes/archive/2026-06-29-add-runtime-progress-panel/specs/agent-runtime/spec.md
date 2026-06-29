## ADDED Requirements
### Requirement: Runtime Progress Snapshot Derivation
The agent-runtime SHALL derive `RuntimeProgressSnapshot` from existing `RuntimeEventStore` events and `ExecutionStateStore` state without introducing a second execution lifecycle model. The derived snapshot SHALL summarize the latest known status, current step, max observed step, model call count, tool call count, subagent call count, current activity, pending approval state, terminal reason, and recent safe events for one execution.

#### Scenario: Running model call is summarized
- **WHEN** an execution has emitted `agent_start`, `model_call_start`, and no matching terminal event
- **THEN** the derived progress snapshot has status `running`, `currentActivity: "model_call"`, and the observed step index

#### Scenario: Waiting approval is summarized
- **WHEN** an execution state is `waiting_approval` and the event log contains an `approval_requested` event
- **THEN** the derived progress snapshot has status `waiting_approval`, `currentActivity: "waiting_approval"`, and safe pending approval metadata

#### Scenario: Terminal error is summarized
- **WHEN** an execution emits `stream_error` with `errorClass: "TOOL_ERROR"`
- **THEN** the derived progress snapshot has status `errored`, `currentActivity: "terminal"`, and terminal class `TOOL_ERROR`

#### Scenario: Sensitive payloads are excluded
- **WHEN** progress is derived from events that include tool arguments, tool outputs, prompt-derived content, or authorization-bearing request context
- **THEN** the progress snapshot excludes those payloads and only exposes safe metadata

### Requirement: Session Detail Includes Runtime Progress
The agent-runtime SHALL include `runtimeProgress` in `GET /api/v1/sessions/:conversationId` when an active or recently terminal execution can be associated with the session. The response MUST remain backward compatible for clients that ignore this field.

#### Scenario: Active session returns progress
- **WHEN** a client fetches session detail for a conversation with an active execution
- **THEN** the response includes `activeExecution` and `runtimeProgress` for the same `executionId`

#### Scenario: Session without execution remains compatible
- **WHEN** a client fetches session detail for a conversation with messages but no known active or recent execution
- **THEN** the response remains valid and may omit `runtimeProgress`
