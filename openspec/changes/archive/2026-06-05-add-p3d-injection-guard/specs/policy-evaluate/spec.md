## ADDED Requirements

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
