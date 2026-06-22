## Context
`ContextBuilder` currently selects `compressed_summary` and `recent_messages` from stable MessageHistory. P5a established `MemoryStore`, but P5a explicitly did not inject memory into online context. P5b adds the first retrieval layer while keeping retrieval deterministic and bounded.

## Goals / Non-Goals
- Goals: add optional memory retrieval, include retrieved memory in context metadata, enforce token budget participation, and keep retrieval scoped by tenant/user.
- Non-Goals: semantic search, embeddings, ranking models, memory writes from agent output, frontend UI, Java memory storage, or provider-specific prompt features.

## Decisions
- Decision: Retrieval query is the current user message.
  Rationale: it is deterministic, already available at context build time, and enough to test the layer boundary.
- Decision: Retrieved facts are injected as a single system message marked `sessionContext`.
  Rationale: this matches existing internal-message conventions and lets `toApi` strip runtime-only fields while preserving role/content.
- Decision: Memory retrieval is opt-in through an explicit `MemoryStore` dependency.
  Rationale: default behavior remains unchanged for existing tests and deployments.
- Decision: Memory facts count against the same model context budget.
  Rationale: memory must compete with summaries and recent messages rather than silently expanding prompts.

## Risks / Trade-offs
- Literal retrieval can miss useful facts. Mitigation: document this as deterministic P5b behavior and reserve vector retrieval for a later change.
- System-context injection could over-influence the model if too broad. Mitigation: cap retrieved facts and format them as factual context, not instructions.
- Budget pressure could drop recent messages if memory is large. Mitigation: memory is selected before recent messages and contributes to truncation metadata.

## Migration Plan
No data migration is required. Online behavior remains unchanged unless a `MemoryStore` is provided to the runner/context builder.

## Open Questions
- None for P5b.
