## ADDED Requirements

### Requirement: Agent Chat API
The TypeScript Agent Runtime SHALL expose synchronous `POST /api/v1/agent/chat` and SHALL NOT expose or require SSE for P0a.

#### Scenario: User sends chat request
- **WHEN** the frontend sends a chat request with `conversationId` and `message`
- **THEN** the TS Runtime returns a synchronous assistant answer payload

### Requirement: Header and Trace Propagation
The TS Runtime SHALL reuse `X-Trace-Id` when provided, generate one in P0a dev mode when omitted, and propagate the same `X-Trace-Id`, `X-Request-Id`, `X-User-Id`, and `X-Tenant-Id` to every Java request.

#### Scenario: Frontend provides trace id
- **WHEN** a chat request includes `X-Trace-Id: trace-001`
- **THEN** every TS-to-Java request uses `X-Trace-Id: trace-001`

### Requirement: In-Memory Message History
The TS Runtime SHALL maintain MessageHistory in memory isolated by `(tenantId, conversationId)` and SHALL strip internal fields in `toModelMessages()` before sending messages to Java model gateway.

#### Scenario: Internal fields are stripped
- **WHEN** a stored message contains `systemInjected`, `transient`, `compressedSummary`, `requestId`, or `conversationId`
- **THEN** `toModelMessages()` omits those internal fields from the Java model request

### Requirement: Tool Registry Catalog Freeze
The TS Runtime SHALL fetch Java tool catalog through `GET /api/v1/tools/catalog` and freeze `catalogVersion` and `catalogHash` for each `(tenantId, conversationId)` lifecycle.

#### Scenario: Same conversation reuses catalog
- **WHEN** the same tenant and conversation sends two chat turns
- **THEN** the TS Runtime uses the same frozen catalog version and hash for tool execution

### Requirement: P0a beforeToolUse Hook
The TS Runtime SHALL provide a beforeToolUse hook with P0b-compatible function signature and SHALL implement pass-through ALLOW behavior for P0a.

#### Scenario: Safe tool passes through hook
- **WHEN** the model requests `get_current_time`
- **THEN** beforeToolUse returns an ALLOW decision and the TS Runtime calls Java tool execution

### Requirement: Synchronous Agent Loop
The TS Runtime SHALL implement a minimal loop `callModel -> beforeToolUse -> executeTool -> callModel/final`.

#### Scenario: Time query completes tool loop
- **WHEN** the user asks `现在几点`
- **THEN** the TS Runtime receives a Java model tool call, parses `argumentsRaw`, executes Java `get_current_time`, appends tool result, calls Java model again, and returns a final assistant answer

### Requirement: Tool Argument Parse Error
The TS Runtime SHALL parse `ToolCall.argumentsRaw` into an object before Java tool execution and SHALL return a model-visible tool result with `MODEL_TOOL_PARSE_ERROR` if parsing fails.

#### Scenario: Invalid argumentsRaw is model visible
- **WHEN** the model returns a tool call with invalid JSON in `argumentsRaw`
- **THEN** the TS Runtime appends a tool result with `status: "error"` and `errorClass: "MODEL_TOOL_PARSE_ERROR"`

### Requirement: Agent Runtime CORS
The TS Runtime SHALL allow only `FRONTEND_URL` as CORS origin and SHALL expose `X-Trace-Id` and `X-Request-Id`.

#### Scenario: CORS exposes trace headers
- **WHEN** the frontend calls the chat endpoint from the configured origin
- **THEN** the response exposes `X-Trace-Id` and `X-Request-Id`
