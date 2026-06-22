# @openharness/agent-runtime

TypeScript Agent Runtime for OpenHarness. Owns the agent loop, message history, tool registry, and MCP integration.

## Quick Start

```bash
pnpm install
pnpm dev    # starts on http://localhost:3001
pnpm test
pnpm typecheck
```

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3001` | HTTP port |
| `HOST` | `0.0.0.0` | Bind host |
| `JAVA_BACKEND_URL` | `http://localhost:8080` | Java gateway URL |
| `OPENHARNESS_SERVICE_TOKEN` | `dev-service-token` | Service token for Java auth |
| `FRONTEND_URL` | `http://localhost:5173` | CORS origin |
| `HISTORY_STORE` | `file` | `memory` or `file` |
| `HISTORY_DATA_DIR` | `data/sessions` | Path for JSON history persistence |
| `COMPRESSION_AUTO` | `true` | Enable auto-compression of history |
| `COMPRESSION_THRESHOLD` | `8000` | Token threshold to trigger compression |
| `KEEP_RECENT_MESSAGES` | `6` | Number of recent messages preserved during compression |
| `MCP_REQUIRE_APPROVAL` | `false` | When `true`, force every MCP tool call to require user approval |

## MCP (Model Context Protocol) Integration

The runtime can connect to external MCP servers and expose their tools to the agent.

### Configuration

Create `mcp.json` at the project root (preferred) or `agent-runtime/mcp.json`:

```json
{
  "mcpServers": {
    "filesystem": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-filesystem", "/tmp"],
      "env": { "FOO": "bar" },
      "timeoutMs": 30000
    }
  }
}
```

If no `mcp.json` exists, MCP is disabled (no error).

### How It Works

1. On startup, the runtime reads `mcp.json` and spawns each configured server as a stdio child process.
2. It performs the MCP `initialize` handshake and calls `tools/list` to discover available tools.
3. MCP tools are merged with the Java catalog when freezing per-conversation tool list.
4. The merged list is sent to the model. The model does not know which tool came from where.
5. When the model invokes a tool, the runtime routes by source:
   - `catalog` → Java `POST /api/v1/tools/execute`
   - `mcp:{server}` → MCP server `tools/call`
6. On Fastify shutdown, all MCP child processes are killed.

### Conflict resolution

If a name conflict exists between the Java catalog and an MCP server, the **catalog tool wins** and the MCP version is dropped (with a warning logged).

### Failure handling

- **Server start failure**: logged; the failed server's tools are not exposed; runtime continues to start.
- **Tool call timeout**: returns `MCP_TOOL_TIMEOUT` error response (status `timeout`). Default 30s; configurable per server via `timeoutMs`.
- **Server crash mid-session**: marked `unavailable`; subsequent calls return `MCP_SERVER_UNAVAILABLE`. No auto-restart in P2.

### MCP source policy (add-p3c-policy-mcp-aware)

TS Runtime now passes `source: "mcp:{server-name}"` for each MCP tool call in the `evaluatePolicy` request. Java `PolicyService` defaults MCP-sourced tools to `REQUIRE_APPROVAL` (source `MCP_DEFAULT`) unless the tool name or server is in `PolicyContext.mcpAllowList`.

`MCP_REQUIRE_APPROVAL=true` remains a **hard override** for organization-level forced approval, independent of Java's default rule.

## Sessions API

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/v1/sessions` | List sessions for current tenant |
| GET | `/api/v1/sessions/:conversationId` | Fetch session messages |
| DELETE | `/api/v1/sessions/:conversationId` | Delete session and chunk files |

## Out of Scope (P2)

- HTTP/SSE MCP transport (only stdio)
- MCP resources / prompts (only tools)
- Dynamic MCP server registration / hot reload
- OAuth flows for MCP servers
- Auto-restart of crashed MCP servers
- Frontend MCP server status UI
