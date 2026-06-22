import { describe, expect, it } from "vitest";
import { createServer } from "../src/server";
import { InMemoryExecutionStateStore } from "../src/executionStateStore";
import { InMemoryRuntimeEventStore } from "../src/runtimeEventStore";
import type { JavaClient, PolicyEvaluateRequest, PolicyEvaluateResponse } from "../src/javaClient";
import type { CatalogResponse, ModelChatRequest, ToolCallRequest, ToolCallResponse, TraceEvent } from "../src/types";

describe("non-stream chat runner convergence", () => {
  it("POST /api/v1/agent/chat uses the detached runner event lifecycle", async () => {
    process.env.COMPRESSION_AUTO = "false";
    process.env.HISTORY_STORE = "memory";
    const runtimeEventStore = new InMemoryRuntimeEventStore();
    const executionStateStore = new InMemoryExecutionStateStore();
    const app = await createServer({
      javaClient: new ImmediateAnswerJavaClient(),
      runtimeEventStore,
      executionStateStore
    });

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/agent/chat",
      headers: { "x-user-id": "u1", "x-tenant-id": "t1", "x-trace-id": "tr1", "x-request-id": "req1" },
      payload: { conversationId: "conv-sync-runner", message: "hello" }
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({
      conversationId: "conv-sync-runner",
      answer: "ok",
      stopReason: "FINAL_ANSWER"
    });
    const events = runtimeEventStore.since("t1", "conv-sync-runner", null);
    expect(events.map((event) => event.kind)).toEqual([
      "agent_start",
      "model_call_start",
      "model_call_end",
      "final_answer",
      "agent_end",
      "stream_done"
    ]);
    expect(executionStateStore.getActive("t1", "conv-sync-runner")).toBeNull();

    await app.close();
    delete process.env.COMPRESSION_AUTO;
    delete process.env.HISTORY_STORE;
  });
});

class ImmediateAnswerJavaClient implements JavaClient {
  async getCatalog(): Promise<CatalogResponse> {
    return { catalogVersion: "v1", catalogHash: "h1", tools: [] };
  }

  async chat(request: ModelChatRequest) {
    return {
      requestId: request.requestId,
      conversationId: request.conversationId,
      rawProvider: "mock",
      message: { role: "assistant" as const, content: "ok" }
    };
  }

  async executeTool(_request: ToolCallRequest): Promise<ToolCallResponse> {
    throw new Error("non-stream runner test should not execute tools");
  }

  async postTrace(_event: TraceEvent) {}

  async evaluatePolicy(request: PolicyEvaluateRequest): Promise<PolicyEvaluateResponse> {
    return { requestId: request.requestId, conversationId: request.conversationId, decisions: [] };
  }
}
