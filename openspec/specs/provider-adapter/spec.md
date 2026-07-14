# provider-adapter Specification

## Purpose
TBD - created by archiving change add-p1a-provider-adapter. Update Purpose after archive.
## Requirements
### Requirement: Provider Adapter Abstraction
The Java backend SHALL define a `ProviderAdapter` interface that abstracts LLM provider calls, allowing runtime selection of provider by model name.

#### Scenario: OpenAI-compatible provider call
- **WHEN** a model chat request specifies a model routed to an OpenAI-compatible provider
- **THEN** the backend calls the configured base URL with OpenAI chat completions format and returns a normalized `ModelChatResponse`

#### Scenario: Anthropic provider call
- **WHEN** a model chat request specifies a model routed to Anthropic
- **THEN** the backend calls the Anthropic Messages API with proper format conversion and returns a normalized `ModelChatResponse`

### Requirement: Provider Configuration
The Java backend SHALL support multiple provider configurations in `application.yml`, each with name, type (openai-compatible / anthropic), base URL, API key reference, model-to-provider routing, and optional per-token price entries for cost calculation.

#### Scenario: Model routing
- **WHEN** a chat request arrives with `model: "claude-sonnet-4-20250514"`
- **THEN** the backend routes to the Anthropic adapter using the configured API key and base URL

#### Scenario: Unknown model fallback
- **WHEN** a chat request arrives with an unrecognized model name
- **THEN** the backend routes to the default provider defined in `openharness.model-router.default`

#### Scenario: Default model routes to configured default provider
- **WHEN** a chat request arrives with `model: "default"`
- **THEN** the backend resolves the provider from `openharness.model-router.default` rather than using a hardcoded provider name

### Requirement: Provider Retry on 503
The Java backend SHALL retry provider calls up to 3 times on HTTP 503 responses, with exponential backoff, before returning a structured error with `errorClass: PROVIDER_UNAVAILABLE`.

#### Scenario: Provider returns 503 then succeeds
- **WHEN** the provider returns 503 on the first call and 200 on the second
- **THEN** the backend returns the successful response without error

#### Scenario: Provider returns 503 three times
- **WHEN** the provider returns 503 on all 3 retry attempts
- **THEN** the backend returns `errorClass: PROVIDER_UNAVAILABLE`, `retriable: true`, `retryOwner: "ts"`

### Requirement: Usage and Cost Reporting
The Java backend SHALL populate `ModelChatResponse.usage` with real token counts from the provider response, including `promptTokens`, `completionTokens`, `totalTokens`, and optional `costUsdMicros`.

#### Scenario: Usage fields populated
- **WHEN** a provider returns usage information
- **THEN** `ModelChatResponse.usage` contains accurate token counts from the provider

### Requirement: Model Router
The Java backend SHALL provide a `ModelRouter` service that resolves the correct `ProviderAdapter` for a given model name using the `openharness.model-router` configuration, falling back to the default provider when the model name is not explicitly mapped.

#### Scenario: Explicit model mapping resolves correct adapter
- **WHEN** `openharness.model-router.routes` contains an entry for `"glm-4-flash"` pointing to `zhipu`
- **THEN** `ModelRouter.resolve("glm-4-flash")` returns the `zhipu` ProviderAdapter

#### Scenario: Unmapped model uses default
- **WHEN** a model name has no explicit route entry
- **THEN** `ModelRouter.resolve(model)` returns the adapter for `openharness.model-router.default`

### Requirement: Cost Calculation
The Java backend SHALL compute `costUsdMicros` for each model response using a configurable per-token price table in `application.yml`, and SHALL populate `ModelChatResponse.usage.costUsdMicros` when price data is available.

#### Scenario: Cost populated when price configured
- **WHEN** `application.yml` contains a price entry for the resolved provider+model
- **THEN** `ModelChatResponse.usage.costUsdMicros` is set to `ceil((promptTokens * inputPricePerMToken + completionTokens * outputPricePerMToken) / 1_000_000)`

#### Scenario: Cost absent when price not configured
- **WHEN** no price entry exists for the resolved provider+model
- **THEN** `ModelChatResponse.usage.costUsdMicros` is `null` and the response is not blocked

### Requirement: Usage Propagation to Frontend
The TS Runtime SHALL aggregate `costUsdMicros` from the final `ModelChatResponse.usage` and include it in `AgentChatResponse.usage` returned to the Frontend.

#### Scenario: Cost forwarded in chat response
- **WHEN** the Java model response contains `usage.costUsdMicros`
- **THEN** `AgentChatResponse.usage.costUsdMicros` contains the same value

#### Scenario: Missing cost does not break response
- **WHEN** `ModelChatResponse.usage.costUsdMicros` is absent
- **THEN** `AgentChatResponse.usage` is omitted or `costUsdMicros` is undefined

### Requirement: Provider adapters SHALL declare message structural capabilities

All provider adapters MUST implement or expose a capability metadata configuration `ProviderMessageCapabilities`:
1. `supportsSyntheticAssistantInjection`: boolean (can inject consecutive assistant messages or system-tagged assistant role messages).
2. `requiresLastUserMessage`: boolean (requires the final message in history to be user role).
3. `requiresToolResultAdjacency`: boolean (requires tool results to immediately follow tool calls).
4. `supportsParallelToolResults`: boolean (can handle multiple tool outputs simultaneously).

#### Scenario: Capabilities dictate fallback to user-tagged envelope injection

- Given a provider adapter that declares `supportsSyntheticAssistantInjection: false`
- When `AgentLoop` flushes a pending injection
- Then the injection does NOT use an assistant role message
- And instead wraps the skill instructions in a single user message prefixed with custom system envelopes

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

### Requirement: Gate C OpenAI-Compatible-Only Real Provider Qualification
Single-node production Gate C SHALL require a real OpenAI-compatible Chat Completions matrix without mock fallback. Gate C MUST NOT require a real Anthropic Messages matrix. Each required OpenAI-compatible matrix row MUST record environment fingerprint, API/model version, capability prerequisites, redacted request hash, observed response/event sequence, oracle, exact provider usage where applicable, recomputed cost where applicable, duration, and result. Missing OpenAI-compatible credentials or required OpenAI-compatible capabilities SHALL block Gate C overall PASS. Missing Anthropic credentials SHALL NOT by themselves block Gate C overall PASS.

#### Scenario: OpenAI-compatible real matrix can close Gate C without Anthropic
- **WHEN** an approved OpenAI-compatible real-provider matrix has every required row PASS and Anthropic credentials are absent
- **THEN** Gate C provider-family acceptance for real LLM paths is not blocked solely by Anthropic absence

#### Scenario: OpenAI-compatible required row still vetoes Gate C
- **WHEN** any required OpenAI-compatible real-provider matrix row is FAIL or BLOCKED
- **THEN** Gate C overall PASS is forbidden

#### Scenario: Mock fallback remains forbidden for required real rows
- **WHEN** a required real OpenAI-compatible qualification row cannot call its configured endpoint
- **THEN** the row is BLOCKED or FAIL and no mock response can satisfy it

### Requirement: Deferred Anthropic Real Provider Qualification
Anthropic Messages real-provider qualification SHALL remain a deferred, optional production family after Gate C. The Anthropic adapter and local/fake Anthropic matrix MAY continue to run as supporting evidence. Anthropic SHALL be considered production-qualified only after a dedicated real Anthropic matrix passes with approved credentials. OpenAI-compatible success MUST NOT be treated as Anthropic success.

#### Scenario: Anthropic real matrix is deferred not deleted
- **WHEN** Gate C is evaluated without Anthropic credentials
- **THEN** Anthropic real matrix is recorded as deferred/not-required for Gate C rather than deleted from the product roadmap

#### Scenario: Zhipu or other OpenAI-compatible success does not qualify Anthropic
- **WHEN** only an OpenAI-compatible real matrix has passed
- **THEN** Anthropic is not marked production-qualified

#### Scenario: Later Anthropic credentials enable deferred matrix
- **WHEN** approved Anthropic credentials become available after Gate C
- **THEN** operators MAY run the deferred Anthropic real matrix and promote Anthropic as an additional qualified family without invalidating prior OpenAI-compatible Gate C evidence

