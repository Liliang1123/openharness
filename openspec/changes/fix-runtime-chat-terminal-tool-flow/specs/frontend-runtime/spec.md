## ADDED Requirements

### Requirement: Interactive Execution Activity Group
The Frontend SHALL project the safe lifecycle events of each execution into one interactive execution activity group. Active model work SHALL be transient. When an execution completes, aborts, or errors, the group SHALL clear all active thinking/tool state, auto-collapse to a terminal summary, and remain expandable to show every safe chronological model/tool state. Repeated tool names MAY be grouped in the collapsed summary but MUST remain individually inspectable when expanded.

#### Scenario: Normal completion clears thinking
- **WHEN** the Frontend receives `model_call_start`, `model_call_end`, `final_answer`, and `stream_done`
- **THEN** the assistant answer remains visible
- **AND** no active thinking state remains
- **AND** the execution activity group is collapsed with a completed summary

#### Scenario: Error is visible and terminal
- **WHEN** the Frontend receives `stream_error` with `errorClass: "MODEL_ERROR"` and safe `upstreamErrorClass: "PROTOCOL_FAILURE"`
- **THEN** active thinking and tool-running state are cleared
- **AND** a persistent terminal summary displays the safe error classes
- **AND** the composer is no longer blocked by stale execution UI state

#### Scenario: Repeated tools are grouped without losing detail
- **WHEN** one execution contains five terminal `read_file` tool activities
- **THEN** the collapsed summary may display `read_file ×5`
- **AND** expanding the group displays five ordered activities with their individual safe statuses

#### Scenario: Replay duplicate does not duplicate activity
- **WHEN** the same durable event id is delivered more than once across SSE reconnect
- **THEN** the Frontend applies it once to the execution activity projection

#### Scenario: Sensitive payloads are excluded
- **WHEN** an event contains raw arguments, tool result content, prompt/reasoning content, headers, bridge identifiers, credentials, provider bodies, or unredacted error text
- **THEN** the activity group neither retains nor renders those fields
- **AND** it uses only allowlisted lifecycle identity, event kind, timing, tool name/id, status, and safe terminal classes
