## ADDED Requirements

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
