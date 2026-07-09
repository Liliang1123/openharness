import { describe, expect, it } from "vitest";
import type { AgentMessage } from "../src/types";
import { RuntimeLifecycleCommands, type LifecycleBoundary } from "../src/storage/lifecycleCommands";
import { createSqliteRuntimeRepositories } from "../src/storage/sqliteRuntimeRepositories";
import { openTestRuntimeDatabase } from "./sqliteRepositoryTestUtils";

const scope = {
  tenantId: "tenant-a",
  userId: "user-a",
  conversationId: "conversation-a",
  executionId: "execution-a",
  traceId: "trace-a",
  requestId: "request-a"
};

const boundaries: LifecycleBoundary[] = [
  "execution_start",
  "approval_wait",
  "approval_decision",
  "model_tool_plan",
  "tool_result",
  "terminal_closure"
];

describe("lifecycle crash matrix", () => {
  it.each(boundaries)("%s has no visible transition when the process crashes before commit", (boundary) => {
    const { lifecycle, repositories, db } = harnessReadyFor(boundary);

    expect(() => applyBoundary(lifecycle, boundary, "before_commit")).toThrow(/crash before commit/i);

    expect(snapshot(db, repositories)).toEqual(snapshotBefore(boundary));
    db.close();
  });

  it.each(boundaries)("%s is durable and idempotently recoverable when the process crashes after commit", (boundary) => {
    const { lifecycle, repositories, db } = harnessReadyFor(boundary);

    expect(() => applyBoundary(lifecycle, boundary, "after_commit")).toThrow(/crash after commit/i);

    expect(snapshot(db, repositories)).toEqual(snapshotAfter(boundary));
    expect(() => applyBoundary(lifecycle, boundary)).not.toThrow();
    expect(snapshot(db, repositories)).toEqual(snapshotAfter(boundary));
    db.close();
  });

  it("interrupts execution without exposing provisional assistant tool-call context to the next turn", () => {
    const { lifecycle, repositories, db } = harnessReadyFor("model_tool_plan");
    lifecycle.recordToolPlan({
      ...scope,
      assistantMessage: assistantToolPlan(),
      stepIndex: 1
    });

    lifecycle.interruptExecution({
      ...scope,
      errorMessage: "Runtime restarted"
    });

    expect(db.transaction((tx) => repositories.history.get(tx, scope.tenantId, scope.userId, scope.conversationId))).toEqual([
      { role: "user", content: "hello" }
    ]);
    expect(db.transaction((tx) =>
      repositories.execution.get(tx, scope.tenantId, scope.userId, scope.conversationId, scope.executionId)
    )).toMatchObject({
      status: "errored",
      stopReason: "EXECUTION_INTERRUPTED"
    });
    expect(db.transaction((tx) =>
      repositories.runtimeEvent.replayAfter(tx, scope.tenantId, scope.userId, scope.conversationId, null)
    ).map((event) => event.kind)).toEqual([
      "agent_start",
      "model_call_end",
      "stream_error"
    ]);
    db.close();
  });
});

function harnessReadyFor(boundary: LifecycleBoundary) {
  const db = openTestRuntimeDatabase();
  const repositories = createSqliteRuntimeRepositories();
  const lifecycle = new RuntimeLifecycleCommands(db, repositories);

  if (boundary !== "execution_start") {
    lifecycle.startExecution({ ...scope, message: "hello" });
  }
  if (boundary === "approval_decision") {
    lifecycle.enterApproval({
      ...scope,
      approvalId: "approval-a",
      toolCallId: "tool-a",
      toolName: "write_file",
      argumentsRaw: "{}",
      reason: "needs approval"
    });
  }
  if (boundary === "tool_result" || boundary === "terminal_closure") {
    lifecycle.recordToolPlan({
      ...scope,
      assistantMessage: assistantToolPlan(),
      stepIndex: 1
    });
  }
  if (boundary === "terminal_closure") {
    lifecycle.completeTool({
      ...scope,
      toolResult: toolResult(),
      stepIndex: 1
    });
  }

  return { db, repositories, lifecycle };
}

function applyBoundary(lifecycle: RuntimeLifecycleCommands, boundary: LifecycleBoundary, crash?: "before_commit" | "after_commit") {
  if (boundary === "execution_start") {
    return lifecycle.startExecution({ ...scope, message: "hello", crash });
  }
  if (boundary === "approval_wait") {
    return lifecycle.enterApproval({
      ...scope,
      approvalId: "approval-a",
      toolCallId: "tool-a",
      toolName: "write_file",
      argumentsRaw: "{}",
      reason: "needs approval",
      crash
    });
  }
  if (boundary === "approval_decision") {
    return lifecycle.decideApproval({
      ...scope,
      approvalId: "approval-a",
      nextStatus: "approved",
      crash
    });
  }
  if (boundary === "model_tool_plan") {
    return lifecycle.recordToolPlan({
      ...scope,
      assistantMessage: assistantToolPlan(),
      stepIndex: 1,
      crash
    });
  }
  if (boundary === "tool_result") {
    return lifecycle.completeTool({
      ...scope,
      toolResult: toolResult(),
      stepIndex: 1,
      crash
    });
  }
  return lifecycle.completeExecution({
    ...scope,
    assistantMessage: { role: "assistant", content: "done" },
    stopReason: "FINAL_ANSWER",
    crash
  });
}

function snapshot(db: ReturnType<typeof openTestRuntimeDatabase>, repositories: ReturnType<typeof createSqliteRuntimeRepositories>) {
  return db.transaction((tx) => ({
    messages: repositories.history.get(tx, scope.tenantId, scope.userId, scope.conversationId),
    execution: repositories.execution.get(tx, scope.tenantId, scope.userId, scope.conversationId, scope.executionId),
    approvals: repositories.approval.listPending(tx, scope.tenantId, scope.userId, scope.conversationId),
    events: repositories.runtimeEvent.replayAfter(tx, scope.tenantId, scope.userId, scope.conversationId, null).map((event) => event.kind)
  }));
}

function snapshotBefore(boundary: LifecycleBoundary) {
  if (boundary === "execution_start") {
    return { messages: [], execution: null, approvals: [], events: [] };
  }
  if (boundary === "approval_wait") {
    return {
      messages: [{ role: "user", content: "hello" }],
      execution: expect.objectContaining({ status: "running" }),
      approvals: [],
      events: ["agent_start"]
    };
  }
  if (boundary === "approval_decision") {
    return {
      messages: [{ role: "user", content: "hello" }],
      execution: expect.objectContaining({ status: "waiting_approval" }),
      approvals: [expect.objectContaining({ approvalId: "approval-a", status: "pending" })],
      events: ["agent_start", "approval_requested"]
    };
  }
  if (boundary === "terminal_closure") {
    return {
      messages: [{ role: "user", content: "hello" }, assistantToolPlan(), toolResult()],
      execution: expect.objectContaining({ status: "running" }),
      approvals: [],
      events: ["agent_start", "model_call_end", "tool_result"]
    };
  }
  if (boundary === "tool_result") {
    return {
      messages: [{ role: "user", content: "hello" }, assistantToolPlan()],
      execution: expect.objectContaining({ status: "running" }),
      approvals: [],
      events: ["agent_start", "model_call_end"]
    };
  }
  return {
    messages: [{ role: "user", content: "hello" }],
    execution: expect.objectContaining({ status: "running" }),
    approvals: [],
    events: ["agent_start"]
  };
}

function snapshotAfter(boundary: LifecycleBoundary) {
  if (boundary === "execution_start") {
    return {
      messages: [{ role: "user", content: "hello" }],
      execution: expect.objectContaining({ status: "running" }),
      approvals: [],
      events: ["agent_start"]
    };
  }
  if (boundary === "approval_wait") {
    return {
      messages: [{ role: "user", content: "hello" }],
      execution: expect.objectContaining({ status: "waiting_approval" }),
      approvals: [expect.objectContaining({ approvalId: "approval-a", status: "pending" })],
      events: ["agent_start", "approval_requested"]
    };
  }
  if (boundary === "approval_decision") {
    return {
      messages: [{ role: "user", content: "hello" }],
      execution: expect.objectContaining({ status: "running" }),
      approvals: [],
      events: ["agent_start", "approval_requested", "tool_result"]
    };
  }
  if (boundary === "model_tool_plan") {
    return {
      messages: [{ role: "user", content: "hello" }, assistantToolPlan()],
      execution: expect.objectContaining({ status: "running" }),
      approvals: [],
      events: ["agent_start", "model_call_end"]
    };
  }
  if (boundary === "tool_result") {
    return {
      messages: [{ role: "user", content: "hello" }, assistantToolPlan(), toolResult()],
      execution: expect.objectContaining({ status: "running" }),
      approvals: [],
      events: ["agent_start", "model_call_end", "tool_result"]
    };
  }
  return {
    messages: [{ role: "user", content: "hello" }, assistantToolPlan(), toolResult(), { role: "assistant", content: "done" }],
    execution: expect.objectContaining({ status: "completed", stopReason: "FINAL_ANSWER" }),
    approvals: [],
    events: ["agent_start", "model_call_end", "tool_result", "final_answer", "agent_end", "stream_done"]
  };
}

function assistantToolPlan(): AgentMessage {
  return {
    role: "assistant",
    content: "",
    toolCalls: [{ id: "tool-a", name: "write_file", argumentsRaw: "{}" }],
    transient: true,
    provisionalExecutionId: scope.executionId
  } as AgentMessage;
}

function toolResult(): AgentMessage {
  return {
    role: "tool",
    toolCallId: "tool-a",
    toolName: "write_file",
    toolResultProvenance: "trusted",
    content: "{\"ok\":true}"
  };
}
