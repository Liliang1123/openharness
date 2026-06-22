## Context
`HistoryStore` is the source of stable conversation messages, while compression produces a `compressedSummary` message plus recent messages. The model call path currently turns all stable history into API messages and then computes cache hints. P4a introduces a separate model-context assembly step without changing history persistence semantics.

## Goals
- Keep `HistoryStore` as the stable record and avoid writing selected context back into history.
- Build model-call context through explicit layers.
- Keep compressed summaries when present.
- Select recent messages under a configurable budget.
- Keep cache hints aligned with the selected message list.
- Expose context assembly metadata in `ModelChatRequest.meta`.

## Non-Goals
- No vector retrieval or long-term memory.
- No IDE/file/env snapshot selectors.
- No prompt registry.
- No provider-specific context management in Java.

## Decisions
- Decision: ContextBuilder lives in TS Runtime because TS owns harness state and model-call preparation.
- Decision: The initial selectors are `compressed_summary` and `recent_messages`.
- Decision: Budget enforcement uses the existing approximate token estimator. This keeps behavior deterministic in tests and avoids provider-specific tokenizers.
- Decision: If a single newest message exceeds budget, it is still included. The runtime must not drop the current answer path entirely.
- Decision: Cache hints are computed after context selection so `messageIndexFromTail` remains correct for the actual request payload.

## Risks / Trade-offs
- Approximate token estimates can differ from provider billing tokenizers. Mitigation: expose `estimatedTokens` and keep Java provider usage as the cost truth.
- Selecting by recency does not solve semantic relevance. Mitigation: make selectors explicit so future changes can add relevant tool results, environment snapshots, or memory retrieval without rewriting `AgentExecutionRunner`.

## Migration Plan
- Add ContextBuilder as a new module and wire only `AgentExecutionRunner.callModel()`.
- Keep the legacy `toModelMessages` view for compatibility and tests.
- Add `meta.context` as optional metadata so existing Java consumers continue to parse requests.
