## MODIFIED Requirements
### Requirement: Agent Definition Boundaries
The Agent Definition Loader SHALL remain local and deterministic in v0 and SHALL NOT require SDK, Frontend UI, Java Backend, remote CRUD APIs, YAML parsing, hot reload, or tenant-scoped dynamic definitions.

#### Scenario: Loader runs without external services
- **WHEN** the runtime initializes agent definitions
- **THEN** loading completes using local filesystem JSON files only
- **AND** no Java Backend, Frontend, remote API, SDK package, YAML parser, or provider credential is required

#### Scenario: Model field is a Java-routed logical model selection
- **GIVEN** an agent definition includes `model`
- **WHEN** the definition is loaded
- **THEN** the value is retained as the logical model id for runtime model calls
- **AND** Java model router configuration, fallback behavior, provider adapter selection, and provider credentials remain owned by Java Backend

## ADDED Requirements
### Requirement: Agent Definition Model Selection
The Agent Runtime SHALL use the selected Agent Definition's optional `model` value as the logical model id in each Java model gateway request for that selected agent turn.

#### Scenario: Selected definition model is sent to model gateway
- **GIVEN** a selected Agent Definition has `model` `fast-model`
- **WHEN** the Agent Runtime calls Java `/api/v1/model/chat`
- **THEN** `ModelChatRequest.model` is `fast-model`

#### Scenario: Omitted definition model uses default logical model
- **GIVEN** the selected Agent Definition omits `model`
- **WHEN** the Agent Runtime calls Java `/api/v1/model/chat`
- **THEN** `ModelChatRequest.model` remains the default logical model

#### Scenario: Runtime does not validate Java route existence
- **GIVEN** a selected Agent Definition has `model` `unknown-logical-model`
- **WHEN** the Agent Runtime prepares the Java model request
- **THEN** it forwards `unknown-logical-model` as `ModelChatRequest.model`
- **AND** route resolution or fallback remains Java Backend behavior
