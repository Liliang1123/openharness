## MODIFIED Requirements

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

## ADDED Requirements

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
