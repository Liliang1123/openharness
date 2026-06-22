## ADDED Requirements
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
