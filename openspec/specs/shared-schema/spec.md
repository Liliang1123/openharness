# shared-schema Specification

## Purpose
TBD - created by archiving change implement-p0a-skeleton. Update Purpose after archive.
## Requirements
### Requirement: Shared Schema Package
The system SHALL provide a TypeScript package at `packages/shared-schema` exporting zod schemas and TypeScript types for `AgentMessage`, `ReasoningBlock`, `ToolDefinition`, `ToolCall`, `ToolResult`, `ToolResultProvenance`, `CacheHint`, `ModelChatRequest`, `ModelChatResponse`, `ToolCallRequest`, `ToolCallResponse`, `StructuredError`, `TraceEvent`, `ReviewPolicyEvaluateRequest`, `ReviewPolicyEvaluateResponse`, `AskUserRequest`, `AskUserResponse`, and `ConversationLifecycle`. `TraceEvent` SHALL remain backward compatible with existing events and SHALL allow optional trace-tree attributes for parent/subagent execution relationships.

#### Scenario: Importing shared schemas
- **WHEN** another workspace package imports from `@openharness/shared-schema`
- **THEN** the package exposes both zod schemas and inferred TypeScript types for the P0a contract objects

#### Scenario: Trace tree attributes parse without breaking old events
- **WHEN** zod parses a `TraceEvent` whose `attributes` include `traceNodeKind`, `executionId`, `parentExecutionId`, `childExecutionId`, `childConversationId`, `skillName`, and `toolCallId`
- **THEN** parsing succeeds and preserves those attributes
- **AND** parsing a historical `TraceEvent` without those attributes still succeeds

### Requirement: Canonical Tool Call Fields
The shared schema SHALL model provider tool calls with `ToolCall.argumentsRaw` as a string and SHALL model Java tool execution requests with `ToolCallRequest.arguments` as `Record<string, unknown>`.

#### Scenario: Parsing provider tool call and tool execute request
- **WHEN** zod parses a model-returned tool call containing `argumentsRaw: "{\"timezone\":\"Asia/Shanghai\"}"`
- **THEN** the `ToolCall` parse succeeds
- **AND** a `ToolCallRequest` using `arguments: { "timezone": "Asia/Shanghai" }` also parses successfully

### Requirement: Usage Cost Units
The shared schema SHALL expose optional `Usage.costUsdMicros` and SHALL NOT expose `Usage.costUsd`.

#### Scenario: Parsing usage with micros cost
- **WHEN** zod parses a `ModelChatResponse` with `usage.costUsdMicros`
- **THEN** parsing succeeds and preserves the integer micros value

### Requirement: Tool Call Response Discriminated Union
The shared schema SHALL define `ToolCallResponse` as a `status` discriminated union where `status="ok"` cannot contain `error`, and `status` values `error`, `rejected`, and `timeout` must contain `error`. `ToolCallResponse` MAY include `provenance: "trusted" | "untrusted"` to classify the trust level of returned tool data.

#### Scenario: Ok response rejects error
- **WHEN** zod parses a tool response with `status: "ok"` and an `error` object
- **THEN** parsing fails

#### Scenario: Failure response requires error
- **WHEN** zod parses a tool response with `status: "error"` and no `error`
- **THEN** parsing fails

#### Scenario: Tool response preserves provenance
- **WHEN** zod parses a successful tool response with `provenance: "untrusted"`
- **THEN** parsing succeeds and preserves the provenance value

### Requirement: Reasoning Blocks Roundtrip
The shared schema SHALL preserve `ReasoningBlock` objects as structured data with unknown provider fields allowed.

#### Scenario: Parsing reasoning block with provider metadata
- **WHEN** zod parses an `AgentMessage` with `reasoningBlocks` containing `type`, `text`, `signature`, `data`, and an unknown provider field
- **THEN** parsing succeeds and preserves the unknown provider field

### Requirement: Tool Result Provenance
The shared schema SHALL define `ToolResultProvenance` as exactly `trusted` or `untrusted`. `AgentMessage` MAY carry internal `toolName` and `toolResultProvenance` fields for `role: "tool"` messages so the runtime can persist trust state without relying on content parsing.

#### Scenario: Tool message carries internal provenance
- **WHEN** zod parses an `AgentMessage` with `role: "tool"`, `toolName: "read_file"`, and `toolResultProvenance: "untrusted"`
- **THEN** parsing succeeds and preserves those fields

#### Scenario: Invalid provenance is rejected
- **WHEN** zod parses a tool response with `provenance: "unknown"`
- **THEN** parsing fails

### Requirement: Policy Context Carries Untrusted State
The shared schema SHALL allow `ReviewPolicyEvaluateRequest.context` to carry `untrustedToolOutputSinceLastUser?: boolean` and `toolPermissions?: Record<string, "safe" | "sensitive" | "destructive">`.

#### Scenario: Policy context includes untrusted state and permissions
- **WHEN** zod parses a policy evaluate request whose context contains `untrustedToolOutputSinceLastUser: true` and `toolPermissions.submit_payment: "sensitive"`
- **THEN** parsing succeeds and preserves those fields

### Requirement: Model Chat Request Context Metadata
The shared schema SHALL define `ModelChatRequest.meta` as the cross-runtime metadata container for model calls, including optional cache hints, catalog identifiers, provider hints, and ContextBuilder metadata.

#### Scenario: Context metadata is accepted
- **WHEN** a model chat request includes `meta.context`
- **THEN** shared schema validation accepts builder name, selected message count, estimated tokens, budget tokens, layer names, and truncation status

#### Scenario: Requests without context metadata remain valid
- **WHEN** a model chat request omits `meta.context`
- **THEN** shared schema validation still accepts the request

### Requirement: Prompt Template Schema
The shared schema SHALL define a prompt template contract with `promptId`, `version`, `role`, `content`, and optional `description`.

#### Scenario: Prompt template parses
- **WHEN** zod parses a prompt template with `role: "system"`
- **THEN** parsing succeeds and preserves `promptId`, `version`, and `content`

### Requirement: Model Chat Prompt Metadata
The shared schema SHALL allow `ModelChatRequest.meta` to carry `promptId` and `promptVersion`.

#### Scenario: Prompt metadata parses
- **WHEN** zod parses a model chat request whose metadata includes `promptId` and `promptVersion`
- **THEN** parsing succeeds and preserves both values

### Requirement: Tool Definition Protocol Metadata
The shared schema SHALL allow `ToolDefinition.protocol` to identify reserved harness protocol tools.

#### Scenario: Protocol metadata parses
- **WHEN** zod parses a tool definition with `protocol: "read_file"`
- **THEN** parsing succeeds and preserves the protocol value

### Requirement: Memory Fact Schema
The shared schema package SHALL define a Zod schema for long-term memory facts.

#### Scenario: Parse a valid memory fact
- **GIVEN** a memory fact containing IDs, scope, content, tags, and timestamps
- **WHEN** it is parsed by the shared schema
- **THEN** the parsed value preserves the memory metadata

### Requirement: Eval Case Schema
The shared schema package SHALL define a Zod schema for eval replay cases whose `expectedStopReason` accepts all Runtime terminal reasons, including `EXECUTION_TIMEOUT` and `EXECUTION_INTERRUPTED`, so recovery qualification can be expressed without bypassing schema validation.

#### Scenario: Parse interrupted recovery expectation
- **WHEN** an eval case uses `expectedStopReason: "EXECUTION_INTERRUPTED"`
- **THEN** schema parsing succeeds and preserves the stop reason

#### Scenario: Preserve execution timeout expectation
- **WHEN** an eval case uses `expectedStopReason: "EXECUTION_TIMEOUT"`
- **THEN** schema parsing continues to succeed

### Requirement: Memory Management API Schemas
The shared schema package SHALL define Zod schemas and TypeScript types for Memory Management API list/search/upsert/delete request and response payloads.

#### Scenario: Parse memory list response
- **GIVEN** a response containing scoped memory facts
- **WHEN** the response is parsed by the shared schema
- **THEN** parsing succeeds and preserves the returned `MemoryFact` objects

#### Scenario: Parse memory search query
- **GIVEN** a search request containing a literal query and optional tags
- **WHEN** the request is parsed by the shared schema
- **THEN** parsing succeeds and preserves the query and tag filters

#### Scenario: Parse memory upsert request
- **GIVEN** an upsert request containing optional `memoryId`, content, optional tags, and optional `agentId`
- **WHEN** the request is parsed by the shared schema
- **THEN** parsing succeeds without requiring tenant/user scope in the body

#### Scenario: Reject client-controlled memory scope
- **GIVEN** an upsert request body includes `tenantId`, `userId`, `createdAt`, or `updatedAt`
- **WHEN** the request is parsed by the shared schema
- **THEN** parsing fails because scope and audit timestamps are controlled by the runtime

#### Scenario: Parse memory delete response
- **GIVEN** a delete response contains `memoryId` and `deleted`
- **WHEN** the response is parsed by the shared schema
- **THEN** parsing succeeds and preserves whether the scoped fact was deleted

### Requirement: Model Chat Agent Definition Metadata
The shared schema SHALL allow `ModelChatRequest.meta` to carry optional selected Agent Definition audit metadata without requiring it for backward compatibility.

#### Scenario: Agent definition metadata parses
- **WHEN** zod parses a model chat request whose metadata includes `agentId`, `agentPromptRef`, `agentToolMode`, `agentAllowedTools`, and `modelVisibleTools`
- **THEN** parsing succeeds and preserves those fields

#### Scenario: Requests without agent definition metadata remain valid
- **WHEN** zod parses a model chat request whose metadata omits Agent Definition metadata
- **THEN** parsing still succeeds

#### Scenario: Invalid agent tool mode is rejected
- **WHEN** zod parses a model chat request whose metadata has an unsupported `agentToolMode`
- **THEN** parsing fails

### Requirement: Runtime Progress Snapshot Schema
The shared schema SHALL define `RuntimeProgressSnapshot` as a safe frontend-consumable projection of one agent execution's progress. The snapshot SHALL include identifiers, execution status, timing fields, loop counters, current activity, optional safe activity details, and a bounded list of recent safe events. The schema MUST NOT require or expose prompt content, skill content, tool output bodies, full tool arguments, authorization headers, or provider credentials.

#### Scenario: Parse active progress snapshot
- **WHEN** zod parses a runtime progress snapshot for a `running` execution with `currentActivity: "model_call"` and `currentStep: 2`
- **THEN** parsing succeeds and preserves identifiers, status, timing, counters, and activity fields

#### Scenario: Reject invalid progress status
- **WHEN** zod parses a runtime progress snapshot with status `paused_unknown`
- **THEN** parsing fails

#### Scenario: Snapshot does not carry sensitive payload fields
- **WHEN** a runtime progress snapshot is produced for frontend display
- **THEN** it contains safe metadata such as event names, step indexes, tool names, skill names, execution IDs, statuses, timing, and terminal class
- **AND** it does not contain prompt content, skill markdown content, tool output bodies, full tool arguments, authorization headers, or provider credentials

### Requirement: Durable And Transient SSE Wire Union
The shared schema package SHALL define a discriminated SSE wire-event union with mutually exclusive durable and transient variants. A durable `SessionEvent` MUST require `eventId`, `tenantId`, `userId`, `conversationId`, `executionId`, `traceId`, `requestId`, `createdAt`, kind, and data. A transient `PreviewDeltaEvent` MUST require kind `preview_delta`, connection-local positive `previewSeq`, execution/conversation identity, and preview data, and MUST reject durable `eventId`. Making `eventId` merely optional on one shared shape is forbidden.

#### Scenario: Parse durable event with owner scope
- **WHEN** a durable session event contains eventId and complete tenant/user/conversation ownership
- **THEN** the durable union branch parses successfully

#### Scenario: Reject durable event without userId
- **WHEN** a durable session event omits userId
- **THEN** schema parsing fails

#### Scenario: Parse transient preview
- **WHEN** a preview_delta contains previewSeq and no eventId
- **THEN** the transient union branch parses successfully

#### Scenario: Reject preview carrying durable cursor
- **WHEN** a preview_delta contains eventId
- **THEN** schema parsing fails

### Requirement: Shared Runtime Terminal Error Schema
The shared runtime terminal-error schema SHALL preserve all existing terminal classes and include `EXECUTION_INTERRUPTED` for restart reconciliation. Runtime, Frontend, session detail, SSE, trace, and eval schemas MUST use the same terminal vocabulary.

#### Scenario: Parse interrupted terminal event
- **WHEN** a durable stream error contains `EXECUTION_INTERRUPTED`
- **THEN** shared schema parsing succeeds and Frontend-visible types preserve that class

