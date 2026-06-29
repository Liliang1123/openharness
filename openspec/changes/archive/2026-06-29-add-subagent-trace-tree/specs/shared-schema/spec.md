## MODIFIED Requirements
### Requirement: Shared Schema Package
The system SHALL provide a TypeScript package at `packages/shared-schema` exporting zod schemas and TypeScript types for `AgentMessage`, `ReasoningBlock`, `ToolDefinition`, `ToolCall`, `ToolResult`, `ToolResultProvenance`, `CacheHint`, `ModelChatRequest`, `ModelChatResponse`, `ToolCallRequest`, `ToolCallResponse`, `StructuredError`, `TraceEvent`, `ReviewPolicyEvaluateRequest`, `ReviewPolicyEvaluateResponse`, `AskUserRequest`, `AskUserResponse`, and `ConversationLifecycle`. `TraceEvent` SHALL remain backward compatible with existing events and SHALL allow optional trace-tree attributes for parent/subagent execution relationships.

#### Scenario: Importing shared schemas
- **WHEN** another workspace package imports from `@openharness/shared-schema`
- **THEN** the package exposes both zod schemas and inferred TypeScript types for the P0a contract objects

#### Scenario: Trace tree attributes parse without breaking old events
- **WHEN** zod parses a `TraceEvent` whose `attributes` include `traceNodeKind`, `executionId`, `parentExecutionId`, `childExecutionId`, `childConversationId`, `skillName`, and `toolCallId`
- **THEN** parsing succeeds and preserves those attributes
- **AND** parsing a historical `TraceEvent` without those attributes still succeeds
