import { afterEach, describe, expect, it } from "vitest";
import { DEFAULT_AGENT_DEFINITION } from "../src/agentDefinitionLoader";
import { AgentExecutionRunner } from "../src/agentExecutionRunner";
import { InMemoryExecutionStateStore } from "../src/executionStateStore";
import { InMemoryHistoryStore } from "../src/history";
import { InMemoryRuntimeEventStore } from "../src/runtimeEventStore";
import type { JavaClient, PolicyEvaluateRequest, PolicyEvaluateResponse } from "../src/javaClient";
import type { CatalogResponse, ModelChatRequest, ToolCallRequest, ToolCallResponse, TraceEvent } from "../src/types";

describe("execution timeout", () => {
  afterEach(() => {
    delete process.env.EXECUTION_TIMEOUT_MS;
    delete process.env.COMPRESSION_AUTO;
  });

  it("emits EXECUTION_TIMEOUT and marks execution errored when the runner exceeds the deadline", async () => {
    process.env.EXECUTION_TIMEOUT_MS = "20";
    process.env.COMPRESSION_AUTO = "false";
    const history = new InMemoryHistoryStore();
    const runtimeEventStore = new InMemoryRuntimeEventStore();
    const executionStateStore = new InMemoryExecutionStateStore();
    const runner = new AgentExecutionRunner(
      new HangingModelJavaClient(),
      history,
      undefined,
      runtimeEventStore,
      executionStateStore
    );

    const { executionId, done } = runner.start({
      conversationId: "conv-execution-timeout",
      message: "go",
      userId: "u1",
      tenantId: "t1",
      traceId: "tr1",
      requestId: "req1",
      agentDefinition: DEFAULT_AGENT_DEFINITION,
      headers: { Authorization: "Bearer test" }
    });

    const final = await Promise.race([
      done,
      new Promise<"test-timeout">((resolve) => setTimeout(() => resolve("test-timeout"), 250))
    ]);

    expect(final).not.toBe("test-timeout");
    if (final === "test-timeout") return;

    const terminal = runtimeEventStore
      .since("t1", "conv-execution-timeout", null)
      .find((event) => event.kind === "stream_error");

    expect(terminal?.data.errorClass).toBe("EXECUTION_TIMEOUT");
    expect(final.status).toBe("errored");
    expect(final.endReason).toBe("EXECUTION_TIMEOUT");
    expect(executionStateStore.get(executionId)?.endReason).toBe("EXECUTION_TIMEOUT");
  });
});

class HangingModelJavaClient implements JavaClient {
  async getCatalog(): Promise<CatalogResponse> {
    return { catalogVersion: "v1", catalogHash: "h1", tools: [] };
  }

  async chat(_request: ModelChatRequest) {
    return new Promise<never>(() => {});
  }

  async executeTool(_request: ToolCallRequest): Promise<ToolCallResponse> {
    throw new Error("execution timeout test should not execute tools");
  }

  async postTrace(_event: TraceEvent) {}

  async evaluatePolicy(req: PolicyEvaluateRequest): Promise<PolicyEvaluateResponse> {
    return { requestId: req.requestId, conversationId: req.conversationId, decisions: [] };
  }
}
