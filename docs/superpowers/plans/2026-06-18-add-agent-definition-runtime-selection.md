# Agent Definition Runtime Selection Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow sync and stream chat requests to optionally select a loaded Agent Definition by `agentId`, then resolve that definition's `promptRef` through the PromptRegistry for model calls.

**Architecture:** Route handlers resolve `agentId` against the already-loaded `AgentDefinitionRegistry` before starting execution. The resolved `AgentDefinition` is carried on the per-turn execution input so the runner can pass `promptRef` into `promptedMessages()`. This slice does not filter tools, does not use `model` as a router override, and does not add YAML/SDK/UI/remote CRUD/hot reload.

**Tech Stack:** TypeScript, Fastify, Vitest, pnpm workspace, OpenSpec.

---

## Approved Change Contract

- OpenSpec change: `openspec/changes/add-agent-definition-runtime-selection/`
- Proposal: `openspec/changes/add-agent-definition-runtime-selection/proposal.md`
- Design: `openspec/changes/add-agent-definition-runtime-selection/design.md`
- Spec deltas:
  - `openspec/changes/add-agent-definition-runtime-selection/specs/agent-definition/spec.md`
  - `openspec/changes/add-agent-definition-runtime-selection/specs/prompt-registry/spec.md`

## File Structure

- Modify: `agent-runtime/src/types.ts`
  - Add optional `agentId?: string` to `AgentChatRequest`.
- Modify: `agent-runtime/src/prompts/registry.ts`
  - Let `promptedMessages(messages, ref?)` resolve an explicit `promptRef`.
  - Preserve `resolvePromptTemplate()` default/env behavior when no explicit ref is passed.
- Modify: `agent-runtime/src/agentExecutionRunner.ts`
  - Add `agentDefinition: AgentDefinition` to `AgentExecutionInput`.
  - Call `promptedMessages(context.messages, input.agentDefinition.promptRef)`.
  - Keep `model: "default"` and keep catalog tools unchanged.
- Modify: `agent-runtime/src/agentStreamLoop.ts`
  - Add `agentDefinition: AgentDefinition` to `StreamInput` so stream execution can pass it to the runner.
- Modify: `agent-runtime/src/server.ts`
  - Resolve selected definition before conflict/execution start for both `/api/v1/agent/chat` and `/api/v1/agent/chat/stream`.
  - Unknown `agentId` returns 400 with structured error and does not start execution.
- Modify: `agent-runtime/test/agentRuntime.test.ts`
  - Add TDD tests for selected definition, omitted agent id, unknown agent id, and unknown promptRef.
- Modify: `openspec/changes/add-agent-definition-runtime-selection/tasks.md`
  - Mark implementation checklist items complete only after evidence passes.
- Create later during closeout only: `docs/design/2026-06-18-add-agent-definition-runtime-selection-closeout.md`.

## Step Evidence Gate Policy

Use full Step Evidence Gate because this change touches public chat request contract and runtime execution semantics.

For every task below, before editing:
1. Re-read this plan task plus the OpenSpec proposal/design/deltas.
2. Record code facts with `path:line` anchors for the current route/runner/prompt/test locations.
3. Run positive checks for existing prompt injection/default behavior.
4. Run negative search for forbidden scope: `tools allow-list`, `model hint router`, `yaml`, `SDK`, `frontend`, `remote CRUD`, `hot reload`.
5. State that tool filtering and model routing are out of scope.

Formal verification commands used across tasks:
- Targeted tests: `pnpm --filter @openharness/agent-runtime test -- agentRuntime`
- Targeted typecheck: `pnpm --filter @openharness/agent-runtime typecheck`
- OpenSpec strict validate: `npx openspec validate add-agent-definition-runtime-selection --strict --no-interactive`
- Full verification before archive:
  - `pnpm typecheck`
  - `pnpm test`
  - `mvn test -f backend/pom.xml`
  - `npx openspec validate --all --strict --no-interactive`

---

### Task 1: TDD tests for runtime selection and prompt binding

**Files:**
- Modify: `agent-runtime/test/agentRuntime.test.ts`

**Evidence gate before editing:**
- Review entry points:
  - `agent-runtime/src/server.ts:121` sync chat route starts execution without agent definition selection.
  - `agent-runtime/src/server.ts:166` stream chat route starts execution without agent definition selection.
  - `agent-runtime/src/agentExecutionRunner.ts:75` execution input lacks selected definition.
  - `agent-runtime/src/prompts/registry.ts:34` `promptedMessages()` cannot accept per-turn prompt ref.
- Positive check command: `rg -n "promptId|promptVersion|agentDefinitionsDir|agentDefinitionRegistry" agent-runtime/test/agentRuntime.test.ts agent-runtime/src`
- Negative scope command: `rg -n "allow-list|tools.*filter|model.*router|yaml|SDK|remote CRUD|hot reload" agent-runtime/src agent-runtime/test openspec/changes/add-agent-definition-runtime-selection`

- [ ] **Step 1: Add failing tests**

Append these tests inside the existing `describe("agent runtime", () => { ... })` block in `agent-runtime/test/agentRuntime.test.ts`, before the final closing `});`:

```ts
  it("uses selected agent definition prompt metadata for sync chat", async () => {
    const javaClient = new FakeJavaClient();
    const dir = tempAgentDefinitionsDir();
    try {
      writeFileSync(join(dir, "support.json"), JSON.stringify({
        agentId: "support-agent",
        promptRef: "openharness-default@v1",
        tools: ["get_current_time"]
      }));
      const app = await createServer({ javaClient, disableMcp: true, agentDefinitionsDir: dir });

      const response = await app.inject({
        method: "POST",
        url: "/api/v1/agent/chat",
        headers: { "content-type": "application/json", "x-user-id": "user-001", "x-tenant-id": "tenant-001" },
        payload: { conversationId: "conv-agent-selection", message: "hello", agentId: "support-agent" }
      });

      expect(response.statusCode).toBe(200);
      expect(javaClient.modelRequests[0]?.messages[0]).toMatchObject({
        role: "system"
      });
      expect(javaClient.modelRequests[0]?.meta).toMatchObject({
        promptId: "openharness-default",
        promptVersion: "v1"
      });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("preserves default agent definition when sync chat omits agentId", async () => {
    const javaClient = new FakeJavaClient();
    const app = await createServer({ javaClient, disableMcp: true });

    const response = await app.inject({
      method: "POST",
      url: "/api/v1/agent/chat",
      headers: { "content-type": "application/json", "x-user-id": "user-001", "x-tenant-id": "tenant-001" },
      payload: { conversationId: "conv-agent-selection-default", message: "hello" }
    });

    expect(response.statusCode).toBe(200);
    expect(javaClient.modelRequests[0]?.meta).toMatchObject({
      promptId: "openharness-default",
      promptVersion: "v1"
    });
  });

  it("rejects unknown agentId before sync execution starts", async () => {
    const javaClient = new FakeJavaClient();
    const app = await createServer({ javaClient, disableMcp: true });

    const response = await app.inject({
      method: "POST",
      url: "/api/v1/agent/chat",
      headers: { "content-type": "application/json", "x-user-id": "user-001", "x-tenant-id": "tenant-001" },
      payload: { conversationId: "conv-agent-selection-missing", message: "hello", agentId: "missing-agent" }
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({
      error: {
        errorClass: "AGENT_DEFINITION_NOT_FOUND",
        errorMessage: "Unknown agentId: missing-agent"
      }
    });
    expect(javaClient.catalogCalls).toBe(0);
    expect(javaClient.modelRequests).toHaveLength(0);
  });

  it("fails closed before Java model call when selected promptRef is unknown", async () => {
    const javaClient = new FakeJavaClient();
    const dir = tempAgentDefinitionsDir();
    try {
      writeFileSync(join(dir, "unknown-prompt.json"), JSON.stringify({
        agentId: "unknown-prompt-agent",
        promptRef: "missing-prompt@v1",
        tools: []
      }));
      const app = await createServer({ javaClient, disableMcp: true, agentDefinitionsDir: dir });

      const response = await app.inject({
        method: "POST",
        url: "/api/v1/agent/chat",
        headers: { "content-type": "application/json", "x-user-id": "user-001", "x-tenant-id": "tenant-001" },
        payload: { conversationId: "conv-agent-selection-bad-prompt", message: "hello", agentId: "unknown-prompt-agent" }
      });

      expect(response.statusCode).toBe(200);
      expect(response.json().stopReason).toBe("MODEL_ERROR");
      expect(javaClient.modelRequests).toHaveLength(0);
      expect(javaClient.catalogCalls).toBe(1);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
```

- [ ] **Step 2: Run test to verify RED**

Run:

```bash
pnpm --filter @openharness/agent-runtime test -- agentRuntime
```

Expected RED before implementation:
- TypeScript/Vitest failure because `agentId` is not part of runtime selection and/or selected definitions are not passed to `promptedMessages()`.
- At least the unknown `agentId` test should fail with status 200 instead of 400 or model/catalog calls being made.

- [ ] **Step 3: Sign off Task 1 evidence**

Record in the final response or implementation notes:
- RED command output summary.
- Confirmation that only `agent-runtime/test/agentRuntime.test.ts` changed.
- No code behavior implemented yet.

---

### Task 2: Add per-turn promptRef support in PromptRegistry and execution input

**Files:**
- Modify: `agent-runtime/src/prompts/registry.ts`
- Modify: `agent-runtime/src/agentExecutionRunner.ts`
- Modify: `agent-runtime/src/agentStreamLoop.ts`
- Modify: `agent-runtime/src/types.ts`

**Evidence gate before editing:**
- Current prompt injection anchor: `agent-runtime/src/prompts/registry.ts:34` resolves no explicit ref.
- Current model-call anchor: `agent-runtime/src/agentExecutionRunner.ts:287` calls `promptedMessages(context.messages)`.
- Current stream input anchor: `agent-runtime/src/agentStreamLoop.ts:6` mirrors runner input without `agentDefinition`.
- Current chat request type anchor: `agent-runtime/src/types.ts:46` lacks `agentId`.
- Negative search must confirm no changes to ToolRegistry filtering or Java model router.

- [ ] **Step 1: Update PromptRegistry**

Change `agent-runtime/src/prompts/registry.ts` so `promptedMessages` accepts an explicit prompt reference:

```ts
export function promptedMessages(messages: AgentMessage[], ref?: string): { messages: AgentMessage[]; meta: PromptSelectionMeta } {
  const prompt = resolvePromptTemplate(ref);
  return {
    messages: [
      { role: prompt.role, content: prompt.content },
      ...messages
    ],
    meta: {
      promptId: prompt.promptId,
      promptVersion: prompt.version
    }
  };
}
```

Do not change `resolvePromptTemplate(ref = process.env.OPENHARNESS_PROMPT_REF ?? DEFAULT_PROMPT_REF)`.

- [ ] **Step 2: Add AgentDefinition to execution and stream input types**

In `agent-runtime/src/agentExecutionRunner.ts`, add the import:

```ts
import type { AgentDefinition } from "@openharness/shared-schema";
```

Add this field to `AgentExecutionInput`:

```ts
  agentDefinition: AgentDefinition;
```

In `agent-runtime/src/agentStreamLoop.ts`, add the import:

```ts
import type { AgentDefinition } from "@openharness/shared-schema";
```

Add this field to `StreamInput`:

```ts
  agentDefinition: AgentDefinition;
```

In `agent-runtime/src/types.ts`, update `AgentChatRequest`:

```ts
export interface AgentChatRequest {
  conversationId: string;
  message: string;
  agentId?: string;
  stepBudget?: number;
}
```

- [ ] **Step 3: Bind selected definition promptRef in model calls**

In `agent-runtime/src/agentExecutionRunner.ts`, change:

```ts
const prompted = promptedMessages(context.messages);
```

to:

```ts
const prompted = promptedMessages(context.messages, input.agentDefinition.promptRef);
```

Do not change:

```ts
model: "default",
tools: catalog.tools as never,
```

- [ ] **Step 4: Run targeted typecheck expecting route compile errors until Task 3**

Run:

```bash
pnpm --filter @openharness/agent-runtime typecheck
```

Expected after Task 2 and before route wiring:
- FAIL because `runner.start({ ... })` / `streamLoop.stream({ ... })` calls in `server.ts` do not yet provide `agentDefinition`.

---

### Task 3: Resolve agentId in sync and stream routes

**Files:**
- Modify: `agent-runtime/src/server.ts`

**Evidence gate before editing:**
- Route registry anchor: `agent-runtime/src/server.ts:73` creates `agentDefinitionRegistry`.
- Sync route anchor: `agent-runtime/src/server.ts:121`.
- Stream route anchor: `agent-runtime/src/server.ts:166`.
- Acceptance criteria:
  - Unknown `agentId` returns 400 and no execution starts.
  - Omitted `agentId` resolves `default-agent` from the registry.
  - Both sync and stream pass `agentDefinition` to execution.

- [ ] **Step 1: Add a local selection helper**

Insert near `activeConflict` in `agent-runtime/src/server.ts`:

```ts
  const selectAgentDefinition = (agentId?: string) => {
    const selectedAgentId = agentId ?? "default-agent";
    const definition = agentDefinitionRegistry.get(selectedAgentId);
    if (!definition) {
      return {
        error: {
          errorClass: "AGENT_DEFINITION_NOT_FOUND",
          errorMessage: `Unknown agentId: ${selectedAgentId}`
        }
      };
    }
    return { definition };
  };
```

Rationale: default-agent is the loader's default definition id. This remains a local deterministic selection, not remote lookup.

- [ ] **Step 2: Wire sync route before conflict/execution start**

In the sync route, after `javaHeaders` and before `activeConflict`, add:

```ts
    const selectedAgent = selectAgentDefinition(body.agentId);
    if ("error" in selectedAgent) {
      reply.status(400).send({ error: selectedAgent.error });
      return;
    }
```

Then add this property to `runner.start({ ... })`:

```ts
      agentDefinition: selectedAgent.definition,
```

- [ ] **Step 3: Wire stream route before conflict/execution start**

In the stream route, after `javaHeaders` and before `activeConflict`, add:

```ts
    const selectedAgent = selectAgentDefinition(body.agentId);
    if ("error" in selectedAgent) {
      reply.status(400).send({ error: selectedAgent.error });
      return;
    }
```

Then add this property to `streamLoop.stream({ ... })`:

```ts
      agentDefinition: selectedAgent.definition,
```

- [ ] **Step 4: Run targeted tests and typecheck**

Run:

```bash
pnpm --filter @openharness/agent-runtime test -- agentRuntime
pnpm --filter @openharness/agent-runtime typecheck
```

Expected:
- `agentRuntime` targeted tests PASS.
- `agent-runtime` typecheck PASS.

---

### Task 4: Add stream-route coverage for selected agent definition

**Files:**
- Modify: `agent-runtime/test/agentRuntime.test.ts`

**Evidence gate before editing:**
- Stream route anchor: `agent-runtime/src/server.ts:166`.
- Stream adapter anchor: `agent-runtime/src/agentStreamLoop.ts:28` starts runner from `StreamInput`.
- Existing stream tests are spread across `detachedStream.test.ts`, `streamEventIds.test.ts`, etc.; this task keeps one route-level contract assertion in `agentRuntime.test.ts` to prevent sync/stream divergence.

- [ ] **Step 1: Add stream selection test**

Append inside `describe("agent runtime", () => { ... })`:

```ts
  it("uses selected agent definition prompt metadata for stream chat", async () => {
    const javaClient = new FakeJavaClient();
    const dir = tempAgentDefinitionsDir();
    try {
      writeFileSync(join(dir, "stream-support.json"), JSON.stringify({
        agentId: "stream-support-agent",
        promptRef: "openharness-default@v1",
        tools: ["get_current_time"]
      }));
      const app = await createServer({ javaClient, disableMcp: true, agentDefinitionsDir: dir });

      const response = await app.inject({
        method: "POST",
        url: "/api/v1/agent/chat/stream",
        headers: { "content-type": "application/json", "x-user-id": "user-001", "x-tenant-id": "tenant-001" },
        payload: { conversationId: "conv-agent-selection-stream", message: "hello", agentId: "stream-support-agent" }
      });

      expect(response.statusCode).toBe(200);
      expect(javaClient.modelRequests[0]?.meta).toMatchObject({
        promptId: "openharness-default",
        promptVersion: "v1"
      });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
```

- [ ] **Step 2: Run targeted stream/sync tests**

Run:

```bash
pnpm --filter @openharness/agent-runtime test -- agentRuntime
```

Expected:
- PASS, including new stream selection test.

---

### Task 5: OpenSpec/task sync and targeted verification

**Files:**
- Modify: `openspec/changes/add-agent-definition-runtime-selection/tasks.md`

**Evidence gate before editing:**
- Ensure implementation did not touch Frontend, SDK, YAML parser, Java router, or ToolRegistry filtering.
- Negative search command:

```bash
rg -n "filter.*tools|tools.*filter|allow-list|model.*router|YAML|yaml|SDK|remote CRUD|hot reload|tenant-scoped" agent-runtime/src agent-runtime/test packages frontend backend openspec/changes/add-agent-definition-runtime-selection
```

- [ ] **Step 1: Mark completed implementation tasks**

After tests pass, update `openspec/changes/add-agent-definition-runtime-selection/tasks.md`:

```md
## 1. Proposal Gate
- [x] 1.1 Create OpenSpec proposal, design, tasks, and spec deltas.
- [x] 1.2 Validate the change with `npx openspec validate add-agent-definition-runtime-selection --strict --no-interactive`.
- [x] 1.3 Obtain user approval before implementation.

## 2. Implementation Plan Gate
- [x] 2.1 After approval, create `docs/superpowers/plans/2026-06-18-add-agent-definition-runtime-selection.md`.
- [x] 2.2 Include TDD steps, Step Evidence Gate checkpoints, affected files, and verification commands.
- [x] 2.3 Obtain user direction to execute inline or with subagents.

## 3. TDD Implementation
- [x] 3.1 Add failing tests for optional `agentId` selecting a loaded definition and prompt metadata.
- [x] 3.2 Add failing tests for omitted `agentId` preserving default behavior.
- [x] 3.3 Add failing tests for unknown `agentId` failing before execution/model calls.
- [x] 3.4 Add failing tests for unknown selected `promptRef` failing before Java model calls.
- [x] 3.5 Implement minimal runtime changes to pass tests.
- [x] 3.6 Run targeted typecheck and tests.

## 4. Verification And Archive
- [ ] 4.1 Run full verification required by repository rules.
- [ ] 4.2 Update task checklist after implementation is complete.
- [ ] 4.3 Archive the approved change and run strict all-spec validation.
- [ ] 4.4 Create closeout design documentation under `docs/design/`.
```

Only mark `4.x` after full verification/archive/closeout actually happen.

- [ ] **Step 2: Run strict change validation**

Run:

```bash
npx openspec validate add-agent-definition-runtime-selection --strict --no-interactive
```

Expected:
- `Change 'add-agent-definition-runtime-selection' is valid`.
- PostHog telemetry network errors are non-blocking if exit code is 0.

- [ ] **Step 3: Run targeted verification**

Run:

```bash
pnpm --filter @openharness/agent-runtime test -- agentRuntime
pnpm --filter @openharness/agent-runtime typecheck
```

Expected:
- Both PASS.

---

### Task 6: Full verification, archive, and closeout

**Files:**
- Modify: `openspec/changes/add-agent-definition-runtime-selection/tasks.md`
- Create: `docs/design/2026-06-18-add-agent-definition-runtime-selection-closeout.md`
- OpenSpec archive will move: `openspec/changes/add-agent-definition-runtime-selection/` to `openspec/changes/archive/2026-06-18-add-agent-definition-runtime-selection/`
- OpenSpec archive will update:
  - `openspec/specs/agent-definition/spec.md`
  - `openspec/specs/prompt-registry/spec.md`

**Evidence gate before editing/archive:**
- Confirm no active unrelated changes are being archived.
- Run `npx openspec list` and verify only `add-agent-definition-runtime-selection` is active.
- Review `git diff --stat` for scope drift.

- [ ] **Step 1: Run full verification**

Run:

```bash
pnpm typecheck
pnpm test
mvn test -f backend/pom.xml
npx openspec validate --all --strict --no-interactive
```

Expected:
- `pnpm typecheck`: PASS.
- `pnpm test`: PASS; if sandbox blocks localhost listen with `EPERM`, request approved escalated rerun of the same command.
- `mvn test -f backend/pom.xml`: BUILD SUCCESS.
- `npx openspec validate --all --strict --no-interactive`: all specs/changes pass.

- [ ] **Step 2: Mark task checklist complete through verification**

Set `openspec/changes/add-agent-definition-runtime-selection/tasks.md` `4.1` and `4.2` to `[x]` only after full verification passes and checklist reflects reality.

- [ ] **Step 3: Archive the change**

Run:

```bash
npx openspec archive add-agent-definition-runtime-selection --yes
npx openspec validate --all --strict --no-interactive
npx openspec list
```

Expected:
- Archive path: `openspec/changes/archive/2026-06-18-add-agent-definition-runtime-selection/`.
- All OpenSpec validation passes.
- `npx openspec list` shows `No active changes found.`

- [ ] **Step 4: Create closeout documentation**

Create `docs/design/2026-06-18-add-agent-definition-runtime-selection-closeout.md`:

```md
# Agent Definition Runtime Selection Closeout

文档类型：实施收尾记录  
日志及版本：v1 / 2026-06-18 / add-agent-definition-runtime-selection archived

## 结论

通过：`add-agent-definition-runtime-selection` 已完成实现、验证和 OpenSpec 归档。

## 核心逻辑

- `/api/v1/agent/chat` 和 `/api/v1/agent/chat/stream` 支持可选 `agentId`。
- TS Runtime 在 route handler 中从已加载 `AgentDefinitionRegistry` 解析 selected definition。
- 未传 `agentId` 时选择 `default-agent`，保持既有默认行为。
- 未知 `agentId` 返回 `AGENT_DEFINITION_NOT_FOUND`，不会启动 execution 或调用 Java model gateway。
- `AgentExecutionInput` 携带 resolved `AgentDefinition`，model call 使用 `agentDefinition.promptRef` 调用 `PromptRegistry`。
- 未知 `promptRef` 在 Java `/api/v1/model/chat` 前 fail closed。

## 非目标确认

- 未实现 tools allow-list enforcement / filtering。
- 未实现 YAML、SDK、Frontend UI、remote CRUD API、hot reload、tenant-scoped dynamic definitions。
- 未改变 Java model router 或 `AgentDefinition.model` 语义。

## 验证记录

- `pnpm --filter @openharness/agent-runtime test -- agentRuntime`：PASS。
- `pnpm --filter @openharness/agent-runtime typecheck`：PASS。
- `pnpm typecheck`：PASS。
- `pnpm test`：PASS。
- `mvn test -f backend/pom.xml`：BUILD SUCCESS。
- `npx openspec validate --all --strict --no-interactive`：PASS。

## 风险与注意事项

- `tools` 字段仍是 definition metadata，不等于 policy enforcement。
- `model` 字段仍是 metadata/hint，不影响 Java model router。
- OpenSpec CLI PostHog telemetry 网络错误为非阻塞噪声，以命令 exit code 和 valid/pass 输出为准。

## 后续待办

- 若要按 definition `tools` 过滤 ToolRegistry，需要新建独立 OpenSpec change。
- 若要支持 YAML、SDK、UI、remote CRUD、hot reload 或 tenant-scoped dynamic definitions，需要分别新建后续 change。
```

- [ ] **Step 5: Final response evidence**

Final response must include:
- Changed files.
- Verification commands and observed results.
- Archive path.
- `npx openspec list` active status.
- Remaining risks/non-goals.

---

## Self-Review

### Spec coverage
- Agent Definition Runtime Selection / omitted `agentId`: Task 1 default test + Task 3 route helper.
- Requested `agentId`: Task 1 sync test + Task 4 stream test + Task 3 route wiring.
- Unknown `agentId`: Task 1 test + Task 3 400 fail-closed path.
- Agent Definition Prompt Binding: Task 2 `promptedMessages(..., promptRef)` + Task 1 metadata assertion.
- Unknown selected prompt: Task 1 test + existing PromptRegistry fail-closed behavior reused in Task 2.
- Prompt Registry explicit ref: Task 2.

### Placeholder scan
- No `TBD`, `TODO`, or unspecified “handle edge cases” placeholders.
- All code-changing steps include concrete snippets.
- All verification steps include exact commands and expected outcomes.

### Type consistency
- Request payload field: `agentId`.
- Loaded definition field: `agentDefinition`.
- Prompt field: `promptRef`.
- Error class: `AGENT_DEFINITION_NOT_FOUND`.
