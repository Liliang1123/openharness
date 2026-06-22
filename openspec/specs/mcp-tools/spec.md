# mcp-tools Specification

## Purpose
TBD - created by archiving change add-p2a-mcp. Update Purpose after archive.
## Requirements
### Requirement: TS Runtime loads MCP servers from configuration

The agent runtime SHALL read `mcp.json` at startup. The configuration MUST be searched at the project root first, then `agent-runtime/mcp.json` as fallback. Missing configuration MUST be treated as zero MCP servers (no error).

#### Scenario: Project root config takes precedence

- Given both `<root>/mcp.json` and `<root>/agent-runtime/mcp.json` exist
- When the runtime starts
- Then only the project root config is used

#### Scenario: Missing config does not block startup

- Given neither `mcp.json` exists
- When the runtime starts
- Then no MCP servers are loaded
- And the runtime starts successfully with zero MCP tools

### Requirement: MCP server lifecycle

The runtime SHALL spawn each configured MCP server as a child process via stdio, perform the MCP initialize handshake, and call `tools/list` to populate the tool registry. The runtime MUST kill all spawned child processes on shutdown.

#### Scenario: Server start failure is isolated

- Given an MCP server entry whose command is invalid
- When the runtime initializes that server
- Then the failure is logged
- And the runtime continues starting other servers and the runtime itself
- And the failed server's tools are not exposed

#### Scenario: Graceful shutdown kills child processes

- Given two MCP servers are running
- When the Fastify server closes
- Then both child processes receive SIGTERM and exit

### Requirement: Tool catalog merge
The agent runtime SHALL merge Java catalog tools with MCP tools when freezing the per-conversation tool list. When a tool name appears in both sources, the catalog tool MUST win and the MCP entry MUST be dropped with a warning. The merged list given to the model MUST NOT include any internal source-tag field, and when an Agent Definition is selected the model-visible list MAY be further filtered by that definition's `tools` allow-list without changing the frozen source map used for routing allowed tool calls.

#### Scenario: Catalog wins on name conflict

- Given the catalog defines a tool named `echo`
- And an MCP server also defines a tool named `echo`
- When the merged list is computed
- Then only the catalog `echo` is present
- And a warning is logged about the dropped MCP `echo`

#### Scenario: Distinct names coexist

- Given the catalog defines `get_current_time`
- And an MCP server defines `read_file`
- When the merged list is computed
- Then both tools are present

#### Scenario: Agent definition filters model-visible merged tools

- Given the frozen merged tool list contains catalog tool `get_current_time` and MCP tool `read_file`
- And the selected Agent Definition lists only `read_file`
- When the runtime prepares tools for a model call
- Then the model-visible tools contain `read_file`
- And the model-visible tools do not contain `get_current_time`

### Requirement: Tool execution routing by source

When the model returns a tool call, the agent runtime SHALL look up the tool's source. Catalog tools MUST be executed via Java `POST /api/v1/tools/execute`. MCP tools MUST be executed via the corresponding MCP server's `tools/call` request. MCP results MUST be adapted to the existing `ToolCallResponse` shape so downstream history and trace handling is unchanged.

#### Scenario: Catalog tool routes to Java

- Given the model calls `get_current_time` (catalog tool)
- When the runtime executes it
- Then `executeTool` on the Java client is invoked
- And no MCP server is invoked

#### Scenario: MCP tool routes to MCP server

- Given the model calls `read_file` from MCP server `filesystem`
- When the runtime executes it
- Then `McpRegistry.execute("filesystem", "read_file", ...)` is invoked
- And the Java executeTool endpoint is NOT called

### Requirement: MCP tool failure produces structured error

The runtime SHALL convert MCP transport, timeout, or server errors into structured `ToolCallResponse` with `status: "error"` and an `error` object containing `errorClass` and `errorMessage`. The response MUST be appended to history and trace like any other tool result.

#### Scenario: MCP tool call timeout

- Given an MCP tool call exceeds the configured timeout
- When the runtime awaits its result
- Then a `ToolCallResponse` with `errorClass: "MCP_TOOL_TIMEOUT"` is produced
- And the conversation history records the error result

#### Scenario: MCP server crashed mid-session

- Given an MCP server process has died
- When the runtime calls one of its tools
- Then a `ToolCallResponse` with `errorClass: "MCP_SERVER_UNAVAILABLE"` is produced

### Requirement: Optional approval gate for MCP tools

The agent runtime SHALL read `MCP_REQUIRE_APPROVAL`. When set to `true`, the runtime MUST upgrade every MCP tool decision to `REQUIRE_APPROVAL` even if Java's policy returned `ALLOW`. This is a defense-in-depth opt-in; the default value MUST be `false` for backward compatibility.

#### Scenario: Opt-in forces approval for MCP tools

- Given `MCP_REQUIRE_APPROVAL=true`
- And the model calls an MCP tool `read_file`
- When policy decisions are processed
- Then the decision for `read_file` is upgraded to `REQUIRE_APPROVAL`
- And a pending askUser is created

#### Scenario: Default behavior unchanged for catalog tools

- Given `MCP_REQUIRE_APPROVAL=true`
- And the model calls a catalog tool that Java allowed
- When policy decisions are processed
- Then the catalog tool's decision remains `ALLOW`

