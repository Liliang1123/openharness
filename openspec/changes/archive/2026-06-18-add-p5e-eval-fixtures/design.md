## Context
P5d added a local Eval CLI that reads JSON/JSONL `EvalCase` files and emits JSONL results. The CLI currently defaults to `HttpJavaClient`, so a repository smoke fixture must have deterministic runner support to avoid requiring a running Java Backend or real provider credentials.

## Goals / Non-Goals
- Goals: add canonical fixture files, add a smoke script, keep smoke deterministic and local, and verify the script can run in tests without external services.
- Non-Goals: CI workflow files, dashboards, production benchmark datasets, fixture auto-discovery, real-provider evals, or provider credential management.

## Decisions
- Decision: Store fixtures under the agent-runtime package.
  Rationale: `EvalReplayHarness` and Eval CLI are TS Runtime-owned, and package-local fixtures keep paths simple for package scripts.
- Decision: Add a deterministic smoke mode rather than using real Java Backend by default.
  Rationale: local smoke should be reliable, cheap, and independent from backend process availability.
- Decision: Keep fixture count small.
  Rationale: the goal is to prove the eval CLI path, not to define a benchmark suite.
- Decision: Smoke output remains JSONL.
  Rationale: this preserves the P5d machine-readable contract and makes assertions straightforward.

## Risks / Trade-offs
- A deterministic smoke runner can diverge from real provider behavior. Mitigation: document smoke as CLI-path validation only, not model-quality evaluation.
- Fixtures can become stale as EvalCase evolves. Mitigation: tests must parse fixtures with `EvalCaseSchema`.
- Adding CI wiring now would broaden the change. Mitigation: reserve CI pipeline integration for a later OpenSpec change.

## Migration Plan
No data migration is required. Fixtures and scripts are additive.

## Open Questions
- None for P5e proposal.
