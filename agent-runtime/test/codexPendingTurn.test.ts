import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_AGENT_DEFINITION } from "../src/agentDefinitionLoader";
import { AgentExecutionRunner } from "../src/agentExecutionRunner";
import { InMemoryExecutionStateStore } from "../src/executionStateStore";
import { InMemoryHistoryStore } from "../src/history";
import { JsonFileApprovalStore } from "../src/approvalStore";
import { AmbiguousHttpResultError, HttpJavaClient, type JavaClient, type PolicyEvaluateRequest } from "../src/javaClient";
import { InMemoryRuntimeEventStore } from "../src/runtimeEventStore";
import type { CatalogResponse, ModelChatRequest, ModelChatResponse, ToolCallRequest, TraceEvent } from "../src/types";

const input = {
  conversationId: "conv-codex",
  message: "run it",
  userId: "user-1",
  tenantId: "tenant-1",
  traceId: "trace-1",
  requestId: "request-1",
  headers: {
    Authorization: "Bearer AUTH-CANARY",
    "X-Tenant-Id": "tenant-1",
    "X-User-Id": "user-1",
    "X-Request-Id": "request-1"
  },
  agentDefinition: DEFAULT_AGENT_DEFINITION
};

function pending(callId: string, bridgeId: string, argumentsRaw = "{\"secret\":\"ARG-CANARY\"}") {
  return {
    bridgeId,
    threadId: "thread-1",
    turnId: "turn-1",
    callId,
    toolName: "do_thing",
    argumentsRaw,
    expiresAt: "2026-07-12T12:00:00Z"
  };
}

function catalog(): CatalogResponse {
  return {
    catalogVersion: "v1",
    catalogHash: "h1",
    tools: [{
      name: "do_thing",
      description: "Does one thing",
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

class PendingJavaClient implements JavaClient {
  chatCalls = 0;
  sequential = true;
  policyDecision = "ALLOW";
  toolFailure = false;
  toolDelayMs = 0;
  pendingArgumentsRaw = "{\"secret\":\"ARG-CANARY\"}";
  beforeInitialPendingReturn?: () => void;
  beforeLaterPendingReturn?: () => void;
  timeline?: string[];
  completions: Array<{ bridgeId: string; request: any }> = [];
  cancellations: Array<{ bridgeId: string; request: any }> = [];
  executions: ToolCallRequest[] = [];

  async getCatalog() { return catalog(); }
  async chat(request: ModelChatRequest) {
    this.chatCalls += 1;
    const response = {
      requestId: request.requestId,
      conversationId: request.conversationId,
      pendingTurn: pending("call-1", "bridge-1", this.pendingArgumentsRaw),
      rawProvider: "codex-app-server"
    };
    this.beforeInitialPendingReturn?.();
    return response;
  }
  async completeCodexToolCall(bridgeId: string, request: any): Promise<ModelChatResponse> {
    this.completions.push({ bridgeId, request });
    this.timeline?.push(`complete:${request.callId}`);
    if (this.sequential && this.completions.length === 1) {
      const response = {
        requestId: request.requestId,
        conversationId: request.conversationId,
        pendingTurn: pending("call-2", "bridge-1", this.pendingArgumentsRaw),
        rawProvider: "codex-app-server"
      };
      this.beforeLaterPendingReturn?.();
      return response;
    }
    return {
      requestId: request.requestId,
      conversationId: request.conversationId,
      message: { role: "assistant" as const, content: "final answer" },
      rawProvider: "codex-app-server"
    };
  }
  async cancelCodexTurn(bridgeId: string, request: any): Promise<ModelChatResponse> {
    this.cancellations.push({ bridgeId, request });
    this.timeline?.push(`cancel:${request.callId}`);
    return {
      requestId: request.requestId,
      conversationId: request.conversationId,
      error: {
        errorClass: "BRIDGE_TURN_GONE", errorMessage: "gone", retriable: false
      },
      rawProvider: "codex-app-server"
    };
  }
  async executeTool(request: ToolCallRequest) {
    this.executions.push(request);
    if (this.toolDelayMs) await new Promise((resolve) => setTimeout(resolve, this.toolDelayMs));
    if (this.toolFailure) throw new Error("RESULT-CANARY failure");
    return {
      requestId: request.requestId,
      conversationId: request.conversationId,
      toolCallId: request.toolCallId,
      toolName: request.toolName,
      status: "ok" as const,
      result: { text: "RESULT-CANARY" }
    };
  }
  async postTrace(_event: TraceEvent) {}
  async evaluatePolicy(request: PolicyEvaluateRequest) {
    return {
      requestId: request.requestId,
      conversationId: request.conversationId,
      decisions: request.toolCalls.map((call) => ({ toolCallId: call.id, decision: this.policyDecision }))
    };
  }
}

describe("Codex pending turn", () => {
  beforeEach(() => { process.env.COMPRESSION_AUTO = "false"; });
  afterEach(() => {
    delete process.env.COMPRESSION_AUTO;
    delete process.env.APPROVAL_TIMEOUT_MS;
    delete process.env.EXECUTION_TIMEOUT_MS;
    vi.restoreAllMocks();
  });

  it("uses fixed authenticated completion and cancel endpoints", async () => {
    const responses = [
      { requestId: "request-1", conversationId: "conv-codex", message: { role: "assistant", content: "done" }, rawProvider: "codex-app-server" },
      { requestId: "request-1", conversationId: "conv-codex", error: { errorClass: "BRIDGE_TURN_GONE", errorMessage: "gone", retriable: false, fallbackMode: "none", fallbackCount: 0, fallbackTaken: false, httpStatus: 200, metadata: {} }, rawProvider: "codex-app-server" }
    ];
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(async (_url, _init) => {
      const body = responses.shift();
      return new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } });
    });
    const client = new HttpJavaClient("http://127.0.0.1:8080");
    const submission = {
      requestId: "request-1", conversationId: "conv-codex", threadId: "thread-1", turnId: "turn-1",
      callId: "call-1", idempotencyKey: "stable-key", status: "ok" as const, content: "result"
    };
    await client.completeCodexToolCall("bridge-1", submission, input.headers);
    await client.cancelCodexTurn("bridge-1", {
      requestId: "request-1", conversationId: "conv-codex", threadId: "thread-1", turnId: "turn-1", callId: "call-1"
    }, input.headers);

    expect(fetchMock.mock.calls.map(([url]) => String(url))).toEqual([
      "http://127.0.0.1:8080/api/v1/model/codex/turns/bridge-1/tool-result",
      "http://127.0.0.1:8080/api/v1/model/codex/turns/bridge-1/cancel"
    ]);
    expect(fetchMock.mock.calls.every(([, init]) => (init?.headers as Record<string, string>).Authorization === "Bearer AUTH-CANARY")).toBe(true);
  });

  it("continues sequential calls in one model step without persisting transport payloads", async () => {
    const client = new PendingJavaClient();
    const history = new InMemoryHistoryStore();
    const events = new InMemoryRuntimeEventStore();
    const states = new InMemoryExecutionStateStore();
    const runner = new AgentExecutionRunner(client, history, undefined, events, states);

    const { done } = runner.start(input);
    const final = await done;

    expect(final.status).toBe("completed");
    expect(client.chatCalls).toBe(1);
    expect(client.executions.map((request) => request.toolCallId)).toEqual(["call-1", "call-2"]);
    expect(client.completions).toHaveLength(2);
    expect(client.completions.map(({ request }) => request.status)).toEqual(["ok", "ok"]);
    const stored = JSON.stringify(history.get("tenant-1", "user-1", "conv-codex"));
    expect(history.get("tenant-1", "user-1", "conv-codex").map((message) => message.role)).toEqual(["user", "assistant"]);
    expect(stored).toContain("final answer");
    expect(stored).not.toMatch(/bridge-1|ARG-CANARY|RESULT-CANARY/);
    const emitted = JSON.stringify(events.since("tenant-1", "user-1", "conv-codex", null));
    expect(emitted).not.toMatch(/bridge-1|ARG-CANARY|RESULT-CANARY|AUTH-CANARY/);
    expect(events.since("tenant-1", "user-1", "conv-codex", null)
      .filter((event) => event.kind === "tool_result")
      .map((event) => [event.data.toolCallId, event.data.status]))
      .toEqual([["call-1", "ok"], ["call-2", "ok"]]);
    expect(events.since("tenant-1", "user-1", "conv-codex", null).filter((event) => event.kind === "trace" && event.data.eventType === "STEP_START")).toHaveLength(1);
  });

  it.each([
    ["DENY", false, "rejected"],
    ["ALLOW", true, "error"]
  ])("maps policy/tool terminal outcome %s to %s", async (decision, toolFailure, expectedStatus) => {
    const client = new PendingJavaClient();
    client.sequential = false;
    client.policyDecision = decision;
    client.toolFailure = toolFailure;
    const events = new InMemoryRuntimeEventStore();
    const runner = new AgentExecutionRunner(
      client,
      new InMemoryHistoryStore(),
      undefined,
      events,
      new InMemoryExecutionStateStore()
    );

    const final = await runner.start(input).done;

    expect(final.status).toBe("completed");
    expect(client.completions).toHaveLength(1);
    expect(client.completions[0].request.status).toBe(expectedStatus);
    expect(JSON.stringify(client.completions[0].request)).not.toContain("RESULT-CANARY");
    expect(client.executions).toHaveLength(decision === "ALLOW" ? 1 : 0);
    const lifecycle = events.since("tenant-1", "user-1", "conv-codex", null);
    expect(lifecycle.filter((event) => event.kind === "tool_result"))
      .toEqual([expect.objectContaining({
        data: expect.objectContaining({
          toolCallId: "call-1",
          status: expectedStatus
        })
      })]);
    expect(lifecycle.filter((event) => event.kind === "tool_call"))
      .toHaveLength(decision === "ALLOW" ? 1 : 0);
  });

  it("keeps Codex approval payload transient and submits rejection", async () => {
    const client = new PendingJavaClient();
    client.sequential = false;
    client.policyDecision = "REQUIRE_APPROVAL";
    const history = new InMemoryHistoryStore();
    const events = new InMemoryRuntimeEventStore();
    const states = new InMemoryExecutionStateStore();
    const store = new JsonFileApprovalStore("/tmp/openharness-codex-pending-approval");
    const runner = new AgentExecutionRunner(client, history, undefined, events, states, store);
    const { executionId, done } = runner.start(input);
    await waitFor(() => events.since("tenant-1", "user-1", "conv-codex", null).some((event) => event.kind === "approval_requested"));

    expect(store.decide("tenant-1", "user-1", "conv-codex", executionId, "call-1", { action: "reject", respondedAt: new Date().toISOString() })).toBe(true);
    const final = await done;

    expect(final.status).toBe("completed");
    expect(client.completions[0].request.status).toBe("rejected");
    const lifecycle = events.since("tenant-1", "user-1", "conv-codex", null);
    expect(lifecycle.filter((event) => event.kind === "tool_call")).toHaveLength(0);
    expect(lifecycle.filter((event) => event.kind === "tool_result"))
      .toEqual([expect.objectContaining({
        data: expect.objectContaining({ toolCallId: "call-1", status: "rejected" })
      })]);
    expect(JSON.stringify(lifecycle)).not.toMatch(/ARG-CANARY|APPROVAL-CANARY|bridge-1/);
  });

  it("maps malformed pending arguments to error without executing a tool", async () => {
    const client = new PendingJavaClient();
    client.sequential = false;
    client.pendingArgumentsRaw = "not-json";
    const events = new InMemoryRuntimeEventStore();
    const runner = new AgentExecutionRunner(
      client,
      new InMemoryHistoryStore(),
      undefined,
      events,
      new InMemoryExecutionStateStore()
    );

    const final = await runner.start(input).done;

    expect(final.status).toBe("completed");
    expect(client.executions).toHaveLength(0);
    expect(client.completions[0].request).toMatchObject({ status: "error", content: "MODEL_TOOL_PARSE_ERROR" });
    const lifecycle = events.since("tenant-1", "user-1", "conv-codex", null);
    expect(lifecycle.filter((event) => event.kind === "tool_call")).toHaveLength(0);
    expect(lifecycle.filter((event) => event.kind === "tool_result"))
      .toEqual([expect.objectContaining({
        data: expect.objectContaining({ toolCallId: "call-1", status: "error" })
      })]);
  });

  it("commits a safe result before cancelling an initial pending call aborted immediately", async () => {
    const client = new PendingJavaClient();
    client.sequential = false;
    const states = new InMemoryExecutionStateStore();
    const events = new InMemoryRuntimeEventStore();
    const timeline: string[] = [];
    client.timeline = timeline;
    events.subscribe("tenant-1", "user-1", "conv-codex", (event) => {
      if (event.kind === "tool_result") timeline.push(`result:${String(event.data.toolCallId)}`);
      if (event.kind === "stream_error") timeline.push("stream_error");
    });
    client.beforeInitialPendingReturn = () => {
      const active = states.getActive("tenant-1", "user-1", "conv-codex");
      if (!active) throw new Error("Expected active execution");
      states.abort("tenant-1", "user-1", "conv-codex", active.executionId);
    };
    const runner = new AgentExecutionRunner(
      client,
      new InMemoryHistoryStore(),
      undefined,
      events,
      states
    );

    const final = await runner.start(input).done;

    expect(final.status).toBe("aborted");
    expect(client.executions).toHaveLength(0);
    expect(client.completions).toHaveLength(0);
    expect(client.cancellations).toHaveLength(1);
    expect(client.cancellations[0]).toMatchObject({
      bridgeId: "bridge-1",
      request: { threadId: "thread-1", turnId: "turn-1", callId: "call-1" }
    });
    expect(timeline).toEqual(["result:call-1", "cancel:call-1", "stream_error"]);
  });

  it("commits a safe result before cancelling a later pending call aborted immediately", async () => {
    const client = new PendingJavaClient();
    const states = new InMemoryExecutionStateStore();
    const events = new InMemoryRuntimeEventStore();
    const timeline: string[] = [];
    client.timeline = timeline;
    events.subscribe("tenant-1", "user-1", "conv-codex", (event) => {
      if (event.kind === "tool_result") timeline.push(`result:${String(event.data.toolCallId)}`);
      if (event.kind === "stream_error") timeline.push("stream_error");
    });
    client.beforeLaterPendingReturn = () => {
      const active = states.getActive("tenant-1", "user-1", "conv-codex");
      if (!active) throw new Error("Expected active execution");
      states.abort("tenant-1", "user-1", "conv-codex", active.executionId);
    };
    const runner = new AgentExecutionRunner(
      client,
      new InMemoryHistoryStore(),
      undefined,
      events,
      states
    );

    const final = await runner.start(input).done;

    expect(final.status).toBe("aborted");
    expect(client.executions.map((request) => request.toolCallId)).toEqual(["call-1"]);
    expect(client.completions).toHaveLength(1);
    expect(client.cancellations).toHaveLength(1);
    expect(client.cancellations[0]).toMatchObject({
      bridgeId: "bridge-1",
      request: { threadId: "thread-1", turnId: "turn-1", callId: "call-2" }
    });
    expect(timeline).toEqual([
      "result:call-1",
      "complete:call-1",
      "result:call-2",
      "cancel:call-2",
      "stream_error"
    ]);
  });

  it("cancels the exact pending turn when execution is aborted", async () => {
    const client = new PendingJavaClient();
    client.sequential = false;
    client.toolDelayMs = 50;
    const states = new InMemoryExecutionStateStore();
    const events = new InMemoryRuntimeEventStore();
    const runner = new AgentExecutionRunner(
      client,
      new InMemoryHistoryStore(),
      undefined,
      events,
      states
    );
    const { executionId, done } = runner.start(input);
    await waitFor(() => client.executions.length === 1);
    states.abort("tenant-1", "user-1", "conv-codex", executionId);

    const final = await done;

    expect(final.status).toBe("aborted");
    expect(client.completions).toHaveLength(0);
    expect(client.cancellations).toHaveLength(1);
    expect(client.cancellations[0]).toMatchObject({
      bridgeId: "bridge-1",
      request: { threadId: "thread-1", turnId: "turn-1", callId: "call-1" }
    });
    const lifecycle = events.since("tenant-1", "user-1", "conv-codex", null);
    expect(lifecycle.filter((event) => event.kind === "tool_result"))
      .toEqual([expect.objectContaining({
        data: expect.objectContaining({ toolCallId: "call-1", status: "error" })
      })]);
    expect(lifecycle.findIndex((event) => event.kind === "tool_result"))
      .toBeLessThan(lifecycle.findIndex((event) => event.kind === "stream_error"));
  });

  it("commits timeout feedback and cancels when the execution deadline expires during a tool", async () => {
    process.env.EXECUTION_TIMEOUT_MS = "10";
    const client = new PendingJavaClient();
    client.sequential = false;
    client.toolDelayMs = 50;
    const events = new InMemoryRuntimeEventStore();
    const runner = new AgentExecutionRunner(
      client,
      new InMemoryHistoryStore(),
      undefined,
      events,
      new InMemoryExecutionStateStore()
    );

    const final = await runner.start(input).done;

    expect(final).toMatchObject({ status: "errored", endReason: "EXECUTION_TIMEOUT" });
    expect(client.executions).toHaveLength(1);
    expect(client.completions).toHaveLength(0);
    expect(client.cancellations).toHaveLength(1);
    expect(client.cancellations[0]).toMatchObject({
      bridgeId: "bridge-1",
      request: { threadId: "thread-1", turnId: "turn-1", callId: "call-1" }
    });
    const lifecycle = events.since("tenant-1", "user-1", "conv-codex", null);
    const relevant = lifecycle.filter((event) =>
      event.kind === "tool_call"
      || event.kind === "tool_result"
      || event.kind === "stream_error"
    );
    expect(relevant).toEqual([
      expect.objectContaining({
        kind: "tool_call",
        data: expect.objectContaining({ toolCallId: "call-1" })
      }),
      expect.objectContaining({
        kind: "tool_result",
        data: expect.objectContaining({ toolCallId: "call-1", status: "timeout" })
      }),
      expect.objectContaining({
        kind: "stream_error",
        data: expect.objectContaining({ errorClass: "EXECUTION_TIMEOUT" })
      })
    ]);
    const eventCountAtTerminal = lifecycle.length;
    await new Promise((resolve) => setTimeout(resolve, client.toolDelayMs + 20));
    const afterToolSettles = events.since("tenant-1", "user-1", "conv-codex", null);
    expect(afterToolSettles).toHaveLength(eventCountAtTerminal);
    expect(afterToolSettles.at(-1)?.kind).toBe("stream_error");
  });

  it("submits approval timeout without exposing the pending payload", async () => {
    process.env.APPROVAL_TIMEOUT_MS = "10";
    const client = new PendingJavaClient();
    client.sequential = false;
    client.policyDecision = "REQUIRE_APPROVAL";
    const events = new InMemoryRuntimeEventStore();
    const runner = new AgentExecutionRunner(
      client,
      new InMemoryHistoryStore(),
      undefined,
      events,
      new InMemoryExecutionStateStore(),
      new JsonFileApprovalStore("/tmp/openharness-codex-pending-timeout")
    );

    const final = await runner.start(input).done;

    expect(final.status).toBe("completed");
    expect(client.completions).toHaveLength(1);
    expect(client.completions[0].request).toMatchObject({ status: "timeout", content: "APPROVAL_TIMEOUT" });
    const lifecycle = events.since("tenant-1", "user-1", "conv-codex", null);
    expect(lifecycle.filter((event) => event.kind === "tool_call")).toHaveLength(0);
    expect(lifecycle.filter((event) => event.kind === "tool_result"))
      .toEqual([expect.objectContaining({
        data: expect.objectContaining({ toolCallId: "call-1", status: "timeout" })
      })]);
    expect(JSON.stringify(lifecycle)).not.toMatch(/ARG-CANARY|AUTH-CANARY|bridge-1/);
  });

  it("retries one ambiguous completion with the identical idempotency payload", async () => {
    class AmbiguousOnceClient extends PendingJavaClient {
      attempts: any[] = [];
      override async completeCodexToolCall(bridgeId: string, request: any) {
        this.attempts.push(structuredClone(request));
        if (this.attempts.length === 1) throw new AmbiguousHttpResultError();
        return super.completeCodexToolCall(bridgeId, request);
      }
    }
    const client = new AmbiguousOnceClient();
    client.sequential = false;
    const runner = new AgentExecutionRunner(
      client,
      new InMemoryHistoryStore(),
      undefined,
      new InMemoryRuntimeEventStore(),
      new InMemoryExecutionStateStore()
    );

    const final = await runner.start(input).done;

    expect(final.status).toBe("completed");
    expect(client.executions).toHaveLength(1);
    expect(client.attempts).toHaveLength(2);
    expect(client.attempts[1]).toEqual(client.attempts[0]);
    expect(client.completions).toHaveLength(1);
  });

  it("does not retry a definitive completion failure and cancels exact correlation", async () => {
    class FailedCompletionClient extends PendingJavaClient {
      attempts = 0;
      override async completeCodexToolCall(): Promise<ModelChatResponse> {
        this.attempts += 1;
        throw new Error("OAUTH-CANARY RESULT-CANARY definitive response failure");
      }
    }
    const client = new FailedCompletionClient();
    client.sequential = false;
    const events = new InMemoryRuntimeEventStore();
    const runner = new AgentExecutionRunner(
      client,
      new InMemoryHistoryStore(),
      undefined,
      events,
      new InMemoryExecutionStateStore()
    );

    const final = await runner.start(input).done;

    expect(final.status).toBe("errored");
    expect(client.attempts).toBe(1);
    expect(client.executions).toHaveLength(1);
    expect(client.cancellations).toHaveLength(1);
    const lifecycle = events.since("tenant-1", "user-1", "conv-codex", null);
    expect(lifecycle.findIndex((event) => event.kind === "tool_call"))
      .toBeLessThan(lifecycle.findIndex((event) => event.kind === "tool_result"));
    expect(lifecycle.findIndex((event) => event.kind === "tool_result"))
      .toBeLessThan(lifecycle.findIndex((event) => event.kind === "stream_error"));
    expect(lifecycle.filter((event) => event.kind === "tool_result"))
      .toEqual([expect.objectContaining({
        data: expect.objectContaining({ toolCallId: "call-1", status: "ok" })
      })]);
    expect(JSON.stringify(lifecycle)).not.toMatch(/OAUTH-CANARY|RESULT-CANARY/);
  });
});

async function waitFor(predicate: () => boolean, timeoutMs = 1_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!predicate()) {
    if (Date.now() >= deadline) throw new Error("Timed out waiting for condition");
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
}
