## ADDED Requirements
### Requirement: Session Context Message Injection
The Agent Runtime SHALL generate a dynamic `[session context]` user message containing high-frequency variables (current date, model name, OS, and working directory) and inject it into the message stream immediately following the System Prompt.

#### Scenario: Dynamic context injected on startup
- **GIVEN** a new session is started
- **WHEN** the agent loop builds the model context
- **THEN** it generates a user message containing OS, today's date, model, and directory
- **AND** marks it as `systemInjected: true` and `transient: true`
- **AND** prepends it to the history list after the System Prompt message
