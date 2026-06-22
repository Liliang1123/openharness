## 1. Gate Artifacts
- [x] 1.1 Confirm no active OpenSpec change and inspect context/memory code.
- [x] 1.2 Update `CONTEXT.md` with Memory Retrieval Layer terminology.
- [x] 1.3 Add OpenSpec proposal, design, tasks, and spec deltas.
- [x] 1.4 Add Superpowers implementation plan.
- [x] 1.5 Validate `add-p5b-memory-context-retrieval` with strict OpenSpec.

## 2. Context Builder TDD
- [x] 2.1 Add tests for memory retrieval injection, scope-safe explicit inputs, disabled default behavior, and budget accounting.
- [x] 2.2 Extend `buildModelContext` to accept retrieved memory facts and include a `memory_retrieval` layer.
- [x] 2.3 Ensure memory context is formatted as system context and counted in metadata.

## 3. Runner Wiring TDD
- [x] 3.1 Add runner tests proving MemoryStore search uses tenant/user/current-message scope.
- [x] 3.2 Add optional MemoryStore dependency to AgentExecutionRunner.
- [x] 3.3 Keep existing runner behavior unchanged when no MemoryStore is configured.

## 4. Eval Coverage
- [x] 4.1 Add eval replay coverage for a memory-backed answer path.
- [x] 4.2 Update eval harness dependencies to accept an optional MemoryStore.

## 5. Documentation
- [x] 5.1 Update memory/eval architecture documentation for P5b retrieval.
- [x] 5.2 Document deterministic literal retrieval and vector retrieval non-goal.

## 6. Verification and Archive
- [x] 6.1 Run targeted context/runner/eval tests.
- [x] 6.2 Run `pnpm typecheck`, `pnpm test`, `mvn test`.
- [x] 6.3 Run strict OpenSpec validation for the active change and all specs.
- [x] 6.4 Archive the OpenSpec change and run post-archive validation.
