# cache-hints Specification

## Purpose
TBD - created by archiving change add-p1a-provider-adapter. Update Purpose after archive.
## Requirements
### Requirement: TS Cache Hint Generation
The agent-runtime SHALL compute `meta.cacheHints` before each model call based on a configurable `cacheStrategy` (off, single, double, adaptive) to return eligible message index positions as `messageIndexFromTail`.

#### Scenario: Double caching strategy generates two hints
- **GIVEN** `cacheStrategy` is set to "double"
- **WHEN** a conversation has 5 messages with no special flags
- **THEN** `cacheHints` contains 2 entries pointing to the last 2 eligible messages by `messageIndexFromTail`

#### Scenario: Single caching strategy generates one hint
- **GIVEN** `cacheStrategy` is set to "single"
- **WHEN** a conversation has 5 messages with no special flags
- **THEN** `cacheHints` contains 1 entry pointing to the last eligible message by `messageIndexFromTail`

#### Scenario: Adaptive strategy scales double based on history length
- **GIVEN** `cacheStrategy` is set to "adaptive"
- **WHEN** context length is below 2000 tokens
- **THEN** `cacheHints` contains only 1 entry to save cache write write-cost
- **WHEN** context length is above 8000 tokens
- **THEN** `cacheHints` contains 2 entries pointing to the last 2 eligible messages for single-step rollback protection

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

