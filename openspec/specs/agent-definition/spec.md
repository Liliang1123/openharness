# agent-definition Specification

## Purpose
TBD - created by archiving change add-agent-definition-loader. Update Purpose after archive.
## Requirements
### Requirement: Agent Definition Contract
The Agent Runtime SHALL define an `AgentDefinition` contract for project-local declarative agent configuration.

#### Scenario: Valid agent definition
- **GIVEN** a JSON object with `agentId`, `promptRef`, `tools`, and optional `model`
- **WHEN** it is parsed as an `AgentDefinition`
- **THEN** schema validation succeeds

#### Scenario: Invalid prompt reference
- **GIVEN** an agent definition with `promptRef` that is not shaped as `promptId@version`
- **WHEN** it is parsed
- **THEN** schema validation fails closed before runtime use

### Requirement: Agent Definition Loader
The Agent Runtime SHALL load project-local JSON agent definitions from `agent-runtime/agents/` and expose them by `agentId`.

#### Scenario: Load JSON definitions
- **GIVEN** `agent-runtime/agents/` contains one or more valid `.json` agent definition files
- **WHEN** the Agent Definition Loader runs
- **THEN** each definition is available by its `agentId`

#### Scenario: Missing directory uses default definition
- **GIVEN** `agent-runtime/agents/` is absent or empty
- **WHEN** the Agent Definition Loader runs
- **THEN** it returns a default definition that preserves existing runtime behavior

#### Scenario: Duplicate agent id fails closed
- **GIVEN** two definition files contain the same `agentId`
- **WHEN** the Agent Definition Loader runs
- **THEN** loading fails before any agent execution uses an ambiguous definition

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

### Requirement: Agent Definition Runtime Selection
The Agent Runtime SHALL allow a chat request to select an already-loaded Agent Definition by optional `agentId` and SHALL use the selected definition for that agent turn.

#### Scenario: Omitted agent id uses default definition
- **GIVEN** a chat request omits `agentId`
- **WHEN** the Agent Runtime starts the agent turn
- **THEN** it selects the default loaded Agent Definition
- **AND** existing chat behavior is preserved

#### Scenario: Requested agent id selects loaded definition
- **GIVEN** the Agent Definition registry contains an Agent Definition with `agentId` `support-agent`
- **AND** a chat request includes `agentId` `support-agent`
- **WHEN** the Agent Runtime starts the agent turn
- **THEN** it resolves and uses the `support-agent` definition for that turn

#### Scenario: Unknown agent id fails closed
- **GIVEN** a chat request includes an `agentId` that is not present in the loaded Agent Definition registry
- **WHEN** the Agent Runtime handles the request
- **THEN** the request fails before starting an agent execution
- **AND** the runtime does not call the Java model gateway

### Requirement: Agent Definition Prompt Binding
The Agent Runtime SHALL resolve the selected Agent Definition's `promptRef` through the Prompt Registry for each model call in the selected agent turn.

#### Scenario: Selected definition prompt is sent to model gateway
- **GIVEN** a selected Agent Definition references `promptRef` `openharness-default@v1`
- **WHEN** the Agent Runtime calls Java `/api/v1/model/chat`
- **THEN** the first model-call message is the resolved system prompt
- **AND** `ModelChatRequest.meta.promptId` and `ModelChatRequest.meta.promptVersion` identify that selected prompt

#### Scenario: Unknown selected prompt fails closed
- **GIVEN** a selected Agent Definition references a prompt that does not exist in the Prompt Registry
- **WHEN** the Agent Runtime prepares a model call
- **THEN** prompt resolution fails before Java `/api/v1/model/chat` is called

### Requirement: Agent Definition Tool Filtering
The Agent Runtime SHALL use the selected Agent Definition's `tools` list as the per-turn allow-list for model-visible tools and runtime tool-call eligibility.

#### Scenario: Selected definition filters model-visible tools
- **GIVEN** the frozen tool catalog contains `get_current_time` and `echo`
- **AND** the selected Agent Definition has `tools` containing only `echo`
- **WHEN** the Agent Runtime calls Java `/api/v1/model/chat`
- **THEN** the model request tools contain `echo`
- **AND** the model request tools do not contain `get_current_time`

#### Scenario: Default agent preserves current tool exposure
- **GIVEN** a chat request omits `agentId`
- **WHEN** the Agent Runtime prepares a model call using the default Agent Definition
- **THEN** existing default tool exposure is preserved

#### Scenario: Empty tools list exposes no tools
- **GIVEN** the selected Agent Definition has an empty `tools` list
- **WHEN** the Agent Runtime calls Java `/api/v1/model/chat`
- **THEN** the model request tools list is empty

#### Scenario: Disallowed model tool call fails closed
- **GIVEN** the selected Agent Definition allows only `echo`
- **AND** the model returns a tool call named `get_current_time`
- **WHEN** the Agent Runtime processes the tool call
- **THEN** the runtime fails the turn before `beforeToolUse` or tool execution

#### Scenario: Unknown definition tool name is ignored for model visibility
- **GIVEN** the selected Agent Definition lists `unknown_tool`
- **AND** the frozen tool catalog does not contain `unknown_tool`
- **WHEN** the Agent Runtime prepares a model call
- **THEN** `unknown_tool` is not sent to the model
- **AND** runtime startup is not blocked by the missing tool name

### Requirement: Agent Definition Model Request Audit Metadata
The Agent Runtime SHALL include selected Agent Definition audit metadata in each Java model request `meta` without changing model-visible messages.

#### Scenario: Selected agent metadata is sent with model request
- **GIVEN** a chat request selects Agent Definition `support-agent` with `promptRef` `openharness-default@v1`
- **WHEN** the Agent Runtime calls Java `/api/v1/model/chat`
- **THEN** `ModelChatRequest.meta.agentId` is `support-agent`
- **AND** `ModelChatRequest.meta.agentPromptRef` is `openharness-default@v1`

#### Scenario: Tool filtering summary is sent with model request
- **GIVEN** the selected Agent Definition lists tools `echo` and `unknown_tool`
- **AND** the frozen catalog contains only `echo`
- **WHEN** the Agent Runtime calls Java `/api/v1/model/chat`
- **THEN** `ModelChatRequest.meta.agentAllowedTools` contains `echo` and `unknown_tool`
- **AND** `ModelChatRequest.meta.modelVisibleTools` contains only `echo`
- **AND** no tool schemas are duplicated inside the metadata

#### Scenario: Default full exposure mode is explicit
- **GIVEN** a chat request omits `agentId`
- **WHEN** the Agent Runtime calls Java `/api/v1/model/chat` using the built-in default Agent Definition
- **THEN** `ModelChatRequest.meta.agentId` is `default-agent`
- **AND** `ModelChatRequest.meta.agentToolMode` is `default_full`

#### Scenario: Audit metadata is not model-visible content
- **WHEN** the Agent Runtime sends Agent Definition audit metadata in `ModelChatRequest.meta`
- **THEN** the metadata is not appended to `messages`
- **AND** the metadata is not written to stable `HistoryStore` as an agent message

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

