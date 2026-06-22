# Change: Add Prompt Registry

## Why
Agent Runtime currently sends conversation messages without a versioned system prompt owned by the harness. This makes prompt behavior implicit, hard to audit, and impossible to trace or roll back.

## What Changes
- Add a TS Runtime prompt registry with versioned prompt templates.
- Inject the selected system prompt before model-call context.
- Attach `promptId` and `promptVersion` to model request metadata.
- Add shared-schema prompt template and model metadata contracts.
- Document prompt ownership and cross-runtime boundaries.

## Impact
- Affected specs: `prompt-registry`, `agent-runtime`, `shared-schema`
- Affected code: `agent-runtime/src/prompts/*`, `agent-runtime/src/agentExecutionRunner.ts`, `agent-runtime/src/agentLoop.ts`, `packages/shared-schema/src/index.ts`
- Affected docs: `CONTEXT.md`, `docs/architecture/prompt_contract.md`, `docs/architecture/cross_runtime_contracts.md`, `docs/architecture/trace_schema.md`
