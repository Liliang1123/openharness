## Context
`add-agent-definition-loader` introduced local JSON definitions with `tools` as an allow-list field. `add-agent-definition-runtime-selection` made chat requests select a definition and bind `promptRef`, but the selected definition still does not affect tool exposure. ToolRegistry currently freezes a merged per-conversation catalog from Java catalog tools and MCP tools, then `AgentExecutionRunner.callModel()` sends `catalog.tools` to the model unchanged.

## Goals / Non-Goals
- Goals:
  - Treat selected `AgentDefinition.tools` as the per-turn model-visible tool allow-list.
  - Filter the frozen merged catalog before model calls.
  - Fail closed if a model returns a tool call not allowed by the selected definition.
  - Preserve existing default behavior for omitted `agentId` / `default-agent`.
  - Keep Java policy as the authority for allowed visible tool calls that still need policy decisions.
- Non-Goals:
  - Changing Java policy or Java catalog contracts.
  - Changing MCP server discovery, source routing, or `MCP_REQUIRE_APPROVAL` behavior.
  - Adding UI, SDK, YAML, remote CRUD, hot reload, or tenant-scoped dynamic definitions.
  - Enforcing `AgentDefinition.model`.

## Decisions
- Decision: Filtering occurs after `ToolRegistry.getFrozenCatalog()` returns the merged catalog.
  Rationale: ToolRegistry source maps, catalog version/hash, MCP conflict behavior, and per-conversation freeze semantics stay unchanged.
- Decision: The model receives only tools whose `name` appears in selected `AgentDefinition.tools`.
  Rationale: `tools` is already validated as a unique list of tool names and is definition-owned.
- Decision: Empty `tools` means no model-visible tools for that selected definition, except the built-in `default-agent` may keep current behavior by listing current default tool names.
  Rationale: Empty should be an explicit no-tools agent for custom definitions, while default-agent must preserve compatibility.
- Decision: A disallowed tool call fails closed before `beforeToolUse` or Java/MCP execution.
  Rationale: Model-visible tool filtering should not be bypassable by a malformed or stale model response.
- Decision: Unknown tool names in `AgentDefinition.tools` are tolerated at load time and simply match no frozen tool.
  Rationale: Available tools depend on Java/MCP runtime configuration; startup should not require contacting those systems for schema validation.

## Risks / Trade-offs
- Risk: Existing custom definitions with `tools: []` will become no-tool agents.
  Mitigation: This change explicitly defines that semantic; default-agent remains compatible.
- Risk: Filtering after frozen catalog means catalog version/hash still identify the full frozen catalog, not the filtered model-visible subset.
  Mitigation: This avoids catalog semantics churn; selected tool list can be audited from the selected definition.
- Risk: Disallowed model tool call introduces a new terminal error path.
  Mitigation: Add targeted tests and use existing structured terminal error handling rather than Java policy changes.

## Migration Plan
No data migration is required. Existing runtime behavior remains compatible through `default-agent`. Custom definition authors should list every tool they want exposed to the model.

## Open Questions
- None for this slice. Future UI/SDK/remote definition management remains separate.
