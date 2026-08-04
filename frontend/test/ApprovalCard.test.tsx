import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ApprovalCard } from "../src/ApprovalCard";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("ApprovalCard", () => {
  it("does not report success when a late approval loses the pending-owner race", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({
      error: {
        errorClass: "APPROVAL_NOT_PENDING",
        errorMessage: "ERROR-CANARY stale approval details"
      }
    }), {
      status: 409,
      headers: { "Content-Type": "application/json" }
    }));
    const onResolved = vi.fn();

    render(<ApprovalCard
      askUserId="approval-1"
      conversationId="conversation-1"
      executionId="execution-1"
      toolCallId="call-1"
      toolName="read_file"
      onResolved={onResolved}
    />);

    await userEvent.click(screen.getByRole("button", { name: "Approve" }));

    expect(await screen.findByText("审批已失效，请刷新执行状态")).toBeTruthy();
    expect(screen.queryByText("已批准")).toBeNull();
    expect(screen.queryByText(/ERROR-CANARY/)).toBeNull();
    expect(onResolved).not.toHaveBeenCalled();
  });
});
