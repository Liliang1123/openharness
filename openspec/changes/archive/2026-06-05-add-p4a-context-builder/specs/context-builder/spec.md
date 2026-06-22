## ADDED Requirements
### Requirement: Layered Model Context Assembly
The Agent Runtime SHALL build model-call messages through a ContextBuilder pipeline instead of sending raw full history directly.

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

### Requirement: Context Selection Metadata
The Agent Runtime SHALL attach ContextBuilder metadata to each model request.

#### Scenario: Metadata reports selected context
- **WHEN** ContextBuilder builds model-call messages
- **THEN** the model request metadata includes the builder name, selected message count, estimated token count, budget, layer names, and truncation status

### Requirement: Cache Hints Use Selected Context
The Agent Runtime SHALL compute cache hints after ContextBuilder selection.

#### Scenario: Hints match selected payload
- **WHEN** ContextBuilder truncates older history before a model call
- **THEN** cache hint `messageIndexFromTail` values refer to positions in the selected model-call messages
