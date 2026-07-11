## ADDED Requirements

### Requirement: Local Codex Operator Control
The Java Gateway SHALL provide a local/operator control surface that delegates Codex login, status, and logout to the official Codex CLI/app. The control surface SHALL expose only non-secret status such as provider id, readiness, model availability, process state, and needs-login state.

#### Scenario: Operator checks Codex status
- **WHEN** an operator requests local Codex status
- **THEN** the output shows readiness and non-secret lifecycle metadata without OAuth token values

#### Scenario: Operator logs out
- **WHEN** an operator delegates logout to Codex
- **THEN** subsequent OpenHarness Codex routes fail closed with needs-login/unavailable until Codex login is restored

### Requirement: Java Gateway Process Boundary
The Java Gateway SHALL communicate with the local Codex app-server only over an OS-local/loopback boundary, enforce process ownership and bounded lifecycle timeouts, and reject arbitrary remote app-server endpoints by default.

#### Scenario: Remote endpoint is rejected
- **WHEN** configuration points the Codex provider at a non-local endpoint without a separately approved policy
- **THEN** startup or readiness fails closed before any model request

#### Scenario: Child process is cleaned up
- **WHEN** the Gateway shuts down or disables the Codex provider
- **THEN** an owned app-server child is terminated within the configured timeout and no orphan process remains

### Requirement: Existing Service Authentication Remains
TS Runtime to Java service authentication and tenant/user/trace/request headers SHALL remain unchanged for Codex-backed model calls. OAuth authentication MUST NOT be forwarded to TS Runtime or Frontend.

#### Scenario: Runtime calls Codex route
- **WHEN** TS Runtime calls the existing model endpoint with valid service authentication and an openai-codex/<model> route
- **THEN** Java performs the Codex transport call while preserving the existing identity and trace boundary

### Requirement: Authenticated Codex Pending-Turn Interface
When a Codex app-server turn requests a dynamic tool call, the Java Gateway SHALL expose an optional pending-turn envelope on the existing model response and SHALL accept its result or cancellation only through an internal service-authenticated Codex turn endpoint. Each response MUST contain exactly one of a final message, a pending-turn envelope, or an error. The pending record and every mutation SHALL be bound to the original tenant, user, request, conversation, thread, turn, and call identifiers.

#### Scenario: Runtime receives a pending tool call
- **WHEN** the app-server sends `item/tool/call` before completing the turn
- **THEN** Java returns an opaque bridge id plus the correlated thread, turn, call, tool, canonical arguments, and expiry while keeping the same app-server turn and JSON-RPC request pending

#### Scenario: Exact identity submits a result
- **WHEN** TS Runtime supplies valid service authentication, matching identity/correlation fields, and one terminal tool outcome before expiry
- **THEN** Java returns the next pending call, final model response, or structured turn error from the same app-server turn

#### Scenario: Cross-identity completion is rejected
- **WHEN** any service token, tenant, user, request, conversation, thread, turn, call, or bridge identifier does not match the pending record
- **THEN** Java rejects the mutation without disclosing whether another tenant's pending turn exists and without responding to app-server

### Requirement: Runtime Owns Tool Authorization And Execution
TS Runtime SHALL remain the sole owner of frozen-catalog validation, agent allow-list enforcement, policy evaluation, human approval, MCP routing, and tool execution for Codex dynamic tool calls. Java SHALL only hold transport state and translate a TS terminal outcome to `DynamicToolCallResponse`; Java MUST NOT invoke, approve, or synthesize success for a tool.

#### Scenario: Approval is required
- **WHEN** the existing TS policy path requires human approval
- **THEN** the Codex turn remains pending until TS records approval and executes, records rejection/timeout, or cancels before the Java deadline

#### Scenario: Java has no TS outcome
- **WHEN** no authenticated TS terminal outcome arrives before the pending deadline
- **THEN** Java fails the dynamic tool call and interrupts the turn rather than auto-approving or executing it

#### Scenario: Sequential calls stay in one turn
- **WHEN** Codex emits another `item/tool/call` after accepting a prior result
- **THEN** TS handles the new pending call in the same model step and does not initiate a second model turn
