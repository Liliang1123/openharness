## 1. Contract-First Tests

- [x] 1.1 Add failing Frontend tests for transient thinking cleanup, terminal error visibility, collapsed summary, expansion, repeated-tool grouping, replay deduplication, and sensitive-field exclusion.
- [x] 1.2 Add failing Agent Runtime tests for five sequential persistence-mode Codex pending calls, logical `tool_call`/`tool_result` pairing, denied/error/timeout results, one terminal event, replay, and no duplicate tool execution.
- [x] 1.3 Add failing Java provider tests for five sequential pending callbacks in one turn, responder retirement, identical completion replay, overlapping/conflicting transitions, protocol failure, and redaction.

## 2. Frontend Execution Activity Group

- [x] 2.1 Implement a pure execution-activity projection keyed by durable `eventId`, `executionId`, and `toolCallId`.
- [x] 2.2 Replace permanent thinking/tool chat messages with one interactive execution group that auto-collapses on terminal state and retains safe expandable details.
- [x] 2.3 Render persistent safe `stream_error` feedback and clear busy/thinking state on every terminal path.
- [x] 2.4 Keep existing assistant messages, Approval UI, Runtime Progress Panel, Trace Tree, raw diagnostics, and unknown-field tolerance compatible.

## 3. Runtime Dynamic Tool Feedback

- [x] 3.1 Commit one logical safe `tool_result` for each Codex pending dynamic call even when stable model history persistence is intentionally disabled.
- [x] 3.2 Preserve allowed-call pairing, policy-deny semantics, terminal ordering, detached-runner behavior, replay idempotency, and sensitive payload exclusion.
- [x] 3.3 Forward only safe provider classification metadata on continuation failure and prevent duplicate tool execution or uncorrelated turn restart.

## 4. Java Codex Sequential Pending Lifecycle

- [x] 4.1 Retire each completed pending responder before registering the next distinct callback from the same app-server turn.
- [x] 4.2 Keep the same turn active across a deterministic five-call sequence and deliver exactly one response per callback.
- [x] 4.3 Preserve completion idempotency, cancellation races, timeout/orphan handling, no fallback, and credential/redaction boundaries.

## 5. Focused Verification And Review

- [x] 5.1 Run focused Frontend tests and typecheck for execution activity behavior.
- [x] 5.2 Run focused Agent Runtime pending-turn, SSE, persistence, replay, terminal-error, and typecheck verification.
- [x] 5.3 Run focused Java Codex app-server client/adapter/controller tests.
- [x] 5.4 Run canary scans proving raw arguments, results, bridge ids, headers, credentials, and provider bodies are absent from events, UI, logs, and evidence.
- [x] 5.5 Run strict OpenSpec validation, dashboard rendering/check, whitespace check, and required implementation Review.

## 6. User-Local Trial

- [ ] 6.1 Back up and hash only affected files in the user-local isolated source; do not modify the primary checkout or wrapper contract.
- [ ] 6.2 Synchronize the verified worktree files, restart through the existing `openharness` wrapper, and confirm readiness on the existing ports.
- [ ] 6.3 Run a targeted real `gpt-5.6-sol / high` browser smoke covering normal answer, model identity, sequential multi-read, terminal collapse/expand, visible errors, lifecycle logs, and safe shutdown after user acceptance.
- [ ] 6.4 Record model-provider duration separately and report that token streaming, reasoning-effort changes, skill authoring, full regression, archive, 24-hour Gate, and Production Verified remain out of scope.
