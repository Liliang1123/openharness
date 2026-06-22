## ADDED Requirements
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
