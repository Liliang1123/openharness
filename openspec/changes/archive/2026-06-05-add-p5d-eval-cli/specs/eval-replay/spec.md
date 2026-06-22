## ADDED Requirements
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
