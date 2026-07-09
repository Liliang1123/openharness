import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { rmSync } from "node:fs";
import { join } from "node:path";
import { createServer } from "../src/server";
import { InMemoryExecutionStateStore } from "../src/executionStateStore";
import { InMemoryRuntimeEventStore } from "../src/runtimeEventStore";
import type { JavaClient, PolicyEvaluateRequest, PolicyEvaluateResponse } from "../src/javaClient";
import type { CatalogResponse, ModelChatRequest, ToolCallRequest, TraceEvent } from "../src/types";

class StubJavaClient implements JavaClient {
  async getCatalog() {
    return { catalogVersion: "v1", catalogHash: "h1", tools: [] } as CatalogResponse;
  }
  async chat(_r: ModelChatRequest) {
    return {
      requestId: "x",
      conversationId: "x",
      rawProvider: "mock",
      message: { role: "assistant" as const, content: "ok" }
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

const TEST_DIR = "/tmp/openharness-sessions-api-test";

async function postChat(app: Awaited<ReturnType<typeof createServer>>, tenantId: string, conversationId: string, message: string) {
  return app.inject({
    method: "POST",
    url: "/api/v1/agent/chat",
    headers: {
      "x-user-id": "u1",
      "x-tenant-id": tenantId,
      "x-trace-id": "tr",
      "x-request-id": `r-${Math.random()}`
    },
    payload: { conversationId, message }
  });
}

describe("Sessions API", () => {
  let app: Awaited<ReturnType<typeof createServer>>;

  beforeEach(async () => {
    rmSync(TEST_DIR, { recursive: true, force: true });
    process.env.HISTORY_STORE = "file";
    process.env.HISTORY_DATA_DIR = TEST_DIR;
    process.env.COMPRESSION_AUTO = "false";
    app = await createServer({ javaClient: new StubJavaClient() });
  });

  afterEach(async () => {
    await app.close();
    rmSync(TEST_DIR, { recursive: true, force: true });
    delete process.env.HISTORY_STORE;
    delete process.env.HISTORY_DATA_DIR;
    delete process.env.COMPRESSION_AUTO;
  });

  it("GET /api/v1/sessions returns empty list initially", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/v1/sessions",
      headers: { "x-tenant-id": "t-empty" }
    });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.payload)).toEqual([]);
  });

  it("GET /api/v1/sessions lists existing sessions with title and updatedAt", async () => {
    await postChat(app, "t1", "conv-a", "hello world from user");
    await new Promise(r => setTimeout(r, 5));
    await postChat(app, "t1", "conv-b", "another message");

    const res = await app.inject({
      method: "GET",
      url: "/api/v1/sessions",
      headers: { "x-tenant-id": "t1" }
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body).toHaveLength(2);
    expect(body[0].conversationId).toBe("conv-b"); // sorted desc
    expect(body[0].title).toBe("another message");
    expect(body[1].title).toBe("hello world from user");
    expect(typeof body[0].updatedAt).toBe("string");
  });

  it("GET /api/v1/sessions isolates by tenant", async () => {
    await postChat(app, "t1", "c-t1", "for tenant 1");
    await postChat(app, "t2", "c-t2", "for tenant 2");

    const res1 = await app.inject({ method: "GET", url: "/api/v1/sessions", headers: { "x-tenant-id": "t1" } });
    expect(JSON.parse(res1.payload)).toHaveLength(1);
    expect(JSON.parse(res1.payload)[0].conversationId).toBe("c-t1");
  });

  it("GET /api/v1/sessions/:id hides same-tenant cross-user active execution state", async () => {
    const executionStateStore = new InMemoryExecutionStateStore();
    const runtimeEventStore = new InMemoryRuntimeEventStore();
    const localApp = await createServer({
      javaClient: new StubJavaClient(),
      executionStateStore,
      runtimeEventStore
    });
    try {
      executionStateStore.create({
        tenantId: "tenant-a",
        userId: "user-a",
        conversationId: "conv-shared",
        executionId: "exec-user-a"
      });
      runtimeEventStore.append("tenant-a", "conv-shared", {
        executionId: "exec-user-a",
        conversationId: "conv-shared",
        tenantId: "tenant-a",
        userId: "user-a",
        traceId: "trace-a",
        requestId: "request-a",
        createdAt: 1,
        kind: "agent_start",
        data: {}
      });

      const res = await localApp.inject({
        method: "GET",
        url: "/api/v1/sessions/conv-shared",
        headers: { "x-tenant-id": "tenant-a", "x-user-id": "user-b" }
      });

      expect(res.statusCode).toBe(404);
      expect(res.payload).not.toContain("exec-user-a");
    } finally {
      await localApp.close();
    }
  });

  it("GET /api/v1/sessions/:id returns 404 for missing session", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/v1/sessions/nonexistent",
      headers: { "x-tenant-id": "t1" }
    });
    expect(res.statusCode).toBe(404);
  });

  it("GET /api/v1/sessions/:id returns messages for existing session", async () => {
    await postChat(app, "t1", "c1", "hi there");
    const res = await app.inject({
      method: "GET",
      url: "/api/v1/sessions/c1",
      headers: { "x-tenant-id": "t1" }
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.conversationId).toBe("c1");
    expect(body.messages.length).toBeGreaterThan(0);
    expect(body.messages[0].role).toBe("user");
  });

  it("GET /api/v1/sessions/:id includes runtime progress for active execution", async () => {
    const runtimeEventStore = new InMemoryRuntimeEventStore();
    const executionStateStore = new InMemoryExecutionStateStore();
    const localApp = await createServer({
      javaClient: new StubJavaClient(),
      runtimeEventStore,
      executionStateStore
    });
    try {
      executionStateStore.create({
        tenantId: "t1",
        conversationId: "conv-progress",
        executionId: "exec-progress"
      });
      runtimeEventStore.append("t1", "conv-progress", {
        executionId: "exec-progress",
        conversationId: "conv-progress",
        tenantId: "t1",
        userId: "u1",
        traceId: "tr-progress",
        requestId: "req-progress",
        createdAt: 1500,
        kind: "model_call_start",
        data: { stepIndex: 2 }
      });

      const res = await localApp.inject({
        method: "GET",
        url: "/api/v1/sessions/conv-progress",
        headers: { "x-tenant-id": "t1" }
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.payload);
      expect(body.runtimeProgress).toMatchObject({
        executionId: "exec-progress",
        status: "running",
        currentActivity: "model_call",
        currentStep: 2
      });
    } finally {
      await localApp.close();
    }
  });

  it("DELETE /api/v1/sessions/:id removes session file", async () => {
    await postChat(app, "t1", "c1", "to be deleted");

    const del = await app.inject({
      method: "DELETE",
      url: "/api/v1/sessions/c1",
      headers: { "x-tenant-id": "t1" }
    });
    expect(del.statusCode).toBe(204);

    const list = await app.inject({ method: "GET", url: "/api/v1/sessions", headers: { "x-tenant-id": "t1" } });
    expect(JSON.parse(list.payload)).toHaveLength(0);
  });

  it("DELETE /api/v1/sessions/:id is idempotent", async () => {
    const res = await app.inject({
      method: "DELETE",
      url: "/api/v1/sessions/never-existed",
      headers: { "x-tenant-id": "t1" }
    });
    expect(res.statusCode).toBe(204);
  });
});
