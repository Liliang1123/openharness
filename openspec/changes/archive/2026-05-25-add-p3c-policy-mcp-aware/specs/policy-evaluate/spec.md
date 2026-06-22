# Spec Delta: policy-evaluate

## ADDED Requirements

### Requirement: MCP source default decision

The Java `PolicyService` SHALL inspect each tool call's `source` field. When `source` matches `mcp:*` and no explicit deny / require-approval rule has matched, the policy decision MUST default to `REQUIRE_APPROVAL` with decision source `MCP_DEFAULT` and a generated `approvalToken`. When `source` is omitted, missing, or equals `catalog`, the existing default-ALLOW behavior MUST remain unchanged.

#### Scenario: MCP source falls into default REQUIRE_APPROVAL

- **GIVEN** a tool call with `source: "mcp:filesystem"` and tool name `read_file`
- **AND** no `blocked_*` deny rule and no skill manifest entry matches `read_file`
- **WHEN** the policy is evaluated
- **THEN** the decision is `REQUIRE_APPROVAL`
- **AND** the decision source is `MCP_DEFAULT`
- **AND** an `approvalToken` is present in the decision

#### Scenario: Catalog source keeps default ALLOW

- **GIVEN** a tool call with `source: "catalog"` (or omitted) and tool name `get_current_time`
- **AND** no deny rule matches
- **WHEN** the policy is evaluated
- **THEN** the decision is `ALLOW`
- **AND** the decision source is `NONE`

#### Scenario: MCP source still respects explicit deny rules

- **GIVEN** a tool call with `source: "mcp:filesystem"` and tool name `blocked_dangerous`
- **WHEN** the policy is evaluated
- **THEN** the decision is `DENY`
- **AND** the decision source is `ORG_POLICY`

### Requirement: TS Runtime forwards source field

The TS Agent Runtime SHALL include each tool call's resolved source (from `ToolRegistry.resolveSource`) in the `evaluatePolicy` request. When the source cannot be resolved, the runtime MUST omit the field rather than send a guessed value.

#### Scenario: Runtime sends source for MCP tool

- **GIVEN** an MCP-sourced tool call has been frozen in the conversation's tool registry
- **WHEN** the runtime calls Java `evaluatePolicy`
- **THEN** the request body includes `toolCalls[i].source: "mcp:{server}"` for that tool

#### Scenario: Runtime sends source for catalog tool

- **GIVEN** a catalog-sourced tool call has been frozen
- **WHEN** the runtime calls Java `evaluatePolicy`
- **THEN** the request body includes `toolCalls[i].source: "catalog"` for that tool
