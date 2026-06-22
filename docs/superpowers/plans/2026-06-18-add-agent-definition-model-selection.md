# Agent Definition Model Selection Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make selected `AgentDefinition.model` become the logical `ModelChatRequest.model` sent from TS Runtime to Java model gateway, while preserving default behavior when omitted.

**Architecture:** Keep Java Backend as the owner of model-router configuration, provider adapters, fallback, and credentials. TS Runtime only resolves a logical model id from `input.agentDefinition.model ?? "default"` and places it in the existing model request field. No schema changes are required because `AgentDefinition.model` and `ModelChatRequest.model` already exist.

**Tech Stack:** TypeScript, Fastify, Vitest, pnpm workspace, OpenSpec.

---

## Approved Change Contract

- OpenSpec change: `openspec/changes/add-agent-definition-model-selection/`
- Proposal: `openspec/changes/add-agent-definition-model-selection/proposal.md`
- Design: `openspec/changes/add-agent-definition-model-selection/design.md`
- Spec delta: `openspec/changes/add-agent-definition-model-selection/specs/agent-definition/spec.md`

## File Structure

- Modify: `agent-runtime/test/agentRuntime.test.ts`
  - Add route-level tests for selected custom model forwarding, omitted-model fallback, and forwarding unknown logical model id without TS-side validation.
- Modify: `agent-runtime/src/agentExecutionRunner.ts`
  - Replace hard-coded `model: "default"` with helper-resolved selected logical model.
- Modify: `openspec/changes/add-agent-definition-model-selection/tasks.md`
  - Mark implementation and verification tasks as they complete.
- Create later during closeout only: `docs/design/2026-06-18-add-agent-definition-model-selection-closeout.md`.

No changes planned for:
- `packages/shared-schema/src/index.ts`: both `AgentDefinition.model` and `ModelChatRequest.model` already exist.
- Java Backend model router/provider code.
- Frontend/UI/SDK/YAML/remote CRUD/hot reload/tenant-scoped dynamic definitions.
- Tool filtering, PromptRegistry, ToolRegistry, Java policy, or Java catalog behavior.

## Step Evidence Gate Policy

Use full Step Evidence Gate because this changes a cross-runtime model-call field.

Before each executable task:
1. Re-read this plan, proposal/design/delta, and affected source/test files.
2. Record code facts with `path:line` anchors.
3. Positive checks: current hard-coded model request, Agent Definition schema `model` support, runtime selection tests, and observability metadata tests.
4. Negative search: ensure no Java router/provider credential, frontend, SDK, YAML, CRUD, hot reload, tenant dynamic definition, prompt, or tool filtering changes.
5. Confirm TS Runtime does not validate Java route existence.

Formal verification commands:
- Targeted tests: `pnpm --filter @openharness/agent-runtime test -- agentRuntime`
- Targeted typecheck: `pnpm --filter @openharness/agent-runtime typecheck`
- OpenSpec strict validate: `npx openspec validate add-agent-definition-model-selection --strict --no-interactive`
- Full verification before archive:
  - `pnpm typecheck`
  - `pnpm test`
  - `mvn test -f backend/pom.xml`
  - `npx openspec validate --all --strict --no-interactive`

---

### Task 1: RED runtime tests for Agent Definition model selection

**Files:**
- Modify: `agent-runtime/test/agentRuntime.test.ts`

**Evidence gate before editing:**
- Current hard-coded model call: `agent-runtime/src/agentExecutionRunner.ts:358` sends `model: "default"`.
- Current selected Agent Definition sync test: `agent-runtime/test/agentRuntime.test.ts:285-322`.
- Current default Agent Definition sync test: `agent-runtime/test/agentRuntime.test.ts:324-345`.
- Existing `FakeJavaClient.modelRequests`: `agent-runtime/test/agentRuntime.test.ts:15-20`.
- OpenSpec delta: `openspec/changes/add-agent-definition-model-selection/specs/agent-definition/spec.md`.
- Negative search command:

```bash
rg -n "model-router|ProviderAdapter|provider credential|YAML|SDK|remote CRUD|hot reload|tenant-scoped|Frontend|mcpAllowList" agent-runtime/src agent-runtime/test backend frontend openspec/changes/add-agent-definition-model-selection
```

- [ ] **Step 1: Add selected model forwarding test**

Append this test inside the existing `describe("agent runtime", () => { ... })` block, near the other Agent Definition tests:

```ts
  it("uses selected agent definition model for sync chat model requests", async () => {
    const javaClient = new FakeJavaClient();
    javaClient.chat = async (request: ModelChatRequest, headers: Record<string, string>) => {
      javaClient.modelRequests.push(request);
      javaClient.lastHeaders = headers;
      return {
        requestId: request.requestId,
        conversationId: request.conversationId,
        rawProvider: "mock",
        message: { role: "assistant", content: "done" } as AgentMessage
      };
    };
    const dir = tempAgentDefinitionsDir();
    try {
      writeFileSync(join(dir, "fast-model-agent.json"), JSON.stringify({
        agentId: "fast-model-agent",
        promptRef: "openharness-default@v1",
        tools: ["get_current_time"],
        model: "fast-model"
      }));
      const app = await createServer({ javaClient, disableMcp: true, agentDefinitionsDir: dir });

      const response = await app.inject({
        method: "POST",
        url: "/api/v1/agent/chat",
        headers: { "content-type": "application/json", "x-user-id": "user-001", "x-tenant-id": "tenant-001" },
        payload: { conversationId: "conv-agent-model-selection", message: "hello", agentId: "fast-model-agent" }
      });

      expect(response.statusCode).toBe(200);
      expect(javaClient.modelRequests[0]?.model).toBe("fast-model");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
```

- [ ] **Step 2: Add omitted model fallback assertion**

In the existing `preserves default agent definition when sync chat omits agentId` test, after `expect(response.statusCode).toBe(200);`, add:

```ts
    expect(javaClient.modelRequests[0]?.model).toBe("default");
```

This should continue to pass today and protects compatibility.

- [ ] **Step 3: Add unknown logical model forwarding test**

Append this test near the selected model forwarding test:

```ts
  it("forwards unknown definition model ids to Java without route validation", async () => {
    const javaClient = new FakeJavaClient();
    javaClient.chat = async (request: ModelChatRequest, headers: Record<string, string>) => {
      javaClient.modelRequests.push(request);
      javaClient.lastHeaders = headers;
      return {
        requestId: request.requestId,
        conversationId: request.conversationId,
        rawProvider: "mock",
        message: { role: "assistant", content: "done" } as AgentMessage
      };
    };
    const dir = tempAgentDefinitionsDir();
    try {
      writeFileSync(join(dir, "unknown-model-agent.json"), JSON.stringify({
        agentId: "unknown-model-agent",
        promptRef: "openharness-default@v1",
        tools: ["get_current_time"],
        model: "unknown-logical-model"
      }));
      const app = await createServer({ javaClient, disableMcp: true, agentDefinitionsDir: dir });

      const response = await app.inject({
        method: "POST",
        url: "/api/v1/agent/chat",
        headers: { "content-type": "application/json", "x-user-id": "user-001", "x-tenant-id": "tenant-001" },
        payload: { conversationId: "conv-agent-model-selection-unknown", message: "hello", agentId: "unknown-model-agent" }
      });

      expect(response.statusCode).toBe(200);
      expect(javaClient.modelRequests[0]?.model).toBe("unknown-logical-model");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
```

- [ ] **Step 4: Run runtime RED verification**

Run:

```bash
pnpm --filter @openharness/agent-runtime test -- agentRuntime
```

Expected: selected custom model and unknown logical model tests fail because runtime still sends `model: "default"`; omitted model fallback passes.

---

### Task 2: GREEN runtime model resolution

**Files:**
- Modify: `agent-runtime/src/agentExecutionRunner.ts`

**Evidence gate before editing:**
- Re-read `agent-runtime/src/agentExecutionRunner.ts:342-370`.
- Confirm Task 1 tests fail only because model remains `"default"`.
- Confirm no Java/backend files are in scope.

- [ ] **Step 1: Add minimal helper**

Inside `AgentExecutionRunner`, near Agent Definition helpers, add:

```ts
  private selectedModel(input: AgentExecutionInput): string {
    return input.agentDefinition.model ?? "default";
  }
```

Suggested placement: after `preservesDefaultToolExposure()` or after `agentToolMode()`.

- [ ] **Step 2: Use helper in model request**

Change the model field in `callModel()` from:

```ts
      model: "default",
```

to:

```ts
      model: this.selectedModel(input),
```

- [ ] **Step 3: Run runtime GREEN verification**

Run:

```bash
pnpm --filter @openharness/agent-runtime test -- agentRuntime
```

Expected: all agentRuntime tests pass.

---

### Task 3: Update checklist and run targeted verification

**Files:**
- Modify: `openspec/changes/add-agent-definition-model-selection/tasks.md`

- [ ] **Step 1: Mark TDD tasks complete after evidence exists**

Update:

```md
- [x] 3.1 Add failing runtime tests that selected Agent Definition `model` is sent as `ModelChatRequest.model`.
- [x] 3.2 Add failing runtime tests that omitted `model` preserves default logical model behavior.
- [x] 3.3 Implement minimal runtime model resolution.
```

- [ ] **Step 2: Run targeted verification**

Run:

```bash
pnpm --filter @openharness/agent-runtime test -- agentRuntime && pnpm --filter @openharness/agent-runtime typecheck && npx openspec validate add-agent-definition-model-selection --strict --no-interactive
```

Expected:
- agentRuntime tests pass.
- agent-runtime typecheck passes.
- OpenSpec change is valid.

- [ ] **Step 3: Mark targeted verification complete**

Update:

```md
- [x] 3.4 Run targeted typecheck and tests.
```

---

### Task 4: Full verification, dashboard, archive, closeout

**Files:**
- Modify: `docs/project-dashboard/development-log.json`
- Generated by script only: `docs/project-dashboard/development-log.md`, `docs/project-dashboard/index.html`
- Modify after archive: `openspec/changes/archive/2026-06-18-add-agent-definition-model-selection/tasks.md`
- Create: `docs/design/2026-06-18-add-agent-definition-model-selection-closeout.md`

- [ ] **Step 1: Run full verification**

Run:

```bash
pnpm typecheck && pnpm test && mvn test -f backend/pom.xml && npx openspec validate --all --strict --no-interactive
```

Expected: all pass. If `pnpm test` fails in sandbox with `listen EPERM: operation not permitted 127.0.0.1`, rerun `pnpm test` with approval outside the sandbox. If `mvn test -f backend/pom.xml` fails in sandbox due Mockito/ByteBuddy self-attach, rerun the same command with approval outside the sandbox.

- [ ] **Step 2: Sync dashboard `verified`**

Update the `add-agent-definition-model-selection` entry in `docs/project-dashboard/development-log.json`:
- `status`: `verified`
- `superpowers.plan`: `docs/superpowers/plans/2026-06-18-add-agent-definition-model-selection.md`
- `implementation.sourceFiles`: `agent-runtime/src/agentExecutionRunner.ts`
- `implementation.testFiles`: `agent-runtime/test/agentRuntime.test.ts`
- append targeted and full verification commands/results.

Then run:

```bash
node docs/project-dashboard/scripts/render-dashboard.mjs
```

Expected: generated Markdown/HTML update successfully.

- [ ] **Step 3: Mark verification dashboard tasks complete**

Update active tasks:

```md
- [x] 4.1 Run full verification required by repository rules.
- [x] 4.2 Update development dashboard entry to `verified` after formal verification passes.
```

- [ ] **Step 4: Archive OpenSpec change**

Run:

```bash
npx openspec archive add-agent-definition-model-selection --yes
```

Expected: change archives under `openspec/changes/archive/2026-06-18-add-agent-definition-model-selection/` and current specs update.

- [ ] **Step 5: Create closeout document**

Create `docs/design/2026-06-18-add-agent-definition-model-selection-closeout.md` with:

```md
# Agent Definition Model Selection Closeout

- 文档类型：Closeout / Implementation Record
- 日志及版本：2026-06-18 v1
- OpenSpec change：`add-agent-definition-model-selection`
- Archive path：`openspec/changes/archive/2026-06-18-add-agent-definition-model-selection/`

## 结论

通过。本次变更已完成 TDD 实施、全量验证、OpenSpec 归档与开发导航台同步。

## 核心逻辑

- TS Runtime 使用 selected `AgentDefinition.model ?? "default"` 作为 `ModelChatRequest.model`。
- omitted `model` 保持既有 `default` 逻辑模型。
- unknown logical model id 原样转发给 Java Backend，由 Java model router / fallback 决定后续行为。
- 不移动 provider credentials，不改 Java router/provider adapter。

## 非目标

- Java model router implementation changes。
- Provider credential handling in TS Runtime or Frontend。
- TS-side Java route existence validation。
- SDK、Frontend UI、YAML、Remote CRUD、Hot reload、Tenant-scoped dynamic definitions。

## 验证记录

- `<paste exact commands and pass results>`

## 后续建议

- 如需校验 Agent Definition model 是否存在于 Java model-router，应新建 Java/router-aware OpenSpec change。
- 如需 UI/SDK 配置 agent model，应新建独立 OpenSpec change。
```

- [ ] **Step 6: Mark archive/closeout tasks complete**

Update archived tasks:

```md
- [x] 4.3 Archive the approved change and run strict all-spec validation.
- [x] 4.4 Create closeout design documentation under `docs/design/`.
```

- [ ] **Step 7: Sync dashboard `archived`**

Update `docs/project-dashboard/development-log.json`:
- `status`: `archived`
- OpenSpec paths move to `openspec/changes/archive/2026-06-18-add-agent-definition-model-selection/...`
- `openspec.archivePath`: `openspec/changes/archive/2026-06-18-add-agent-definition-model-selection/`
- `closeout`: `docs/design/2026-06-18-add-agent-definition-model-selection-closeout.md`

Then run:

```bash
node docs/project-dashboard/scripts/render-dashboard.mjs
```

Expected: generated Markdown/HTML update successfully.

- [ ] **Step 8: Final post-archive verification**

Run:

```bash
npx openspec validate --all --strict --no-interactive && npx openspec list
```

Expected:
- all specs pass.
- `npx openspec list` outputs `No active changes found.`

## Self-Review Checklist

- Spec coverage:
  - Selected definition model forwarding covered by Task 1 Step 1 and Task 2.
  - Omitted-model default fallback covered by Task 1 Step 2 and Task 2.
  - Unknown logical model forwarding/no TS validation covered by Task 1 Step 3 and Task 2.
  - Boundaries/non-goals covered by negative searches and no Java/frontend/schema changes.
- Placeholder scan: no implementation step contains TBD/TODO/fill-in placeholders.
- Type consistency:
  - `AgentDefinition.model` remains optional string from existing shared schema.
  - `ModelChatRequest.model` remains existing string field.
  - Helper name `selectedModel()` is used exactly once in `callModel()`.
