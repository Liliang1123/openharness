## ADDED Requirements
### Requirement: Agent runtime SHALL emit trace-tree metadata for subagent executions

When a forked skill starts a subagent, the TS Runtime MUST emit trace events that allow consumers to reconstruct the parent execution and child execution relationship. Subagent trace events MUST include stable attributes for `traceNodeKind`, `executionId`, `parentExecutionId`, `childExecutionId`, `childConversationId`, `skillName`, and `toolCallId`. The runtime MUST NOT include child system prompt content, raw sensitive tool output, or provider credentials in trace attributes.

#### Scenario: Subagent start event links parent and child
- **WHEN** a parent execution dispatches a forked skill through `SubagentDispatcher`
- **THEN** a trace event is emitted with `traceNodeKind: "subagent_execution"`
- **AND** the event attributes include the parent `executionId`, `childExecutionId`, `childConversationId`, `skillName`, and `toolCallId`
- **AND** the event does not contain the child system prompt or raw tool output

#### Scenario: Subagent terminal event exposes outcome and cost
- **WHEN** a subagent completes, fails, is denied, aborts, or times out
- **THEN** the runtime emits a terminal subagent trace event with status, terminal classification, duration, and Java-provided `costUsdMicros` when available
- **AND** missing usage data does not block the terminal trace event

### Requirement: Agent runtime SHALL forward key trace-tree events to Java trace ingestion

The TS Runtime MUST post key parent/subagent trace-tree events to Java Backend `POST /api/v1/trace/events` using the same service auth and trace headers as other Java calls. Trace ingestion failure MUST be non-blocking for the agent execution and MUST be observable as a local warning or trace attribute.

#### Scenario: Trace tree event reaches Java Gateway
- **WHEN** the runtime emits a subagent start or terminal trace event
- **THEN** it posts the event to Java `/api/v1/trace/events`
- **AND** the posted event carries the same `X-Trace-Id`, `X-Request-Id`, `X-User-Id`, and `X-Tenant-Id` context used by the execution

#### Scenario: Trace ingestion failure does not fail the agent turn
- **WHEN** Java trace ingestion is temporarily unavailable
- **THEN** the agent execution continues according to existing runtime rules
- **AND** the failure is recorded without exposing service tokens
