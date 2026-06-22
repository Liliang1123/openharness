## 1. Proposal Gate
- [x] 1.1 Create OpenSpec proposal, design, tasks, and spec delta.
- [x] 1.2 Validate the change with `npx openspec validate add-agent-definition-model-selection --strict --no-interactive`.
- [x] 1.3 Sync development dashboard entry with status `proposed`.
- [x] 1.4 Obtain user approval before implementation.

## 2. Implementation Plan Gate
- [x] 2.1 After approval, create `docs/superpowers/plans/2026-06-18-add-agent-definition-model-selection.md`.
- [x] 2.2 Include TDD steps, Step Evidence Gate checkpoints, affected files, and verification commands.
- [x] 2.3 Obtain user direction to execute inline or with subagents.

## 3. TDD Implementation
- [x] 3.1 Add failing runtime tests that selected Agent Definition `model` is sent as `ModelChatRequest.model`.
- [x] 3.2 Add failing runtime tests that omitted `model` preserves default logical model behavior.
- [x] 3.3 Implement minimal runtime model resolution.
- [x] 3.4 Run targeted typecheck and tests.

## 4. Verification And Archive
- [x] 4.1 Run full verification required by repository rules.
- [x] 4.2 Update development dashboard entry to `verified` after formal verification passes.
- [x] 4.3 Archive the approved change and run strict all-spec validation.
- [x] 4.4 Create closeout design documentation under `docs/design/`.
- [x] 4.5 Update development dashboard entry to `archived` and regenerate MD/HTML.
