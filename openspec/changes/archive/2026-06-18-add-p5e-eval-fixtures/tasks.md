## 1. Fixture contract
- [x] 1.1 Add a canonical Eval Fixture file with at least one passing deterministic `EvalCase`.
- [x] 1.2 Add tests that parse the fixture through `EvalCaseSchema`.

## 2. Smoke execution
- [x] 2.1 Add deterministic smoke execution support for the Eval CLI without requiring Java Backend, Frontend, real provider credentials, or persisted sessions.
- [x] 2.2 Add an agent-runtime package script for running the canonical fixture smoke.
- [x] 2.3 Add tests that verify the smoke path exits `0` and emits a summary.

## 3. Verification
- [x] 3.1 Run targeted agent-runtime eval fixture/smoke tests.
- [x] 3.2 Run `pnpm typecheck`, `pnpm test`, `mvn test`, and `npx openspec validate --all --strict --no-interactive`.
- [x] 3.3 Archive the OpenSpec change after implementation and verification are complete.
