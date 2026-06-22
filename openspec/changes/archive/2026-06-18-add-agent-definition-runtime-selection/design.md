## Context
`add-agent-definition-loader` introduced a local JSON `AgentDefinition` registry with a default definition. Today the runtime decorates the Fastify app with that registry, but chat execution does not select a definition and `promptedMessages()` always resolves the prompt from `OPENHARNESS_PROMPT_REF` or the built-in default.

## Goals / Non-Goals
- Goals:
  - Let `/api/v1/agent/chat` and `/api/v1/agent/chat/stream` accept optional `agentId`.
  - Resolve `agentId` against the already-loaded local `AgentDefinitionRegistry`.
  - Carry the selected definition through the execution input.
  - Resolve prompts from `AgentDefinition.promptRef` through the existing `PromptRegistry`.
  - Fail closed before a Java model call for unknown `agentId` or unknown `promptRef`.
- Non-Goals:
  - Enforcing `AgentDefinition.tools` as a ToolRegistry allow-list.
  - Interpreting `AgentDefinition.model` as a router override.
  - Adding YAML, SDK, Frontend UI, remote CRUD APIs, hot reload, or tenant-scoped dynamic definitions.

## Decisions
- Decision: `agentId` remains optional on chat requests.
  Rationale: keeps existing clients compatible and preserves the default-agent behavior from the loader slice.
- Decision: selection happens in the Agent Runtime route handler before `runner.start()` / `streamLoop.stream()`.
  Rationale: the route owns request validation and already has access to `agentDefinitionRegistry`; resolving before execution prevents ambiguous runtime fallback.
- Decision: execution input carries the resolved definition or the resolved `promptRef`, not a registry lookup callback.
  Rationale: execution should be deterministic for the turn and should not re-read mutable registry state mid-run.
- Decision: `PromptRegistry` accepts an explicit prompt reference for per-turn resolution.
  Rationale: this reuses existing prompt metadata and fail-closed behavior while avoiding global environment mutation.
- Decision: unknown `agentId` returns a client-visible 4xx error and does not start an execution.
  Rationale: caller-selected agent identity is invalid input, not a model/runtime failure.
- Decision: unknown `promptRef` fails closed before Java `/api/v1/model/chat`.
  Rationale: prompt identity is part of the selected definition contract and must not silently fall back to the default prompt.

## Risks / Trade-offs
- Risk: `tools` may be mistaken as enforced once `agentId` selection works.
  Mitigation: keep tool allow-list explicitly out of scope in proposal/spec/tests.
- Risk: stream and sync paths diverge.
  Mitigation: add tests for both route variants or a shared helper test anchor that proves both pass selected prompt metadata to Java.
- Risk: legacy `OPENHARNESS_PROMPT_REF` behavior may conflict with selected definitions.
  Mitigation: explicit `AgentDefinition.promptRef` wins for selected definitions; env/default behavior remains only for direct prompt resolution without an explicit ref.

## Migration Plan
No data migration is required. Existing clients can omit `agentId` and continue using the default loaded definition.

## Open Questions
- None. This slice intentionally excludes tool filtering, UI, SDK, and remote definition management.
