# context-builder Specification

## Purpose
TBD - created by archiving change add-p4a-context-builder. Update Purpose after archive.
## Requirements
### Requirement: Layered Model Context Assembly
The Agent Runtime SHALL build model-call messages through a ContextBuilder pipeline using explicit layers instead of sending raw full history directly.

#### Scenario: Compressed summary is retained
- **WHEN** stable history contains a message marked `compressedSummary`
- **THEN** ContextBuilder includes that summary before selected recent conversation messages

#### Scenario: Recent messages are selected under budget
- **WHEN** stable history exceeds the configured model-context token budget
- **THEN** ContextBuilder selects the newest stable messages that fit the remaining budget
- **AND** preserves chronological order in the selected output

#### Scenario: Newest oversized message fallback
- **WHEN** the newest stable message alone exceeds the configured budget
- **THEN** ContextBuilder still includes that newest message
- **AND** marks the context as truncated

#### Scenario: Select retrieved memory facts
- **GIVEN** scoped memory facts are provided for the current turn
- **WHEN** the ContextBuilder builds model input with memory retrieval enabled
- **THEN** it includes the memory facts as a system context message
- **AND** `meta.context.layers` includes `memory_retrieval`

### Requirement: Context Selection Metadata
The Agent Runtime SHALL attach ContextBuilder metadata for all selected context layers to each model request.

#### Scenario: Metadata reports selected context
- **WHEN** ContextBuilder builds model-call messages
- **THEN** the model request metadata includes the builder name, selected message count, estimated token count, budget, layer names, and truncation status

#### Scenario: Memory consumes context budget
- **GIVEN** retrieved memory facts and recent messages exceed the model context budget
- **WHEN** the ContextBuilder builds model input
- **THEN** memory facts count toward `estimatedTokens`
- **AND** lower-priority recent messages may be truncated
- **AND** `meta.context.truncated` is true

### Requirement: Cache Hints Use Selected Context
The Agent Runtime SHALL compute cache hints after ContextBuilder selection.

#### Scenario: Hints match selected payload
- **WHEN** ContextBuilder truncates older history before a model call
- **THEN** cache hint `messageIndexFromTail` values refer to positions in the selected model-call messages

### Requirement: Session Context Message Injection
The Agent Runtime SHALL generate a dynamic `[session context]` user message containing high-frequency variables (current date, model name, OS, and working directory) and inject it into the message stream immediately following the System Prompt.

#### Scenario: Dynamic context injected on startup
- **GIVEN** a new session is started
- **WHEN** the agent loop builds the model context
- **THEN** it generates a user message containing OS, today's date, model, and directory
- **AND** marks it as `systemInjected: true` and `transient: true`
- **AND** prepends it to the history list after the System Prompt message

