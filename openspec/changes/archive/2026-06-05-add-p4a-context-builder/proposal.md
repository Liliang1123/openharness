# Change: Add ContextBuilder Pipeline

## Why
Model calls currently use the full stable conversation history and only apply cache hints after that selection. This makes context assembly an implicit side effect of history storage and compression, so the runtime cannot enforce a model-context budget or explain which layers entered a model call.

## What Changes
- Add an Agent Runtime ContextBuilder that constructs model-call messages from explicit layers.
- Preserve stable ordering: compressed summary first, then selected recent conversation messages.
- Enforce a configurable model-context token budget before each model call.
- Recompute cache hints against the selected model context, not the full history.
- Add model request metadata that reports context builder name, selected message count, estimated tokens, and whether truncation happened.

## Impact
- Affected specs: `context-builder`, `agent-runtime`, `shared-schema`
- Affected code: `agent-runtime/src/contextBuilder.ts`, `agent-runtime/src/agentExecutionRunner.ts`, `agent-runtime/src/cacheHints.ts`, `packages/shared-schema/src/index.ts`
- Affected tests: agent-runtime ContextBuilder/cache hint/runner tests and shared-schema tests
