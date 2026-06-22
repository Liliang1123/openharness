## Context
OpenHarness is moving from a generic harness runtime toward declarative agent configuration. Existing building blocks already cover versioned prompts, frozen tool catalogs, model routing metadata, and runtime execution boundaries. The missing first step is a small, local, validated definition file that can bind an `agentId` to a prompt reference, a tool allow list, and an optional model hint.

## Goals / Non-Goals
- Goals:
  - Define a versioned `AgentDefinition` schema in shared TypeScript contracts.
  - Load project-local JSON definitions from `agent-runtime/agents/`.
  - Provide a default agent when no definitions are present.
  - Make definition parsing deterministic and testable without backend/frontend services.
- Non-Goals:
  - YAML support.
  - SDK package.
  - Frontend UI.
  - Remote CRUD APIs.
  - Hot reload.
  - Tenant-scoped dynamic definitions.
  - Changing Java model router behavior.
  - Enforcing tool allow lists inside Java policy.

## Decisions
- Decision: v0 supports JSON only.
  Rationale: avoids adding a YAML dependency and keeps the first slice small enough to validate and archive.
- Decision: Store definitions under `agent-runtime/agents/`.
  Rationale: Agent Definition is TS Runtime-owned and should not be loaded by Java Backend or Frontend.
- Decision: Represent prompt references as a single string `promptRef`, such as `openharness-default@v1`.
  Rationale: aligns with existing `promptId@version` terminology while preserving simple hand-written JSON.
- Decision: Treat `tools` as an allow-list of tool names.
  Rationale: it documents intended tool scope now and can later feed ToolRegistry filtering or policy context.
- Decision: Provide a default in-memory definition when the directory is missing or empty.
  Rationale: preserves existing chat behavior and avoids forcing projects to create agent files immediately.

## Contract Sketch
```json
{
  "agentId": "default-agent",
  "promptRef": "openharness-default@v1",
  "tools": ["get_current_time", "echo"],
  "model": "default"
}
```

Validation rules:
- `agentId` MUST be non-empty and stable identifier shaped.
- `promptRef` MUST be `promptId@version`.
- `tools` MUST be an array of unique non-empty tool names.
- `model` MAY be omitted; when present it is metadata/hint only for v0.
- duplicate `agentId` across files MUST fail closed.

## Risks / Trade-offs
- JSON-only is less ergonomic than YAML. Mitigation: reserve YAML for a later change once the contract is proven.
- Tool allow list can be mistaken for policy enforcement. Mitigation: v0 documentation and specs state it is runtime definition metadata unless explicitly wired into filtering/policy in a later change.
- Default fallback could hide missing config. Mitigation: fallback applies only when the definition directory is absent or empty; malformed files still fail closed.

## Migration Plan
No data migration is required. Existing runtime behavior remains valid because a default definition is available when no agent files exist.

## Open Questions
- None for v0.
