import { describe, expect, it, vi } from "vitest";
import { createServer } from "../src/server";
import type { JavaClient, PolicyEvaluateRequest, PolicyEvaluateResponse } from "../src/javaClient";
import type { AgentMessage, CatalogResponse, ModelChatRequest, ToolCallRequest, ToolCallResponse, ToolDefinition, TraceEvent } from "../src/types";
import type { McpRegistry, McpToolEntry } from "../src/mcpRegistry";

class FakeJava implements JavaClient {
  toolExecuteCalls: ToolCallRequest[] = [];

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
    const last = request.messages[request.messages.length - 1];
    if (last?.role === "tool") {
      return { requestId: request.requestId, conversationId: request.conversationId, rawProvider: "mock",
        message: { role: "assistant", content: "done" } as AgentMessage };
    }
    // First call → emit tool calls based on user message
    const userMsg = String(last?.content ?? "");
    const tools: { id: string; name: string; argumentsRaw: string }[] = [];
    if (userMsg.includes("catalog")) tools.push({ id: "tc-cat", name: "catalog_tool", argumentsRaw: "{}" });
    if (userMsg.includes("mcp")) tools.push({ id: "tc-mcp", name: "mcp_tool", argumentsRaw: "{}" });
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

function makeMockMcpRegistry(): { registry: McpRegistry; calls: Array<{ server: string; tool: string }> } {
  const calls: Array<{ server: string; tool: string }> = [];
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
    refreshToolDefinitions: vi.fn(async () => [mcpToolEntry]),
    listTools: vi.fn(),
    hasTool: vi.fn(),
    getServerForTool: vi.fn(),
    execute: vi.fn(async (server: string, tool: string, _args: unknown, ctx: { requestId: string; conversationId: string; toolCallId: string }): Promise<ToolCallResponse> => {
      calls.push({ server, tool });
      return {
        requestId: ctx.requestId, conversationId: ctx.conversationId,
        toolCallId: ctx.toolCallId, toolName: tool,
        result: { ok: "from-mcp" }, status: "ok"
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
    expect(calls[0]).toEqual({ server: "fs", tool: "mcp_tool" });
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
});
