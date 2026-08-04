import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createServer } from "../src/server";
import { InMemoryRuntimeEventStore } from "../src/runtimeEventStore";
import type { JavaClient, PolicyEvaluateRequest, PolicyEvaluateResponse } from "../src/javaClient";
import type { RuntimeChatLifecycleLogger } from "../src/runtimeChatLifecycleLog";
import type { AgentMessage, CatalogResponse, ModelChatRequest, ToolCallRequest, TraceEvent } from "../src/types";

class FakeJavaClient implements JavaClient {
  async getCatalog(): Promise<CatalogResponse> {
    return {
      catalogVersion: "v1",
      catalogHash: "h1",
      tools: [
        {
          name: "do_thing",
          description: "Does a thing",
          parameters: { type: "object", properties: {}, required: [] },
          catalogVersion: "v1",
          catalogHash: "h1",
          permission: "safe",
          isReadOnly: true,
          isDestructive: false,
          requiresApproval: false,
          isConcurrencySafe: true
        }
      ]
    };
  }

  callCount = 0;
  async chat(request: ModelChatRequest) {
    this.callCount++;
    if (this.callCount === 1) {
      return {
        requestId: request.requestId,
        conversationId: request.conversationId,
        rawProvider: "mock",
        message: {
          role: "assistant",
          content: "",
          toolCalls: [{ id: "call-1", name: "do_thing", argumentsRaw: "{}" }]
        } as AgentMessage
      };
    }
    return {
      requestId: request.requestId,
      conversationId: request.conversationId,
      rawProvider: "mock",
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

  async postTrace(_e: TraceEvent) {}

  async evaluatePolicy(req: PolicyEvaluateRequest): Promise<PolicyEvaluateResponse> {
    return {
      requestId: req.requestId,
      conversationId: req.conversationId,
      decisions: req.toolCalls.map(tc => ({ toolCallId: tc.id, decision: "ALLOW", source: "NONE" }))
    };
  }
}

/** Parse SSE payload into [{ event, data }, ...]. */
function parseSse(body: string): Array<{ event: string; data: Record<string, unknown> }> {
  const result: Array<{ event: string; data: Record<string, unknown> }> = [];
  const blocks = body.split("\n\n").filter(b => b.trim());
  for (const block of blocks) {
    let event = "";
    let dataLine = "";
    for (const line of block.split("\n")) {
      if (line.startsWith("event: ")) event = line.slice(7);
      else if (line.startsWith("data: ")) dataLine = line.slice(6);
    }
    if (event && dataLine) {
      try { result.push({ event, data: JSON.parse(dataLine) }); } catch { /* ignore */ }
    }
  }
  return result;
}

describe("stream event ids", () => {
  let store: InMemoryRuntimeEventStore;

  beforeEach(() => {
    store = new InMemoryRuntimeEventStore();
    process.env.HISTORY_STORE = "memory";
    process.env.HISTORY_DATA_DIR = "/tmp/openharness-test-streamids";
    process.env.COMPRESSION_AUTO = "false";
  });

  afterEach(() => {
    delete process.env.HISTORY_STORE;
    delete process.env.HISTORY_DATA_DIR;
    delete process.env.COMPRESSION_AUTO;
  });

  it("injects one lifecycle logger into synchronous and streaming executions", async () => {
    const javaClient = new FakeJavaClient();
    const accepted = vi.fn();
    const terminal = vi.fn();
    const runtimeChatLifecycleLogger: RuntimeChatLifecycleLogger = { accepted, terminal };
    const app = await createServer({
      javaClient,
      runtimeEventStore: store,
      runtimeChatLifecycleLogger
    });

    const syncResponse = await app.inject({
      method: "POST",
      url: "/api/v1/agent/chat",
      headers: {
        "x-user-id": "u1",
        "x-tenant-id": "t1",
        "x-trace-id": "tr-lifecycle-sync",
        "x-request-id": "req-lifecycle-sync"
      },
      payload: { conversationId: "conv-lifecycle-sync", message: "go" }
    });
    const streamResponse = await app.inject({
      method: "POST",
      url: "/api/v1/agent/chat/stream",
      headers: {
        "x-user-id": "u1",
        "x-tenant-id": "t1",
        "x-trace-id": "tr-lifecycle-stream",
        "x-request-id": "req-lifecycle-stream"
      },
      payload: { conversationId: "conv-lifecycle-stream", message: "go" }
    });

    expect(syncResponse.statusCode).toBe(200);
    expect(streamResponse.statusCode).toBe(200);
    expect(parseSse(streamResponse.body).map(event => event.event)).toContain("stream_done");
    expect(accepted).toHaveBeenCalledTimes(2);
    expect(terminal).toHaveBeenCalledTimes(2);
    expect(accepted.mock.calls.map(([value]) => value)).toEqual([
      expect.objectContaining({
        conversationId: "conv-lifecycle-sync",
        requestId: "req-lifecycle-sync",
        traceId: "tr-lifecycle-sync"
      }),
      expect.objectContaining({
        conversationId: "conv-lifecycle-stream",
        requestId: "req-lifecycle-stream",
        traceId: "tr-lifecycle-stream"
      })
    ]);
    expect(terminal.mock.calls.map(([value, state]) => ({ value, state }))).toEqual([
      {
        value: expect.objectContaining({ conversationId: "conv-lifecycle-sync" }),
        state: expect.objectContaining({ status: "completed", stopReason: "FINAL_ANSWER" })
      },
      {
        value: expect.objectContaining({ conversationId: "conv-lifecycle-stream" }),
        state: expect.objectContaining({ status: "completed", stopReason: "FINAL_ANSWER" })
      }
    ]);
  });

  it("each SSE event data carries eventId, executionId, conversationId, tenantId, traceId, requestId, createdAt", async () => {
    const javaClient = new FakeJavaClient();
    const app = await createServer({ javaClient, runtimeEventStore: store });

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/agent/chat/stream",
      headers: {
        "content-type": "application/json",
        "x-user-id": "u1",
        "x-tenant-id": "t1",
        "x-trace-id": "tr-stream-1",
        "x-request-id": "req-stream-1"
      },
      payload: { conversationId: "conv-streamids", message: "go" }
    });

    expect(res.statusCode).toBe(200);
    const events = parseSse(res.body);
    expect(events.length).toBeGreaterThan(0);

    // Every event must carry the 7 ID/timing fields
    for (const ev of events) {
      expect(ev.data).toMatchObject({
        eventId: expect.any(String),
        executionId: expect.any(String),
        conversationId: "conv-streamids",
        tenantId: "t1",
        traceId: "tr-stream-1",
        requestId: "req-stream-1",
        createdAt: expect.any(Number)
      });
    }
  });

  it("executionId is the same across all events of one stream", async () => {
    const javaClient = new FakeJavaClient();
    const app = await createServer({ javaClient, runtimeEventStore: store });

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/agent/chat/stream",
      headers: { "x-user-id": "u1", "x-tenant-id": "t1", "x-trace-id": "tr-2", "x-request-id": "req-2" },
      payload: { conversationId: "conv-exec", message: "go" }
    });

    const events = parseSse(res.body);
    const executionIds = new Set(events.map(e => e.data.executionId));
    expect(executionIds.size).toBe(1);
  });

  it("eventId is strictly monotonically increasing within a conversation", async () => {
    const javaClient = new FakeJavaClient();
    const app = await createServer({ javaClient, runtimeEventStore: store });

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/agent/chat/stream",
      headers: { "x-user-id": "u1", "x-tenant-id": "t1", "x-trace-id": "tr-3", "x-request-id": "req-3" },
      payload: { conversationId: "conv-ids", message: "go" }
    });

    const events = parseSse(res.body);
    const seqs = events.map(e => Number((e.data.eventId as string).split(":").pop()));
    for (let i = 1; i < seqs.length; i++) {
      expect(seqs[i]).toBeGreaterThan(seqs[i - 1]);
    }
  });

  it("eventId space is per-conversation (each conversation starts at 1)", async () => {
    const javaClient1 = new FakeJavaClient();
    const javaClient2 = new FakeJavaClient();
    const app1 = await createServer({ javaClient: javaClient1, runtimeEventStore: store });
    const app2 = await createServer({ javaClient: javaClient2, runtimeEventStore: store });

    const r1 = await app1.inject({
      method: "POST",
      url: "/api/v1/agent/chat/stream",
      headers: { "x-user-id": "u1", "x-tenant-id": "t1", "x-trace-id": "tr-A", "x-request-id": "req-A" },
      payload: { conversationId: "conv-A", message: "go" }
    });
    const r2 = await app2.inject({
      method: "POST",
      url: "/api/v1/agent/chat/stream",
      headers: { "x-user-id": "u1", "x-tenant-id": "t1", "x-trace-id": "tr-B", "x-request-id": "req-B" },
      payload: { conversationId: "conv-B", message: "go" }
    });

    const idsA = parseSse(r1.body).map(e => e.data.eventId as string);
    const idsB = parseSse(r2.body).map(e => e.data.eventId as string);
    expect(idsA[0]).toBe("t1::u1::conv-A:1");
    expect(idsB[0]).toBe("t1::u1::conv-B:1");
  });

  it("preserves legacy event names and legacy data fields", async () => {
    const javaClient = new FakeJavaClient();
    const app = await createServer({ javaClient, runtimeEventStore: store });

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/agent/chat/stream",
      headers: { "x-user-id": "u1", "x-tenant-id": "t1", "x-trace-id": "tr-leg", "x-request-id": "req-leg" },
      payload: { conversationId: "conv-legacy", message: "go" }
    });

    const events = parseSse(res.body);
    const names = events.map(e => e.event);
    expect(names).toContain("agent_start");
    expect(names).toContain("model_call_start");
    expect(names).toContain("model_call_end");
    expect(names).toContain("tool_call");
    expect(names).toContain("tool_result");
    expect(names).toContain("final_answer");
    expect(names).toContain("agent_end");

    // legacy fields preserved on specific events
    const modelEnd = events.find(e => e.event === "model_call_end");
    expect(modelEnd?.data.data).toHaveProperty("stepIndex");
    expect(modelEnd?.data.data).toHaveProperty("hasToolCalls");

    const toolCall = events.find(e => e.event === "tool_call");
    expect(toolCall?.data.data).toHaveProperty("toolName");
  });

  it("appends events to the injected RuntimeEventStore mirroring the SSE wire", async () => {
    const javaClient = new FakeJavaClient();
    const app = await createServer({ javaClient, runtimeEventStore: store });

    await app.inject({
      method: "POST",
      url: "/api/v1/agent/chat/stream",
      headers: { "x-user-id": "u1", "x-tenant-id": "t1", "x-trace-id": "tr-store", "x-request-id": "req-store" },
      payload: { conversationId: "conv-store", message: "go" }
    });

    const stored = store.since("t1", "u1", "conv-store", null);
    expect(stored.length).toBeGreaterThan(0);
    expect(stored[0].kind).toBe("agent_start");
    expect(stored[0].executionId).toBeTruthy();
    expect(stored.every(e => e.tenantId === "t1")).toBe(true);
  });
});
