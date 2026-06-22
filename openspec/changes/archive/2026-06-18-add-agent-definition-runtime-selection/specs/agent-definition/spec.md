## ADDED Requirements
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
