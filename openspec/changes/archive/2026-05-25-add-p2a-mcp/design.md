# Design: add-p2a-mcp

## Context

MCP (Model Context Protocol) is an open standard for connecting LLM apps to external tool servers. Integrating MCP gives OpenHarness access to a growing ecosystem of pre-built tool servers without each tool needing to be hand-rolled in the Java backend.

## Confirmed Decisions

### D1. MCP client lives in TS Runtime
TS Runtime spawns and manages MCP server processes. Java backend is unchanged. Rationale: keeps Java focused on enterprise gateway concerns; avoids cross-language process management.

### D2. stdio transport only (P2a)
HTTP/SSE transport deferred to a future change. Most ecosystem MCP servers use stdio.

### D3. Tool merge: catalog priority on name conflict
TS Runtime merges Java catalog tools with MCP tools per conversation. If a name collides, catalog wins (MCP tool dropped, warning logged). Each tool is tagged internally with `source: "catalog" | "mcp:{server}"` for routing; the source tag is NOT sent to the model or to Java.

### D4. catalogVersion / catalogHash unchanged
catalogVersion/Hash continue to describe only Java catalog tools. MCP tools do not participate in catalog hashing. This preserves the existing P0a contract and ToolExecutionService validation logic unchanged.

### D5. Policy evaluation: Java unchanged, MCP tools fall through to default ALLOW
- TS Runtime calls `evaluatePolicy` for ALL tool calls (catalog + MCP).
- Java's PolicyService default branch returns ALLOW for unknown tool names.
- **Known limitation**: MCP tools without `blocked_` prefix and without skill manifest entry will be allowed by default. Documented; hardening deferred.
- Mitigation provided: env var `MCP_REQUIRE_APPROVAL=true` (default false) makes TS Runtime treat all MCP tool decisions as `REQUIRE_APPROVAL` locally, regardless of Java's response. This is defense-in-depth, not a policy override.

### D6. Execution routing
After receiving model tool_calls, TS Runtime resolves source per tool name:
- `catalog` → call Java `POST /api/v1/tools/execute` (existing path)
- `mcp:{server}` → call `McpRegistry.execute(serverName, toolName, args)` and adapt result to `ToolCallResponse` shape

### D7. Configuration file
- Project root `mcp.json` (preferred), fallback to `agent-runtime/mcp.json`.
- Schema follows VSCode/Claude Desktop convention:
  ```json
  {
    "mcpServers": {
      "filesystem": {
        "command": "npx",
        "args": ["-y", "@modelcontextprotocol/server-filesystem", "/tmp"],
        "env": { "FOO": "bar" }
      }
    }
  }
  ```
- Missing config = MCP feature off (no servers loaded). No error.

### D8. Failure handling
- **Server start failure**: log error, mark server as `failed`, exclude its tools from registry. Runtime keeps starting.
- **Tool call failure**: return `{status: "error", error: { errorClass: "MCP_TOOL_ERROR", errorMessage, retriable: false }}`.
- **Server crash mid-session**: marked `unavailable`; subsequent calls return `MCP_SERVER_UNAVAILABLE`. No auto-restart in P2a.
- **Tool call timeout**: 30s default, configurable per server via `timeoutMs`.

### D9. Lifecycle
- Servers spawned at runtime startup (during `createServer()`).
- Graceful shutdown on Fastify close: kill all child processes.

### D10. Dependency
Use the official TypeScript SDK `@modelcontextprotocol/sdk` (apache-2.0). Reduces hand-rolled JSON-RPC code significantly. Pinned to exact version.

## Architecture

```
┌──────────────────────────────────────────────────────────┐
│                  TS Agent Runtime                         │
│  ┌──────────────────────────────────────────────────┐    │
│  │ ToolRegistry                                      │    │
│  │   - getFrozenCatalog() = Java catalog ∪ MCP tools │    │
│  │   - resolveSource(toolName) = "catalog" | "mcp:.."│    │
│  └────────────┬─────────────────────────────┬───────┘    │
│               │                             │            │
│         catalog tool                  mcp tool           │
│               │                             │            │
│               ▼                             ▼            │
│   ┌──────────────────┐         ┌──────────────────┐     │
│   │ Java javaClient  │         │ McpRegistry      │     │
│   │ executeTool()    │         │ execute(srv,...)  │     │
│   └────────┬─────────┘         └────┬─────────────┘     │
│            │                        │                   │
└────────────┼────────────────────────┼───────────────────┘
             │                        │
             ▼                        ▼
       Java Backend          MCP Server (stdio)
                              (child process)
```

## Out-of-scope (P3+)

- HTTP/SSE transport
- MCP resources / prompts
- Dynamic registration / hot reload
- OAuth flows
- Auto-restart on crash
- Java-side MCP awareness
- Frontend MCP server status UI
