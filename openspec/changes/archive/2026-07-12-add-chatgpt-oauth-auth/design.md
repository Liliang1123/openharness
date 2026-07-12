# Design: ChatGPT/Codex OAuth Via Local Codex App Server

## Context

ChatGPT/Codex OAuth is a Codex-owned authentication flow. The OpenAI account session and any API keys are separate credentials; OpenHarness must not turn the OAuth session into a generic API key. The selected architecture therefore delegates login, token refresh, and subscription transport to a local official Codex app-server/CLI process.

## Goals

1. Route selected model ids through a local openai-codex transport.
2. Preserve `/api/v1/model/chat` as the model-call entry point while compatibly extending its response with an optional pending-turn envelope for Codex only.
3. Keep OAuth secrets outside OpenHarness process, workspace, logs, traces, and reports.
4. Fail closed when the Codex process/session is unavailable or returns auth failure.
5. Keep Zhipu and other API-key providers unchanged.

## Non-Goals

- Direct OAuth token exchange or refresh in Java.
- Reading Codex credential files or importing ~/.codex.
- Browser login UI in Frontend.
- Direct calls to ChatGPT web endpoints from OpenHarness.
- Silent provider fallback.

## Architecture

    Operator
      └─► official Codex CLI/app login (OAuth owned by Codex)

    TS Agent Runtime (policy + approval + tool execution owner)
      ├─► POST /api/v1/model/chat
      └─► POST /api/v1/model/codex/turns/{bridgeId}/tool-result
                         │
    Java Gateway        ▼
      ├─► authenticated PendingCodexTurnRegistry
      ├─► CodexProcessSupervisor
      ├─► CodexAppServerClient ── local JSON-RPC/app-server protocol
      └─► ModelRouter(openai-codex/*)

The Java Gateway owns only the process handle, endpoint/IPC metadata, readiness state, request correlation id, pending-turn state, and redacted audit fields. It never receives or persists OAuth access/refresh tokens. Pending-turn state is transport coordination, not tool authorization: Java MUST NOT evaluate policy, execute a tool, mint approval, or treat absence of a TS decision as approval.

## Provider configuration

Conceptual configuration:

    openharness:
      model-router:
        routes:
          openai-codex/gpt-model: openai-codex
      providers:
        - name: openai-codex
          type: codex-app-server
          command: codex
          app-server-args: ["app-server"]
          models: ["gpt-model"]

Exact command and protocol flags remain implementation-spike outputs; no credential-bearing path may be configured.

## Lifecycle and errors

- starting: launch or attach only when explicitly enabled by operator configuration.
- ready: app-server handshake and model capability discovery succeed.
- needs_login: Codex reports no usable ChatGPT session.
- unavailable: process exit, handshake failure, timeout, or protocol mismatch.
- degraded: optional status for restart backoff; never a reason to use mock/API-key fallback.

Map failures to existing structured provider errors where possible; add PROVIDER_NEEDS_LOGIN only if the current error vocabulary cannot represent the operator action. Include provider/profile/status metadata only, never token material.

## Request, pending call, and response boundary

For non-Codex providers, `POST /api/v1/model/chat` remains synchronous. For `openai-codex/*`, Java starts one Codex thread/turn and reads app-server events until either the turn completes/fails or app-server sends `item/tool/call`.

On `item/tool/call`, Java registers exactly one pending call and returns `ModelChatResponse.pendingTurn` instead of pretending the app-server turn completed. The envelope contains an opaque random `bridgeId`, `threadId`, `turnId`, `callId`, tool name, canonical JSON arguments, and `expiresAt`; it contains no OAuth material. Java keeps the JSON-RPC server request responder and the app-server turn alive. A response MUST contain exactly one of `message`, `pendingTurn`, or `error`.

TS Runtime handles `pendingTurn` inside the current model step. It validates the tool against the frozen catalog and agent allow-list, runs the existing policy and human-approval path, and executes through the existing TS-owned MCP/Java tool path. It then calls the authenticated internal endpoint `POST /api/v1/model/codex/turns/{bridgeId}/tool-result` with all correlation identifiers, `idempotencyKey`, terminal status (`ok`, `error`, `rejected`, or `timeout`), and a text result/error payload. The endpoint returns the next `ModelChatResponse`: another pending call, the final assistant message, or a structured error. TS MUST NOT start a second model turn while a bridge id remains pending.

Pending-call assistant stubs and tool outcomes are transport-only and MUST NOT be appended to conversation history or persisted runtime events; Codex already owns them inside the open turn. TS appends only the final assistant response after the bridge completes, preventing duplicate context on the next model turn.

Java validates the service token and exact `X-Tenant-Id`, `X-User-Id`, `X-Request-Id`, request id, conversation id, thread id, turn id, and call id against the pending record. Only then does it translate the submitted outcome to `DynamicToolCallResponse`: `success=true` only for `ok`; every outcome becomes bounded, redacted `inputText` content. Java never invokes the named tool and never converts missing/expired approval into success.

## Pending-turn state machine

`ACTIVE -> PENDING_TOOL -> ACTIVE -> COMPLETED` is the only successful path. `ACTIVE` may transition to `CANCELLING`, `TIMED_OUT`, `FAILED`, or `ORPHANED`; all are terminal except that a bounded process restart may accept a new model request. A turn has at most one unresolved app-server server request at a time.

- **Timeout:** pending calls use a configurable bounded deadline. Expiry atomically marks the call `TIMED_OUT`, sends `success=false` if the JSON-RPC session is still writable, interrupts the turn, removes executable state, and returns a structured non-fallback error. TS approval and execution deadlines MUST be shorter than the Java pending deadline.
- **Cancel:** execution abort or client disconnect invokes an authenticated cancel endpoint/idempotent client method. Java interrupts the exact turn, fails any outstanding JSON-RPC request, and removes the pending record. Cancel never reports a tool success.
- **Idempotency:** the first valid `(bridgeId, callId, idempotencyKey)` submission wins. An identical replay returns the cached redacted next response with `idempotentReplay=true`; a different payload/key for a completed call returns `409 BRIDGE_RESULT_CONFLICT`. Concurrent submissions are serialized atomically.
- **Restart/crash:** pending responder handles are memory-only and MUST NOT be reconstructed. Java/app-server restart marks prior handles orphaned; subsequent completion returns `410 BRIDGE_TURN_GONE`, and TS terminates the execution as interrupted/error rather than starting an uncorrelated continuation. No tool is re-executed automatically.
- **Disconnect:** TS may retry an identical completion after an ambiguous HTTP result; the idempotency rule prevents double response. If Java cannot prove whether app-server accepted the response, it fails closed and cancels the turn.
- **Retention:** terminal replay records retain only correlation ids, payload hash, terminal status, redacted response, and expiry for a bounded window; raw arguments/results are removed when no longer needed.

## Security

- No OAuth token read from filesystem, environment, command output, or process arguments.
- No token values in Java heap-owned domain objects beyond opaque transport internals controlled by Codex.
- Redact Authorization-like values, token canaries, command output, and app-server error payloads before logs/traces/reports.
- Use loopback or OS-local IPC only; reject non-local endpoints unless explicitly approved in a later change.
- Enforce process ownership, startup timeout, shutdown timeout, bounded restart backoff, and child-process cleanup.
- Do not expose app-server control endpoints to Frontend or unauthenticated callers.
- Do not log raw pending-call arguments, tool results, `bridgeId`, app-server error bodies, or content containing secret canaries. Logs and evidence use hashed/truncated correlation values and enumerated states only.

## Testing and qualification

- Protocol fixture: deterministic fake Codex app-server supporting handshake, sync, stream, pending tool call/result continuation, reasoning, usage, cancellation, auth failure, timeout, duplicate/conflicting result, restart orphaning, and malformed response.
- Lifecycle tests: start, ready, crash, restart, stale endpoint, graceful shutdown, and no fallback.
- Redaction tests: token/header canaries absent from logs, traces, reports, and thrown errors.
- Real OAuth smoke: only after explicit operator authorization; record model/provider/transport, redacted request hash, result, and no credentials.
- Missing Codex login remains BLOCKED/needs_login, never mock PASS.

## Alternatives

1. Direct HTTP OAuth bearer from Java — rejected; it makes OpenHarness own unsupported token lifecycle and diverges from the selected Codex app-server boundary.
2. Spawn the Codex CLI separately for every model call — rejected; process churn and protocol ambiguity make lifecycle, streaming, and cancellation unreliable.
3. Local Codex app-server supervisor/client — selected; OAuth stays in the official local component while Java retains the existing provider boundary.
4. Return a tool call after `turn/completed` — rejected; app-server cannot complete until its server request receives `DynamicToolCallResponse`.
5. Execute or auto-approve inside Java — rejected; it bypasses TS policy, human approval, MCP ownership, and runtime trace semantics.
6. Asynchronous pending-turn bridge — selected; it preserves the app-server turn while keeping authorization and execution in TS Runtime.
