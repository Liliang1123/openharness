import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createServer } from "../src/server";
import { InMemoryRuntimeEventStore } from "../src/runtimeEventStore";
import { InMemoryExecutionStateStore } from "../src/executionStateStore";
import type { JavaClient, PolicyEvaluateRequest, PolicyEvaluateResponse } from "../src/javaClient";
import type { AgentMessage, CatalogResponse, ModelChatRequest, ToolCallRequest, TraceEvent } from "../src/types";

class SlowJavaClient implements JavaClient {
  modelDelayMs = 200;
  chatRequests: ModelChatRequest[] = [];

  async getCatalog(): Promise<CatalogResponse> {
    return { catalogVersion: "v1", catalogHash: "h1", tools: [] };
  }
  async chat(request: ModelChatRequest) {
    this.chatRequests.push(request);
    await new Promise(r => setTimeout(r, this.modelDelayMs));
    return {
      requestId: request.requestId,
      conversationId: request.conversationId,
      rawProvider: "mock",
      message: { role: "assistant", content: "final answer text" } as AgentMessage
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

describe("detached stream", () => {
  let store: InMemoryRuntimeEventStore;
  let executionStateStore: InMemoryExecutionStateStore;

  beforeEach(() => {
    store = new InMemoryRuntimeEventStore();
    executionStateStore = new InMemoryExecutionStateStore();
    process.env.HISTORY_STORE = "memory";
    process.env.HISTORY_DATA_DIR = "/tmp/openharness-test-detached";
    process.env.COMPRESSION_AUTO = "false";
  });

  afterEach(() => {
    delete process.env.HISTORY_STORE;
    delete process.env.HISTORY_DATA_DIR;
    delete process.env.COMPRESSION_AUTO;
  });

  it("client disconnect does not cancel runner; final answer reaches HistoryStore", async () => {
    const javaClient = new SlowJavaClient();
    javaClient.modelDelayMs = 300;
    const app = await createServer({ javaClient, runtimeEventStore: store, executionStateStore });

    // Use real listen + native fetch with AbortController to simulate disconnect.
    await app.listen({ port: 0, host: "127.0.0.1" });
    const address = app.server.address();
    if (!address || typeof address === "string") throw new Error("no address");
    const baseUrl = `http://127.0.0.1:${address.port}`;

    try {
      const ac = new AbortController();
      // Start the request but abort it shortly after to simulate client disconnect.
      const reqP = fetch(`${baseUrl}/api/v1/agent/chat/stream`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-User-Id": "u1",
          "X-Tenant-Id": "t1",
          "X-Trace-Id": "tr-disc",
          "X-Request-Id": "req-disc"
        },
        body: JSON.stringify({ conversationId: "conv-disc", message: "go" }),
        signal: ac.signal
      }).catch(e => {
        if (e.name === "AbortError") return null;
        throw e;
      });

      // Disconnect almost immediately, before the runner's first model call resolves.
      await new Promise(r => setTimeout(r, 50));
      ac.abort();
      await reqP;

      // Wait for runner (which keeps running detached) to complete.
      await new Promise(r => setTimeout(r, 600));

      // Verify final assistant message landed in HistoryStore.
      const sessionResp = await fetch(`${baseUrl}/api/v1/sessions/conv-disc`, {
        headers: { "X-Tenant-Id": "t1", "X-User-Id": "u1" }
      });
      expect(sessionResp.ok).toBe(true);
      const session = await sessionResp.json() as { messages: { role: string; content: unknown }[] };
      const hasAssistantFinal = session.messages.some(
        m => m.role === "assistant" && typeof m.content === "string" && m.content.includes("final answer text")
      );
      expect(hasAssistantFinal).toBe(true);

      // Verify the store has stream_done.
      const events = store.since("t1", "u1", "conv-disc", null);
      expect(events.some(e => e.kind === "stream_done")).toBe(true);
    } finally {
      await app.close();
    }
  }, 15000);

  it("reconnecting via session events SSE after disconnect receives the terminal event", async () => {
    const javaClient = new SlowJavaClient();
    javaClient.modelDelayMs = 200;
    const app = await createServer({ javaClient, runtimeEventStore: store, executionStateStore });

    await app.listen({ port: 0, host: "127.0.0.1" });
    const address = app.server.address();
    if (!address || typeof address === "string") throw new Error("no address");
    const baseUrl = `http://127.0.0.1:${address.port}`;

    try {
      const ac = new AbortController();
      const reqP = fetch(`${baseUrl}/api/v1/agent/chat/stream`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-User-Id": "u1",
          "X-Tenant-Id": "t1",
          "X-Trace-Id": "tr-recon",
          "X-Request-Id": "req-recon"
        },
        body: JSON.stringify({ conversationId: "conv-recon", message: "go" }),
        signal: ac.signal
      }).catch(e => { if (e.name === "AbortError") return null; throw e; });

      await new Promise(r => setTimeout(r, 50));
      ac.abort();
      await reqP;

      // Wait for runner to terminate.
      await new Promise(r => setTimeout(r, 500));

      // Reconnect via session events SSE — should replay buffered events and close on stream_done.
      const eventsResp = await fetch(`${baseUrl}/api/v1/sessions/conv-recon/events`, {
        headers: { "X-Tenant-Id": "t1", "X-User-Id": "u1" }
      });
      expect(eventsResp.ok).toBe(true);
      const body = await eventsResp.text();
      expect(body).toContain("event: stream_done");
      expect(body).toContain("event: agent_start");
    } finally {
      await app.close();
    }
  }, 15000);
});
