## ADDED Requirements
### Requirement: Eval Fixtures
The Agent Runtime SHALL provide project-local Eval Fixture files for deterministic offline eval replay smoke checks.

#### Scenario: Parse canonical eval fixture
- **GIVEN** the repository contains a canonical Eval Fixture file
- **WHEN** the fixture is loaded for a smoke check
- **THEN** every case parses as a valid `EvalCase`

### Requirement: Eval Smoke Script
The Agent Runtime SHALL provide a package script that runs the Eval CLI against the canonical fixture without requiring external services.

#### Scenario: Run eval smoke locally
- **GIVEN** the canonical Eval Fixture file is present
- **WHEN** a developer runs the eval smoke script
- **THEN** the Eval CLI replays the fixture with deterministic local execution
- **AND** it exits with code `0`
- **AND** it emits a summary with total, passed, and failed counts

### Requirement: Eval Smoke Boundaries
The eval smoke path SHALL NOT require Java Backend, Frontend, real provider credentials, persisted sessions, production benchmark datasets, or dashboards.

#### Scenario: Smoke remains local and deterministic
- **WHEN** the eval smoke script runs
- **THEN** it completes using local deterministic runtime behavior
- **AND** it does not require backend/frontend servers, provider credentials, or production benchmark infrastructure
