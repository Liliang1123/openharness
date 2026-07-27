# Change: Harden Agent Runtime for Single-Node Production

## Why

OpenHarness Agent Runtime already has a broad functional MVP: bounded multi-step execution, streaming and replay, approvals, memory, context assembly, provider routing, MCP, subagents, and runtime observability. Its remaining blocker is production reliability rather than another feature surface.

The current durable state is split between JSON and in-memory stores, interrupted executions cannot be reconciled from one transactional authority, and provider/tool confidence is dominated by deterministic tests. Before platform login, model configuration, and richer session UI build on this runtime, the project needs a stable single-node v1 foundation with explicit release gates.

The first production-equivalent Gate D attempts later confirmed a second reliability boundary: synchronous `better-sqlite3` work on the Node main thread can delay durable admission under the fixed mature workload even when correctness remains clean. R6–R9 eliminated page-cache, lifecycle batching, separate checkpoint ownership, and isolated trace-transition chunking as sufficient remediations. The approved recovery is therefore an asynchronous single-writer storage boundary, not relaxed qualification thresholds.

## What Changes

### Transactional durable runtime state

- Add a SQLite-backed storage boundary for conversations, stable messages, executions, approvals, runtime events, and memory facts.
- Add ordered schema migrations, startup integrity checks, WAL configuration, and a one-way JSON import path.
- Make SQLite the sole write authority after cutover; do not dual-write JSON and SQLite.

### Deterministic restart recovery

- Reconcile persisted execution state before accepting traffic.
- Invalidate pending approvals across restart and terminate persisted `running` or `waiting_approval` executions as `EXECUTION_INTERRUPTED`.
- Keep terminal executions terminal and never reconstruct runners or silently replay side effects.
- Retain durable per-conversation event cursors for session replay.

### Real provider and tool qualification

- Qualify the official local **Codex CLI/app-server + ChatGPT/Codex OAuth** route as the **Gate C required** real-model family (approved 2026-07-15 via `adopt-codex-oauth-regression-qualification`).
- Retain Zhipu, generic OpenAI-compatible, Anthropic, and other API-key real matrices as advisory compatibility/optimization evidence. Their missing/expired credentials and observed FAIL/BLOCKED rows do not veto global model-regression PASS and are never relabelled PASS.
- Qualify both Java sandbox protocol tools and MCP external tools through real multi-step Runtime executions.
- Verify sync, stream, reasoning, usage, cancellation, redaction, OAuth safety, approval policy, provenance, and no-fallback behavior on the required Codex route; keep provider-specific API matrices truthful for their own protocols.

### Single-node release gate

- Add a reproducible qualification harness for 20 concurrent executions, 10,000 persisted conversations, and a 24-hour soak.
- Inject restarts and verify no cross-tenant leakage, duplicate side effects, event-order corruption, store corruption, or unbounded resource growth.
- Freeze the Agent Runtime v1 service and persistence contracts after all gates pass.

### Local trial adoption

- Treat the reviewed dedicated-Worker runtime as `Local Trial Ready` for project-owner self-use and feedback-driven iteration.
- Defer the prepared formal 24-hour Gate D Attempt005 by explicit user decision on 2026-07-27; do not relabel the deferred run as PASS or delete its future production-promotion contract.
- Keep `Production Verified`, Dashboard `verified`, contract freeze, closeout, and archive unavailable until the user explicitly resumes production qualification and the remaining evidence passes.

### Dedicated SQLite storage worker

- Keep `better-sqlite3`, the current SQLite schema, one Runtime process, one database file, and one durable write authority.
- Move all SQLite connection ownership, migrations, integrity/reconciliation, lifecycle transactions, scoped queries, outbox state transitions, checkpointing, and close into one dedicated Worker Thread.
- Replace main-thread synchronous database access with typed asynchronous semantic commands; do not expose raw SQL, transaction callbacks, or SQLite handles across the worker boundary.
- Preserve commit-before-publish, lifecycle atomicity, tenant/user isolation, durable cursor order, at-least-once trace delivery, existing public API schemas, and the fixed Gate D thresholds.
- Fail closed on bounded queue saturation or unexpected worker exit; do not restart the storage worker inside the same Runtime process.

### Private service boundary

- Keep Agent Runtime private behind a trusted platform gateway.
- Continue requiring injected tenant, user, trace, and request identity.
- Do not add temporary end-user login or provider credentials to Runtime or Frontend.

## Impact

### Affected specs

- `agent-runtime`: durable lifecycle state, restart reconciliation, private-service readiness, and production qualification.
- `agent-sse`: explicit transient preview versus durable event envelopes, approvalId, and at-least-once reconnect semantics.
- `shared-schema`: add `EXECUTION_INTERRUPTED` to eval/recovery terminal reason contracts while preserving existing values.
- `message-history`: SQLite stable-message persistence and JSON import semantics.
- `long-term-memory`: SQLite memory fact persistence and scope isolation.
- `provider-adapter`: auditable required Codex OAuth Gate C qualification, advisory API-key matrices, no fallback, and credential redaction.
- `mcp-tools`: auditable real MCP lifecycle and tool-call qualification.
- `backend-gateway`: real sandbox-tool qualification requirements.

### Affected implementation areas

- `agent-runtime/src/`: storage boundary, dedicated SQLite Worker Thread and typed RPC client, SQLite stores, migration runner, startup recovery, server lifecycle, execution/approval/event persistence.
- `packages/shared-schema/src/`: durable/transient SSE discriminated union and shared terminal vocabulary.
- `frontend/src/`: consume the shared wire union, distinguish transient previews from durable replay events, and render interrupted terminal state.
- `agent-runtime/test/` and `integration-tests/`: migration, crash recovery, real provider/tool qualification, security, load, and soak harnesses.
- `packages/shared-schema/test/` and `frontend/test/`: wire-schema negative tests, preview/replay parsing, reconnect deduplication, and interrupted rendering.
- `backend/src/`: only changes required to close verified provider, sandbox, cancellation, retry, or redaction gaps.
- runtime operations/configuration docs for database path, backups, migrations, qualification credentials, and recovery.

### Breaking and migration considerations

- Durable writes move from JSON/in-memory authorities to SQLite.
- Existing JSON conversations and memory require a deterministic, idempotent import path with backup and rollback instructions.
- Running and waiting-approval executions interrupted by process death become explicitly terminal; pending approvals are invalidated and are not silently resumed.
- Streaming fragments are transient previews without durable cursors; only final messages and terminal events become durable.
- Approval clients receive a non-sensitive `approvalId`; raw Java approval tokens stay in Runtime memory.

## Risk

Strict. This change affects persistence, recovery, provider credentials, external tool side effects, cross-tenant isolation, and release qualification. Mock-only evidence cannot satisfy real provider, real tool, migration, recovery, or soak acceptance.

## Delivery Profile

- Evidence profile: `strict`.
- Batch profile: `staged`.
- Stage 1: SQLite durability and recovery.
- Stage 2: real provider/tool qualification and security.
- Stage 3: capacity/soak gate and Runtime v1 contract freeze.
- Qualification state is dual-track: deterministic fake-provider plus real local Java/MCP chains may reach `local_verified` while production Gate B remains pending; only production migration, real-provider, deployment, and formal-soak evidence may reach `production_verified`.
- `local_verified` never authorizes production SQLite cutover, production credentials, production promotion, or OpenSpec archive.
- The current adoption state is `Local Trial Ready`. Project-owner trial use is permitted without executing the deferred formal soak, while all production claims and lifecycle transitions remain gated.

## Review Resolutions

- Production is one TS Runtime process/worker; lifecycle writes use a shared Unit of Work and `BEGIN IMMEDIATE`.
- The 24-hour soak restarts only TS Runtime; Java Gateway remains alive. Gateway restart durability is outside this change.
- The main Runtime thread retains HTTP/SSE, Agent Loop, Java/MCP I/O, and the singleton lock; one dedicated Worker Thread exclusively owns the SQLite connection. The approved queue has exclusive P0 startup/drain/shutdown work, P1 lifecycle/scoped request work, and P2 outbox/maintenance work, with a 2,048-command bound and one eligible P2 command after at most 32 P1 commands.
- An unexpected storage-worker exit rejects outstanding storage commands, marks Runtime unready, stops new admission, and terminates the Runtime process for normal startup reconciliation; in-process worker replacement is forbidden.
- Java trace delivery remains on the main thread with the existing batch/concurrency contract. Claim and whole-batch outcome transitions execute in the storage worker; the rejected transition-chunking crash boundary is not introduced.
- Real provider/tool qualification is separate from deterministic soak and uses a fixed evidence matrix with no mock fallback.
- SQLite cutover is forward-fix only after the first SQLite write; binary rollback is allowed only before that point and requires an explicit human gate.
- JSON import quarantines invalid records after schema validation instead of aborting the entire import.
- Approval tokens are memory-only secrets; durable state stores only an HMAC digest and invalidates it on restart.
- WAL, lock contention, low-disk protection, tenant-scoped cursor lookup, streaming durability, redaction, and fixed soak thresholds are normative in the design/spec deltas.

## Non-Goals

- Multi-node high availability, distributed execution, or PostgreSQL deployment.
- User login, tenant administration, browser sessions, or platform UI.
- Model configuration UI or credentials in TypeScript Runtime/Frontend.
- SDK, Agent Definition management UI, or unrelated capability expansion.

## Approval Gate

Implementation MUST NOT begin until this proposal and its design/spec deltas are reviewed and explicitly approved. After approval, create a staged Superpowers implementation plan with exact migrations, rollback, real-environment evidence, and soak promotion gates.

The dedicated SQLite storage-worker amendment was explicitly approved on 2026-07-27. It adds no database migration and does not relax any Gate D threshold.

The local-trial transition was explicitly approved on 2026-07-27. It defers formal Gate D and production closeout while preserving their evidence contracts; it does not modify Runtime behavior or historical qualification results.
