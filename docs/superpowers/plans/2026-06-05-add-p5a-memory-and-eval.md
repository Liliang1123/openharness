# Plan: add-p5a-memory-and-eval

## Contract
- OpenSpec change: `openspec/changes/add-p5a-memory-and-eval`
- Scope: additive TS Runtime memory store, eval replay harness, shared schemas, docs.
- Non-goals: vector retrieval, online memory injection, frontend UI, Java storage.

## Steps

1. Validate OpenSpec gate
   - Run `npx openspec validate add-p5a-memory-and-eval --strict --no-interactive`.

2. Shared schema TDD
   - Add failing tests in `packages/shared-schema/test/schema.test.ts` for `MemoryFactSchema` and `EvalCaseSchema`.
   - Implement schemas and exports in `packages/shared-schema/src/index.ts`.
   - Run `pnpm --filter @openharness/shared-schema test`.

3. Memory store TDD
   - Add `agent-runtime/test/memoryStore.test.ts`.
   - Implement `agent-runtime/src/memoryStore.ts` with `MemoryStore`, `InMemoryMemoryStore`, and `JsonFileMemoryStore`.
   - Cover tenant/user isolation, upsert replacement, literal content/tag search, delete, and JSON reload.
   - Run `pnpm --filter @openharness/agent-runtime test -- memoryStore`.

4. Eval replay TDD
   - Add `agent-runtime/test/evalReplayHarness.test.ts`.
   - Implement `agent-runtime/src/evalReplayHarness.ts`.
   - Use isolated in-memory history/events/execution/approval stores and the existing `AgentExecutionRunner`.
   - Assert passing and failing eval cases, including event evidence.
   - Run `pnpm --filter @openharness/agent-runtime test -- evalReplayHarness`.

5. Documentation
   - Add `docs/architecture/memory_eval_contract.md`.
   - Update OpenSpec tasks as completed only after implementation and verification.

6. Full verification
   - Run `pnpm typecheck`.
   - Run `pnpm test`.
   - Run `mvn test`.
   - Run `npx openspec validate add-p5a-memory-and-eval --strict --no-interactive`.
   - Run `npx openspec validate --all --strict --no-interactive`.

7. Archive
   - Run `npx openspec archive add-p5a-memory-and-eval --yes`.
   - Run post-archive `npx openspec validate --all --strict --no-interactive`.
   - Confirm `npx openspec list` shows no active changes.
