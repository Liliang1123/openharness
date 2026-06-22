# Change: Add P5b memory context retrieval

## Why
P5a added scoped long-term memory storage and eval replay, but online agent turns still cannot read memory facts. The next stable step is a deterministic memory retrieval layer in the Agent Runtime context builder, so future semantic retrieval can evolve behind a tested contract.

## What Changes
- Add a `memory_retrieval` context layer that can inject scoped memory facts into model input.
- Retrieve memory facts from `MemoryStore` using deterministic literal search based on the current user message.
- Include memory retrieval in `meta.context.layers`, selected message count, estimated tokens, and truncation accounting.
- Wire AgentExecutionRunner to optionally use a MemoryStore without changing Java ownership or frontend behavior.
- Add tests proving scope isolation, budget accounting, disabled/default behavior, and eval replay usage with memory.

## Impact
- Affected specs: `context-builder`, `long-term-memory`
- Affected code: `agent-runtime/src/contextBuilder.ts`, `agent-runtime/src/agentExecutionRunner.ts`, `agent-runtime/src/memoryStore.ts`, `agent-runtime/test`
- Non-goals: vector DB, embeddings, automatic memory extraction, frontend memory UI, Java-owned memory writes
