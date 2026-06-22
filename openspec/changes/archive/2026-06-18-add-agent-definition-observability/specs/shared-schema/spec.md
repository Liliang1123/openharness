## ADDED Requirements
### Requirement: Model Chat Agent Definition Metadata
The shared schema SHALL allow `ModelChatRequest.meta` to carry optional selected Agent Definition audit metadata without requiring it for backward compatibility.

#### Scenario: Agent definition metadata parses
- **WHEN** zod parses a model chat request whose metadata includes `agentId`, `agentPromptRef`, `agentToolMode`, `agentAllowedTools`, and `modelVisibleTools`
- **THEN** parsing succeeds and preserves those fields

#### Scenario: Requests without agent definition metadata remain valid
- **WHEN** zod parses a model chat request whose metadata omits Agent Definition metadata
- **THEN** parsing still succeeds

#### Scenario: Invalid agent tool mode is rejected
- **WHEN** zod parses a model chat request whose metadata has an unsupported `agentToolMode`
- **THEN** parsing fails
