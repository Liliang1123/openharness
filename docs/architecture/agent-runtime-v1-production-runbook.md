# Agent Runtime v1 Production Runbook

Status: operational procedure draft for the approved single-node production change. This runbook describes required operator actions and evidence packets; it does not approve production cutover, real Provider credentials, or formal 24-hour soak by itself.

## Scope

- Active change: [harden-agent-runtime-single-node-production](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/stage0-runtime-production-closeout/openspec/changes/harden-agent-runtime-single-node-production)
- Design source: [design.md](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/stage0-runtime-production-closeout/openspec/changes/harden-agent-runtime-single-node-production/design.md)
- OpenSpec tasks: [tasks.md](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/stage0-runtime-production-closeout/openspec/changes/harden-agent-runtime-single-node-production/tasks.md)
- SQLite storage boundary: [runtimeStorage.ts](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/stage0-runtime-production-closeout/agent-runtime/src/storage/runtimeStorage.ts)
- JSON import and quarantine boundary: [jsonImporter.ts](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/stage0-runtime-production-closeout/agent-runtime/src/storage/jsonImporter.ts)
- Startup reconciliation: [reconcile.ts](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/stage0-runtime-production-closeout/agent-runtime/src/storage/reconcile.ts)
- Formal soak preflight harness: [formalSoakRunner.ts](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/stage0-runtime-production-closeout/agent-runtime/src/baseline/formalSoakRunner.ts)

## Operator Gates

| Gate | Required before | Evidence packet |
|---|---|---|
| Gate B | first production SQLite write / production migration promotion | production backup manifest, import report, quarantine decision, restore output, forward-fix-only marker, measured RPO/RTO |
| Gate C | real Provider credential calls | approved credential source, **OpenAI-compatible** real Provider matrix report (Gate C required family), Java sandbox + MCP matrix reports, secret-canary negative scan, no skipped **required** row; Anthropic real matrix is deferred/post-Gate-C and MUST NOT alone block Gate C |
| Gate D start | formal 24-hour soak start | passed operator-attested preflight and explicit start approval |
| Gate D promotion | Runtime v1 soak promotion | immutable 24-hour report, threshold audit, failed-partial-report check, and explicit promotion approval |

Local evidence can support readiness, but it must remain `local_verified`. It must not be renamed to production evidence.

## Private-Service Deployment

Agent Runtime v1 is a private service behind the platform gateway. Production deployment must set service authentication before reading tenant state.

Required controls:

- Enable `AGENT_RUNTIME_REQUIRE_SERVICE_AUTH=true`.
- Set a non-default `OPENHARNESS_SERVICE_TOKEN` through the deployment secret manager.
- Require `X-Tenant-Id`, `X-User-Id`, `X-Trace-Id`, and `X-Request-Id` on every business request.
- Reject body/query identity overrides.
- Run exactly one TS Runtime process against one SQLite authority.
- Keep Java Gateway running independently during runtime restarts and formal soak.

Rotation procedure:

1. Add a new gateway-to-runtime service token in the secret manager.
2. Deploy Runtime with the new token while the gateway routes only authenticated traffic.
3. Rotate gateway callers to the new token.
4. Remove the old token after traffic and logs confirm no old-token requests remain.
5. Run a negative scan over runtime logs and qualification artifacts for raw bearer material.

## Backup, Import, Restore, And Cutover

Before first production SQLite write:

1. Freeze new production Runtime admissions at the gateway.
2. Capture immutable legacy JSON sources and record SHA-256 in the production backup manifest.
3. Run deterministic JSON import into a prepared SQLite database.
4. Persist import report, quarantine manifest, and cutover marker.
5. If quarantine is non-empty, stop automatic cutover until a human accepts the exact data gap.
6. Rehearse restore from the captured backup and record observed RTO.
7. Measure latest successful backup RPO.
8. Attach all artifacts to Gate B review before allowing any real SQLite write.

Abort path before first SQLite write:

- Restore the legacy JSON backup.
- Redeploy the pre-cutover binary.
- Verify session/history reads from the restored source.
- Record observed RTO and compare it to the approved target.

After first SQLite write:

- Rollback to the old binary is forbidden.
- Use forward-fix only.
- Keep the cutover marker and backup manifest immutable.
- Repair data through explicit migration or operator-approved correction scripts, then attach a follow-up evidence record.

## Migration And Startup Recovery

Startup must remain fail-closed:

1. Acquire the singleton lock beside the SQLite database.
2. Run schema migration.
3. Run `PRAGMA integrity_check`.
4. Enable WAL and foreign keys.
5. Execute startup reconciliation before readiness.
6. Mark `running` and `waiting_approval` executions as `EXECUTION_INTERRUPTED`.
7. Invalidate pending approvals.
8. Do not rebuild runners or replay model/tool side effects.
9. Degrade readiness if durable trace outbox rows reach dead-letter state.

Failure handling:

- Migration or integrity failure: keep the Runtime unready, preserve database and WAL files, and escalate to operator review.
- Singleton lock failure: do not start a second Runtime; keep the process unready or exit.
- Low disk warning: stop new admission and preserve emergency headroom for terminal writes.
- Critical disk state: drain in-flight terminal writes where possible, then exit for startup reconciliation.

## Provider Qualification

Gate C is required before any real Provider credential is used.

**Gate C required real-provider family (amended 2026-07-09 via `defer-anthropic-from-gate-c`):** OpenAI-compatible Chat Completions only. Anthropic Messages real matrix is **deferred / post-Gate-C**; missing Anthropic credentials MUST NOT by themselves block Gate C. OpenAI-compatible PASS MUST NOT mark Anthropic production-qualified.

Production OpenAI-compatible qualification must cover:

- sync response
- streaming response
- single-step and multi-step tool calls
- structured arguments
- reasoning-capable model behavior where required
- provider usage counters
- cost recomputation
- retry, timeout, cancellation, and terminal errors
- redacted request hash and environment fingerprint
- secret-canary negative scan

Missing OpenAI-compatible credentials, unsupported required capability, skipped required row, or redaction failure blocks Gate C PASS. Fake Provider evidence stays local-only. When Anthropic credentials later exist, run a separate deferred Anthropic real matrix before declaring Anthropic production-qualified.

## Tool Qualification

Java sandbox qualification must cover workspace containment, output limits, timeout, policy, audit, idempotency, cancellation, and trace-ingest deduplication.

MCP qualification must use a real stdio fixture process and cover initialize, catalog merge, conflict handling, multi-step calls, provenance, approval, timeout, crash isolation, supported cancellation, and shutdown.

Required unsupported tool behavior is `blocked`, not skipped.

## Formal 24-hour Soak

Gate D approval is required before start.

Preflight is an operator-attested checklist input. The library validates the supplied fields and produces stable blocked reasons; it does not automatically connect to Java Gateway, inspect monitoring, or measure disk unless a caller wires those probes before invoking it.

Preflight must confirm:

- Java Gateway remains running.
- Deterministic Provider/tool fixtures are ready.
- Disk headroom is sufficient.
- Report path is fixed.
- Monitoring is active.
- Interruption procedure is documented.

Run invariants:

- Duration: 24 hours.
- Sampling: every 30 seconds.
- Workload: 10,000 seeded conversations and 20 concurrent executions.
- Mix: 60% no-tool, 20% Java sandbox, 15% MCP, 5% approval/interruption.
- Restarts: TS Runtime only at hours 2, 12, and 22.
- Thresholds: not changed after approval or observation.

Hard stop conditions:

- cross-scope leak
- duplicate Runtime-caused side effect
- SQLite integrity failure
- duplicate durable row or sequence
- event ordering corruption
- secret leak
- unexpected process exit
- reconciliation failure
- exhausted `SQLITE_BUSY` retry budget
- sustained five-minute threshold breach
- first/last two-hour median RSS or FD growth over 10%

On failure, retain the partial report and do not promote. On pass, request explicit human promotion approval before Runtime v1 freeze.

Compressed simulations used by unit tests or dry-run harnesses must be `track=local` / `local_verified` and must not be stored as Gate D production evidence. A `GateDApproval` object in code is a runtime guard only; the actual approval artifact is the review/audit record attached to the Gate D packet.

## Incident Procedures

| Incident | Required response |
|---|---|
| WAL exceeds threshold | Attempt checkpoint, stop new admission if blocked by readers, retain samples and logs. |
| Low disk | Stop new admission, preserve emergency headroom, drain terminal writes, then reconcile on restart. |
| Dead-letter outbox | Keep readiness degraded, inspect committed event identity, replay or resolve explicitly, never prune pending/retry rows. |
| Integrity failure | Stop service, preserve database/WAL files, attach integrity output, restore only through approved Gate B/forward-fix path. |
| Provider credential exposure | Revoke credential, rotate service and Provider tokens, run artifact/log negative scan, invalidate affected qualification evidence. |
| Cross-scope leakage | Stop promotion immediately, preserve report and database snapshot, open fix-only change with regression tests. |

## Final Closeout Packet

Before marking the active change `verified`, the closeout packet must include:

- Gate B production migration evidence.
- Gate C real Provider and tool production qualification evidence.
- Gate D formal 24-hour report and promotion approval.
- Full TS, Java, integration, OpenSpec, dashboard, security, and qualification verification logs.
- Runtime v1 service and persistence contract freeze document.
- Independent review outcome and resolved Critical/Important findings.
