## ADDED Requirements

### Requirement: Codex Pending Tool Event Pairing
For every Codex pending dynamic tool call, the Agent Runtime SHALL commit one logical durable terminal `tool_result` carrying only safe metadata. An allowed call that proceeds to execution SHALL first commit one durable `tool_call` with the same `toolCallId`; a denied call MUST NOT emit a `tool_call` that claims execution occurred. Event-only terminal feedback SHALL remain durable even when the dynamic result is intentionally excluded from stable model history because the app-server owns the in-flight turn. Runtime MUST commit the pending call's terminal tool feedback before any execution-level `stream_done` or `stream_error`.

#### Scenario: Five sequential allowed calls are paired
- **WHEN** one Codex turn produces five sequential allowed pending tool calls and then a final answer
- **THEN** the durable event log contains five logical `tool_call` events and five matching logical `tool_result` events
- **AND** each pair uses the same `toolCallId`
- **AND** all five results precede the execution terminal event

#### Scenario: Denied pending call does not claim execution
- **WHEN** policy rejects a Codex pending dynamic tool call
- **THEN** Runtime commits one denied or rejected `tool_result` for that `toolCallId`
- **AND** it does not commit a `tool_call` that claims the tool ran

#### Scenario: Provider continuation fails after tool result
- **WHEN** a tool completed and its safe result was committed but the same Codex turn then fails with a provider protocol error
- **THEN** Runtime preserves the tool result and commits exactly one `stream_error`
- **AND** the terminal event uses the existing Runtime error class with only safe upstream classification metadata
- **AND** Runtime does not execute the tool again or start an uncorrelated turn

#### Scenario: Replay preserves logical pairing
- **WHEN** a client reconnects and at-least-once replay repeats a previously delivered event id
- **THEN** the event store still contains one logical call/result record per event id
- **AND** the client can deduplicate without losing a terminal tool outcome

#### Scenario: Tool feedback is data-minimized
- **WHEN** Runtime commits pending tool lifecycle events
- **THEN** the events exclude raw arguments, result content, prompt/reasoning content, headers, bridge identifiers, OAuth values, authorization values, and provider response bodies
