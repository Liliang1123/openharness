## ADDED Requirements
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

#### Scenario: Model hint does not alter router semantics
- **GIVEN** an agent definition includes `model`
- **WHEN** the definition is loaded
- **THEN** the value is retained as metadata only
- **AND** Java model router behavior is not changed by this capability
