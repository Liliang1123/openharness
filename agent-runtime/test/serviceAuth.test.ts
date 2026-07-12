import { describe, expect, it } from "vitest";
import { createServer } from "../src/server";
import { InMemoryMemoryStore } from "../src/memoryStore";
import type { JavaClient, PolicyEvaluateRequest, PolicyEvaluateResponse } from "../src/javaClient";
import type { CatalogResponse, ModelChatRequest, ToolCallRequest, TraceEvent } from "../src/types";

class RecordingJavaClient implements JavaClient {
  calls = 0;
  async getCatalog(): Promise<CatalogResponse> {
    this.calls++;
    return { catalogVersion: "v1", catalogHash: "h1", tools: [] };
  }
  async chat(_request: ModelChatRequest): Promise<never> {
    this.calls++;
    throw new Error("not used");
  }
  async executeTool(_request: ToolCallRequest): Promise<never> {
    this.calls++;
    throw new Error("not used");
  }
  async postTrace(_event: TraceEvent) {
    this.calls++;
  }
  async evaluatePolicy(_request: PolicyEvaluateRequest): Promise<PolicyEvaluateResponse> {
    this.calls++;
    return { requestId: "req", conversationId: "conv", decisions: [] };
  }
}

describe("production service authentication", () => {
  it("requires explicit user identity even in development mode", async () => {
    const app = await createServer({
      javaClient: new RecordingJavaClient(),
      disableMcp: true,
      memoryStore: new InMemoryMemoryStore()
    });

    const res = await app.inject({
      method: "GET",
      url: "/api/v1/memory/facts",
      headers: { "x-tenant-id": "tenant-a" }
    });

    expect(res.statusCode).toBe(400);
    expect(res.json().error.errorClass).toBe("MISSING_IDENTITY_HEADER");
    await app.close();
  });

  it("rejects missing or invalid bearer token before tenant state access", async () => {
    const javaClient = new RecordingJavaClient();
    const app = await createServer({
      javaClient,
      disableMcp: true,
      requireServiceAuth: true,
      serviceToken: "service-secret",
      memoryStore: new InMemoryMemoryStore()
    });

    const missing = await app.inject({
      method: "GET",
      url: "/api/v1/memory/facts",
      headers: { "x-tenant-id": "tenant-a", "x-user-id": "user-a", "x-trace-id": "trace-a", "x-request-id": "request-a" }
    });
    const invalid = await app.inject({
      method: "GET",
      url: "/api/v1/memory/facts",
      headers: {
        authorization: "Bearer wrong",
        "x-tenant-id": "tenant-a",
        "x-user-id": "user-a",
        "x-trace-id": "trace-a",
        "x-request-id": "request-a"
      }
    });

    expect(missing.statusCode).toBe(401);
    expect(invalid.statusCode).toBe(401);
    expect(javaClient.calls).toBe(0);
    await app.close();
  });

  it("requires immutable identity headers in production", async () => {
    const app = await createServer({
      javaClient: new RecordingJavaClient(),
      disableMcp: true,
      requireServiceAuth: true,
      serviceToken: "service-secret",
      memoryStore: new InMemoryMemoryStore()
    });

    const res = await app.inject({
      method: "GET",
      url: "/api/v1/memory/facts",
      headers: {
        authorization: "Bearer service-secret",
        "x-tenant-id": "tenant-a",
        "x-user-id": "user-a",
        "x-trace-id": "trace-a"
      }
    });

    expect(res.statusCode).toBe(400);
    expect(res.json().error.errorClass).toBe("MISSING_IDENTITY_HEADER");
    await app.close();
  });

  it("accepts authenticated production requests with complete header identity", async () => {
    const app = await createServer({
      javaClient: new RecordingJavaClient(),
      disableMcp: true,
      requireServiceAuth: true,
      serviceToken: "service-secret",
      memoryStore: new InMemoryMemoryStore()
    });

    const res = await app.inject({
      method: "GET",
      url: "/api/v1/memory/facts",
      headers: {
        authorization: "Bearer service-secret",
        "x-tenant-id": "tenant-a",
        "x-user-id": "user-a",
        "x-trace-id": "trace-a",
        "x-request-id": "request-a"
      }
    });

    expect(res.statusCode).toBe(200);
    await app.close();
  });
});
