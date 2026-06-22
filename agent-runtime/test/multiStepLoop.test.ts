import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createServer } from "../src/server";
import * as compression from "../src/compression";
import type { JavaClient, PolicyEvaluateRequest, PolicyEvaluateResponse } from "../src/javaClient";
import type { AgentMessage, CatalogResponse, ModelChatRequest, ModelChatResponse, ToolCallRequest, ToolCallResponse, TraceEvent } from "../src/types";

/** FakeJavaClient whose chat() returns toolCalls for the first `toolRounds` calls,
 *  then returns a plain text answer. */
class FakeMultiStepClient implements JavaClient {
  chatRequests: ModelChatRequest[] = [];
  toolRequests: ToolCallRequest[] = [];
  traceEvents: TraceEvent[] = [];

  constructor(private readonly toolRounds: number) {}

  async getCatalog(_headers: Record<string, string>): Promise<CatalogResponse> {
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

  async chat(request: ModelChatRequest, _headers: Record<string, string>): Promise<ModelChatResponse> {
    this.chatRequests.push(request);
    const callIndex = this.chatRequests.length;
    if (callIndex <= this.toolRounds) {
      return {
        requestId: request.requestId,
        conversationId: request.conversationId,
        rawProvider: "mock",
        message: {
          role: "assistant",
          content: "",
          toolCalls: [{ id: `call-${callIndex}`, name: "do_thing", argumentsRaw: "{}" }]
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

  async executeTool(request: ToolCallRequest, _headers: Record<string, string>): Promise<ToolCallResponse> {
    this.toolRequests.push(request);
    return {
      requestId: request.requestId,
      conversationId: request.conversationId,
      toolCallId: request.toolCallId,
      toolName: request.toolName,
      status: "ok" as const,
      result: {}
    };
  }

  async postTrace(event: TraceEvent, _headers: Record<string, string>): Promise<void> {
    this.traceEvents.push(event);
  }

  async evaluatePolicy(req: PolicyEvaluateRequest, _headers: Record<string, string>): Promise<PolicyEvaluateResponse> {
    return {
      requestId: req.requestId,
      conversationId: req.conversationId,
      decisions: req.toolCalls.map(tc => ({ toolCallId: tc.id, decision: "ALLOW", source: "NONE" }))
    };
  }

  // Used by compress() via (javaClient as any).request
  async request(path: string): Promise<unknown> {
    if (path === "/api/v1/model/compress") return { summary: "compressed" };
    return {};
  }
}

const BASE_HEADERS = {
  "content-type": "application/json",
  "x-user-id": "u1",
  "x-tenant-id": "t1",
  "x-trace-id": "tr1",
  "x-request-id": "req1"
};

describe("multi-step loop", () => {
  beforeEach(() => {
    process.env.HISTORY_STORE = "memory";
    process.env.HISTORY_DATA_DIR = "/tmp/openharness-test-multistep";
    process.env.COMPRESSION_AUTO = "false";
  });

  afterEach(() => {
    delete process.env.HISTORY_STORE;
    delete process.env.HISTORY_DATA_DIR;
    delete process.env.COMPRESSION_AUTO;
    delete process.env.COMPRESSION_THRESHOLD;
  });

  // Case A: 3 tool rounds → FINAL_ANSWER, chat called ≥3 times
  it("A: 3-round tool loop completes with FINAL_ANSWER", async () => {
    const javaClient = new FakeMultiStepClient(3);
    const app = await createServer({ javaClient });

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/agent/chat",
      headers: BASE_HEADERS,
      payload: { conversationId: "conv-a", message: "go" }
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.stopReason).toBe("FINAL_ANSWER");
    expect(javaClient.chatRequests.length).toBeGreaterThanOrEqual(3);
    expect(javaClient.toolRequests.length).toBe(3);
  });

  // Case B: stepBudget=2 + always toolCalls → STEP_BUDGET_EXHAUSTED
  it("B: stepBudget=2 exhausted when model always returns toolCalls", async () => {
    const javaClient = new FakeMultiStepClient(999);
    const app = await createServer({ javaClient });

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/agent/chat",
      headers: BASE_HEADERS,
      payload: { conversationId: "conv-b", message: "go", stepBudget: 2 }
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.stopReason).toBe("STEP_BUDGET_EXHAUSTED");

    const budgetEvent = javaClient.traceEvents.find(e => e.eventType === "STEP_BUDGET_EXHAUSTED");
    expect(budgetEvent).toBeDefined();
    expect(budgetEvent?.attributes?.stepBudget).toBe(2);
  });

  // Case C: model answers immediately (no toolCalls) → FINAL_ANSWER, executeTool not called
  it("C: immediate answer without tool calls → FINAL_ANSWER, no executeTool", async () => {
    const javaClient = new FakeMultiStepClient(0);
    const app = await createServer({ javaClient });

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/agent/chat",
      headers: BASE_HEADERS,
      payload: { conversationId: "conv-c", message: "hello" }
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.stopReason).toBe("FINAL_ANSWER");
    expect(javaClient.toolRequests).toHaveLength(0);
  });

  // Case D: 3 tool rounds → autoCompress triggered exactly once per run
  it("D: autoCompress fires exactly once per run", async () => {
    process.env.COMPRESSION_AUTO = "true";
    process.env.COMPRESSION_THRESHOLD = "1"; // very low so compress always triggers

    const compressSpy = vi.spyOn(compression, "compress").mockResolvedValue(undefined);
    const javaClient = new FakeMultiStepClient(3);
    const app = await createServer({ javaClient });

    await app.inject({
      method: "POST",
      url: "/api/v1/agent/chat",
      headers: BASE_HEADERS,
      payload: { conversationId: "conv-d", message: "go" }
    });

    expect(compressSpy).toHaveBeenCalledTimes(1);
    compressSpy.mockRestore();
  });

  // Case E: STEP_START × N + STEP_END × N, stepIndex strictly increasing
  // Only steps with tool batches emit STEP_END; the final answer step does not.
  it("E: STEP_START and STEP_END events with strictly increasing stepIndex", async () => {
    const javaClient = new FakeMultiStepClient(3); // 3 tool rounds + 1 final answer round
    const app = await createServer({ javaClient });

    await app.inject({
      method: "POST",
      url: "/api/v1/agent/chat",
      headers: BASE_HEADERS,
      payload: { conversationId: "conv-e", message: "go" }
    });

    const stepStarts = javaClient.traceEvents.filter(e => e.eventType === "STEP_START");
    const stepEnds = javaClient.traceEvents.filter(e => e.eventType === "STEP_END");

    // 3 tool rounds + 1 final answer round = 4 STEP_START
    expect(stepStarts.length).toBe(4);
    // Only tool-batch steps emit STEP_END
    expect(stepEnds.length).toBe(3);

    // stepIndex strictly increasing in STEP_START events
    const startIndices = stepStarts.map(e => e.attributes?.stepIndex as number);
    for (let i = 1; i < startIndices.length; i++) {
      expect(startIndices[i]).toBeGreaterThan(startIndices[i - 1]);
    }

    // STEP_END stepIndex values also strictly increasing
    const endIndices = stepEnds.map(e => e.attributes?.stepIndex as number);
    for (let i = 1; i < endIndices.length; i++) {
      expect(endIndices[i]).toBeGreaterThan(endIndices[i - 1]);
    }
  });
});
