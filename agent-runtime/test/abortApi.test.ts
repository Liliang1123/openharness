import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createServer } from "../src/server";
import { InMemoryRuntimeEventStore } from "../src/runtimeEventStore";
import { InMemoryExecutionStateStore } from "../src/executionStateStore";
import type { JavaClient, PolicyEvaluateRequest, PolicyEvaluateResponse } from "../src/javaClient";
import type { AgentMessage, CatalogResponse, ModelChatRequest, ToolCallRequest, TraceEvent } from "../src/types";

class SlowJavaClient implements JavaClient {
  modelDelayMs = 500;
  async getCatalog(): Promise<CatalogResponse> {
    return { catalogVersion: "v1", catalogHash: "h1", tools: [] };
  }
  async chat(request: ModelChatRequest) {
    await new Promise(r => setTimeout(r, this.modelDelayMs));
    return {
      requestId: request.requestId,
      conversationId: request.conversationId,
      rawProvider: "mock",
      message: { role: "assistant", content: "ok" } as AgentMessage
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

describe("abort execution API", () => {
  let store: InMemoryRuntimeEventStore;
  let executionStateStore: InMemoryExecutionStateStore;

  beforeEach(() => {
    store = new InMemoryRuntimeEventStore();
    executionStateStore = new InMemoryExecutionStateStore();
    process.env.HISTORY_STORE = "memory";
    process.env.HISTORY_DATA_DIR = "/tmp/openharness-test-abort";
    process.env.COMPRESSION_AUTO = "false";
  });

  afterEach(() => {
    delete process.env.HISTORY_STORE;
    delete process.env.HISTORY_DATA_DIR;
    delete process.env.COMPRESSION_AUTO;
  });

  it("abort running execution transitions to aborted and emits stream_error EXECUTION_ABORTED", async () => {
    const javaClient = new SlowJavaClient();
    javaClient.modelDelayMs = 500;
    const app = await createServer({ javaClient, runtimeEventStore: store, executionStateStore });

    await app.listen({ port: 0, host: "127.0.0.1" });
    const address = app.server.address();
    if (!address || typeof address === "string") throw new Error("no address");
    const baseUrl = `http://127.0.0.1:${address.port}`;

    try {
      // Kick off a stream — don't await it. Wait briefly so runner emits agent_start.
      const ac = new AbortController();
      const reqP = fetch(`${baseUrl}/api/v1/agent/chat/stream`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-User-Id": "u1",
          "X-Tenant-Id": "t1",
          "X-Trace-Id": "tr-abort",
          "X-Request-Id": "req-abort"
        },
        body: JSON.stringify({ conversationId: "conv-abort", message: "go" }),
        signal: ac.signal
      }).catch(e => { if (e.name === "AbortError") return null; throw e; });

      // Wait for runner to start (agent_start emitted, model call in flight).
      await new Promise(r => setTimeout(r, 100));

      // Read executionId from the first agent_start event in the store.
      const events = store.since("t1", "u1", "conv-abort", null);
      const agentStart = events.find(e => e.kind === "agent_start");
      expect(agentStart).toBeDefined();
      const executionId = agentStart!.executionId;

      // Abort via API.
      const abortResp = await fetch(`${baseUrl}/api/v1/sessions/conv-abort/executions/${executionId}/abort`, {
        method: "POST",
        headers: { "X-Tenant-Id": "t1", "X-User-Id": "u1" }
      });
      expect(abortResp.status).toBe(200);
      const abortBody = await abortResp.json() as { executionId: string; status: string };
      expect(abortBody.executionId).toBe(executionId);
      expect(abortBody.status).toBe("aborted");

      // Allow runner to detect abort and emit stream_error.
      await new Promise(r => setTimeout(r, 700));

      // The runner releases the SSE stream after emitting stream_error.
      ac.abort();
      await reqP;

      const finalEvents = store.since("t1", "u1", "conv-abort", null);
      const errEvent = finalEvents.find(e => e.kind === "stream_error");
      expect(errEvent).toBeDefined();
      expect(errEvent?.data.errorClass).toBe("EXECUTION_ABORTED");

      const state = executionStateStore.get("t1", "u1", "conv-abort", executionId);
      expect(state?.status).toBe("aborted");
    } finally {
      await app.close();
    }
  }, 15000);

  it("abort unknown executionId returns 404 EXECUTION_NOT_FOUND", async () => {
    const javaClient = new SlowJavaClient();
    const app = await createServer({ javaClient, runtimeEventStore: store, executionStateStore });

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/sessions/conv-x/executions/no-such-exec/abort",
      headers: { "x-tenant-id": "t1", "x-user-id": "u1" }
    });

    expect(res.statusCode).toBe(404);
    const body = res.json();
    expect(body.error?.errorClass).toBe("EXECUTION_NOT_FOUND");
  });

  it("abort already-completed execution is a no-op returning 200", async () => {
    const javaClient = new SlowJavaClient();
    javaClient.modelDelayMs = 0; // complete immediately
    const app = await createServer({ javaClient, runtimeEventStore: store, executionStateStore });

    await app.listen({ port: 0, host: "127.0.0.1" });
    const address = app.server.address();
    if (!address || typeof address === "string") throw new Error("no address");
    const baseUrl = `http://127.0.0.1:${address.port}`;

    try {
      const streamResp = await fetch(`${baseUrl}/api/v1/agent/chat/stream`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-User-Id": "u1",
          "X-Tenant-Id": "t1",
          "X-Trace-Id": "tr-done",
          "X-Request-Id": "req-done"
        },
        body: JSON.stringify({ conversationId: "conv-done", message: "go" })
      });
      // Drain stream until close.
      const reader = streamResp.body!.getReader();
      while (true) {
        const { done } = await reader.read();
        if (done) break;
      }

      const events = store.since("t1", "u1", "conv-done", null);
      const agentStart = events.find(e => e.kind === "agent_start");
      expect(agentStart).toBeDefined();
      const executionId = agentStart!.executionId;

      // Should be terminal by now.
      expect(executionStateStore.get("t1", "u1", "conv-done", executionId)?.status).toBe("completed");

      // Abort should be a 200 no-op.
      const abortResp = await fetch(`${baseUrl}/api/v1/sessions/conv-done/executions/${executionId}/abort`, {
        method: "POST",
        headers: { "X-Tenant-Id": "t1", "X-User-Id": "u1" }
      });
      expect(abortResp.status).toBe(200);
      const abortBody = await abortResp.json() as { executionId: string; status: string };
      expect(abortBody.status).toBe("completed");
    } finally {
      await app.close();
    }
  }, 15000);
});
