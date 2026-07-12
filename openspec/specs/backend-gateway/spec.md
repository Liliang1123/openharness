# backend-gateway Specification

## Purpose
TBD - created by archiving change implement-p0a-skeleton. Update Purpose after archive.
## Requirements
### Requirement: Backend API Surface
The Java Spring Boot backend SHALL expose `GET /actuator/health`, `POST /api/v1/model/chat`, `GET /api/v1/tools/catalog`, `POST /api/v1/tools/execute`, and `POST /api/v1/trace/events`.

#### Scenario: Health endpoint is available
- **WHEN** a client sends `GET /actuator/health`
- **THEN** the backend returns HTTP 200 without requiring service auth headers

### Requirement: Service Auth Enforcement
The backend SHALL require `Authorization: Bearer dev-service-token`, `X-User-Id`, `X-Tenant-Id`, `X-Trace-Id`, and `X-Request-Id` for every non-health `/api/v1/**` endpoint.

#### Scenario: Missing user header is rejected
- **WHEN** a client calls `GET /api/v1/tools/catalog` without `X-User-Id`
- **THEN** the backend returns HTTP 401 with `StructuredError.errorClass` equal to `AUTH_MISSING_HEADER`

#### Scenario: Invalid service token is rejected
- **WHEN** a client calls a non-health `/api/v1/**` endpoint with an invalid bearer token
- **THEN** the backend returns HTTP 401 with `StructuredError.errorClass` equal to `AUTH_SERVICE_TOKEN_INVALID`

### Requirement: Mock Model Gateway
The backend SHALL implement a deterministic mock model gateway that returns canonical assistant messages, supports normal answers, supports tool calls for time queries, supports `X-Mock-Fixture`, and can return reasoning blocks.

#### Scenario: Time query returns tool call
- **WHEN** `POST /api/v1/model/chat` receives a latest user message asking `现在几点`
- **THEN** the response contains an assistant message with a `get_current_time` tool call whose arguments are in `argumentsRaw`

#### Scenario: Fixture returns deterministic response
- **WHEN** `POST /api/v1/model/chat` includes `X-Mock-Fixture: tool-time`
- **THEN** the backend returns the fixture-defined canonical response sequence deterministically

### Requirement: Tool Catalog
The backend SHALL return a tool catalog containing `catalogVersion`, `catalogHash`, and at least `get_current_time` and `echo` tool definitions with permission metadata.

#### Scenario: Catalog includes safe tools
- **WHEN** a valid client calls `GET /api/v1/tools/catalog`
- **THEN** the response includes `catalogVersion`, `catalogHash`, `get_current_time`, and `echo`
- **AND** each tool includes `permission`, `isReadOnly`, `isDestructive`, `requiresApproval`, and `isConcurrencySafe`

### Requirement: Tool Execution
The backend SHALL validate `catalogVersion` and `catalogHash`, execute `get_current_time` and `echo`, and return `StructuredError` failures for catalog/tool/user/internal errors.

#### Scenario: Current time tool executes
- **WHEN** a valid `POST /api/v1/tools/execute` request calls `get_current_time` with a matching catalog version and hash
- **THEN** the backend returns HTTP 200 with `status: "ok"` and a time result

#### Scenario: Catalog mismatch is rejected
- **WHEN** a valid `POST /api/v1/tools/execute` request has a stale `catalogVersion`
- **THEN** the backend returns HTTP 409 with `StructuredError.errorClass` equal to `CATALOG_OUTDATED`

### Requirement: Tool Idempotency
The backend SHALL maintain a 24h in-memory idempotency table keyed by `(tenantId, idempotencyKey)`, return the original result on replay, set `idempotentReplay=true`, and return `IDEMPOTENCY_CONFLICT` when the same key has a different payload.

#### Scenario: Identical replay returns original response
- **WHEN** the same tenant repeats an identical tool execution request with the same `idempotencyKey`
- **THEN** the backend returns the first result with `idempotentReplay=true`

### Requirement: Trace Ingestion
The backend SHALL accept `TraceEvent` JSON at `POST /api/v1/trace/events` and persist it in memory or emit stdout JSONL for P0a. The backend SHALL preserve trace-tree attributes used to link parent Agent executions and Subagent executions, including `traceNodeKind`, `executionId`, `parentExecutionId`, `childExecutionId`, `childConversationId`, `skillName`, and `toolCallId`, without logging service tokens or provider credentials.

#### Scenario: Trace event accepted
- **WHEN** a valid client posts a `TraceEvent`
- **THEN** the backend returns HTTP 202 or HTTP 200 and stores or emits the event without logging service tokens

#### Scenario: Subagent trace tree attributes are preserved
- **WHEN** a valid client posts a `TraceEvent` with subagent trace-tree attributes
- **THEN** the backend stores or emits those attributes unchanged
- **AND** the backend does not require Java to execute or schedule the subagent

### Requirement: Protocol Tool Execution
The Java backend SHALL execute safe protocol tools through the existing `POST /api/v1/tools/execute` endpoint.

#### Scenario: Protocol tool uses existing execute endpoint
- **WHEN** a caller executes `read_file`, `search`, or `run_command` with current catalog version and hash
- **THEN** the response uses the standard `ToolCallResponse` shape

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

