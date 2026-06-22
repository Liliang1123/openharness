# Plan: add-p5b-memory-context-retrieval

## Contract
- OpenSpec change: `openspec/changes/add-p5b-memory-context-retrieval`
- Scope: optional MemoryStore-backed retrieval layer in TS Runtime model context.
- Non-goals: vector retrieval, automatic memory writes, frontend UI, Java memory storage.

## Steps

1. Validate OpenSpec gate
   - Run `npx openspec validate add-p5b-memory-context-retrieval --strict --no-interactive`.

2. ContextBuilder TDD
   - Add tests in `agent-runtime/test/contextBuilder.test.ts`.
   - Extend `buildModelContext` options with retrieved memory facts.
   - Format memory facts as one system context message.
   - Ensure memory contributes to `selectedMessages`, `estimatedTokens`, `layers`, and `truncated`.
   - Run `pnpm --filter @openharness/agent-runtime test -- contextBuilder`.

3. Runner wiring TDD
   - Add tests in `agent-runtime/test/agentExecutionRunner.test.ts` or a focused memory retrieval runner test.
   - Add optional `MemoryStore` dependency to `AgentExecutionRunner`.
   - Search memory by `(tenantId, userId, current user message)` before model call.
   - Pass retrieved facts to `buildModelContext`.
   - Run targeted agent-runtime tests.

4. Eval coverage
   - Extend `runEvalCase` with optional MemoryStore.
   - Add test showing memory context reaches deterministic model input.

5. Documentation and tasks
   - Update `docs/architecture/memory_eval_contract.md`.
   - Mark OpenSpec tasks only after corresponding work and verification.

6. Full verification
   - Run `pnpm typecheck`.
   - Run `pnpm test`.
   - Run `mvn test`.
   - Run `npx openspec validate add-p5b-memory-context-retrieval --strict --no-interactive`.
   - Run `npx openspec validate --all --strict --no-interactive`.

7. Archive
   - Run `npx openspec archive add-p5b-memory-context-retrieval --yes`.
   - Run post-archive `npx openspec validate --all --strict --no-interactive`.
   - Confirm `npx openspec list` shows no active changes.
