## Context
Java Backend owns catalog and tool execution. TS Runtime must not bypass Java for business tools. Protocol tools therefore enter through the existing Java catalog/execute path rather than a TS-only side channel.

## Goals
- Define protocol tool identity in `ToolDefinition.protocol`.
- Provide deterministic safe implementations for `read_file`, `search`, and `run_command`.
- Keep execution bounded: path containment, output caps, and no shell evaluation.

## Non-Goals
- No writable `edit_file` implementation.
- No sandbox runner, Docker, or process isolation.
- No streaming command output.

## Decisions
- Decision: Protocol tools are normal catalog tools with `permission: "safe"` unless a future write tool requires stronger policy.
- Decision: `run_command` uses `ProcessBuilder` with command allow-list, not a shell string.
- Decision: `TOOL_WORKSPACE_DIR` system property or env var defines the protocol workspace; default is current process directory.
- Decision: Outputs are capped to prevent oversized tool results entering history.

## Risks
- Local command execution can be risky. Mitigation: allow-list only `echo` and `pwd` in this first change, no shell, 2 second timeout, capped output.
