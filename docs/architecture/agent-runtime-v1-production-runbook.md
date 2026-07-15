# Agent Runtime v1 Production Runbook

Status: operational procedure draft for the approved single-node production change. This runbook describes required operator actions and evidence packets; it does not approve production cutover, real Provider credentials, or formal 24-hour soak by itself.

## Scope

- Active change: [harden-agent-runtime-single-node-production](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/openspec/changes/harden-agent-runtime-single-node-production)
- Archived provider qualification policy change: [adopt-codex-oauth-regression-qualification](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/openspec/changes/archive/2026-07-15-adopt-codex-oauth-regression-qualification)
- Design source: [design.md](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/openspec/changes/harden-agent-runtime-single-node-production/design.md)
- OpenSpec tasks: [tasks.md](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/openspec/changes/harden-agent-runtime-single-node-production/tasks.md)
- SQLite storage boundary: [runtimeStorage.ts](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/agent-runtime/src/storage/runtimeStorage.ts)
- JSON import and quarantine boundary: [jsonImporter.ts](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/agent-runtime/src/storage/jsonImporter.ts)
- Startup reconciliation: [reconcile.ts](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/agent-runtime/src/storage/reconcile.ts)
- Formal soak fixed runner: [formalSoakRunner.ts](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/agent-runtime/src/baseline/formalSoakRunner.ts)
- Gate D supervisor/executor: [formalSoakExecution.ts](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/agent-runtime/src/baseline/formalSoakExecution.ts)
- Gate D fail-closed CLI: [formalSoakCli.ts](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/agent-runtime/src/baseline/formalSoakCli.ts)

## Operator Gates

| Gate | Required before | Evidence packet |
|---|---|---|
| Gate B | first production SQLite write / production migration promotion | production backup manifest, import report, quarantine decision, restore output, forward-fix-only marker, measured RPO/RTO |
| Gate C | model-provider/tool/security promotion | authorized Codex OAuth six-row production report, current client source binding, no-overwrite provider decision, Java sandbox + MCP matrix reports, OAuth/secret-canary negative scans, and no skipped required Codex/tool row; API-key Provider reports remain advisory and do not veto global model-regression PASS |
| Gate D start | formal 24-hour soak start | immutable active-probe preflight, exact runId/path/plan-SHA binding, and explicit start approval |
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

Every real model call requires explicit authorization. The reconciliation procedure below is read-only with respect to existing reports, does not read OAuth/API-key credentials, and makes no model call.

**Gate C required real-model family (amended 2026-07-15 via approved `adopt-codex-oauth-regression-qualification`):** official local Codex CLI/app-server + ChatGPT/Codex OAuth only. No API-key or mock fallback is allowed.

The required authorized production report must contain these six required PASS rows in canonical order:

- `codex-real-sync`
- `codex-real-reasoning`
- `codex-real-usage`
- `codex-real-stream`
- `codex-real-cancellation`
- `codex-real-redaction`

Before reuse, operators must verify production/PASS schema, report SHA-256, every row's `provider=codex-app-server`, `qualificationAuthorization=granted`, `credentialState=not-read`, the current Codex client source SHA-256, redaction evidence, and absence of credential-bearing content. Missing Codex login/transport, a required FAIL/BLOCKED row, local/mock evidence, binding drift, redaction failure, or existing decision target blocks the model-provider portion.

Required immutable inputs:

- [Codex production report](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/docs/verification/agent-runtime-v1/providers/2026-07-12-codex-app-server-production.json), expected SHA-256 `af2aee9aa03ed1d795599205936fe3f47e25bbfa3bdd3e16e317e6e0769bfad6`.
- [Codex client source](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/backend/src/main/java/org/openharness/backend/service/provider/CodexAppServerClient.java), expected current SHA-256 `08b2aa0126f78ca45aad239e20981ad06b6e796539a1edc498706f2b81833ddc` for this decision.
- [Zhipu advisory source report](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/docs/verification/agent-runtime-v1/providers/2026-07-14-zhipu-openai-compatible-production-real-runner-attempt-01.json), retained as observed `blocked` without row rewriting.

From the Agent Runtime package context, generate exactly one new decision:

```bash
pnpm --filter @openharness/agent-runtime qualification:gate-c-provider -- \
  --project-root .. \
  --codex-report docs/verification/agent-runtime-v1/providers/2026-07-12-codex-app-server-production.json \
  --codex-client-source backend/src/main/java/org/openharness/backend/service/provider/CodexAppServerClient.java \
  --advisory-report docs/verification/agent-runtime-v1/providers/2026-07-14-zhipu-openai-compatible-production-real-runner-attempt-01.json \
  --output docs/verification/agent-runtime-v1/providers/2026-07-15-gate-c-codex-oauth-provider-decision.json \
  --generated-at 2026-07-15T00:00:00.000Z
```

The CLI resolves all paths inside the canonical project root, stores only project-relative paths, parses source reports through the shared schema, hashes report/client bytes, applies the required/advisory policy, validates the decision, and writes with `wx`/`0600`. Exit `0` means required Codex evidence PASS; exit `3` means a schema-valid blocked decision was retained; exit `2` means preflight/parse/no-overwrite failure. A second identical command must exit `2` and leave the target byte-identical.

Zhipu, generic OpenAI-compatible, Anthropic, and other API-key matrices remain advisory compatibility/optimization evidence. Missing/expired credentials, unavailable provider-backed fixtures, unsupported capabilities, FAIL, or BLOCKED remain visible but do not veto global model-regression PASS. Never rewrite an advisory row PASS. A provider-specific production-qualified claim still requires that Provider's own dedicated real matrix PASS.

The model-provider decision does not close Java sandbox, MCP, OAuth security, tenant isolation, persistence/recovery, Stage 2 security/integration, Gate D, final qualification, contract freeze, or archive.

## Tool Qualification

Java sandbox qualification must cover workspace containment, output limits, timeout, policy, audit, idempotency, cancellation, and trace-ingest deduplication.

MCP qualification must use a real stdio fixture process and cover lazy initialize, stable Broker catalog exposure, reserved-name failure, virtual Skill isolation, multi-step calls, provenance, approval, timeout, crash isolation, supported cancellation, idle close/restart, and shutdown.

Required unsupported tool behavior is `blocked`, not skipped.

### MCP stable-schema Broker

The Runtime does not expose individual MCP tool names or schemas to the main model catalog. When at least one server is configured it exposes one Runtime-owned tool, `mcp_call`, with the constant envelope `{ server, tool, arguments }`. Each server is discovered through virtual Skill `mcp:<server>`; the isolated child receives only that server's normalized tool catalog and can execute only `mcp_call`. `mcp_call` is reserved: a Java catalog tool with that name blocks catalog freezing.

MCP processes are lazy. Runtime startup registers configuration but starts no MCP child. Resolving a virtual Skill or explicitly executing a Broker target starts only that server; concurrent first access shares one startup. A ready server closes after `idleTimeoutMs` (default `300000`) without use and restarts on later access. Shutdown closes all active clients. A failed start is isolated and is not automatically retried.

Example configuration:

```json
{
  "mcpServers": {
    "filesystem": {
      "command": "node",
      "args": ["/absolute/path/to/server.js"],
      "description": "Workspace file tools",
      "timeoutMs": 30000,
      "idleTimeoutMs": 300000
    }
  }
}
```

Do not place credentials in `description`. MCP children do not inherit the complete Runtime environment: only process-launch essentials (`PATH`, home/temp, Windows process-launch variables, and locale) are inherited, then that server's explicit `env` is applied. Configured `env` values are passed only to the child process and must never be copied into Skill content, model messages, trace, evidence, or error text. Agent Definitions that use MCP must allow-list `invoke_skill` for discovery and `mcp_call` for execution; old direct MCP tool names are no longer model-visible.

Java policy receives the outer `mcp_call` / `mcp:broker` identity plus the original envelope. Name-based deny and Skill approval rules evaluate the nested tool; `mcpAllowList` continues to match the nested tool name or `mcp:<server>`. An invalid envelope cannot use outer bridge identity as an allow-list fallback.

## Formal 24-hour Soak

Gate D requires an exact, separate start approval. Approval to implement or review the executor is not start approval. The 24-hour command must not run until the user approves the final `runId`, report/partial/journal/preflight paths, and current SHA-256 of the Gate D implementation plan. A later plan edit invalidates that approval. A completed PASS report still requires a second, separate promotion approval.

The production CLI performs active fail-closed checks. It connects to the loopback Java Gateway, validates health/catalog and exact no-tool/Java/stable-MCP-Broker model-fixture shapes, executes one Java sandbox time-tool probe, lazily initializes the explicit stdio MCP fixture through `mcp:qualification` and finds `qualification_echo`, checks both 2 GiB and 10% free-disk watermarks, hashes the monitoring/interruption documents, and verifies every output target is absent. It writes a mode `0600`, no-overwrite preflight artifact. The `run` command revalidates approval age, runId, current plan hash, every immutable binding, active probes, free disk, and target absence before creating the journal or spawning Runtime.

### Gate D Start Packet

Prepare a dedicated directory below `docs/verification/agent-runtime-v1/gate-d/<run-id>/`. Every path supplied to the CLI must be absolute, canonical, and inside the project root. The SQLite file and these immutable inputs must already exist:

- explicit MCP config whose `qualification` server lazily starts the reviewed real stdio fixture and advertises `qualification_echo` behind `mcp_call`;
- monitoring evidence showing that `ps`, `lsof`, and `pgrep` child-PID probes are available;
- interruption procedure stating that SIGINT/SIGTERM retains journal and partial report and never retries automatically;
- empty/new SQLite target for the production Runtime child;
- exact start approval JSON.

The approval JSON is mode `0600`, created only after explicit user authorization, and has this strict shape:

```json
{
  "schemaVersion": 1,
  "changeId": "harden-agent-runtime-single-node-production",
  "approved": true,
  "approvedBy": "<human identity>",
  "approvedAt": "<ISO-8601 timestamp>",
  "runId": "<lowercase-hyphenated-run-id>",
  "planSha256": "<current 64-character SHA-256>",
  "reason": "explicit Gate D 24-hour production start approval"
}
```

Keep Java Gateway running independently at `http://127.0.0.1:8080`. Export `OPENHARNESS_SERVICE_TOKEN` in the operator environment; never put it in argv, approval, MCP config, monitoring evidence, interruption procedure, journal, report, shell history, or review text.

Run preflight from the repository root, replacing placeholders with absolute paths:

```bash
pnpm --filter @openharness/agent-runtime qualification:gate-d-preflight -- \
  --project-root "$ROOT" \
  --run-id "$RUN_ID" \
  --approval-file "$APPROVAL" \
  --plan "$ROOT/docs/superpowers/plans/2026-07-15-agent-runtime-gate-d-production-executor.md" \
  --java-url "http://127.0.0.1:8080" \
  --mcp-config "$MCP_CONFIG" \
  --sqlite-path "$SQLITE" \
  --report "$REPORT" \
  --partial-report "$PARTIAL_REPORT" \
  --journal "$JOURNAL" \
  --preflight-output "$PREFLIGHT" \
  --monitoring-evidence "$MONITORING_EVIDENCE" \
  --interruption-procedure "$INTERRUPTION_PROCEDURE" \
  --minimum-disk-headroom-bytes 2147483648
```

Exit `0` writes the one immutable PASS preflight artifact. Exit `2` is blocked/invalid and must not be retried automatically. Inspect the artifact and confirm it contains no credential before running the same exact argument set with:

```bash
pnpm --filter @openharness/agent-runtime qualification:gate-d-run -- \
  --project-root "$ROOT" \
  --run-id "$RUN_ID" \
  --approval-file "$APPROVAL" \
  --plan "$ROOT/docs/superpowers/plans/2026-07-15-agent-runtime-gate-d-production-executor.md" \
  --java-url "http://127.0.0.1:8080" \
  --mcp-config "$MCP_CONFIG" \
  --sqlite-path "$SQLITE" \
  --report "$REPORT" \
  --partial-report "$PARTIAL_REPORT" \
  --journal "$JOURNAL" \
  --preflight-output "$PREFLIGHT" \
  --monitoring-evidence "$MONITORING_EVIDENCE" \
  --interruption-procedure "$INTERRUPTION_PROCEDURE" \
  --minimum-disk-headroom-bytes 2147483648
```

Exit `0` means a schema-valid formal PASS report was written to the fixed report target. Exit `1` means a schema-valid FAIL partial report was retained. Exit `2` means start was blocked before or during evidence setup. No exit authorizes promotion, no output is overwritten, and no failed command is retried automatically.

Run invariants:

- Duration: 24 hours.
- Sampling: every 30 seconds.
- Workload: 10,000 seeded conversations and 20 concurrent executions.
- Mix: 60% no-tool, 20% Java sandbox, 15% MCP, 5% approval/interruption.
- Restarts: TS Runtime only at hours 2, 12, and 22.
- Thresholds: not changed after approval or observation.
- Provider behavior: deterministic Java mock fixtures and real local MCP stdio only; no real Provider, OAuth, API-key, or mock-to-real fallback.
- Process boundary: supervisor starts/restarts only the production TS Runtime child on loopback port 3101; Java Gateway stays up.
- Evidence: mode `0600` append-only/fsync JSONL journal plus exactly one no-overwrite final or partial report.

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

SIGINT or SIGTERM marks `OPERATOR_INTERRUPTION`; the next bounded sampler checkpoint returns FAIL, stops admission/workers, terminates only the Runtime child, retains journal/partial evidence, and performs no automatic retry. If the journal/report target already exists, stop and preserve it byte-for-byte.

Compressed simulations used by unit tests or dry-run harnesses must be `track=local` / `local_verified` and must not be stored as Gate D production evidence. A `GateDApproval` object in code is a runtime guard only; the actual approval artifact is the review/audit record attached to the Gate D packet.

## Incident Procedures

| Incident | Required response |
|---|---|
| WAL exceeds threshold | Attempt checkpoint, stop new admission if blocked by readers, retain samples and logs. |
| Low disk | Stop new admission, preserve emergency headroom, drain terminal writes, then reconcile on restart. |
| Dead-letter outbox | Keep readiness degraded, inspect committed event identity, replay or resolve explicitly, never prune pending/retry rows. |
| Integrity failure | Stop service, preserve database/WAL files, attach integrity output, restore only through approved Gate B/forward-fix path. |
| Provider credential exposure | Revoke credential, rotate service and Provider tokens, run artifact/log negative scan, invalidate affected qualification evidence. |
| Codex report/client binding mismatch | Stop reconciliation; do not fallback or overwrite evidence. Restore the reviewed source or obtain separate authorization for a fresh Codex qualification. |
| Gate C decision target already exists | Stop and hash the existing target. Never delete/overwrite it or choose a deceptive replacement name; require a new reviewed decision path if superseding is necessary. |
| Cross-scope leakage | Stop promotion immediately, preserve report and database snapshot, open fix-only change with regression tests. |

## Final Closeout Packet

Before marking the active change `verified`, the closeout packet must include:

- Gate B production migration evidence.
- Gate C required Codex OAuth provider decision plus independent tool/security production qualification evidence; API-key Provider reports remain advisory.
- Gate D formal 24-hour report and promotion approval.
- Full TS, Java, integration, OpenSpec, dashboard, security, and qualification verification logs.
- Runtime v1 service and persistence contract freeze document.
- Independent review outcome and resolved Critical/Important findings.
