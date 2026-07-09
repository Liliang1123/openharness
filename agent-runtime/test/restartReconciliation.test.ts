import { describe, expect, it } from "vitest";
import { reconcileRuntimeStartup } from "../src/storage/reconcile";
import { RuntimeLifecycleCommands } from "../src/storage/lifecycleCommands";
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

describe("restart reconciliation", () => {
  it("terminates running executions with EXECUTION_INTERRUPTED before readiness", () => {
    const db = openTestRuntimeDatabase();
    const repositories = createSqliteRuntimeRepositories();
    const lifecycle = new RuntimeLifecycleCommands(db, repositories);
    lifecycle.startExecution({ ...scope, message: "hello" });

    const result = reconcileRuntimeStartup(db, repositories);

    expect(result).toEqual({ interruptedExecutions: 1, invalidatedApprovals: 0 });
    expect(db.transaction((tx) =>
      repositories.execution.get(tx, scope.tenantId, scope.userId, scope.conversationId, scope.executionId)
    )).toMatchObject({ status: "errored", stopReason: "EXECUTION_INTERRUPTED" });
    expect(db.transaction((tx) =>
      repositories.runtimeEvent.replayAfter(tx, scope.tenantId, scope.userId, scope.conversationId, null)
    ).map((event) => event.kind)).toEqual(["agent_start", "stream_error"]);
    db.close();
  });

  it("invalidates waiting approvals and removes provisional tool-call context on restart", () => {
    const db = openTestRuntimeDatabase();
    const repositories = createSqliteRuntimeRepositories();
    const lifecycle = new RuntimeLifecycleCommands(db, repositories);
    lifecycle.startExecution({ ...scope, message: "hello" });
    lifecycle.recordToolPlan({
      ...scope,
      stepIndex: 1,
      assistantMessage: {
        role: "assistant",
        content: "",
        toolCalls: [{ id: "tool-a", name: "write_file", argumentsRaw: "{}" }]
      }
    });
    lifecycle.enterApproval({
      ...scope,
      approvalId: "approval-a",
      toolCallId: "tool-a",
      toolName: "write_file",
      argumentsRaw: "{}",
      reason: "needs approval"
    });

    const result = reconcileRuntimeStartup(db, repositories);

    expect(result).toEqual({ interruptedExecutions: 1, invalidatedApprovals: 1 });
    expect(db.transaction((tx) => repositories.approval.listPending(tx, scope.tenantId, scope.userId, scope.conversationId))).toEqual([]);
    expect(db.transaction((tx) => repositories.approval.get(tx, scope.tenantId, scope.userId, scope.conversationId, "approval-a"))).toMatchObject({
      status: "invalidated"
    });
    expect(db.transaction((tx) => repositories.history.get(tx, scope.tenantId, scope.userId, scope.conversationId))).toEqual([
      { role: "user", content: "hello" }
    ]);
    db.close();
  });
});
