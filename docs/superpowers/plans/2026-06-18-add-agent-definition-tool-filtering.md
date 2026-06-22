# Agent Definition Tool Filtering Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make selected `AgentDefinition.tools` constrain the tools visible to the model and block out-of-definition tool calls before policy or execution.

**Architecture:** Keep `ToolRegistry.getFrozenCatalog()` unchanged so catalog freeze, MCP merge, source maps, permissions, catalog version, and catalog hash semantics stay stable. Add a small runtime guard in `AgentExecutionRunner`: derive the model-visible tool list from `input.agentDefinition.tools`, with a compatibility exception for the built-in `default-agent`; validate returned model tool calls against the same selected definition before `beforeToolUse()`.

**Tech Stack:** TypeScript, Fastify, Zod shared schema, Vitest, pnpm workspace, OpenSpec.

---

## Approved Change Contract

- OpenSpec change: `openspec/changes/add-agent-definition-tool-filtering/`
- Proposal: `openspec/changes/add-agent-definition-tool-filtering/proposal.md`
- Design: `openspec/changes/add-agent-definition-tool-filtering/design.md`
- Spec deltas:
  - `openspec/changes/add-agent-definition-tool-filtering/specs/agent-definition/spec.md`
  - `openspec/changes/add-agent-definition-tool-filtering/specs/mcp-tools/spec.md`

## File Structure

- Modify: `agent-runtime/src/agentExecutionRunner.ts`
  - Add helper to derive model-visible tools from `AgentDefinition.tools`.
  - Add helper to validate returned tool calls before `beforeToolUse()`.
  - Use `POLICY_DENY` terminal failure for disallowed tool calls.
- Modify: `agent-runtime/test/agentRuntime.test.ts`
  - Add route-level tests for selected definition filtering, default-agent compatibility, no-tool custom agents, unknown listed tools, and disallowed model tool calls.
- Modify: `openspec/changes/add-agent-definition-tool-filtering/tasks.md`
  - Mark plan/implementation/verification tasks as they complete.
- Create later during closeout only: `docs/design/2026-06-18-add-agent-definition-tool-filtering-closeout.md`.

No changes planned for:
- `agent-runtime/src/toolRegistry.ts`: freeze/source routing stays unchanged.
- Java Backend policy/catalog code.
- Frontend/UI/SDK/YAML/remote CRUD/hot reload.

## Compatibility Decision

`DEFAULT_AGENT_DEFINITION` currently has `agentId: "default-agent"` and `tools: []`. For compatibility, the built-in default definition with an empty `tools` list MUST preserve existing full frozen catalog model visibility. A custom selected definition with `tools: []` MUST expose no model-visible tools.

Implementation rule:

```ts
function preservesDefaultToolExposure(input: AgentExecutionInput): boolean {
  return input.agentDefinition.agentId === "default-agent" && input.agentDefinition.tools.length === 0;
}
```

This rule is intentionally scoped to the built-in default definition identity only.

## Step Evidence Gate Policy

Use full Step Evidence Gate because this changes model-visible tool contract and runtime tool-call eligibility.

For every executable task:
1. Re-read this plan, proposal/design/deltas, and affected source/test files.
2. Record code facts with `path:line` anchors.
3. Positive checks: existing prompt binding/default-agent tests and ToolRegistry freeze/source behavior.
4. Negative search: ensure no Java policy/catalog, Frontend, SDK, YAML, remote CRUD, hot reload, tenant dynamic definition changes.
5. Confirm filtering happens after frozen catalog and before model call / before `beforeToolUse`.

Formal verification commands:
- Targeted tests: `pnpm --filter @openharness/agent-runtime test -- agentRuntime`
- Targeted typecheck: `pnpm --filter @openharness/agent-runtime typecheck`
- OpenSpec strict validate: `npx openspec validate add-agent-definition-tool-filtering --strict --no-interactive`
- Full verification before archive:
  - `pnpm typecheck`
  - `pnpm test`
  - `mvn test -f backend/pom.xml`
  - `npx openspec validate --all --strict --no-interactive`

---

### Task 1: TDD tests for tool filtering behavior

**Files:**
- Modify: `agent-runtime/test/agentRuntime.test.ts`

**Evidence gate before editing:**
- Current model tool payload anchor: `agent-runtime/src/agentExecutionRunner.ts:300` sends `catalog.tools` unchanged.
- Current selected definition input anchor: `agent-runtime/src/agentExecutionRunner.ts:84` carries `agentDefinition`.
- Current default definition anchor: `agent-runtime/src/agentDefinitionLoader.ts:5` uses `default-agent` with `tools: []`.
- Current route-level agent definition tests anchor: `agent-runtime/test/agentRuntime.test.ts:285` onward.
- Negative scope command:

```bash
rg -n "model-router|mcpAllowList|YAML|SDK|remote CRUD|hot reload|tenant-scoped|frontend" agent-runtime/src agent-runtime/test backend frontend openspec/changes/add-agent-definition-tool-filtering
```

- [ ] **Step 1: Add failing route-level tests**

Append these tests inside the existing `describe("agent runtime", () => { ... })` block in `agent-runtime/test/agentRuntime.test.ts`, before the final closing `});`:

```ts
  it("filters model-visible tools by selected agent definition", async () => {
    const javaClient = new FakeJavaClient();
    javaClient.catalog = {
      ...javaClient.catalog,
      tools: [
        ...javaClient.catalog.tools,
        {
          name: "echo",
          description: "Echo input",
          parameters: { type: "object", properties: {}, required: [] },
          catalogVersion: "2026-05-19T10:00:00Z",
          catalogHash: "sha256:p0a-catalog",
          permission: "safe",
          isReadOnly: true,
          isDestructive: false,
          requiresApproval: false,
          isConcurrencySafe: true
        }
      ]
    };
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
      writeFileSync(join(dir, "echo-agent.json"), JSON.stringify({
        agentId: "echo-agent",
        promptRef: "openharness-default@v1",
        tools: ["echo"]
      }));
      const app = await createServer({ javaClient, disableMcp: true, agentDefinitionsDir: dir });

      const response = await app.inject({
        method: "POST",
        url: "/api/v1/agent/chat",
        headers: { "content-type": "application/json", "x-user-id": "user-001", "x-tenant-id": "tenant-001" },
        payload: { conversationId: "conv-agent-tool-filter", message: "hello", agentId: "echo-agent" }
      });

      expect(response.statusCode).toBe(200);
      expect(javaClient.modelRequests[0]?.tools.map(tool => tool.name)).toEqual(["echo"]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("preserves default-agent model-visible tools when agentId is omitted", async () => {
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
    const app = await createServer({ javaClient, disableMcp: true });

    const response = await app.inject({
      method: "POST",
      url: "/api/v1/agent/chat",
      headers: { "content-type": "application/json", "x-user-id": "user-001", "x-tenant-id": "tenant-001" },
      payload: { conversationId: "conv-agent-tool-filter-default", message: "hello" }
    });

    expect(response.statusCode).toBe(200);
    expect(javaClient.modelRequests[0]?.tools.map(tool => tool.name)).toEqual(["get_current_time"]);
  });

  it("exposes no tools for a selected custom agent with an empty tools list", async () => {
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
      writeFileSync(join(dir, "no-tools-agent.json"), JSON.stringify({
        agentId: "no-tools-agent",
        promptRef: "openharness-default@v1",
        tools: []
      }));
      const app = await createServer({ javaClient, disableMcp: true, agentDefinitionsDir: dir });

      const response = await app.inject({
        method: "POST",
        url: "/api/v1/agent/chat",
        headers: { "content-type": "application/json", "x-user-id": "user-001", "x-tenant-id": "tenant-001" },
        payload: { conversationId: "conv-agent-tool-filter-empty", message: "hello", agentId: "no-tools-agent" }
      });

      expect(response.statusCode).toBe(200);
      expect(javaClient.modelRequests[0]?.tools).toEqual([]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("ignores unknown definition tool names for model visibility", async () => {
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
      writeFileSync(join(dir, "unknown-tool-agent.json"), JSON.stringify({
        agentId: "unknown-tool-agent",
        promptRef: "openharness-default@v1",
        tools: ["unknown_tool"]
      }));
      const app = await createServer({ javaClient, disableMcp: true, agentDefinitionsDir: dir });

      const response = await app.inject({
        method: "POST",
        url: "/api/v1/agent/chat",
        headers: { "content-type": "application/json", "x-user-id": "user-001", "x-tenant-id": "tenant-001" },
        payload: { conversationId: "conv-agent-tool-filter-unknown", message: "hello", agentId: "unknown-tool-agent" }
      });

      expect(response.statusCode).toBe(200);
      expect(javaClient.modelRequests[0]?.tools).toEqual([]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("fails closed before policy and execution when model calls a tool outside selected definition", async () => {
    const javaClient = new FakeJavaClient();
    let policyCalls = 0;
    javaClient.evaluatePolicy = async () => {
      policyCalls += 1;
      return { requestId: "unused", conversationId: "unused", decisions: [] };
    };
    const dir = tempAgentDefinitionsDir();
    try {
      writeFileSync(join(dir, "echo-only-agent.json"), JSON.stringify({
        agentId: "echo-only-agent",
        promptRef: "openharness-default@v1",
        tools: ["echo"]
      }));
      const app = await createServer({ javaClient, disableMcp: true, agentDefinitionsDir: dir });

      const response = await app.inject({
        method: "POST",
        url: "/api/v1/agent/chat",
        headers: { "content-type": "application/json", "x-user-id": "user-001", "x-tenant-id": "tenant-001" },
        payload: { conversationId: "conv-agent-tool-filter-deny", message: "hello", agentId: "echo-only-agent" }
      });

      expect(response.statusCode).toBe(200);
      expect(response.json().stopReason).toBe("POLICY_DENY");
      expect(policyCalls).toBe(0);
      expect(javaClient.toolRequests).toHaveLength(0);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
```

- [ ] **Step 2: Run RED test**

Run:

```bash
pnpm --filter @openharness/agent-runtime test -- agentRuntime
```

Expected RED before implementation:
- `filters model-visible tools by selected agent definition` fails because model receives all frozen tools.
- `exposes no tools...` fails because custom `tools: []` still receives all frozen tools.
- `fails closed...` fails because disallowed model tool call proceeds to policy/execute.

---

### Task 2: Implement model-visible tool filtering

**Files:**
- Modify: `agent-runtime/src/agentExecutionRunner.ts`

**Evidence gate before editing:**
- Current `callModel()` sends `catalog.tools` unchanged at `agent-runtime/src/agentExecutionRunner.ts:300`.
- `ToolRegistry.getFrozenCatalog()` remains unchanged.
- Acceptance criteria:
  - selected custom allow-list filters by `tool.name`.
  - custom empty list means `[]`.
  - built-in default-agent empty list preserves current frozen catalog exposure.

- [ ] **Step 1: Add helper functions near private helpers**

Add these methods inside `AgentExecutionRunner` before `callModel()`:

```ts
  private modelVisibleTools(input: AgentExecutionInput, catalog: { tools: unknown[] }): unknown[] {
    if (this.preservesDefaultToolExposure(input)) {
      return catalog.tools;
    }
    const allowed = new Set(input.agentDefinition.tools);
    return catalog.tools.filter((tool) => {
      const name = (tool as { name?: unknown }).name;
      return typeof name === "string" && allowed.has(name);
    });
  }

  private preservesDefaultToolExposure(input: AgentExecutionInput): boolean {
    return input.agentDefinition.agentId === "default-agent" && input.agentDefinition.tools.length === 0;
  }
```

- [ ] **Step 2: Use filtered tools in model request**

In `callModel()`, before `return this.javaClient.chat({`, add:

```ts
    const tools = this.modelVisibleTools(input, catalog);
```

Change:

```ts
      tools: catalog.tools as never,
```

to:

```ts
      tools: tools as never,
```

- [ ] **Step 3: Run targeted tests**

Run:

```bash
pnpm --filter @openharness/agent-runtime test -- agentRuntime
```

Expected after Task 2:
- model-visible filtering tests pass.
- disallowed model tool call test still fails until Task 3.

---

### Task 3: Fail closed on disallowed model tool calls

**Files:**
- Modify: `agent-runtime/src/agentExecutionRunner.ts`

**Evidence gate before editing:**
- Current tool call extraction anchor: `agent-runtime/src/agentExecutionRunner.ts:208`.
- Current `beforeToolUse` call anchor: `agent-runtime/src/agentExecutionRunner.ts:331`.
- Acceptance criteria: disallowed tool calls throw before `beforeToolUse()` and before Java/MCP execution.

- [ ] **Step 1: Add validation helper**

Add inside `AgentExecutionRunner`, near `modelVisibleTools()`:

```ts
  private assertToolCallsAllowed(input: AgentExecutionInput, toolCalls: ToolCall[], stepIndex: number): void {
    if (this.preservesDefaultToolExposure(input)) {
      return;
    }
    const allowed = new Set(input.agentDefinition.tools);
    for (const toolCall of toolCalls) {
      if (!allowed.has(toolCall.name)) {
        throw new RuntimeTerminalFailure(
          "POLICY_DENY",
          `Tool not allowed by agent definition: ${toolCall.name}`,
          {
            stepIndex,
            agentId: input.agentDefinition.agentId,
            toolName: toolCall.name
          }
        );
      }
    }
  }
```

- [ ] **Step 2: Call validation before no-tool branch and before `runToolBatch()`**

After:

```ts
        const toolCalls = resp.message.toolCalls ?? [];
```

add:

```ts
        this.assertToolCallsAllowed(input, toolCalls, stepIndex);
```

This must run before:

```ts
        if (toolCalls.length === 0) {
```

- [ ] **Step 3: Run targeted tests and typecheck**

Run:

```bash
pnpm --filter @openharness/agent-runtime test -- agentRuntime
pnpm --filter @openharness/agent-runtime typecheck
```

Expected:
- `agentRuntime` targeted tests PASS.
- agent-runtime typecheck PASS.

---

### Task 4: OpenSpec task sync and targeted verification

**Files:**
- Modify: `openspec/changes/add-agent-definition-tool-filtering/tasks.md`

**Evidence gate before editing:**
- Confirm no out-of-scope edits:

```bash
rg -n "model-router|mcpAllowList|YAML|SDK|remote CRUD|hot reload|tenant-scoped|frontend" agent-runtime/src agent-runtime/test backend frontend openspec/changes/add-agent-definition-tool-filtering
```

- [ ] **Step 1: Mark proposal/plan/implementation tasks complete**

After targeted tests/typecheck pass, update `openspec/changes/add-agent-definition-tool-filtering/tasks.md`:

```md
## 1. Proposal Gate
- [x] 1.1 Create OpenSpec proposal, design, tasks, and spec deltas.
- [x] 1.2 Validate the change with `npx openspec validate add-agent-definition-tool-filtering --strict --no-interactive`.
- [x] 1.3 Obtain user approval before implementation.

## 2. Implementation Plan Gate
- [x] 2.1 After approval, create `docs/superpowers/plans/2026-06-18-add-agent-definition-tool-filtering.md`.
- [x] 2.2 Include TDD steps, Step Evidence Gate checkpoints, affected files, and verification commands.
- [x] 2.3 Obtain user direction to execute inline or with subagents.

## 3. TDD Implementation
- [x] 3.1 Add failing tests that selected definition tools filter model-visible tools.
- [x] 3.2 Add failing tests that omitted `agentId` preserves default-agent tool exposure.
- [x] 3.3 Add failing tests that `tools: []` exposes no tools for a custom agent.
- [x] 3.4 Add failing tests that disallowed model tool calls fail closed before policy/execute.
- [x] 3.5 Implement minimal runtime changes to pass tests.
- [x] 3.6 Run targeted typecheck and tests.

## 4. Verification And Archive
- [ ] 4.1 Run full verification required by repository rules.
- [ ] 4.2 Update task checklist after implementation is complete.
- [ ] 4.3 Archive the approved change and run strict all-spec validation.
- [ ] 4.4 Create closeout design documentation under `docs/design/`.
```

- [ ] **Step 2: Run strict change validation and targeted checks**

Run:

```bash
npx openspec validate add-agent-definition-tool-filtering --strict --no-interactive
pnpm --filter @openharness/agent-runtime test -- agentRuntime
pnpm --filter @openharness/agent-runtime typecheck
```

Expected:
- OpenSpec change is valid.
- Targeted tests/typecheck PASS.

---

### Task 5: Full verification, archive, and closeout

**Files:**
- Modify: `openspec/changes/add-agent-definition-tool-filtering/tasks.md`
- Create: `docs/design/2026-06-18-add-agent-definition-tool-filtering-closeout.md`
- OpenSpec archive will move: `openspec/changes/add-agent-definition-tool-filtering/` to `openspec/changes/archive/2026-06-18-add-agent-definition-tool-filtering/`
- OpenSpec archive will update:
  - `openspec/specs/agent-definition/spec.md`
  - `openspec/specs/mcp-tools/spec.md`

**Evidence gate before archive:**
- Run `npx openspec list` and verify only `add-agent-definition-tool-filtering` is active.
- Review changed paths for scope drift.

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
- `pnpm test`: PASS. If sandbox blocks localhost listen with `EPERM`, request approved escalated rerun of the same command.
- `mvn test -f backend/pom.xml`: BUILD SUCCESS. If sandbox blocks Mockito/ByteBuddy self-attach, request approved escalated rerun of the same command.
- OpenSpec validation passes.

- [ ] **Step 2: Mark verification complete before archive**

Set `4.1` and `4.2` to `[x]` after full verification passes.

- [ ] **Step 3: Archive**

Run:

```bash
npx openspec archive add-agent-definition-tool-filtering --yes
npx openspec validate --all --strict --no-interactive
npx openspec list
```

Expected:
- Archive path: `openspec/changes/archive/2026-06-18-add-agent-definition-tool-filtering/`.
- All OpenSpec validation passes.
- `npx openspec list` shows `No active changes found.`

- [ ] **Step 4: Create closeout doc**

Create `docs/design/2026-06-18-add-agent-definition-tool-filtering-closeout.md`:

```md
# Agent Definition Tool Filtering Closeout

文档类型：实施收尾记录  
日志及版本：v1 / 2026-06-18 / add-agent-definition-tool-filtering archived

## 结论

通过：`add-agent-definition-tool-filtering` 已完成实现、验证和 OpenSpec 归档。

## 核心逻辑

- TS Runtime 在 ToolRegistry frozen catalog 之后，按 selected `AgentDefinition.tools` 过滤 model-visible tools。
- Built-in `default-agent` 且 `tools: []` 时保留当前默认全量工具暴露。
- Custom selected definition 的 `tools: []` 表示 no-tool agent。
- Definition 中未知工具名不阻塞启动，只是在 frozen catalog 中匹配不到，因此不会发送给模型。
- 模型返回不在 selected definition allow-list 内的 tool call 时，以 `POLICY_DENY` fail closed，且不会进入 `beforeToolUse` 或 Java/MCP execute。

## 非目标确认

- 未修改 Java policy。
- 未修改 Java Tool Catalog。
- 未修改 MCP server discovery/source routing/`MCP_REQUIRE_APPROVAL`。
- 未实现 YAML、SDK、Frontend UI、remote CRUD、hot reload、tenant-scoped dynamic definitions。
- 未改变 Java model router 或 `AgentDefinition.model` 语义。

## 验证记录

- `pnpm --filter @openharness/agent-runtime test -- agentRuntime`：PASS。
- `pnpm --filter @openharness/agent-runtime typecheck`：PASS。
- `pnpm typecheck`：PASS。
- `pnpm test`：PASS。
- `mvn test -f backend/pom.xml`：BUILD SUCCESS。
- `npx openspec validate --all --strict --no-interactive`：PASS。

## 风险与注意事项

- Existing custom definitions with `tools: []` now intentionally become no-tool agents.
- Catalog version/hash continue to refer to the full frozen catalog, not the filtered model-visible subset.
- OpenSpec CLI PostHog telemetry network errors are non-blocking when exit code is 0.

## 后续待办

- 若要把 selected tools 写入 audit metadata 或 trace attributes，需要独立 OpenSpec change。
- 若要做 UI/SDK/remote CRUD/YAML，需要独立 OpenSpec change。
```

- [ ] **Step 5: Mark archived tasks complete**

After archive and closeout, update archived tasks `4.3` and `4.4` to `[x]`.

---

## Self-Review

### Spec coverage
- Selected definition filters tools: Task 1 test + Task 2 implementation.
- Default-agent preserves current exposure: Task 1 test + Task 2 `preservesDefaultToolExposure()`.
- Custom empty tools list exposes no tools: Task 1 test + Task 2 implementation.
- Disallowed model tool call fail closed: Task 1 test + Task 3 implementation.
- Unknown tool name ignored: Task 1 test + Task 2 implementation.
- MCP merge semantics unchanged: no `ToolRegistry` changes; mcp-tools delta only clarifies model-visible filtering after merge.

### Placeholder scan
- No TBD/TODO placeholders.
- Code-changing steps include exact snippets.
- Verification commands are exact.

### Type consistency
- Selected definition field: `input.agentDefinition`.
- Allow-list field: `input.agentDefinition.tools`.
- Terminal error: `POLICY_DENY`.
- Default compatibility predicate: `agentDefinition.agentId === "default-agent" && tools.length === 0`.
