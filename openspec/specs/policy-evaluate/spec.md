# policy-evaluate Specification

## Purpose
TBD - created by archiving change implement-p0b-hookable. Update Purpose after archive.
## Requirements
### Requirement: Policy Evaluate Endpoint
The Java backend SHALL expose `POST /api/v1/policies/tool-review/evaluate` that accepts a batch of tool calls and returns one decision per tool call.

#### Scenario: Default ALLOW for safe tools
- **WHEN** a tool call for a safe tool is evaluated with no deny rules matching
- **THEN** the decision is `ALLOW` with source `NONE`

#### Scenario: Deny rule blocks tool
- **WHEN** a tool call for a tool whose name starts with `blocked_` is evaluated
- **THEN** the decision is `DENY` with source `ORG_POLICY`

#### Scenario: Batch evaluate returns per-tool decisions
- **WHEN** multiple tool calls are submitted in one request
- **THEN** the response contains one decision per `toolCallId`, and ALLOW/DENY decisions are independent

### Requirement: Execute Defense Against Bypass
The Java backend SHALL reject execution of sensitive/destructive tools via `POST /api/v1/tools/execute` if no prior policy ALLOW record exists for that `(tenantId, toolCallId)`.

#### Scenario: Direct call to sensitive tool without policy allow
- **WHEN** a caller invokes `/api/v1/tools/execute` for a sensitive tool without a prior policy ALLOW
- **THEN** the response is 403 with errorClass `POLICY_DENY`

#### Scenario: Sensitive tool executes after policy ALLOW
- **WHEN** policy evaluate returns ALLOW for a sensitive tool, then execute is called
- **THEN** the tool executes normally and returns status `ok`

### Requirement: MCP source default decision

The Java `PolicyService` SHALL inspect each tool call's `source` field. When `source` matches `mcp:*` and no explicit deny / require-approval rule has matched, the policy decision MUST default to `REQUIRE_APPROVAL` with decision source `MCP_DEFAULT` and a generated `approvalToken`. For `name: mcp_call` with `source: mcp:broker`, Java MUST parse a valid Broker envelope and apply name-based deny, Skill approval, and `mcpAllowList` matching to its nested tool/server identity. A malformed Broker envelope MUST fail closed for MCP allow-list evaluation. When `source` is omitted, missing, or equals `catalog`, the existing default-ALLOW behavior MUST remain unchanged.

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

#### Scenario: Broker preserves nested MCP policy identity

- **GIVEN** a tool call with `name: "mcp_call"`, `source: "mcp:broker"`, and a valid envelope targeting `filesystem/read_file`
- **WHEN** `mcpAllowList` contains `read_file` or `mcp:filesystem`
- **THEN** the MCP default rule treats the call as allow-listed
- **AND** name-based deny and Skill approval rules evaluate `read_file`

#### Scenario: Malformed Broker target fails closed

- **GIVEN** a tool call with `name: "mcp_call"`, `source: "mcp:broker"`, and an invalid or incomplete envelope
- **WHEN** `mcpAllowList` contains only `mcp_call` or `mcp:broker`
- **THEN** the decision is `REQUIRE_APPROVAL`
- **AND** the decision source is `MCP_DEFAULT`

### Requirement: TS Runtime forwards source field

The TS Agent Runtime SHALL include each tool call's resolved source (from `ToolRegistry.resolveSource`) in the `evaluatePolicy` request. When the source cannot be resolved, the runtime MUST omit the field rather than send a guessed value.

#### Scenario: Runtime sends source for MCP tool

- **GIVEN** the stable MCP Broker has been frozen in the conversation's tool registry
- **WHEN** the runtime calls Java `evaluatePolicy`
- **THEN** the request body includes `toolCalls[i].source: "mcp:broker"`
- **AND** `argumentsRaw` contains the original server/tool/arguments Broker envelope

#### Scenario: Runtime sends source for catalog tool

- **GIVEN** a catalog-sourced tool call has been frozen
- **WHEN** the runtime calls Java `evaluatePolicy`
- **THEN** the request body includes `toolCalls[i].source: "catalog"` for that tool

### Requirement: Untrusted Context Approval Rule
The Java backend SHALL inspect `ReviewPolicyEvaluateRequest.context.untrustedToolOutputSinceLastUser` and `context.toolPermissions`. When untrusted tool output exists since the latest user message and a requested tool has permission `sensitive` or `destructive`, policy evaluation MUST return `REQUIRE_APPROVAL` with decision source `UNTRUSTED_CONTEXT` and an approval token. Safe tools MUST keep existing policy behavior.

#### Scenario: Sensitive tool after untrusted output requires approval
- **GIVEN** `context.untrustedToolOutputSinceLastUser` is `true`
- **AND** `context.toolPermissions.submit_payment` is `sensitive`
- **WHEN** policy evaluates a tool call named `submit_payment`
- **THEN** the decision is `REQUIRE_APPROVAL`
- **AND** the decision source is `UNTRUSTED_CONTEXT`
- **AND** an `approvalToken` is present

#### Scenario: Safe tool after untrusted output remains allowed
- **GIVEN** `context.untrustedToolOutputSinceLastUser` is `true`
- **AND** `context.toolPermissions.echo` is `safe`
- **WHEN** policy evaluates a tool call named `echo`
- **THEN** the existing default decision remains `ALLOW`

#### Scenario: Existing deny rule has precedence
- **GIVEN** `context.untrustedToolOutputSinceLastUser` is `true`
- **AND** `context.toolPermissions.blocked_payment` is `sensitive`
- **WHEN** policy evaluates a tool call named `blocked_payment`
- **THEN** the decision is `DENY`
- **AND** the decision source is `ORG_POLICY`

#### Scenario: MCP default has precedence before untrusted rule
- **GIVEN** `context.untrustedToolOutputSinceLastUser` is `true`
- **AND** a tool call has `source: "mcp:filesystem"`
- **WHEN** no MCP allow-list entry matches
- **THEN** the decision is `REQUIRE_APPROVAL`
- **AND** the decision source is `MCP_DEFAULT`
