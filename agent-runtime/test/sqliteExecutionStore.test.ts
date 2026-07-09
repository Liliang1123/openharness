import { describe, expect, it } from "vitest";
import { SqliteExecutionStore } from "../src/storage/sqliteExecutionStore";
import { SqliteHistoryStore } from "../src/storage/sqliteHistoryStore";
import { openTestRuntimeDatabase } from "./sqliteRepositoryTestUtils";

describe("SqliteExecutionStore", () => {
  it("looks up and transitions executions only within tenant/user/conversation scope", () => {
    const db = openTestRuntimeDatabase();
    const history = new SqliteHistoryStore();
    const executions = new SqliteExecutionStore();

    db.transaction((tx) => {
      history.ensureConversation(tx, { tenantId: "tenant-a", userId: "user-a", conversationId: "conversation-a" });
      history.ensureConversation(tx, { tenantId: "tenant-a", userId: "user-b", conversationId: "conversation-a" });
      executions.create(tx, {
        executionId: "exec-a",
        tenantId: "tenant-a",
        userId: "user-a",
        conversationId: "conversation-a",
        status: "running"
      });
      executions.create(tx, {
        executionId: "exec-b",
        tenantId: "tenant-a",
        userId: "user-b",
        conversationId: "conversation-a",
        status: "running"
      });
      executions.transition(tx, {
        tenantId: "tenant-a",
        userId: "user-a",
        conversationId: "conversation-a",
        executionId: "exec-a",
        status: "completed",
        stopReason: "FINAL_ANSWER"
      });
    });

    expect(db.transaction((tx) =>
      executions.get(tx, "tenant-a", "user-a", "conversation-a", "exec-a")?.status
    )).toBe("completed");
    expect(db.transaction((tx) =>
      executions.get(tx, "tenant-a", "user-a", "conversation-a", "exec-b")
    )).toBeNull();
    db.close();
  });
});
