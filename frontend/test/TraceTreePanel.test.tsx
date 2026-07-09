import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { TraceTreePanel } from "../src/TraceTreePanel";
import type { SSEEvent } from "../src/api";

function event(kind: Extract<SSEEvent, { durability: "durable" }>["kind"], data: Record<string, unknown>, seq: number): SSEEvent {
  return {
    durability: "durable",
    eventId: `tenant-1::user-1::conv-1:${seq}`,
    kind,
    executionId: "exec-parent",
    conversationId: "conv-1",
    tenantId: "tenant-1",
    userId: "user-1",
    traceId: "trace-1",
    requestId: "req-1",
    createdAt: seq,
    data
  };
}

const subagentEvents = [
  event("trace", {
      eventType: "SUBAGENT_START",
      status: "ok",
      attributes: {
        traceNodeKind: "subagent_execution",
        executionId: "exec-parent",
        parentExecutionId: "exec-parent",
        childExecutionId: "subagent-child",
        childConversationId: "conv::subagent-child",
        skillName: "worker-skill",
        toolCallId: "call-skill"
      }
    }, 1),
  event("trace", {
      eventType: "SUBAGENT_END",
      status: "error",
      attributes: {
        traceNodeKind: "subagent_execution",
        executionId: "exec-parent",
        parentExecutionId: "exec-parent",
        childExecutionId: "subagent-child",
        childConversationId: "conv::subagent-child",
        skillName: "worker-skill",
        toolCallId: "call-skill",
        durationMs: 42,
        costUsdMicros: 7,
        terminalClass: "SUBAGENT_TOOL_ERROR"
      }
    }, 2)
];

describe("TraceTreePanel", () => {
  it("groups subagent lifecycle events under a parent execution", () => {
    render(<TraceTreePanel events={subagentEvents} />);

    expect(screen.getByRole("heading", { name: "Trace Tree" })).toBeTruthy();
    expect(screen.getByText("exec-parent")).toBeTruthy();
    expect(screen.getByText("worker-skill")).toBeTruthy();
    expect(screen.getByText("subagent-child")).toBeTruthy();
    expect(screen.getByText("status: error")).toBeTruthy();
    expect(screen.getByText("duration: 42 ms")).toBeTruthy();
    expect(screen.getByText("cost: 7 µUSD")).toBeTruthy();
    expect(screen.getByText("terminal: SUBAGENT_TOOL_ERROR")).toBeTruthy();
  });

  it("falls back to flat JSON for events without trace-tree attributes", () => {
    render(<TraceTreePanel events={[event("agent_start", { traceId: "trace-legacy" }, 1)]} />);

    expect(screen.getByRole("heading", { name: "SSE Events" })).toBeTruthy();
    expect(screen.getByText(/trace-legacy/)).toBeTruthy();
  });
});
