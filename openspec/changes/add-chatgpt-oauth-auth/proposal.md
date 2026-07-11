# Change: Add ChatGPT/Codex OAuth Via Local Codex App Server

## Why

Operators want OpenHarness to use an existing ChatGPT/Codex OAuth login for OpenAI model calls, without copying a Platform API key or OAuth token into OpenHarness. OpenClaw provides this capability through a dedicated Codex OAuth route; OpenHarness currently only routes Java provider calls through API-key adapters.

## What Changes

- Add an explicit openai-codex provider route backed by a local Codex app-server/CLI transport.
- Keep OAuth ownership inside the official/local Codex process. OpenHarness MUST NOT read, persist, refresh, or print ChatGPT/Codex OAuth tokens.
- Keep existing api_key providers such as Zhipu and ordinary OpenAI API-key routes unchanged.
- Add Java Gateway process supervision/readiness checks and a narrow IPC client for the approved Codex app-server protocol.
- Add an authenticated asynchronous tool bridge: Java keeps the Codex app-server turn open when `item/tool/call` arrives, TS Runtime remains the sole policy/approval/execution owner, and Java only translates the returned outcome into `DynamicToolCallResponse`.
- Bind every pending call to request/tenant/user/thread/turn/call identity, with bounded expiry, cancel, idempotent replay, restart fail-closed behavior, and redacted diagnostics. Java MUST NOT execute or auto-approve tools.
- Expose only operator-local commands for Codex login/status/logout delegation; ordinary Runtime chat continues using the existing Java /api/v1/model/chat contract.
- Return structured unavailable/reauth/auth errors when the local Codex session is absent, expired, or the app-server is unreachable. No silent mock, Zhipu, or API-key fallback.
- Add fake app-server contract tests, redaction tests, lifecycle tests, and an explicitly authorized real OAuth smoke path.

## Impact

- Affected specs: provider-adapter, backend-gateway.
- Affected code: Java provider routing, Codex app-server process/IPC adapter, operator runbook, qualification harness.
- Security: OAuth tokens remain outside the OpenHarness workspace and Java application memory; only profile/status metadata and redacted request hashes enter OpenHarness evidence.
- Compatibility: existing API-key provider configuration remains unchanged. The model response contract gains an optional pending-turn envelope and an authenticated internal completion/cancel surface used only by TS Runtime; non-Codex providers retain their current synchronous behavior.

## Non-Goals

- Direct ChatGPT web-session or cookie scraping.
- Implementing an OAuth authorization server, PKCE exchange, device-code polling, or token refresh inside OpenHarness.
- Importing or reading ~/.codex credential files.
- Putting OAuth credentials in TS Runtime, Frontend, git-tracked config, logs, traces, or reports.
- Full OpenClaw multi-agent auth-profile parity.
- Using ChatGPT/Codex OAuth to qualify Anthropic rows.

## Risk

Strict. This change crosses authentication, local process supervision, provider routing, cancellation, redaction, and operator-visible behavior. Implementation requires an approved transport spike, fake app-server tests, explicit real OAuth authorization, and a separate review before any Gate C promotion.

## Delivery Profile

- Evidence profile: strict.
- Batch profile: staged (protocol spike; lifecycle/config; model-call and error path; qualification/docs).
