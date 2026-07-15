## 1. Approval And Planning

- [x] 1.1 Review and explicitly approve the stable-schema Broker, virtual Skill, lazy lifecycle, idle reaper, security, and migration design.
- [x] 1.2 Strictly validate the OpenSpec change and record proposal Review PASS.
- [x] 1.3 Create and preflight-review the Superpowers implementation plan.

## 2. Registry Lifecycle And Virtual Skill

- [x] 2.1 Add RED tests proving Runtime initialization starts zero MCP clients and first access starts only the selected server through a single-flight path.
- [x] 2.2 Implement configured server descriptors, lazy startup, cached normalized schemas, virtual `mcp:<server>` Skill resolution, and structured unknown/unavailable failures.
- [x] 2.3 Add RED tests and implement deterministic five-minute idle close, restart-on-demand, and shutdown cleanup.

## 3. Stable Broker And Runtime Routing

- [x] 3.1 Add RED tests proving N configured servers expose exactly one constant `mcp_call` schema and direct MCP tool schemas never enter the frozen catalog.
- [x] 3.2 Implement reserved-name validation, `mcp:broker` source mapping, Agent Definition filtering, and parent Runtime broker execution.
- [x] 3.3 Add RED tests and implement virtual Skill subagent isolation so only target-scoped `mcp_call` can execute through the Runtime while all non-MCP child tools keep existing Java routing.
- [x] 3.4 Preserve `MCP_REQUIRE_APPROVAL`, cancellation, structured errors, untrusted provenance, and bounded trace identity for broker calls.

## 4. Compatibility And Operations

- [x] 4.1 Migrate deterministic Gate D MCP model and approval fixtures to the broker envelope without running the formal 24-hour workload.
- [x] 4.2 Document `mcp.json` descriptions/idle timeout, Agent Definition migration, lazy lifecycle, and stable-schema behavior.
- [x] 4.3 Preserve direct `McpRegistry.execute(server, tool, ...)` qualification coverage and update affected Runtime tests.

## 5. Verification And Closeout

- [x] 5.1 Pass focused MCP, ToolRegistry, Agent runner, subagent, approval, Gate D, lifecycle, and typecheck verification.
- [x] 5.2 Pass the full Runtime and workspace regression suites without a real model call or formal Gate D run.
- [x] 5.3 Pass strict OpenSpec validation, dashboard render/check, sensitive-data scan, and `git diff --check`.
- [x] 5.4 Complete implementation Review, fix every actionable finding, rerun critical evidence, and obtain Review PASS.
- [x] 5.5 Sync dashboard status to `verified`, reconcile this checklist with observed evidence, and leave archive/commit/push unexecuted.
