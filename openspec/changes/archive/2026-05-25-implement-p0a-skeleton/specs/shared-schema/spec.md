## ADDED Requirements

### Requirement: Shared Schema Package
The system SHALL provide a TypeScript package at `packages/shared-schema` exporting zod schemas and TypeScript types for `AgentMessage`, `ReasoningBlock`, `ToolDefinition`, `ToolCall`, `ToolResult`, `CacheHint`, `ModelChatRequest`, `ModelChatResponse`, `ToolCallRequest`, `ToolCallResponse`, `StructuredError`, `TraceEvent`, `ReviewPolicyEvaluateRequest`, `ReviewPolicyEvaluateResponse`, `AskUserRequest`, `AskUserResponse`, and `ConversationLifecycle`.

#### Scenario: Importing shared schemas
- **WHEN** another workspace package imports from `@openharness/shared-schema`
- **THEN** the package exposes both zod schemas and inferred TypeScript types for the P0a contract objects

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
The shared schema SHALL define `ToolCallResponse` as a `status` discriminated union where `status="ok"` cannot contain `error`, and `status` values `error`, `rejected`, and `timeout` must contain `error`.

#### Scenario: Ok response rejects error
- **WHEN** zod parses a tool response with `status: "ok"` and an `error` object
- **THEN** parsing fails

#### Scenario: Failure response requires error
- **WHEN** zod parses a tool response with `status: "error"` and no `error`
- **THEN** parsing fails

### Requirement: Reasoning Blocks Roundtrip
The shared schema SHALL preserve `ReasoningBlock` objects as structured data with unknown provider fields allowed.

#### Scenario: Parsing reasoning block with provider metadata
- **WHEN** zod parses an `AgentMessage` with `reasoningBlocks` containing `type`, `text`, `signature`, `data`, and an unknown provider field
- **THEN** parsing succeeds and preserves the unknown provider field
