# Change: Refactor Gate Closure Evidence Scope

## Why

The v21 Phase B run reached C31 and stopped because the clean checkout did not contain the current dirty-tree fixture changes in [mcpRegistry.test.ts](file:///Users/elvis/file/develop/opensource/openharness/agent-runtime/test/mcpRegistry.test.ts) and [traceOutbox.test.ts](file:///Users/elvis/file/develop/opensource/openharness/agent-runtime/test/traceOutbox.test.ts), while the committed [secret scanner](file:///Users/elvis/file/develop/opensource/openharness/docs/review/2026-08-05-gate-closure-persistence-fix-secret-scan.mjs) expected their sensitive-literal counts.

Adding both whole files to the next commit would violate the correction plan's file-level provenance rule and would admit unrelated functional-test changes. The scanner also has an implicit dependency on fixture expectations outside the locked closure. This change establishes a new, auditable governance scope before any further C31/C32-C51 execution.

## What Changes

- Partition the dirty changes originating from [mcpRegistry.test.ts](file:///Users/elvis/file/develop/opensource/openharness/agent-runtime/test/mcpRegistry.test.ts) and [traceOutbox.test.ts](file:///Users/elvis/file/develop/opensource/openharness/agent-runtime/test/traceOutbox.test.ts) at test/fixture level, and extract only correction-owned, self-contained tests into dedicated correction-only test artifacts. The unrelated functional-test changes remain outside the correction candidate and must not be staged.
- Extend the canonical closure and provenance manifest with the two correction-only entrypoints, all of their imports/fixtures/config boundaries, and an explicit secret-scan dependency set. Every dependency path receives a provenance row; no path is admitted solely by expanding the staging list.
- Make the secret scanner consume the provenance-managed candidate content and declared dependency set. Its clean-tree and dirty-tree behavior must be reproducible, must remain fail-closed, and must not rely on uncommitted copies of the two original test files.
- Restore candidate-Git-tree traversal across the declared evidence/source/test roots. Every ordinary candidate file in those roots must be inspected; unknown extensions and non-regular tree entries must fail closed rather than being silently skipped.
- Add the dynamic production storage worker entrypoint and its kernel to the locked closure, and include the reviewed Gate-D attempt directory markers required by the existing C34 production diagnostics tests.
- Create a fresh versioned allowlist (v22 or later) with a new anchor/commit scope, exact role/phase/count/exit-status contracts, and a one-time auditable scope diagnostic. v21 C31 evidence remains consumed and immutable; it is not rerun or relabeled.
- Create v23 as a new evidence namespace after the v22 blocker. v22's `unlink` cleanup mismatch remains immutable; v23 must declare its exact cleanup command and must require PIR to inspect the complete reversible `anchor^..anchor` commit diff in addition to working-tree/staged snapshots.
- After explicit proposal approval, use a reviewed implementation plan, TDD, fresh exact-scope staging/commit, fresh C23-C51 execution, and a separate post-implementation review (PIR). Keep the dashboard partial and active OpenSpec changes active.

## Impact

- Affected governance artifacts: [correction plan](file:///Users/elvis/file/develop/opensource/openharness/docs/superpowers/plans/2026-08-07-gate-closure-persistence-fix-correction-plan.md), [v21 allowlist](file:///Users/elvis/file/develop/opensource/openharness/docs/review/2026-08-05-gate-closure-persistence-fix-command-allowlist.md), [closure verifier](file:///Users/elvis/file/develop/opensource/openharness/docs/review/2026-08-05-gate-closure-persistence-fix-closure-verify.mjs), [provenance verifier](file:///Users/elvis/file/develop/opensource/openharness/docs/review/2026-08-05-gate-closure-persistence-fix-provenance-verify.mjs), [machine manifest](file:///Users/elvis/file/develop/opensource/openharness/docs/review/2026-08-05-gate-closure-persistence-fix-provenance-manifest.json), [human manifest](file:///Users/elvis/file/develop/opensource/openharness/docs/review/2026-08-05-gate-closure-persistence-fix-provenance-manifest.md), and the secret scanner.
- Affected test scope: the correction-only derivatives of the two named Agent Runtime tests, governance regression coverage for clean/dirty candidate reproducibility and candidate-tree adversarial entries, and the existing Gate-D/production regression slice.
- Affected runtime/evidence scope: the dynamic storage worker/kernel sources and the two existing Gate-D interruption-procedure packet markers required for clean C34 execution.
- Existing product behavior, public schemas, provider authority, and runtime APIs are not changed by this proposal.
- The current main worktree contains unrelated dirty/untracked changes. They remain untouched and outside the new allowlist.

## Non-Goals and Safety Boundaries

- No real credential read, provider call, MCP call, browser call, or 24-hour soak.
- No Gate C/D promotion, evidence promotion, OpenSpec archive, worktree deletion outside the disposable probe cleanup, or push.
- No broad reset/checkout/clean and no overwrite of the two original dirty test files or other agents' work.
- No claim that C31 passed, no reuse of the consumed v21 C31 count, and no PIR until the fresh implementation sequence completes.
- No relabeling of v22 C34/C51 or v22 `BLOCKED`; v23 must use a fresh anchor and fresh command counts.

## Approval Gate

Implementation MUST NOT begin until this proposal, its design, tasks, and governance spec delta are explicitly approved. Approval must cover the selected extraction strategy, the v23 candidate-tree/dynamic-worker closure, and the new governance change id `refactor-gate-closure-evidence-scope`. The user's 2026-08-11 instruction to continue is the implementation authorization for this v23 remediation scope; before any v23 staging or commit, obtain a fresh exact-path confirmation because the file scope and evidence contract changed again.
