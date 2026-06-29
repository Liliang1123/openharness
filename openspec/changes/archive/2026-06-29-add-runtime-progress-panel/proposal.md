# Change: Add Runtime Progress Panel

## Why
Agent executions are currently observable through raw SSE events and trace-tree debug output, but the operator experience remains fragmented. A user can inspect events after the fact, yet cannot quickly answer what an active execution is doing, which step/tool/subagent is active, whether it is waiting for approval, or why it terminated.

## What Changes
- Add a canonical runtime progress snapshot contract derived from existing `RuntimeEventStore` events and `ExecutionStateStore` state.
- Expose progress snapshots through session APIs without creating a second execution lifecycle model.
- Add frontend progress UI that summarizes active execution status, step count, active model/tool/subagent activity, pending approval, terminal reason, and a link/fallback to raw trace details.
- Preserve the existing Trace Tree and raw event debug panel as secondary observability.

## Impact
- Affected specs: `agent-runtime`, `frontend-runtime`, `shared-schema`
- Affected code:
  - `packages/shared-schema/src/index.ts`
  - `agent-runtime/src/runtimeProgress.ts` (new)
  - `agent-runtime/src/server.ts`
  - `frontend/src/RuntimeProgressPanel.tsx` (new)
  - `frontend/src/App.tsx`
  - focused tests for shared schema, runtime progress derivation, session API, and frontend rendering

## Non-Goals
- Do not rewrite `AgentExecutionRunner`, `RuntimeEventStore`, or `ExecutionStateStore`.
- Do not add Java Backend ownership of agent progress.
- Do not persist progress snapshots beyond the existing runtime event/history persistence semantics.
- Do not expose prompt content, skill content, tool output bodies, credentials, or authorization headers in progress snapshots.
