# Agent Definition Observability Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add selected Agent Definition audit metadata to Java model requests and TS Runtime trace events without changing model-visible messages or execution semantics.

**Architecture:** Extend the shared `ModelChatRequest.meta` schema with optional Agent Definition observability fields. In `AgentExecutionRunner.callModel()`, derive bounded audit metadata from `input.agentDefinition` plus the already computed model-visible tool names, and merge it into `meta`. In `AgentExecutionRunner.ev()`, set top-level `TraceEvent.agentId` from the selected definition.

**Tech Stack:** TypeScript, Zod, Vitest, pnpm workspace, OpenSpec.

---

## Approved Change Contract

- OpenSpec change: `openspec/changes/add-agent-definition-observability/`
- Proposal: `openspec/changes/add-agent-definition-observability/proposal.md`
- Design: `openspec/changes/add-agent-definition-observability/design.md`
- Spec deltas:
  - `openspec/changes/add-agent-definition-observability/specs/agent-definition/spec.md`
  - `openspec/changes/add-agent-definition-observability/specs/agent-runtime/spec.md`
  - `openspec/changes/add-agent-definition-observability/specs/shared-schema/spec.md`

## File Structure

- Modify: `packages/shared-schema/src/index.ts`
  - Add `AgentToolModeSchema` or inline enum for `"default_full" | "allow_list"`.
  - Add optional `agentId`, `agentPromptRef`, `agentToolMode`, `agentAllowedTools`, and `modelVisibleTools` fields to `ModelChatRequestMetaSchema`.
- Modify: `packages/shared-schema/test/schema.test.ts`
  - Add tests that metadata parses, omission remains valid, and invalid `agentToolMode` is rejected.
- Modify: `agent-runtime/src/agentExecutionRunner.ts`
  - Add helper to produce Agent Definition audit metadata.
  - Merge metadata into `ModelChatRequest.meta`.
  - Include `agentId` in TS Runtime trace events.
- Modify: `agent-runtime/test/agentRuntime.test.ts`
  - Add route-level tests for selected/default metadata, tool summary metadata, no model-visible metadata pollution, and trace `agentId` attribution.
- Modify: `openspec/changes/add-agent-definition-observability/tasks.md`
  - Mark implementation/verification tasks as they complete.
- Create later during closeout only: `docs/design/2026-06-18-add-agent-definition-observability-closeout.md`.

No changes planned for:
- Java Backend semantic code: DTO accepts map metadata and trace already has `agentId`.
- Frontend/UI/SDK/YAML/remote CRUD/hot reload/tenant-scoped dynamic definitions.
- ToolRegistry freeze/source routing.
- Java policy/catalog/model router behavior.

## Step Evidence Gate Policy

Use full Step Evidence Gate because this changes cross-runtime metadata contracts and trace attribution.

Before each executable task:
1. Re-read this plan, proposal/design/deltas, and the affected source/test files.
2. Record code facts with `path:line` anchors.
3. Positive checks: current prompt metadata, context metadata, trace event schema, and Agent Definition tool filtering tests.
4. Negative search: ensure no frontend, SDK, YAML, CRUD, Java policy/catalog/router, or model-visible message changes.
5. Confirm metadata remains names-only and does not duplicate tool schemas.

Formal verification commands:
- Shared schema targeted: `pnpm --filter @openharness/shared-schema test -- schema`
- Agent runtime targeted: `pnpm --filter @openharness/agent-runtime test -- agentRuntime`
- Targeted typecheck: `pnpm --filter @openharness/shared-schema typecheck && pnpm --filter @openharness/agent-runtime typecheck`
- OpenSpec strict validate: `npx openspec validate add-agent-definition-observability --strict --no-interactive`
- Full verification before archive:
  - `pnpm typecheck`
  - `pnpm test`
  - `mvn test -f backend/pom.xml`
  - `npx openspec validate --all --strict --no-interactive`

---

### Task 1: RED shared-schema tests for Agent Definition metadata

**Files:**
- Modify: `packages/shared-schema/test/schema.test.ts`

**Evidence gate before editing:**
- Current `ModelChatRequestMetaSchema` fields: `packages/shared-schema/src/index.ts:226-235`.
- Existing context metadata tests: `packages/shared-schema/test/schema.test.ts:90-116`.
- Existing prompt metadata tests: `packages/shared-schema/test/schema.test.ts:118-145`.
- Spec delta: `openspec/changes/add-agent-definition-observability/specs/shared-schema/spec.md`.
- Negative search command:

```bash
rg -n "agentToolMode|agentAllowedTools|modelVisibleTools|agentPromptRef" packages/shared-schema agent-runtime backend frontend
```

- [ ] **Step 1: Add failing schema tests**

Insert the following tests after the existing `parses prompt template and model prompt metadata` test in `packages/shared-schema/test/schema.test.ts`:

```ts
  it("parses model chat request agent definition metadata", () => {
    const parsed = ModelChatRequestSchema.parse({
      requestId: "req-001",
      conversationId: "conv-001",
      userId: "user-001",
      tenantId: "tenant-001",
      model: "default",
      stream: false,
      messages: [{ role: "user", content: "hello" }],
      tools: [],
      meta: {
        cacheEnabled: true,
        agentId: "support-agent",
        agentPromptRef: "openharness-default@v1",
        agentToolMode: "allow_list",
        agentAllowedTools: ["echo", "unknown_tool"],
        modelVisibleTools: ["echo"]
      }
    });

    expect(parsed.meta.agentId).toBe("support-agent");
    expect(parsed.meta.agentPromptRef).toBe("openharness-default@v1");
    expect(parsed.meta.agentToolMode).toBe("allow_list");
    expect(parsed.meta.agentAllowedTools).toEqual(["echo", "unknown_tool"]);
    expect(parsed.meta.modelVisibleTools).toEqual(["echo"]);
  });

  it("keeps model chat requests without agent definition metadata valid", () => {
    const parsed = ModelChatRequestSchema.parse({
      requestId: "req-001",
      conversationId: "conv-001",
      userId: "user-001",
      tenantId: "tenant-001",
      model: "default",
      stream: false,
      messages: [{ role: "user", content: "hello" }],
      tools: [],
      meta: { cacheEnabled: true }
    });

    expect(parsed.meta.agentId).toBeUndefined();
    expect(parsed.meta.agentToolMode).toBeUndefined();
  });

  it("rejects invalid agent tool mode metadata", () => {
    expect(() =>
      ModelChatRequestSchema.parse({
        requestId: "req-001",
        conversationId: "conv-001",
        userId: "user-001",
        tenantId: "tenant-001",
        model: "default",
        stream: false,
        messages: [{ role: "user", content: "hello" }],
        tools: [],
        meta: {
          cacheEnabled: true,
          agentToolMode: "full"
        }
      })
    ).toThrow();
  });
```

- [ ] **Step 2: Run schema RED verification**

Run:

```bash
pnpm --filter @openharness/shared-schema test -- schema
```

Expected: fails because `agentId`, `agentPromptRef`, `agentToolMode`, `agentAllowedTools`, and `modelVisibleTools` are not yet present in `ModelChatRequestMetaSchema`.

---

### Task 2: GREEN shared-schema metadata fields

**Files:**
- Modify: `packages/shared-schema/src/index.ts`

**Evidence gate before editing:**
- Re-read `packages/shared-schema/src/index.ts:226-235`.
- Confirm tests from Task 1 are still failing for schema shape only.

- [ ] **Step 1: Add minimal schema fields**

Change `ModelChatRequestMetaSchema` in `packages/shared-schema/src/index.ts` to include the optional Agent Definition metadata fields:

```ts
export const ModelChatRequestMetaSchema = z.object({
  cacheEnabled: z.boolean(),
  cacheHints: z.array(CacheHintSchema).optional(),
  provider: z.string().optional(),
  catalogVersion: z.string().optional(),
  catalogHash: z.string().optional(),
  promptId: z.string().optional(),
  promptVersion: z.string().optional(),
  context: ContextBuildMetaSchema.optional(),
  agentId: z.string().optional(),
  agentPromptRef: z.string().optional(),
  agentToolMode: z.enum(["default_full", "allow_list"]).optional(),
  agentAllowedTools: z.array(z.string()).optional(),
  modelVisibleTools: z.array(z.string()).optional()
});
```

- [ ] **Step 2: Run schema GREEN verification**

Run:

```bash
pnpm --filter @openharness/shared-schema test -- schema
```

Expected: all shared-schema tests pass.

---

### Task 3: RED runtime tests for model request metadata and trace attribution

**Files:**
- Modify: `agent-runtime/test/agentRuntime.test.ts`

**Evidence gate before editing:**
- Current selected prompt metadata test: `agent-runtime/test/agentRuntime.test.ts:285-314`.
- Current default-agent prompt metadata test: `agent-runtime/test/agentRuntime.test.ts:316-332`.
- Current tool filtering tests: `agent-runtime/test/agentRuntime.test.ts:411-557`.
- Trace collection fake client: `agent-runtime/test/agentRuntime.test.ts:91-94`.
- Current metadata creation: `agent-runtime/src/agentExecutionRunner.ts:338-345`.
- Current trace event creation: `agent-runtime/src/agentExecutionRunner.ts:522-532`.
- Negative search command:

```bash
rg -n "frontend|sdk|yaml|remote CRUD|hot reload|model router|mcpAllowList" agent-runtime/src agent-runtime/test packages/shared-schema/src packages/shared-schema/test openspec/changes/add-agent-definition-observability
```

- [ ] **Step 1: Add selected/default metadata assertions**

Update the existing selected sync chat test so its `meta` assertion becomes:

```ts
      expect(javaClient.modelRequests[0]?.meta).toMatchObject({
        promptId: "openharness-default",
        promptVersion: "v1",
        agentId: "support-agent",
        agentPromptRef: "openharness-default@v1",
        agentToolMode: "allow_list",
        agentAllowedTools: ["get_current_time"],
        modelVisibleTools: ["get_current_time"]
      });
```

Update the existing default sync chat test so its `meta` assertion becomes:

```ts
    expect(javaClient.modelRequests[0]?.meta).toMatchObject({
      promptId: "openharness-default",
      promptVersion: "v1",
      agentId: "default-agent",
      agentPromptRef: "openharness-default@v1",
      agentToolMode: "default_full",
      agentAllowedTools: [],
      modelVisibleTools: ["get_current_time"]
    });
```

- [ ] **Step 2: Add tool summary metadata assertion**

In `ignores unknown definition tool names for model visibility`, after `expect(javaClient.modelRequests[0]?.tools).toEqual([]);`, add:

```ts
      expect(javaClient.modelRequests[0]?.meta).toMatchObject({
        agentId: "unknown-tool-agent",
        agentToolMode: "allow_list",
        agentAllowedTools: ["unknown_tool"],
        modelVisibleTools: []
      });
```

- [ ] **Step 3: Add no model-visible metadata pollution assertion**

In `uses selected agent definition prompt metadata for sync chat`, after the metadata assertion, add:

```ts
      expect(javaClient.modelRequests[0]?.messages).not.toContainEqual(expect.objectContaining({
        content: expect.stringContaining("support-agent")
      }));
```

- [ ] **Step 4: Add trace attribution test**

Append this test inside `describe("agent runtime", () => { ... })`:

```ts
  it("adds selected agentId to runtime trace events", async () => {
    const javaClient = new FakeJavaClient();
    const dir = tempAgentDefinitionsDir();
    try {
      writeFileSync(join(dir, "trace-agent.json"), JSON.stringify({
        agentId: "trace-agent",
        promptRef: "openharness-default@v1",
        tools: ["get_current_time"]
      }));
      const app = await createServer({ javaClient, disableMcp: true, agentDefinitionsDir: dir });

      const response = await app.inject({
        method: "POST",
        url: "/api/v1/agent/chat",
        headers: { "content-type": "application/json", "x-user-id": "user-001", "x-tenant-id": "tenant-001" },
        payload: { conversationId: "conv-agent-trace", message: "现在几点？", agentId: "trace-agent" }
      });

      expect(response.statusCode).toBe(200);
      expect(javaClient.traceEvents.length).toBeGreaterThan(0);
      expect(javaClient.traceEvents.every(event => event.agentId === "trace-agent")).toBe(true);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
```

- [ ] **Step 5: Run runtime RED verification**

Run:

```bash
pnpm --filter @openharness/agent-runtime test -- agentRuntime
```

Expected: fails because runtime does not yet emit Agent Definition metadata or trace `agentId`.

---

### Task 4: GREEN runtime observability implementation

**Files:**
- Modify: `agent-runtime/src/agentExecutionRunner.ts`

**Evidence gate before editing:**
- Re-read `agent-runtime/src/agentExecutionRunner.ts:319-347` and `agent-runtime/src/agentExecutionRunner.ts:522-532`.
- Confirm Task 3 tests fail for missing metadata/trace attribution only.

- [ ] **Step 1: Add metadata helper type and helper methods**

Inside `AgentExecutionRunner`, near `modelVisibleTools()` / `preservesDefaultToolExposure()`, add:

```ts
  private agentToolMode(input: AgentExecutionInput): "default_full" | "allow_list" {
    return this.preservesDefaultToolExposure(input) ? "default_full" : "allow_list";
  }

  private agentDefinitionMeta(input: AgentExecutionInput, modelVisibleTools: unknown[]): {
    agentId: string;
    agentPromptRef: string;
    agentToolMode: "default_full" | "allow_list";
    agentAllowedTools: string[];
    modelVisibleTools: string[];
  } {
    return {
      agentId: input.agentDefinition.agentId,
      agentPromptRef: input.agentDefinition.promptRef,
      agentToolMode: this.agentToolMode(input),
      agentAllowedTools: [...input.agentDefinition.tools],
      modelVisibleTools: modelVisibleTools.flatMap((tool) => {
        const name = (tool as { name?: unknown }).name;
        return typeof name === "string" ? [name] : [];
      })
    };
  }
```

- [ ] **Step 2: Merge metadata into model request**

In `callModel()`, after `const tools = this.modelVisibleTools(input, catalog);`, add:

```ts
    const agentDefinitionMeta = this.agentDefinitionMeta(input, tools);
```

Then update `meta` to include the helper output:

```ts
      meta: {
        cacheEnabled: true,
        cacheHints,
        catalogVersion: catalog.catalogVersion,
        catalogHash: catalog.catalogHash,
        ...prompted.meta,
        ...agentDefinitionMeta,
        context: context.meta
      }
```

- [ ] **Step 3: Set trace event agentId**

Update `ev()` in `agent-runtime/src/agentExecutionRunner.ts` to pass `agentId`:

```ts
  private ev(input: AgentExecutionInput, eventType: string, name: string, attributes?: Record<string, unknown>): TraceEvent {
    return traceEvent({
      traceId: input.traceId,
      requestId: input.requestId,
      conversationId: input.conversationId,
      userId: input.userId,
      tenantId: input.tenantId,
      agentId: input.agentDefinition.agentId,
      eventType,
      name,
      attributes
    });
  }
```

- [ ] **Step 4: Run runtime GREEN verification**

Run:

```bash
pnpm --filter @openharness/agent-runtime test -- agentRuntime
```

Expected: all agentRuntime tests pass.

---

### Task 5: Update checklists and run targeted verification

**Files:**
- Modify: `openspec/changes/add-agent-definition-observability/tasks.md`

- [ ] **Step 1: Mark TDD implementation tasks complete after evidence exists**

Update:

```md
- [x] 3.1 Add failing shared-schema tests for agent definition metadata in `ModelChatRequest.meta`.
- [x] 3.2 Add failing runtime tests that selected/default agent model requests include agent metadata and tool summary metadata.
- [x] 3.3 Add failing runtime tests that TS trace events include selected `agentId`.
- [x] 3.4 Implement minimal schema/runtime changes to pass tests.
```

- [ ] **Step 2: Run targeted verification**

Run:

```bash
pnpm --filter @openharness/shared-schema test -- schema && pnpm --filter @openharness/agent-runtime test -- agentRuntime && pnpm --filter @openharness/shared-schema typecheck && pnpm --filter @openharness/agent-runtime typecheck && npx openspec validate add-agent-definition-observability --strict --no-interactive
```

Expected:
- shared-schema tests pass.
- agentRuntime tests pass.
- shared-schema and agent-runtime typecheck pass.
- OpenSpec change is valid.

- [ ] **Step 3: Mark targeted verification complete**

Update:

```md
- [x] 3.5 Run targeted typecheck and tests.
```

---

### Task 6: Full verification, dashboard, archive, closeout

**Files:**
- Modify: `docs/project-dashboard/development-log.json`
- Generated by script only: `docs/project-dashboard/development-log.md`, `docs/project-dashboard/index.html`
- Modify after archive: `openspec/changes/archive/2026-06-18-add-agent-definition-observability/tasks.md`
- Create: `docs/design/2026-06-18-add-agent-definition-observability-closeout.md`

- [ ] **Step 1: Run full verification**

Run:

```bash
pnpm typecheck && pnpm test && mvn test -f backend/pom.xml && npx openspec validate --all --strict --no-interactive
```

Expected: all pass. If `pnpm test` fails in sandbox with `listen EPERM: operation not permitted 127.0.0.1`, rerun `pnpm test` with approval outside the sandbox. If `mvn test -f backend/pom.xml` fails in sandbox due Mockito/ByteBuddy self-attach, rerun the same command with approval outside the sandbox.

- [ ] **Step 2: Sync dashboard `verified`**

Update the `add-agent-definition-observability` entry in `docs/project-dashboard/development-log.json`:
- `status`: `verified`
- `superpowers.plan`: `docs/superpowers/plans/2026-06-18-add-agent-definition-observability.md`
- `implementation.sourceFiles`: `packages/shared-schema/src/index.ts`, `agent-runtime/src/agentExecutionRunner.ts`
- `implementation.testFiles`: `packages/shared-schema/test/schema.test.ts`, `agent-runtime/test/agentRuntime.test.ts`
- append verification commands/results from targeted and full verification.

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
npx openspec archive add-agent-definition-observability --yes
```

Expected: change archives under `openspec/changes/archive/2026-06-18-add-agent-definition-observability/` and current specs update.

- [ ] **Step 5: Create closeout document**

Create `docs/design/2026-06-18-add-agent-definition-observability-closeout.md` with:

```md
# Agent Definition Observability Closeout

- 文档类型：Closeout / Implementation Record
- 日志及版本：2026-06-18 v1
- OpenSpec change：`add-agent-definition-observability`
- Archive path：`openspec/changes/archive/2026-06-18-add-agent-definition-observability/`

## 结论

通过。本次变更已完成 TDD 实施、全量验证、OpenSpec 归档与开发导航台同步。

## 核心逻辑

- `ModelChatRequest.meta` 支持 `agentId`、`agentPromptRef`、`agentToolMode`、`agentAllowedTools`、`modelVisibleTools`。
- Runtime 每次 model call 写入 selected Agent Definition 审计元数据。
- Runtime trace event 顶层 `agentId` 使用 selected definition identity。
- 元数据只记录工具名称摘要，不复制工具 schema，不写入 model-visible messages 或 stable HistoryStore。

## 非目标

- YAML、SDK、Frontend UI、Remote CRUD、Hot reload、Tenant-scoped dynamic definitions。
- Java model router / `AgentDefinition.model` enforcement。
- Java policy、Java catalog、ToolRegistry freeze/routing changes。

## 验证记录

- `<paste exact commands and pass results>`

## 后续建议

- 如需在前端显示 selected agent / tool filtering summary，应新建独立 OpenSpec change。
- 如需 provider/model 路由使用 `AgentDefinition.model`，应新建独立 OpenSpec change。
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
- OpenSpec paths move to `openspec/changes/archive/2026-06-18-add-agent-definition-observability/...`
- `openspec.archivePath`: `openspec/changes/archive/2026-06-18-add-agent-definition-observability/`
- `closeout`: `docs/design/2026-06-18-add-agent-definition-observability-closeout.md`

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
  - `shared-schema` metadata parse/omission/rejection covered by Tasks 1-2.
  - `agent-definition` model request audit metadata/tool summary/non-pollution covered by Tasks 3-4.
  - `agent-runtime` trace attribution covered by Tasks 3-4.
- Placeholder scan: no implementation step contains TBD/TODO/fill-in placeholders.
- Type consistency:
  - `agentToolMode` uses exactly `"default_full" | "allow_list"` in schema, tests, and runtime helper.
  - `agentPromptRef` uses selected `input.agentDefinition.promptRef`.
  - `agentAllowedTools` uses declared definition list; `modelVisibleTools` uses filtered request tools.
