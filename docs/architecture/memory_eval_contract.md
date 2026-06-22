# Memory and Eval Replay Contract

## Ownership

The TypeScript Agent Runtime owns long-term memory, memory context retrieval, and offline eval replay.

- Java Backend does not write memory facts.
- Frontend does not read or mutate memory facts in P5a/P5b.
- MessageHistory remains the stable transcript store; MemoryStore is a separate durable fact store.
- ContextBuilder may read explicitly retrieved memory facts in P5b.

## Memory Facts

`MemoryFact` is scoped by `(tenantId, userId)`.

Required fields:

- `memoryId`
- `tenantId`
- `userId`
- `content`
- `tags`
- `createdAt`
- `updatedAt`

Optional fields:

- `agentId`

The memory search contract is deterministic literal search:

- Case-insensitive match against `content`.
- Case-insensitive match against `tags`.
- Optional tag filters must all be present.

`JsonFileMemoryStore` is local persistence for development and tests. It is not a production storage contract.

## Memory Context Retrieval

P5b adds an optional `memory_retrieval` ContextBuilder layer.

- Retrieval is enabled only when `AgentExecutionRunner` receives a `MemoryStore`.
- The runner searches by `(tenantId, userId, current user message)`.
- Retrieved facts are formatted as one system context message.
- Runtime-only fields such as `sessionContext` are stripped before Java/provider API calls.
- Memory context contributes to `meta.context.selectedMessages`, `estimatedTokens`, `layers`, and `truncated`.
- `MEMORY_CONTEXT_MAX_FACTS` caps retrieved facts; default is `5`.

P5b retrieval is read-only. It does not create, update, or delete memory facts during an agent turn.

Vector retrieval, embeddings, memory ranking models, and automatic memory extraction are outside P5b.

## Eval Replay

`EvalCase` describes one offline agent turn:

- `evalId`
- `tenantId`
- `userId`
- `conversationId`
- `input`
- optional `expectedAnswerContains`
- optional `expectedStopReason`

`EvalReplayHarness` runs the case through the existing `AgentExecutionRunner`, using isolated in-memory runtime state by default. It can receive an optional `MemoryStore` to exercise memory-backed context. It returns:

- `passed`
- `answer`
- `stopReason`
- terminal execution `status`
- optional `failureReason`
- runtime event evidence

Eval replay is a regression harness. It is not a frontend flow, public API, or production scheduler.
