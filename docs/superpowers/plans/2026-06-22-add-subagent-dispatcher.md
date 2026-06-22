# Add Subagent Dispatcher Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **Project override:** Do **not** run `git add`, `git commit`, or `npx openspec archive`. Commits and archive require explicit user approval.

**Goal:** Implement isolated subagent dispatch for `fork_agent: true` skills so the parent Agent receives only a summary tool result while child tools, history, cancellation, timeout, model selection, and usage/cost attribution remain controlled.

**Architecture:** Add a focused `SubagentDispatcher` in `agent-runtime/src/subagent/dispatcher.ts`. The dispatcher derives a downgraded child tool catalog from the parent frozen catalog, blocks `forbidden_tools` and privileged meta tools, runs a bounded child model/tool loop with child attribution, and returns a structured summary to `AgentExecutionRunner`. `AgentExecutionRunner` remains the parent loop owner and routes `invoke_skill` to either pending injection (`fork_agent !== true`) or dispatcher (`fork_agent === true`).

**Tech Stack:** TypeScript, Vitest, existing `JavaClient`, `HistoryStore`, `ToolRegistry`, `beforeToolUse`, `AgentExecutionRunner`, OpenSpec.

---

## Scope and file map

### Create
- `agent-runtime/src/subagent/dispatcher.ts` — owns child execution identity, child catalog downgrade, child model/tool loop, usage aggregation, timeout/abort handling, and summary result shape.
- `agent-runtime/test/subagentDispatcher.test.ts` — unit tests for tool downgrade, forbidden tool rejection, privileged meta tool filtering, logical model forwarding, usage aggregation, and abort/timeout behavior.
- `docs/agent-collab/add-subagent-dispatcher/01-brief.md` — first Antigravity CLI implementation brief.

### Modify
- `agent-runtime/src/agentExecutionRunner.ts` — construct/use `SubagentDispatcher`; in `executeTool()` route `skill.metadata.fork_agent === true` to dispatcher; keep non-fork pending injection unchanged.
- `agent-runtime/src/types.ts` — add `SUBAGENT_TIMEOUT`, `SUBAGENT_ABORTED`, and `SUBAGENT_POLICY_DENY` only if implementation needs typed terminal classes. Prefer keeping new child-only classes internal to dispatcher if parent `RuntimeTerminalError` need not change.
- `agent-runtime/test/agentExecutionRunner.test.ts` — add fork-skill integration regression proving parent history isolation.
- `openspec/changes/add-subagent-dispatcher/tasks.md` — check boxes only after evidence passes.
- `docs/project-dashboard/development-log.json` — update to `verified` only after implementation and formal verification pass.

### Do not modify in implementation steps unless Codex emits a new Brief
- `AGENTS.md`
- `openspec/changes/add-subagent-dispatcher/proposal.md`
- `openspec/changes/add-subagent-dispatcher/design.md`
- `openspec/changes/add-subagent-dispatcher/specs/**/spec.md`
- `README.md`

---

## Task 1: SubagentDispatcher public contract and TDD tests

**Files:**
- Create: `agent-runtime/test/subagentDispatcher.test.ts`
- Create: `agent-runtime/src/subagent/dispatcher.ts`

- [ ] **Step 1.1: Write failing tests for catalog downgrade and meta-tool filtering**

Create `agent-runtime/test/subagentDispatcher.test.ts` with this initial content:

```ts
import { describe, expect, it } from "vitest";
import type { AgentMessage, CatalogResponse, ModelChatRequest, ToolCallRequest, TraceEvent } from "../src/types";
import type { JavaClient, PolicyEvaluateRequest, PolicyEvaluateResponse } from "../src/javaClient";
import { SubagentDispatcher } from "../src/subagent/dispatcher";

class FakeSubagentJavaClient implements JavaClient {
  chatRequests: ModelChatRequest[] = [];
  executedTools: ToolCallRequest[] = [];
  policyRequests: PolicyEvaluateRequest[] = [];

  async getCatalog(): Promise<CatalogResponse> {
    return { catalogVersion: "v1", catalogHash: "h1", tools: [] };
  }

  async chat(request: ModelChatRequest) {
    this.chatRequests.push(request);
    return {
      requestId: request.requestId,
      conversationId: request.conversationId,
      rawProvider: "mock",
      usage: { costUsdMicros: 7 },
      message: { role: "assistant", content: "child summary" } as AgentMessage
    };
  }

  async executeTool(request: ToolCallRequest) {
    this.executedTools.push(request);
    return {
      requestId: request.requestId,
      conversationId: request.conversationId,
      toolCallId: request.toolCallId,
      toolName: request.toolName,
      status: "ok" as const,
      result: { ok: true }
    };
  }

  async postTrace(_event: TraceEvent) {}

  async evaluatePolicy(req: PolicyEvaluateRequest): Promise<PolicyEvaluateResponse> {
    this.policyRequests.push(req);
    return {
      requestId: req.requestId,
      conversationId: req.conversationId,
      decisions: req.toolCalls.map(tc => ({ toolCallId: tc.id, decision: "ALLOW" }))
    };
  }
}

const parentCatalog: CatalogResponse = {
  catalogVersion: "v1",
  catalogHash: "h1",
  tools: [
    {
      name: "read_file",
      description: "Read file",
      parameters: { type: "object", properties: {}, required: [] },
      catalogVersion: "v1",
      catalogHash: "h1",
      permission: "safe",
      isReadOnly: true,
      isDestructive: false,
      requiresApproval: false,
      isConcurrencySafe: true
    },
    {
      name: "run_command",
      description: "Run command",
      parameters: { type: "object", properties: {}, required: [] },
      catalogVersion: "v1",
      catalogHash: "h1",
      permission: "destructive",
      isReadOnly: false,
      isDestructive: true,
      requiresApproval: true,
      isConcurrencySafe: false
    },
    {
      name: "invoke_skill",
      description: "Invoke skill",
      parameters: { type: "object", properties: {}, required: [] },
      catalogVersion: "v1",
      catalogHash: "h1",
      permission: "sensitive",
      isReadOnly: false,
      isDestructive: false,
      requiresApproval: true,
      isConcurrencySafe: true
    }
  ]
};

describe("SubagentDispatcher", () => {
  it("derives child catalog by removing forbidden tools and privileged meta tools", async () => {
    const javaClient = new FakeSubagentJavaClient();
    const dispatcher = new SubagentDispatcher(javaClient);

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
          fork_agent: true,
          forbidden_tools: ["run_command"]
        },
        content: "Use available tools and summarize.",
        sourcePath: "/tmp/worker-skill/SKILL.md"
      },
      task: "summarize files",
      parentCatalog,
      timeoutMs: 30_000
    });

    expect(result.status).toBe("ok");
    const childTools = javaClient.chatRequests[0].tools?.map(tool => tool.name) ?? [];
    expect(childTools).toContain("read_file");
    expect(childTools).not.toContain("run_command");
    expect(childTools).not.toContain("invoke_skill");
  });
});
```

- [ ] **Step 1.2: Run the focused test and confirm RED**

Run:

```bash
pnpm --filter @openharness/agent-runtime test -- subagentDispatcher
```

Expected: FAIL because `../src/subagent/dispatcher` does not exist.

- [ ] **Step 1.3: Add minimal dispatcher types and catalog downgrade implementation**

Create `agent-runtime/src/subagent/dispatcher.ts`:

```ts
import type { JavaClient } from "../javaClient";
import type { CatalogResponse, ToolDefinition } from "../types";
import type { Skill } from "../skills/types";

const PRIVILEGED_META_TOOLS = new Set(["invoke_skill"]);

export interface SubagentParentContext {
  executionId: string;
  tenantId: string;
  conversationId: string;
  requestId: string;
  traceId: string;
  userId: string;
  headers: Record<string, string>;
  abortSignal: AbortSignal;
}

export interface SubagentRunInput {
  parent: SubagentParentContext;
  toolCallId: string;
  skill: Skill;
  task: string;
  parentCatalog: CatalogResponse;
  timeoutMs: number;
}

export interface SubagentRunResult {
  status: "ok" | "error";
  summary: string;
  childExecutionId: string;
  childConversationId: string;
  usage?: { costUsdMicros?: number };
  errorClass?: "SUBAGENT_ABORTED" | "SUBAGENT_TIMEOUT" | "SUBAGENT_POLICY_DENY" | "SUBAGENT_TOOL_ERROR" | "SUBAGENT_MODEL_ERROR";
  errorMessage?: string;
}

export class SubagentDispatcher {
  constructor(private readonly javaClient: JavaClient) {}

  async run(input: SubagentRunInput): Promise<SubagentRunResult> {
    const childExecutionId = `subagent-${crypto.randomUUID()}`;
    const childConversationId = `${input.parent.conversationId}::${childExecutionId}`;
    const tools = deriveChildTools(input.parentCatalog.tools, input.skill.metadata.forbidden_tools ?? []);

    const response = await this.javaClient.chat({
      requestId: input.parent.requestId,
      conversationId: childConversationId,
      model: input.skill.metadata.subagent_model,
      messages: [
        {
          role: "system",
          content: [
            `You are an isolated subagent for skill ${input.skill.metadata.name}.`,
            "Use only the provided tools. Return a concise summary for the parent agent.",
            input.skill.content
          ].join("\n\n")
        },
        { role: "user", content: input.task }
      ],
      tools,
      meta: {
        parentExecutionId: input.parent.executionId,
        childExecutionId,
        parentConversationId: input.parent.conversationId,
        toolCallId: input.toolCallId,
        skillName: input.skill.metadata.name
      }
    }, input.parent.headers);

    return {
      status: "ok",
      summary: String(response.message?.content ?? ""),
      childExecutionId,
      childConversationId,
      usage: typeof response.usage?.costUsdMicros === "number" ? { costUsdMicros: response.usage.costUsdMicros } : undefined
    };
  }
}

export function deriveChildTools(tools: ToolDefinition[], forbiddenTools: string[]): ToolDefinition[] {
  const forbidden = new Set(forbiddenTools);
  return tools.filter(tool => !forbidden.has(tool.name) && !PRIVILEGED_META_TOOLS.has(tool.name));
}
```

- [ ] **Step 1.4: Run focused test and confirm GREEN**

Run:

```bash
pnpm --filter @openharness/agent-runtime test -- subagentDispatcher
```

Expected: PASS for the first dispatcher test.

## Task 2: Dispatcher child model, policy, and usage behavior

**Files:**
- Modify: `agent-runtime/test/subagentDispatcher.test.ts`
- Modify: `agent-runtime/src/subagent/dispatcher.ts`

- [ ] **Step 2.1: Add tests for logical model forwarding and cost aggregation**

Append to `describe("SubagentDispatcher", ...)`:

```ts
  it("forwards subagent_model as logical model id and returns Java-provided cost", async () => {
    const javaClient = new FakeSubagentJavaClient();
    const dispatcher = new SubagentDispatcher(javaClient);

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
          fork_agent: true,
          subagent_model: "cheap-worker"
        },
        content: "Summarize.",
        sourcePath: "/tmp/worker-skill/SKILL.md"
      },
      task: "summarize files",
      parentCatalog,
      timeoutMs: 30_000
    });

    expect(javaClient.chatRequests[0].model).toBe("cheap-worker");
    expect(result.usage?.costUsdMicros).toBe(7);
  });
```

- [ ] **Step 2.2: Add tests for forbidden child tool-call rejection**

Modify `FakeSubagentJavaClient` to allow a forced child tool call:

```ts
  nextToolCallName?: string;

  async chat(request: ModelChatRequest) {
    this.chatRequests.push(request);
    if (this.nextToolCallName && this.chatRequests.length === 1) {
      return {
        requestId: request.requestId,
        conversationId: request.conversationId,
        rawProvider: "mock",
        message: {
          role: "assistant",
          content: "",
          toolCalls: [{ id: "child-call-1", name: this.nextToolCallName, argumentsRaw: "{}" }]
        } as AgentMessage
      };
    }
    return {
      requestId: request.requestId,
      conversationId: request.conversationId,
      rawProvider: "mock",
      usage: { costUsdMicros: 7 },
      message: { role: "assistant", content: "child summary" } as AgentMessage
    };
  }
```

Append test:

```ts
  it("rejects child attempts to call tools removed from the child catalog", async () => {
    const javaClient = new FakeSubagentJavaClient();
    javaClient.nextToolCallName = "run_command";
    const dispatcher = new SubagentDispatcher(javaClient);

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
          fork_agent: true,
          forbidden_tools: ["run_command"]
        },
        content: "Try a forbidden command.",
        sourcePath: "/tmp/worker-skill/SKILL.md"
      },
      task: "run command",
      parentCatalog,
      timeoutMs: 30_000
    });

    expect(result.status).toBe("error");
    expect(result.errorClass).toBe("SUBAGENT_POLICY_DENY");
    expect(javaClient.executedTools).toHaveLength(0);
  });
```

- [ ] **Step 2.3: Implement child tool-call validation before execution**

Update `SubagentDispatcher.run()` after the first `chat()` response:

```ts
    const allowedToolNames = new Set(tools.map(tool => tool.name));
    const childToolCalls = response.message?.toolCalls ?? [];
    for (const toolCall of childToolCalls) {
      if (!allowedToolNames.has(toolCall.name)) {
        return {
          status: "error",
          summary: "",
          childExecutionId,
          childConversationId,
          errorClass: "SUBAGENT_POLICY_DENY",
          errorMessage: `Subagent attempted to call unavailable tool: ${toolCall.name}`
        };
      }
    }
```

- [ ] **Step 2.4: Run dispatcher focused tests**

Run:

```bash
pnpm --filter @openharness/agent-runtime test -- subagentDispatcher
```

Expected: PASS.

## Task 3: Wire forked skills into AgentExecutionRunner

**Files:**
- Modify: `agent-runtime/src/agentExecutionRunner.ts`
- Modify: `agent-runtime/test/agentExecutionRunner.test.ts`

- [ ] **Step 3.1: Add failing integration regression for forked skill parent history isolation**

Append a test near existing `invoke_skill` tests in `agent-runtime/test/agentExecutionRunner.test.ts`:

```ts
  it("routes fork_agent skills through subagent summary without parent pending injection", async () => {
    const skillDir = path.join(process.cwd(), "skills", "fork-worker");
    fs.mkdirSync(skillDir, { recursive: true });
    fs.writeFileSync(path.join(skillDir, "SKILL.md"), [
      "---",
      "name: fork-worker",
      "description: A forked worker skill",
      "version: 1.0.0",
      "tools_required: []",
      "parameters: {}",
      "fork_agent: true",
      "subagent_model: cheap-worker",
      "forbidden_tools: [run_command]",
      "---",
      "Child-only instructions must not be injected into parent history."
    ].join("\n"), "utf-8");

    const javaClient = new FakeJavaClient();
    javaClient.chat = async (request: ModelChatRequest) => {
      javaClient.chatRequests.push(request);
      if (request.conversationId.includes("subagent-")) {
        return {
          requestId: request.requestId,
          conversationId: request.conversationId,
          rawProvider: "mock",
          usage: { costUsdMicros: 11 },
          message: { role: "assistant", content: "subagent summary" } as AgentMessage
        };
      }
      if (javaClient.chatRequests.filter(r => !r.conversationId.includes("subagent-")).length === 1) {
        return {
          requestId: request.requestId,
          conversationId: request.conversationId,
          rawProvider: "mock",
          message: {
            role: "assistant",
            content: "",
            toolCalls: [{ id: "call-fork-skill", name: "invoke_skill", argumentsRaw: '{"skill_name":"fork-worker","task":"do child work"}' }]
          } as AgentMessage
        };
      }
      return {
        requestId: request.requestId,
        conversationId: request.conversationId,
        rawProvider: "mock",
        message: { role: "assistant", content: "done" } as AgentMessage
      };
    };

    const origSkills = process.env.OPENHARNESS_SKILLS_ENABLED;
    process.env.OPENHARNESS_SKILLS_ENABLED = "true";
    try {
      const runner = new AgentExecutionRunner(javaClient, history, undefined, runtimeEventStore, executionStateStore);
      const { done } = runner.start({
        ...baseInput,
        agentDefinition: { ...DEFAULT_AGENT_DEFINITION, tools: ["invoke_skill"], model: "default" }
      });
      await done;

      const parentMessages = history.get("t1", "conv-runner");
      expect(parentMessages.some(m => m.role === "tool" && m.toolName === "invoke_skill" && String(m.content).includes("subagent summary"))).toBe(true);
      expect(parentMessages.some(m => String(m.content).includes("Child-only instructions must not be injected"))).toBe(false);
      expect(javaClient.chatRequests.some(r => r.conversationId.includes("subagent-") && r.model === "cheap-worker")).toBe(true);
    } finally {
      process.env.OPENHARNESS_SKILLS_ENABLED = origSkills;
      if (fs.existsSync(path.join(skillDir, "SKILL.md"))) fs.unlinkSync(path.join(skillDir, "SKILL.md"));
      if (fs.existsSync(skillDir)) fs.rmdirSync(skillDir);
    }
  });
```

- [ ] **Step 3.2: Run focused regression and confirm RED**

Run:

```bash
pnpm --filter @openharness/agent-runtime test -- agentExecutionRunner
```

Expected: FAIL because forked skill still uses pending injection.

- [ ] **Step 3.3: Wire dispatcher in AgentExecutionRunner**

In `agent-runtime/src/agentExecutionRunner.ts`:

1. Add import:

```ts
import { SubagentDispatcher } from "./subagent/dispatcher";
```

2. Add class field:

```ts
  private readonly subagentDispatcher: SubagentDispatcher;
```

3. Initialize in constructor after `ToolRegistry`:

```ts
    this.subagentDispatcher = new SubagentDispatcher(javaClient);
```

4. In `executeTool()` `if (toolCall.name === "invoke_skill")` branch, after parsing skill and before pending injection:

```ts
        if (skill.metadata.fork_agent === true) {
          const executionId = this.currentExecutionId(input.tenantId, input.conversationId);
          const parentState = this.executionStateStore.get(executionId);
          const subagentResult = await this.subagentDispatcher.run({
            parent: {
              executionId,
              tenantId: input.tenantId,
              conversationId: input.conversationId,
              requestId: input.requestId,
              traceId: input.traceId,
              userId: input.userId,
              headers: input.headers,
              abortSignal: parentState?.abortController.signal ?? new AbortController().signal
            },
            toolCallId: toolCall.id,
            skill,
            task,
            parentCatalog: {
              catalogVersion: catalog.catalogVersion,
              catalogHash: catalog.catalogHash,
              tools: this.toolRegistry.getCatalogTools(input.tenantId, input.conversationId)
            },
            timeoutMs: resolveTimeoutMs("SUBAGENT_TIMEOUT_MS", 300_000)
          });

          if (subagentResult.status === "error") {
            await emit(this.ev(input, TRACE_OBSERVE_TOOL_RESULT, "tool result", {
              toolName: toolCall.name,
              status: "error",
              stepIndex,
              childExecutionId: subagentResult.childExecutionId,
              errorClass: subagentResult.errorClass
            }));
            throw new RuntimeTerminalFailure("TOOL_ERROR", subagentResult.errorMessage ?? "Subagent failed", {
              toolCallId: toolCall.id,
              toolName: toolCall.name,
              stepIndex,
              childExecutionId: subagentResult.childExecutionId,
              errorClass: subagentResult.errorClass
            });
          }

          await emit(this.ev(input, TRACE_OBSERVE_TOOL_RESULT, "tool result", {
            toolName: toolCall.name,
            status: "ok",
            stepIndex,
            childExecutionId: subagentResult.childExecutionId,
            childConversationId: subagentResult.childConversationId,
            subagentCostUsdMicros: subagentResult.usage?.costUsdMicros
          }));
          return toolMessage(toolCall.id, toolCall.name, subagentResult.summary, "trusted");
        }
```

5. If `ToolRegistry.getCatalogTools()` does not exist, add it in Task 4.

- [ ] **Step 3.4: Run focused regression**

Run:

```bash
pnpm --filter @openharness/agent-runtime test -- agentExecutionRunner
```

Expected: PASS for `agentExecutionRunner` tests after Task 4 support is added.

## Task 4: ToolRegistry catalog access helper

**Files:**
- Modify: `agent-runtime/src/toolRegistry.ts`
- Modify: `agent-runtime/test/toolRegistryMerge.test.ts`

- [ ] **Step 4.1: Add test for read-only frozen catalog tools access**

Add to `agent-runtime/test/toolRegistryMerge.test.ts`:

```ts
  it("exposes frozen catalog tools for scoped runtime derivation", async () => {
    const javaClient = new FakeJavaClient();
    const registry = new ToolRegistry(javaClient);
    await registry.getFrozenCatalog("t1", "conv-tools", {});

    const tools = registry.getCatalogTools("t1", "conv-tools");
    expect(tools.map(tool => tool.name)).toContain("invoke_skill");
    tools.pop();
    expect(registry.getCatalogTools("t1", "conv-tools").map(tool => tool.name)).toContain("invoke_skill");
  });
```

- [ ] **Step 4.2: Implement helper**

Add to `ToolRegistry`:

```ts
  getCatalogTools(tenantId: string, conversationId: string): ToolDefinition[] {
    const key = `${tenantId}:${conversationId}`;
    const entry = this.getEntriesMap().get(key);
    return entry ? [...entry.catalog.tools] : [];
  }
```

- [ ] **Step 4.3: Run focused tests**

Run:

```bash
pnpm --filter @openharness/agent-runtime test -- toolRegistryMerge agentExecutionRunner subagentDispatcher
```

Expected: PASS.

## Task 5: Abort, timeout, and policy-audit hardening

**Files:**
- Modify: `agent-runtime/src/subagent/dispatcher.ts`
- Modify: `agent-runtime/test/subagentDispatcher.test.ts`

- [ ] **Step 5.1: Add abort-before-start test**

Append:

```ts
  it("returns SUBAGENT_ABORTED without model call when parent signal is already aborted", async () => {
    const javaClient = new FakeSubagentJavaClient();
    const dispatcher = new SubagentDispatcher(javaClient);
    const ac = new AbortController();
    ac.abort();

    const result = await dispatcher.run({
      parent: {
        executionId: "parent-exec-1",
        tenantId: "t1",
        conversationId: "parent-conv",
        requestId: "req-1",
        traceId: "trace-1",
        userId: "u1",
        headers: {},
        abortSignal: ac.signal
      },
      toolCallId: "call-skill",
      skill: {
        metadata: { name: "worker-skill", description: "worker", version: "1.0.0", tools_required: [], parameters: {}, fork_agent: true },
        content: "Summarize.",
        sourcePath: "/tmp/worker-skill/SKILL.md"
      },
      task: "summarize files",
      parentCatalog,
      timeoutMs: 30_000
    });

    expect(result.status).toBe("error");
    expect(result.errorClass).toBe("SUBAGENT_ABORTED");
    expect(javaClient.chatRequests).toHaveLength(0);
  });
```

- [ ] **Step 5.2: Add timeout test**

Add delay support to `FakeSubagentJavaClient`:

```ts
  modelDelayMs = 0;
```

At top of `chat()`:

```ts
    if (this.modelDelayMs > 0) await new Promise(resolve => setTimeout(resolve, this.modelDelayMs));
```

Append:

```ts
  it("returns SUBAGENT_TIMEOUT when child model exceeds timeout", async () => {
    const javaClient = new FakeSubagentJavaClient();
    javaClient.modelDelayMs = 50;
    const dispatcher = new SubagentDispatcher(javaClient);

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
        metadata: { name: "worker-skill", description: "worker", version: "1.0.0", tools_required: [], parameters: {}, fork_agent: true },
        content: "Summarize.",
        sourcePath: "/tmp/worker-skill/SKILL.md"
      },
      task: "summarize files",
      parentCatalog,
      timeoutMs: 1
    });

    expect(result.status).toBe("error");
    expect(result.errorClass).toBe("SUBAGENT_TIMEOUT");
  });
```

- [ ] **Step 5.3: Implement abort and timeout guards**

In `SubagentDispatcher.run()` add before child model call:

```ts
    if (input.parent.abortSignal.aborted) {
      return {
        status: "error",
        summary: "",
        childExecutionId,
        childConversationId,
        errorClass: "SUBAGENT_ABORTED",
        errorMessage: "Subagent aborted before start"
      };
    }
```

Wrap `javaClient.chat()` with a helper:

```ts
async function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T | "__timeout__"> {
  let timer: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<"__timeout__">(resolve => { timer = setTimeout(() => resolve("__timeout__"), timeoutMs); })
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}
```

Then:

```ts
    const maybeResponse = await withTimeout(this.javaClient.chat(...), input.timeoutMs);
    if (maybeResponse === "__timeout__") {
      return { status: "error", summary: "", childExecutionId, childConversationId, errorClass: "SUBAGENT_TIMEOUT", errorMessage: `Subagent timed out after ${input.timeoutMs}ms` };
    }
    const response = maybeResponse;
```

- [ ] **Step 5.4: Run focused dispatcher tests**

Run:

```bash
pnpm --filter @openharness/agent-runtime test -- subagentDispatcher
```

Expected: PASS.

## Task 6: Formal verification and project state sync

**Files:**
- Modify: `openspec/changes/add-subagent-dispatcher/tasks.md`
- Modify: `docs/project-dashboard/development-log.json`
- Generated: `docs/project-dashboard/development-log.md`
- Generated: `docs/project-dashboard/index.html`
- Create: `docs/review/YYYY-MM-DD-add-subagent-dispatcher-implementation-review.md`
- Create: `docs/design/YYYY-MM-DD-add-subagent-dispatcher-closeout.md` only after review passes.

- [ ] **Step 6.1: Run formal tests**

Run:

```bash
pnpm --filter @openharness/agent-runtime test
pnpm --filter @openharness/agent-runtime typecheck
npx openspec validate add-subagent-dispatcher --strict --no-interactive
```

Expected:
- Vitest passes.
- `tsc --noEmit` passes.
- OpenSpec change is valid.

- [ ] **Step 6.2: Update OpenSpec tasks truthfully**

Only after implementation evidence passes, update `openspec/changes/add-subagent-dispatcher/tasks.md` checked boxes for completed tasks.

- [ ] **Step 6.3: Update dashboard to verified**

Update `docs/project-dashboard/development-log.json` entry `add-subagent-dispatcher`:

```json
{
  "changeId": "add-subagent-dispatcher",
  "status": "verified",
  "superpowers": {
    "plan": "docs/superpowers/plans/2026-06-22-add-subagent-dispatcher.md"
  },
  "implementation": {
    "sourceFiles": [
      "agent-runtime/src/subagent/dispatcher.ts",
      "agent-runtime/src/agentExecutionRunner.ts",
      "agent-runtime/src/toolRegistry.ts"
    ],
    "testFiles": [
      "agent-runtime/test/subagentDispatcher.test.ts",
      "agent-runtime/test/agentExecutionRunner.test.ts",
      "agent-runtime/test/toolRegistryMerge.test.ts"
    ]
  }
}
```

Preserve existing summary/tags/openspec fields and append verification commands with exact observed results.

- [ ] **Step 6.4: Regenerate dashboard**

Run:

```bash
node docs/project-dashboard/scripts/render-dashboard.mjs
pnpm dashboard:check
```

Expected: dashboard generated outputs are current.

- [ ] **Step 6.5: Codex Review Owner creates implementation review**

Codex must review `git diff`, reports under `docs/agent-collab/add-subagent-dispatcher/`, and verification output. Review file path:

```text
docs/review/2026-06-22-add-subagent-dispatcher-implementation-review.md
```

- [ ] **Step 6.6: Closeout only after review passes**

If review conclusion is `通过`, create:

```text
docs/design/2026-06-22-add-subagent-dispatcher-closeout.md
```

Do not run `npx openspec archive add-subagent-dispatcher --yes` until the user explicitly approves archive.

---

## Step Evidence Gate expectations

For each Antigravity CLI step, Codex Review Owner must check:

1. Code facts with `path:line` evidence for touched entry points.
2. Positive check: new behavior present in code and tests.
3. Negative search: no forked skill pending injection, no child `invoke_skill` visibility, no forbidden tool execution.
4. Formal verification for the step.
5. No scope drift or unrelated formatting.

## Plan self-review

- Spec coverage:
  - Isolated forked skill dispatch: Tasks 1, 3.
  - Tool downgrade / forbidden / privileged meta filtering: Tasks 1, 2, 4.
  - Child identity / parent attribution: Tasks 1, 3, 6 review evidence.
  - Abort / timeout propagation: Task 5.
  - Logical model forwarding: Task 2.
  - Usage/cost aggregation from Java response: Task 2 and Task 6.
- Placeholder scan: no `TBD`, no “implement later”, no undefined task references.
- Type consistency: dispatcher interfaces are introduced before runner integration; runner references `getCatalogTools()` only after Task 4 adds it.
