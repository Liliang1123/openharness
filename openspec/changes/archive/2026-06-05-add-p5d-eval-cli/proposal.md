# Change: Add eval replay CLI

## Why
P5a introduced `EvalReplayHarness`, but replay remains callable only from tests or library code. Developers need a local command entry point that can run one or more `EvalCase` fixtures and emit machine-readable results for regression workflows without launching the frontend or creating a remote eval service.

## What Changes
- Add a TS Runtime local Eval CLI for offline replay of `EvalCase` JSON or JSONL files.
- Support deterministic per-case JSONL result output using the existing `EvalReplayHarness` result shape.
- Return a success exit code only when all replayed cases pass; return a non-zero exit code when any case fails or input is invalid.
- Keep eval replay isolated by default and avoid mutating persisted sessions unless explicit dependencies are wired in later changes.
- Keep frontend UI, production scheduler, remote eval API, provider selection UI, and benchmark dashboards out of scope.

## Impact
- Affected specs: `eval-replay`
- Affected code: `agent-runtime/src/evalReplayHarness.ts`, new CLI entry under `agent-runtime/src/`, `agent-runtime/test/*eval*`, `agent-runtime/package.json`
