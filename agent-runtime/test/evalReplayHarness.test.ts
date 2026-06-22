import { describe, expect, it } from "vitest";
import { runEvalCase } from "../src/evalReplayHarness";
import type { JavaClient } from "../src/javaClient";
import { InMemoryMemoryStore } from "../src/memoryStore";
import type {
  CatalogResponse,
  ModelChatRequest,
  ModelChatResponse,
  ToolCallRequest,
  ToolCallResponse,
  TraceEvent
} from "../src/types";

class FixedAnswerJavaClient implements JavaClient {
  readonly requests: ModelChatRequest[] = [];

  constructor(private readonly answer: string) {}

  async getCatalog(_headers: Record<string, string>): Promise<CatalogResponse> {
    return { catalogVersion: "v1", catalogHash: "hash", tools: [] };
  }

  async chat(request: ModelChatRequest, _headers: Record<string, string>): Promise<ModelChatResponse> {
    this.requests.push(request);
    return {
      requestId: request.requestId,
      conversationId: request.conversationId,
      message: { role: "assistant", content: this.answer },
      rawProvider: "fixed"
    };
  }

  async executeTool(_request: ToolCallRequest, _headers: Record<string, string>): Promise<ToolCallResponse> {
    throw new Error("unexpected tool call");
  }

  async postTrace(_event: TraceEvent, _headers: Record<string, string>): Promise<void> {}

  async evaluatePolicy() {
    return { requestId: "policy", conversationId: "conv", decisions: [] };
  }
}

class MemoryAwareJavaClient extends FixedAnswerJavaClient {
  override async chat(request: ModelChatRequest, headers: Record<string, string>): Promise<ModelChatResponse> {
    this.requests.push(request);
    const sawMemory = request.messages.some((message) =>
      message.role === "system" && String(message.content).includes("prefers concise answers")
    );
    return {
      requestId: request.requestId,
      conversationId: request.conversationId,
      message: { role: "assistant", content: sawMemory ? "concise remembered answer" : "generic answer" },
      rawProvider: "memory-aware"
    };
  }
}

describe("EvalReplayHarness", () => {
  it("passes an eval case with matching answer criteria", async () => {
    const result = await runEvalCase(
      {
        evalId: "eval-1",
        tenantId: "tenant-a",
        userId: "user-a",
        conversationId: "conv-a",
        input: "Say hello",
        expectedAnswerContains: "hello",
        expectedStopReason: "FINAL_ANSWER"
      },
      new FixedAnswerJavaClient("hello from the harness")
    );

    expect(result.passed).toBe(true);
    expect(result.answer).toContain("hello");
    expect(result.stopReason).toBe("FINAL_ANSWER");
    expect(result.events.map((event) => event.kind)).toContain("final_answer");
    expect(result.events.map((event) => event.kind)).toContain("stream_done");
  });

  it("returns failure evidence for mismatched answer criteria", async () => {
    const result = await runEvalCase(
      {
        evalId: "eval-2",
        tenantId: "tenant-a",
        userId: "user-a",
        conversationId: "conv-b",
        input: "Say hello",
        expectedAnswerContains: "goodbye"
      },
      new FixedAnswerJavaClient("hello from the harness")
    );

    expect(result.passed).toBe(false);
    expect(result.failureReason).toContain("expectedAnswerContains");
    expect(result.answer).toBe("hello from the harness");
    expect(result.events.length).toBeGreaterThan(0);
  });

  it("can replay an eval case with memory retrieval enabled", async () => {
    const memoryStore = new InMemoryMemoryStore();
    await memoryStore.upsert({
      memoryId: "mem-1",
      tenantId: "tenant-a",
      userId: "user-a",
      content: "hello means the user prefers concise answers",
      tags: ["hello"]
    });
    const javaClient = new MemoryAwareJavaClient("generic answer");

    const result = await runEvalCase(
      {
        evalId: "eval-3",
        tenantId: "tenant-a",
        userId: "user-a",
        conversationId: "conv-c",
        input: "hello",
        expectedAnswerContains: "remembered"
      },
      javaClient,
      { memoryStore }
    );

    expect(result.passed).toBe(true);
    expect(result.answer).toBe("concise remembered answer");
    expect(javaClient.requests[0].meta.context?.layers).toContain("memory_retrieval");
  });
});
