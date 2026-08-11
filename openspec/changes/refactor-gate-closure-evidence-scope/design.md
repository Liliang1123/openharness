## Context

The v21 correction slice committed at `3693e62a665cf2d60399229e1231fb44d5817fa4` is historical and immutable. v22 was the first expanded candidate and locked at 17 entrypoints, 102 closure paths, and 107 rows; its fresh sequence passed C23-C33 and stopped at C34 with clean-tree `RUNTIME_STORAGE_UNAVAILABLE`/missing Gate-D packet failures. The [v22 blocked review](file:///Users/elvis/file/develop/opensource/openharness/docs/review/2026-08-10-gate-closure-evidence-scope-implementation-review.md) and the current external findings require a fresh v23 remediation; v21/v22 evidence is not rerun or relabeled.

The two original test files are large dirty files. They mix the correction behavior needed by the persistence fix with additional functional tests. Treating either complete file as a correction fixture would make the clean candidate depend on unrelated work and would invalidate the plan's “every fixture has a manifest row” contract.

## Goals

- Produce two self-contained correction-only test artifacts whose imports, fixtures, and secret literals can be reviewed independently.
- Make the candidate closure mechanically equal to the declared entrypoints, boundaries, scanner dependencies, and provenance rows.
- Make scanner results independent of unrelated dirty copies in the main worktree while preserving fail-closed secret detection.
- Preserve v21 as immutable historical evidence and create a fresh v22-or-later evidence namespace.
- Ensure the scanner walks every ordinary file in the candidate Git-tree evidence/source/test roots and fails closed on unknown extensions, non-regular entries, parse errors, and uninspected paths.
- Make the production worker's dynamic `new URL("./runtimeStorageWorker.ts", import.meta.url)` edge an explicit closure entrypoint, including the worker kernel graph and clean Gate-D packet directory markers needed by C34.
- Require PIR to bind the executor's anchor to its parent and inspect a deterministic reversible commit diff for every committed path, while retaining the initial/final workspace and staged-diff checks.

## Non-Goals

- Reconcile or stage the full dirty versions of the two original tests.
- Change runtime semantics beyond what is already represented by the correction-only tests.
- Add a new public product capability or modify existing Agent Runtime/OpenAI/MCP contracts.

## Decisions

### 1. Extract correction-only tests, do not admit whole dirty files

The implementation first builds a line/test-level scope ledger for both original files. Each candidate test is classified as correction-only, unrelated functional behavior, shared helper, or fixture/dependency. The correction-only tests are copied or moved into dedicated `*.correction.test.ts` artifacts with local helpers where that keeps the dependency graph explicit. The original files remain outside the correction candidate; their unrelated dirty content is preserved in place and is never staged by this change.

The ledger records the originating file and test block, the production symbol under test, the expected behavior, the fixture literals and redacted hashes/counts, and the reason every excluded block is outside the correction scope. A test is not correction-only merely because it touches a changed production module.

### 2. Extend closure with an explicit dependency class

The closure verifier gains a canonical correction-entrypoint set for the two dedicated test artifacts and a canonical dependency set for every path whose content affects secret-scan fixture expectations. The dependency inventory is generated from the scanner rule keys and then reviewed against the manifest; the final inventory is 29 unique rule paths, with 16 outside the v21 closure. The candidate also adds one transitive TypeScript test helper, so the relocked closure adds 17 paths and 17 rows rather than only two.

The manifest schema is versioned for an explicit `secretScanDependencies` field. Every declared dependency path must have a provenance row, and every path in the locked candidate closure must be represented exactly once in the machine and human manifests. Paths pinned to the base commit are read as pinned candidate content; newly extracted correction artifacts are current-required rows with their post-commit hash/mode. The old v21 manifest is not rewritten.

### 3. Bind scanner expectations to provenance-managed content

The scanner retains no-secret-output and fail-closed behavior. Its sensitive-literal expectation map is checked against the declared dependency set and the manifest rows. For candidate evaluation, a path with `requireCurrent=false` is read from its pinned source commit, while a correction path with `requireCurrent=true` is read from the reviewed current candidate. This prevents unrelated dirty versions of the original files from changing the result.

The scanner continues to inspect evidence/source/test categories required by the correction contract, but the exact fixture-rule dependency set is explicit and provenance-bound. Governance regression tests must demonstrate the same result for a clean candidate and for a dirty worktree containing unrelated changes, and must fail when a rule key or dependency row is omitted.

### 4. Fresh allowlist and evidence identity

The new allowlist is a new versioned document, not an edit that erases v21. It defines a fresh anchor/commit sequence and new counts for the complete C23-C51 flow. The one-time scope diagnostic is an exact command with declared role, phase, invocation count, numeric exit status, and redacted path/count output. It is diagnostic evidence only and cannot be promoted to C31 PASS.

The fresh executor and the post-implementation reviewer must have distinct verifiable session identities. The reviewer must independently re-check locked closure, provenance rows, scanner dependencies, initial/final workspace evidence, and exact allowlist counts before any PIR conclusion.

### 5. Candidate-tree scanner coverage

The scanner obtains a Git tree snapshot from the fresh candidate anchor for the declared evidence/source/test roots. It parses every ordinary blob under those roots, rejects symlinks/submodules/other non-regular entries and unreadable extensions, and reads unbound non-fixture content from the candidate tree rather than the dirty worktree. Manifest rows remain authoritative for pinned/current fixture content and every fixture rule remains exactly bound to the dependency set. This preserves the v22 candidate-bound property without silently skipping newly added evidence files.

### 6. Dynamic worker and C34 closure

The storage worker file is a canonical dynamic entrypoint in addition to the static TypeScript entrypoints. Its kernel and transitive local imports are collected by the closure verifier. The two reviewed Gate-D interruption-procedure files are current candidate packet markers so clean C34 path-containment checks see the same immutable attempt directories as the reviewed main candidate; they do not constitute promotion or fresh production evidence.

### 7. v23 PIR and cleanup identity

v22's exact-command mismatch is recorded as a scope violation and cannot be retroactively passed. v23 declares `unlink` as its own exact anchor cleanup command. PIR runs after clean-worktree cleanup but before v23 anchor cleanup, verifies `HEAD` and `HEAD^` identity, captures the complete deterministic reversible `HEAD^..HEAD` commit diff, and checks each committed path against the v23 allowlist. A missing anchor/parent identity, truncated encoded output, or scope mismatch is `BLOCKED`.

## Alternatives Considered

### Admit the two original files wholesale

Rejected: it mixes unrelated functionality into the correction commit and does not satisfy the correction plan's file/fixture provenance rule.

### Keep scanner rules tied to the main worktree

Rejected: the v21 C31 failure demonstrates that the clean checkout and dirty main tree can disagree on the same hard-coded fixture expectation.

### Rewrite the scanner to ignore fixture literals

Rejected: it weakens a security/governance gate and hides the mismatch instead of making dependencies auditable.

## Rollback and Recovery

Before staging, discard only newly created proposal/implementation artifacts if the proposal is rejected; preserve all pre-existing dirty work. After staging, rollback is by an explicit, reviewed inverse scope or a new corrective commit; do not reset or clean the shared worktree. v21 evidence remains available for historical comparison.

## Verification Contract

The approved implementation plan must include: scope-ledger review; correction-only test RED/GREEN checks; manifest schema/verifier checks; clean/dirty scanner governance regression; fresh allowlist review; exact C23-C51 execution; and an independent PIR. Any closure mismatch, omitted dependency row, scanner nondeterminism, identity gap, credential/external call, promotion/archive/push attempt, or unapproved path is a hard stop.
