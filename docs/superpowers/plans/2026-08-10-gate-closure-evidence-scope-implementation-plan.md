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

- [ ] **Step 1: Write the failing tests.** Assert that the manifest has schema version 2, has a unique `secretScanDependencies` array, every dependency is a locked closure path with exactly one provenance row, and every scanner fixture-rule key is declared. Add an in-memory candidate-source test that resolves a pinned row from `git show` even when the worktree copy is changed.

- [ ] **Step 2: Run the governance test to verify RED.**

  Run: `node --test /Users/elvis/file/develop/opensource/openharness/docs/review/2026-08-05-gate-closure-persistence-fix-governance.test.mjs /Users/elvis/file/develop/opensource/openharness/docs/review/2026-08-10-gate-closure-evidence-scope-governance.test.mjs`

  Expected: the existing v21 manifest fails because it is schema version 1 and has no explicit scanner dependency set.

## Task 2: Extract correction-only test artifacts

**Files:**

- Create: [mcpRegistry correction test](file:///Users/elvis/file/develop/opensource/openharness/agent-runtime/test/mcpRegistry.correction.test.ts)
- Create: [traceOutbox correction test](file:///Users/elvis/file/develop/opensource/openharness/agent-runtime/test/traceOutbox.correction.test.ts)
- Test source reference only: [original mcpRegistry test](file:///Users/elvis/file/develop/opensource/openharness/agent-runtime/test/mcpRegistry.test.ts)
- Test source reference only: [original traceOutbox test](file:///Users/elvis/file/develop/opensource/openharness/agent-runtime/test/traceOutbox.test.ts)

- [ ] **Step 1: Write the smallest correction-only tests.** The MCP artifact contains only the config-env redaction test and a local fake client; it must preserve the two expected sensitive-literal fixture categories without exposing the literal in assertion output. The trace artifact contains only the durable trace header/redaction and retry-identity test needed for the correction contract, with a local seeded outbox and no imports from the mixed original file. No unrelated lifecycle/concurrency/routing tests are copied.

- [ ] **Step 2: Run the two focused tests.**

  Run: `pnpm --filter @openharness/agent-runtime exec vitest run /Users/elvis/file/develop/opensource/openharness/agent-runtime/test/mcpRegistry.correction.test.ts /Users/elvis/file/develop/opensource/openharness/agent-runtime/test/traceOutbox.correction.test.ts`

  Expected: the tests execute against the v21 implementation; any failure is fixed in the correction artifact or its exact source dependency, never by adding the full original test files.

- [ ] **Step 3: Run the secret-literal inventory without printing values.** Record only path, rule key, and count in the governance test; verify the two new files, not the mixed originals, own the correction fixture counts.

## Task 3: Implement candidate-bound secret scan

**Files:**

- Create: [secret scan library](file:///Users/elvis/file/develop/opensource/openharness/docs/review/2026-08-05-gate-closure-persistence-fix-secret-scan-lib.mjs)
- Modify: [secret scanner CLI](file:///Users/elvis/file/develop/opensource/openharness/docs/review/2026-08-05-gate-closure-persistence-fix-secret-scan.mjs)
- Modify: [provenance verifier](file:///Users/elvis/file/develop/opensource/openharness/docs/review/2026-08-05-gate-closure-persistence-fix-provenance-verify.mjs)
- Modify: [closure verifier](file:///Users/elvis/file/develop/opensource/openharness/docs/review/2026-08-05-gate-closure-persistence-fix-closure-verify.mjs)

- [ ] **Step 1: Add RED assertions to the governance test.** Cover missing dependency, duplicate dependency, fixture-rule key outside dependency set, dirty worktree content for a source-pinned row, and unbound current-required row.

- [ ] **Step 2: Run the governance test and capture the expected failures.**

- [ ] **Step 3: Implement the minimal library API.** Export `loadCandidateManifest(repoRoot)`, `resolveCandidateBytes(repoRoot, row)`, `collectSensitiveLiterals(text)`, and `validateSecretScanDependencies(manifest, fixtureRulePaths)`. `resolveCandidateBytes` uses the current file only when `requireCurrent=true`; otherwise it executes `git --no-optional-locks show <sourceCommit>:<path>` and never reads the dirty copy. All validation failures exit through the existing redacted `secret_scan_failed` path.

- [ ] **Step 4: Update the CLI.** Keep evidence roots fail-closed. Replace direct source/test root reads for fixture expectations with the manifest dependency set and candidate resolver. Reject any fixture rule key not declared by the manifest, and reject any dependency without a closure path and provenance row.

- [ ] **Step 5: Run the governance test to verify GREEN.**

## Task 4: Version and relock manifest/closure

**Files:**

- Modify: [machine manifest](file:///Users/elvis/file/develop/opensource/openharness/docs/review/2026-08-05-gate-closure-persistence-fix-provenance-manifest.json)
- Modify: [human manifest](file:///Users/elvis/file/develop/opensource/openharness/docs/review/2026-08-05-gate-closure-persistence-fix-provenance-manifest.md)
- Modify: [provenance verifier](file:///Users/elvis/file/develop/opensource/openharness/docs/review/2026-08-05-gate-closure-persistence-fix-provenance-verify.mjs)
- Modify: [closure verifier](file:///Users/elvis/file/develop/opensource/openharness/docs/review/2026-08-05-gate-closure-persistence-fix-closure-verify.mjs)
- Modify: [governance scope test](file:///Users/elvis/file/develop/opensource/openharness/docs/review/2026-08-10-gate-closure-evidence-scope-governance.test.mjs)

- [ ] **Step 1: Add the two correction-only entrypoints and scanner dependency paths in pending form.** The dependency inventory is generated from all unique fixture-rule keys, then sorted and compared mechanically; the two original mixed test files are not correction entrypoints.

- [ ] **Step 2: Create the candidate commit in the isolated branch after scope approval.** Use the new allowlist's exact staging list; record its SHA as the new manifest `baseCommit`.

- [ ] **Step 3: Recompute closure and rows from the candidate commit.** Add source blob/hash/mode and current hash/mode only for current-required rows. Set closure to `locked` only after `expectedPaths`, `manifestPaths`, dependency paths, and rows are equal; update the human Markdown binding without changing v21's historical artifact.

- [ ] **Step 4: Run the strict verifiers.**

  Run: `node /Users/elvis/file/develop/opensource/openharness/docs/review/2026-08-05-gate-closure-persistence-fix-closure-verify.mjs --require-locked --role=executor`

  Run: `node /Users/elvis/file/develop/opensource/openharness/docs/review/2026-08-05-gate-closure-persistence-fix-provenance-verify.mjs --require-closure --role=executor`

  Expected: exact numeric `closure_ok` and `provenance_ok` output with the new counts.

## Task 5: Add fresh scope diagnostic and v22 allowlist

**Files:**

- Create: [scope diagnostic](file:///Users/elvis/file/develop/opensource/openharness/docs/review/2026-08-10-gate-closure-evidence-scope-diagnostic.mjs)
- Create: [v22 allowlist](file:///Users/elvis/file/develop/opensource/openharness/docs/review/2026-08-10-gate-closure-persistence-fix-command-allowlist-v22.md)
- Modify: [dashboard source](file:///Users/elvis/file/develop/opensource/openharness/docs/project-dashboard/development-log.json)

- [ ] **Step 1: Write the diagnostic RED test.** The diagnostic must report only normalized paths and numeric counts, accept explicit `--role` and `--phase`, reject unknown/sensitive arguments, and return a non-zero status for a scope mismatch without writing a file.

- [ ] **Step 2: Implement and run the diagnostic once under its declared author-preflight role.** Record command text, role, phase, invocation count, and numeric exit status in the v22 allowlist; do not promote its result to C31 evidence.

- [ ] **Step 3: Write v22 as a new document.** Preserve v21, define a fresh anchor/commit, fresh C23-C51 counts, and forbid external calls, promotion, archive, push, and broad cleanup.

- [ ] **Step 4: Run strict OpenSpec and dashboard checks.**

  Run: `npx openspec validate refactor-gate-closure-evidence-scope --strict --no-interactive`

  Run: `pnpm dashboard:check`

## Task 6: Review, verification, and handoff

- [ ] **Step 1: Run the focused correction tests, governance tests, closure/provenance verifiers, and scanner in the isolated candidate.** Keep the known clean-v21 full-suite baseline failure separate from new results.
- [ ] **Step 2: Request a code review with a distinct reviewer identity.** Review exact scope, scanner candidate source, dependency set, manifest rows, and allowlist command counts. Fix all important findings before integration.
- [ ] **Step 3: Before any main-worktree staging/commit, present the exact allowlist path set and obtain fresh confirmation for the changed scope.** Do not use `git add .`.
- [ ] **Step 4: After the user confirms, execute only the new allowlist's fresh C23-C51 sequence and then the independent PIR.** Do not claim completion until fresh output verifies every required gate.
