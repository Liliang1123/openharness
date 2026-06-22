import { describe, expect, it } from "vitest";
import { createServer } from "../../agent-runtime/src/server";
import type { JavaClient, PolicyEvaluateRequest, PolicyEvaluateResponse } from "../../agent-runtime/src/javaClient";
import type {
  AgentMessage,
  CatalogResponse,
  ModelChatRequest,
  ToolCallRequest,
  TraceEvent
} from "../../agent-runtime/src/types";

class CapturingJavaClient implements JavaClient {
  chatRequests: ModelChatRequest[] = [];

  async getCatalog(): Promise<CatalogResponse> {
    return { catalogVersion: "v1", catalogHash: "h1", tools: [] };
  }
  async chat(request: ModelChatRequest) {
    this.chatRequests.push(request);
    return {
      requestId: request.requestId,
      conversationId: request.conversationId,
      rawProvider: "mock",
      message: { role: "assistant", content: "ok" } as AgentMessage
    };
  }
  async executeTool(_r: ToolCallRequest) {
    return { requestId: "", conversationId: "", toolCallId: "", toolName: "", result: {}, status: "ok" as const };
  }
  async postTrace(_e: TraceEvent) {}
  async evaluatePolicy(_r: PolicyEvaluateRequest): Promise<PolicyEvaluateResponse> {
    return { requestId: "", conversationId: "", decisions: [] };
  }
}

describe("P1a provider-adapter integration", () => {
  it("forwards cacheHints in meta to Java provider adapter", async () => {
    const java = new CapturingJavaClient();
    const app = await createServer({ javaClient: java, disableMcp: true });

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/agent/chat",
      headers: {
        "x-user-id": "u1",
        "x-tenant-id": "t-p1a",
        "x-trace-id": "tr",
        "x-request-id": "rq"
      },
      payload: { conversationId: "conv-p1a", message: "hello" }
    });

    expect(res.statusCode).toBe(200);
    expect(java.chatRequests.length).toBeGreaterThan(0);
    const meta = java.chatRequests[0].meta;
    expect(meta).toBeDefined();
    expect(meta?.cacheEnabled).toBe(true);
    expect(meta?.cacheHints).toBeDefined();
    expect(meta?.catalogVersion).toBe("v1");
    expect(meta?.catalogHash).toBe("h1");
    await app.close();
  });
});
