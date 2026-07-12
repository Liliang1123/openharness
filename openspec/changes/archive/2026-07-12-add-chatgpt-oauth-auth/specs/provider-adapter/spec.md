## ADDED Requirements

### Requirement: Local Codex App-Server Provider
The Java Gateway SHALL support an explicit codex-app-server provider type and openai-codex/<model> routes that invoke a local Codex app-server/CLI transport. Existing api_key provider routes MUST remain unchanged. The Gateway MUST NOT silently fall back to another provider or mock when the Codex transport is unavailable.

#### Scenario: Codex route resolves to local transport
- **WHEN** a model route matches openai-codex/<model> and the local Codex app-server is ready
- **THEN** Java sends the request through the Codex app-server client and returns the normal model response contract

#### Scenario: Codex transport unavailable
- **WHEN** the app-server is stopped, unauthenticated, unreachable, or protocol-incompatible
- **THEN** the request returns a structured provider unavailable/needs-login error and no fallback call is made

#### Scenario: API-key providers remain compatible
- **WHEN** a request resolves to an existing Zhipu or OpenAI API-key provider
- **THEN** Java continues using the existing API-key adapter path without requiring Codex login

### Requirement: OAuth Secret Boundary
ChatGPT/Codex OAuth login, token refresh, and token storage SHALL remain owned by the official local Codex component. OpenHarness MUST NOT read, persist, import, print, or expose OAuth access tokens, refresh tokens, authorization codes, or credential files. TS Runtime SHALL receive only the existing service/model data plus the non-credential pending-turn envelope; Frontend MUST NOT receive pending-turn or OAuth data.

#### Scenario: OAuth token stays outside OpenHarness
- **WHEN** a model call uses the local Codex provider
- **THEN** OpenHarness records only non-secret provider/transport/status metadata and the model response

#### Scenario: Secret canary is absent
- **WHEN** app-server output or a provider failure contains token-like data
- **THEN** logs, traces, runtime events, reports, and error responses contain no raw token or Authorization value

### Requirement: Codex Provider Lifecycle
The Java Gateway SHALL expose readiness states for the local Codex transport, enforce local endpoint/process boundaries, bound startup/handshake/request/shutdown timeouts, and clean up owned child processes. Crash or auth loss SHALL be observable and SHALL NOT trigger silent provider fallback.

#### Scenario: Process crash is recoverable
- **WHEN** the owned app-server exits during an otherwise valid request
- **THEN** Java returns a structured unavailable error, records the lifecycle transition, and applies bounded restart policy

#### Scenario: Operator login is delegated
- **WHEN** an operator needs to authenticate
- **THEN** the documented local command delegates login/status/logout to Codex without exposing OAuth secrets through OpenHarness output

### Requirement: Codex Dynamic Tool Response Lifecycle
The Codex provider SHALL keep an app-server turn and its `item/tool/call` JSON-RPC request open until TS Runtime supplies a terminal outcome or the turn is cancelled, expires, disconnects irrecoverably, or becomes orphaned by restart. Java SHALL map `ok` to `DynamicToolCallResponse.success=true`; `error`, `rejected`, and `timeout` SHALL map to `success=false` with bounded redacted `inputText` content.

#### Scenario: Successful result resumes the turn
- **WHEN** TS Runtime submits an `ok` result for the exact pending call
- **THEN** Java sends one successful DynamicToolCallResponse and continues reading the same app-server turn

#### Scenario: Rejection is not success
- **WHEN** policy, approval, parsing, execution, or timeout produces a non-ok outcome
- **THEN** Java sends a failed DynamicToolCallResponse and never represents the outcome as successful execution

#### Scenario: Pending call expires
- **WHEN** the bounded pending-call deadline elapses before a valid terminal submission
- **THEN** Java atomically expires the record, fails the app-server request when writable, interrupts the exact turn, and returns a structured non-fallback error

### Requirement: Codex Pending-Turn Idempotency And Recovery
The provider SHALL serialize completion of each pending call. The first valid `(bridgeId, callId, idempotencyKey)` payload wins; an identical retry SHALL return the cached redacted next response as an idempotent replay, while a conflicting retry SHALL return a structured conflict without sending a second app-server response. Pending responder handles SHALL remain memory-only and MUST NOT be reconstructed after Java or app-server restart.

#### Scenario: Ambiguous HTTP completion is retried
- **WHEN** TS Runtime retries the exact same completion after losing the HTTP response
- **THEN** Java returns the cached redacted response and does not answer the app-server request twice

#### Scenario: Conflicting completion is rejected
- **WHEN** a completed bridge receives a different idempotency key or payload
- **THEN** Java returns `BRIDGE_RESULT_CONFLICT` and preserves the first terminal result

#### Scenario: Restart orphans a pending handle
- **WHEN** Java or app-server restarts while a dynamic tool call is pending
- **THEN** later completion returns `BRIDGE_TURN_GONE`, TS terminates that execution as interrupted/error, and neither side automatically re-executes the tool or starts an uncorrelated continuation

#### Scenario: Cancellation races with completion
- **WHEN** authenticated cancellation and completion race for the same pending call
- **THEN** exactly one terminal transition wins and the losing operation receives the recorded terminal outcome without a second app-server mutation

### Requirement: Pending-Turn Data Minimization
Pending arguments and tool results SHALL exist only for the bounded time needed to continue the turn. Logs, traces, reports, thrown errors, persisted runtime state, and Frontend responses MUST NOT contain raw arguments, raw results, bridge ids, OAuth-like values, Authorization values, or app-server error bodies. Terminal replay retention SHALL contain only correlation metadata, a payload hash, terminal status, redacted response, and expiry.

#### Scenario: Secret canary crosses a tool call
- **WHEN** synthetic arguments, a tool result, or an app-server error contains a secret canary
- **THEN** the canary is absent from logs, traces, reports, persisted runtime events, errors, and qualification evidence

#### Scenario: Terminal replay expires
- **WHEN** the bounded replay-retention window elapses
- **THEN** Java removes the terminal record and subsequent submissions fail closed without revealing prior content

### Requirement: Codex Qualification Evidence
When real OAuth qualification is explicitly authorized, the provider matrix SHALL record transport/model/status metadata, redacted request hashes, observed reasoning/tool/stream/usage behavior, duration, and result. Missing login, unavailable app-server, or unsupported capability SHALL be BLOCKED; mock PASS is forbidden.

#### Scenario: Real Codex row passes
- **WHEN** an authorized local Codex app-server call satisfies the required oracle
- **THEN** the row records production evidence without any credential material

#### Scenario: Missing login blocks
- **WHEN** no usable Codex login exists
- **THEN** the Codex row is BLOCKED/needs_login and cannot promote Gate C
