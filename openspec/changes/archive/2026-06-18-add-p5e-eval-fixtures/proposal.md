# Change: Add eval fixtures and smoke script

## Why
The Eval CLI can replay arbitrary JSON/JSONL files, but the repository does not yet provide a canonical fixture or smoke command that proves the CLI path works end-to-end. Developers need a small deterministic fixture suite so eval replay can be exercised without creating ad hoc files or using real providers.

## What Changes
- Add project-local Eval Fixture files for deterministic offline replay.
- Add a smoke script that runs the Eval CLI against the canonical fixture.
- Ensure the smoke path uses deterministic/mock execution and does not require Java Backend, Frontend, real provider credentials, or persisted sessions.
- Keep production benchmarks, dashboards, CI pipeline wiring, fixture auto-discovery, and real-provider evals out of scope.

## Impact
- Affected specs: `eval-replay`
- Affected code: `agent-runtime/src/evalCli.ts`, `agent-runtime/test/*eval*`, `agent-runtime/package.json`, new fixture files under `agent-runtime/fixtures/` or equivalent local path
