# Runtime Chat Terminal And Codex Tool Flow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans` to implement this plan task-by-task in the current session. Steps use checkbox (`- [ ]`) syntax for tracking. Do not dispatch subagents unless a later required Review skill explicitly requires an independent reviewer.

**Goal:** Replace stale chat lifecycle messages with one safe interactive execution activity group, persist terminal feedback for every Codex pending dynamic tool, and prove five sequential tool calls remain correlated to one provider turn.

**Architecture:** The Frontend derives a data-minimized activity projection from existing durable SSE events and renders it independently from assistant/user messages. The Runtime keeps Codex transport tool messages out of model history but commits one event-only `tool_result` before submitting each exact pending result. Existing Java client/registry behavior already supports sequential pending calls, so Java receives a five-call contract regression; production Java changes are blocked unless that new regression exposes a concrete defect and this plan is revised and re-reviewed.

**Tech Stack:** React 19, TypeScript 5.8, Vitest, Testing Library, Fastify Agent Runtime, SQLite lifecycle writer, Java 21, Spring Boot, JUnit 5, Maven, pnpm, OpenSpec, user-local operator wrapper.

---

## File Map And Boundaries

- Create [executionActivity.ts](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/main-local-trial/frontend/src/executionActivity.ts): pure, data-minimized projection from deduplicated SSE lifecycle events to one execution activity model.
- Create [ExecutionActivityGroup.tsx](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/main-local-trial/frontend/src/ExecutionActivityGroup.tsx): interactive collapsed/expanded rendering with terminal auto-collapse.
- Modify [App.tsx](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/main-local-trial/frontend/src/App.tsx): deduplicate durable events before side effects, stop appending permanent thinking/tool messages, render the activity group, and keep assistant/approval behavior.
- Modify [App.css](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/main-local-trial/frontend/src/App.css): minimal activity-group status and interaction styles; no general visual redesign.
- Modify [api.ts](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/main-local-trial/frontend/src/api.ts) and [ApprovalCard.tsx](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/main-local-trial/frontend/src/ApprovalCard.tsx): reject non-2xx approval replies and prevent a timeout-race loser from rendering false approval success.
- Create [executionActivity.test.ts](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/main-local-trial/frontend/test/executionActivity.test.ts): projection state, grouping, replay deduplication, terminal classes, and data-minimization tests.
- Create [ExecutionActivityGroup.test.tsx](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/main-local-trial/frontend/test/ExecutionActivityGroup.test.tsx): running, auto-collapsed terminal, expansion, repeated-tool, and error rendering tests.
- Modify [App.test.tsx](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/main-local-trial/frontend/test/App.test.tsx) and create [ApprovalCard.test.tsx](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/main-local-trial/frontend/test/ApprovalCard.test.tsx): prove completed/error streams clear thinking, terminal events remove stale approvals, replay does not duplicate final answers, and 409 losers cannot report success.
- Modify [agentExecutionRunner.ts](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/main-local-trial/agent-runtime/src/agentExecutionRunner.ts): defer Codex pending tool-result emission to the continuation owner, then emit exactly one safe result before completion submission or abort.
- Modify [server.ts](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/main-local-trial/agent-runtime/src/server.ts): let the process approval owner arbitrate timeout/HTTP decision races before durable acknowledgement and fail closed for orphaned approvals.
- Create [codexPendingTurnPersistence.test.ts](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/main-local-trial/agent-runtime/test/codexPendingTurnPersistence.test.ts): real SQLite lifecycle test for five pending calls, durable pairing/order, provider failure, replay, history exclusion, and canary redaction.
- Modify [codexPendingTurn.test.ts](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/main-local-trial/agent-runtime/test/codexPendingTurn.test.ts) and [productionServerLifecycle.test.ts](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/main-local-trial/agent-runtime/test/productionServerLifecycle.test.ts): assert safe terminal results for rejected, malformed, timeout, abort, definitive continuation failure, and approval timeout/HTTP decision races.
- Modify [CodexAppServerClientTest.java](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/main-local-trial/backend/src/test/java/org/openharness/backend/service/provider/CodexAppServerClientTest.java): extend sequential callback regression from two to five distinct responder ids.
- Modify [CodexPendingTurnRegistryTest.java](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/main-local-trial/backend/src/test/java/org/openharness/backend/service/provider/CodexPendingTurnRegistryTest.java): prove five sequential correlations retain one bridge and exactly-once completion.
- Modify [openharness-local-cli-wrapper.md](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/main-local-trial/docs/guides/openharness-local-cli-wrapper.md): document `localhost` browser origin, activity-group semantics, safe errors, current no-skill-write boundary, and rollback.
- Update [OpenSpec tasks](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/main-local-trial/openspec/changes/fix-runtime-chat-terminal-tool-flow/tasks.md), [dashboard JSON](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/main-local-trial/docs/project-dashboard/development-log.json), generated dashboard outputs, and Review artifacts under [docs/review](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/main-local-trial/docs/review).
- User-local sync is limited to the eight changed/new production files under [isolated source](file:///Users/elvis/.local/share/openharness/source): six Frontend files plus `agentExecutionRunner.ts` and `server.ts`.
- Do not modify the [primary checkout](file:///Users/elvis/file/develop/opensource/openharness), the ignored Typora directory, wrapper executable, provider configuration, `.env`, OAuth storage, shared schemas, Runtime database schema, Java production sources without a revised PASS preflight, or any unrelated file.
- Do not run full-repository regression, archive, merge, commit, push, reset, clean, or a 24-hour Gate, and do not claim Production Verified.

## Baseline Evidence And Stop Conditions

Fresh pre-plan baseline on 2026-07-30:

- Frontend focused tests: 2 files, 8 tests PASS.
- Runtime focused tests: 3 files, 25 tests PASS.
- Java Codex focused tests: 61 tests PASS.
- Existing Java tests already prove two sequential app-server callbacks and a sequential pending registry transition.

Stop and revise this plan before production Java edits if either five-call Java regression fails. Use `superpowers:systematic-debugging` to identify the exact failed invariant; do not infer that any `PROTOCOL_FAILURE` means responder retirement is broken.

Any RED test that fails for a reason other than its named missing behavior is also a stop condition for diagnosis before implementation.

### Task 1: Plan Preflight And Execution Binding

- [x] **Step 1: Bind the approved contract**

Confirm that [proposal.md](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/main-local-trial/openspec/changes/fix-runtime-chat-terminal-tool-flow/proposal.md), [design.md](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/main-local-trial/openspec/changes/fix-runtime-chat-terminal-tool-flow/design.md), and all three spec deltas still match this plan. Record this plan path in the dashboard entry without changing its `proposed` status.

- [x] **Step 2: Run plan self-review**

Run:

```bash
rg -n 'TBD|TODO|implement later|fill in details|Similar to Task|git (add|commit|push|reset|clean)' docs/superpowers/plans/2026-07-30-fix-runtime-chat-terminal-tool-flow.md
rg -n 'token-level|reasoning-effort|skill authoring|full-repository|24-hour|Production Verified|primary checkout|Typora' docs/superpowers/plans/2026-07-30-fix-runtime-chat-terminal-tool-flow.md
git diff --check -- docs/superpowers/plans/2026-07-30-fix-runtime-chat-terminal-tool-flow.md
```

Expected: no placeholders or executable Git mutation steps; boundary terms appear only in explicit exclusions and evidence instructions; no whitespace errors.

- [x] **Step 3: Create strict Plan Preflight Review**

Create [2026-07-30-runtime-chat-terminal-tool-flow-plan-preflight-review.md](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/main-local-trial/docs/review/2026-07-30-runtime-chat-terminal-tool-flow-plan-preflight-review.md). It MUST verify exact files, OpenSpec scenario coverage, TDD RED/GREEN order, the Java no-unproven-production-change stop condition, sensitive canaries, user-local backup/rollback, verification commands, worktree scope, and forbidden Git/production actions.

- [x] **Step 4: Validate planning state**

Run:

```bash
openspec validate fix-runtime-chat-terminal-tool-flow --strict --no-interactive
node docs/project-dashboard/scripts/render-dashboard.mjs
pnpm dashboard:check
git diff --check
```

Expected: target change valid, dashboard current, and whitespace check exit `0`. The known offline PostHog telemetry warning is non-blocking only when the command exits `0`.

### Task 2: Frontend Activity Projection TDD

- [x] **Step 1: Write projection RED tests**

Create `frontend/test/executionActivity.test.ts`. Use a helper that returns strict durable `SSEEvent` fixtures and add these tests:

```ts
import type { SSEEvent } from "../src/api";
import { deriveExecutionActivity, summarizeTools } from "../src/executionActivity";

type DurableSSEEvent = Extract<SSEEvent, { durability: "durable" }>;

function event(
  kind: DurableSSEEvent["kind"],
  data: Record<string, unknown>,
  sequence: number
): DurableSSEEvent {
  return {
    durability: "durable",
    eventId: `tenant-1::user-1::conv-1:${sequence}`,
    executionId: "exec-1",
    conversationId: "conv-1",
    tenantId: "tenant-1",
    userId: "user-1",
    traceId: "trace-1",
    requestId: "req-1",
    createdAt: sequence * 100,
    kind,
    data
  };
}

it("closes model work and retains five safe tool states", () => {
  const activity = deriveExecutionActivity([
    event("agent_start", {}, 1),
    event("model_call_start", { stepIndex: 1 }, 2),
    event("tool_call", { toolCallId: "call-1", toolName: "read_file", stepIndex: 1 }, 3),
    event("tool_result", { toolCallId: "call-1", toolName: "read_file", status: "ok", stepIndex: 1 }, 4),
    event("tool_call", { toolCallId: "call-2", toolName: "read_file", stepIndex: 1 }, 5),
    event("tool_result", { toolCallId: "call-2", toolName: "read_file", status: "ok", stepIndex: 1 }, 6),
    event("tool_call", { toolCallId: "call-3", toolName: "read_file", stepIndex: 1 }, 7),
    event("tool_result", { toolCallId: "call-3", toolName: "read_file", status: "ok", stepIndex: 1 }, 8),
    event("tool_call", { toolCallId: "call-4", toolName: "read_file", stepIndex: 1 }, 9),
    event("tool_result", { toolCallId: "call-4", toolName: "read_file", status: "ok", stepIndex: 1 }, 10),
    event("tool_call", { toolCallId: "call-5", toolName: "read_file", stepIndex: 1 }, 11),
    event("tool_result", { toolCallId: "call-5", toolName: "read_file", status: "ok", stepIndex: 1 }, 12),
    event("model_call_end", { stepIndex: 1, hasToolCalls: false }, 13),
    event("final_answer", { answer: "done" }, 14),
    event("stream_done", { stopReason: "FINAL_ANSWER" }, 15)
  ]);

  expect(activity).toMatchObject({
    executionId: "exec-1",
    status: "completed",
    modelActive: false,
    terminalClass: "FINAL_ANSWER"
  });
  expect(activity?.tools).toHaveLength(5);
  expect(summarizeTools(activity!.tools)).toBe("read_file ×5");
});

it("keeps only allowlisted terminal metadata", () => {
  const activity = deriveExecutionActivity([
    event("model_call_start", { prompt: "PROMPT-CANARY" }, 1),
    event("stream_error", {
      errorClass: "MODEL_ERROR",
      upstreamErrorClass: "PROTOCOL_FAILURE",
      errorMessage: "ERROR-CANARY",
      argumentsRaw: "ARG-CANARY",
      result: "RESULT-CANARY",
      bridgeId: "BRIDGE-CANARY",
      authorization: "AUTH-CANARY"
    }, 2)
  ]);

  expect(activity).toMatchObject({
    status: "errored",
    modelActive: false,
    terminalClass: "MODEL_ERROR",
    upstreamErrorClass: "PROTOCOL_FAILURE"
  });
  expect(JSON.stringify(activity)).not.toMatch(
    /PROMPT-CANARY|ERROR-CANARY|ARG-CANARY|RESULT-CANARY|BRIDGE-CANARY|AUTH-CANARY/
  );
});
```

Add a duplicate durable event-id test and a `model_call_end`-without-terminal test. The latter MUST leave `status: "running"` but `modelActive: false`.

- [x] **Step 2: Run projection RED**

Run:

```bash
pnpm --filter @openharness/frontend test -- test/executionActivity.test.ts
```

Expected: FAIL because `executionActivity.ts` does not exist.

- [x] **Step 3: Implement the pure allowlist projection**

Create `frontend/src/executionActivity.ts` with these public types and functions:

```ts
import type { SSEEvent } from "./api";

export type ExecutionActivityStatus = "running" | "completed" | "errored" | "aborted";
export type ExecutionActivityEntryStatus =
  | "running" | "ok" | "error" | "rejected" | "timeout" | "denied" | "completed";

export interface ExecutionActivityEntry {
  id: string;
  kind: "model" | "tool";
  status: ExecutionActivityEntryStatus;
  createdAt: number;
  stepIndex?: number;
  toolCallId?: string;
  toolName?: string;
}

export interface ExecutionActivity {
  executionId: string;
  status: ExecutionActivityStatus;
  modelActive: boolean;
  startedAt: number;
  updatedAt: number;
  elapsedMs: number;
  terminalClass?: string;
  upstreamErrorClass?: string;
  entries: ExecutionActivityEntry[];
  tools: ExecutionActivityEntry[];
}

export function deriveExecutionActivity(events: SSEEvent[]): ExecutionActivity | null;
export function summarizeTools(tools: ExecutionActivityEntry[]): string;
export function isTerminalActivity(activity: ExecutionActivity): boolean;
```

Implementation rules:

- ignore transient `preview_delta` inputs;
- deduplicate durable inputs by `eventId` inside the function even if the caller already deduplicates;
- select only the most recent `executionId`;
- construct new allowlisted entry objects and never retain an input event or its `data` object;
- key model entries by `stepIndex` plus occurrence and tool entries by `toolCallId`;
- `model_call_end` changes the matching model entry to `completed`;
- `tool_result` updates or creates the matching safe tool entry;
- `stream_done` sets `completed` and `terminalClass: "FINAL_ANSWER"` when no explicit safe stop reason exists;
- `stream_error` maps `EXECUTION_ABORTED` to `aborted`, otherwise `errored`, and copies only non-empty identifier-shaped `errorClass`/`upstreamErrorClass`;
- every terminal transition sets `modelActive: false` and converts any still-running tool entry to `error`;
- `summarizeTools` groups terminal tool entries by `toolName` in first-seen order.

- [x] **Step 4: Run projection GREEN**

Run the command from Step 2.

Expected: all projection tests PASS; the canary scan in the test observes no forbidden value.

### Task 3: Interactive Frontend Rendering TDD

- [x] **Step 1: Write component RED tests**

Create `frontend/test/ExecutionActivityGroup.test.tsx` using `activity(overrides)` fixture data:

```ts
it("auto-collapses terminal activity and expands all five calls", async () => {
  render(<ExecutionActivityGroup activity={activity({
    status: "completed",
    modelActive: false,
    terminalClass: "FINAL_ANSWER",
    tools: fiveReadFileTools(),
    entries: fiveReadFileTools()
  })} />);

  const toggle = screen.getByRole("button", { name: /执行完成.*read_file ×5/ });
  expect(toggle).toHaveAttribute("aria-expanded", "false");
  expect(screen.queryAllByText("read_file")).toHaveLength(0);

  await userEvent.click(toggle);
  expect(toggle).toHaveAttribute("aria-expanded", "true");
  expect(screen.getAllByText("read_file")).toHaveLength(5);
});

it("shows thinking only while the model is active", () => {
  const { rerender } = render(<ExecutionActivityGroup activity={activity({ modelActive: true })} />);
  expect(screen.getByText("🤔 思考中...")).toBeTruthy();
  rerender(<ExecutionActivityGroup activity={activity({ modelActive: false })} />);
  expect(screen.queryByText("🤔 思考中...")).toBeNull();
});

it("shows safe terminal classes without raw error text", () => {
  render(<ExecutionActivityGroup activity={activity({
    status: "errored",
    terminalClass: "MODEL_ERROR",
    upstreamErrorClass: "PROTOCOL_FAILURE"
  })} />);
  expect(screen.getByText(/MODEL_ERROR · PROTOCOL_FAILURE/)).toBeTruthy();
});
```

In `frontend/test/App.test.tsx`:

- add `stream_done` to the final-answer fixture and assert `queryByText("🤔 思考中...")` is null;
- add a five-tool fixture and assert collapsed `read_file ×5`, then expand to five entries;
- extend the error fixture to include `upstreamErrorClass: "PROTOCOL_FAILURE"` and assert a safe persistent error summary;
- deliver the same `final_answer` event id twice and assert the assistant answer appears once.

- [x] **Step 2: Run rendering RED**

Run:

```bash
pnpm --filter @openharness/frontend test -- test/ExecutionActivityGroup.test.tsx test/App.test.tsx
```

Expected: FAIL because the component does not exist and App still appends permanent system messages.

- [x] **Step 3: Implement the component**

Create `frontend/src/ExecutionActivityGroup.tsx`:

```tsx
import { useEffect, useState } from "react";
import {
  isTerminalActivity,
  summarizeTools,
  type ExecutionActivity
} from "./executionActivity";

export function ExecutionActivityGroup({ activity }: { activity: ExecutionActivity | null }) {
  const terminal = activity ? isTerminalActivity(activity) : false;
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    setExpanded(activity ? !isTerminalActivity(activity) : false);
  }, [activity?.executionId, terminal]);

  if (!activity) return null;
  const tools = summarizeTools(activity.tools);
  const outcome = activity.status === "completed"
    ? "执行完成"
    : activity.status === "aborted"
      ? "执行已中止"
      : activity.status === "errored"
        ? "执行失败"
        : "执行中";
  const safeError = [activity.terminalClass, activity.upstreamErrorClass]
    .filter(Boolean)
    .join(" · ");
  const summary = [outcome, tools, safeError].filter(Boolean).join("｜");

  return (
    <section className={`execution-activity ${activity.status}`} aria-label="Execution activity">
      <button
        type="button"
        className="execution-activity-toggle"
        aria-expanded={expanded}
        onClick={() => setExpanded(value => !value)}
      >
        <span>{summary}</span>
        <span aria-hidden="true">{expanded ? "收起" : "展开"}</span>
      </button>
      {activity.modelActive && <div className="execution-thinking">🤔 思考中...</div>}
      {expanded && (
        <ol className="execution-activity-list">
          {activity.entries.map(entry => (
            <li key={entry.id}>
              <span>{entry.kind === "model" ? `模型调用 ${entry.stepIndex ?? ""}` : entry.toolName}</span>
              <span>{entry.status}</span>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
```

The final implementation may extract the label functions inside the same file, but MUST retain this prop shape, controlled button semantics, safe fields, and terminal auto-collapse.

- [x] **Step 4: Integrate App without permanent lifecycle messages**

In `App.tsx`:

- import `useRef`, `ExecutionActivityGroup`, and `deriveExecutionActivity`;
- add `const seenEventIds = useRef(new Set<string>());`;
- reset that set when starting/selecting/creating a session;
- before any event side effect, ignore a durable event whose `eventId` is already in the set;
- retain `setEvents`, runtime-progress derivation, approvals, and `final_answer`;
- remove the `model_call_start`, `tool_call`, and denied `tool_result` branches that append system chat messages;
- derive `const executionActivity = useMemo(() => deriveExecutionActivity(events), [events]);`;
- render `<ExecutionActivityGroup activity={executionActivity} />` after the message list and before the network error element;
- do not render `errorMessage`, raw event data, or provider bodies.

- [x] **Step 5: Add minimal activity styles**

In `App.css`, add scoped `.execution-activity`, `.execution-activity-toggle`, `.execution-thinking`, `.execution-activity-list`, and terminal status variants. Keep the existing grid, message bubbles, composer, trace panel, colors, and responsive breakpoints unchanged.

- [x] **Step 6: Run Frontend GREEN and typecheck**

Run:

```bash
pnpm --filter @openharness/frontend test -- test/ApprovalCard.test.tsx test/executionActivity.test.ts test/ExecutionActivityGroup.test.tsx test/App.test.tsx test/runtimeProgress.test.ts test/sseWire.test.ts
pnpm --filter @openharness/frontend typecheck
```

Expected: all selected tests PASS and TypeScript exits `0`.

### Task 4: Runtime Durable Pending-Tool Feedback TDD

- [x] **Step 1: Write persistence RED test**

Create `agent-runtime/test/codexPendingTurnPersistence.test.ts` using `openProductionRuntimeContext` and a `FivePendingJavaClient`:

```ts
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { DEFAULT_AGENT_DEFINITION } from "../src/agentDefinitionLoader";
import { AgentExecutionRunner } from "../src/agentExecutionRunner";
import { InMemoryExecutionStateStore } from "../src/executionStateStore";
import { InMemoryHistoryStore } from "../src/history";
import type { JavaClient, PolicyEvaluateRequest } from "../src/javaClient";
import { InMemoryRuntimeEventStore } from "../src/runtimeEventStore";
import { openProductionRuntimeContext } from "../src/storage/productionRuntimeContext";
import type {
  CatalogResponse,
  ModelChatRequest,
  ModelChatResponse,
  ToolCallRequest,
  TraceEvent
} from "../src/types";

const workspaces: string[] = [];

function databasePath(): string {
  const workspace = mkdtempSync(join(tmpdir(), "openharness-codex-persistence-"));
  workspaces.push(workspace);
  return join(workspace, "runtime.sqlite");
}

afterEach(() => {
  delete process.env.COMPRESSION_AUTO;
  for (const workspace of workspaces.splice(0)) {
    rmSync(workspace, { recursive: true, force: true });
  }
});

function input() {
  return {
    tenantId: "tenant-a",
    userId: "user-a",
    conversationId: "conversation-a",
    message: "run five tools",
    traceId: "trace-a",
    requestId: "request-a",
    headers: { Authorization: "Bearer AUTH-CANARY" },
    agentDefinition: DEFAULT_AGENT_DEFINITION
  };
}

function pending(call: number) {
  return {
    bridgeId: "BRIDGE-CANARY",
    threadId: "thread-a",
    turnId: "turn-a",
    callId: `call-${call}`,
    toolName: "read_file",
    argumentsRaw: "{\"path\":\"ARG-CANARY\"}",
    expiresAt: "2026-07-30T10:00:00Z"
  };
}

class FivePendingJavaClient implements JavaClient {
  completions = 0;
  executions = 0;
  failAfterFirst = false;

  async getCatalog(): Promise<CatalogResponse> {
    return {
      catalogVersion: "v1",
      catalogHash: "hash",
      tools: [{
        name: "read_file",
        description: "Read",
        parameters: { type: "object", properties: {}, required: [] },
        permission: "safe",
        isReadOnly: true,
        isDestructive: false,
        requiresApproval: false,
        isConcurrencySafe: true
      }]
    };
  }

  async chat(request: ModelChatRequest): Promise<ModelChatResponse> {
    return {
      requestId: request.requestId,
      conversationId: request.conversationId,
      pendingTurn: pending(1),
      rawProvider: "codex-app-server"
    };
  }

  async completeCodexToolCall(
    _bridgeId: string,
    request: Parameters<NonNullable<JavaClient["completeCodexToolCall"]>>[1]
  ): Promise<ModelChatResponse> {
    this.completions += 1;
    if (this.failAfterFirst) {
      return {
        requestId: request.requestId,
        conversationId: request.conversationId,
        error: {
          errorClass: "PROTOCOL_FAILURE",
          errorMessage: "Codex app-server protocol failure",
          retriable: false
        },
        rawProvider: "codex-app-server"
      };
    }
    if (this.completions < 5) {
      return {
        requestId: request.requestId,
        conversationId: request.conversationId,
        pendingTurn: pending(this.completions + 1),
        rawProvider: "codex-app-server"
      };
    }
    return {
      requestId: request.requestId,
      conversationId: request.conversationId,
      message: { role: "assistant", content: "done" },
      rawProvider: "codex-app-server"
    };
  }

  async cancelCodexTurn(
    _bridgeId: string,
    request: Parameters<NonNullable<JavaClient["cancelCodexTurn"]>>[1]
  ): Promise<ModelChatResponse> {
    return {
      requestId: request.requestId,
      conversationId: request.conversationId,
      error: { errorClass: "BRIDGE_TURN_GONE", errorMessage: "gone", retriable: false },
      rawProvider: "codex-app-server"
    };
  }

  async executeTool(request: ToolCallRequest) {
    this.executions += 1;
    return {
      requestId: request.requestId,
      conversationId: request.conversationId,
      toolCallId: request.toolCallId,
      toolName: request.toolName,
      status: "ok" as const,
      result: { content: "RESULT-CANARY" }
    };
  }

  async evaluatePolicy(request: PolicyEvaluateRequest) {
    return {
      requestId: request.requestId,
      conversationId: request.conversationId,
      decisions: request.toolCalls.map(call => ({ toolCallId: call.id, decision: "ALLOW" }))
    };
  }

  async postTrace(_event: TraceEvent) {}
}

function productionRunner(
  context: Awaited<ReturnType<typeof openProductionRuntimeContext>>,
  java: JavaClient
) {
  return new AgentExecutionRunner(
    java,
    new InMemoryHistoryStore(),
    undefined,
    new InMemoryRuntimeEventStore(),
    new InMemoryExecutionStateStore(),
    undefined,
    undefined,
    { lifecycle: context.lifecycle, liveEvents: context.liveEvents }
  );
}

it("commits five safe paired pending-tool results without transport history", async () => {
  process.env.COMPRESSION_AUTO = "false";
  const context = await openProductionRuntimeContext(databasePath());
  const java = new FivePendingJavaClient();
  const runner = productionRunner(context, java);

  try {
    const final = await runner.start(input()).done;
    const events = await context.events.since("tenant-a", "user-a", "conversation-a", null);
    const calls = events.filter(event => event.kind === "tool_call");
    const results = events.filter(event => event.kind === "tool_result");

    expect(final.status).toBe("completed");
    expect(calls.map(event => event.data.toolCallId))
      .toEqual(["call-1", "call-2", "call-3", "call-4", "call-5"]);
    expect(results.map(event => [event.data.toolCallId, event.data.status]))
      .toEqual([
        ["call-1", "ok"], ["call-2", "ok"], ["call-3", "ok"],
        ["call-4", "ok"], ["call-5", "ok"]
      ]);
    expect(events.findIndex(event => event.kind === "stream_done"))
      .toBeGreaterThan(events.findLastIndex(event => event.kind === "tool_result"));
    expect((await context.history.get("tenant-a", "user-a", "conversation-a"))
      .map(message => message.role)).toEqual(["user", "assistant"]);
    expect(JSON.stringify(events)).not.toMatch(
      /ARG-CANARY|RESULT-CANARY|BRIDGE-CANARY|AUTH-CANARY/
    );
  } finally {
    await context.close();
  }
});
```

Add a second test where the first tool succeeds and `completeCodexToolCall` returns a structured `PROTOCOL_FAILURE`. Assert the first `tool_result` precedes exactly one `stream_error`, with `errorClass: "MODEL_ERROR"` and `upstreamErrorClass: "PROTOCOL_FAILURE"`, and tool execution count remains one.

- [x] **Step 2: Run Runtime RED**

Run:

```bash
pnpm --filter @openharness/agent-runtime test -- test/codexPendingTurnPersistence.test.ts
```

Expected: five `tool_call` events exist but zero persistence-mode `tool_result` events, proving the named defect.

- [x] **Step 3: Centralize Codex pending result emission**

In `agentExecutionRunner.ts`:

1. Extend `runToolBatch` options with `deferToolResultEvent?: boolean`.
2. Guard every direct `send("tool_result", ...)` inside `runToolBatch` with `!options.deferToolResultEvent`.
3. Call the batch from `continueCodexTurn` with:

```ts
{
  persistHistory: false,
  transientApproval: true,
  deferToolResultEvent: true
}
```

4. In `continueCodexTurn`, map the single outcome or caught failure to:

```ts
let status: CodexToolResultSubmission["status"];
let content: string;
let deferredFailure: RuntimeTerminalFailure | undefined;
```

Preserve the existing mappings:

- success → `ok`;
- parse/tool failure → `error`;
- policy/rejection → `rejected`;
- approval/execution timeout → `timeout`;
- abort → safe `error` event plus deferred rethrow, with no provider completion.

5. Before submitting or rethrowing, emit exactly once:

```ts
await send("tool_result", {
  toolCallId: toolCall.id,
  toolName: toolCall.name,
  status,
  stepIndex
});
if (deferredFailure) throw deferredFailure;
```

6. Keep `content` bounded only for Java submission. Never put `content`, `argumentsRaw`, bridge/thread/turn id, headers, or error messages into the durable tool event.

- [x] **Step 4: Extend non-persistence terminal assertions**

In `codexPendingTurn.test.ts`, assert one safe result per pending call for:

- sequential success;
- policy rejection;
- malformed arguments;
- approval rejection/timeout;
- execution abort;
- definitive completion failure after a successful tool.

For definitive provider failure, assert the durable/local event order is `tool_call`, `tool_result`, then `stream_error` and no canary appears.

- [x] **Step 5: Run Runtime GREEN and typecheck**

Run:

```bash
pnpm --filter @openharness/agent-runtime test -- test/codexPendingTurnPersistence.test.ts test/codexPendingTurn.test.ts test/lifecycleUnitOfWork.test.ts test/productionRunnerPersistence.test.ts test/productionServerLifecycle.test.ts test/terminalErrors.test.ts test/streamEventIds.test.ts
pnpm --filter @openharness/agent-runtime typecheck
```

Expected: all selected tests PASS; five logical result events are durable; no raw payload canary appears.

### Task 5: Five-Call Java Contract Regression

- [x] **Step 1: Extend app-server client sequential test**

In `CodexAppServerClientTest.java`, replace the two-call sequential fixture with five distinct responder ids (`77` through `81`) and call ids (`call-1` through `call-5`). The fake peer reads one response after each callback, then sends `turn/completed`. Drive `startTurn` plus four `resumeToolCall` calls returning `PendingToolCall`, and a fifth resume returning `FinalTurn`. Assert all responder ids and the final `turnId`.

- [x] **Step 2: Extend pending registry sequential test**

In `CodexPendingTurnRegistryTest.java`, add:

```java
@Test
void fiveSequentialPendingCallsReuseOneBridgeAndCompleteExactlyOnceEach() {
  Fixture fixture = new Fixture();
  String bridge = fixture.register("thread", "turn", "call-1");
  for (int call = 1; call < 5; call++) {
    String nextCall = "call-" + (call + 1);
    fixture.bridge.nextResult = new PendingToolCall(
        7 + call, "thread", "turn", nextCall, "echo", "{}");
    RegistryResult next = fixture.registry.complete(
        ID, bridge, submission("call-" + call, "key-" + call));
    assertThat(next.state()).isEqualTo(State.PENDING_TOOL);
    assertThat(next.pendingTurn().bridgeId()).isEqualTo(bridge);
    assertThat(next.pendingTurn().callId()).isEqualTo(nextCall);
  }
  fixture.bridge.nextResult = new FinalTurn(
      "thread", "turn", "safe", "", new CodexAppServerClient.TokenUsage(0, 0, 0));
  RegistryResult terminal = fixture.registry.complete(
      ID, bridge, submission("call-5", "key-5"));
  assertThat(terminal.state()).isEqualTo(State.COMPLETED);
  assertThat(fixture.bridge.completes).hasValue(5);
}
```

Add this local helper; do not weaken existing replay/conflict/race tests:

```java
private static CodexToolResultSubmission submission(String callId, String key) {
  return new CodexToolResultSubmission(
      "request", "conversation", "thread", "turn", callId, key, "ok", "value");
}
```

- [x] **Step 3: Run Java contract verification**

Run:

```bash
mvn -f backend/pom.xml -Dtest=CodexAppServerClientTest,CodexPendingTurnRegistryTest,CodexAppServerAdapterTest,CodexTurnControllerTest test
```

Expected: all focused Java tests PASS with five-call coverage. This is a verification-only slice because existing Java production code already passed the approved sequential lifecycle for two calls.

If the new five-call test fails, stop, invoke `superpowers:systematic-debugging`, revise this plan with the exact production change, and repeat Plan Preflight before modifying Java source.

### Task 6: Documentation And Focused Verification

- [x] **Step 1: Update the Local CLI guide**

Document:

- browser URL is `http://localhost:5173`;
- `127.0.0.1:5173` is not the configured allowed browser origin;
- running activity is expanded, terminal activity auto-collapses, and the user can expand all safe states;
- errors show only Runtime/upstream classes;
- provider duration can remain tens of seconds under `gpt-5.6-sol / high`;
- current catalog cannot create a skill because no approved workspace write/edit capability is exposed;
- rollback restores only the eight user-local production files from the scoped backup.

- [x] **Step 2: Run focused verification**

Run:

```bash
pnpm --filter @openharness/frontend test -- test/ApprovalCard.test.tsx test/executionActivity.test.ts test/ExecutionActivityGroup.test.tsx test/App.test.tsx test/runtimeProgress.test.ts test/sseWire.test.ts
pnpm --filter @openharness/frontend typecheck
pnpm --filter @openharness/agent-runtime test -- test/codexPendingTurnPersistence.test.ts test/codexPendingTurn.test.ts test/lifecycleUnitOfWork.test.ts test/productionRunnerPersistence.test.ts test/productionServerLifecycle.test.ts test/terminalErrors.test.ts test/streamEventIds.test.ts
pnpm --filter @openharness/agent-runtime typecheck
mvn -f backend/pom.xml -Dtest=CodexAppServerClientTest,CodexPendingTurnRegistryTest,CodexAppServerAdapterTest,CodexTurnControllerTest test
openspec validate fix-runtime-chat-terminal-tool-flow --strict --no-interactive
git diff --check
```

Expected: every command exits `0`. No full workspace test command is authorized.

- [x] **Step 3: Run negative sensitive-value scans**

Use fixed synthetic canaries, not environment values:

```bash
rg -n 'PROMPT-CANARY|ERROR-CANARY|ARG-CANARY|RESULT-CANARY|BRIDGE-CANARY|AUTH-CANARY' \
  frontend/src agent-runtime/src backend/src/main/java docs/guides/openharness-local-cli-wrapper.md
```

Expected: no production-source or guide matches. Test fixtures may contain these fixed canaries by design.

- [x] **Step 4: Request implementation Review**

Invoke `superpowers:requesting-code-review`. The Review scope MUST include the complete P0 diff, OpenSpec coverage, Java test-only decision, TDD evidence, sensitive canaries, user-local sync manifest design, no unrelated source changes, and no Production Verified claim. Persist the result as [2026-07-30-runtime-chat-terminal-tool-flow-implementation-review.md](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/main-local-trial/docs/review/2026-07-30-runtime-chat-terminal-tool-flow-implementation-review.md).

Any finding returns to the affected slice for correction, fresh focused verification, and Review.

### Task 7: User-Local Backup, Sync, And Browser Smoke

- [ ] **Step 1: Capture scoped before-state**

Confirm the wrapper-owned services and ports, then stop only through the wrapper before synchronization:

```bash
/Users/elvis/.local/bin/openharness status
/Users/elvis/.local/bin/openharness down
```

Record ownership of ports `8080`, `3001`, `3101`, and `5173`; do not kill processes by name.

- [ ] **Step 2: Create scoped backup and manifest**

Create a timestamped directory under [backups](file:///Users/elvis/.local/state/openharness/backups). Back up existing user-local copies of:

- `frontend/src/App.tsx`
- `frontend/src/App.css`
- `frontend/src/api.ts`
- `frontend/src/ApprovalCard.tsx`
- `agent-runtime/src/agentExecutionRunner.ts`
- `agent-runtime/src/server.ts`

Record `frontend/src/executionActivity.ts` and `frontend/src/ExecutionActivityGroup.tsx` as `absent` if they do not exist. The manifest contains relative path, before-state, SHA-256 for existing files, timestamp, and worktree source path; mode `0600`. It MUST NOT contain `.env`, headers, provider config, OAuth data, message text, answers, or tool payloads.

- [ ] **Step 3: Synchronize exact verified production files**

Copy only the eight production files from the `main-local-trial` worktree to matching paths under [isolated source](file:///Users/elvis/.local/share/openharness/source). Verify each SHA-256 matches the worktree. Do not copy tests, dashboard, Review, OpenSpec, `.env`, Java files, wrapper executable, or provider configuration.

- [ ] **Step 4: Validate and start**

Run from the isolated source:

```bash
pnpm --filter @openharness/frontend typecheck
pnpm --filter @openharness/agent-runtime typecheck
/Users/elvis/.local/bin/openharness doctor
/Users/elvis/.local/bin/openharness up
/Users/elvis/.local/bin/openharness status
```

Expected: typechecks PASS; doctor PASS; services ready on `8080`, `3001`, `3101`, and `5173`.

- [ ] **Step 5: Run targeted browser and event smoke**

Open `http://localhost:5173` and verify:

1. `hi` shows thinking only while model work is active, then a final answer and collapsed completed activity.
2. `你是哪个模型` ends with a final answer or visible terminal error; no stale thinking remains.
3. `帮我创建一个skill 语法为python 功能为计算阶乘` shows each safe tool state, groups repeated `read_file`, and ends in a final answer or explicit safe error within the configured execution timeout.
4. Expanding the terminal group reveals every safe chronological model/tool state.
5. No raw arguments, result bodies, headers, bridge ids, credentials, or provider bodies appear.

Correlate the final execution through `openharness logs runtime` using lifecycle identifiers. Record model-call duration separately from Runtime terminal transition.

- [ ] **Step 6: Roll back on failure**

If typecheck, readiness, privacy, event pairing, or browser acceptance fails:

1. run wrapper `down`;
2. restore the six backed-up existing files;
3. remove only the two files recorded as previously absent;
4. verify restored hashes;
5. run `openharness doctor`;
6. leave services stopped and report the exact blocker.

Do not use Git reset/clean or broad deletion.

- [ ] **Step 7: Safe shutdown after user acceptance**

After the user finishes browser acceptance, run:

```bash
/usr/bin/perl -e '$SIG{ALRM}=sub{exit 0}; alarm 3; exec @ARGV' \
  /Users/elvis/.local/bin/openharness logs runtime
/Users/elvis/.local/bin/openharness down
/Users/elvis/.local/bin/openharness status
```

Expected: correlated terminal log exists and final wrapper state is stopped. If the user explicitly asks to keep testing, leave services running and report that `down` remains intentionally pending rather than claiming the six-command closure.

### Task 8: Reconciliation And Handoff

- [ ] **Step 1: Reconcile OpenSpec tasks**

Mark only evidence-backed items complete in `openspec/changes/fix-runtime-chat-terminal-tool-flow/tasks.md`. Explain the Java production no-change decision through fresh five-call evidence; do not mark user acceptance or shutdown complete before they occur.

- [ ] **Step 2: Sync dashboard verified state**

After focused verification and implementation Review PASS, set the dashboard entry to `verified`; add exact plan, source/test files, commands/results, Review path, user-local sync evidence, residual risks, and next/non-goals. Render and check the dashboard.

- [ ] **Step 3: Run final fresh verification**

Invoke `superpowers:verification-before-completion` and rerun the exact focused commands after the last source, documentation, OpenSpec task, Review finding, or dashboard change.

- [ ] **Step 4: Final report**

Report:

- `doctor → up → status → chat/browser → logs → down` PASS/FAIL individually;
- ports `8080`, `3001`, `3101`, `5173`;
- log location and correlated identifiers;
- changed files and verification evidence;
- residual model latency and unavailable skill authoring;
- active OpenSpec status and whether a new P1/P2 proposal is needed;
- shortest daily user flow;
- no archive, commit, push, full regression, 24-hour Gate, or Production Verified claim.
