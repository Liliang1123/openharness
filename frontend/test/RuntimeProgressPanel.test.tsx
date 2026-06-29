import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { RuntimeProgressPanel } from "../src/RuntimeProgressPanel";
import type { RuntimeProgressSnapshot } from "../src/api";

function progress(overrides: Partial<RuntimeProgressSnapshot> = {}): RuntimeProgressSnapshot {
  return {
    conversationId: "conv-1",
    executionId: "exec-1",
    tenantId: "tenant-1",
    traceId: "trace-1",
    requestId: "req-1",
    status: "running",
    currentActivity: "model_call",
    startedAt: 1000,
    updatedAt: 2000,
    elapsedMs: 1000,
    currentStep: 2,
    maxObservedStep: 2,
    modelCalls: 1,
    toolCalls: 0,
    subagentCalls: 0,
    recentEvents: [],
    ...overrides
  };
}

describe("RuntimeProgressPanel", () => {
  it("renders running model progress", () => {
    render(<RuntimeProgressPanel progress={progress()} />);

    expect(screen.getByRole("heading", { name: "Runtime Progress" })).toBeTruthy();
    expect(screen.getByText("Running")).toBeTruthy();
    expect(screen.getByText("Step 2")).toBeTruthy();
    expect(screen.getByText("Model call")).toBeTruthy();
  });

  it("renders waiting approval details", () => {
    render(<RuntimeProgressPanel progress={progress({
      status: "waiting_approval",
      currentActivity: "waiting_approval",
      detail: { askUserId: "ask-1", toolCallId: "tool-1", toolName: "write_file" }
    })} />);

    expect(screen.getAllByText("Waiting approval").length).toBeGreaterThan(0);
    expect(screen.getByText("write_file")).toBeTruthy();
    expect(screen.getByText("tool-1")).toBeTruthy();
  });

  it("renders terminal error details", () => {
    render(<RuntimeProgressPanel progress={progress({
      status: "errored",
      currentActivity: "terminal",
      endedAt: 2500,
      detail: { terminalClass: "TOOL_ERROR" }
    })} />);

    expect(screen.getByText("Errored")).toBeTruthy();
    expect(screen.getAllByText("Terminal").length).toBeGreaterThan(0);
    expect(screen.getByText("TOOL_ERROR")).toBeTruthy();
  });
});
