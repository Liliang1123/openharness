import { afterEach, describe, expect, it } from "vitest";
import { DEFAULT_AGENT_DEFINITION } from "../src/agentDefinitionLoader";
import { AgentExecutionRunner } from "../src/agentExecutionRunner";
import { JsonFileApprovalStore } from "../src/approvalStore";
import { InMemoryExecutionStateStore } from "../src/executionStateStore";
import { InMemoryHistoryStore } from "../src/history";
import { InMemoryRuntimeEventStore } from "../src/runtimeEventStore";
import type { JavaClient, PolicyEvaluateRequest, PolicyEvaluateResponse } from "../src/javaClient";
import type { AgentMessage, CatalogResponse, ModelChatRequest, ToolCallRequest, ToolCallResponse, TraceEvent } from "../src/types";

describe("approval timeout", () => {
  afterEach(() => {
    delete process.env.APPROVAL_TIMEOUT_MS;
    delete process.env.COMPRESSION_AUTO;
  });

  it("emits APPROVAL_TIMEOUT and marks execution errored when no decision arrives", async () => {
    process.env.APPROVAL_TIMEOUT_MS = "20";
    process.env.COMPRESSION_AUTO = "false";
    const history = new InMemoryHistoryStore();
    const runtimeEventStore = new InMemoryRuntimeEventStore();
    const executionStateStore = new InMemoryExecutionStateStore();
    const approvalStore = new JsonFileApprovalStore("/tmp/openharness-approval-timeout-test");
    const runner = new AgentExecutionRunner(
      new ApprovalRequiredJavaClient(),
      history,
      undefined,
      runtimeEventStore,
      executionStateStore,
      approvalStore
    );

    const { executionId, done } = runner.start({
      conversationId: "conv-approval-timeout",
      message: "go",
      userId: "u1",
      tenantId: "t1",
      traceId: "tr1",
      requestId: "req1",
      agentDefinition: DEFAULT_AGENT_DEFINITION,
      headers: { Authorization: "Bearer test" }
    });

    const final = await done;
    const terminal = runtimeEventStore
      .since("t1", "conv-approval-timeout", null)
      .find((event) => event.kind === "stream_error");

    expect(terminal?.data.errorClass).toBe("APPROVAL_TIMEOUT");
    expect(final.status).toBe("errored");
    expect(final.endReason).toBe("APPROVAL_TIMEOUT");
    expect(executionStateStore.get(executionId)?.endReason).toBe("APPROVAL_TIMEOUT");
    expect(history.get("t1", "conv-approval-timeout").some((m) => m.content === "PENDING_APPROVAL")).toBe(false);
  });
});

class ApprovalRequiredJavaClient implements JavaClient {
  async getCatalog(): Promise<CatalogResponse> {
    return {
      catalogVersion: "v1",
      catalogHash: "h1",
      tools: [{
        name: "do_thing",
        description: "Does a thing",
        parameters: { type: "object", properties: {}, required: [] },
        permission: "safe",
        isReadOnly: true,
        isDestructive: false,
        requiresApproval: true,
        isConcurrencySafe: true
      }]
    };
  }

  async chat(request: ModelChatRequest) {
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

  async executeTool(_request: ToolCallRequest): Promise<ToolCallResponse> {
    throw new Error("approval timeout test should not execute tools");
  }

  async postTrace(_event: TraceEvent) {}

  async evaluatePolicy(req: PolicyEvaluateRequest): Promise<PolicyEvaluateResponse> {
    return {
      requestId: req.requestId,
      conversationId: req.conversationId,
      decisions: req.toolCalls.map((toolCall) => ({
        toolCallId: toolCall.id,
        decision: "REQUIRE_APPROVAL",
        source: "ORG_POLICY",
        reason: "needs approval",
        approvalToken: "approval-token-1"
      }))
    };
  }
}
