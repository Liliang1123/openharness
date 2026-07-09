import { describe, expect, it } from "vitest";
import { SqliteApprovalStore } from "../src/storage/sqliteApprovalStore";
import { SqliteExecutionStore } from "../src/storage/sqliteExecutionStore";
import { SqliteHistoryStore } from "../src/storage/sqliteHistoryStore";
import { openTestRuntimeDatabase } from "./sqliteRepositoryTestUtils";

describe("SqliteApprovalStore", () => {
  it("uses scoped compare-and-swap so one approval decision wins once", () => {
    const db = openTestRuntimeDatabase();
    const history = new SqliteHistoryStore();
    const executions = new SqliteExecutionStore();
    const approvals = new SqliteApprovalStore();

    db.transaction((tx) => {
      history.ensureConversation(tx, { tenantId: "tenant-a", userId: "user-a", conversationId: "conversation-a" });
      executions.create(tx, {
        executionId: "exec-a",
        tenantId: "tenant-a",
        userId: "user-a",
        conversationId: "conversation-a",
        status: "waiting_approval"
      });
      approvals.createPending(tx, {
        approvalId: "approval-a",
        tenantId: "tenant-a",
        userId: "user-a",
        conversationId: "conversation-a",
        executionId: "exec-a",
        payload: { toolName: "dangerous.write" }
      });
    });

    const first = db.transaction((tx) => approvals.compareAndSetStatus(tx, {
      tenantId: "tenant-a",
      userId: "user-a",
      conversationId: "conversation-a",
      approvalId: "approval-a",
      expectedStatus: "pending",
      nextStatus: "approved"
    }));
    const second = db.transaction((tx) => approvals.compareAndSetStatus(tx, {
      tenantId: "tenant-a",
      userId: "user-a",
      conversationId: "conversation-a",
      approvalId: "approval-a",
      expectedStatus: "pending",
      nextStatus: "rejected"
    }));

    expect(first).toBe(true);
    expect(second).toBe(false);
    expect(db.transaction((tx) =>
      approvals.get(tx, "tenant-a", "user-a", "conversation-a", "approval-a")?.status
    )).toBe("approved");
    db.close();
  });
});
