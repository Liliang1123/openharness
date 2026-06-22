## ADDED Requirements
### Requirement: Prompt Template Schema
The shared schema SHALL define a prompt template contract with `promptId`, `version`, `role`, `content`, and optional `description`.

#### Scenario: Prompt template parses
- **WHEN** zod parses a prompt template with `role: "system"`
- **THEN** parsing succeeds and preserves `promptId`, `version`, and `content`

### Requirement: Model Chat Prompt Metadata
The shared schema SHALL allow `ModelChatRequest.meta` to carry `promptId` and `promptVersion`.

#### Scenario: Prompt metadata parses
- **WHEN** zod parses a model chat request whose metadata includes `promptId` and `promptVersion`
- **THEN** parsing succeeds and preserves both values
