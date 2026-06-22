## 1. CLI input/output contract
- [x] 1.1 Add a small Eval CLI module that parses JSON array and JSONL `EvalCase` files with `EvalCaseSchema`.
- [x] 1.2 Emit one JSONL result per case using `EvalReplayHarness` result fields.
- [x] 1.3 Emit a final summary object with total/pass/fail counts.

## 2. CLI execution behavior
- [x] 2.1 Wire CLI execution through `runEvalCase` with isolated runtime state by default.
- [x] 2.2 Return exit code `0` when all cases pass.
- [x] 2.3 Return non-zero exit code when any case fails or input parsing fails.
- [x] 2.4 Ensure CLI execution does not start frontend, does not create a remote API, and does not mutate persisted sessions by default.

## 3. Verification
- [x] 3.1 Add unit tests for JSON array input, JSONL input, failing case exit code, invalid input exit code, and summary output.
- [x] 3.2 Run targeted agent-runtime eval CLI tests.
- [x] 3.3 Run `pnpm typecheck`, `pnpm test`, `mvn test`, and `npx openspec validate --all --strict --no-interactive`.
- [x] 3.4 Archive the OpenSpec change after implementation and verification are complete.
