# Add Subagent Trace Tree Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a parent/child Trace Tree for forked subagent executions across TS Runtime, Java trace ingestion, and Frontend Debug Panel.

**Architecture:** Keep `TraceEvent` backward compatible by storing execution-tree fields in `attributes`, not new required top-level fields. TS Runtime emits sanitized subagent lifecycle events and posts key events to Java trace ingestion; Java preserves attributes; Frontend derives a tree view with flat JSON fallback.

**Tech Stack:** TypeScript, Zod, Vitest, React Testing Library, Java 21, Spring Boot MockMvc, Maven, OpenSpec.

---

## Approved Contract

- OpenSpec change: `openspec/changes/add-subagent-trace-tree/`
- Proposal: `openspec/changes/add-subagent-trace-tree/proposal.md`
- Design: `openspec/changes/add-subagent-trace-tree/design.md`
- Tasks: `openspec/changes/add-subagent-trace-tree/tasks.md`
- Spec deltas:
  - `openspec/changes/add-subagent-trace-tree/specs/agent-runtime/spec.md`
  - `openspec/changes/add-subagent-trace-tree/specs/backend-gateway/spec.md`
  - `openspec/changes/add-subagent-trace-tree/specs/frontend-runtime/spec.md`
  - `openspec/changes/add-subagent-trace-tree/specs/shared-schema/spec.md`

## Collaboration Flow

- Codex owns Brief and Review artifacts.
- Antigravity CLI implements each scoped task from the brief.
- After each Antigravity report, Codex reviews and writes `docs/review/YYYY-MM-DD-add-subagent-trace-tree-step-NN-review.md`.
- Brief/report directory: `docs/agent-collab/add-subagent-trace-tree/`.
- Do not implement outside the current step files.
- Do not edit generated dashboard MD/HTML directly; update `development-log.json` then run the renderer.

## File Structure

### Create
- `agent-runtime/src/traceTree.ts` — typed helpers for trace-tree attributes and sanitized trace events.
- `frontend/src/TraceTreePanel.tsx` — renders trace-tree nodes with fallback flat JSON.
- `frontend/test/TraceTreePanel.test.tsx` — focused rendering tests.
- `docs/agent-collab/add-subagent-trace-tree/01-brief.md` through implementation-created briefs.
- `docs/review/2026-06-23-add-subagent-trace-tree-step-*.md` — Codex review artifacts.
- `docs/design/2026-06-23-add-subagent-trace-tree-closeout.md` — final closeout after implementation.

### Modify
- `packages/shared-schema/src/index.ts` — optional typed trace-tree attribute schema/helpers, keeping old `TraceEvent` valid.
- `packages/shared-schema/test/schema.test.ts` — TraceEvent old/new compatibility tests.
- `agent-runtime/src/trace.ts` — accepts optional attributes from trace-tree helper; preserve existing `traceEvent()` API.
- `agent-runtime/src/subagent/dispatcher.ts` — emits sanitized subagent start/model/tool/terminal trace events.
- `agent-runtime/src/agentExecutionRunner.ts` — passes trace emitter into dispatcher and posts key trace events.
- `agent-runtime/src/javaClient.ts` — reuse existing `postTrace`; no API shape change expected.
- `agent-runtime/test/subagentDispatcher.test.ts` — verify subagent trace attributes, cost, terminal classification, sanitization.
- `agent-runtime/test/agentExecutionRunner.test.ts` — verify Java trace ingestion calls and non-blocking failure behavior.
- `backend/src/test/java/org/openharness/backend/BackendApiTest.java` — verify backend accepts/preserves subagent trace attributes.
- `frontend/src/App.tsx` — replace raw SSE event `<pre>` with `TraceTreePanel` while preserving raw fallback.
- `frontend/src/App.css` — minimal styles for tree nodes.
- `frontend/test/App.test.tsx` — integration smoke for subagent trace event display if needed.
- `openspec/changes/add-subagent-trace-tree/tasks.md` — mark tasks complete only after implementation and verification.
- `docs/project-dashboard/development-log.json` — sync `verified` after all formal checks pass.

---

## Step Evidence Gate Matrix

| Step | Gate | Allowed files | Formal verification | Signoff condition |
|---|---|---|---|---|
| 1 Shared schema | Full | `packages/shared-schema/src/index.ts`, `packages/shared-schema/test/schema.test.ts` | `pnpm --filter @openharness/shared-schema test` | Old TraceEvent and new trace-tree attributes both parse |
| 2 TS helpers | Full | `agent-runtime/src/traceTree.ts`, `agent-runtime/src/trace.ts`, `agent-runtime/test/subagentDispatcher.test.ts` | `pnpm --filter @openharness/agent-runtime test -- subagentDispatcher` | Helper emits stable sanitized attributes |
| 3 Dispatcher/Runner | Full | `agent-runtime/src/subagent/dispatcher.ts`, `agent-runtime/src/agentExecutionRunner.ts`, `agent-runtime/test/subagentDispatcher.test.ts`, `agent-runtime/test/agentExecutionRunner.test.ts` | `pnpm --filter @openharness/agent-runtime test -- subagentDispatcher agentExecutionRunner` | Lifecycle events emitted and Java postTrace failure is non-blocking |
| 4 Java Gateway | Compact | `backend/src/test/java/org/openharness/backend/BackendApiTest.java` | `mvn test -f backend/pom.xml` | Trace ingestion accepts and preserves attributes |
| 5 Frontend | Full | `frontend/src/TraceTreePanel.tsx`, `frontend/src/App.tsx`, `frontend/src/App.css`, `frontend/test/TraceTreePanel.test.tsx`, optional `frontend/test/App.test.tsx` | `pnpm --filter @openharness/frontend test` | Tree view renders child node and fallback remains |
| 6 Closeout | Compact | `openspec/changes/add-subagent-trace-tree/tasks.md`, `docs/project-dashboard/development-log.json`, generated dashboard files, closeout/review docs | all commands in Step 6 | Dashboard verified, OpenSpec valid, closeout ready |

---

## Task 1: Shared Schema Trace Tree Contract

**Files:**
- Modify: `packages/shared-schema/src/index.ts`
- Modify: `packages/shared-schema/test/schema.test.ts`

**Step goal:** Make trace-tree attributes explicit and testable without breaking historical `TraceEvent` parsing.

**Code fact anchors before editing:**
- `packages/shared-schema/src/index.ts`: `TraceEventSchema` already has optional `attributes: z.record(z.unknown()).optional()`.
- `packages/shared-schema/test/schema.test.ts`: shared schema tests already parse model/tool/request contracts.

**Negative search before editing:**
Run:
```bash
rg -n "TraceTree|traceNodeKind|parentExecutionId|childExecutionId" packages/shared-schema/src packages/shared-schema/test
```
Expected before this task: no existing shared-schema trace-tree contract except proposal files.

- [ ] **Step 1.1: Write failing shared-schema tests**

Add these imports in `packages/shared-schema/test/schema.test.ts`:

```ts
import {
  TraceEventSchema,
  TraceTreeAttributesSchema
} from "../src/index";
```

If the file already imports many symbols from `../src/index`, merge these names into the existing import instead of adding a second duplicate import.

Add tests inside `describe("shared schema", () => { ... })`:

```ts
  it("parses trace tree attributes for subagent execution", () => {
    const parsed = TraceEventSchema.parse({
      traceId: "trace-001",
      spanId: "span-subagent-start",
      requestId: "req-001",
      conversationId: "conv-parent",
      userId: "user-001",
      tenantId: "tenant-001",
      runtime: "agent-runtime",
      eventType: "SUBAGENT_START",
      name: "subagent start",
      status: "ok",
      startTime: 1780000000000,
      attributes: {
        traceNodeKind: "subagent_execution",
        executionId: "exec-parent",
        parentExecutionId: "exec-parent",
        childExecutionId: "subagent-child",
        childConversationId: "conv-parent::subagent-child",
        skillName: "worker-skill",
        toolCallId: "call-skill"
      }
    });

    const attributes = TraceTreeAttributesSchema.parse(parsed.attributes);
    expect(attributes.traceNodeKind).toBe("subagent_execution");
    expect(attributes.parentExecutionId).toBe("exec-parent");
    expect(attributes.childExecutionId).toBe("subagent-child");
  });

  it("keeps historical trace events without trace tree attributes valid", () => {
    const parsed = TraceEventSchema.parse({
      traceId: "trace-legacy",
      spanId: "span-legacy",
      requestId: "req-legacy",
      conversationId: "conv-legacy",
      userId: "user-legacy",
      tenantId: "tenant-legacy",
      runtime: "backend",
      eventType: "MODEL_CALL_END",
      name: "model call end",
      status: "ok",
      startTime: 1780000000000
    });

    expect(parsed.attributes).toBeUndefined();
  });
```

- [ ] **Step 1.2: Run test to verify it fails**

Run:
```bash
pnpm --filter @openharness/shared-schema test -- schema
```
Expected: FAIL because `TraceTreeAttributesSchema` is not exported.

- [ ] **Step 1.3: Implement shared-schema trace-tree attributes**

In `packages/shared-schema/src/index.ts`, near `TraceEventSchema`, add:

```ts
export const TraceNodeKindSchema = z.enum([
  "agent_execution",
  "subagent_execution",
  "model_call",
  "tool_call",
  "summary"
]);
export type TraceNodeKind = z.infer<typeof TraceNodeKindSchema>;

export const TraceTreeAttributesSchema = z.object({
  traceNodeKind: TraceNodeKindSchema,
  executionId: z.string().optional(),
  parentExecutionId: z.string().optional(),
  childExecutionId: z.string().optional(),
  childConversationId: z.string().optional(),
  skillName: z.string().optional(),
  toolCallId: z.string().optional(),
  stepIndex: z.number().int().nonnegative().optional(),
  terminalClass: z.string().optional(),
  durationMs: z.number().nonnegative().optional(),
  costUsdMicros: z.number().int().nonnegative().optional(),
  traceIngestionStatus: z.enum(["posted", "failed", "skipped"]).optional()
}).passthrough();
export type TraceTreeAttributes = z.infer<typeof TraceTreeAttributesSchema>;
```

Keep `TraceEventSchema.attributes` as `z.record(z.unknown()).optional()` so old arbitrary attributes remain valid.

- [ ] **Step 1.4: Run shared-schema verification**

Run:
```bash
pnpm --filter @openharness/shared-schema test -- schema
```
Expected: PASS.

- [ ] **Step 1.5: Self-review**

Check:
```bash
rg -n "TraceTreeAttributesSchema|TraceNodeKindSchema|traceNodeKind" packages/shared-schema/src/index.ts packages/shared-schema/test/schema.test.ts
```
Expected: tests and exports exist; `TraceEventSchema.attributes` remains optional and not replaced with a strict required shape.

---

## Task 2: TS Runtime Trace Tree Helper

**Files:**
- Create: `agent-runtime/src/traceTree.ts`
- Modify: `agent-runtime/src/trace.ts`
- Modify: `agent-runtime/test/subagentDispatcher.test.ts`

**Step goal:** Introduce a small helper that builds sanitized trace-tree attributes for subagents.

**Code fact anchors before editing:**
- `agent-runtime/src/trace.ts` exports trace event constants and `traceEvent()`.
- `agent-runtime/test/subagentDispatcher.test.ts` already imports `TraceEvent` and has a fake Java client.

**Negative search before editing:**
Run:
```bash
rg -n "subagentTrace|traceTree|SUBAGENT_START|SUBAGENT_END" agent-runtime/src agent-runtime/test
```
Expected before this task: no helper or constants.

- [ ] **Step 2.1: Write failing helper tests**

In `agent-runtime/test/subagentDispatcher.test.ts`, add imports:

```ts
import { buildSubagentTraceAttributes, TRACE_SUBAGENT_END, TRACE_SUBAGENT_START } from "../src/traceTree";
```

Add tests inside `describe("SubagentDispatcher", () => { ... })`:

```ts
  it("builds sanitized subagent trace-tree attributes", () => {
    const attrs = buildSubagentTraceAttributes({
      executionId: "parent-exec-1",
      childExecutionId: "subagent-child-1",
      childConversationId: "parent-conv::subagent-child-1",
      skillName: "worker-skill",
      toolCallId: "call-skill",
      stepIndex: 2,
      terminalClass: "SUBAGENT_TIMEOUT",
      durationMs: 25,
      costUsdMicros: 7
    });

    expect(attrs).toEqual({
      traceNodeKind: "subagent_execution",
      executionId: "parent-exec-1",
      parentExecutionId: "parent-exec-1",
      childExecutionId: "subagent-child-1",
      childConversationId: "parent-conv::subagent-child-1",
      skillName: "worker-skill",
      toolCallId: "call-skill",
      stepIndex: 2,
      terminalClass: "SUBAGENT_TIMEOUT",
      durationMs: 25,
      costUsdMicros: 7
    });
    expect(JSON.stringify(attrs)).not.toContain("Use available tools");
  });

  it("defines stable subagent trace event names", () => {
    expect(TRACE_SUBAGENT_START).toBe("SUBAGENT_START");
    expect(TRACE_SUBAGENT_END).toBe("SUBAGENT_END");
  });
```

- [ ] **Step 2.2: Run test to verify it fails**

Run:
```bash
pnpm --filter @openharness/agent-runtime test -- subagentDispatcher
```
Expected: FAIL because `../src/traceTree` does not exist.

- [ ] **Step 2.3: Create trace tree helper**

Create `agent-runtime/src/traceTree.ts`:

```ts
import type { TraceTreeAttributes } from "@openharness/shared-schema";

export const TRACE_SUBAGENT_START = "SUBAGENT_START";
export const TRACE_SUBAGENT_MODEL_CALL = "SUBAGENT_MODEL_CALL";
export const TRACE_SUBAGENT_TOOL_CALL = "SUBAGENT_TOOL_CALL";
export const TRACE_SUBAGENT_SUMMARY = "SUBAGENT_SUMMARY";
export const TRACE_SUBAGENT_END = "SUBAGENT_END";

export interface SubagentTraceInput {
  executionId: string;
  childExecutionId: string;
  childConversationId: string;
  skillName: string;
  toolCallId: string;
  stepIndex?: number;
  terminalClass?: string;
  durationMs?: number;
  costUsdMicros?: number;
  traceIngestionStatus?: "posted" | "failed" | "skipped";
}

export function buildSubagentTraceAttributes(input: SubagentTraceInput): TraceTreeAttributes {
  return withoutUndefined({
    traceNodeKind: "subagent_execution",
    executionId: input.executionId,
    parentExecutionId: input.executionId,
    childExecutionId: input.childExecutionId,
    childConversationId: input.childConversationId,
    skillName: input.skillName,
    toolCallId: input.toolCallId,
    stepIndex: input.stepIndex,
    terminalClass: input.terminalClass,
    durationMs: input.durationMs,
    costUsdMicros: input.costUsdMicros,
    traceIngestionStatus: input.traceIngestionStatus
  });
}

function withoutUndefined<T extends Record<string, unknown>>(input: T): T {
  return Object.fromEntries(Object.entries(input).filter(([, value]) => value !== undefined)) as T;
}
```

- [ ] **Step 2.4: Run helper verification**

Run:
```bash
pnpm --filter @openharness/agent-runtime test -- subagentDispatcher
```
Expected: PASS for helper tests and existing dispatcher tests.

---

## Task 3: TS Runtime Subagent Lifecycle Events and Java Trace Posting

**Files:**
- Modify: `agent-runtime/src/subagent/dispatcher.ts`
- Modify: `agent-runtime/src/agentExecutionRunner.ts`
- Modify: `agent-runtime/test/subagentDispatcher.test.ts`
- Modify: `agent-runtime/test/agentExecutionRunner.test.ts`

**Step goal:** Emit key subagent trace-tree events and post start/end events to Java trace ingestion without failing the agent turn when ingestion is unavailable.

**Boundary:** This task does not change subagent permission, prompt, history, or tool execution semantics.

**Negative search before editing:**
Run:
```bash
rg -n "TRACE_SUBAGENT|buildSubagentTraceAttributes|postTrace" agent-runtime/src/subagent agent-runtime/src/agentExecutionRunner.ts agent-runtime/test
```
Expected: only Task 2 helper references before implementation.

- [ ] **Step 3.1: Extend dispatcher input with optional trace emitter**

In `agent-runtime/src/subagent/dispatcher.ts`, update imports:

```ts
import type { AgentMessage, CatalogResponse, ToolDefinition, ToolCallRequest, TraceEvent } from "../types";
import {
  buildSubagentTraceAttributes,
  TRACE_SUBAGENT_END,
  TRACE_SUBAGENT_MODEL_CALL,
  TRACE_SUBAGENT_START,
  TRACE_SUBAGENT_SUMMARY,
  TRACE_SUBAGENT_TOOL_CALL
} from "../traceTree";
import { traceEvent } from "../trace";
```

Update `SubagentRunInput`:

```ts
export interface SubagentRunInput {
  parent: SubagentParentContext;
  toolCallId: string;
  skill: Skill;
  task: string;
  parentCatalog: CatalogResponse;
  timeoutMs: number;
  stepIndex?: number;
  emitTrace?: (event: TraceEvent) => Promise<void>;
}
```

- [ ] **Step 3.2: Write failing dispatcher trace tests**

In `agent-runtime/test/subagentDispatcher.test.ts`, add a test:

```ts
  it("emits sanitized subagent start and terminal trace events", async () => {
    const javaClient = new FakeSubagentJavaClient();
    const dispatcher = new SubagentDispatcher(javaClient);
    const emitted: TraceEvent[] = [];

    const result = await dispatcher.run({
      parent: {
        executionId: "parent-exec-1",
        tenantId: "t1",
        conversationId: "parent-conv",
        requestId: "req-1",
        traceId: "trace-1",
        userId: "u1",
        headers: {},
        abortSignal: new AbortController().signal
      },
      toolCallId: "call-skill",
      skill: {
        metadata: {
          name: "worker-skill",
          description: "worker",
          version: "1.0.0",
          tools_required: [],
          parameters: {},
          fork_agent: true
        },
        content: "SECRET SYSTEM PROMPT CONTENT",
        sourcePath: "/tmp/worker-skill/SKILL.md"
      },
      task: "summarize files",
      parentCatalog,
      timeoutMs: 30_000,
      stepIndex: 3,
      emitTrace: async event => { emitted.push(event); }
    });

    expect(result.status).toBe("ok");
    expect(emitted.map(event => event.eventType)).toContain(TRACE_SUBAGENT_START);
    expect(emitted.map(event => event.eventType)).toContain(TRACE_SUBAGENT_END);
    const start = emitted.find(event => event.eventType === TRACE_SUBAGENT_START)!;
    expect(start.attributes).toMatchObject({
      traceNodeKind: "subagent_execution",
      executionId: "parent-exec-1",
      parentExecutionId: "parent-exec-1",
      skillName: "worker-skill",
      toolCallId: "call-skill",
      stepIndex: 3
    });
    expect(JSON.stringify(emitted)).not.toContain("SECRET SYSTEM PROMPT CONTENT");
  });
```

- [ ] **Step 3.3: Implement dispatcher trace emission**

In `SubagentDispatcher.run()`, after `childConversationId` is created, add:

```ts
    const startedAt = Date.now();
    const emitSubagentTrace = async (
      eventType: string,
      name: string,
      extra?: { terminalClass?: string; costUsdMicros?: number; status?: "ok" | "error" | "timeout" }
    ) => {
      if (!input.emitTrace) return;
      const durationMs = Date.now() - startedAt;
      await input.emitTrace(traceEvent({
        traceId: input.parent.traceId,
        requestId: input.parent.requestId,
        conversationId: input.parent.conversationId,
        userId: input.parent.userId,
        tenantId: input.parent.tenantId,
        eventType,
        name,
        status: extra?.status,
        attributes: buildSubagentTraceAttributes({
          executionId: input.parent.executionId,
          childExecutionId,
          childConversationId,
          skillName: input.skill.metadata.name,
          toolCallId: input.toolCallId,
          stepIndex: input.stepIndex,
          terminalClass: extra?.terminalClass,
          durationMs,
          costUsdMicros: extra?.costUsdMicros
        })
      }));
    };

    await emitSubagentTrace(TRACE_SUBAGENT_START, "subagent start");
```

Before first `javaClient.chat(...)`, emit:

```ts
    await emitSubagentTrace(TRACE_SUBAGENT_MODEL_CALL, "subagent model call");
```

Before executing each child tool, emit:

```ts
      await emitSubagentTrace(TRACE_SUBAGENT_TOOL_CALL, "subagent tool call");
```

Before the second model call, emit another `TRACE_SUBAGENT_MODEL_CALL`.

On each return path, emit `TRACE_SUBAGENT_END` or `TRACE_SUBAGENT_SUMMARY` as appropriate. Example successful no-tool return:

```ts
      await emitSubagentTrace(TRACE_SUBAGENT_SUMMARY, "subagent summary", { costUsdMicros: aggregatedCost });
      await emitSubagentTrace(TRACE_SUBAGENT_END, "subagent end", { costUsdMicros: aggregatedCost });
      return { ... };
```

Example timeout error before return:

```ts
      await emitSubagentTrace(TRACE_SUBAGENT_END, "subagent timeout", {
        terminalClass: "SUBAGENT_TIMEOUT",
        status: "timeout",
        costUsdMicros: aggregatedCost
      });
```

For policy/tool/model errors, use `status: "error"` and the matching `terminalClass`.

- [ ] **Step 3.4: Run dispatcher tests**

Run:
```bash
pnpm --filter @openharness/agent-runtime test -- subagentDispatcher
```
Expected: PASS.

- [ ] **Step 3.5: Write failing runner postTrace tests**

In `agent-runtime/test/agentExecutionRunner.test.ts`, extend `FakeJavaClient`:

```ts
  traceEvents: TraceEvent[] = [];
  failTracePost = false;

  async postTrace(e: TraceEvent) {
    this.traceEvents.push(e);
    if (this.failTracePost) throw new Error("trace ingestion down");
  }
```

If `postTrace` already exists as `async postTrace(_e: TraceEvent) {}`, replace it with the above.

Add a fork skill test near existing `invoke_skill` tests. Use the existing test pattern for temporary skill files; if no helper exists, create the skill under `.codex/skills/worker-skill/SKILL.md` in test setup and remove it in `afterEach`.

Test body expectation:

```ts
    expect(javaClient.traceEvents.some(event => event.eventType === "SUBAGENT_START")).toBe(true);
    expect(javaClient.traceEvents.some(event => event.eventType === "SUBAGENT_END")).toBe(true);
    const subagentStart = javaClient.traceEvents.find(event => event.eventType === "SUBAGENT_START")!;
    expect(subagentStart.attributes).toMatchObject({
      traceNodeKind: "subagent_execution",
      executionId,
      parentExecutionId: executionId,
      skillName: "worker-skill"
    });
```

Add non-blocking failure test:

```ts
    javaClient.failTracePost = true;
    const { executionId, result } = runner.start(baseInput);
    await expect(result).resolves.toMatchObject({ answer: "done" });
    expect(executionStateStore.get(executionId)?.status).toBe("completed");
```

- [ ] **Step 3.6: Implement runner trace forwarding**

In `agent-runtime/src/agentExecutionRunner.ts`, when calling `subagentDispatcher.run`, pass:

```ts
            stepIndex,
            emitTrace: async (event) => {
              await emit(event);
              try {
                await this.javaClient.postTrace(event, input.headers);
              } catch (err) {
                console.warn("[trace-tree] Java trace ingestion failed, continuing:", err instanceof Error ? err.message : String(err));
              }
            }
```

Do not throw from the catch. Do not log `input.headers` or service token.

- [ ] **Step 3.7: Run TS Runtime verification**

Run:
```bash
pnpm --filter @openharness/agent-runtime test -- subagentDispatcher agentExecutionRunner
pnpm --filter @openharness/agent-runtime typecheck
```
Expected: PASS.

---

## Task 4: Java Gateway Trace Ingestion Preservation

**Files:**
- Modify: `backend/src/test/java/org/openharness/backend/BackendApiTest.java`

**Step goal:** Verify Java accepts and preserves subagent trace-tree attributes without scheduling subagents or leaking auth tokens.

**Code fact anchors:**
- `backend/src/test/java/org/openharness/backend/BackendApiTest.java` has `traceEventIsAccepted()`.
- `backend/src/main/java/org/openharness/backend/service/TraceService.java` records the incoming DTO as-is.

- [ ] **Step 4.1: Add backend trace-tree ingestion test**

In `BackendApiTest.java`, add:

```java
  @Test
  void subagentTraceTreeAttributesAreAccepted() throws Exception {
    mvc.perform(
            valid(post("/api/v1/trace/events"))
                .contentType(MediaType.APPLICATION_JSON)
                .content(
                    json(
                        Map.ofEntries(
                            entry("traceId", "trace-001"),
                            entry("spanId", "span-subagent-001"),
                            entry("requestId", "req-001"),
                            entry("conversationId", "conv-parent"),
                            entry("userId", "user-001"),
                            entry("tenantId", "tenant-001"),
                            entry("runtime", "agent-runtime"),
                            entry("eventType", "SUBAGENT_START"),
                            entry("name", "subagent start"),
                            entry("status", "ok"),
                            entry("startTime", 1780000000000L),
                            entry("attributes", Map.ofEntries(
                                entry("traceNodeKind", "subagent_execution"),
                                entry("executionId", "exec-parent"),
                                entry("parentExecutionId", "exec-parent"),
                                entry("childExecutionId", "subagent-child"),
                                entry("childConversationId", "conv-parent::subagent-child"),
                                entry("skillName", "worker-skill"),
                                entry("toolCallId", "call-skill")))))))
        .andExpect(status().isAccepted());
  }
```

- [ ] **Step 4.2: Run backend verification**

Run:
```bash
mvn test -f backend/pom.xml
```
Expected: PASS.

- [ ] **Step 4.3: Self-review backend scope**

Run:
```bash
git diff -- backend/src/main/java/org/openharness/backend backend/src/test/java/org/openharness/backend/BackendApiTest.java
```
Expected: only tests changed unless an actual failing DTO issue required minimal implementation. No Java Agent Loop, no provider cost recalculation.

---

## Task 5: Frontend Trace Tree Panel

**Files:**
- Create: `frontend/src/TraceTreePanel.tsx`
- Create: `frontend/test/TraceTreePanel.test.tsx`
- Modify: `frontend/src/App.tsx`
- Modify: `frontend/src/App.css`

**Step goal:** Render subagent trace-tree nodes when attributes are present and preserve flat JSON fallback for old events.

- [ ] **Step 5.1: Write failing focused frontend tests**

Create `frontend/test/TraceTreePanel.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { TraceTreePanel } from "../src/TraceTreePanel";

const subagentEvents = [
  {
    event: "trace",
    data: {
      eventType: "AGENT_START",
      attributes: {
        traceNodeKind: "agent_execution",
        executionId: "exec-parent"
      }
    }
  },
  {
    event: "trace",
    data: {
      eventType: "SUBAGENT_END",
      status: "ok",
      durationMs: 42,
      attributes: {
        traceNodeKind: "subagent_execution",
        executionId: "exec-parent",
        parentExecutionId: "exec-parent",
        childExecutionId: "subagent-child",
        childConversationId: "conv::subagent-child",
        skillName: "worker-skill",
        toolCallId: "call-skill",
        costUsdMicros: 7,
        terminalClass: "FINAL_ANSWER"
      }
    }
  }
];

describe("TraceTreePanel", () => {
  it("renders subagent trace tree nodes", () => {
    render(<TraceTreePanel events={subagentEvents} />);

    expect(screen.getByText("Trace Tree")).toBeTruthy();
    expect(screen.getByText("exec-parent")).toBeTruthy();
    expect(screen.getByText("worker-skill")).toBeTruthy();
    expect(screen.getByText(/subagent-child/)).toBeTruthy();
    expect(screen.getByText(/cost: 7 µUSD/)).toBeTruthy();
  });

  it("falls back to flat JSON for old events", () => {
    render(<TraceTreePanel events={[{ event: "agent_start", data: { traceId: "trace-legacy" } }]} />);

    expect(screen.getByText("SSE Events")).toBeTruthy();
    expect(screen.getByText(/trace-legacy/)).toBeTruthy();
  });
});
```

- [ ] **Step 5.2: Run frontend test to verify it fails**

Run:
```bash
pnpm --filter @openharness/frontend test -- TraceTreePanel
```
Expected: FAIL because `TraceTreePanel` does not exist.

- [ ] **Step 5.3: Implement TraceTreePanel**

Create `frontend/src/TraceTreePanel.tsx`:

```tsx
interface TraceTreePanelProps {
  events: { event: string; data: Record<string, unknown> }[];
}

interface TraceNode {
  executionId: string;
  parentExecutionId?: string;
  childExecutionId?: string;
  childConversationId?: string;
  skillName?: string;
  status?: string;
  terminalClass?: string;
  durationMs?: number;
  costUsdMicros?: number;
}

export function TraceTreePanel({ events }: TraceTreePanelProps) {
  const nodes = buildTraceNodes(events);
  if (nodes.length === 0) {
    return (
      <>
        <h2>SSE Events</h2>
        <pre>{JSON.stringify(events, null, 2)}</pre>
      </>
    );
  }

  const roots = nodes.filter(node => !node.parentExecutionId || node.parentExecutionId === node.executionId);
  const children = nodes.filter(node => node.parentExecutionId && node.parentExecutionId !== node.executionId);

  return (
    <section className="trace-tree" aria-label="Trace Tree">
      <h2>Trace Tree</h2>
      {roots.map(root => (
        <div className="trace-node root" key={root.executionId}>
          <strong>{root.executionId}</strong>
          <span>{root.status ?? "ok"}</span>
          <div className="trace-children">
            {children.filter(child => child.parentExecutionId === root.executionId).map(child => (
              <div className="trace-node child" key={child.childExecutionId ?? child.executionId}>
                <strong>{child.skillName ?? "subagent"}</strong>
                <span>{child.childExecutionId ?? child.executionId}</span>
                {child.childConversationId && <span>{child.childConversationId}</span>}
                {child.status && <span>status: {child.status}</span>}
                {child.durationMs !== undefined && <span>duration: {child.durationMs} ms</span>}
                {child.costUsdMicros !== undefined && <span>cost: {child.costUsdMicros} µUSD</span>}
                {child.terminalClass && <span>terminal: {child.terminalClass}</span>}
              </div>
            ))}
          </div>
        </div>
      ))}
      <details>
        <summary>Raw events</summary>
        <pre>{JSON.stringify(events, null, 2)}</pre>
      </details>
    </section>
  );
}

function buildTraceNodes(events: TraceTreePanelProps["events"]): TraceNode[] {
  const byKey = new Map<string, TraceNode>();
  for (const event of events) {
    const attrs = readAttributes(event.data);
    if (!attrs) continue;
    const executionId = stringValue(attrs.executionId ?? attrs.parentExecutionId);
    const childExecutionId = stringValue(attrs.childExecutionId);
    if (!executionId && !childExecutionId) continue;
    const key = childExecutionId ?? executionId;
    const previous = byKey.get(key) ?? { executionId: executionId ?? key };
    byKey.set(key, {
      ...previous,
      executionId: executionId ?? previous.executionId,
      parentExecutionId: stringValue(attrs.parentExecutionId) ?? previous.parentExecutionId,
      childExecutionId: childExecutionId ?? previous.childExecutionId,
      childConversationId: stringValue(attrs.childConversationId) ?? previous.childConversationId,
      skillName: stringValue(attrs.skillName) ?? previous.skillName,
      status: stringValue(event.data.status) ?? previous.status,
      terminalClass: stringValue(attrs.terminalClass) ?? previous.terminalClass,
      durationMs: numberValue(attrs.durationMs ?? event.data.durationMs) ?? previous.durationMs,
      costUsdMicros: numberValue(attrs.costUsdMicros ?? event.data.costUsdMicros) ?? previous.costUsdMicros
    });
  }
  return [...byKey.values()];
}

function readAttributes(data: Record<string, unknown>): Record<string, unknown> | undefined {
  const attrs = data.attributes;
  if (!attrs || typeof attrs !== "object" || Array.isArray(attrs)) return undefined;
  const nodeKind = (attrs as Record<string, unknown>).traceNodeKind;
  return typeof nodeKind === "string" ? attrs as Record<string, unknown> : undefined;
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function numberValue(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}
```

- [ ] **Step 5.4: Integrate panel into App**

In `frontend/src/App.tsx`, add:

```ts
import { TraceTreePanel } from "./TraceTreePanel";
```

Replace the trace pane contents:

```tsx
      <aside className="trace-pane">
        <TraceTreePanel events={events} />
      </aside>
```

- [ ] **Step 5.5: Add minimal styles**

Append to `frontend/src/App.css`:

```css
.trace-tree {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.trace-node {
  border: 1px solid #334155;
  border-radius: 0.5rem;
  padding: 0.5rem;
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.trace-node.child {
  margin-left: 1rem;
  border-color: #64748b;
}

.trace-children {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  margin-top: 0.5rem;
}
```

- [ ] **Step 5.6: Run frontend verification**

Run:
```bash
pnpm --filter @openharness/frontend test -- TraceTreePanel App
pnpm --filter @openharness/frontend typecheck
```
Expected: PASS.

---

## Task 6: Formal Verification, Dashboard Sync, Review, Closeout

**Files:**
- Modify: `openspec/changes/add-subagent-trace-tree/tasks.md`
- Modify: `docs/project-dashboard/development-log.json`
- Generated: `docs/project-dashboard/development-log.md`
- Generated: `docs/project-dashboard/index.html`
- Create: `docs/design/2026-06-23-add-subagent-trace-tree-closeout.md`
- Create/modify: `docs/review/2026-06-23-add-subagent-trace-tree-implementation-review.md`

**Step goal:** Prove the implementation satisfies the approved contract and prepare for archive.

- [ ] **Step 6.1: Run formal verification suite**

Run:
```bash
pnpm --filter @openharness/shared-schema test
pnpm --filter @openharness/agent-runtime test -- subagentDispatcher agentExecutionRunner
pnpm --filter @openharness/agent-runtime typecheck
mvn test -f backend/pom.xml
pnpm --filter @openharness/frontend test
pnpm --filter @openharness/frontend typecheck
npx openspec validate add-subagent-trace-tree --strict --no-interactive
```
Expected: all pass. OpenSpec PostHog telemetry network flush warnings are non-blocking only if process exit code is 0.

- [ ] **Step 6.2: Mark OpenSpec tasks complete**

Update `openspec/changes/add-subagent-trace-tree/tasks.md` from `- [ ]` to `- [x]` only for actually completed tasks. Do not mark archive task complete before archive.

- [ ] **Step 6.3: Sync dashboard verified state**

Update `docs/project-dashboard/development-log.json` entry `add-subagent-trace-tree`:

```json
{
  "status": "verified",
  "superpowers": {
    "plan": "docs/superpowers/plans/2026-06-23-add-subagent-trace-tree.md"
  },
  "implementation": {
    "sourceFiles": [
      "packages/shared-schema/src/index.ts",
      "agent-runtime/src/traceTree.ts",
      "agent-runtime/src/trace.ts",
      "agent-runtime/src/subagent/dispatcher.ts",
      "agent-runtime/src/agentExecutionRunner.ts",
      "frontend/src/TraceTreePanel.tsx",
      "frontend/src/App.tsx",
      "frontend/src/App.css"
    ],
    "testFiles": [
      "packages/shared-schema/test/schema.test.ts",
      "agent-runtime/test/subagentDispatcher.test.ts",
      "agent-runtime/test/agentExecutionRunner.test.ts",
      "backend/src/test/java/org/openharness/backend/BackendApiTest.java",
      "frontend/test/TraceTreePanel.test.tsx",
      "frontend/test/App.test.tsx"
    ]
  }
}
```

Also add verification command results exactly as observed.

- [ ] **Step 6.4: Render and check dashboard**

Run:
```bash
node docs/project-dashboard/scripts/render-dashboard.mjs
pnpm dashboard:check
```
Expected: generated dashboard files are current.

- [ ] **Step 6.5: Create closeout**

Create `docs/design/2026-06-23-add-subagent-trace-tree-closeout.md` with header:

```md
# Add Subagent Trace Tree Closeout

文档类型：Closeout / Implementation Record
日志及版本：2026-06-23 v1
状态：verified / pending OpenSpec archive
```

Include:
- 结论：`通过` or `有风险` based on verification.
- Scope: exact source/test/spec/dashboard files.
- Core logic: shared schema attributes, TS trace emission/posting, Java ingestion, Frontend tree/fallback.
- Verification evidence: exact commands and pass/fail.
- Residual risks: no sensitive payload tracing; Java remains ingestion-only; fallback behavior.

- [ ] **Step 6.6: Create implementation review**

Create `docs/review/2026-06-23-add-subagent-trace-tree-implementation-review.md` following project review rules. All reviewed paths must be absolute `file:///` Markdown links.

- [ ] **Step 6.7: Final pre-archive validation**

Run:
```bash
git diff --stat
pnpm dashboard:check
npx openspec validate add-subagent-trace-tree --strict --no-interactive
```
Expected: dashboard current and OpenSpec valid.

---

## Self-Review Checklist

### Spec coverage
- `shared-schema`: Task 1 covers optional trace-tree attributes and legacy compatibility.
- `agent-runtime`: Tasks 2 and 3 cover subagent start/terminal metadata, sanitization, Java trace posting, and non-blocking failure.
- `backend-gateway`: Task 4 covers ingestion preservation and no Java scheduling responsibility.
- `frontend-runtime`: Task 5 covers tree rendering and flat JSON fallback.
- Verification/dashboard/closeout: Task 6 covers formal checks and project governance.

### Placeholder scan
- No `TBD`, unspecified test commands, or generic “add tests” steps remain.
- Each code-changing task includes concrete files, code shape, commands, and expected outcomes.

### Type consistency
- `TraceTreeAttributesSchema` / `TraceTreeAttributes` originate in `@openharness/shared-schema`.
- `buildSubagentTraceAttributes()` returns `TraceTreeAttributes` and is consumed by TS Runtime trace events.
- Frontend reads fields from `event.data.attributes` with defensive parsing and does not require backend DTO changes.

### Residual risks
- The exact event stream shape exposed to Frontend may require adapting `sendAgentChatStream` if trace events are not currently emitted as SSE `trace` events. If missing, use the existing `tool_result`/`agent_*` event data as bridge only after confirming no sensitive payload is exposed.
- `withTimeout` still uses Promise race and does not hard-cancel the underlying Java request; this plan only improves observability of timeout classification.
