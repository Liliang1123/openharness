## 1. Approval And Transport Spike

- [x] 1.1 Review and explicitly approve this OpenSpec change before implementation.
- [x] 1.2 Confirm the supported local Codex app-server/CLI command, handshake, request/response, streaming, cancellation, and shutdown protocol without reading OAuth credentials.
- [x] 1.3 Record the protocol fingerprint, process ownership model, loopback/IPC boundary, and unsupported-platform behavior.
- [x] 1.4 Create a strict staged Superpowers implementation plan after approval.

## 2. Provider Contract And Configuration

- [x] 2.1 RED tests for codex-app-server provider type, openai-codex/* route resolution, model capability metadata, and no API-key fallback.
- [x] 2.2 Add provider config fields for command/args/endpoint metadata without any credential path.
- [x] 2.3 Preserve existing Zhipu/OpenAI API-key provider behavior and configuration.
- [x] 2.4 Reuse the existing ProviderUnavailableException for Task 2 fail-closed routing; defer a new needs_login type unless the later real adapter proves the existing structured error vocabulary insufficient.

## 3. Codex Process And IPC Boundary

- [x] 3.1 RED lifecycle tests for start, handshake, readiness, crash, restart backoff, timeout, graceful shutdown, and child cleanup.
- [x] 3.2 Implement Java-owned CodexProcessSupervisor with loopback/OS-local endpoint enforcement.
- [ ] 3.3 RED tests for CodexAppServerClient sync/stream/reasoning/usage conversion and `item/tool/call` remaining pending until an authenticated result is supplied.
- [ ] 3.4 Add the shared `pendingTurn` and tool-result schemas, keep `/api/v1/model/chat` as the start endpoint, and add authenticated Java result/cancel endpoints; require exactly one of message/pending/error.
- [ ] 3.5 Implement the in-memory pending-turn registry and DynamicToolCallResponse translation with exact identity binding, timeout, cancel, idempotent replay/conflict, disconnect, restart-orphan, bounded retention, and redaction semantics.
- [ ] 3.6 Update TS AgentExecutionRunner/JavaClient to keep a Codex pending call inside the same model step, retain TS policy/approval/execution ownership, submit one terminal result, and never start an uncorrelated second model turn.
- [ ] 3.7 Prove with negative tests that Java cannot execute or auto-approve tools and that OAuth tokens/pending arguments/results never enter config, logs, traces, reports, TS Runtime persistence, or Frontend.

## 4. Operator Experience

- [x] 4.1 Add local operator commands to delegate Codex login/status/logout to the official CLI/app; commands show only profile/status/expiry metadata.
- [x] 4.2 Document prerequisites, supported Codex versions, startup/shutdown, needs-login recovery, and platform limitations.
- [x] 4.3 Do not add a Frontend login UI or import ~/.codex credentials.

## 5. Verification And Qualification

- [ ] 5.1 Fake app-server matrix: handshake, sync, stream, pending tool continuation, sequential tool calls, reasoning, usage, cancellation, approval timeout, duplicate/conflicting completion, restart orphaning, auth failure, malformed response, and no-fallback assertions.
- [ ] 5.2 Secret canary tests across Java logs, traces, reports, command output, and generated evidence.
- [ ] 5.3 Authorized real OAuth smoke through local Codex app-server; missing login remains blocked.
- [ ] 5.4 Run focused Java tests, shared-schema tests if contracts change, and OpenSpec strict validation.
- [ ] 5.5 Write Review and synchronize dashboard only after evidence-backed verification.
