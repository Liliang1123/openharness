# Design: Codex Provider Reasoning Effort Configuration

## Context

The existing Codex provider already owns a local, fail-closed app-server
transport. Model selection arrives as `openai-codex/<model>`, while
`CodexAppServerClient` currently constructs every `turn/start` request with a
literal `effort: "medium"`.

The approved design decision is provider-scoped configuration:

```yaml
openharness:
  model-router:
    routes:
      openai-codex/gpt-5.6-sol: openai-codex
  providers:
    - name: openai-codex
      type: codex-app-server
      command: codex
      app-server-args: ["app-server"]
      endpoint: stdio://
      models: ["gpt-5.6-sol"]
      reasoning-effort: high
```

The official Codex CLI remains the sole owner of login, token refresh, and
credential storage. This configuration contains no OAuth material.

## Goals

1. Allow a configured Codex provider to request `high` reasoning for
   `gpt-5.6-sol`.
2. Preserve `medium` for every existing Codex provider configuration that omits
   the new field.
3. Keep the value inside the Java provider boundary and forward it exactly once
   to `turn/start`.
4. Fail closed on invalid or unsupported values without provider fallback.

## Non-Goals

- Per-request, per-conversation, Frontend, or TS Runtime reasoning-effort
  overrides.
- A new field in `ModelChatRequest`, `AgentChatRequest`, or shared schema.
- Changing the selected model, default provider, OAuth login state, or Codex
  credential files.
- Expanding allowed app-server command arguments.
- Installing/upgrading Codex or adding an official OpenHarness CLI contract.
- Re-running production qualification, full-repository regression, or a
  24-hour Gate.

## Configuration Contract

- `reasoning-effort` is optional and valid only for a provider whose type is
  `codex-app-server`.
- When absent, blank after binding, or not otherwise supplied, the effective
  value is `medium`.
- An explicit value MUST match the bounded safe identifier pattern
  `[a-z][a-z0-9_-]{0,31}`.
- A syntactically invalid value or a value configured on a non-Codex provider
  MUST fail startup validation without launching Codex.
- Model-specific semantic support remains owned by the official Codex
  app-server. If it rejects an otherwise safe configured value, OpenHarness
  returns the existing structured Codex provider unavailable result and MUST
  NOT retry through another provider or mock.

The bounded identifier contract avoids coupling OpenHarness to one static model
catalog while preventing arbitrary command arguments, paths, or credential-like
material. The implementation never maps this value to a process argument; it is
serialized only as the JSON-RPC `turn/start.effort` value.

## Data Flow

1. Spring binds `reasoning-effort` into the Codex provider entry.
2. `ProviderProperties` validates the field and supplies effective default
   `medium`.
3. `ProviderConfig` carries the immutable effective value.
4. `CodexAppServerAdapter` passes it to `CodexAppServerClient.startTurn`.
5. The client writes the value into the existing `turn/start` JSON-RPC frame.
6. Any app-server rejection follows the existing redacted,
   `PROVIDER_UNAVAILABLE`/needs-login error path with no fallback.

No value travels through TS Runtime, Frontend, conversation persistence, or
OAuth control.

## Compatibility And Rollback

- Existing configurations remain byte-for-behavior compatible because omission
  resolves to `medium`, matching the current literal.
- API-key provider configuration and routing are unchanged.
- Rollback removes the optional field from local configuration and restores the
  previous implementation; the effective behavior returns to `medium`.
- Local trial configuration must be backed up before it is changed.

## Verification

- RED/GREEN tests for default `medium`, explicit `high`, safe-identifier
  validation, and rejection on non-Codex providers.
- Client protocol test proving `turn/start.effort` equals the configured value.
- Adapter test proving configuration is forwarded without changing model,
  prompt, tools, OAuth, or fallback behavior.
- Fake app-server test proving an unsupported effort returns a structured,
  redacted, non-fallback error.
- After explicit implementation approval, one real local trial using official
  Codex CLI 0.145.0, `openai-codex/gpt-5.6-sol`, and `high`; evidence records
  only version/model/effort/result and non-secret correlation identifiers.
- Focused Java tests, strict OpenSpec validation, dashboard check, shell wrapper
  syntax check, and the six-command local smoke. No full-repository regression
  or 24-hour Gate is required by this change.

## Risks

- A safe but unsupported value may pass startup validation and fail at model
  call time. This is intentional because model capability is app-server-owned;
  the failure remains structured and non-fallback.
- Higher effort may increase latency and usage. The setting is explicit and
  provider-local; the default remains unchanged.
- Codex protocol versions may evolve. Focused protocol tests bind the supported
  frame shape, while the safe identifier avoids prematurely freezing a global
  effort enum.
