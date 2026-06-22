## ADDED Requirements
### Requirement: Agent runtime SHALL dispatch forked skills through an isolated subagent

When the Agent Runtime intercepts `invoke_skill` and the resolved skill metadata has `fork_agent: true`, it MUST execute the skill task through a `SubagentDispatcher` instead of appending the skill to the parent pending injection queue. The parent conversation history MUST only receive the original `invoke_skill` tool call and one tool result containing the subagent summary; it MUST NOT receive the child model messages, child tool call results, child system prompt, or child scratch context.

#### Scenario: Forked skill returns only summary to parent
- **WHEN** a model calls `invoke_skill` for a skill whose metadata contains `fork_agent: true`
- **AND** the subagent completes successfully
- **THEN** the runtime returns an `invoke_skill` tool result containing the subagent summary
- **AND** the parent conversation history does not contain child intermediate model messages or child tool results
- **AND** the skill is not added to the parent pending injection queue

### Requirement: Subagent tools SHALL be inherited and downgraded from parent scope

A subagent execution MUST derive its model-visible tool catalog from the parent conversation's frozen catalog and then remove all tools listed in the skill metadata `forbidden_tools`. The runtime MUST also remove privileged runtime meta tools that could recursively spawn or bypass the parent scope, including `invoke_skill`, unless a future approved spec explicitly allows recursive subagents. Every remaining child tool call MUST still pass through `beforeToolUse` with child attribution before execution.

#### Scenario: Forbidden tool is not visible to subagent
- **WHEN** a forked skill declares `forbidden_tools: ["run_command"]`
- **THEN** the subagent model-visible catalog excludes `run_command`
- **AND** a child model attempt to call `run_command` is rejected before Java tool execution

#### Scenario: Child tool call is still policy audited
- **WHEN** a subagent calls an allowed tool
- **THEN** the runtime calls `beforeToolUse` with the child execution attribution before executing that tool

### Requirement: Subagent termination SHALL propagate to the parent tool result

If a subagent is aborted, times out, denied by policy, or fails with a terminal runtime error, the parent `invoke_skill` tool result MUST represent the child failure as a structured tool error and the parent execution MUST apply the existing tool error handling rules. The runtime MUST include child attribution such as `childExecutionId` in trace metadata for troubleshooting.

#### Scenario: Subagent timeout becomes parent-visible tool error
- **WHEN** a subagent exceeds its allowed timeout
- **THEN** the parent receives an `invoke_skill` tool result with `status: "error"` and error class `SUBAGENT_TIMEOUT`
- **AND** trace metadata includes the child execution identity
