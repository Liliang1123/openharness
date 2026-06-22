## ADDED Requirements

### Requirement: TS Cache Hint Generation
The agent-runtime SHALL compute `meta.cacheHints` before each model call, selecting the last 2 eligible messages (skipping systemInjected, transient, and compressionInstruction messages) and expressing their positions as `messageIndexFromTail`.

#### Scenario: Normal conversation generates hints
- **WHEN** a conversation has 5 messages with no special flags
- **THEN** `cacheHints` contains 2 entries pointing to the last 2 messages by `messageIndexFromTail`

#### Scenario: Transient messages are skipped
- **WHEN** the last message is marked `transient: true`
- **THEN** `cacheHints` skips it and selects the next eligible message

### Requirement: Anthropic Cache Control Rendering
The Java Anthropic adapter SHALL convert `meta.cacheHints[].messageIndexFromTail` into Anthropic-format `cache_control: {"type": "ephemeral"}` on the corresponding message or content block in the outgoing API request.

#### Scenario: Cache hint applied to tool_result block
- **WHEN** a cacheHint with `scope: "tool_result_block"` targets a tool result message
- **THEN** the Anthropic adapter adds `cache_control` to that specific content block

#### Scenario: Cache hint applied to message level
- **WHEN** a cacheHint with `scope: "message"` targets a user message
- **THEN** the Anthropic adapter adds `cache_control` to the last content block of that message

### Requirement: OpenAI-Compatible Adapter Ignores Cache Hints
The OpenAI-compatible adapter SHALL ignore `meta.cacheHints` without error, as the protocol does not support cache control directives.

#### Scenario: Cache hints present but provider is OpenAI-compatible
- **WHEN** `meta.cacheHints` is non-empty and the provider is OpenAI-compatible
- **THEN** the adapter proceeds normally without adding any cache-related fields to the request
