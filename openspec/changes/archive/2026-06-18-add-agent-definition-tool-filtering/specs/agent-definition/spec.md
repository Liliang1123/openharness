## ADDED Requirements
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
