# Agent Runtime Dual-Track Qualification Design

## Status

Approved by the user and independently reviewed as `通过` on 2026-07-06. Local-only implementation-plan execution may proceed; production gates remain unchanged.

## Context

The active production-hardening change has completed fixture-level Stage 1 work, while the production migration rehearsal required by Gate B is not yet available. Development must continue through the complete local chain without converting local evidence into a production claim.

Authoritative references:

- [OpenSpec proposal](file:///Users/elvis/file/develop/opensource/openharness/openspec/changes/harden-agent-runtime-single-node-production/proposal.md)
- [OpenSpec design](file:///Users/elvis/file/develop/opensource/openharness/openspec/changes/harden-agent-runtime-single-node-production/design.md)
- [OpenSpec tasks](file:///Users/elvis/file/develop/opensource/openharness/openspec/changes/harden-agent-runtime-single-node-production/tasks.md)
- [Implementation plan](file:///Users/elvis/file/develop/opensource/openharness/docs/superpowers/plans/2026-07-03-agent-runtime-single-node-production-final-plan.md)
- [Gate B evidence](file:///Users/elvis/file/develop/opensource/openharness/docs/verification/agent-runtime-v1/stage1-gate-b.md)

## Decision

Qualification uses two explicit tracks:

1. `local_verified`: deterministic local SQLite, fake Provider servers, the real locally started Java sandbox, and real local MCP subprocesses pass their fixed oracles.
2. `production_verified`: production migration evidence, real Provider qualification, production deployment evidence, and the formal soak pass their existing strict gates.

Gate B remains `pending_production_evidence`. The pending production rehearsal does not block local-only Tasks 9–12, but it continues to block the first production SQLite cutover write and any production promotion.

## Allowed Local Chain

- SQLite lifecycle, import, recovery, cursor, IDOR, WAL, and low-disk deterministic tests.
- Fake OpenAI-compatible and Anthropic servers covering protocol, retry, timeout, cancellation, usage/cost, reasoning capability handling, and redaction oracles.
- A real local Java Gateway/sandbox process with containment and trace-dedup checks.
- A real local MCP stdio subprocess covering lifecycle, catalog, multi-step calls, approval, failure isolation, cancellation capability, and shutdown.
- Deterministic local load baseline. This is supporting evidence only and is not the formal 24-hour production soak.

## Prohibited Promotion

Until the relevant human gates and strict evidence exist, the workflow MUST NOT:

- perform the first production SQLite cutover write;
- use production data or production Provider credentials;
- label fake-provider results as real-provider qualification;
- label a local baseline as the formal 24-hour soak;
- mark Gate B, Gate C, Gate D, the OpenSpec change, or dashboard status as production verified or archived.

## Evidence Model

Every report records `track` as `local` or `production`, plus environment fingerprint, protocol version, capabilities, request hash, observed result, oracle, usage/cost where applicable, duration, and result. Local reports use `local_verified`, `failed`, or `blocked`; production reports use the existing strict promotion vocabulary. No conversion from local to production status is automatic.

## Execution Order

1. Record the deferred production Gate B obligation.
2. Implement Task 9 shared report schema and redaction boundary with RED/GREEN tests.
3. Run fake-provider matrices.
4. Run real local Java sandbox and MCP subprocess matrices.
5. Run the deterministic local baseline.
6. Stop at every real credential, production migration, formal soak, and promotion gate.

## Acceptance

The local development lifecycle is complete only when the full local chain is `local_verified` and all generated artifacts pass secret-canary scans. Production readiness remains false until all deferred production gates pass independently.
