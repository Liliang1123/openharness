## MODIFIED Requirements

### Requirement: Ask User Pending Store
The agent-runtime SHALL maintain an `ApprovalStore` that records pending approvals keyed by `(executionId, toolCallId)`. Pending entries MUST be persisted alongside session data (e.g. `data/sessions/{tenantId}/{conversationId}-approvals.json`) so they survive process restarts within the active execution lifetime. While an approval is pending, the corresponding execution is in `waiting_approval` state and the runner is paused; no `"PENDING_APPROVAL"` placeholder is written to `HistoryStore`.

#### Scenario: REQUIRE_APPROVAL pauses execution and records approval
- **WHEN** policy evaluate returns `REQUIRE_APPROVAL` for a tool call
- **THEN** the agent-runtime records a pending approval in `ApprovalStore`, emits an `approval_requested` SSE event, and transitions execution status to `waiting_approval`
- **AND** no message with content `"PENDING_APPROVAL"` is written to `HistoryStore`

#### Scenario: Pending approval survives process restart
- **WHEN** the agent-runtime process restarts while a pending approval exists
- **THEN** the restarted process reads the persisted approval from `ApprovalStore` and exposes it via `GET /api/v1/sessions/:conversationId`

### Requirement: Ask User Reply API
The agent-runtime SHALL expose `POST /api/v1/sessions/:conversationId/executions/:executionId/approvals/:toolCallId` accepting `{ action: "approve" | "reject" | "revise", revisedArguments?, message? }`. Decisions SHALL resume the paused runner: `approve` executes the tool, `reject` appends a structured rejection tool result and lets the model continue, `revise` substitutes the tool arguments. The legacy `POST /api/v1/agent/ask-user/:askUserId/reply` SHALL remain available during a compatibility period and route to the same `ApprovalStore`.

#### Scenario: Approve executes the pending tool and resumes runner
- **WHEN** the user replies with action `approve` via the new endpoint
- **THEN** the pending tool call is executed via Java, the result is appended to `HistoryStore`, the execution status returns to `running`, and the runner continues to the next step

#### Scenario: Reject appends structured rejection and resumes runner
- **WHEN** the user replies with action `reject`
- **THEN** the agent-runtime appends a tool message with `status: "rejected"` and `errorClass: "USER_REJECTED"` to `HistoryStore`, the execution status returns to `running`, and the runner continues so the model can react

#### Scenario: Revise executes with revised arguments
- **WHEN** the user replies with action `revise` and `revisedArguments`
- **THEN** the tool is executed with the revised arguments, the result is appended to `HistoryStore`, and the runner continues

#### Scenario: Reply to non-existent approval returns 404
- **WHEN** a reply is sent for an `(executionId, toolCallId)` pair that does not exist
- **THEN** the response is `404` with `errorClass: "APPROVAL_NOT_FOUND"`

#### Scenario: Legacy ask-user endpoint still works during compatibility period
- **WHEN** a client calls `POST /api/v1/agent/ask-user/:askUserId/reply` with a valid `askUserId`
- **THEN** the request is routed to the corresponding `ApprovalStore` entry by `askUserId` mapping, and behaves identically to the new endpoint

### Requirement: Frontend ApprovalCard
The frontend SHALL render an ApprovalCard component when either an SSE `approval_requested` event arrives during the live stream OR `GET /api/v1/sessions/:conversationId` returns a non-empty `pendingApprovals` array on session load. The ApprovalCard SHALL provide Approve, Reject, and Revise actions that call the new approval endpoint.

#### Scenario: Live SSE approval renders ApprovalCard
- **WHEN** the SSE stream emits an `approval_requested` event
- **THEN** the frontend displays an ApprovalCard with the tool name, reason, and action buttons

#### Scenario: Page refresh recovers pending approval
- **WHEN** a user refreshes the page while an execution is `waiting_approval`
- **THEN** `GET /api/v1/sessions/:conversationId` returns `pendingApprovals` containing the approval, and the frontend renders the ApprovalCard from that data without requiring an SSE event

## ADDED Requirements

### Requirement: Approval Recovery via Session Events
The agent-runtime SHALL ensure that any client connecting via `GET /api/v1/sessions/:conversationId/events?last_event_id=...` receives the `approval_requested` events relevant to the active execution as part of the replay. The `GET /api/v1/sessions/:conversationId` endpoint SHALL include a `pendingApprovals` summary so a frontend can render the approval state without depending on SSE timing.

#### Scenario: Reconnect replays pending approval
- **WHEN** an execution is `waiting_approval` and a client connects via session events SSE
- **THEN** the replay includes the corresponding `approval_requested` event, allowing the client to render the approval state

#### Scenario: Session GET includes pendingApprovals
- **WHEN** a client calls `GET /api/v1/sessions/:conversationId` for a conversation with an execution in `waiting_approval`
- **THEN** the response body contains a `pendingApprovals` array with at least one entry describing the pending tool call
