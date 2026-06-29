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

