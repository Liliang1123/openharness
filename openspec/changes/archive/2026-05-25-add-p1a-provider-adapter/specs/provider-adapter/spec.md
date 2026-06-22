## ADDED Requirements

### Requirement: Provider Adapter Abstraction
The Java backend SHALL define a `ProviderAdapter` interface that abstracts LLM provider calls, allowing runtime selection of provider by model name.

#### Scenario: OpenAI-compatible provider call
- **WHEN** a model chat request specifies a model routed to an OpenAI-compatible provider
- **THEN** the backend calls the configured base URL with OpenAI chat completions format and returns a normalized `ModelChatResponse`

#### Scenario: Anthropic provider call
- **WHEN** a model chat request specifies a model routed to Anthropic
- **THEN** the backend calls the Anthropic Messages API with proper format conversion and returns a normalized `ModelChatResponse`

### Requirement: Provider Configuration
The Java backend SHALL support multiple provider configurations in `application.yml`, each with name, type (openai-compatible / anthropic), base URL, API key reference, and model-to-provider routing.

#### Scenario: Model routing
- **WHEN** a chat request arrives with `model: "claude-sonnet-4-20250514"`
- **THEN** the backend routes to the Anthropic adapter using the configured API key and base URL

#### Scenario: Unknown model fallback
- **WHEN** a chat request arrives with an unrecognized model name
- **THEN** the backend routes to the default provider

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
