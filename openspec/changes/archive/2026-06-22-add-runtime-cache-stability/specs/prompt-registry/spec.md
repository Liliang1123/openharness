## MODIFIED Requirements
### Requirement: System Prompt Injection
The Agent Runtime SHALL prepend the resolved system prompt to model-call messages without writing it to `HistoryStore`. The system prompt content SHALL remain byte-level static and MUST NOT contain dynamic variables such as date, model name, or working directory.

#### Scenario: Prompt is model visible and static
- **WHEN** an agent execution calls the Java model gateway
- **THEN** the first model-call message has `role: "system"` and contains the resolved static prompt content

#### Scenario: Prompt is not persisted
- **WHEN** the agent execution completes
- **THEN** `HistoryStore` does not contain the injected system prompt message
