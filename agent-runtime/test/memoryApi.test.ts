import { describe, expect, it } from "vitest";
import { createServer } from "../src/server";
import { InMemoryHistoryStore } from "../src/history";
import { InMemoryMemoryStore } from "../src/memoryStore";
import type { JavaClient, PolicyEvaluateRequest, PolicyEvaluateResponse } from "../src/javaClient";
import type { CatalogResponse, ModelChatRequest, ToolCallRequest, TraceEvent } from "../src/types";

class RecordingJavaClient implements JavaClient {
  calls = { catalog: 0, chat: 0, executeTool: 0, postTrace: 0, evaluatePolicy: 0 };

  async getCatalog(): Promise<CatalogResponse> {
    this.calls.catalog++;
    return { catalogVersion: "v1", catalogHash: "h1", tools: [] };
  }

  async chat(_request: ModelChatRequest) {
    this.calls.chat++;
    return {
      requestId: "req",
      conversationId: "conv",
      rawProvider: "mock",
      message: { role: "assistant" as const, content: "ok" }
    };
  }

  async executeTool(_request: ToolCallRequest) {
    this.calls.executeTool++;
    return {
      requestId: "req",
      conversationId: "conv",
      toolCallId: "call",
      toolName: "tool",
      status: "ok" as const,
      result: {}
    };
  }

  async postTrace(_e: TraceEvent) {
    this.calls.postTrace++;
  }

  async evaluatePolicy(_req: PolicyEvaluateRequest): Promise<PolicyEvaluateResponse> {
    this.calls.evaluatePolicy++;
    return { requestId: "req", conversationId: "conv", decisions: [] };
  }
}

describe("Memory Management API", () => {
  it("upserts and lists memory facts using header-derived scope", async () => {
    const memoryStore = new InMemoryMemoryStore();
    const app = await createServer({ javaClient: new RecordingJavaClient(), disableMcp: true, memoryStore });

    const upsert = await app.inject({
      method: "PUT",
      url: "/api/v1/memory/facts",
      headers: { "x-tenant-id": "tenant-a", "x-user-id": "user-a" },
      payload: { content: "User prefers TypeScript examples.", tags: ["preference", "code"] }
    });

    expect(upsert.statusCode).toBe(200);
    const fact = upsert.json();
    expect(fact.tenantId).toBe("tenant-a");
    expect(fact.userId).toBe("user-a");
    expect(fact.content).toBe("User prefers TypeScript examples.");

    const listed = await app.inject({
      method: "GET",
      url: "/api/v1/memory/facts",
      headers: { "x-tenant-id": "tenant-a", "x-user-id": "user-a" }
    });

    expect(listed.statusCode).toBe(200);
    expect(listed.json().facts.map((f: { memoryId: string }) => f.memoryId)).toEqual([fact.memoryId]);
  });

  it("searches scoped memory facts with literal query and tags", async () => {
    const memoryStore = new InMemoryMemoryStore();
    await memoryStore.upsert({
      memoryId: "mem-1",
      tenantId: "tenant-a",
      userId: "user-a",
      content: "User likes PostgreSQL examples.",
      tags: ["database", "preference"]
    });
    await memoryStore.upsert({
      memoryId: "mem-2",
      tenantId: "tenant-a",
      userId: "user-b",
      content: "User likes PostgreSQL examples.",
      tags: ["database"]
    });
    const app = await createServer({ javaClient: new RecordingJavaClient(), disableMcp: true, memoryStore });

    const res = await app.inject({
      method: "GET",
      url: "/api/v1/memory/facts?query=postgres&tags=preference",
      headers: { "x-tenant-id": "tenant-a", "x-user-id": "user-a" }
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().facts.map((f: { memoryId: string }) => f.memoryId)).toEqual(["mem-1"]);
  });

  it("updates and deletes only facts in the caller scope", async () => {
    const memoryStore = new InMemoryMemoryStore();
    await memoryStore.upsert({ memoryId: "mem-1", tenantId: "tenant-a", userId: "user-a", content: "old", tags: [] });
    await memoryStore.upsert({ memoryId: "mem-1", tenantId: "tenant-a", userId: "user-b", content: "other", tags: [] });
    const app = await createServer({ javaClient: new RecordingJavaClient(), disableMcp: true, memoryStore });

    const update = await app.inject({
      method: "PUT",
      url: "/api/v1/memory/facts",
      headers: { "x-tenant-id": "tenant-a", "x-user-id": "user-a" },
      payload: { memoryId: "mem-1", content: "new", tags: ["current"] }
    });
    expect(update.statusCode).toBe(200);
    expect(update.json().content).toBe("new");

    const del = await app.inject({
      method: "DELETE",
      url: "/api/v1/memory/facts/mem-1",
      headers: { "x-tenant-id": "tenant-a", "x-user-id": "user-a" }
    });
    expect(del.statusCode).toBe(200);
    expect(del.json()).toEqual({ memoryId: "mem-1", deleted: true });

    expect(await memoryStore.list("tenant-a", "user-a")).toEqual([]);
    expect((await memoryStore.list("tenant-a", "user-b"))[0]?.content).toBe("other");
  });

  it("returns structured not-found evidence for missing scoped delete", async () => {
    const app = await createServer({
      javaClient: new RecordingJavaClient(),
      disableMcp: true,
      memoryStore: new InMemoryMemoryStore()
    });

    const res = await app.inject({
      method: "DELETE",
      url: "/api/v1/memory/facts/missing",
      headers: { "x-tenant-id": "tenant-a", "x-user-id": "user-a" }
    });

    expect(res.statusCode).toBe(404);
    expect(res.json()).toEqual({ memoryId: "missing", deleted: false });
  });

  it("rejects client-controlled scope and leaves history and Java untouched", async () => {
    const javaClient = new RecordingJavaClient();
    const history = new InMemoryHistoryStore();
    const app = await createServer({
      javaClient,
      disableMcp: true,
      memoryStore: new InMemoryMemoryStore(),
      historyStore: history
    });

    const res = await app.inject({
      method: "PUT",
      url: "/api/v1/memory/facts",
      headers: { "x-tenant-id": "tenant-a", "x-user-id": "user-a" },
      payload: { tenantId: "tenant-b", userId: "user-b", content: "bad", tags: [] }
    });

    expect(res.statusCode).toBe(400);
    expect(history.get("tenant-a", "conv-any")).toEqual([]);
    expect(javaClient.calls).toEqual({ catalog: 0, chat: 0, executeTool: 0, postTrace: 0, evaluatePolicy: 0 });
  });
});
