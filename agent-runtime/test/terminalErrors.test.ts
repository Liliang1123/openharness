import { describe, expect, it } from "vitest";
import { DEFAULT_AGENT_DEFINITION } from "../src/agentDefinitionLoader";
import { AgentExecutionRunner, type AgentExecutionInput } from "../src/agentExecutionRunner";
import { InMemoryExecutionStateStore } from "../src/executionStateStore";
import { InMemoryHistoryStore } from "../src/history";
import { InMemoryRuntimeEventStore } from "../src/runtimeEventStore";
import type { JavaClient, PolicyEvaluateRequest, PolicyEvaluateResponse } from "../src/javaClient";
import type {
  AgentMessage,
  CatalogResponse,
  ModelChatRequest,
  ToolCallRequest,
  ToolCallResponse,
  TraceEvent
} from "../src/types";

const baseInput = {
  conversationId: "conv-terminal",
  message: "go",
  userId: "u1",
  tenantId: "t1",
  traceId: "tr1",
  requestId: "req1",
  agentDefinition: DEFAULT_AGENT_DEFINITION,
  headers: { Authorization: "Bearer test" }
};

describe("runtime terminal error mapping", () => {
  it("maps model response errors to MODEL_ERROR", async () => {
    const result = await runTerminalCase({ modelError: true });

    expect(result.terminalEvent.data.errorClass).toBe("MODEL_ERROR");
    expect(result.finalState.status).toBe("errored");
    expect(result.finalState.endReason).toBe("MODEL_ERROR");
  });

  it("maps tool execution failures to TOOL_ERROR", async () => {
    const result = await runTerminalCase({ toolError: true });

    expect(result.terminalEvent.data.errorClass).toBe("TOOL_ERROR");
    expect(result.finalState.status).toBe("errored");
    expect(result.finalState.endReason).toBe("TOOL_ERROR");
  });

  it("maps policy denial to POLICY_DENY without writing a sentinel to history", async () => {
    const result = await runTerminalCase({ policyDecision: "DENY" });

    expect(result.terminalEvent.data.errorClass).toBe("POLICY_DENY");
    expect(result.finalState.status).toBe("errored");
    expect(result.finalState.endReason).toBe("POLICY_DENY");
    expect(result.history.get("t1", "conv-terminal").some((m) => m.content === "POLICY_DENY")).toBe(false);
  });

  it("maps missing model messages to EMPTY_MODEL_RESPONSE", async () => {
    const result = await runTerminalCase({ emptyModelResponse: true });

    expect(result.terminalEvent.data.errorClass).toBe("EMPTY_MODEL_RESPONSE");
    expect(result.finalState.status).toBe("errored");
    expect(result.finalState.endReason).toBe("EMPTY_MODEL_RESPONSE");
  });

  it("maps step budget exhaustion to STEP_BUDGET_EXHAUSTED", async () => {
    const result = await runTerminalCase({ alwaysToolCall: true }, { stepBudget: 1 });

    expect(result.terminalEvent.data.errorClass).toBe("STEP_BUDGET_EXHAUSTED");
    expect(result.finalState.status).toBe("errored");
    expect(result.finalState.endReason).toBe("STEP_BUDGET_EXHAUSTED");
  });
});

async function runTerminalCase(
  clientOptions: FakeJavaClientOptions,
  inputOptions: Partial<AgentExecutionInput> = {}
) {
  const history = new InMemoryHistoryStore();
  const runtimeEventStore = new InMemoryRuntimeEventStore();
  const executionStateStore = new InMemoryExecutionStateStore();
  const runner = new AgentExecutionRunner(
    new FakeJavaClient(clientOptions),
    history,
    undefined,
    runtimeEventStore,
    executionStateStore
  );

  process.env.COMPRESSION_AUTO = "false";
  try {
    const { executionId, done } = runner.start({ ...baseInput, ...inputOptions });
    const finalState = await done;
    const terminalEvent = runtimeEventStore
      .since("t1", "conv-terminal", null)
      .find((event) => event.kind === "stream_error");
    if (!terminalEvent) throw new Error("missing stream_error");
    expect(executionStateStore.get(executionId)).toEqual(finalState);
    return { finalState, terminalEvent, history };
  } finally {
    delete process.env.COMPRESSION_AUTO;
  }
}

interface FakeJavaClientOptions {
  modelError?: boolean;
  toolError?: boolean;
  policyDecision?: "ALLOW" | "DENY";
  emptyModelResponse?: boolean;
  alwaysToolCall?: boolean;
}

class FakeJavaClient implements JavaClient {
  private chatCount = 0;

  constructor(private readonly options: FakeJavaClientOptions) {}

  async getCatalog(): Promise<CatalogResponse> {
    return {
      catalogVersion: "v1",
      catalogHash: "h1",
      tools: [{
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
      }]
    };
  }

  async chat(request: ModelChatRequest) {
    this.chatCount += 1;
    if (this.options.modelError) {
      return {
        requestId: request.requestId,
        conversationId: request.conversationId,
        rawProvider: "mock",
        error: {
          errorClass: "UPSTREAM_MODEL_ERROR",
          errorMessage: "provider failed",
          retriable: false
        }
      };
    }
    if (this.options.emptyModelResponse) {
      return {
        requestId: request.requestId,
        conversationId: request.conversationId,
        rawProvider: "mock"
      };
    }
    if (this.options.alwaysToolCall || this.chatCount === 1) {
      return {
        requestId: request.requestId,
        conversationId: request.conversationId,
        rawProvider: "mock",
        message: toolCallMessage()
      };
    }
    return {
      requestId: request.requestId,
      conversationId: request.conversationId,
      rawProvider: "mock",
      message: { role: "assistant", content: "done" } as AgentMessage
    };
  }

  async executeTool(request: ToolCallRequest): Promise<ToolCallResponse> {
    if (this.options.toolError) {
      return {
        requestId: request.requestId,
        conversationId: request.conversationId,
        toolCallId: request.toolCallId,
        toolName: request.toolName,
        status: "error",
        error: {
          errorClass: "TOOL_BACKEND_ERROR",
          errorMessage: "tool failed",
          retriable: false
        }
      };
    }
    return {
      requestId: request.requestId,
      conversationId: request.conversationId,
      toolCallId: request.toolCallId,
      toolName: request.toolName,
      status: "ok",
      result: {}
    };
  }

  async postTrace(_event: TraceEvent) {}

  async evaluatePolicy(req: PolicyEvaluateRequest): Promise<PolicyEvaluateResponse> {
    return {
      requestId: req.requestId,
      conversationId: req.conversationId,
      decisions: req.toolCalls.map((toolCall) => ({
        toolCallId: toolCall.id,
        decision: this.options.policyDecision ?? "ALLOW",
        source: this.options.policyDecision === "DENY" ? "ORG_POLICY" : "NONE",
        reason: this.options.policyDecision === "DENY" ? "blocked by policy" : undefined
      }))
    };
  }
}

function toolCallMessage(): AgentMessage {
  return {
    role: "assistant",
    content: "",
    toolCalls: [{ id: "call-1", name: "do_thing", argumentsRaw: "{}" }]
  };
}
