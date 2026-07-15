import { describe, expect, it, vi } from "vitest";
import { createServer } from "../src/server";
import { AgentLoop } from "../src/agentLoop";
import { InMemoryHistoryStore } from "../src/history";
import type { JavaClient, PolicyEvaluateRequest, PolicyEvaluateResponse } from "../src/javaClient";
import type { AgentMessage, CatalogResponse, ModelChatRequest, ToolCallRequest, ToolCallResponse, ToolDefinition, TraceEvent } from "../src/types";
import type { McpRegistry, McpToolEntry } from "../src/mcpRegistry";

class FakeJava implements JavaClient {
  toolExecuteCalls: ToolCallRequest[] = [];
  chatRequests: ModelChatRequest[] = [];

  catalog: CatalogResponse = {
    catalogVersion: "v1", catalogHash: "h1",
    tools: [{
      name: "catalog_tool",
      description: "catalog", parameters: { type: "object", properties: {} },
      permission: "safe", isReadOnly: true, isDestructive: false, requiresApproval: false, isConcurrencySafe: true
    } as ToolDefinition]
  };

  async getCatalog() { return this.catalog; }

  async chat(request: ModelChatRequest) {
    this.chatRequests.push(request);
    if (request.conversationId.includes("::subagent-")) {
      const childCalls = this.chatRequests.filter(call => call.conversationId === request.conversationId).length;
      if (childCalls === 1) {
        return {
          requestId: request.requestId,
          conversationId: request.conversationId,
          rawProvider: "mock",
          message: {
            role: "assistant",
            content: "",
            toolCalls: [{
              id: "child-mcp",
              name: "mcp_call",
              argumentsRaw: JSON.stringify({ server: "fs", tool: "mcp_tool", arguments: { value: "child" } })
            }]
          } as AgentMessage
        };
      }
      return {
        requestId: request.requestId,
        conversationId: request.conversationId,
        rawProvider: "mock",
        message: { role: "assistant", content: "child summary" } as AgentMessage
      };
    }
    const last = request.messages[request.messages.length - 1];
    if (last?.role === "tool") {
      return { requestId: request.requestId, conversationId: request.conversationId, rawProvider: "mock",
        message: { role: "assistant", content: "done" } as AgentMessage };
    }
    // First call → emit tool calls based on user message
    const userMsg = String(last?.content ?? "");
    const tools: { id: string; name: string; argumentsRaw: string }[] = [];
    if (userMsg.includes("virtual")) tools.push({
      id: "tc-skill",
      name: "invoke_skill",
      argumentsRaw: JSON.stringify({ skill_name: "mcp:fs", task: "read through child" })
    });
    if (userMsg.includes("catalog")) tools.push({ id: "tc-cat", name: "catalog_tool", argumentsRaw: "{}" });
    if (userMsg.includes("mcp")) tools.push({
      id: "tc-mcp",
      name: "mcp_call",
      argumentsRaw: JSON.stringify({ server: "fs", tool: "mcp_tool", arguments: { value: "hello" } })
    });
    return {
      requestId: request.requestId, conversationId: request.conversationId, rawProvider: "mock",
      message: {
        role: "assistant",
        content: "",
        toolCalls: tools
      } as AgentMessage
    };
  }

  async executeTool(request: ToolCallRequest) {
    this.toolExecuteCalls.push(request);
    return {
      requestId: request.requestId, conversationId: request.conversationId,
      toolCallId: request.toolCallId, toolName: request.toolName,
      result: { ok: "from-java" }, status: "ok" as const
    };
  }

  async postTrace(_e: TraceEvent) {}

  async evaluatePolicy(req: PolicyEvaluateRequest): Promise<PolicyEvaluateResponse> {
    return {
      requestId: req.requestId, conversationId: req.conversationId,
      decisions: req.toolCalls.map(tc => ({ toolCallId: tc.id, decision: "ALLOW", source: "NONE" }))
    };
  }
}

function makeMockMcpRegistry(): { registry: McpRegistry; calls: Array<{ server: string; tool: string; arguments: unknown }> } {
  const calls: Array<{ server: string; tool: string; arguments: unknown }> = [];
  const mcpToolEntry: McpToolEntry = {
    serverName: "fs",
    tool: {
      name: "mcp_tool", description: "MCP",
      parameters: { type: "object", properties: {} },
      permission: "sensitive", isReadOnly: false, isDestructive: false, requiresApproval: false, isConcurrencySafe: true
    } as ToolDefinition
  };
  const registry = {
    init: vi.fn(),
    shutdown: vi.fn(),
    hasConfiguredServers: vi.fn(() => true),
    listVirtualSkillDescriptors: vi.fn(() => [{ name: "mcp:fs", description: "files" }]),
    refreshToolDefinitions: vi.fn(async () => [mcpToolEntry]),
    listTools: vi.fn(),
    hasTool: vi.fn(),
    getServerForTool: vi.fn(),
    getVirtualSkill: vi.fn(async () => ({
      metadata: {
        name: "mcp:fs", description: "files", version: "1",
        tools_required: ["mcp_call"], parameters: {}, fork_agent: true
      },
      content: "FULL_SCHEMA_SENTINEL",
      sourcePath: "virtual:mcp:fs"
    })),
    executeBroker: vi.fn(async (envelope: Record<string, unknown>, ctx: { requestId: string; conversationId: string; toolCallId: string }): Promise<ToolCallResponse> => {
      const server = String(envelope.server);
      const tool = String(envelope.tool);
      calls.push({ server, tool, arguments: envelope.arguments });
      return {
        requestId: ctx.requestId, conversationId: ctx.conversationId,
        toolCallId: ctx.toolCallId, toolName: tool,
        result: { ok: "from-mcp" }, status: "ok", provenance: "untrusted"
      };
    })
  } as unknown as McpRegistry;
  return { registry, calls };
}

describe("MCP routing in agent loop", () => {
  it("catalog tool is routed to Java executeTool", async () => {
    const java = new FakeJava();
    const { registry, calls } = makeMockMcpRegistry();
    const app = await createServer({ javaClient: java, mcpRegistry: registry });

    const res = await app.inject({
      method: "POST", url: "/api/v1/agent/chat",
      headers: { "x-user-id": "u", "x-tenant-id": "t", "x-trace-id": "tr", "x-request-id": "rq" },
      payload: { conversationId: "c1", message: "use catalog please" }
    });
    expect(res.statusCode).toBe(200);
    expect(java.toolExecuteCalls).toHaveLength(1);
    expect(java.toolExecuteCalls[0].toolName).toBe("catalog_tool");
    expect(calls).toHaveLength(0);
    await app.close();
  });

  it("MCP tool is routed to McpRegistry.execute, not Java", async () => {
    const java = new FakeJava();
    const { registry, calls } = makeMockMcpRegistry();
    const app = await createServer({ javaClient: java, mcpRegistry: registry });

    const res = await app.inject({
      method: "POST", url: "/api/v1/agent/chat",
      headers: { "x-user-id": "u", "x-tenant-id": "t", "x-trace-id": "tr", "x-request-id": "rq" },
      payload: { conversationId: "c2", message: "use mcp please" }
    });
    expect(res.statusCode).toBe(200);
    expect(calls).toHaveLength(1);
    expect(calls[0]).toEqual({ server: "fs", tool: "mcp_tool", arguments: { value: "hello" } });
    expect(java.toolExecuteCalls).toHaveLength(0);
    await app.close();
  });

  it("mixed catalog + MCP tools route correctly", async () => {
    const java = new FakeJava();
    const { registry, calls } = makeMockMcpRegistry();
    const app = await createServer({ javaClient: java, mcpRegistry: registry });

    const res = await app.inject({
      method: "POST", url: "/api/v1/agent/chat",
      headers: { "x-user-id": "u", "x-tenant-id": "t", "x-trace-id": "tr", "x-request-id": "rq" },
      payload: { conversationId: "c3", message: "use catalog and mcp together" }
    });
    expect(res.statusCode).toBe(200);
    expect(java.toolExecuteCalls).toHaveLength(1);
    expect(calls).toHaveLength(1);
    await app.close();
  });

  it("forks an MCP virtual skill instead of injecting its schema into the legacy parent loop", async () => {
    const originalSkills = process.env.OPENHARNESS_SKILLS_ENABLED;
    process.env.OPENHARNESS_SKILLS_ENABLED = "true";
    const java = new FakeJava();
    const { registry, calls } = makeMockMcpRegistry();
    const history = new InMemoryHistoryStore();
    const loop = new AgentLoop(java, history, registry);
    try {
      const result = await loop.run({
        conversationId: "c-virtual",
        message: "use virtual skill",
        userId: "u",
        tenantId: "t",
        traceId: "tr",
        requestId: "rq",
        headers: {}
      });

      expect(result.stopReason).toBe("FINAL_ANSWER");
      expect(java.chatRequests.map(request => request.conversationId)).toContainEqual(expect.stringContaining("::subagent-"));
      const parentRequests = java.chatRequests.filter(request => !request.conversationId.includes("::subagent-"));
      expect(parentRequests.some(request => JSON.stringify(request.messages).includes("FULL_SCHEMA_SENTINEL"))).toBe(false);
      expect(calls).toContainEqual({ server: "fs", tool: "mcp_tool", arguments: { value: "child" } });
    } finally {
      if (originalSkills === undefined) delete process.env.OPENHARNESS_SKILLS_ENABLED;
      else process.env.OPENHARNESS_SKILLS_ENABLED = originalSkills;
    }
  });

  it("keeps a direct legacy-loop broker result untrusted in model history", async () => {
    const java = new FakeJava();
    const { registry } = makeMockMcpRegistry();
    const history = new InMemoryHistoryStore();
    const loop = new AgentLoop(java, history, registry);

    const result = await loop.run({
      conversationId: "c-untrusted",
      message: "use mcp please",
      userId: "u",
      tenantId: "t",
      traceId: "tr",
      requestId: "rq",
      headers: {}
    });

    expect(result.stopReason).toBe("FINAL_ANSWER");
    const storedToolResult = history.get("t", "u", "c-untrusted").find(message => message.role === "tool");
    expect(storedToolResult?.toolResultProvenance).toBe("untrusted");
    const toolResult = java.chatRequests[1]?.messages.find(message => message.role === "tool");
    expect(String(toolResult?.content)).toContain('<tool_output trust="untrusted" tool="mcp_call">');
  });
});
