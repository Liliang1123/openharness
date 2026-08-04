import { describe, expect, it } from "vitest";
import type { SSEEvent } from "../src/api";
import { deriveExecutionActivity, summarizeTools } from "../src/executionActivity";

type DurableSSEEvent = Extract<SSEEvent, { durability: "durable" }>;

function event(
  kind: DurableSSEEvent["kind"],
  data: Record<string, unknown>,
  sequence: number,
  overrides: Partial<DurableSSEEvent> = {}
): DurableSSEEvent {
  return {
    durability: "durable",
    eventId: `tenant-1::user-1::conv-1:${sequence}`,
    executionId: "exec-1",
    conversationId: "conv-1",
    tenantId: "tenant-1",
    userId: "user-1",
    traceId: "trace-1",
    requestId: "req-1",
    createdAt: sequence * 100,
    kind,
    data,
    ...overrides
  };
}

describe("deriveExecutionActivity", () => {
  it("closes model work and retains five safe tool states", () => {
    const activity = deriveExecutionActivity([
      event("agent_start", {}, 1),
      event("model_call_start", { stepIndex: 1 }, 2),
      event("tool_call", { toolCallId: "call-1", toolName: "read_file", stepIndex: 1 }, 3),
      event("tool_result", { toolCallId: "call-1", toolName: "read_file", status: "ok", stepIndex: 1 }, 4),
      event("tool_call", { toolCallId: "call-2", toolName: "read_file", stepIndex: 1 }, 5),
      event("tool_result", { toolCallId: "call-2", toolName: "read_file", status: "ok", stepIndex: 1 }, 6),
      event("tool_call", { toolCallId: "call-3", toolName: "read_file", stepIndex: 1 }, 7),
      event("tool_result", { toolCallId: "call-3", toolName: "read_file", status: "ok", stepIndex: 1 }, 8),
      event("tool_call", { toolCallId: "call-4", toolName: "read_file", stepIndex: 1 }, 9),
      event("tool_result", { toolCallId: "call-4", toolName: "read_file", status: "ok", stepIndex: 1 }, 10),
      event("tool_call", { toolCallId: "call-5", toolName: "read_file", stepIndex: 1 }, 11),
      event("tool_result", { toolCallId: "call-5", toolName: "read_file", status: "ok", stepIndex: 1 }, 12),
      event("model_call_end", { stepIndex: 1, hasToolCalls: false }, 13),
      event("final_answer", { answer: "done" }, 14),
      event("stream_done", { stopReason: "FINAL_ANSWER" }, 15)
    ]);

    expect(activity).toMatchObject({
      executionId: "exec-1",
      status: "completed",
      modelActive: false,
      terminalClass: "FINAL_ANSWER"
    });
    expect(activity?.tools).toHaveLength(5);
    expect(activity?.tools.every((tool) => tool.status === "ok")).toBe(true);
    expect(summarizeTools(activity!.tools)).toBe("read_file ×5");
  });

  it("keeps only allowlisted terminal metadata", () => {
    const activity = deriveExecutionActivity([
      event("model_call_start", { prompt: "PROMPT-CANARY" }, 1),
      event("stream_error", {
        errorClass: "MODEL_ERROR",
        upstreamErrorClass: "PROTOCOL_FAILURE",
        errorMessage: "ERROR-CANARY",
        argumentsRaw: "ARG-CANARY",
        result: "RESULT-CANARY",
        bridgeId: "BRIDGE-CANARY",
        authorization: "AUTH-CANARY"
      }, 2)
    ]);

    expect(activity).toMatchObject({
      status: "errored",
      modelActive: false,
      terminalClass: "MODEL_ERROR",
      upstreamErrorClass: "PROTOCOL_FAILURE"
    });
    expect(JSON.stringify(activity)).not.toMatch(
      /PROMPT-CANARY|ERROR-CANARY|ARG-CANARY|RESULT-CANARY|BRIDGE-CANARY|AUTH-CANARY/
    );
  });

  it("deduplicates replayed durable event ids", () => {
    const toolCall = event(
      "tool_call",
      { toolCallId: "call-1", toolName: "read_file", stepIndex: 1 },
      2
    );
    const activity = deriveExecutionActivity([
      event("agent_start", {}, 1),
      toolCall,
      toolCall,
      event("tool_result", { toolCallId: "call-1", toolName: "read_file", status: "ok" }, 3)
    ]);

    expect(activity?.tools).toHaveLength(1);
    expect(activity?.entries.filter((entry) => entry.kind === "tool")).toHaveLength(1);
  });

  it("stops thinking on model_call_end without marking execution terminal", () => {
    const activity = deriveExecutionActivity([
      event("agent_start", {}, 1),
      event("model_call_start", { stepIndex: 1 }, 2),
      event("model_call_end", { stepIndex: 1, hasToolCalls: true }, 3)
    ]);

    expect(activity).toMatchObject({
      status: "running",
      modelActive: false
    });
    expect(activity?.entries).toContainEqual(expect.objectContaining({
      kind: "model",
      status: "completed",
      stepIndex: 1
    }));
  });

  it("projects only the most recent execution", () => {
    const previous = event("stream_done", { stopReason: "FINAL_ANSWER" }, 1, {
      executionId: "exec-previous"
    });
    const current = event("model_call_start", { stepIndex: 2 }, 2, {
      executionId: "exec-current"
    });

    const activity = deriveExecutionActivity([previous, current]);

    expect(activity).toMatchObject({
      executionId: "exec-current",
      status: "running",
      modelActive: true
    });
    expect(activity?.terminalClass).toBeUndefined();
  });

  it("ignores transient preview deltas", () => {
    const preview: SSEEvent = {
      durability: "transient",
      kind: "preview_delta",
      previewSeq: 1,
      executionId: "exec-preview",
      conversationId: "conv-1",
      tenantId: "tenant-1",
      userId: "user-1",
      traceId: "trace-1",
      requestId: "req-1",
      createdAt: 100,
      data: { delta: "PROMPT-CANARY" }
    };

    expect(deriveExecutionActivity([preview])).toBeNull();
  });
});
