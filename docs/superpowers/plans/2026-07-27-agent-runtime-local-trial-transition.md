# Agent Runtime Local Trial Transition Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stop the pending formal 24-hour Gate D path and truthfully transition the implemented runtime to a user-owned local trial phase without claiming unexecuted production qualification.

**Architecture:** Runtime code and evidence remain unchanged. The active OpenSpec records local trial readiness as the current adoption state while retaining formal Gate D as a deferred future production-promotion gate; Dashboard, runbook, Attempt005 plan, and Review artifacts use the same lifecycle language.

**Tech Stack:** OpenSpec Markdown, project dashboard JSON/render pipeline, operational Markdown.

---

## Task 1: Reconcile the active OpenSpec contract

**Files:**

- Modify: [CONTEXT.md](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/CONTEXT.md)
- Modify: [proposal.md](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/openspec/changes/harden-agent-runtime-single-node-production/proposal.md)
- Modify: [design.md](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/openspec/changes/harden-agent-runtime-single-node-production/design.md)
- Modify: [tasks.md](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/openspec/changes/harden-agent-runtime-single-node-production/tasks.md)

- [x] **Step 1: Define the lifecycle terms**

Add `Local Trial Ready` and `Production Verified` to the domain glossary. The first permits user-owned local use based on completed local evidence; the second still requires the deferred formal production gates.

- [x] **Step 2: Record the approved adoption decision**

Append the 2026-07-27 decision to the proposal/design: local trial starts now, formal Gate D is deferred rather than passed or deleted, and a future production claim requires a fresh resume decision and then the unchanged Gate D contract.

- [x] **Step 3: Reconcile tasks without falsifying completion**

Add a completed local-trial transition task. Keep 4.2, 4.3, 4.5, 4.6 and closeout/archive unchecked, annotate their deferred owner/resume condition, and keep the change active.

## Task 2: Synchronize operator and project status

**Files:**

- Modify: [production runbook](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/docs/architecture/agent-runtime-v1-production-runbook.md)
- Modify: [Attempt005 Plan](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/docs/superpowers/plans/2026-07-27-agent-runtime-gate-d-attempt-005.md)
- Modify: [Attempt005 Preflight Review](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/docs/review/2026-07-27-agent-runtime-gate-d-attempt-005-preflight-review.md)
- Modify: [development-log.json](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/docs/project-dashboard/development-log.json)

- [x] **Step 1: Add the local-trial operator boundary**

Document that local trial may start from the reviewed runtime, that the user owns trial feedback, and that local use must not be presented as `production_verified`.

- [x] **Step 2: Park Attempt005**

Set the plan and Preflight Review to `deferred_by_user`; preserve packet inputs and hashes, forbid execution without a new explicit resume decision, and do not create approval/preflight/journal/report artifacts.

- [x] **Step 3: Update the Dashboard source and render**

Keep status `proposed`, replace the next action with self-trial feedback capture and evidence-driven optimization, append the user decision, then run:

```bash
node docs/project-dashboard/scripts/render-dashboard.mjs
pnpm dashboard:check
```

Expected: generated Markdown/HTML are current and the active entry remains `proposed`.

## Task 3: Review and verify the transition

**Files:**

- Create: [Local Trial Readiness Decision Review](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/docs/review/2026-07-27-agent-runtime-local-trial-readiness-decision-review.md)

- [x] **Step 1: Create the decision Review**

Record conclusion, scope, evidence, residual production risk, exact deferred tasks, resume condition, and confirmation that no Runtime code, historical evidence, project rule, Git state, or production process changed.

- [x] **Step 2: Run strict validation**

```bash
npx openspec validate harden-agent-runtime-single-node-production --strict --no-interactive
npx openspec validate --all --strict --no-interactive
pnpm dashboard:check
git diff --check
```

Expected: active change valid, all OpenSpec items pass, Dashboard current, diff clean.

- [x] **Step 3: Run negative lifecycle scans**

Verify no current artifact claims Attempt005 PASS, production qualification, Dashboard `verified`, OpenSpec completion, or archive; verify all Attempt005 runtime outputs remain absent.

- [x] **Step 4: Complete a focused diff Review**

Inspect every changed governance/documentation file for consistent `local trial ready` versus `production verified` language. Any mismatch returns to the same task for correction and fresh verification.

## Stop Conditions

- Any edit marks an unexecuted Gate D task PASS or changes historical report bytes.
- Any edit archives the active change or marks Dashboard `verified`.
- Any Runtime/source behavior change appears; that requires a separate approved implementation slice and TDD.
- Any Git staging, commit, push, merge, tag, or destructive cleanup is requested implicitly rather than explicitly.
