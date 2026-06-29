import { describe, expect, it } from "vitest";
import type { SessionEvent } from "@openharness/shared-schema";
import { deriveRuntimeProgress } from "../src/runtimeProgress";
import type { ExecutionState } from "../src/executionStateStore";

function event(kind: SessionEvent["kind"], data: Record<string, unknown>, createdAt: number): SessionEvent {
  return {
    eventId: `t1::c1:${createdAt}`,
    executionId: "exec-1",
    conversationId: "c1",
    tenantId: "t1",
    traceId: "tr1",
    requestId: "req1",
    createdAt,
    kind,
    data
  };
}

function state(status: ExecutionState["status"], endReason?: string): ExecutionState {
  return {
    executionId: "exec-1",
    conversationId: "c1",
    tenantId: "t1",
    status,
    startedAt: 1000,
    updatedAt: 2000,
    endedAt: status === "running" || status === "waiting_approval" ? null : 2500,
    endReason,
    abortController: new AbortController()
  };
}

describe("deriveRuntimeProgress", () => {
  it("summarizes a running model call", () => {
    const progress = deriveRuntimeProgress({
      events: [
        event("agent_start", {}, 1000),
        event("model_call_start", { stepIndex: 2 }, 1500)
      ],
      state: state("running")
    });

    expect(progress).toMatchObject({
      executionId: "exec-1",
      status: "running",
      currentActivity: "model_call",
      currentStep: 2,
      maxObservedStep: 2,
      modelCalls: 1
    });
  });

  it("keeps model activity when a generic trace event follows model_call_start", () => {
    const progress = deriveRuntimeProgress({
      events: [
        event("agent_start", {}, 1000),
        event("model_call_start", { stepIndex: 2 }, 1500),
        event("trace", { eventType: "MODEL_CALL_START", attributes: { stepIndex: 2 } }, 1510)
      ],
      state: state("running")
    });

    expect(progress).toMatchObject({
      status: "running",
      currentActivity: "model_call",
      currentStep: 2
    });
  });

  it("summarizes waiting approval with safe metadata", () => {
    const progress = deriveRuntimeProgress({
      events: [
        event("approval_requested", {
          askUserId: "ask-1",
          toolCallId: "tool-1",
          toolName: "write_file",
          argumentsRaw: "{\"secret\":true}",
          approvalToken: "approval-secret",
          stepIndex: 1
        }, 1600)
      ],
      state: state("waiting_approval")
    });

    expect(progress?.currentActivity).toBe("waiting_approval");
    expect(progress?.detail).toMatchObject({
      askUserId: "ask-1",
      toolCallId: "tool-1",
      toolName: "write_file"
    });
    expect(JSON.stringify(progress)).not.toContain("approval-secret");
    expect(JSON.stringify(progress)).not.toContain("argumentsRaw");
  });

  it("summarizes terminal errors", () => {
    const progress = deriveRuntimeProgress({
      events: [
        event("stream_error", { errorClass: "TOOL_ERROR", errorMessage: "hidden detail" }, 2500)
      ],
      state: state("errored", "TOOL_ERROR")
    });

    expect(progress).toMatchObject({
      status: "errored",
      currentActivity: "terminal",
      detail: { terminalClass: "TOOL_ERROR" }
    });
    expect(JSON.stringify(progress)).not.toContain("hidden detail");
  });
});
