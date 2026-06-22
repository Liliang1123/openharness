## ADDED Requirements
### Requirement: Agent Definition Trace Attribution
The agent-runtime SHALL attach the selected Agent Definition `agentId` to TS Runtime trace events emitted during an agent execution.

#### Scenario: Trace events include selected agent id
- **GIVEN** a chat request selects Agent Definition `support-agent`
- **WHEN** the Agent Runtime emits trace events for that execution
- **THEN** each TS Runtime trace event includes top-level `agentId` equal to `support-agent`

#### Scenario: Default trace events include default agent id
- **GIVEN** a chat request omits `agentId`
- **WHEN** the Agent Runtime emits trace events for that execution
- **THEN** each TS Runtime trace event includes top-level `agentId` equal to `default-agent`
