## MODIFIED Requirements
### Requirement: Trace Ingestion
The backend SHALL accept `TraceEvent` JSON at `POST /api/v1/trace/events` and persist it in memory or emit stdout JSONL for P0a. The backend SHALL preserve trace-tree attributes used to link parent Agent executions and Subagent executions, including `traceNodeKind`, `executionId`, `parentExecutionId`, `childExecutionId`, `childConversationId`, `skillName`, and `toolCallId`, without logging service tokens or provider credentials.

#### Scenario: Trace event accepted
- **WHEN** a valid client posts a `TraceEvent`
- **THEN** the backend returns HTTP 202 or HTTP 200 and stores or emits the event without logging service tokens

#### Scenario: Subagent trace tree attributes are preserved
- **WHEN** a valid client posts a `TraceEvent` with subagent trace-tree attributes
- **THEN** the backend stores or emits those attributes unchanged
- **AND** the backend does not require Java to execute or schedule the subagent
