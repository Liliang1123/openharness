## ADDED Requirements

### Requirement: Policy Evaluate Endpoint
The Java backend SHALL expose `POST /api/v1/policies/tool-review/evaluate` that accepts a batch of tool calls and returns one decision per tool call.

#### Scenario: Default ALLOW for safe tools
- **WHEN** a tool call for a safe tool is evaluated with no deny rules matching
- **THEN** the decision is `ALLOW` with source `NONE`

#### Scenario: Deny rule blocks tool
- **WHEN** a tool call for a tool whose name starts with `blocked_` is evaluated
- **THEN** the decision is `DENY` with source `ORG_POLICY`

#### Scenario: Batch evaluate returns per-tool decisions
- **WHEN** multiple tool calls are submitted in one request
- **THEN** the response contains one decision per `toolCallId`, and ALLOW/DENY decisions are independent

### Requirement: Execute Defense Against Bypass
The Java backend SHALL reject execution of sensitive/destructive tools via `POST /api/v1/tools/execute` if no prior policy ALLOW record exists for that `(tenantId, toolCallId)`.

#### Scenario: Direct call to sensitive tool without policy allow
- **WHEN** a caller invokes `/api/v1/tools/execute` for a sensitive tool without a prior policy ALLOW
- **THEN** the response is 403 with errorClass `POLICY_DENY`

#### Scenario: Sensitive tool executes after policy ALLOW
- **WHEN** policy evaluate returns ALLOW for a sensitive tool, then execute is called
- **THEN** the tool executes normally and returns status `ok`
