# prompt-registry Specification

## Purpose
TBD - created by archiving change add-p4b-prompt-registry. Update Purpose after archive.
## Requirements
### Requirement: Versioned Prompt Registry
The Agent Runtime SHALL provide a prompt registry that resolves a versioned prompt template by `promptId` and `version`, including an explicit prompt reference supplied by the selected Agent Definition.

#### Scenario: Default prompt resolves
- **WHEN** no prompt reference is configured
- **THEN** the registry resolves `openharness-default@v1`

#### Scenario: Selected agent definition prompt resolves
- **GIVEN** a selected Agent Definition has `promptRef` `openharness-default@v1`
- **WHEN** the runtime prepares model-call messages for that agent turn
- **THEN** the registry resolves `openharness-default@v1` explicitly for that turn

#### Scenario: Unknown prompt fails closed
- **WHEN** a configured prompt reference does not exist
- **THEN** the runtime fails prompt resolution before calling the Java model gateway

### Requirement: System Prompt Injection
The Agent Runtime SHALL prepend the resolved system prompt to model-call messages without writing it to `HistoryStore`. The system prompt content SHALL remain byte-level static and MUST NOT contain dynamic variables such as date, model name, or working directory.

#### Scenario: Prompt is model visible and static
- **WHEN** an agent execution calls the Java model gateway
- **THEN** the first model-call message has `role: "system"` and contains the resolved static prompt content

#### Scenario: Prompt is not persisted
- **WHEN** the agent execution completes
- **THEN** `HistoryStore` does not contain the injected system prompt message

### Requirement: Prompt Metadata
The Agent Runtime SHALL attach selected prompt metadata to each model request.

#### Scenario: Prompt metadata is sent
- **WHEN** the runtime calls Java `/api/v1/model/chat`
- **THEN** `ModelChatRequest.meta.promptId` and `meta.promptVersion` identify the selected prompt

