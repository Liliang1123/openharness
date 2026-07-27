import { describe, expect, it } from "vitest";
import { createServer } from "../src/server";
import type { JavaClient } from "../src/javaClient";
import type {
  AgentMessage,
  CatalogResponse,
  ModelChatRequest,
  ToolCallRequest,
  TraceEvent
} from "../src/types";

describe("runtime storage admission gate", () => {
  it("allows reads but rejects authenticated external mutations while storage admission is paused", async () => {
    const javaClient = new CountingJavaClient();
    const app = await createServer({
      javaClient,
      disableMcp: true,
      requireServiceAuth: true,
      serviceToken: "service-token",
      admission: () => ({
        allowed: false,
        reason: "RUNTIME_STORAGE_LOW"
      })
    });

    const read = await app.inject({
      method: "GET",
      url: "/api/v1/sessions",
      headers: authenticatedHeaders()
    });
    expect(read.statusCode).toBe(200);

    for (const mutation of [
      {
        method: "POST" as const,
        url: "/api/v1/agent/chat",
        payload: { conversationId: "conversation-a", message: "hello" }
      },
      {
        method: "PUT" as const,
        url: "/api/v1/memory/facts",
        payload: { content: "remember this", tags: [] }
      },
      {
        method: "DELETE" as const,
        url: "/api/v1/sessions/conversation-a"
      }
    ]) {
      const response = await app.inject({
        ...mutation,
        headers: authenticatedHeaders()
      });
      expect(response.statusCode).toBe(503);
      expect(response.json()).toEqual({
        error: {
          errorClass: "RUNTIME_STORAGE_LOW",
          errorMessage: "Runtime is not accepting external mutations"
        }
      });
    }
    expect(javaClient.chatCalls).toBe(0);

    await app.close();
  });

  it("does not disclose storage pressure before service authentication", async () => {
    const app = await createServer({
      javaClient: new CountingJavaClient(),
      disableMcp: true,
      requireServiceAuth: true,
      serviceToken: "service-token",
      admission: () => ({
        allowed: false,
        reason: "RUNTIME_STORAGE_CRITICAL"
      })
    });

    const response = await app.inject({
      method: "POST",
      url: "/api/v1/agent/chat",
      headers: {
        ...authenticatedHeaders(),
        authorization: "Bearer wrong-token"
      },
      payload: { conversationId: "conversation-a", message: "hello" }
    });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toEqual({
      error: {
        errorClass: "UNAUTHORIZED",
        errorMessage: "Missing or invalid service credential"
      }
    });

    await app.close();
  });
});

class CountingJavaClient implements JavaClient {
  chatCalls = 0;

  async getCatalog(): Promise<CatalogResponse> {
    return { catalogVersion: "v1", catalogHash: "hash", tools: [] };
  }

  async chat(request: ModelChatRequest) {
    this.chatCalls += 1;
    return {
      requestId: request.requestId,
      conversationId: request.conversationId,
      rawProvider: "fake",
      message: { role: "assistant", content: "done" } as AgentMessage
    };
  }

  async executeTool(request: ToolCallRequest) {
    return {
      requestId: request.requestId,
      conversationId: request.conversationId,
      toolCallId: request.toolCallId,
      toolName: request.toolName,
      status: "ok" as const,
      result: {}
    };
  }

  async postTrace(_event: TraceEvent, _headers: Record<string, string>) {}

  async evaluatePolicy(request: Parameters<JavaClient["evaluatePolicy"]>[0]) {
    return {
      requestId: request.requestId,
      conversationId: request.conversationId,
      decisions: []
    };
  }
}

function authenticatedHeaders(): Record<string, string> {
  return {
    authorization: "Bearer service-token",
    "x-tenant-id": "tenant-a",
    "x-user-id": "user-a",
    "x-trace-id": "trace-a",
    "x-request-id": "request-a"
  };
}
