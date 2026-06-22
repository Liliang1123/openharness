## ADDED Requirements
### Requirement: Versioned Prompt Registry
The Agent Runtime SHALL provide a prompt registry that resolves a versioned prompt template by `promptId` and `version`.

#### Scenario: Default prompt resolves
- **WHEN** no prompt reference is configured
- **THEN** the registry resolves `openharness-default@v1`

#### Scenario: Unknown prompt fails closed
- **WHEN** a configured prompt reference does not exist
- **THEN** the runtime fails prompt resolution before calling the Java model gateway

### Requirement: System Prompt Injection
The Agent Runtime SHALL prepend the resolved system prompt to model-call messages without writing it to `HistoryStore`.

#### Scenario: Prompt is model visible
- **WHEN** an agent execution calls the Java model gateway
- **THEN** the first model-call message has `role: "system"` and contains the resolved prompt content

#### Scenario: Prompt is not persisted
- **WHEN** the agent execution completes
- **THEN** `HistoryStore` does not contain the injected system prompt message

### Requirement: Prompt Metadata
The Agent Runtime SHALL attach selected prompt metadata to each model request.

#### Scenario: Prompt metadata is sent
- **WHEN** the runtime calls Java `/api/v1/model/chat`
- **THEN** `ModelChatRequest.meta.promptId` and `meta.promptVersion` identify the selected prompt
