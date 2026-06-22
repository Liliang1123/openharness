# Design: Prompt Injection Guard For Tool Results

## Context
OpenHarness already enforces policy through Java before tool execution, but the policy decision does not know whether the model's next tool call was influenced by untrusted tool output. The runtime also stores raw tool results as model-visible JSON strings, so tool output and instructions are not separated.

## Goals
- Preserve TS Runtime ownership of history and agent loop.
- Preserve Java ownership of policy decisions.
- Make trust provenance explicit and persisted with tool-result history.
- Keep P0 scope deterministic and testable without an LLM classifier.
- Avoid changing provider payload semantics beyond safe tool-output wrapping.

## Non-Goals
- No prompt-injection classifier.
- No per-domain trust registry beyond explicit `trusted` / `untrusted`.
- No frontend approval UX changes beyond existing approval recovery.
- No new protocol-level file or browser tools in this change.

## Architecture
Tool execution responses MAY carry `provenance: "trusted" | "untrusted"`. Java catalog tools default to `trusted` unless the tool response explicitly says otherwise. MCP tool results default to `untrusted` because MCP servers are external to the Java enterprise gateway.

When TS appends a tool result to history, it also stores internal `toolResultProvenance` and `toolName` fields. These fields are not sent to the model as JSON fields. Instead, if provenance is `untrusted`, the model-visible `content` string is wrapped:

```text
<tool_output trust="untrusted" tool="read_file">
...serialized tool result...
</tool_output>
```

For trusted output, existing JSON-string content behavior is preserved.

Before every policy evaluation, TS computes:

- `untrustedToolOutputSinceLastUser`: true when any tool message after the most recent user message has `toolResultProvenance="untrusted"`.
- `toolPermissions`: a map from tool name to `safe` / `sensitive` / `destructive`, derived from the frozen catalog merged with MCP definitions.

Java `PolicyService` keeps the existing precedence:

1. explicit org deny (`blocked_*`)
2. skill manifest approval
3. MCP default approval
4. untrusted-output approval for sensitive/destructive tools
5. default allow

The new untrusted-output rule returns `REQUIRE_APPROVAL`, source `UNTRUSTED_CONTEXT`, and an approval token. Safe/read-only tools remain allowed so the agent can inspect or recover.

## Data Flow
1. Tool executes.
2. Java returns `ToolCallResponse.provenance` or TS assigns a default.
3. TS serializes result and wraps content if untrusted.
4. TS appends tool message with internal provenance metadata.
5. The next model call receives wrapped untrusted output.
6. If the model asks for a sensitive/destructive tool, TS includes untrusted context and tool metadata in policy evaluate.
7. Java returns `REQUIRE_APPROVAL`; existing `ApprovalStore` and recovery flow handle the pause/resume path.

## Error Handling
- Missing provenance defaults to `trusted` for Java catalog tools and `untrusted` for MCP tools.
- Invalid or unknown provenance values are rejected by shared schema tests and treated as absent by Java DTO binding.
- If tool permission metadata is missing, Java treats the tool as `safe` for this rule and relies on existing execute-defense checks.

## Testing
- Shared schema parses `ToolCallResponse.provenance` and `AgentMessage.toolResultProvenance`.
- TS runner wraps untrusted tool output and persists internal provenance.
- TS `beforeToolUse` forwards untrusted context and tool permission metadata.
- Java policy returns `REQUIRE_APPROVAL / UNTRUSTED_CONTEXT` for sensitive/destructive calls after untrusted output.
- Existing MCP default, blocked tool, approval recovery, and non-stream runner tests stay green.
