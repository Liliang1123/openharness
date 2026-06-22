# eval-replay Specification

## Purpose
TBD - created by archiving change add-p5a-memory-and-eval. Update Purpose after archive.
## Requirements
### Requirement: Eval Case Replay
The Agent Runtime SHALL provide an offline eval replay harness that executes an `EvalCase` through the existing agent runner path.

#### Scenario: Replay a passing eval case
- **GIVEN** an eval case with an input and expected answer substring
- **WHEN** the eval replay harness runs the case against a deterministic model client
- **THEN** it returns `passed=true`, the final answer, the terminal stop reason, and runtime event evidence

### Requirement: Eval Failure Evidence
The eval replay harness SHALL return deterministic failure evidence when expectations are not met.

#### Scenario: Replay a failing eval case
- **GIVEN** an eval case with an expected answer substring that is absent from the final answer
- **WHEN** the eval replay harness runs the case
- **THEN** it returns `passed=false` with a failure reason and event evidence

### Requirement: Harness Isolation
Eval replay SHALL use isolated in-memory runtime state unless explicitly provided otherwise.

#### Scenario: Eval does not mutate existing sessions
- **WHEN** an eval case is replayed with default harness dependencies
- **THEN** it uses isolated history, runtime events, execution state, and approval state for that replay

### Requirement: Eval Replay CLI
The Agent Runtime SHALL provide a local Eval CLI that replays one or more `EvalCase` fixtures through the existing `EvalReplayHarness`.

#### Scenario: Replay eval cases from JSON array
- **GIVEN** a JSON file containing an array of valid `EvalCase` objects
- **WHEN** the Eval CLI runs the file
- **THEN** each case is replayed through the existing eval replay harness
- **AND** the CLI emits one machine-readable result per case

#### Scenario: Replay eval cases from JSONL
- **GIVEN** a JSONL file containing one valid `EvalCase` object per line
- **WHEN** the Eval CLI runs the file
- **THEN** each non-empty line is parsed as an eval case
- **AND** each parsed case is replayed through the existing eval replay harness

### Requirement: Eval CLI Result Reporting
The Eval CLI SHALL emit deterministic machine-readable evidence for each replayed case and a final summary.

#### Scenario: Report passing and failing cases
- **GIVEN** the Eval CLI replays multiple eval cases
- **WHEN** some cases pass and some cases fail expectations
- **THEN** the CLI emits each case result with `evalId`, `passed`, answer/stop evidence, and optional failure reason
- **AND** it emits a summary containing total, passed, and failed counts

### Requirement: Eval CLI Exit Codes
The Eval CLI SHALL use process exit codes to signal replay status for CI workflows.

#### Scenario: All cases pass
- **GIVEN** every replayed eval case passes
- **WHEN** the Eval CLI completes
- **THEN** it exits with code `0`

#### Scenario: Any case fails
- **GIVEN** at least one replayed eval case fails
- **WHEN** the Eval CLI completes
- **THEN** it exits with a non-zero code

#### Scenario: Invalid input
- **GIVEN** the eval fixture file is malformed or contains an invalid `EvalCase`
- **WHEN** the Eval CLI parses the file
- **THEN** it exits with a non-zero code
- **AND** emits structured error evidence

### Requirement: Eval CLI Isolation Boundaries
The Eval CLI SHALL preserve default eval replay isolation and SHALL NOT start frontend flows, expose a remote eval API, or mutate persisted sessions by default.

#### Scenario: CLI replay remains offline
- **WHEN** the Eval CLI runs eval fixtures
- **THEN** replay uses isolated runtime state by default
- **AND** no frontend server, remote eval endpoint, or persisted user session mutation is required

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

