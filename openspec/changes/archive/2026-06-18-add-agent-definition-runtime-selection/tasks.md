## 1. Proposal Gate
- [x] 1.1 Create OpenSpec proposal, design, tasks, and spec deltas.
- [x] 1.2 Validate the change with `npx openspec validate add-agent-definition-runtime-selection --strict --no-interactive`.
- [x] 1.3 Obtain user approval before implementation.

## 2. Implementation Plan Gate
- [x] 2.1 After approval, create `docs/superpowers/plans/2026-06-18-add-agent-definition-runtime-selection.md`.
- [x] 2.2 Include TDD steps, Step Evidence Gate checkpoints, affected files, and verification commands.
- [x] 2.3 Obtain user direction to execute inline or with subagents.

## 3. TDD Implementation
- [x] 3.1 Add failing tests for optional `agentId` selecting a loaded definition and prompt metadata.
- [x] 3.2 Add failing tests for omitted `agentId` preserving default behavior.
- [x] 3.3 Add failing tests for unknown `agentId` failing before execution/model calls.
- [x] 3.4 Add failing tests for unknown selected `promptRef` failing before Java model calls.
- [x] 3.5 Implement minimal runtime changes to pass tests.
- [x] 3.6 Run targeted typecheck and tests.

## 4. Verification And Archive
- [x] 4.1 Run full verification required by repository rules.
- [x] 4.2 Update task checklist after implementation is complete.
- [x] 4.3 Archive the approved change and run strict all-spec validation.
- [x] 4.4 Create closeout design documentation under `docs/design/`.
