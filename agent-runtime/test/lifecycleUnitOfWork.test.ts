import { describe, expect, it } from "vitest";
import type { AgentMessage, SessionEvent } from "../src/types";
import { createSqliteRuntimeRepositories } from "../src/storage/sqliteRuntimeRepositories";
import { RuntimeLifecycleCommands, publishCommittedLifecycleEvents } from "../src/storage/lifecycleCommands";
import { InMemoryRuntimeEventStore } from "../src/runtimeEventStore";
import { openTestRuntimeDatabase } from "./sqliteRepositoryTestUtils";

const scope = {
  tenantId: "tenant-a",
  userId: "user-a",
  conversationId: "conversation-a",
  executionId: "execution-a",
  traceId: "trace-a",
  requestId: "request-a"
};

describe("RuntimeLifecycleCommands", () => {
  it("allocates durable event ids within the complete tenant/user/conversation scope", () => {
    const db = openTestRuntimeDatabase();
    const lifecycle = new RuntimeLifecycleCommands(db, createSqliteRuntimeRepositories());
    const commit = lifecycle.startExecution({
      ...scope,
      message: "hello"
    });

    expect(commit.events[0]?.eventId).toBe("tenant-a::user-a::conversation-a:1");
    db.close();
  });

  it("commits execution start as one unit of work and publishes only after commit", () => {
    const db = openTestRuntimeDatabase();
    const repositories = createSqliteRuntimeRepositories();
    const lifecycle = new RuntimeLifecycleCommands(db, repositories);
    const liveEvents = new InMemoryRuntimeEventStore();
    const observed: string[] = [];
    liveEvents.subscribe(scope.tenantId, scope.userId, scope.conversationId, (event) => observed.push(event.kind));

    const committed = lifecycle.startExecution({
      ...scope,
      message: "hello"
    });

    expect(observed).toEqual([]);
    expect(db.transaction((tx) => repositories.history.get(tx, scope.tenantId, scope.userId, scope.conversationId))).toEqual([
      { role: "user", content: "hello" }
    ]);
    expect(db.transaction((tx) =>
      repositories.execution.get(tx, scope.tenantId, scope.userId, scope.conversationId, scope.executionId)
    )?.status).toBe("running");
    expect(db.transaction((tx) =>
      repositories.runtimeEvent.replayAfter(tx, scope.tenantId, scope.userId, scope.conversationId, null)
    ).map((event) => event.kind)).toEqual(["agent_start"]);

    publishCommittedLifecycleEvents(liveEvents, committed);

    expect(observed).toEqual(["agent_start"]);
    db.close();
  });

  it("keeps committed state authoritative when post-commit publication fails", () => {
    const db = openTestRuntimeDatabase();
    const repositories = createSqliteRuntimeRepositories();
    const lifecycle = new RuntimeLifecycleCommands(db, repositories);
    const committed = lifecycle.startExecution({
      ...scope,
      message: "hello"
    });

    expect(() => publishCommittedLifecycleEvents({
      publish(): void {
        throw new Error("subscriber transport is down");
      }
    }, committed)).toThrow(/subscriber transport is down/);

    expect(db.transaction((tx) =>
      repositories.runtimeEvent.replayAfter(tx, scope.tenantId, scope.userId, scope.conversationId, null)
    ).map((event) => event.kind)).toEqual(["agent_start"]);
    db.close();
  });

  it("records a standalone durable runtime event through the lifecycle writer", () => {
    const db = openTestRuntimeDatabase();
    const repositories = createSqliteRuntimeRepositories();
    const lifecycle = new RuntimeLifecycleCommands(db, repositories);
    lifecycle.startExecution({ ...scope, message: "hello" });

    const committed = lifecycle.recordEvent({
      ...scope,
      kind: "model_call_start",
      data: { stepIndex: 1 }
    });

    expect(committed.events.map(event => event.kind)).toEqual(["model_call_start"]);
    expect(db.transaction(tx => repositories.runtimeEvent.replayAfter(
      tx,
      scope.tenantId,
      scope.userId,
      scope.conversationId,
      null
    )).map(event => event.kind)).toEqual(["agent_start", "model_call_start"]);
    db.close();
  });

  it("keeps terminal state immutable and returns no events for idempotent retries", () => {
    const db = openTestRuntimeDatabase();
    const repositories = createSqliteRuntimeRepositories();
    const lifecycle = new RuntimeLifecycleCommands(db, repositories);
    lifecycle.startExecution({ ...scope, message: "hello" });
    const completed = lifecycle.completeExecution({
      ...scope,
      assistantMessage: { role: "assistant", content: "done" },
      stopReason: "FINAL_ANSWER"
    });

    expect(lifecycle.completeExecution({
      ...scope,
      assistantMessage: { role: "assistant", content: "done" },
      stopReason: "FINAL_ANSWER"
    }).events).toEqual([]);
    expect(lifecycle.failExecution({ ...scope, errorClass: "MODEL_ERROR", errorMessage: "late" }).events).toEqual([]);
    expect(lifecycle.abortExecution({ ...scope, errorMessage: "late" }).events).toEqual([]);
    expect(db.transaction(tx => repositories.execution.get(
      tx, scope.tenantId, scope.userId, scope.conversationId, scope.executionId
    ))).toMatchObject({ status: "completed", stopReason: "FINAL_ANSWER" });
    expect(completed.events.map(event => event.kind)).toEqual(["final_answer", "agent_end", "stream_done"]);
    db.close();
  });

  it("commits an approval decision without mislabelling it as a tool result", () => {
    const db = openTestRuntimeDatabase();
    const repositories = createSqliteRuntimeRepositories();
    const lifecycle = new RuntimeLifecycleCommands(db, repositories);
    lifecycle.startExecution({ ...scope, message: "hello" });
    lifecycle.enterApproval({
      ...scope,
      approvalId: "approval-a",
      toolCallId: "tool-a",
      toolName: "write_file",
      argumentsRaw: "{}"
    });

    expect(lifecycle.decideApproval({ ...scope, approvalId: "approval-a", nextStatus: "approved" }).events).toEqual([]);
    expect(db.transaction(tx => repositories.approval.get(
      tx, scope.tenantId, scope.userId, scope.conversationId, "approval-a"
    ))?.status).toBe("approved");
    db.close();
  });

  it.each(["fail", "abort"] as const)("keeps %s terminal closure atomic and idempotent", (kind) => {
    const db = openTestRuntimeDatabase();
    const repositories = createSqliteRuntimeRepositories();
    const lifecycle = new RuntimeLifecycleCommands(db, repositories);
    const apply = (crash?: "before_commit" | "after_commit") => kind === "fail"
      ? lifecycle.failExecution({ ...scope, errorClass: "MODEL_ERROR", errorMessage: "failed", crash })
      : lifecycle.abortExecution({ ...scope, errorMessage: "aborted", crash });
    lifecycle.startExecution({ ...scope, message: "hello" });

    expect(() => apply("before_commit")).toThrow(/before commit/);
    expect(db.transaction(tx => repositories.execution.get(
      tx, scope.tenantId, scope.userId, scope.conversationId, scope.executionId
    ))?.status).toBe("running");
    expect(() => apply("after_commit")).toThrow(/after commit/);
    expect(db.transaction(tx => repositories.execution.get(
      tx, scope.tenantId, scope.userId, scope.conversationId, scope.executionId
    ))?.status).toBe(kind === "fail" ? "errored" : "aborted");
    expect(apply().events).toEqual([]);
    db.close();
  });

  it("stabilizes a provisional tool plan atomically when its tool results are complete", () => {
    const db = openTestRuntimeDatabase();
    const repositories = createSqliteRuntimeRepositories();
    const lifecycle = new RuntimeLifecycleCommands(db, repositories);
    lifecycle.startExecution({ ...scope, message: "hello" });
    lifecycle.recordToolPlan({
      ...scope,
      assistantMessage: {
        role: "assistant",
        content: "",
        toolCalls: [{ id: "tool-a", name: "write_file", argumentsRaw: "{}" }]
      },
      stepIndex: 1
    });
    lifecycle.completeTool({
      ...scope,
      toolResult: { role: "tool", toolCallId: "tool-a", toolName: "write_file", content: "{}" },
      stepIndex: 1
    });

    expect(db.transaction(tx => repositories.history.get(
      tx, scope.tenantId, scope.userId, scope.conversationId
    ))[1]).not.toMatchObject({ transient: true, provisionalExecutionId: scope.executionId });
    db.close();
  });

  it("scopes reused tool-call ids to the current execution", () => {
    const db = openTestRuntimeDatabase();
    const repositories = createSqliteRuntimeRepositories();
    const lifecycle = new RuntimeLifecycleCommands(db, repositories);
    const runTool = (executionId: string, result: string) => {
      const executionScope = { ...scope, executionId };
      lifecycle.startExecution({ ...executionScope, message: `hello-${executionId}` });
      lifecycle.recordToolPlan({
        ...executionScope,
        assistantMessage: {
          role: "assistant",
          content: "",
          toolCalls: [{ id: "reused-call", name: "write_file", argumentsRaw: "{}" }]
        },
        stepIndex: 1
      });
      lifecycle.completeTool({
        ...executionScope,
        toolResult: { role: "tool", toolCallId: "reused-call", toolName: "write_file", content: result },
        stepIndex: 1
      });
      lifecycle.completeExecution({
        ...executionScope,
        assistantMessage: { role: "assistant", content: `done-${executionId}` },
        stopReason: "FINAL_ANSWER"
      });
    };

    runTool("execution-a", "result-a");
    runTool("execution-b", "result-b");

    const messages = db.transaction(tx => repositories.history.get(
      tx, scope.tenantId, scope.userId, scope.conversationId
    ));
    expect(messages.filter(message => message.role === "tool" && message.toolCallId === "reused-call")).toHaveLength(2);
    expect(messages.find(message => message.content === "result-b")).toBeDefined();
    expect(messages.filter(message => (message as AgentMessage & { provisionalExecutionId?: string }).provisionalExecutionId)).toEqual([]);
    db.close();
  });
});
