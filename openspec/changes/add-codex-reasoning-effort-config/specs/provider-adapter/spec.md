## MODIFIED Requirements

### Requirement: Local Codex App-Server Provider
The Java Gateway SHALL support an explicit codex-app-server provider type and openai-codex/<model> routes that invoke a local Codex app-server/CLI transport. A codex-app-server provider MAY configure a bounded safe `reasoning-effort` identifier that Java SHALL forward to the app-server `turn/start` request; when the field is absent, Java SHALL use `medium` for backward compatibility. The setting MUST be rejected on non-Codex providers, MUST NOT become a process argument or credential source, and MUST fail closed without fallback when the selected app-server/model does not support it. Existing api_key provider routes MUST remain unchanged. The Gateway MUST NOT silently fall back to another provider or mock when the Codex transport is unavailable.

#### Scenario: Codex route resolves to local transport
- **WHEN** a model route matches openai-codex/<model> and the local Codex app-server is ready
- **THEN** Java sends the request through the Codex app-server client and returns the normal model response contract

#### Scenario: Explicit reasoning effort is forwarded
- **WHEN** an `openai-codex/gpt-5.6-sol` route uses a Codex provider configured with `reasoning-effort: high`
- **THEN** Java sends `effort: "high"` in the existing app-server `turn/start` request without exposing the setting to TS Runtime or Frontend

#### Scenario: Missing reasoning effort preserves compatibility
- **WHEN** a Codex provider omits `reasoning-effort`
- **THEN** Java sends `effort: "medium"`, matching the behavior before this change

#### Scenario: Invalid provider configuration fails before launch
- **WHEN** `reasoning-effort` is syntactically unsafe or is configured on a non-Codex provider
- **THEN** backend configuration validation fails before any Codex process or provider request starts

#### Scenario: Unsupported effort fails closed
- **WHEN** the official local app-server or selected model rejects the configured safe reasoning effort
- **THEN** the request returns a structured redacted provider error and no API-key provider or mock fallback is attempted

#### Scenario: Codex transport unavailable
- **WHEN** the app-server is stopped, unauthenticated, unreachable, or protocol-incompatible
- **THEN** the request returns a structured provider unavailable/needs-login error and no fallback call is made

#### Scenario: API-key providers remain compatible
- **WHEN** a request resolves to an existing Zhipu or OpenAI API-key provider
- **THEN** Java continues using the existing API-key adapter path without requiring Codex login
