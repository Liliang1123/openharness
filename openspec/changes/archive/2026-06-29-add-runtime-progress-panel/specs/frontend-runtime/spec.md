## ADDED Requirements
### Requirement: Runtime Progress Panel
The frontend SHALL render a runtime progress panel that summarizes the current or most recent execution using `RuntimeProgressSnapshot` data. The panel SHALL show execution status, current step, current activity, active tool or subagent when available, waiting approval state, terminal reason, and elapsed timing. The existing Trace Tree and raw event debug view SHALL remain available as detailed diagnostics.

#### Scenario: Running progress is visible
- **WHEN** the frontend receives stream events or session detail indicating an execution is running a model call at step 2
- **THEN** the progress panel shows the execution as running, displays step 2, and identifies the current activity as model work

#### Scenario: Waiting approval is visible
- **WHEN** session detail includes a runtime progress snapshot with `currentActivity: "waiting_approval"`
- **THEN** the progress panel shows that the execution is waiting for approval and displays safe pending approval metadata

#### Scenario: Terminal progress is visible
- **WHEN** the execution completes or errors
- **THEN** the progress panel shows the terminal status and stop or error reason

#### Scenario: Trace diagnostics remain available
- **WHEN** runtime progress is displayed
- **THEN** the user can still inspect the Trace Tree or raw SSE events without losing existing debug capability
