## ADDED Requirements

### Requirement: Operator-Visible Chat Lifecycle Logs

The TS Runtime SHALL emit one structured stdout lifecycle record after a chat execution is admitted and one structured stdout lifecycle record when that execution reaches a terminal state. The records MUST allow an operator to correlate the execution by `conversationId`, `requestId`, `traceId`, and `executionId`, MUST cover both synchronous and streaming chat through the shared execution lifecycle, and MUST NOT change chat API, SSE, trace-ingestion, event-store, or persistence semantics.

The accepted record MUST contain only a schema version, fixed accepted event name, timestamp, and the four correlation identifiers. The terminal record MAY additionally contain only terminal status, stop reason, and non-negative duration. The Runtime MUST construct records from an explicit field allowlist and MUST NOT include message or answer text, prompts, reasoning, tool data, headers, tenant/user identity, service tokens, provider credentials, OAuth material, arbitrary error text, or spread metadata. Serialization or stdout write failure MUST NOT fail, retry, cancel, or otherwise alter the chat execution.

#### Scenario: Synchronous chat is correlated in Runtime logs

- **WHEN** a synchronous chat execution is admitted and reaches `FINAL_ANSWER`
- **THEN** Runtime stdout contains exactly one accepted and one terminal record carrying the same conversation, request, trace, and execution identifiers
- **AND** the terminal record carries the terminal status, `FINAL_ANSWER`, and a non-negative duration

#### Scenario: Streaming chat uses the same lifecycle projection

- **WHEN** a streaming chat execution is admitted and later reaches a terminal state after the client remains connected or disconnects
- **THEN** the shared runner emits the same accepted and terminal record contract independently of the HTTP connection lifetime

#### Scenario: Terminal failure remains locatable and redacted

- **WHEN** an admitted execution ends with a Runtime terminal error
- **THEN** the terminal record carries the allowlisted identifiers, terminal status, classified stop reason, and duration
- **AND** it contains no arbitrary exception message, request content, response content, tool content, identity header, or credential material

#### Scenario: Lifecycle log sink failure is non-blocking

- **WHEN** JSON serialization or the stdout sink fails while emitting an accepted or terminal record
- **THEN** the execution continues under existing lifecycle rules and its API, SSE, durable event, and terminal state semantics remain unchanged
