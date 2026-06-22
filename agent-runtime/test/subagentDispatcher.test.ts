import { describe, expect, it } from "vitest";
import type { AgentMessage, CatalogResponse, ModelChatRequest, ToolCallRequest, TraceEvent } from "../src/types";
import type { JavaClient, PolicyEvaluateRequest, PolicyEvaluateResponse } from "../src/javaClient";
import { SubagentDispatcher } from "../src/subagent/dispatcher";

class FakeSubagentJavaClient implements JavaClient {
  chatRequests: ModelChatRequest[] = [];
  executedTools: ToolCallRequest[] = [];
  policyRequests: PolicyEvaluateRequest[] = [];
  nextToolCallName?: string;
  nextArgumentsRaw = "{}";
  modelDelayMs = 0;
  policyDecision: "ALLOW" | "DENY" | "REQUIRE_APPROVAL" | "MISSING" = "ALLOW";

  async getCatalog(_headers: Record<string, string>): Promise<CatalogResponse> {
    return { catalogVersion: "v1", catalogHash: "h1", tools: [] };
  }

  async chat(request: ModelChatRequest, _headers: Record<string, string>) {
    if (this.modelDelayMs > 0) {
      await new Promise(resolve => setTimeout(resolve, this.modelDelayMs));
    }
    this.chatRequests.push(request);
    if (this.nextToolCallName && this.chatRequests.length === 1) {
      return {
        requestId: request.requestId,
        conversationId: request.conversationId,
        rawProvider: "mock",
        usage: {
          promptTokens: 0,
          completionTokens: 0,
          totalTokens: 0,
          costUsdMicros: 7
        },
        message: {
          role: "assistant" as const,
          content: "",
          toolCalls: [{ id: "child-call-1", name: this.nextToolCallName, argumentsRaw: this.nextArgumentsRaw }]
        } as AgentMessage
      };
    }
    const content = this.chatRequests.length > 1 ? "child summary after tool" : "child summary";
    return {
      requestId: request.requestId,
      conversationId: request.conversationId,
      rawProvider: "mock",
      usage: {
        promptTokens: 0,
        completionTokens: 0,
        totalTokens: 0,
        costUsdMicros: 7
      },
      message: { role: "assistant", content } as AgentMessage
    };
  }

  async executeTool(request: ToolCallRequest, _headers: Record<string, string>) {
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

  async postTrace(_event: TraceEvent, _headers: Record<string, string>) {}

  async evaluatePolicy(req: PolicyEvaluateRequest, _headers: Record<string, string>): Promise<PolicyEvaluateResponse> {
    this.policyRequests.push(req);
    if (this.policyDecision === "MISSING") {
      return { requestId: req.requestId, conversationId: req.conversationId, decisions: [] };
    }
    return {
      requestId: req.requestId,
      conversationId: req.conversationId,
      decisions: req.toolCalls.map(tc => ({ toolCallId: tc.id, decision: this.policyDecision }))
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

  it("defaults child model to default when subagent_model is absent", async () => {
    const javaClient = new FakeSubagentJavaClient();
    const dispatcher = new SubagentDispatcher(javaClient);

    await dispatcher.run({
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
        content: "Summarize.",
        sourcePath: "/tmp/worker-skill/SKILL.md"
      },
      task: "summarize files",
      parentCatalog,
      timeoutMs: 30_000
    });

    expect(javaClient.chatRequests[0].model).toBe("default");
  });

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

  it("allowed child tool call is audited, executed, and summarized", async () => {
    const javaClient = new FakeSubagentJavaClient();
    javaClient.nextToolCallName = "read_file";
    javaClient.policyDecision = "ALLOW";
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
      timeoutMs: 30_000
    });

    expect(result.status).toBe("ok");
    expect(result.summary).toBe("child summary after tool");
    expect(javaClient.policyRequests).toHaveLength(1);
    expect(javaClient.policyRequests[0].conversationId).toContain("::subagent-");
    expect(javaClient.executedTools).toHaveLength(1);
    expect(javaClient.executedTools[0].conversationId).toContain("::subagent-");
    expect(result.usage?.costUsdMicros).toBe(14);
  });

  it("denied child tool call is not executed", async () => {
    const javaClient = new FakeSubagentJavaClient();
    javaClient.nextToolCallName = "read_file";
    javaClient.policyDecision = "DENY";
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
      timeoutMs: 30_000
    });

    expect(result.status).toBe("error");
    expect(result.errorClass).toBe("SUBAGENT_POLICY_DENY");
    expect(javaClient.executedTools).toHaveLength(0);
  });

  it("denies child tool call when policy decision is missing", async () => {
    const javaClient = new FakeSubagentJavaClient();
    javaClient.nextToolCallName = "read_file";
    javaClient.policyDecision = "MISSING";
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
      timeoutMs: 30_000
    });

    expect(result.status).toBe("error");
    expect(result.errorClass).toBe("SUBAGENT_POLICY_DENY");
    expect(javaClient.executedTools).toHaveLength(0);
  });

  it("rejects child tool arguments that are not objects", async () => {
    const javaClient = new FakeSubagentJavaClient();
    javaClient.nextToolCallName = "read_file";
    javaClient.nextArgumentsRaw = "[]";
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
      timeoutMs: 30_000
    });

    expect(result.status).toBe("error");
    expect(result.errorClass).toBe("SUBAGENT_TOOL_ERROR");
    expect(javaClient.executedTools).toHaveLength(0);
  });
});
