import { describe, expect, it } from "vitest";
import type { SSEEvent } from "../src/api";
import { deriveRuntimeProgressFromEvents } from "../src/runtimeProgress";

function event(eventName: string, data: Record<string, unknown> = {}): SSEEvent {
  return {
    event: eventName,
    data: {
      executionId: "exec-1",
      conversationId: "conv-1",
      tenantId: "tenant-1",
      traceId: "trace-1",
      requestId: "req-1",
      createdAt: 1000,
      ...data
    }
  };
}

describe("deriveRuntimeProgressFromEvents", () => {
  it("does not stay waiting_approval after later execution events resume", () => {
    const progress = deriveRuntimeProgressFromEvents([
      event("approval_requested", { askUserId: "ask-1", toolCallId: "tool-1", toolName: "write_file", reason: "Needs approval", stepIndex: 1 }),
      event("tool_call", { toolCallId: "tool-1", toolName: "write_file", stepIndex: 1 }),
      event("model_call_start", { stepIndex: 2 })
    ]);

    expect(progress).toMatchObject({
      status: "running",
      currentActivity: "model_call",
      currentStep: 2
    });
  });

  it("keeps model activity when a generic trace event follows model_call_start", () => {
    const progress = deriveRuntimeProgressFromEvents([
      event("agent_start"),
      event("model_call_start", { stepIndex: 2 }),
      event("trace", { eventType: "MODEL_CALL_START", attributes: { stepIndex: 2 } })
    ]);

    expect(progress).toMatchObject({
      status: "running",
      currentActivity: "model_call",
      currentStep: 2
    });
  });

  it("preserves safe approval reason metadata", () => {
    const progress = deriveRuntimeProgressFromEvents([
      event("approval_requested", {
        askUserId: "ask-1",
        toolCallId: "tool-1",
        toolName: "write_file",
        reason: "Needs approval",
        approvalToken: "secret-token",
        stepIndex: 1
      })
    ]);

    expect(progress?.detail).toMatchObject({
      askUserId: "ask-1",
      toolCallId: "tool-1",
      toolName: "write_file",
      reason: "Needs approval"
    });
    expect(JSON.stringify(progress)).not.toContain("secret-token");
  });
});
