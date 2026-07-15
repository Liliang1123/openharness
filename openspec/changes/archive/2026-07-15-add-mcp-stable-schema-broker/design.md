## Context

The current Runtime eagerly connects every MCP server in `McpRegistry.init()`, re-reads every ready server's tool schemas when a conversation catalog freezes, and merges each tool name into the Java catalog. This scales model context with MCP installation size and makes name collisions part of global catalog construction.

OpenHarness already has a privileged `invoke_skill` entry, forked Skill subagents, source-aware policy evaluation, structured MCP results, cancellation, and trace propagation. The change reuses those mechanisms instead of introducing a second agent loop.

## Goals / Non-Goals

### Goals

- Keep the MCP portion of every main and child model catalog constant-size.
- Defer process startup and full schema discovery until one configured server is selected.
- Isolate each server's schemas and calls inside a forked virtual Skill.
- Preserve existing policy, approval, cancellation, provenance, qualification, and shutdown contracts.
- Fail closed for ambiguous reserved names and invalid broker targets.

### Non-Goals

- Persisting MCP sessions across Runtime restarts.
- Dynamic config reload while the Runtime is running.
- Inferring read-only or destructive permissions from arbitrary MCP metadata.
- Calling real paid models or rerunning the formal 24-hour workload.
- Archiving this change or the active production-hardening change.

## Decisions

### Decision: one reserved constant-schema bridge

When at least one MCP server is configured, `ToolRegistry` adds exactly one `mcp_call` definition:

- `server`: non-empty string
- `tool`: non-empty string
- `arguments`: object

The tool source is `mcp:broker`, its permission is `sensitive`, and its schema never embeds server names or MCP tool schemas. If the Java catalog already defines `mcp_call`, catalog freezing fails closed because routing ownership would be ambiguous.

Individual MCP tools are never merged into the model catalog. This deliberately breaks the old direct-tool exposure contract while preserving `McpRegistry.execute(server, tool, ...)` as an internal qualification API.

### Decision: virtual Skills provide bounded discovery

`invoke_skill` resolves names beginning with `mcp:` through `McpRegistry` before filesystem Skill lookup. A configured server becomes an in-memory Skill with:

- name `mcp:<server>`;
- configured description or a deterministic default;
- `fork_agent: true`;
- `tools_required: [mcp_call]`;
- instructions containing the target server's normalized tool catalog.

Resolving the virtual Skill starts and discovers only that server. The subagent dispatcher receives a target restriction and filters child tools to `mcp_call`; broker execution rejects a different server even if the model supplies one. Full schemas therefore enter only the isolated child context.

### Decision: lazy lifecycle with an injectable idle clock

`McpRegistry.init()` registers configured records and starts no process. `getVirtualSkill()` and `execute()` call a shared single-flight `ensureStarted(server)` method. Successful discovery caches normalized definitions and updates `lastUsedAt`.

Each server uses `idleTimeoutMs` from config or a 300,000 ms default. An unreferenced timer periodically calls a deterministic `reapIdleServers(now)` seam. Idle ready clients are closed, cached tools are cleared, and the record returns to `stopped`; later access starts it again. Runtime shutdown clears the timer and closes all clients.

Concurrent first access shares one startup promise. A failed startup becomes a structured unavailable result but is retryable on a later explicit access; there is no automatic retry loop.

MCP children inherit only process-launch essentials from the Runtime host environment (`PATH`, home/temp, Windows launch variables, and locale), then receive the selected server's explicit `env`. Runtime service credentials and unrelated OAuth/API-key variables are not inherited implicitly. Explicit server `env` values remain subject to Skill, result, and error redaction.

### Decision: broker policy and result identity

Policy evaluation sees tool name `mcp_call`, source `mcp:broker`, and the original JSON arguments. Java derives the bounded nested server/tool for existing name-based deny, Skill approval, and `mcpAllowList` matching; malformed envelopes fail closed instead of inheriting an outer bridge allow entry. `MCP_REQUIRE_APPROVAL=true` continues to upgrade an allowed broker call to approval-required.

Execution validates the envelope, exact configured server, target restriction, and discovered tool membership before `tools/call`. The tool result message keeps model-facing name `mcp_call`; the MCP response and trace attributes include bounded `mcpServer` and `mcpTool` identity without copying credential-bearing environment values or full arguments.

### Decision: preserve a compatibility seam, not legacy model exposure

Qualification code may still call `McpRegistry.execute(server, tool, ...)`. The Gate D model fixture and approval oracle move to the broker envelope. No compatibility alias exposes old direct MCP names to models because doing so would restore unstable schema growth and collision ambiguity.

## Alternatives Considered

- Keep direct schemas and only make startup lazy: rejected because the model catalog still grows with every MCP tool.
- Add a model-visible list-tools operation: rejected because full schemas would return to the main conversation history.
- Deliver bridge and virtual Skills in separate changes: rejected because the intermediate bridge would lack bounded discovery and would not close the approved architecture slice.

## Risks / Trade-offs

- Existing Agent Definitions may deny the new bridge. Mitigation: document the allow-list migration and cover default/full and explicit allow-list behavior in tests.
- A virtual Skill starts a server before the child model call. Mitigation: only the selected server starts, startup is single-flight, and failures remain isolated and structured.
- The current subagent dispatcher routes child tools only to Java. Mitigation: add a narrow Runtime executor callback for `mcp_call`; keep all other child tools on the existing Java path.
- Idle timers can make tests flaky. Mitigation: expose deterministic `reapIdleServers(now)` behavior and use injected time/client factories in unit tests.

## Migration Plan

1. Add RED tests for stable catalog, reserved-name failure, lazy lifecycle, virtual Skill isolation, broker routing, approval, and Gate D fixture behavior.
2. Implement registry lifecycle and virtual Skill resolution.
3. Implement Runtime-owned bridge catalog and execution in parent and forked child paths.
4. Migrate Gate D deterministic fixtures and operator documentation.
5. Run focused, Runtime-full, workspace-full, OpenSpec, dashboard, security-string, and whitespace verification.

Rollback before archive restores direct MCP merge/routing and eager startup together. Partial rollback is prohibited because a direct catalog paired with broker-only routing, or a bridge paired with eager global discovery, would violate the accepted contract.

## Open Questions

None. The user approved this design boundary on 2026-07-15.
