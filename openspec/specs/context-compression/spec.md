# context-compression Specification

## Purpose
TBD - created by archiving change add-p1b-persistence. Update Purpose after archive.
## Requirements
### Requirement: Insert-then-Compress
The agent-runtime SHALL compress long conversation history when estimated token count exceeds a configurable threshold, using the Insert-then-Compress strategy.

#### Scenario: Compression triggered by threshold
- **WHEN** a conversation's estimated token count exceeds the threshold (default 8000 tokens)
- **THEN** the agent-runtime inserts a compression instruction, calls the compress endpoint, and replaces old messages with a summary

#### Scenario: Summary format
- **WHEN** compression produces a summary
- **THEN** the summary message has `role: "user"` and `compressedSummary: true`

#### Scenario: Cache hints recalculated after compression
- **WHEN** compression removes messages that were targeted by cacheHints
- **THEN** the next model call recalculates cacheHints based on the new message list

### Requirement: Compress Endpoint
The Java backend SHALL expose `POST /api/v1/model/compress` that accepts messages and returns a summary string using a configured low-cost model.

#### Scenario: Compress returns summary
- **WHEN** the compress endpoint receives a list of messages
- **THEN** it returns a JSON response with a `summary` string field

#### Scenario: Compress uses configured model
- **WHEN** the compress endpoint is called
- **THEN** it uses the provider adapter with the model specified in `openharness.compression-model` config

