# Phase 4 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Finish `add-execution-lifecycle-and-stream-recovery` Phase 4 by keeping history stable, making terminal errors explicit, adding approval/execution timeout behavior, converging non-stream execution on the detached runner, and updating docs.

**Architecture:** `HistoryStore` rejects runtime sentinel messages at the write boundary and filters legacy sentinel rows at read boundaries. `AgentExecutionRunner` owns terminal error mapping and timeout behavior for both stream and non-stream paths; `AgentLoop` is removed from the server path and kept only as compatibility code. Documentation updates align the glossary and architecture contracts with the execution lifecycle stores.

**Tech Stack:** TypeScript, Fastify, Vitest, React/Vite, OpenSpec.

---

## Files

- Modify `agent-runtime/src/history.ts`: add stable-history guard and legacy sentinel filtering.
- Modify `agent-runtime/src/compression.ts`: document stable-history input and add defensive sentinel handling.
- Modify `agent-runtime/src/types.ts`: extend `StopReason` with `RuntimeTerminalError` values and export the error union.
- Modify `agent-runtime/src/agentExecutionRunner.ts`: map all terminal paths to explicit error classes, remove sentinel history writes, implement approval/execution timeouts, and expose a non-stream helper result.
- Modify `agent-runtime/src/server.ts`: route non-stream `/api/v1/agent/chat` through `AgentExecutionRunner` instead of `AgentLoop`.
- Test `agent-runtime/test/historyLayering.test.ts`: write-side sentinel rejection and read-side legacy sentinel skip.
- Test `agent-runtime/test/compression.test.ts` or new focused test: `shouldCompress` ignores sentinel rows defensively.
- Test `agent-runtime/test/terminalErrors.test.ts`: model error, tool error, policy deny, empty model response, step budget, abort mappings.
- Test `agent-runtime/test/approvalTimeout.test.ts`: pending approval times out and emits `APPROVAL_TIMEOUT`.
- Test `agent-runtime/test/executionTimeout.test.ts`: long execution times out and emits `EXECUTION_TIMEOUT`.
- Modify `docs/architecture/trace_schema.md`: add lifecycle event names and terminal error classes.
- Modify `docs/architecture/policy_contract.md`: update approval flow for execution-scoped approval.
- Modify `CONTEXT.md`: add `ExecutionId`, `ExecutionState`, `RuntimeEventStore`, `SessionEvent`, `ApprovalStore`, `RuntimeTerminalError`.
- Modify `openspec/changes/add-execution-lifecycle-and-stream-recovery/tasks.md`: mark Phase 4 complete only after verification.

## Tasks

### Task 1: Stable History Layering

- [ ] Write failing tests in `agent-runtime/test/historyLayering.test.ts` for rejecting new `PENDING_APPROVAL` / `POLICY_DENY` writes and filtering legacy sentinel rows from `get`, `list`, `toApi`, and `toReplay`.
- [ ] Run `npx vitest run test/historyLayering.test.ts` and confirm failure is missing stable-history filtering.
- [ ] Implement sentinel detection in `history.ts`; throw on new sentinel append, filter legacy sentinel rows on `get`, `replace`, `list`, `toApi`, and `toReplay`.
- [ ] Add a focused compression defensive test that `shouldCompress` ignores sentinel rows when estimating.
- [ ] Run focused history/compression tests until green.

### Task 2: Runtime Terminal Errors

- [ ] Write failing tests in `agent-runtime/test/terminalErrors.test.ts` for `MODEL_ERROR`, `TOOL_ERROR`, `POLICY_DENY`, `EMPTY_MODEL_RESPONSE`, `STEP_BUDGET_EXHAUSTED`, and `EXECUTION_ABORTED`.
- [ ] Run `npx vitest run test/terminalErrors.test.ts` and confirm failures are missing error-class mapping.
- [ ] Extend `StopReason` / `RuntimeTerminalError` in `types.ts`.
- [ ] Add explicit terminal helpers in `agentExecutionRunner.ts`; remove fallback sentinel writes and map policy deny/tool errors/model errors to structured `stream_error` payloads.
- [ ] Run focused terminal error tests until green.

### Task 3: Approval And Execution Timeout

- [ ] Write failing tests in `agent-runtime/test/approvalTimeout.test.ts` and `agent-runtime/test/executionTimeout.test.ts`.
- [ ] Run both focused timeout tests and confirm failures are missing timeout behavior.
- [ ] Add `APPROVAL_TIMEOUT_MS` default `3600000` around `ApprovalStore.waitForDecision`.
- [ ] Add `EXECUTION_TIMEOUT_MS` default `1800000` around runner execution using the execution state's `AbortController`.
- [ ] Ensure timeout emits `stream_error` with `APPROVAL_TIMEOUT` or `EXECUTION_TIMEOUT` and terminal state `errored`.
- [ ] Run timeout tests until green.

### Task 4: Non-Stream Runner Convergence

- [ ] Add a failing API test showing `/api/v1/agent/chat` returns a normal `AgentChatResponse` while using the same runner events/state semantics as stream.
- [ ] Update `server.ts` so non-stream starts `AgentExecutionRunner`, waits for terminal state, derives response from history/runtime events, and removes duplicated `AgentLoop` execution from the request path.
- [ ] Keep `AgentLoop` tests compiling; do not broaden this task into deleting compatibility code unless required by tests.
- [ ] Run non-stream and existing agent runtime tests.

### Task 5: Documentation And OpenSpec Status

- [ ] Update `CONTEXT.md` glossary with execution/event/approval/error terms.
- [ ] Update `docs/architecture/trace_schema.md` with new runtime events and terminal errors.
- [ ] Update `docs/architecture/policy_contract.md` with execution-scoped approval flow.
- [ ] Run `pnpm --filter @openharness/agent-runtime test`.
- [ ] Run `pnpm --filter @openharness/frontend test`.
- [ ] Run `pnpm --filter @openharness/shared-schema test`.
- [ ] Run `pnpm typecheck`.
- [ ] Run `mvn test` in `backend`.
- [ ] Run `openspec validate add-execution-lifecycle-and-stream-recovery --strict --no-interactive`.
- [ ] Mark OpenSpec tasks 4.1-4.9 complete only after the verification commands above pass or any skipped external E2E risk is explicitly documented.
