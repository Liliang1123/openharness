# Design: Runtime Progress Panel

## Context
The runtime already emits structured SSE events, stores them in `RuntimeEventStore`, tracks active executions in `ExecutionStateStore`, and renders subagent trace trees in the frontend. The missing layer is an operator-friendly projection that turns low-level events into a compact progress snapshot.

## Goals
- Make active agent execution state understandable at a glance.
- Reuse existing event/state stores as the source of truth.
- Keep the snapshot safe for frontend display by excluding sensitive payloads.
- Support both live stream updates and session reload recovery.

## Non-Goals
- No new execution lifecycle state machine.
- No Java Backend progress aggregation.
- No durable progress database.
- No display of full tool arguments, tool outputs, prompt text, skill contents, or auth headers.

## Proposed Shape
`RuntimeProgressSnapshot` is derived from one execution's events plus optional `ExecutionState`. It includes:

- identifiers: `conversationId`, `executionId`, `tenantId`, `traceId`, `requestId`
- status: `running`, `waiting_approval`, `completed`, `aborted`, or `errored`
- timing: `startedAt`, `updatedAt`, optional `endedAt`, optional `elapsedMs`
- loop summary: `currentStep`, `maxObservedStep`, `modelCalls`, `toolCalls`, `subagentCalls`
- current activity: `idle`, `model_call`, `tool_call`, `subagent`, `waiting_approval`, or `terminal`
- safe activity details: tool names, skill names, child execution IDs, pending approval IDs, terminal class
- recent safe events: bounded list of event names with timestamps and step indexes

The agent-runtime MAY compute the snapshot on demand from `RuntimeEventStore.since(..., null)` and `ExecutionStateStore.get/getActive`. The first implementation should avoid caching unless tests show a real need.

## API Integration
`GET /api/v1/sessions/:conversationId` should include `runtimeProgress` when an active or recent execution exists. Streaming clients may also derive live progress locally from SSE events, but the session API provides reload recovery.

The current `POST /api/v1/agent/chat/stream` SSE wire should remain backward compatible. Adding a dedicated `runtime_progress` SSE event is allowed only if it mirrors the snapshot and does not replace existing events.

## Frontend Integration
Add a progress panel above or alongside the trace tree. The panel should show the current execution status, current step, active operation, active tool/subagent if known, approval wait state, terminal reason, and elapsed time. Raw trace/tree details remain available in the existing debug panel.

On session selection, the frontend should read `runtimeProgress` from session detail and display it even if the original stream connection is gone.

## Privacy And Safety
Progress snapshots must only include safe metadata:

- allowed: event names, statuses, step indexes, tool names, skill names, execution IDs, timing, cost micros when already present
- forbidden: prompt content, skill markdown content, tool output bodies, full tool arguments, auth headers, provider credentials

## Testing
- Shared schema parses valid snapshots and rejects invalid status/activity values.
- Runtime derivation summarizes model/tool/subagent/approval/terminal events from stored session events.
- Session API returns progress for active or recent executions.
- Frontend renders running, waiting approval, completed, and errored progress states.
