# Change: Add Codex Provider Reasoning Effort Configuration

## Why

The local OpenHarness CLI trial can select an `openai-codex/<model>` route, but
the Java Codex app-server client currently sends `effort: "medium"` for every
turn. The operator explicitly selected `gpt-5.6-sol` with `high` reasoning, and
the official Codex CLI 0.145.0 local probe confirmed that combination is
available. OpenHarness needs a narrow, explicit provider setting so the trial
can honor that choice without changing OAuth ownership or introducing a
per-request public override.

## What Changes

- Add an optional `reasoning-effort` setting to `codex-app-server` provider
  configuration.
- Preserve `medium` as the compatibility default when the setting is absent.
- Forward the configured value to the existing Codex app-server `turn/start`
  `effort` field.
- Validate the setting as a bounded safe identifier and reject its use on
  non-Codex providers.
- Fail closed with the existing structured Codex provider error when the local
  app-server or selected model rejects the configured effort; never fall back
  to another provider or mock.
- Verify the local trial target `openai-codex/gpt-5.6-sol` with
  `reasoning-effort: high` only after this proposal is approved and an
  implementation plan is reviewed.

## Impact

- Affected specs: `provider-adapter`
- Expected implementation scope:
  - `backend/src/main/java/org/openharness/backend/service/provider/ProviderProperties.java`
  - `backend/src/main/java/org/openharness/backend/service/provider/ProviderConfig.java`
  - `backend/src/main/java/org/openharness/backend/service/provider/CodexAppServerAdapter.java`
  - `backend/src/main/java/org/openharness/backend/service/provider/CodexAppServerClient.java`
  - focused Java provider tests
  - local operator configuration and wrapper guide only after implementation
- No TS Runtime request/schema change, Frontend change, OAuth credential access,
  provider fallback, installation/upgrade contract, production qualification,
  OpenSpec archive, full-repository regression, or 24-hour Gate is included.
