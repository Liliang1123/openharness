## ADDED Requirements

### Requirement: Ask User Pending Store
The agent-runtime SHALL maintain an in-memory pending store for `REQUIRE_APPROVAL` decisions, keyed by `(tenantId, conversationId)` with at most one active pending per conversation.

#### Scenario: REQUIRE_APPROVAL creates pending
- **WHEN** policy evaluate returns `REQUIRE_APPROVAL` for a tool call
- **THEN** the agent-runtime creates a pending entry and emits `tool_result` with status `pending_approval` via SSE

#### Scenario: Pending lost on restart
- **WHEN** the agent-runtime process restarts while a pending exists
- **THEN** the pending is lost (P0b explicit limitation)

### Requirement: Ask User Reply API
The agent-runtime SHALL expose `POST /api/v1/agent/ask-user/:askUserId/reply` accepting actions: `approve`, `reject`, `revise`.

#### Scenario: Approve executes the pending tool
- **WHEN** the user replies with action `approve`
- **THEN** the pending tool call is executed via Java and the result is appended to history

#### Scenario: Reject does not execute
- **WHEN** the user replies with action `reject`
- **THEN** the tool is NOT executed and `USER_REJECTED` is appended to history

#### Scenario: Reply to non-existent pending returns 404
- **WHEN** a reply is sent for an `askUserId` that does not exist
- **THEN** the response is 404 with errorClass `ASK_USER_NOT_FOUND`

### Requirement: Frontend ApprovalCard
The frontend SHALL render an ApprovalCard component when a `tool_result` SSE event has status `pending_approval`, providing Approve and Reject buttons that call the reply API.

#### Scenario: ApprovalCard renders on pending
- **WHEN** the SSE stream emits a `tool_result` with `status: "pending_approval"`
- **THEN** the frontend displays an ApprovalCard with the tool name, reason, and Approve/Reject buttons
