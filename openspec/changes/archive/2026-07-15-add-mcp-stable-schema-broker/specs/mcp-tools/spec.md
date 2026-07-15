## MODIFIED Requirements

### Requirement: MCP server lifecycle

The runtime SHALL register configured MCP servers without spawning them during Runtime initialization. It SHALL start and initialize only the selected server when that server's virtual Skill is resolved or its broker target is explicitly executed, cache that server's normalized tool definitions, and share one in-flight startup across concurrent first access. An MCP child MUST inherit only process-launch essentials from the Runtime host environment plus that server's explicit configured environment; Runtime service credentials and unrelated OAuth/API-key values MUST NOT be inherited implicitly. The runtime MUST close ready servers after their configured idle timeout, defaulting to 300,000 milliseconds, MUST permit restart on later explicit access, and MUST close all clients and lifecycle timers on shutdown. A failed server MUST remain isolated and MUST NOT trigger an automatic retry loop.

#### Scenario: Runtime boot starts zero MCP processes

- **GIVEN** two MCP servers are configured
- **WHEN** the Runtime initializes its MCP registry
- **THEN** both servers are registered
- **AND** neither server process is spawned

#### Scenario: First access starts only the selected server

- **GIVEN** configured servers `filesystem` and `database` are stopped
- **WHEN** virtual Skill `mcp:filesystem` is resolved
- **THEN** only `filesystem` is initialized and queried for tools
- **AND** concurrent first access shares the same startup

#### Scenario: Child environment excludes Runtime credentials

- **GIVEN** the Runtime host environment contains service, OAuth, or API-key credentials not declared for the selected MCP server
- **WHEN** that MCP child is spawned
- **THEN** those unrelated credentials are absent from the child environment
- **AND** process-launch essentials and the server's explicit configured environment remain available

#### Scenario: Idle server closes and restarts on demand

- **GIVEN** `filesystem` has been ready and unused for its idle timeout
- **WHEN** the idle reaper runs
- **THEN** its client is closed and its cached tool definitions are cleared
- **AND** a later explicit access may start `filesystem` again

#### Scenario: Server start failure is isolated

- **GIVEN** a selected MCP server entry whose command is invalid
- **WHEN** that server is first accessed
- **THEN** the failure is returned as a structured unavailable result
- **AND** unrelated configured servers remain stopped or usable independently
- **AND** the failed server is not automatically retried

#### Scenario: Graceful shutdown closes active clients

- **GIVEN** two MCP servers are running
- **WHEN** the Fastify server closes
- **THEN** both clients are closed
- **AND** the idle lifecycle timer is cleared

### Requirement: Tool catalog merge

The agent runtime SHALL keep Java catalog tools in each frozen conversation catalog and, when MCP servers are configured, add exactly one Runtime-owned `mcp_call` tool with a constant input schema containing `server`, `tool`, and `arguments`. It MUST NOT merge individual MCP tool names or schemas into a model-visible catalog. The bridge source MUST be `mcp:broker`. The Runtime MUST fail catalog freezing if the Java catalog already defines the reserved name `mcp_call`. Agent Definition allow-list filtering MAY hide `mcp_call` without changing its frozen source mapping.

#### Scenario: Configured servers add one constant bridge

- **GIVEN** any positive number of configured MCP servers with any number of tools
- **WHEN** the frozen tool catalog is computed
- **THEN** exactly one MCP-owned tool named `mcp_call` is present
- **AND** its schema contains only the stable broker envelope
- **AND** no discovered MCP tool name or schema is present

#### Scenario: Missing MCP configuration adds no bridge

- **GIVEN** zero configured MCP servers
- **WHEN** the frozen tool catalog is computed
- **THEN** Java catalog tools remain unchanged
- **AND** `mcp_call` is absent

#### Scenario: Reserved bridge conflict fails closed

- **GIVEN** the Java catalog defines `mcp_call`
- **AND** at least one MCP server is configured
- **WHEN** the frozen tool catalog is computed
- **THEN** catalog freezing fails with a reserved-name conflict

#### Scenario: Agent definition filters the bridge

- **GIVEN** the frozen catalog contains `mcp_call`
- **AND** the selected Agent Definition does not allow-list `mcp_call`
- **WHEN** the Runtime prepares model-visible tools
- **THEN** `mcp_call` is not sent to the model
- **AND** allowed Java catalog tools remain available

### Requirement: Tool execution routing by source

When the model returns a tool call, the agent runtime SHALL route Java catalog tools to Java `POST /api/v1/tools/execute`. For `mcp_call`, the runtime SHALL parse and validate the broker envelope, enforce any virtual Skill server restriction, verify the exact tool against the selected server's discovered catalog, and call `McpRegistry.execute(server, tool, arguments, ...)`. Parent and forked subagent execution MUST use the same broker validation and MCP result adaptation. The model-facing tool result SHALL retain the name `mcp_call`, while bounded trace identity MAY record the selected server and tool.

#### Scenario: Catalog tool routes to Java

- **GIVEN** the model calls Java catalog tool `get_current_time`
- **WHEN** the Runtime executes it
- **THEN** the Java client executes the tool
- **AND** no MCP server is invoked

#### Scenario: Broker call routes to selected MCP server

- **GIVEN** `filesystem` exposes `read_file`
- **WHEN** the model calls `mcp_call` with server `filesystem`, tool `read_file`, and an object argument payload
- **THEN** `McpRegistry.execute("filesystem", "read_file", ...)` is invoked
- **AND** the Java tool execution endpoint is not invoked

#### Scenario: Virtual Skill rejects cross-server routing

- **GIVEN** the forked virtual Skill is scoped to `filesystem`
- **WHEN** its child model calls `mcp_call` with server `database`
- **THEN** execution is denied before any MCP tool call

#### Scenario: Unknown target fails closed

- **GIVEN** the selected server does not advertise tool `missing_tool`
- **WHEN** `mcp_call` targets `missing_tool`
- **THEN** the Runtime returns a structured MCP target error
- **AND** no Java or MCP tool executes

### Requirement: Optional approval gate for MCP tools

The agent runtime SHALL read `MCP_REQUIRE_APPROVAL`. When set to `true`, the runtime MUST upgrade every MCP tool decision to `REQUIRE_APPROVAL` even if Java's policy returned `ALLOW`. This is a defense-in-depth opt-in; the default value MUST be `false` for backward compatibility.

#### Scenario: Opt-in forces approval for MCP tools

- Given `MCP_REQUIRE_APPROVAL=true`
- And the model calls `mcp_call` with server `filesystem`, tool `read_file`, and an object argument payload
- When policy decisions are processed
- Then the decision for `mcp_call` is upgraded to `REQUIRE_APPROVAL`
- And a pending askUser is created

#### Scenario: Default behavior unchanged for catalog tools

- Given `MCP_REQUIRE_APPROVAL=true`
- And the model calls a catalog tool that Java allowed
- When policy decisions are processed
- Then the catalog tool's decision remains `ALLOW`

## ADDED Requirements

### Requirement: MCP virtual Skill discovery

The Runtime SHALL resolve each configured MCP server as an in-memory virtual Skill named `mcp:<server>`. The virtual Skill SHALL fork an isolated subagent, SHALL include only that server's normalized tool names, descriptions, and input schemas in its instructions, and SHALL make only `mcp_call` available for MCP execution. Configuration environment values and credentials MUST NOT enter the Skill content, model catalog, trace, or error details.

#### Scenario: Virtual Skill contains one server catalog

- **GIVEN** `filesystem` and `database` are configured
- **WHEN** `mcp:filesystem` is resolved
- **THEN** its instructions contain the normalized `filesystem` tool catalog
- **AND** do not contain `database` tool schemas or either server's environment values

#### Scenario: Unknown virtual Skill does not spawn a server

- **GIVEN** no server named `missing` is configured
- **WHEN** `mcp:missing` is resolved
- **THEN** resolution fails with a bounded not-found error
- **AND** no configured server is started

### Requirement: Stable broker policy and approval

The Runtime SHALL present `mcp_call` to policy evaluation with source `mcp:broker` and the original broker envelope. Java policy MUST parse a valid Broker envelope for name-based deny and Skill approval rules, and `mcpAllowList` MUST continue to match either the nested tool name or `mcp:<nested-server>`. A malformed Broker envelope MUST NOT be allowed by matching the outer `mcp_call` or `mcp:broker` identity. When `MCP_REQUIRE_APPROVAL=true`, an otherwise allowed `mcp_call` MUST become approval-required. Approval, cancellation, timeout, untrusted provenance, history, and trace behavior SHALL remain equivalent to direct MCP execution semantics without exposing configuration secrets.

#### Scenario: MCP approval opt-in applies to broker

- **GIVEN** `MCP_REQUIRE_APPROVAL=true`
- **AND** Java policy allows a valid `mcp_call`
- **WHEN** policy decisions are processed
- **THEN** the broker decision becomes `REQUIRE_APPROVAL`

#### Scenario: Broker preserves nested MCP allow-list semantics

- **GIVEN** `mcpAllowList` contains tool `read_file` or server source `mcp:filesystem`
- **AND** a valid `mcp_call` envelope targets `filesystem/read_file`
- **WHEN** Java policy evaluates the Broker call
- **THEN** the MCP default rule treats the nested target as allow-listed
- **AND** malformed Broker arguments do not match the outer bridge identity as an allow-list fallback

#### Scenario: Cancellation reaches the selected MCP call

- **GIVEN** an approved broker call is in progress
- **WHEN** its Runtime execution is aborted
- **THEN** the abort signal reaches the selected MCP client call
- **AND** the result is classified as `MCP_TOOL_CANCELLED`
