# Phase 3 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add active execution locking and recoverable approval state for `add-execution-lifecycle-and-stream-recovery` Phase 3.

**Architecture:** `ExecutionStateStore` owns active execution lookup and `waiting_approval` status. `ApprovalStore` owns pending approval records, JSON persistence, and in-process decision promises. `AgentExecutionRunner` pauses on `REQUIRE_APPROVAL`, emits `approval_requested`, waits for the approval decision, and resumes the loop.

**Tech Stack:** TypeScript, Fastify, Vitest, React/Vite, OpenSpec.

---

## Files

- Create `agent-runtime/src/approvalStore.ts`: pending approval records, JSON persistence, decision promises, legacy `askUserId` lookup.
- Create `agent-runtime/test/approvalStore.test.ts`: store CRUD, persistence, decision wake-up.
- Create `agent-runtime/test/activeExecutionLock.test.ts`: chat/stream active execution conflict behavior.
- Create `agent-runtime/test/approvalApi.test.ts`: new approval endpoint and legacy endpoint compatibility.
- Create `agent-runtime/test/approvalRecovery.test.ts`: session GET exposes `activeExecution` and `pendingApprovals`.
- Modify `agent-runtime/src/executionStateStore.ts`: add `waiting_approval`, `getActive`, `transition`.
- Modify `agent-runtime/src/agentExecutionRunner.ts`: handle `REQUIRE_APPROVAL` via `ApprovalStore`.
- Modify `agent-runtime/src/server.ts`: inject `ApprovalStore`, active lock checks, approval endpoints, session response additions.
- Modify `frontend/src/api.ts`: expose approval endpoint and `pendingApprovals` session fields.
- Modify `frontend/src/App.tsx`: render ApprovalCard from session `pendingApprovals` and `approval_requested`.
- Modify `frontend/src/ApprovalCard.tsx`: call new execution-scoped approval endpoint.
- Modify `frontend/test/App.test.tsx`: cover approval recovery rendering.
- Modify `openspec/changes/add-execution-lifecycle-and-stream-recovery/tasks.md`: mark Phase 3 complete only after verification.

## Tasks

### Task 1: Execution State Lock

- [x] Write failing tests in `agent-runtime/test/activeExecutionLock.test.ts` for `getActive`, stream 409 while running, and waiting approval 409.
- [x] Run focused active lock test and confirm failures were due to missing `getActive` / missing 409 behavior.
- [x] Add `waiting_approval`, `getActive(tenantId, conversationId)`, and generic `transition` support to `executionStateStore.ts`.
- [x] Add chat/stream active lock checks in `server.ts`.
- [x] Re-run the focused test until it passes.

### Task 2: ApprovalStore

- [x] Write failing tests in `agent-runtime/test/approvalStore.test.ts` for `createPending`, `listPending`, `decide`, `getByAskUserId`, and JSON reload.
- [x] Run focused ApprovalStore test and confirm failure was missing module/API.
- [x] Implement `agent-runtime/src/approvalStore.ts` with in-memory records, JSON persistence under `data/sessions/{tenantId}/{conversationId}-approvals.json`, and promise wake-up for live runners.
- [x] Re-run the focused test until it passes.

### Task 3: Runner Approval Pause/Resume

- [x] Add failing runner tests for `REQUIRE_APPROVAL` emitting `approval_requested`, entering `waiting_approval`, approval token passthrough, and synchronous decision race.
- [x] Run focused runner test and confirm missing behavior/race.
- [x] Inject `ApprovalStore` into `AgentExecutionRunner`.
- [x] In `runToolBatch`, convert `REQUIRE_APPROVAL` to pending approval + `approval_requested` event + wait for decision; never write `PENDING_APPROVAL` to `HistoryStore`.
- [x] Re-run focused runner tests.

### Task 4: Approval APIs And Session Recovery

- [x] Write failing API tests for `POST /api/v1/sessions/:conversationId/executions/:executionId/approvals/:toolCallId`, legacy `POST /api/v1/agent/ask-user/:askUserId/reply`, and `GET /api/v1/sessions/:conversationId` returning `activeExecution` + `pendingApprovals`.
- [x] Run focused API tests and confirm failures.
- [x] Implement the new approval endpoint, legacy route delegation, and session response fields in `server.ts`.
- [x] Re-run focused API tests.

### Task 5: Frontend Recovery

- [x] Write failing frontend test for session load with `pendingApprovals` rendering `ApprovalCard`.
- [x] Run `pnpm --filter @openharness/frontend test -- App.test.tsx` and confirm failure.
- [x] Update `api.ts`, `App.tsx`, and `ApprovalCard.tsx` for execution-scoped approvals.
- [x] Re-run frontend focused test.

### Task 6: Verification And OpenSpec Task Status

- [x] Run `pnpm --filter @openharness/agent-runtime test`.
- [x] Run `pnpm --filter @openharness/frontend test`.
- [x] Run `pnpm --filter @openharness/shared-schema test`.
- [x] Run `pnpm typecheck`.
- [x] Run `mvn test` in `backend`.
- [x] Run `openspec validate add-execution-lifecycle-and-stream-recovery --strict --no-interactive`.
- [x] Mark OpenSpec tasks 3.1-3.10 as complete.
