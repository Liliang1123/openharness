# frontend-runtime Specification

## Purpose
TBD - created by archiving change implement-p0a-skeleton. Update Purpose after archive.
## Requirements
### Requirement: Minimal Chat First Screen
The frontend SHALL render a chat interface as the first screen and SHALL NOT render a marketing landing page.

#### Scenario: App loads chat UI
- **WHEN** the frontend app loads
- **THEN** the user sees a message input, send control, assistant response area, and trace/debug panel

### Requirement: Frontend Calls Only TS Runtime
The frontend SHALL call only the TS Runtime `POST /api/v1/agent/chat` and SHALL NOT configure or call the Java backend URL.

#### Scenario: Sending message uses agent runtime
- **WHEN** the user submits a message
- **THEN** the frontend posts to the configured TS Runtime URL at `/api/v1/agent/chat`
- **AND** no Java backend URL is used by frontend code or environment config

### Requirement: Trace Debug Panel
The frontend SHALL generate or propagate `X-Trace-Id` on user submission and SHALL display trace/debug JSON from the agent chat response. When trace events contain trace-tree attributes, the frontend SHALL render a parent/child tree view that groups subagent nodes under the parent agent execution and displays node status, duration, cost when available, and terminal error classification. For events without trace-tree attributes, the panel SHALL continue to show the existing flat JSON view.

#### Scenario: Trace id visible after response
- **WHEN** the chat request completes
- **THEN** the trace/debug panel shows JSON including the trace id used for the request

#### Scenario: Subagent trace tree is rendered
- **WHEN** the chat response debug trace contains a parent execution and one subagent execution linked by `parentExecutionId` and `childExecutionId`
- **THEN** the Trace Debug Panel renders the subagent as a child node under the parent execution
- **AND** the node displays status, duration, cost when available, and terminal error classification when present

#### Scenario: Old trace events still render
- **WHEN** the chat response debug trace does not contain trace-tree attributes
- **THEN** the Trace Debug Panel falls back to the existing flat JSON display

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

