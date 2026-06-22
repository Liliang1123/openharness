## 1. Gate Artifacts
- [x] 1.1 Update `CONTEXT.md` with MemoryStore, MemoryFact, EvalCase, and EvalReplayHarness terms.
- [x] 1.2 Add OpenSpec proposal, design, tasks, and spec deltas.
- [x] 1.3 Add Superpowers implementation plan under `docs/superpowers/plans/`.
- [x] 1.4 Validate `add-p5a-memory-and-eval` with strict OpenSpec.

## 2. Shared Schema
- [x] 2.1 Add `MemoryFactSchema` and `EvalCaseSchema`.
- [x] 2.2 Add shared-schema tests for valid and invalid memory/eval contracts.

## 3. Memory Store
- [x] 3.1 Add `MemoryStore`, `InMemoryMemoryStore`, and `JsonFileMemoryStore`.
- [x] 3.2 Implement tenant/user isolation, upsert/list/search/delete, and JSON reload behavior.
- [x] 3.3 Add memory store unit tests.

## 4. Eval Replay Harness
- [x] 4.1 Add eval replay harness that runs `EvalCase` through `AgentExecutionRunner`.
- [x] 4.2 Return answer, stop reason, pass/fail, failure reason, and event evidence.
- [x] 4.3 Add eval harness tests for passing and failing cases.

## 5. Documentation
- [x] 5.1 Add architecture contract documentation for memory and eval replay.
- [x] 5.2 Keep online ContextBuilder behavior unchanged and document P5a non-goals.

## 6. Verification and Archive
- [x] 6.1 Run targeted shared-schema and agent-runtime tests.
- [x] 6.2 Run `pnpm typecheck`, `pnpm test`, `mvn test`.
- [x] 6.3 Run strict OpenSpec validation for the active change and all specs.
- [x] 6.4 Archive the OpenSpec change and run post-archive validation.
