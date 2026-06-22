## MODIFIED Requirements

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
