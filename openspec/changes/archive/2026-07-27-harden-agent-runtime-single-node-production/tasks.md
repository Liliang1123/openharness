## 1. Approval And Planning

- [x] 1.1 Review and explicitly approve this OpenSpec change.
- [x] 1.2 After approval, create a staged Superpowers implementation plan with strict evidence gates, a pre-cutover restore/abort gate, and post-cutover forward-fix rehearsal.
- [x] 1.3 Select a SQLite driver that satisfies the approved Unit of Work, `BEGIN IMMEDIATE`, busy-timeout, cancellation, deployment, and test-isolation contract; do not change approved soak thresholds.

## 2. Stage 1 — SQLite Durability And Recovery

- [x] 2.1 Add the single-worker SQLite storage boundary, Lifecycle Unit of Work, migration runner, readiness checks, bounded busy retry, WAL checkpoint, and low-disk protection.
- [x] 2.1a Implement the shared durable/transient SSE discriminated union and terminal vocabulary; migrate Runtime and Frontend wire parsers/types to it.
- [x] 2.2 Implement SQLite persistence for conversations/stable messages, executions, approvals, runtime events, and memory facts.
- [x] 2.3 Add deterministic, idempotent JSON import with schema validation, quarantine manifest, backup verification, and forward-only cutover instructions.
- [x] 2.4 Add startup reconciliation that terminates running/waiting executions as `EXECUTION_INTERRUPTED`, invalidates approvals, and never rebuilds runners.
- [x] 2.5 Add the full Unit of Work crash matrix, second-instance fencing, provisional-context recovery, transient-stream reconciliation, cursor watermark/replay-live, IDOR, lock contention, WAL, low-disk, migration, outbox crash-before/after-ack/dead-letter, and restart tests.
- [x] 2.5a Add shared-schema positive/negative tests for required userId and preview/eventId exclusivity, plus Frontend interrupted-terminal rendering, preview parsing, durable replay, and reconnect deduplication tests.
- [x] 2.6 Pass the Stage 1 strict production evidence, pre-cutover restore/abort, and post-cutover forward-fix gates before production Stage 2 promotion; local-only qualification preflight under 3.0 may proceed while this remains open.
- [x] 2.7 Keep Gate B marked `pending_production_evidence` until production backup/import/quarantine/restore and measured RPO/RTO artifacts pass review; allow only explicitly local-qualified work while pending.

## 3. Stage 2 — Real Provider And Tool Qualification

- [x] 3.0 Complete the local qualification preflight with fake Provider servers, a real local Java sandbox process, and real local MCP stdio subprocesses; record results only as `local_verified`, never as production qualification.
- [x] 3.1 Qualify the official local Codex CLI/app-server + ChatGPT/Codex OAuth route through the six-row authorized production matrix and no-overwrite Gate C provider-decision artifact. **Gate C required** model-provider family; mock/fallback, required FAIL/BLOCKED, or stale evidence binding vetoes PASS. (Amended 2026-07-15 via approved `adopt-codex-oauth-regression-qualification`.)
- [x] 3.2 Retain Zhipu, generic OpenAI-compatible, Anthropic, and other API-key real matrices as optional advisory compatibility/optimization evidence. Missing/expired credentials and observed FAIL/BLOCKED rows MUST NOT block global model-regression PASS and MUST NOT be relabelled PASS; a provider needs its own dedicated real matrix PASS before provider-specific production qualification.
- [x] 3.3 Qualify Java sandbox protocol tools through the fixed evidence matrix for workspace containment, output limits, timeout, policy, idempotency, cancellation, and trace-ingest deduplication.
- [x] 3.4 Qualify MCP lifecycle, catalog merge, real calls, approval, failure isolation, cancellation where supported, and shutdown.
- [x] 3.5 Fix required Codex/non-model evidence-backed contract gaps and add deterministic regression tests for each fix; record API-key advisory gaps as compatibility/optimization follow-up without release veto.
- [x] 3.6 Pass the Stage 2 strict security/integration gate, including independent Java sandbox, MCP, OAuth safety, tenant isolation, persistence/recovery, and no-secret checks, before Stage 3.

## 4. Stage 3 — Capacity, Soak, And Contract Freeze

- [x] 4.0 Run a deterministic local short baseline as supporting `local_verified` evidence; do not represent it as the formal 24-hour soak or production promotion.
- [x] 4.0a Record the extended 24-hour **local database/sampler baseline** (`local_verified`): 2,880 samples at 30-second intervals over 10,000 seeded conversation rows, with scheduled database close/reopen observations at hours 2, 12, and 22. This is supporting evidence only; it does not prove 20 concurrent Runtime executions, fixed-mix tool execution, or TS Runtime process restarts.
- [x] 4.1 Add a reproducible harness for 20 concurrent executions and 10,000 persisted conversations.
- [x] 4.1b Add one dedicated SQLite storage Worker Thread and a typed asynchronous semantic-command client; keep `better-sqlite3`, the existing schema, singleton lock, lifecycle Unit of Work, public APIs, and fixed Gate D thresholds unchanged.
- [x] 4.1c Route production bootstrap/reconciliation, lifecycle writes, scoped stores, trace outbox database operations, monitor/checkpoint, critical drain, and shutdown through the bounded P0/P1/P2 worker queue; fail closed on saturation, protocol corruption, or worker exit without in-process replacement.
- [x] 4.1d Pass worker protocol/fairness/backpressure, commit-before-publish, worker crash/restart, shutdown/join, tenant/order/outbox, event-loop heartbeat, full workspace, and mature-database 10-minute regression gates before preparing Attempt005.
- [x] 4.1e Record the user-approved `Local Trial Ready` transition, park Attempt005 without executing it, and preserve formal production qualification as a deferred future gate.
- [x] 4.2 Close Attempt005 as `deferred_by_user` without approval, active preflight, journal, partial, final report, or execution. Preserve the fixed 60/20/15/5 24-hour workload, 30-second sampling, TS-only restarts at hours 2/12/22, fresh runId, start approval, and post-result promotion approval as mandatory entry criteria for a future `Production Verified` change.
- [x] 4.3 Preserve zero cross-tenant leakage, duplicate Runtime-caused side effects, store corruption, event-order corruption, and unbounded resource growth as mandatory correctness assertions for future formal production evidence; make no present production claim.
- [x] 4.4 Document database backup/restore, migration, recovery, provider/tool qualification, and private-service deployment procedures.
- [x] 4.5 Complete fresh TypeScript, Java, integration, OpenSpec, dashboard, security, and local qualification verification for `Local Trial Ready`; move the separate formal production qualification gate to a future change.
- [x] 4.6 Freeze and document the `Local Trial Ready` service/persistence contract; keep `Production Verified` contract freeze conditional on a future formal qualification PASS.

## 5. Closeout

- [x] 5.1 Mark implementation tasks complete only after observed evidence exists.
- [x] 5.2 Sync the development dashboard to `verified` after fresh Local Trial Ready verification, without representing the state as production qualification.
- [x] 5.3 Complete the Local Trial Ready review, Project Learning Closeout, and archive closeout artifacts; preserve the production deferment in each artifact.
- [x] 5.4 Archive the OpenSpec change after approved Local Trial Ready scope closeout and update the dashboard to `archived`; require a separate future OpenSpec change for `Production Verified`.
