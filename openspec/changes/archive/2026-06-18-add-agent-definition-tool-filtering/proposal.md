# Change: Agent Definition Tool Filtering

## Why
Agent Definition can now be selected per chat turn and can bind `promptRef`, but its `tools` allow-list is still metadata. The next small slice should make selected Agent Definition tools constrain which frozen tools are visible to the model and prevent out-of-definition tool calls from executing.

## What Changes
- Use the selected `AgentDefinition.tools` list as a per-turn tool allow-list.
- Filter the frozen Java catalog + MCP merged tool list before sending tools to Java `/api/v1/model/chat`.
- Preserve existing default-agent behavior by keeping default definition tools aligned with current default tool exposure.
- Fail closed when a model returns a tool call that is not allowed by the selected definition for that turn.
- Keep ToolRegistry source routing and catalog freeze semantics unchanged; filtering happens as a model-visibility/runtime guard layer after the frozen catalog is available.

## Out of Scope
- Java policy rule changes.
- Java Tool Catalog changes.
- MCP server configuration or `mcpAllowList` changes.
- YAML support.
- SDK changes.
- Frontend UI.
- Remote CRUD APIs.
- Hot reload.
- Tenant-scoped dynamic definitions.
- Java model router or `AgentDefinition.model` enforcement.

## Impact
- Affected specs: `agent-definition`, `mcp-tools`
- Affected code: `agent-runtime/src/agentDefinitionLoader.ts`, `agent-runtime/src/agentExecutionRunner.ts`, targeted tests under `agent-runtime/test/`
- Compatibility: existing chat requests that use the default agent should keep current model-visible tools.
