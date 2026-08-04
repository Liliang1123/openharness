import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { ExecutionActivityGroup } from "../src/ExecutionActivityGroup";
import type {
  ExecutionActivity,
  ExecutionActivityEntry
} from "../src/executionActivity";

function fiveReadFileTools(): ExecutionActivityEntry[] {
  return Array.from({ length: 5 }, (_, index) => ({
    id: `tool:call-${index + 1}`,
    kind: "tool",
    status: "ok",
    createdAt: (index + 1) * 100,
    stepIndex: 1,
    toolCallId: `call-${index + 1}`,
    toolName: "read_file"
  }));
}

function activity(overrides: Partial<ExecutionActivity> = {}): ExecutionActivity {
  return {
    executionId: "exec-1",
    status: "running",
    modelActive: true,
    startedAt: 100,
    updatedAt: 200,
    elapsedMs: 100,
    entries: [{
      id: "model:1:1",
      kind: "model",
      status: "running",
      createdAt: 100,
      stepIndex: 1
    }],
    tools: [],
    ...overrides
  };
}

describe("ExecutionActivityGroup", () => {
  it("auto-collapses when the same running activity becomes terminal and remains expandable", async () => {
    const tools = fiveReadFileTools();
    const { rerender } = render(<ExecutionActivityGroup activity={activity({
      modelActive: false,
      tools,
      entries: tools
    })} />);

    expect(screen.getByRole("button", { name: /执行中.*read_file ×5/ }))
      .toHaveAttribute("aria-expanded", "true");
    expect(screen.getAllByText("read_file")).toHaveLength(5);

    rerender(<ExecutionActivityGroup activity={activity({
      status: "completed",
      modelActive: false,
      terminalClass: "FINAL_ANSWER",
      tools,
      entries: tools
    })} />);

    const toggle = screen.getByRole("button", { name: /执行完成.*read_file ×5/ });
    await waitFor(() => expect(toggle).toHaveAttribute("aria-expanded", "false"));
    expect(screen.queryAllByText("read_file")).toHaveLength(0);

    await userEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    expect(screen.getAllByText("read_file")).toHaveLength(5);
  });

  it("shows thinking only while the model is active", () => {
    const { rerender } = render(
      <ExecutionActivityGroup activity={activity({ modelActive: true })} />
    );
    expect(screen.getByText("🤔 思考中...")).toBeTruthy();

    rerender(<ExecutionActivityGroup activity={activity({ modelActive: false })} />);
    expect(screen.queryByText("🤔 思考中...")).toBeNull();
  });

  it("shows safe terminal classes without raw error text", () => {
    render(<ExecutionActivityGroup activity={activity({
      status: "errored",
      modelActive: false,
      terminalClass: "MODEL_ERROR",
      upstreamErrorClass: "PROTOCOL_FAILURE"
    })} />);

    expect(screen.getByText(/MODEL_ERROR · PROTOCOL_FAILURE/)).toBeTruthy();
    expect(screen.getByRole("button")).toHaveAttribute("aria-expanded", "false");
  });

  it("starts running activity expanded", async () => {
    render(<ExecutionActivityGroup activity={activity()} />);

    const toggle = screen.getByRole("button", { name: /执行中/ });
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    expect(await screen.findByText(/模型调用 1/)).toBeTruthy();
  });
});
