# Design: Agent Definition Model Selection

## Context
The Java backend owns model routing and provider credentials. The TS Runtime currently sends `model: "default"` on each `ModelChatRequest`, even when the selected Agent Definition includes a `model` value. Earlier Agent Definition changes intentionally left `model` as metadata until selection, prompt binding, tool filtering, and observability were stable.

## Goals
- Allow a selected Agent Definition to choose the logical model id sent to Java `/api/v1/model/chat`.
- Preserve omitted-`model` behavior by continuing to send the default logical model.
- Keep Java as the owner of model-router configuration, provider adapters, credentials, and fallback behavior.

## Non-Goals
- No Java model-router code changes.
- No TS-side validation that a logical model id exists in Java configuration.
- No provider credential movement into TS Runtime or Frontend.
- No Frontend UI, SDK, YAML, remote CRUD, hot reload, or tenant-scoped dynamic definitions.

## Decisions

### Runtime model resolution
For every model call in an agent turn, TS Runtime resolves:

```ts
const model = input.agentDefinition.model ?? "default";
```

That value becomes `ModelChatRequest.model`.

### Fail-open to Java router semantics
If an Agent Definition names a model id unknown to Java's router, TS Runtime still forwards it. Java's existing router/default/failure behavior remains the source of truth. This avoids duplicating router config in TS.

### Observability
Existing `ModelChatRequest.meta.agentId`, `agentPromptRef`, tool summaries, and trace attribution remain unchanged. No new metadata field is required because `ModelChatRequest.model` itself is the audit point for logical model selection.

## Risks / Trade-offs
- A typo in `AgentDefinition.model` may route through Java fallback depending on backend configuration. This is acceptable for this slice because route validation belongs to a future Java/router-aware change.
- Tests must assert both selected custom model and omitted-model fallback to prevent accidental breaking changes.
