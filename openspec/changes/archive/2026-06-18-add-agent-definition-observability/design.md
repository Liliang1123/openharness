# Design: Agent Definition Observability

## Context
Recent archived changes added local JSON Agent Definition loading, per-turn runtime selection via `agentId`, PromptRegistry binding via `promptRef`, and `tools` allow-list filtering. These features affect model-call inputs and tool eligibility, but current observability does not consistently surface the selected definition identity on model requests or TS Runtime trace events.

## Goals
- Make each model request auditable back to the selected Agent Definition.
- Make TS Runtime trace events carry `agentId` when an execution has selected a definition.
- Surface enough tool-filtering summary metadata to debug whether a model saw default/full, filtered, or no tools.
- Keep metadata bounded and deterministic.

## Non-Goals
- No model router enforcement of `AgentDefinition.model`.
- No Java policy or Java tool catalog changes.
- No frontend display, SDK, YAML, remote CRUD, hot reload, or tenant-scoped dynamic definitions.
- No model-visible prompt/message changes.
- No full tool schema duplication in metadata.

## Decisions

### Model request metadata shape
Add optional fields to `ModelChatRequest.meta`:

- `agentId?: string`
- `agentPromptRef?: string`
- `agentToolMode?: "default_full" | "allow_list"`
- `agentAllowedTools?: string[]`
- `modelVisibleTools?: string[]`

`agentAllowedTools` is the selected definition's declared `tools` list. `modelVisibleTools` is the post-freeze, post-filter list sent in the same request. Only names are recorded to avoid duplicating tool schemas.

### Tool mode semantics
- `default_full`: built-in `default-agent` with empty `tools` preserves full frozen catalog exposure.
- `allow_list`: any selected custom definition uses its `tools` as an allow-list; an empty list means no-tool agent.

### Trace attribution
Extend TS Runtime trace creation so every trace emitted for an `AgentExecutionInput` sets top-level `TraceEvent.agentId` to `input.agentDefinition.agentId`.

### Backend compatibility
Java DTO already accepts `TraceEvent.agentId` and `ModelChatRequest.meta` as a map. Backend behavior remains unchanged; this change validates and emits metadata from TS Runtime/shared schema without requiring Java semantic changes.

## Risks / Trade-offs
- Metadata can become noisy if it stores full tool objects; mitigation: store tool names only.
- `modelVisibleTools` reflects per-call state and can differ from `agentAllowedTools` when definitions contain unknown tool names; this is intentional for debugging.
- Existing tests may assert exact `meta`; add optional fields without making old request shapes invalid.

## Migration / Rollback
- Optional schema fields preserve backward compatibility.
- Rollback removes emitted metadata and optional schema fields without changing runtime selection, prompt binding, or tool filtering behavior.
