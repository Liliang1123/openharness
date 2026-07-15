# Change: Add MCP stable-schema Broker

## Why

OpenHarness currently starts every configured MCP server during Runtime boot and injects every discovered MCP tool schema into each frozen model catalog. Tool count and schema volume therefore grow with installed servers, MCP startup failures affect boot-time work, and same-name tools require lossy global conflict handling.

The approved OpenClacky-parity direction is to keep the main Agent context stable: expose one Runtime-owned MCP bridge, move per-server discovery into isolated virtual Skills, and start MCP processes only when a server is actually used.

## What Changes

- **BREAKING** Stop exposing individual MCP tool names and schemas directly in model-visible catalogs.
- Add a reserved Runtime-owned `mcp_call(server, tool, arguments)` bridge with a constant schema independent of configured servers and discovered tools.
- Represent each configured MCP server as a virtual `mcp:<server>` Skill whose forked subagent receives only that server's tool catalog and can call only the fixed bridge.
- Change MCP lifecycle from eager startup to lazy per-server startup, with a default five-minute idle close and restart-on-demand behavior.
- Preserve policy, `MCP_REQUIRE_APPROVAL`, cancellation, provenance, trace, structured failure, and direct registry qualification semantics across broker calls.
- Migrate the Gate D deterministic MCP fixture from direct tool calls to `mcp_call` without rerunning the already completed 24-hour local baseline.

## Impact

- Affected specs: `mcp-tools`, `policy-evaluate`
- Affected code: Runtime MCP registry, tool registry, skill resolution, subagent execution, Agent execution routing, legacy loop routing, Gate D fixture, MCP configuration, tests, Runtime runbook, and development dashboard.
- Migration: Agent Definitions that previously allow-listed direct MCP tool names must allow-list `invoke_skill` and `mcp_call`; callers use virtual Skill `mcp:<server>` for discovery.
- Production authority: this change does not start the formal Gate D workload, promote a production result, call a paid model, archive OpenSpec, commit, or push.
