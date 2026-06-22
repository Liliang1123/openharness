## Context
`EvalReplayHarness` already runs a single `EvalCase` through `AgentExecutionRunner` with isolated in-memory state and optional memory support. There is no local CLI for replaying fixture files, so regression use currently requires writing tests or direct library calls.

## Goals / Non-Goals
- Goals: provide a local CLI entry point, accept JSON array or JSONL eval case files, emit one JSON result per case, print a summary, and map failures to deterministic process exit codes.
- Non-Goals: frontend eval UI, remote eval service, production scheduler, benchmark dashboard, provider credential management, automatic fixture discovery, or persistent eval history.

## Decisions
- Decision: The CLI is TS Runtime owned.
  Rationale: `EvalReplayHarness`, `AgentExecutionRunner`, runtime events, and memory retrieval live in TS Runtime.
- Decision: Input supports JSON array and newline-delimited JSON.
  Rationale: JSON array is convenient for hand-written fixtures; JSONL is convenient for CI and append-only case lists.
- Decision: Output uses JSONL for per-case results plus a final summary object.
  Rationale: JSONL is easy to parse in CI while preserving deterministic evidence for each case.
- Decision: CLI exits `0` only when all cases pass.
  Rationale: CI needs a direct signal without parsing output.
- Decision: The first implementation uses existing deterministic/mock Java client wiring.
  Rationale: this keeps P5d local and testable; real provider selection and credentials remain outside this change.

## Risks / Trade-offs
- CLI fixture parsing can become a second schema layer. Mitigation: parse all cases through existing `EvalCaseSchema`.
- JSONL output may be verbose. Mitigation: favor machine-readability and deterministic evidence over presentation polish.
- Real-provider evals could require credentials and cost controls. Mitigation: keep real provider wiring out of scope for P5d.

## Migration Plan
No data migration is required. Existing `EvalReplayHarness` behavior remains unchanged. The CLI is additive.

## Open Questions
- None for P5d proposal.
