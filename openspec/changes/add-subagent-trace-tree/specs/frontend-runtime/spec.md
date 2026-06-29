## MODIFIED Requirements
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
