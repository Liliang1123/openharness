# Gate Closure Evidence Scope v23 Remediation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Repair the v22 governance/runtime evidence gaps so a fresh candidate scans all declared evidence/source/test roots fail-closed, contains the production storage worker graph and C34 Gate-D packet directories, and gives PIR complete anchor-to-parent commit evidence.

**Architecture:** Keep v22 immutable. Build v23 from the existing isolated candidate by adding a provenance-bound candidate Git-tree walker, a canonical dynamic worker entrypoint, the two runtime worker sources, and the current Gate-D packet directory markers needed by the already-reviewed C34 tests. The scanner will inspect every ordinary file in its evidence/source/test roots from the candidate tree; manifest rows continue to control fixture expectations and pinned/current content, while unbound candidate files are still inspected instead of silently skipped. The fresh v23 allowlist will use an exact `unlink` cleanup command and run PIR commit-diff checks before the final cleanup.

**Tech Stack:** Node.js ESM governance scripts, TypeScript/worker_threads, Vitest, pnpm offline workspace checks, JSON provenance manifest, Markdown review artifacts.

---

### Task 1: Record v23 contract and establish the implementation baseline

**Files:**
- Modify: [active OpenSpec proposal](file:///Users/elvis/file/develop/opensource/openharness/openspec/changes/refactor-gate-closure-evidence-scope/proposal.md)
- Modify: [active OpenSpec design](file:///Users/elvis/file/develop/opensource/openharness/openspec/changes/refactor-gate-closure-evidence-scope/design.md)
- Modify: [active OpenSpec tasks](file:///Users/elvis/file/develop/opensource/openharness/openspec/changes/refactor-gate-closure-evidence-scope/tasks.md)
- Modify: [active OpenSpec delta](file:///Users/elvis/file/develop/opensource/openharness/openspec/changes/refactor-gate-closure-evidence-scope/specs/gate-closure-evidence/spec.md)
- Create: [v23 preflight review](file:///Users/elvis/file/develop/opensource/openharness/docs/review/2026-08-11-gate-closure-evidence-scope-v23-preflight-review.md)
- Create: this implementation plan

- [ ] **Step 1: Write the v23 preflight review before implementation.** Record the five v22 findings, the verified root causes, exact allowed paths, the decision to retain v22 immutable, the prohibition on credentials/external calls/promotion/archive/push, and the stop condition for any new C34 or v23 verification failure.
- [ ] **Step 2: Update the active OpenSpec contract.** Add scenarios requiring candidate-tree root coverage, dynamic worker entrypoint closure, current Gate-D packet directory markers, exact v23 cleanup command, and anchor-parent commit-diff PIR evidence. Keep the product dashboard `partial` and the change active.
- [ ] **Step 3: Validate the active change.** Run:

  ```bash
  cd /Users/elvis/file/develop/opensource/openharness/.worktrees/gate-closure-evidence-scope
  npx openspec validate refactor-gate-closure-evidence-scope --strict --no-interactive
  ```

  Expected: strict validation exits `0` before source changes begin.

### Task 2: Add failing scanner root-coverage tests

**Files:**
- Modify: [governance regression](file:///Users/elvis/file/develop/opensource/openharness/docs/review/2026-08-10-gate-closure-evidence-scope-governance.test.mjs)
- Test: [secret-scan library](file:///Users/elvis/file/develop/opensource/openharness/docs/review/2026-08-05-gate-closure-persistence-fix-secret-scan-lib.mjs)

- [ ] **Step 1: Add a RED test for candidate-tree parsing and complete root retention.** Feed a synthetic Git tree containing an unbound evidence JSON path and assert the parser retains that path for inspection instead of filtering it by manifest membership. The test must construct any sensitive-shaped text at runtime and must not print the value.
- [ ] **Step 2: Run the governance test and verify the new test fails for the current v22 library.** Run:

  ```bash
  cd /Users/elvis/file/develop/opensource/openharness/.worktrees/gate-closure-evidence-scope
  node --test docs/review/2026-08-10-gate-closure-evidence-scope-governance.test.mjs
  ```

  Expected: the new root-retention assertion fails because v22 exposes no candidate-tree parser.
- [ ] **Step 3: Add RED adversarial tests for unknown extensions and non-regular Git tree entries.** Assert that a candidate entry with an unreadable extension and an entry whose Git mode/type is not an ordinary blob are rejected before content scanning.
- [ ] **Step 4: Run the focused governance test again and record the expected RED result.** Do not modify production scanner code before these assertions fail for the intended reason.

### Task 3: Implement candidate-tree scanning and fail-closed validation

**Files:**
- Modify: [secret-scan library](file:///Users/elvis/file/develop/opensource/openharness/docs/review/2026-08-05-gate-closure-persistence-fix-secret-scan-lib.mjs)
- Modify: [secret scanner](file:///Users/elvis/file/develop/opensource/openharness/docs/review/2026-08-05-gate-closure-persistence-fix-secret-scan.mjs)
- Modify: [governance regression](file:///Users/elvis/file/develop/opensource/openharness/docs/review/2026-08-10-gate-closure-evidence-scope-governance.test.mjs)

- [ ] **Step 1: Implement the smallest Git-tree parser.** Add functions that run `git --no-optional-locks ls-tree -r -z HEAD -- <root...>`, parse mode/type/object/path tuples, reject duplicate paths, reject any non-blob or mode other than `100644`/`100755`, reject unknown extensions, and return every ordinary path under the declared evidence/source/test roots.
- [ ] **Step 2: Implement candidate byte resolution.** Read a manifest row through the existing pinned/current provenance resolver when one exists; otherwise read the candidate `HEAD:path` blob. Never read an unbound dirty-worktree copy for root traversal.
- [ ] **Step 3: Restore root scanning in the CLI.** Traverse the four evidence roots plus the three test roots and three source roots from the candidate Git tree. Evidence files must pass `fileContainsSecret`; source/test files must match their fixture rule when one exists and an empty sensitive-literal set otherwise. Keep the exact fixture dependency contract and no-secret stdout behavior.
- [ ] **Step 4: Run the RED governance tests and focused scanner.** Run:

  ```bash
  cd /Users/elvis/file/develop/opensource/openharness/.worktrees/gate-closure-evidence-scope
  node --test docs/review/2026-08-10-gate-closure-evidence-scope-governance.test.mjs
  node docs/review/2026-08-05-gate-closure-persistence-fix-secret-scan.mjs --role=executor
  ```

  Expected: both exit `0` after the implementation; scanner output is only `secret_scan_ok`.
- [ ] **Step 5: Add a dirty-tree regression.** Change an unbound worktree copy in the test/evidence roots through an injected resolver or a temporary isolated fixture, then prove scanner bytes still come from candidate Git content and the result is unchanged. Do not alter the original mixed tests.

### Task 4: Add dynamic worker closure and C34 packet markers with TDD coverage

**Files:**
- Create: [runtime storage worker](file:///Users/elvis/file/develop/opensource/openharness/agent-runtime/src/storage/runtimeStorageWorker.ts)
- Create: [runtime storage worker kernel](file:///Users/elvis/file/develop/opensource/openharness/agent-runtime/src/storage/runtimeStorageWorkerKernel.ts)
- Create: [Gate-D attempt 001 procedure](file:///Users/elvis/file/develop/opensource/openharness/docs/verification/agent-runtime-v1/gate-d/gate-d-20260716-001/interruption-procedure.md)
- Create: [Gate-D attempt 002 procedure](file:///Users/elvis/file/develop/opensource/openharness/docs/verification/agent-runtime-v1/gate-d/gate-d-20260716-002/interruption-procedure.md)
- Modify: [closure verifier](file:///Users/elvis/file/develop/opensource/openharness/docs/review/2026-08-05-gate-closure-persistence-fix-closure-verify.mjs)
- Modify: [provenance verifier](file:///Users/elvis/file/develop/opensource/openharness/docs/review/2026-08-05-gate-closure-persistence-fix-provenance-verify.mjs)
- Modify: [machine manifest](file:///Users/elvis/file/develop/opensource/openharness/docs/review/2026-08-05-gate-closure-persistence-fix-provenance-manifest.json)
- Modify: [human manifest](file:///Users/elvis/file/develop/opensource/openharness/docs/review/2026-08-05-gate-closure-persistence-fix-provenance-manifest.md)
- Modify: [governance regression](file:///Users/elvis/file/develop/opensource/openharness/docs/review/2026-08-10-gate-closure-evidence-scope-governance.test.mjs)

- [ ] **Step 1: Add the dynamic worker entrypoint to the canonical entrypoint set and assert its transitive graph.** The closure verifier must include `agent-runtime/src/storage/runtimeStorageWorker.ts` as a distinct `agent-runtime` entrypoint and the TypeScript program must collect `runtimeStorageWorkerKernel.ts` and all local imports.
- [ ] **Step 2: Add a RED production bootstrap probe.** Run the focused production persistence/server tests in the isolated candidate before adding the two worker files and record the existing `RUNTIME_STORAGE_UNAVAILABLE` failure.
- [ ] **Step 3: Add the exact worker and kernel sources from the reviewed main-worktree candidate.** Preserve their existing protocol/error behavior; do not introduce a fallback worker or bypass production storage.
- [ ] **Step 4: Add the two current Gate-D interruption-procedure files.** Their only purpose in this candidate is to make the already-reviewed immutable attempt directories present for the Gate-D path containment checks; no new production evidence or promotion claim is made.
- [ ] **Step 5: Recompute the manifest.** Add pinned v23-anchor rows for the worker, kernel, and two Gate-D procedure files, add the candidate-tree `traceOutbox.test.ts` scanner fixture row without treating it as a correction entrypoint, update expected/manifest paths and counts, and bind the worker entrypoint and Gate-D paths in the human manifest. Keep source commits and hashes mechanically derived from the v23 candidate.
- [ ] **Step 6: Run closure/provenance and focused production tests.** Run:

  ```bash
  cd /Users/elvis/file/develop/opensource/openharness/.worktrees/gate-closure-evidence-scope
  node docs/review/2026-08-05-gate-closure-persistence-fix-closure-verify.mjs --require-locked --role=executor
  node docs/review/2026-08-05-gate-closure-persistence-fix-provenance-verify.mjs --require-closure --role=executor
  pnpm --filter @openharness/agent-runtime exec vitest run test/productionRunnerPersistence.test.ts test/productionServerLifecycle.test.ts
  ```

  Expected: closure/provenance pass with new numeric counts and both production test files pass.

### Task 5: Publish v23 evidence and correct PIR scope

**Files:**
- Create: [v23 allowlist](file:///Users/elvis/file/develop/opensource/openharness/docs/review/2026-08-11-gate-closure-evidence-scope-command-allowlist-v23.md)
- Create: [v23 implementation review](file:///Users/elvis/file/develop/opensource/openharness/docs/review/2026-08-11-gate-closure-evidence-scope-v23-implementation-review.md)
- Modify: [dashboard source](file:///Users/elvis/file/develop/opensource/openharness/docs/project-dashboard/development-log.json)
- Regenerate: [dashboard Markdown](file:///Users/elvis/file/develop/opensource/openharness/docs/project-dashboard/development-log.md)
- Regenerate: [dashboard HTML](file:///Users/elvis/file/develop/opensource/openharness/docs/project-dashboard/index.html)

- [ ] **Step 1: Define a fresh v23 anchor and exact C23-C50 sequence.** v22 remains immutable; C34 must exit `0` in v23, and v22 C39/C48 `BLOCKED_BASELINE` is not silently reused as a C34 exception.
- [ ] **Step 2: Replace C51 cleanup text with one exact v23 command.** Use `unlink /tmp/openharness-gate-closure-evidence-scope-v23-anchor`; do not record v22's `unlink` as v22 C51 PASS and do not rerun the consumed v22 anchor.
- [ ] **Step 3: Add PIR anchor/parent identity and commit-diff commands.** The reviewer must verify the clean candidate's HEAD identity, its parent identity, and a deterministic `git diff --no-ext-diff --binary --full-index HEAD^ HEAD | gzip -n -c | base64 | tr -d '\\n'` representation, then inspect each committed path against the allowlist. PIR still compares initial/final working-tree snapshots and staged diffs, but commit diff is now mandatory.
- [ ] **Step 4: Keep the anchor until PIR completes.** Run C50 clean-worktree cleanup, then the distinct reviewer PIR, then execute the exact v23 C51 `unlink`; any PIR truncation, identity gap, scope mismatch, or C34 failure is `BLOCKED`.
- [ ] **Step 5: Synchronize dashboard source only.** Keep the governance entry `proposed`, the product entry `partial`, and the OpenSpec change active. Run `node docs/project-dashboard/scripts/render-dashboard.mjs` after JSON changes.

### Task 6: Verification and review checkpoint

**Files:**
- Review: all files listed in Tasks 2–5, plus the v23 plan and preflight Review

- [ ] **Step 1: Run focused syntax, governance, scanner, closure, provenance, correction, production, OpenSpec, and dashboard checks in the isolated candidate.** Use only local/offline commands; do not run credentials, provider/MCP/browser calls, promotion, archive, push, or broad cleanup.
- [ ] **Step 2: Run an independent implementation Review against the complete v23 diff.** The reviewer must trace scanner root traversal, dynamic worker wiring, Gate-D packet presence, manifest rows, exact allowlist, and commit-diff PIR. Any finding returns to the same task for fix and fresh verification.
- [ ] **Step 3: Leave final status `BLOCKED` unless the new review and all required evidence pass.** Do not mark OpenSpec tasks complete, do not mark dashboard verified, and do not claim C39/C48 completion from v22.
