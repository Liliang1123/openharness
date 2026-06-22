## Context
The Agent Runtime already owns MessageHistory, ContextBuilder, prompts, SSE events, approvals, and terminal execution state. Long-term memory needs a separate contract so future context layers can read durable facts without treating session transcript as memory. Eval replay needs a deterministic harness so runtime regressions can be tested without launching frontend or real providers.

## Goals / Non-Goals
- Goals: define scoped memory facts, provide in-memory and JSON-file stores, support literal search and deletion, define eval cases, replay eval cases through the existing runner, and expose pass/fail evidence.
- Non-Goals: vector search, embeddings, ranking, online memory retrieval, automatic memory extraction, frontend views, Java storage, or a networked eval service.

## Decisions
- Decision: Memory is TS Runtime owned for P5a.
  Rationale: TS owns agent state and context selection. Java remains the enterprise gateway for model, tool, policy, auth, idempotency, and trace concerns.
- Decision: P5a uses literal case-insensitive search over `content` and `tags`.
  Rationale: this is deterministic, testable, and sufficient to reserve the memory lifecycle contract before vector retrieval is introduced.
- Decision: JSON persistence follows existing local-store patterns.
  Rationale: `JsonFileHistoryStore` already establishes lightweight file persistence for local runtime state.
- Decision: Eval replay runs through `AgentExecutionRunner`.
  Rationale: replay must exercise the same terminal state, history, runtime event, prompt, and context paths as normal execution.

## Risks / Trade-offs
- Literal memory search is not semantically rich. Mitigation: document it as P5a behavior and leave vector retrieval as a later OpenSpec change.
- Eval replay may accidentally depend on wall-clock event IDs or timestamps. Mitigation: assertions focus on terminal state, stop reason, answer, and event kinds instead of exact timestamps.
- File stores can be corrupted by malformed JSON. Mitigation: match existing local-store behavior by treating unreadable files as empty scoped state.

## Migration Plan
No migration is required. New files and schemas are additive. Online request handling remains unchanged.

## Open Questions
- None for P5a.
