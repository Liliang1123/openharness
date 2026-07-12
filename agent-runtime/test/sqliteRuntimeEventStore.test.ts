import { describe, expect, it } from "vitest";
import { SqliteExecutionStore } from "../src/storage/sqliteExecutionStore";
import { SqliteHistoryStore } from "../src/storage/sqliteHistoryStore";
import { SqliteRuntimeEventStore } from "../src/storage/sqliteRuntimeEventStore";
import { openTestRuntimeDatabase } from "./sqliteRepositoryTestUtils";

describe("SqliteRuntimeEventStore", () => {
  it("replays by scoped cursor and tracks latest watermark without cross-user leakage", () => {
    const db = openTestRuntimeDatabase();
    const history = new SqliteHistoryStore();
    const executions = new SqliteExecutionStore();
    const events = new SqliteRuntimeEventStore();

    db.transaction((tx) => {
      for (const userId of ["user-a", "user-b"]) {
        history.ensureConversation(tx, { tenantId: "tenant-a", userId, conversationId: "conversation-a" });
        executions.create(tx, {
          executionId: `exec-${userId}`,
          tenantId: "tenant-a",
          userId,
          conversationId: "conversation-a",
          status: "running"
        });
      }
      events.append(tx, event({ userId: "user-a", eventId: "event-a1", executionId: "exec-user-a", cursor: 1 }));
      events.append(tx, event({ userId: "user-a", eventId: "event-a2", executionId: "exec-user-a", cursor: 2 }));
      events.append(tx, event({ userId: "user-b", eventId: "event-b1", executionId: "exec-user-b", cursor: 1 }));
    });

    expect(db.transaction((tx) => events.replayAfter(tx, "tenant-a", "user-a", "conversation-a", 1)).map((e) => e.eventId)).toEqual(["event-a2"]);
    expect(db.transaction((tx) => events.replayAfter(tx, "tenant-a", "user-a", "conversation-a", 1))[0]).toMatchObject({
      traceId: "trace-a",
      requestId: "request-a",
      data: { cursor: 2 }
    });
    expect(db.transaction((tx) => events.latestCursor(tx, "tenant-a", "user-a", "conversation-a"))).toBe(2);
    expect(db.transaction((tx) => events.latestCursor(tx, "tenant-a", "user-b", "conversation-a"))).toBe(1);
    db.close();
  });

  it("preserves at-least-once outbox identity across pending, retry, delivered, and dead-letter states", () => {
    const db = openTestRuntimeDatabase();
    const history = new SqliteHistoryStore();
    const executions = new SqliteExecutionStore();
    const events = new SqliteRuntimeEventStore();

    db.transaction((tx) => {
      history.ensureConversation(tx, { tenantId: "tenant-a", userId: "user-a", conversationId: "conversation-a" });
      executions.create(tx, {
        executionId: "exec-a",
        tenantId: "tenant-a",
        userId: "user-a",
        conversationId: "conversation-a",
        status: "running"
      });
      events.append(tx, event({ userId: "user-a", eventId: "event-a1", executionId: "exec-a", cursor: 1 }));
      events.markRetry(tx, "tenant-a", "user-a", "conversation-a", "event-a1", 1234);
    });

    expect(db.transaction((tx) => events.claimOutbox(tx, 10)).map((e) => e.eventId)).toEqual(["event-a1"]);
    expect(db.transaction((tx) => events.getOutboxStatus(tx, "tenant-a", "user-a", "conversation-a", "event-a1"))).toEqual({
      deliveryStatus: "retry",
      deliveryAttempts: 1,
      nextAttemptAt: 1234
    });
    expect(db.transaction((tx) => events.markAcknowledged(tx, "tenant-a", "user-a", "conversation-a", "event-a1"))).toBe(true);
    expect(db.transaction((tx) => events.markDeadLettered(tx, "tenant-a", "user-a", "conversation-a", "event-a1"))).toBe(false);
    db.close();
  });
});

function event(input: { userId: string; eventId: string; executionId: string; cursor: number }) {
  return {
    durability: "durable" as const,
    eventId: input.eventId,
    executionId: input.executionId,
    conversationId: "conversation-a",
    tenantId: "tenant-a",
    userId: input.userId,
    traceId: "trace-a",
    requestId: "request-a",
    createdAt: input.cursor,
    kind: "agent_start" as const,
    data: { cursor: input.cursor },
    cursor: input.cursor
  };
}
