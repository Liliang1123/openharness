# Agent Runtime Local Trial Archive, Merge, And CLI Handoff Plan

## Goal

Close the approved `Local Trial Ready` scope without claiming `Production Verified`, archive the completed OpenSpec change, commit and fast-forward it into `main`, remove only confirmed temporary worktrees, and provide a truthful local CLI operator workflow for Codex-assisted installation.

## Preconditions

- The user explicitly approved archiving, committing, merging to `main`, and removing redundant local worktrees.
- Formal 24-hour Gate D Attempt005 remains user-deferred and MUST NOT be executed or relabelled PASS.
- The dirty primary checkout at [openharness](file:///Users/elvis/file/develop/opensource/openharness) contains user-owned untracked files and MUST NOT be cleaned, reset, or removed.
- Generated SQLite/WAL/log qualification artifacts MUST NOT be committed; immutable reports, scripts, configs, and review records remain eligible.

## Execution

1. Distil reusable runtime storage and evidence-state invariants into:
   - [engineering invariants](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/docs/engineering-invariants.md)
   - [learning candidate](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/docs/learning-candidates/2026-07-27-runtime-storage-worker-and-trial-evidence-boundaries.md)
2. Close the active task list at the approved Local Trial boundary:
   - record Attempt005 as not executed;
   - preserve formal Gate D requirements as future `Production Verified` entry criteria;
   - do not claim the 24-hour gate passed.
3. Sync the dashboard to `verified`, render generated views, and run the required checks.
4. Run fresh TypeScript, Java, integration, OpenSpec, dashboard, formatting, and secret/negative scans.
5. Archive `harden-agent-runtime-single-node-production`, create the archive closeout Review, sync the dashboard to `archived`, rerender, and revalidate.
6. Add a local CLI operator guide that clearly distinguishes the user-local wrapper from an official product CLI.
7. Review the complete diff; precisely stage reviewed files without `git add .`; commit with a Chinese segmented message.
8. Create a temporary clean `main` integration worktree, fast-forward `main` to the feature commit, and verify the merged tree.
9. Remove the temporary integration worktree and the completed Agent Runtime feature worktree. Preserve the primary dirty checkout.
10. Return a copyable Codex installation prompt that installs from the merged local `main` into a separate user-local source clone.

## Verification

- `P0A_BACKEND_PORT=18081 pnpm test`
- `pnpm typecheck`
- `mvn test` in [backend](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/backend)
- `npx openspec validate --all --strict`
- `pnpm dashboard:check`
- `git diff --check`
- negative scans for forbidden production-state claims, committed SQLite/WAL/log files, and secret material

## Rollback And Safety

- Before commit: revert only files created or modified by this plan; never touch unrelated primary-checkout files.
- Before merge: `main` remains unchanged if any verification fails.
- After fast-forward: the feature commit remains the exact rollback boundary.
- Worktree removal occurs only after a clean status and merged-result verification.
- No remote push is authorized or performed.
