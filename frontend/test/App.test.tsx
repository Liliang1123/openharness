import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { App } from "../src/App";

function mockSSEResponse(events: { event: string; data: Record<string, unknown> }[]) {
  const body = events.map((e, index) => `event: ${e.event}\ndata: ${JSON.stringify({
    durability: "durable",
    eventId: `tenant-001::user-001::conv-1:${index + 1}`,
    executionId: "exec-1",
    conversationId: "conv-1",
    tenantId: "tenant-001",
    userId: "user-001",
    traceId: "trace-1",
    requestId: "req-1",
    createdAt: index + 1,
    data: e.data
  })}\n\n`).join("");
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(encoder.encode(body));
      controller.close();
    }
  });
  return new Response(stream, { status: 200, headers: { "Content-Type": "text/event-stream" } });
}

function makeFetchRouter(sseEvents: { event: string; data: Record<string, unknown> }[]) {
  return vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input.toString();
    if (url.endsWith("/api/v1/sessions") && (!init?.method || init.method === "GET")) {
      return new Response(JSON.stringify([]), { status: 200, headers: { "Content-Type": "application/json" } });
    }
    if (url.includes("/api/v1/agent/chat/stream")) {
      return mockSSEResponse(sseEvents);
    }
    return new Response("{}", { status: 200 });
  });
}

describe("App with SSE", () => {
  it("renders final answer from SSE stream", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(
      makeFetchRouter([
        { event: "agent_start", data: { traceId: "t1" } },
        { event: "model_call_start", data: { step: 1 } },
        { event: "model_call_end", data: { step: 1 } },
        { event: "final_answer", data: { answer: "你好世界" } }
      ]) as unknown as typeof fetch
    );

    render(<App />);
    const input = screen.getByLabelText("Message");
    await userEvent.type(input, "hello");
    await userEvent.click(screen.getByRole("button", { name: "Send" }));

    await waitFor(() => {
      expect(screen.getByText("你好世界")).toBeTruthy();
    });

    vi.restoreAllMocks();
  });

  it("renders ApprovalCard on pending_approval", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(
      makeFetchRouter([
        { event: "agent_start", data: {} },
        { event: "tool_result", data: { toolName: "submit_payment", status: "pending_approval", askUserId: "ask-1", reason: "需要审批" } },
        { event: "final_answer", data: { answer: "" } }
      ]) as unknown as typeof fetch
    );

    render(<App />);
    const input = screen.getByLabelText("Message");
    await userEvent.type(input, "pay");
    await userEvent.click(screen.getByRole("button", { name: "Send" }));

    await waitFor(() => {
      expect(screen.getByRole("alert", { name: "Approval required" })).toBeTruthy();
      expect(screen.getByRole("alert", { name: "Approval required" }).textContent).toContain("submit_payment");
      expect(screen.getByRole("button", { name: "Approve" })).toBeTruthy();
      expect(screen.getByRole("button", { name: "Reject" })).toBeTruthy();
    });

    vi.restoreAllMocks();
  });

  it("tolerates unknown SSE event fields (eventId/executionId/createdAt)", async () => {
    // Phase 1 of add-execution-lifecycle-and-stream-recovery introduces new event data
    // fields. Frontend parser must ignore unknown fields without breaking.
    vi.spyOn(globalThis, "fetch").mockImplementation(
      makeFetchRouter([
        { event: "agent_start", data: { eventId: "t1::c1:1", executionId: "exec-1", createdAt: 1779700000000, traceId: "t1" } },
        { event: "model_call_start", data: { eventId: "t1::c1:2", executionId: "exec-1", stepIndex: 1 } },
        { event: "model_call_end", data: { eventId: "t1::c1:3", executionId: "exec-1", stepIndex: 1, hasToolCalls: false } },
        { event: "final_answer", data: { eventId: "t1::c1:4", executionId: "exec-1", answer: "ok-with-ids" } },
        { event: "agent_end", data: { eventId: "t1::c1:5", executionId: "exec-1", stopReason: "FINAL_ANSWER" } },
        { event: "stream_done", data: { eventId: "t1::c1:6", executionId: "exec-1", stopReason: "FINAL_ANSWER" } }
      ]) as unknown as typeof fetch
    );

    render(<App />);
    const input = screen.getByLabelText("Message");
    await userEvent.type(input, "hello");
    await userEvent.click(screen.getByRole("button", { name: "Send" }));

    await waitFor(() => {
      expect(screen.getByText("ok-with-ids")).toBeTruthy();
    });

    vi.restoreAllMocks();
  });

  it("renders interrupted terminal state from durable SSE", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(
      makeFetchRouter([
        { event: "agent_start", data: {} },
        { event: "stream_error", data: { errorClass: "EXECUTION_INTERRUPTED" } }
      ]) as unknown as typeof fetch
    );

    render(<App />);
    await userEvent.type(screen.getByLabelText("Message"), "resume");
    await userEvent.click(screen.getByRole("button", { name: "Send" }));

    await waitFor(() => {
      expect(screen.getByText("EXECUTION_INTERRUPTED")).toBeTruthy();
    });

    vi.restoreAllMocks();
  });

  it("renders ApprovalCard from session pendingApprovals on session load", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = typeof input === "string" ? input : input.toString();
        if (url.endsWith("/api/v1/sessions") && (!init?.method || init.method === "GET")) {
          return new Response(JSON.stringify([
            { conversationId: "c1", title: "needs approval", updatedAt: "2026-06-04T00:00:00.000Z" }
          ]), { status: 200, headers: { "Content-Type": "application/json" } });
        }
        if (url.endsWith("/api/v1/sessions/c1")) {
          return new Response(JSON.stringify({
            conversationId: "c1",
            messages: [{ role: "user", content: "pay" }],
            activeExecution: { executionId: "exec-1", status: "waiting_approval" },
            pendingApprovals: [
              {
                askUserId: "ask-1",
                executionId: "exec-1",
                toolCallId: "call-1",
                toolName: "submit_payment",
                reason: "needs approval"
              }
            ]
          }), { status: 200, headers: { "Content-Type": "application/json" } });
        }
        return new Response("{}", { status: 200 });
      }) as unknown as typeof fetch
    );

    render(<App />);
    await userEvent.click(await screen.findByTitle("c1"));

    await waitFor(() => {
      expect(screen.getByRole("alert", { name: "Approval required" }).textContent).toContain("submit_payment");
    });

    vi.restoreAllMocks();
  });
});
