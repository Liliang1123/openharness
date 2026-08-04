## MODIFIED Requirements

### Requirement: Codex Dynamic Tool Response Lifecycle
The Codex provider SHALL keep an app-server turn and its current `item/tool/call` JSON-RPC request open until TS Runtime supplies a terminal outcome or the turn is cancelled, expires, disconnects irrecoverably, or becomes orphaned by restart. Java SHALL map `ok` to `DynamicToolCallResponse.success=true`; `error`, `rejected`, and `timeout` SHALL map to `success=false` with bounded redacted `inputText` content. After one pending responder receives its terminal response, Java MUST atomically retire that responder before accepting the next distinct pending callback from the same app-server turn. At most one responder may be active at a time, while a sequence of distinct callbacks in the same turn SHALL remain valid after each predecessor becomes terminal.

#### Scenario: Successful result resumes the turn
- **WHEN** TS Runtime submits an `ok` result for the exact pending call
- **THEN** Java sends one successful DynamicToolCallResponse and continues reading the same app-server turn

#### Scenario: Rejection is not success
- **WHEN** policy, approval, parsing, execution, or timeout produces a non-ok outcome
- **THEN** Java sends a failed DynamicToolCallResponse and never represents the outcome as successful execution

#### Scenario: Pending call expires
- **WHEN** the bounded pending-call deadline elapses before a valid terminal submission
- **THEN** Java atomically expires the record, fails the app-server request when writable, interrupts the exact turn, and returns a structured non-fallback error

#### Scenario: Five sequential pending calls remain in one turn
- **WHEN** the app-server emits five distinct pending dynamic tool callbacks sequentially and each predecessor has received one terminal response
- **THEN** Java accepts each callback without classifying it as an overlapping pending call
- **AND** every callback receives exactly one DynamicToolCallResponse
- **AND** the same turn continues until its final model response

#### Scenario: Overlapping pending callback fails closed
- **WHEN** a second callback arrives while the previous responder is still non-terminal
- **THEN** Java returns a redacted protocol failure, terminates or cancels the exact turn, and does not answer either callback twice
- **AND** it does not silently start another provider turn or fall back to another provider
