## MODIFIED Requirements

### Requirement: Shared Schema Package
The system SHALL provide a TypeScript package at `packages/shared-schema` exporting zod schemas and TypeScript types for `AgentMessage`, `ReasoningBlock`, `ToolDefinition`, `ToolCall`, `ToolResult`, `ToolResultProvenance`, `CacheHint`, `ModelChatRequest`, `ModelChatResponse`, `ToolCallRequest`, `ToolCallResponse`, `StructuredError`, `TraceEvent`, `ReviewPolicyEvaluateRequest`, `ReviewPolicyEvaluateResponse`, `AskUserRequest`, `AskUserResponse`, and `ConversationLifecycle`.

#### Scenario: Importing shared schemas
- **WHEN** another workspace package imports from `@openharness/shared-schema`
- **THEN** the package exposes both zod schemas and inferred TypeScript types for the P0a contract objects

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

## ADDED Requirements

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
