import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { TraceTreePanel } from "../src/TraceTreePanel";

const subagentEvents = [
  {
    event: "trace",
    data: {
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
    }
  },
  {
    event: "trace",
    data: {
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
    }
  }
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
    render(<TraceTreePanel events={[{ event: "agent_start", data: { traceId: "trace-legacy" } }]} />);

    expect(screen.getByRole("heading", { name: "SSE Events" })).toBeTruthy();
    expect(screen.getByText(/trace-legacy/)).toBeTruthy();
  });
});
