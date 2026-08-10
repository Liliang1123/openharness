# Gate Closure Evidence Scope Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the correction-only test scope, provenance closure, and secret-scan dependency set reproducible in clean and dirty worktrees, then publish a fresh allowlist without reusing v21 C31 evidence.

**Architecture:** Two dedicated correction-only test entrypoints replace whole-file admission of the mixed dirty tests. The machine manifest gains a versioned secret-scan dependency section; closure/provenance verifiers validate that section and all rows. The scanner resolves candidate bytes from the manifest's pinned source commit or current-required rows, so unrelated dirty files cannot affect the result.

**Tech Stack:** TypeScript/Vitest, Node.js ESM governance scripts, JSON/Markdown provenance artifacts, pnpm, Git worktrees.

---

## Preflight

- [x] Read the approved [OpenSpec proposal](file:///Users/elvis/file/develop/opensource/openharness/openspec/changes/refactor-gate-closure-evidence-scope/proposal.md), [design](file:///Users/elvis/file/develop/opensource/openharness/openspec/changes/refactor-gate-closure-evidence-scope/design.md), [tasks](file:///Users/elvis/file/develop/opensource/openharness/openspec/changes/refactor-gate-closure-evidence-scope/tasks.md), and [governance spec delta](file:///Users/elvis/file/develop/opensource/openharness/openspec/changes/refactor-gate-closure-evidence-scope/specs/gate-closure-evidence/spec.md).
- [x] Record the conditional implementation approval in [scope preflight Review](file:///Users/elvis/file/develop/opensource/openharness/docs/review/2026-08-10-gate-closure-evidence-scope-preflight-review.md).
- [x] Preserve the v21 anchor and the one-time v21 C31 evidence.

## Task 1: Add RED governance tests for explicit dependencies

**Files:**

- Create: [governance scope test](file:///Users/elvis/file/develop/opensource/openharness/docs/review/2026-08-10-gate-closure-evidence-scope-governance.test.mjs)
- Modify: [machine manifest](file:///Users/elvis/file/develop/opensource/openharness/docs/review/2026-08-05-gate-closure-persistence-fix-provenance-manifest.json)
- Test: the governance test itself with Node's built-in test runner

- [x] **Step 1: Write the failing tests.** Assert that the manifest has schema version 2, has a unique `secretScanDependencies` array, every dependency is a locked closure path with exactly one provenance row, and every scanner fixture-rule key is declared. Add an in-memory candidate-source test that resolves a pinned row from `git show` even when the worktree copy is changed.

- [x] **Step 2: Run the governance test to verify RED.**

  Run: `node --test /Users/elvis/file/develop/opensource/openharness/docs/review/2026-08-10-gate-closure-evidence-scope-governance.test.mjs`

  Expected: the existing v21 manifest fails because it is schema version 1 and has no explicit scanner dependency set.

## Task 2: Extract correction-only test artifacts

**Files:**

- Create: [mcpRegistry correction test](file:///Users/elvis/file/develop/opensource/openharness/agent-runtime/test/mcpRegistry.correction.test.ts)
- Create: [traceOutbox correction test](file:///Users/elvis/file/develop/opensource/openharness/agent-runtime/test/traceOutbox.correction.test.ts)
- Test source reference only: [original mcpRegistry test](file:///Users/elvis/file/develop/opensource/openharness/agent-runtime/test/mcpRegistry.test.ts)
- Test source reference only: [original traceOutbox test](file:///Users/elvis/file/develop/opensource/openharness/agent-runtime/test/traceOutbox.test.ts)

- [x] **Step 1: Write the smallest correction-only tests.** The MCP artifact contains only the config-env redaction test and a local fake client; it must preserve the two expected sensitive-literal fixture categories without exposing the literal in assertion output. The trace artifact contains only the durable trace header/redaction and retry-identity test needed for the correction contract, with a local seeded outbox and no imports from the mixed original file. No unrelated lifecycle/concurrency/routing tests are copied.

- [x] **Step 2: Run the two focused tests.**

  Run: `pnpm --filter @openharness/agent-runtime exec vitest run /Users/elvis/file/develop/opensource/openharness/agent-runtime/test/mcpRegistry.correction.test.ts /Users/elvis/file/develop/opensource/openharness/agent-runtime/test/traceOutbox.correction.test.ts`

  Expected: the tests execute against the v21 implementation; any failure is fixed in the correction artifact or its exact source dependency, never by adding the full original test files.

- [x] **Step 3: Run the secret-literal inventory without printing values.** Record only path, rule key, and count in the governance test; verify the two new files, not the mixed originals, own the correction fixture counts.

## Task 3: Implement candidate-bound secret scan

**Files:**

- Create: [secret scan library](file:///Users/elvis/file/develop/opensource/openharness/docs/review/2026-08-05-gate-closure-persistence-fix-secret-scan-lib.mjs)
- Modify: [secret scanner CLI](file:///Users/elvis/file/develop/opensource/openharness/docs/review/2026-08-05-gate-closure-persistence-fix-secret-scan.mjs)
- Modify: [provenance verifier](file:///Users/elvis/file/develop/opensource/openharness/docs/review/2026-08-05-gate-closure-persistence-fix-provenance-verify.mjs)
- Modify: [closure verifier](file:///Users/elvis/file/develop/opensource/openharness/docs/review/2026-08-05-gate-closure-persistence-fix-closure-verify.mjs)

- [x] **Step 1: Add RED assertions to the governance test.** Cover missing dependency, duplicate dependency, fixture-rule key outside dependency set, dirty worktree content for a source-pinned row, and unbound current-required row.

- [x] **Step 2: Run the governance test and capture the expected failures.**

- [x] **Step 3: Implement the minimal library API.** Export `readCandidateManifest(repoRoot)`, `resolveCandidateBytes(repoRoot, row)`, `collectSensitiveLiterals(text)`, and `validateSecretScanDependencies(manifest, fixtureRulePaths)`. `resolveCandidateBytes` uses the current file only when `requireCurrent=true`; otherwise it executes `git --no-optional-locks show <sourceCommit>:<path>` and never reads the dirty copy. All validation failures exit through the existing redacted `secret_scan_failed` path.

- [x] **Step 4: Update the CLI.** Keep evidence roots fail-closed. Replace direct source/test root reads for fixture expectations with the manifest dependency set and candidate resolver. Reject any fixture rule key not declared by the manifest, and reject any dependency without a closure path and provenance row.

- [x] **Step 5: Run the governance test to verify GREEN.**

## Task 4: Version and relock manifest/closure

**Files:**

- Modify: [machine manifest](file:///Users/elvis/file/develop/opensource/openharness/docs/review/2026-08-05-gate-closure-persistence-fix-provenance-manifest.json)
- Modify: [human manifest](file:///Users/elvis/file/develop/opensource/openharness/docs/review/2026-08-05-gate-closure-persistence-fix-provenance-manifest.md)
- Modify: [provenance verifier](file:///Users/elvis/file/develop/opensource/openharness/docs/review/2026-08-05-gate-closure-persistence-fix-provenance-verify.mjs)
- Modify: [closure verifier](file:///Users/elvis/file/develop/opensource/openharness/docs/review/2026-08-05-gate-closure-persistence-fix-closure-verify.mjs)
- Modify: [governance scope test](file:///Users/elvis/file/develop/opensource/openharness/docs/review/2026-08-10-gate-closure-evidence-scope-governance.test.mjs)

- [x] **Step 1: Add the two correction-only entrypoints and scanner dependency paths in locked form.** The dependency inventory is generated from all unique fixture-rule keys, then sorted and compared mechanically; the two original mixed test files are not correction entrypoints.

- [x] **Step 2: Create the candidate implementation commit in the isolated branch after scope approval.** The manifest is pinned to the candidate source commit `42bd977078d4811a2969949c7be6587c75615c35`; main-worktree staging/commit remains gated by the fresh v22 scope confirmation.

- [x] **Step 3: Recompute closure and rows from the candidate commit.** Added source blob/hash/mode and current hash/mode only for current-required rows. Locked closure after `expectedPaths`, `manifestPaths`, dependency paths, and rows were equal; updated the human Markdown binding without changing v21's historical artifact.

- [x] **Step 4: Run the strict verifiers.**

  Run: `node /Users/elvis/file/develop/opensource/openharness/docs/review/2026-08-05-gate-closure-persistence-fix-closure-verify.mjs --require-locked --role=executor`

  Run: `node /Users/elvis/file/develop/opensource/openharness/docs/review/2026-08-05-gate-closure-persistence-fix-provenance-verify.mjs --require-closure --role=executor`

  Expected: exact numeric `closure_ok` and `provenance_ok` output with the new counts.

## Task 5: Add fresh scope diagnostic and v22 allowlist

**Files:**

- Create: [scope diagnostic](file:///Users/elvis/file/develop/opensource/openharness/docs/review/2026-08-10-gate-closure-evidence-scope-diagnostic.mjs)
- Create: [v22 allowlist](file:///Users/elvis/file/develop/opensource/openharness/docs/review/2026-08-10-gate-closure-persistence-fix-command-allowlist-v22.md)
- Modify: [dashboard source](file:///Users/elvis/file/develop/opensource/openharness/docs/project-dashboard/development-log.json)

- [x] **Step 1: Write the diagnostic RED test.** The diagnostic reports only normalized paths and numeric counts, accepts explicit `--role` and `--phase`, rejects unknown/sensitive arguments, and returns a non-zero status for a scope mismatch without writing a file.

- [x] **Step 2: Implement and run the diagnostic once under its declared author-preflight role.** The final candidate invocation is recorded in the v22 allowlist with role, phase, count, and numeric exit status; it is diagnostic-only and not C31 evidence.

- [x] **Step 3: Write v22 as a new document.** v21 is preserved; v22 defines a fresh anchor/commit, fresh C23-C51 counts, and forbids external calls, promotion, archive, push, and broad cleanup.

- [ ] **Step 4: Run strict OpenSpec and dashboard checks in the main candidate after integration.**

  Run: `npx openspec validate refactor-gate-closure-evidence-scope --strict --no-interactive`

  Run: `pnpm dashboard:check`

## Task 6: Review, verification, and handoff

- [x] **Step 1: Run the focused correction tests, governance tests, closure/provenance verifiers, and scanner in the isolated candidate.** Kept the known clean-v21 full-suite baseline failure separate from new results.
- [ ] **Step 2: Request a code review with a distinct reviewer identity.** Review exact scope, scanner candidate source, dependency set, manifest rows, and allowlist command counts; fix all important findings before integration.
- [ ] **Step 3: Before any main-worktree staging/commit, present the exact allowlist path set and obtain fresh confirmation for the changed scope.** Do not use `git add .`.
- [ ] **Step 4: After the user confirms, execute only the new allowlist's fresh C23-C51 sequence and then the independent PIR.** Do not claim completion until fresh output verifies every required gate.
