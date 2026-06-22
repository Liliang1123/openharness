## MODIFIED Requirements
### Requirement: Versioned Prompt Registry
The Agent Runtime SHALL provide a prompt registry that resolves a versioned prompt template by `promptId` and `version`, including an explicit prompt reference supplied by the selected Agent Definition.

#### Scenario: Default prompt resolves
- **WHEN** no prompt reference is configured
- **THEN** the registry resolves `openharness-default@v1`

#### Scenario: Selected agent definition prompt resolves
- **GIVEN** a selected Agent Definition has `promptRef` `openharness-default@v1`
- **WHEN** the runtime prepares model-call messages for that agent turn
- **THEN** the registry resolves `openharness-default@v1` explicitly for that turn

#### Scenario: Unknown prompt fails closed
- **WHEN** a configured prompt reference does not exist
- **THEN** the runtime fails prompt resolution before calling the Java model gateway
