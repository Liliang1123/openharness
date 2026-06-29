# Runtime Progress Panel Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a safe runtime progress snapshot and frontend panel so users can see what an Agent execution is currently doing without reading raw SSE events.

**Architecture:** `RuntimeProgressSnapshot` lives in shared schema. TS Runtime derives snapshots on demand from `RuntimeEventStore` plus `ExecutionStateStore` and includes them in session detail. Frontend keeps a live snapshot derived from stream events and falls back to session-detail `runtimeProgress` after reload.

**Tech Stack:** TypeScript, Zod, Vitest, Fastify, React Testing Library, React/Vite.

---

## File Map

- Modify `packages/shared-schema/src/index.ts`: add progress enums, detail schema, recent event schema, snapshot schema, and exported types.
- Modify `packages/shared-schema/test/schema.test.ts`: add schema coverage.
- Create `agent-runtime/src/runtimeProgress.ts`: derive safe progress snapshots from stored session events and optional execution state.
- Modify `agent-runtime/src/server.ts`: include `runtimeProgress` in `GET /api/v1/sessions/:conversationId`.
- Create `agent-runtime/test/runtimeProgress.test.ts`: unit coverage for snapshot derivation.
- Modify `agent-runtime/test/approvalRecovery.test.ts` or `agent-runtime/test/sessionsApi.test.ts`: API response coverage.
- Modify `frontend/src/api.ts`: add runtime progress TypeScript interfaces to `SessionDetail`.
- Create `frontend/src/runtimeProgress.ts`: derive/update a frontend snapshot from live SSE events.
- Create `frontend/src/RuntimeProgressPanel.tsx`: render progress status and safe details.
- Modify `frontend/src/App.tsx`: store/display progress, update from live stream and session load.
- Modify `frontend/src/App.css`: compact panel styling consistent with existing app.
- Create `frontend/test/RuntimeProgressPanel.test.tsx`: render coverage.
- Modify `openspec/changes/add-runtime-progress-panel/tasks.md`: mark tasks as completed as implementation finishes.
- Modify `docs/project-dashboard/development-log.json`: sync to `verified` after implementation verification.

## Task 1: Shared Schema

**Files:**
- Modify: `packages/shared-schema/src/index.ts`
- Modify: `packages/shared-schema/test/schema.test.ts`

- [ ] **Step 1: Write failing shared-schema tests**

Add tests near existing schema tests:

```ts
import {
  RuntimeProgressSnapshotSchema,
  RuntimeProgressStatusSchema,
  RuntimeProgressActivitySchema
} from "../src/index";

it("parses runtime progress snapshot metadata", () => {
  const parsed = RuntimeProgressSnapshotSchema.parse({
    conversationId: "conv-1",
    executionId: "exec-1",
    tenantId: "tenant-1",
    traceId: "trace-1",
    requestId: "req-1",
    status: "running",
    currentActivity: "model_call",
    startedAt: 1000,
    updatedAt: 1500,
    elapsedMs: 500,
    currentStep: 2,
    maxObservedStep: 2,
    modelCalls: 2,
    toolCalls: 1,
    subagentCalls: 0,
    recentEvents: [
      { kind: "model_call_start", createdAt: 1500, stepIndex: 2 }
    ]
  });

  expect(parsed.status).toBe("running");
  expect(parsed.currentActivity).toBe("model_call");
  expect(parsed.recentEvents[0].kind).toBe("model_call_start");
});

it("rejects invalid runtime progress enums", () => {
  expect(() => RuntimeProgressStatusSchema.parse("paused_unknown")).toThrow();
  expect(() => RuntimeProgressActivitySchema.parse("thinking_secretly")).toThrow();
});

it("rejects sensitive fields on runtime progress snapshot", () => {
  expect(() => RuntimeProgressSnapshotSchema.parse({
    conversationId: "conv-1",
    executionId: "exec-1",
    tenantId: "tenant-1",
    traceId: "trace-1",
    requestId: "req-1",
    status: "running",
    currentActivity: "tool_call",
    startedAt: 1000,
    updatedAt: 1500,
    modelCalls: 1,
    toolCalls: 1,
    subagentCalls: 0,
    prompt: "secret",
    authorization: "Bearer secret"
  })).toThrow();
});
```

- [ ] **Step 2: Run tests to verify RED**

Run: `pnpm --filter @openharness/shared-schema test -- schema`

Expected: FAIL because `RuntimeProgressSnapshotSchema`, `RuntimeProgressStatusSchema`, and `RuntimeProgressActivitySchema` are not exported.

- [ ] **Step 3: Add minimal schema implementation**

In `packages/shared-schema/src/index.ts`, add strict schemas:

```ts
export const RuntimeProgressStatusSchema = z.enum(["running", "waiting_approval", "completed", "aborted", "errored"]);
export type RuntimeProgressStatus = z.infer<typeof RuntimeProgressStatusSchema>;

export const RuntimeProgressActivitySchema = z.enum(["idle", "model_call", "tool_call", "subagent", "waiting_approval", "terminal"]);
export type RuntimeProgressActivity = z.infer<typeof RuntimeProgressActivitySchema>;

export const RuntimeProgressDetailSchema = z.object({
  toolCallId: z.string().optional(),
  toolName: z.string().optional(),
  skillName: z.string().optional(),
  childExecutionId: z.string().optional(),
  childConversationId: z.string().optional(),
  askUserId: z.string().optional(),
  terminalClass: z.string().optional(),
  reason: z.string().optional(),
  costUsdMicros: z.number().int().nonnegative().optional()
}).strict();
export type RuntimeProgressDetail = z.infer<typeof RuntimeProgressDetailSchema>;

export const RuntimeProgressRecentEventSchema = z.object({
  kind: z.string(),
  createdAt: z.number().int().nonnegative(),
  stepIndex: z.number().int().positive().optional(),
  status: z.string().optional(),
  toolName: z.string().optional()
}).strict();
export type RuntimeProgressRecentEvent = z.infer<typeof RuntimeProgressRecentEventSchema>;

export const RuntimeProgressSnapshotSchema = z.object({
  conversationId: z.string(),
  executionId: z.string(),
  tenantId: z.string(),
  traceId: z.string(),
  requestId: z.string(),
  status: RuntimeProgressStatusSchema,
  currentActivity: RuntimeProgressActivitySchema,
  startedAt: z.number().int().nonnegative(),
  updatedAt: z.number().int().nonnegative(),
  endedAt: z.number().int().nonnegative().nullable().optional(),
  elapsedMs: z.number().int().nonnegative().optional(),
  currentStep: z.number().int().positive().optional(),
  maxObservedStep: z.number().int().nonnegative().default(0),
  modelCalls: z.number().int().nonnegative().default(0),
  toolCalls: z.number().int().nonnegative().default(0),
  subagentCalls: z.number().int().nonnegative().default(0),
  detail: RuntimeProgressDetailSchema.optional(),
  recentEvents: z.array(RuntimeProgressRecentEventSchema).default([])
}).strict();
export type RuntimeProgressSnapshot = z.infer<typeof RuntimeProgressSnapshotSchema>;
```

- [ ] **Step 4: Run tests to verify GREEN**

Run: `pnpm --filter @openharness/shared-schema test -- schema`

Expected: PASS.

## Task 2: Runtime Progress Derivation

**Files:**
- Create: `agent-runtime/src/runtimeProgress.ts`
- Create: `agent-runtime/test/runtimeProgress.test.ts`

- [ ] **Step 1: Write failing runtime derivation tests**

Create `agent-runtime/test/runtimeProgress.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import type { SessionEvent } from "@openharness/shared-schema";
import { deriveRuntimeProgress } from "../src/runtimeProgress";
import type { ExecutionState } from "../src/executionStateStore";

function event(kind: string, data: Record<string, unknown>, createdAt: number): SessionEvent {
  return {
    eventId: `t1::c1:${createdAt}`,
    executionId: "exec-1",
    conversationId: "c1",
    tenantId: "t1",
    traceId: "tr1",
    requestId: "req1",
    createdAt,
    kind,
    data
  };
}

function state(status: ExecutionState["status"], endReason?: string): ExecutionState {
  return {
    executionId: "exec-1",
    conversationId: "c1",
    tenantId: "t1",
    status,
    startedAt: 1000,
    updatedAt: 2000,
    endedAt: status === "running" || status === "waiting_approval" ? null : 2500,
    endReason,
    abortController: new AbortController()
  };
}

describe("deriveRuntimeProgress", () => {
  it("summarizes a running model call", () => {
    const progress = deriveRuntimeProgress({
      events: [
        event("agent_start", {}, 1000),
        event("model_call_start", { stepIndex: 2 }, 1500)
      ],
      state: state("running")
    });

    expect(progress).toMatchObject({
      executionId: "exec-1",
      status: "running",
      currentActivity: "model_call",
      currentStep: 2,
      maxObservedStep: 2,
      modelCalls: 1
    });
  });

  it("summarizes waiting approval with safe metadata", () => {
    const progress = deriveRuntimeProgress({
      events: [
        event("approval_requested", {
          askUserId: "ask-1",
          toolCallId: "tool-1",
          toolName: "write_file",
          argumentsRaw: "{\"secret\":true}",
          approvalToken: "approval-secret",
          stepIndex: 1
        }, 1600)
      ],
      state: state("waiting_approval")
    });

    expect(progress?.currentActivity).toBe("waiting_approval");
    expect(progress?.detail).toMatchObject({
      askUserId: "ask-1",
      toolCallId: "tool-1",
      toolName: "write_file"
    });
    expect(JSON.stringify(progress)).not.toContain("approval-secret");
    expect(JSON.stringify(progress)).not.toContain("argumentsRaw");
  });

  it("summarizes terminal errors", () => {
    const progress = deriveRuntimeProgress({
      events: [
        event("stream_error", { errorClass: "TOOL_ERROR", errorMessage: "hidden detail" }, 2500)
      ],
      state: state("errored", "TOOL_ERROR")
    });

    expect(progress).toMatchObject({
      status: "errored",
      currentActivity: "terminal",
      detail: { terminalClass: "TOOL_ERROR" }
    });
    expect(JSON.stringify(progress)).not.toContain("hidden detail");
  });
});
```

- [ ] **Step 2: Run tests to verify RED**

Run: `pnpm --filter @openharness/agent-runtime test -- runtimeProgress`

Expected: FAIL because `agent-runtime/src/runtimeProgress.ts` does not exist.

- [ ] **Step 3: Implement derivation helper**

Create `agent-runtime/src/runtimeProgress.ts` with `deriveRuntimeProgress({ events, state })`. The function should:

- return `null` when both inputs are absent/empty
- use the first event for identifiers and timestamps when state is missing
- use state status when present
- map `completed/aborted/errored` to `currentActivity: "terminal"`
- map `waiting_approval` to `currentActivity: "waiting_approval"`
- count `model_call_start`, `tool_call`, and trace events whose `data.attributes.traceNodeKind` is `subagent_execution`
- copy only safe details: `toolCallId`, `toolName`, `askUserId`, `skillName`, `childExecutionId`, `childConversationId`, `terminalClass`, `costUsdMicros`
- keep only the last 8 recent events with `kind`, `createdAt`, optional `stepIndex`, `status`, and `toolName`

- [ ] **Step 4: Run tests to verify GREEN**

Run: `pnpm --filter @openharness/agent-runtime test -- runtimeProgress`

Expected: PASS.

## Task 3: Session API Integration

**Files:**
- Modify: `agent-runtime/src/server.ts`
- Modify: `agent-runtime/test/sessionsApi.test.ts`

- [ ] **Step 1: Write failing API test**

In `agent-runtime/test/sessionsApi.test.ts`, add a test that creates a server with injected stores, appends at least one runtime event for `conv-progress`, creates execution state `exec-progress`, calls `GET /api/v1/sessions/conv-progress`, and expects `runtimeProgress.executionId === "exec-progress"` plus `currentActivity`.

- [ ] **Step 2: Run API test to verify RED**

Run: `pnpm --filter @openharness/agent-runtime test -- sessionsApi`

Expected: FAIL because session detail does not include `runtimeProgress`.

- [ ] **Step 3: Wire runtime progress into session detail**

In `agent-runtime/src/server.ts`:

- import `deriveRuntimeProgress`
- when serving session detail, collect events for the conversation
- prefer active execution when present
- otherwise derive from the latest execution represented in events
- include `runtimeProgress` only when derivation returns a snapshot

- [ ] **Step 4: Run API tests to verify GREEN**

Run: `pnpm --filter @openharness/agent-runtime test -- sessionsApi runtimeProgress`

Expected: PASS.

## Task 4: Frontend Progress Panel

**Files:**
- Modify: `frontend/src/api.ts`
- Create: `frontend/src/runtimeProgress.ts`
- Create: `frontend/src/RuntimeProgressPanel.tsx`
- Create: `frontend/test/RuntimeProgressPanel.test.tsx`

- [ ] **Step 1: Write failing frontend panel tests**

Create tests that render `RuntimeProgressPanel` with snapshots for:

- running model call at step 2
- waiting approval for `write_file`
- errored terminal with `TOOL_ERROR`

Assert visible text such as `Running`, `Step 2`, `Model call`, `Waiting approval`, `write_file`, and `TOOL_ERROR`.

- [ ] **Step 2: Run frontend tests to verify RED**

Run: `pnpm --filter @openharness/frontend test -- RuntimeProgressPanel`

Expected: FAIL because the component does not exist.

- [ ] **Step 3: Implement frontend types and panel**

Add `RuntimeProgressSnapshot` interfaces in `frontend/src/api.ts`, create `RuntimeProgressPanel.tsx`, and render compact status/activity rows. Keep the component data-only; do not fetch from it.

- [ ] **Step 4: Add live event derivation helper**

Create `frontend/src/runtimeProgress.ts` with `deriveRuntimeProgressFromEvents(events: SSEEvent[])`. It can mirror the runtime derivation for current stream events and should not expose sensitive event payloads.

- [ ] **Step 5: Run frontend panel tests to verify GREEN**

Run: `pnpm --filter @openharness/frontend test -- RuntimeProgressPanel`

Expected: PASS.

## Task 5: App Wiring And Styling

**Files:**
- Modify: `frontend/src/App.tsx`
- Modify: `frontend/src/App.css`
- Modify: frontend tests as needed

- [ ] **Step 1: Wire progress state**

In `App.tsx`, add `runtimeProgress` state. On session selection, set it from `data.runtimeProgress ?? null`. On new session, clear it. On live stream event, update it with `deriveRuntimeProgressFromEvents([...prev, ev])`.

- [ ] **Step 2: Render the panel**

Render `<RuntimeProgressPanel progress={runtimeProgress} />` in the trace pane above `<TraceTreePanel events={events} />`.

- [ ] **Step 3: Style compactly**

Add CSS for `.runtime-progress`, `.progress-grid`, `.progress-pill`, and terminal/waiting/running status classes. Keep it consistent with existing trace pane styling and avoid nested card layouts.

- [ ] **Step 4: Run frontend tests and typecheck**

Run:

```bash
pnpm --filter @openharness/frontend test
pnpm --filter @openharness/frontend typecheck
```

Expected: PASS.

## Task 6: Final Verification And Sync

**Files:**
- Modify: `openspec/changes/add-runtime-progress-panel/tasks.md`
- Modify: `docs/project-dashboard/development-log.json`
- Generated: `docs/project-dashboard/development-log.md`
- Generated: `docs/project-dashboard/index.html`

- [ ] **Step 1: Run package verification**

Run:

```bash
pnpm --filter @openharness/shared-schema test
pnpm --filter @openharness/shared-schema typecheck
pnpm --filter @openharness/agent-runtime test -- runtimeProgress sessionsApi
pnpm --filter @openharness/agent-runtime typecheck
pnpm --filter @openharness/frontend test
pnpm --filter @openharness/frontend typecheck
```

Expected: all commands exit 0.

- [ ] **Step 2: Mark OpenSpec tasks complete**

Update `openspec/changes/add-runtime-progress-panel/tasks.md` to mark completed implementation and verification tasks with `- [x]`.

- [ ] **Step 3: Sync dashboard to verified**

Update `docs/project-dashboard/development-log.json` entry `add-runtime-progress-panel`:

- `status`: `verified`
- add `superpowers.plan`: `docs/superpowers/plans/2026-06-29-add-runtime-progress-panel.md`
- add source/test files touched
- add verification commands and observed results

Run: `node docs/project-dashboard/scripts/render-dashboard.mjs`

- [ ] **Step 4: Final gates**

Run:

```bash
npx openspec validate add-runtime-progress-panel --strict --no-interactive
npx openspec validate --all --strict --no-interactive
pnpm dashboard:check
```

Expected: OpenSpec validates the active change and all specs; dashboard generated files are current.

## Self-Review

- Spec coverage: shared schema, runtime derivation, session API, frontend progress panel, trace diagnostics preservation, and sensitive payload exclusion are covered by Tasks 1-5.
- Placeholder scan: no TBD/TODO/fill-in placeholders remain; each task includes exact files, test commands, and expected outcomes.
- Type consistency: shared type name is `RuntimeProgressSnapshot`; frontend and runtime use the same status/activity vocabulary.
