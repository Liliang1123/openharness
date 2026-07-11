## 1. Approval And Planning

- [x] 1.1 Review and explicitly approve this OpenSpec change.
- [x] 1.2 After approval, create a staged Superpowers implementation plan with strict evidence gates, a pre-cutover restore/abort gate, and post-cutover forward-fix rehearsal.
- [x] 1.3 Select a SQLite driver that satisfies the approved Unit of Work, `BEGIN IMMEDIATE`, busy-timeout, cancellation, deployment, and test-isolation contract; do not change approved soak thresholds.

## 2. Stage 1 — SQLite Durability And Recovery

- [ ] 2.1 Add the single-worker SQLite storage boundary, Lifecycle Unit of Work, migration runner, readiness checks, bounded busy retry, WAL checkpoint, and low-disk protection.
- [x] 2.1a Implement the shared durable/transient SSE discriminated union and terminal vocabulary; migrate Runtime and Frontend wire parsers/types to it.
- [x] 2.2 Implement SQLite persistence for conversations/stable messages, executions, approvals, runtime events, and memory facts.
- [ ] 2.3 Add deterministic, idempotent JSON import with schema validation, quarantine manifest, backup verification, and forward-only cutover instructions.
- [ ] 2.4 Add startup reconciliation that terminates running/waiting executions as `EXECUTION_INTERRUPTED`, invalidates approvals, and never rebuilds runners.
- [ ] 2.5 Add the full Unit of Work crash matrix, second-instance fencing, provisional-context recovery, transient-stream reconciliation, cursor watermark/replay-live, IDOR, lock contention, WAL, low-disk, migration, outbox crash-before/after-ack/dead-letter, and restart tests.
- [x] 2.5a Add shared-schema positive/negative tests for required userId and preview/eventId exclusivity, plus Frontend interrupted-terminal rendering, preview parsing, durable replay, and reconnect deduplication tests.
- [ ] 2.6 Pass the Stage 1 strict production evidence, pre-cutover restore/abort, and post-cutover forward-fix gates before production Stage 2 promotion; local-only qualification preflight under 3.0 may proceed while this remains open.
- [ ] 2.7 Keep Gate B marked `pending_production_evidence` until production backup/import/quarantine/restore and measured RPO/RTO artifacts pass review; allow only explicitly local-qualified work while pending.

## 3. Stage 2 — Real Provider And Tool Qualification

- [x] 3.0 Complete the local qualification preflight with fake Provider servers, a real local Java sandbox process, and real local MCP stdio subprocesses; record results only as `local_verified`, never as production qualification.
- [ ] 3.1 Qualify OpenAI-compatible sync, stream, multi-step tools, usage/cost, reasoning, retry, timeout, cancellation, and redaction through the fixed evidence matrix. **Gate C required** real-provider family.
- [ ] 3.2 **Deferred / post-Gate-C** — Qualify Anthropic sync, stream, multi-step tools, usage/cost, reasoning, retry, timeout, cancellation, and redaction through the fixed evidence matrix when Anthropic credentials are available. Missing Anthropic credentials MUST NOT block Gate C. OpenAI-compatible PASS MUST NOT mark Anthropic production-qualified. (Amended 2026-07-09 via approved `defer-anthropic-from-gate-c`.)
- [x] 3.3 Qualify Java sandbox protocol tools through the fixed evidence matrix for workspace containment, output limits, timeout, policy, idempotency, cancellation, and trace-ingest deduplication.
- [x] 3.4 Qualify MCP lifecycle, catalog merge, real calls, approval, failure isolation, cancellation where supported, and shutdown.
- [ ] 3.5 Fix only evidence-backed contract gaps and add deterministic regression tests for each fix.
- [ ] 3.6 Pass the Stage 2 strict security/integration gate before Stage 3.

## 4. Stage 3 — Capacity, Soak, And Contract Freeze

- [x] 4.0 Run a deterministic local short baseline as supporting `local_verified` evidence; do not represent it as the formal 24-hour soak or production promotion.
- [x] 4.1 Add a reproducible harness for 20 concurrent executions and 10,000 persisted conversations.
- [ ] 4.2 Run the fixed 60/20/15/5 workload for 24 hours with 30-second sampling and TS-only restarts at hours 2, 12, and 22.
- [ ] 4.3 Verify zero cross-tenant leakage, duplicate Runtime-caused side effects, store corruption, event-order corruption, and unbounded resource growth.
- [ ] 4.4 Document database backup/restore, migration, recovery, provider/tool qualification, and private-service deployment procedures.
- [ ] 4.5 Run full TypeScript, Java, integration, OpenSpec, dashboard, security, and production qualification gates.
- [ ] 4.6 Freeze and document Agent Runtime v1 service/persistence contracts.

## 5. Closeout

- [ ] 5.1 Mark implementation tasks complete only after observed evidence exists.
- [ ] 5.2 Sync the development dashboard to `verified` and render generated artifacts.
- [ ] 5.3 Complete required review and closeout artifacts.
- [ ] 5.4 Archive the OpenSpec change only after production qualification passes and update dashboard to `archived`.
