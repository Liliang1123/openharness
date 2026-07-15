import { describe, expect, it, vi } from "vitest";
import type { AgentMessage, CatalogResponse, ModelChatRequest, ToolCallRequest, ToolCallResponse, TraceEvent } from "../src/types";
import type { JavaClient, PolicyEvaluateRequest, PolicyEvaluateResponse } from "../src/javaClient";
import { SubagentDispatcher } from "../src/subagent/dispatcher";
import {
  TRACE_SUBAGENT_START,
  TRACE_SUBAGENT_MODEL_CALL,
  TRACE_SUBAGENT_TOOL_CALL,
  TRACE_SUBAGENT_SUMMARY,
  TRACE_SUBAGENT_END,
  buildSubagentTraceAttributes,
  type SubagentTraceInput
} from "../src/traceTree";

class FakeSubagentJavaClient implements JavaClient {
  chatRequests: ModelChatRequest[] = [];
  executedTools: ToolCallRequest[] = [];
  policyRequests: PolicyEvaluateRequest[] = [];
  nextToolCallName?: string;
  nextArgumentsRaw = "{}";
  modelDelayMs = 0;
  policyDecision: "ALLOW" | "DENY" | "REQUIRE_APPROVAL" | "MISSING" = "ALLOW";
  chatRejectError?: Error;
  executeToolRejectError?: Error;

  async getCatalog(_headers: Record<string, string>): Promise<CatalogResponse> {
    return { catalogVersion: "v1", catalogHash: "h1", tools: [] };
  }

  async chat(request: ModelChatRequest, _headers: Record<string, string>) {
    if (this.chatRejectError) {
      throw this.chatRejectError;
    }
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
    if (this.executeToolRejectError) {
      throw this.executeToolRejectError;
    }
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
      name: "mcp_call",
      description: "MCP broker",
      parameters: { type: "object", properties: {}, required: [] },
      catalogVersion: "v1",
      catalogHash: "h1",
      permission: "sensitive",
      isReadOnly: false,
      isDestructive: false,
      requiresApproval: false,
      isConcurrencySafe: true
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
  it("restricts an MCP virtual skill to the broker and executes it through Runtime", async () => {
    const javaClient = new FakeSubagentJavaClient();
    javaClient.nextToolCallName = "mcp_call";
    javaClient.nextArgumentsRaw = JSON.stringify({
      server: "filesystem",
      tool: "read_file",
      arguments: { path: "README.md" }
    });
    const runtimeToolExecutor = vi.fn(async (request: ToolCallRequest): Promise<ToolCallResponse> => ({
      requestId: request.requestId,
      conversationId: request.conversationId,
      toolCallId: request.toolCallId,
      toolName: request.toolName,
      status: "ok",
      result: { content: "from mcp" },
      provenance: "untrusted"
    }));
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
          name: "mcp:filesystem",
          description: "filesystem",
          version: "1",
          tools_required: ["mcp_call"],
          parameters: {},
          fork_agent: true
        },
        content: "Use filesystem tools.",
        sourcePath: "virtual:mcp:filesystem"
      },
      task: "read a file",
      parentCatalog,
      timeoutMs: 30_000,
      restrictedMcpServer: "filesystem",
      runtimeToolExecutor
    });

    expect(result.status).toBe("ok");
    expect(javaClient.chatRequests[0].tools?.map(tool => tool.name)).toEqual(["mcp_call"]);
    expect(javaClient.executedTools).toEqual([]);
    expect(runtimeToolExecutor).toHaveBeenCalledWith(
      expect.objectContaining({ toolName: "mcp_call", arguments: expect.objectContaining({ server: "filesystem" }) }),
      expect.objectContaining({ restrictedMcpServer: "filesystem" })
    );
    expect(javaClient.policyRequests[0].toolCalls[0].source).toBe("mcp:broker");
    const secondChildRequest = javaClient.chatRequests[1];
    const childToolResult = secondChildRequest.messages.find(message => message.role === "tool");
    expect(childToolResult?.toolResultProvenance).toBe("untrusted");
    expect(String(childToolResult?.content)).toContain('<tool_output trust="untrusted" tool="mcp_call">');
  });

  it("denies a virtual MCP skill call targeting another server", async () => {
    const javaClient = new FakeSubagentJavaClient();
    javaClient.nextToolCallName = "mcp_call";
    javaClient.nextArgumentsRaw = JSON.stringify({ server: "database", tool: "query", arguments: {} });
    const runtimeToolExecutor = vi.fn();
    const dispatcher = new SubagentDispatcher(javaClient);

    const result = await dispatcher.run({
      parent: {
        executionId: "parent-exec-1", tenantId: "t1", conversationId: "parent-conv",
        requestId: "req-1", traceId: "trace-1", userId: "u1", headers: {},
        abortSignal: new AbortController().signal
      },
      toolCallId: "call-skill",
      skill: {
        metadata: {
          name: "mcp:filesystem", description: "filesystem", version: "1",
          tools_required: ["mcp_call"], parameters: {}, fork_agent: true
        },
        content: "Use filesystem tools.",
        sourcePath: "virtual:mcp:filesystem"
      },
      task: "query",
      parentCatalog,
      timeoutMs: 30_000,
      restrictedMcpServer: "filesystem",
      runtimeToolExecutor
    });

    expect(result.status).toBe("error");
    expect(result.errorClass).toBe("SUBAGENT_POLICY_DENY");
    expect(runtimeToolExecutor).not.toHaveBeenCalled();
    expect(javaClient.executedTools).toEqual([]);
  });

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

  it("emits SUBAGENT_START, SUBAGENT_MODEL_CALL, SUBAGENT_SUMMARY, and SUBAGENT_END on successful execution", async () => {
    const javaClient = new FakeSubagentJavaClient();
    const dispatcher = new SubagentDispatcher(javaClient);
    const events: TraceEvent[] = [];

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
      toolCallId: "call-skill-123",
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
        content: "Secret instruction content",
        sourcePath: "/tmp/worker-skill/SKILL.md"
      },
      task: "User input task",
      parentCatalog,
      timeoutMs: 30_000,
      stepIndex: 5,
      emitTrace: async (ev) => {
        events.push(ev);
      }
    });

    expect(result.status).toBe("ok");

    const eventTypes = events.map(e => e.eventType);
    expect(eventTypes).toEqual([
      TRACE_SUBAGENT_START,
      TRACE_SUBAGENT_MODEL_CALL,
      TRACE_SUBAGENT_SUMMARY,
      TRACE_SUBAGENT_END
    ]);

    const startEvent = events[0];
    expect(startEvent.name).toBe("subagent start");
    expect(startEvent.attributes).toMatchObject({
      executionId: "parent-exec-1",
      skillName: "worker-skill",
      toolCallId: "call-skill-123",
      stepIndex: 5
    });
    expect(startEvent.attributes?.childExecutionId).toBeDefined();
    expect(startEvent.attributes?.childConversationId).toBeDefined();

    const modelEvent = events[1];
    expect(modelEvent.name).toBe("cheap-worker");

    const summaryEvent = events[2];
    expect(summaryEvent.name).toBe("subagent summary");
    expect(summaryEvent.status).toBe("ok");

    const endEvent = events[3];
    expect(endEvent.name).toBe("subagent end");
    expect(endEvent.status).toBe("ok");
    expect(endEvent.attributes?.durationMs).toBeGreaterThanOrEqual(0);
    expect(endEvent.attributes?.costUsdMicros).toBe(7);

    const serialized = JSON.stringify(events);
    expect(serialized).not.toContain("Secret instruction content");
    expect(serialized).not.toContain("User input task");
    expect(serialized).not.toContain("systemMessage");
  });

  it("emits SUBAGENT_START, SUBAGENT_MODEL_CALL, SUBAGENT_TOOL_CALL, and SUBAGENT_END on tool call execution", async () => {
    const javaClient = new FakeSubagentJavaClient();
    javaClient.nextToolCallName = "read_file";
    const dispatcher = new SubagentDispatcher(javaClient);
    const events: TraceEvent[] = [];

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
      toolCallId: "call-skill-123",
      skill: {
        metadata: {
          name: "worker-skill",
          description: "worker",
          version: "1.0.0",
          tools_required: [],
          parameters: {},
          fork_agent: true
        },
        content: "Secret instructions",
        sourcePath: "/tmp/worker-skill/SKILL.md"
      },
      task: "do tool task",
      parentCatalog,
      timeoutMs: 30_000,
      stepIndex: 2,
      emitTrace: async (ev) => {
        events.push(ev);
      }
    });

    expect(result.status).toBe("ok");
    const eventTypes = events.map(e => e.eventType);
    expect(eventTypes).toEqual([
      TRACE_SUBAGENT_START,
      TRACE_SUBAGENT_MODEL_CALL,
      TRACE_SUBAGENT_TOOL_CALL,
      TRACE_SUBAGENT_MODEL_CALL,
      TRACE_SUBAGENT_SUMMARY,
      TRACE_SUBAGENT_END
    ]);

    expect(events[2].name).toBe("read_file");

    const serialized = JSON.stringify(events);
    expect(serialized).not.toContain("Secret instructions");
  });

  it("emits terminalClass on error, timeout, or policy deny", async () => {
    const javaClient = new FakeSubagentJavaClient();

    javaClient.nextToolCallName = "run_command";
    const dispatcher = new SubagentDispatcher(javaClient);

    let events: TraceEvent[] = [];
    let result = await dispatcher.run({
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
      toolCallId: "call-skill-123",
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
        content: "run command",
        sourcePath: "/tmp/worker-skill/SKILL.md"
      },
      task: "run command",
      parentCatalog,
      timeoutMs: 30_000,
      emitTrace: async (ev) => { events.push(ev); }
    });

    expect(result.status).toBe("error");
    expect(events[events.length - 1].eventType).toBe(TRACE_SUBAGENT_END);
    expect(events[events.length - 1].attributes?.terminalClass).toBe("SUBAGENT_POLICY_DENY");

    javaClient.modelDelayMs = 20;
    events = [];
    result = await dispatcher.run({
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
      toolCallId: "call-skill-123",
      skill: {
        metadata: { name: "worker-skill", description: "worker", version: "1.0.0", tools_required: [], parameters: {}, fork_agent: true },
        content: "test",
        sourcePath: "/tmp/worker-skill/SKILL.md"
      },
      task: "test",
      parentCatalog,
      timeoutMs: 1,
      emitTrace: async (ev) => { events.push(ev); }
    });
    expect(result.status).toBe("error");
    expect(events[events.length - 1].eventType).toBe(TRACE_SUBAGENT_END);
    expect(events[events.length - 1].attributes?.terminalClass).toBe("SUBAGENT_TIMEOUT");
  });

  it("emits SUBAGENT_END with SUBAGENT_MODEL_ERROR and returns structured error when child model call rejects", async () => {
    const javaClient = new FakeSubagentJavaClient();
    javaClient.chatRejectError = new Error("Simulated chat network failure");
    const dispatcher = new SubagentDispatcher(javaClient);
    const events: TraceEvent[] = [];

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
      toolCallId: "call-skill-123",
      skill: {
        metadata: { name: "worker-skill", description: "worker", version: "1.0.0", tools_required: [], parameters: {}, fork_agent: true },
        content: "test",
        sourcePath: "/tmp/worker-skill/SKILL.md"
      },
      task: "test",
      parentCatalog,
      timeoutMs: 30_000,
      emitTrace: async (ev) => { events.push(ev); }
    });

    expect(result.status).toBe("error");
    expect(result.errorClass).toBe("SUBAGENT_MODEL_ERROR");
    expect(result.errorMessage).toContain("Simulated chat network failure");
    expect(events[events.length - 1].eventType).toBe(TRACE_SUBAGENT_END);
    expect(events[events.length - 1].attributes?.terminalClass).toBe("SUBAGENT_MODEL_ERROR");
    expect(events[events.length - 1].status).toBe("error");
  });

  it("emits SUBAGENT_END with SUBAGENT_TOOL_ERROR and returns structured error when child tool execute rejects", async () => {
    const javaClient = new FakeSubagentJavaClient();
    javaClient.nextToolCallName = "read_file";
    javaClient.executeToolRejectError = new Error("Simulated tool execution crash");
    const dispatcher = new SubagentDispatcher(javaClient);
    const events: TraceEvent[] = [];

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
      toolCallId: "call-skill-123",
      skill: {
        metadata: { name: "worker-skill", description: "worker", version: "1.0.0", tools_required: [], parameters: {}, fork_agent: true },
        content: "test",
        sourcePath: "/tmp/worker-skill/SKILL.md"
      },
      task: "test",
      parentCatalog,
      timeoutMs: 30_000,
      emitTrace: async (ev) => { events.push(ev); }
    });

    expect(result.status).toBe("error");
    expect(result.errorClass).toBe("SUBAGENT_TOOL_ERROR");
    expect(result.errorMessage).toContain("Simulated tool execution crash");
    expect(events[events.length - 1].eventType).toBe(TRACE_SUBAGENT_END);
    expect(events[events.length - 1].attributes?.terminalClass).toBe("SUBAGENT_TOOL_ERROR");
    expect(events[events.length - 1].status).toBe("error");
  });
});

describe("trace-tree helper", () => {
  it("buildSubagentTraceAttributes outputs all defined fields and removes undefined ones", () => {
    const input: SubagentTraceInput = {
      executionId: "exec-123",
      childExecutionId: "child-exec-456",
      childConversationId: "child-conv-789",
      skillName: "test-skill",
      toolCallId: "tool-call-abc",
      stepIndex: 2,
      terminalClass: "test-class",
      durationMs: 150,
      costUsdMicros: 10,
      traceIngestionStatus: "posted"
    };

    const attrs = buildSubagentTraceAttributes(input);

    expect(attrs).toEqual({
      traceNodeKind: "subagent_execution",
      executionId: "exec-123",
      parentExecutionId: "exec-123",
      childExecutionId: "child-exec-456",
      childConversationId: "child-conv-789",
      skillName: "test-skill",
      toolCallId: "tool-call-abc",
      stepIndex: 2,
      terminalClass: "test-class",
      durationMs: 150,
      costUsdMicros: 10,
      traceIngestionStatus: "posted"
    });
  });

  it("removes undefined optional fields from attributes", () => {
    const input: SubagentTraceInput = {
      executionId: "exec-123",
      childExecutionId: "child-exec-456",
      childConversationId: "child-conv-789",
      skillName: "test-skill",
      toolCallId: "tool-call-abc"
    };

    const attrs = buildSubagentTraceAttributes(input);

    expect(attrs).toEqual({
      traceNodeKind: "subagent_execution",
      executionId: "exec-123",
      parentExecutionId: "exec-123",
      childExecutionId: "child-exec-456",
      childConversationId: "child-conv-789",
      skillName: "test-skill",
      toolCallId: "tool-call-abc"
    });

    expect("stepIndex" in attrs).toBe(false);
    expect("terminalClass" in attrs).toBe(false);
    expect("durationMs" in attrs).toBe(false);
    expect("costUsdMicros" in attrs).toBe(false);
    expect("traceIngestionStatus" in attrs).toBe(false);
  });

  it("has stable event name constants", () => {
    expect(TRACE_SUBAGENT_START).toBe("SUBAGENT_START");
    expect(TRACE_SUBAGENT_MODEL_CALL).toBe("SUBAGENT_MODEL_CALL");
    expect(TRACE_SUBAGENT_TOOL_CALL).toBe("SUBAGENT_TOOL_CALL");
    expect(TRACE_SUBAGENT_SUMMARY).toBe("SUBAGENT_SUMMARY");
    expect(TRACE_SUBAGENT_END).toBe("SUBAGENT_END");
  });

  it("does not include prompt content or task in serialized helper output", () => {
    const input: SubagentTraceInput = {
      executionId: "exec-123",
      childExecutionId: "child-exec-456",
      childConversationId: "child-conv-789",
      skillName: "test-skill",
      toolCallId: "tool-call-abc"
    };

    const attrs = buildSubagentTraceAttributes(input) as Record<string, unknown>;
    const serialized = JSON.stringify(attrs);

    expect(serialized).not.toContain("prompt");
    expect(serialized).not.toContain("task");
    expect(serialized).not.toContain("content");
  });
});
