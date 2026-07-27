import { describe, expect, it } from "vitest";
import { SqliteExecutionStore } from "../src/storage/sqliteExecutionStore";
import { SqliteHistoryStore } from "../src/storage/sqliteHistoryStore";
import {
  SqliteRuntimeEventStore,
  type SqliteRuntimeEventInput
} from "../src/storage/sqliteRuntimeEventStore";
import type { RuntimeTransaction } from "../src/storage/runtimeStorage";
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

  it("marks only trace events as outbox candidates and honors retry due time", () => {
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
      events.append(tx, event({
        userId: "user-a",
        eventId: "event-non-trace",
        executionId: "exec-a",
        cursor: 1
      }));
      events.append(tx, event({
        userId: "user-a",
        eventId: "event-trace",
        executionId: "exec-a",
        cursor: 2,
        kind: "trace"
      }));
      expect(events.markRetry(tx, "tenant-a", "user-a", "conversation-a", "event-non-trace", 1234)).toBe(false);
      expect(events.markRetry(tx, "tenant-a", "user-a", "conversation-a", "event-trace", 1234)).toBe(true);
    });

    expect(db.transaction((tx) =>
      events.getOutboxStatus(tx, "tenant-a", "user-a", "conversation-a", "event-non-trace")
    )).toEqual({
      deliveryStatus: "not_applicable",
      deliveryAttempts: 0,
      nextAttemptAt: null
    });
    expect(db.transaction((tx) => events.claimOutbox(tx, 1233, 10))).toEqual([]);
    expect(db.transaction((tx) => events.claimOutbox(tx, 1234, 10)).map((e) => e.eventId)).toEqual(["event-trace"]);
    expect(db.transaction((tx) => events.getOutboxStatus(tx, "tenant-a", "user-a", "conversation-a", "event-trace"))).toEqual({
      deliveryStatus: "retry",
      deliveryAttempts: 1,
      nextAttemptAt: 1234
    });
    expect(db.transaction((tx) => events.markAcknowledged(tx, "tenant-a", "user-a", "conversation-a", "event-trace"))).toBe(true);
    expect(db.transaction((tx) => events.markDeadLettered(tx, "tenant-a", "user-a", "conversation-a", "event-trace"))).toBe(false);
    db.close();
  });

  it("reads only the explicit or latest execution within the complete owner scope", () => {
    const db = openTestRuntimeDatabase();
    const history = new SqliteHistoryStore();
    const executions = new SqliteExecutionStore();
    const events = new SqliteRuntimeEventStore();

    db.transaction((tx) => {
      for (const userId of ["user-a", "user-b"]) {
        history.ensureConversation(tx, {
          tenantId: "tenant-a",
          userId,
          conversationId: "conversation-a"
        });
      }
      executions.create(tx, {
        executionId: "exec-a1",
        tenantId: "tenant-a",
        userId: "user-a",
        conversationId: "conversation-a",
        status: "completed"
      });
      executions.create(tx, {
        executionId: "exec-a2",
        tenantId: "tenant-a",
        userId: "user-a",
        conversationId: "conversation-a",
        status: "running"
      });
      executions.create(tx, {
        executionId: "exec-b1",
        tenantId: "tenant-a",
        userId: "user-b",
        conversationId: "conversation-a",
        status: "running"
      });
      events.append(tx, event({
        userId: "user-a",
        eventId: "event-a1-start",
        executionId: "exec-a1",
        cursor: 1
      }));
      events.append(tx, event({
        userId: "user-a",
        eventId: "event-a1-done",
        executionId: "exec-a1",
        cursor: 2,
        kind: "stream_done"
      }));
      events.append(tx, event({
        userId: "user-a",
        eventId: "event-a2-start",
        executionId: "exec-a2",
        cursor: 3
      }));
      events.append(tx, event({
        userId: "user-a",
        eventId: "event-a2-model",
        executionId: "exec-a2",
        cursor: 4,
        kind: "model_call_start"
      }));
      events.append(tx, event({
        userId: "user-b",
        eventId: "event-b1-start",
        executionId: "exec-b1",
        cursor: 1
      }));
    });

    const replayExecution = (
      events as SqliteRuntimeEventStore & {
        replayExecution?: (
          tx: RuntimeTransaction,
          tenantId: string,
          userId: string,
          conversationId: string,
          executionId?: string
        ) => ReturnType<SqliteRuntimeEventStore["replayAfter"]>;
      }
    ).replayExecution;
    expect(replayExecution).toBeTypeOf("function");

    expect(db.transaction((tx) =>
      replayExecution!.call(events, tx, "tenant-a", "user-a", "conversation-a")
    ).map(event => event.executionId)).toEqual(["exec-a2", "exec-a2"]);
    expect(db.transaction((tx) =>
      replayExecution!.call(events, tx, "tenant-a", "user-a", "conversation-a", "exec-a1")
    ).map(event => event.kind)).toEqual(["agent_start", "stream_done"]);
    expect(db.transaction((tx) =>
      replayExecution!.call(events, tx, "tenant-a", "user-b", "conversation-a", "exec-a2")
    )).toEqual([]);
    expect(db.transaction((tx) =>
      replayExecution!.call(events, tx, "tenant-other", "user-a", "conversation-a", "exec-a2")
    )).toEqual([]);
    db.close();
  });

  it("does not let older non-trace rows starve ordered trace claims", () => {
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
      for (let cursor = 1; cursor <= 25; cursor += 1) {
        events.append(tx, event({
          userId: "user-a",
          eventId: `event-non-trace-${cursor}`,
          executionId: "exec-a",
          cursor
        }));
      }
      events.append(tx, event({
        userId: "user-a",
        eventId: "event-trace-b",
        executionId: "exec-a",
        cursor: 26,
        kind: "trace"
      }));
      events.append(tx, event({
        userId: "user-a",
        eventId: "event-trace-a",
        executionId: "exec-a",
        cursor: 27,
        kind: "trace",
        createdAt: 26
      }));
      events.append(tx, event({
        userId: "user-a",
        eventId: "event-trace-future",
        executionId: "exec-a",
        cursor: 28,
        kind: "trace"
      }));
      events.markRetry(tx, "tenant-a", "user-a", "conversation-a", "event-trace-future", 10_000);
    });

    expect(db.transaction((tx) => events.claimOutbox(tx, 100, 2)).map(event => event.eventId)).toEqual([
      "event-trace-a",
      "event-trace-b"
    ]);
    db.close();
  });

  it("uses ordered partial indexes for trace claims and dead-letter readiness", () => {
    const db = openTestRuntimeDatabase();
    const claimPlan = db.all<{ detail: string }>(`
      EXPLAIN QUERY PLAN
      SELECT event_id
      FROM runtime_events
      WHERE kind = 'trace'
        AND delivery_status IN ('pending','retry')
        AND (delivery_status = 'pending' OR next_attempt_at <= 100)
      ORDER BY created_at ASC, event_id ASC
      LIMIT 10
    `).map(row => row.detail).join("\n");
    const deadLetterPlan = db.all<{ detail: string }>(`
      EXPLAIN QUERY PLAN
      SELECT event_id
      FROM runtime_events
      WHERE kind = 'trace' AND delivery_status = 'dead_letter'
      ORDER BY dead_letter_at ASC
      LIMIT 1
    `).map(row => row.detail).join("\n");

    expect(claimPlan).toContain("runtime_event_trace_outbox");
    expect(claimPlan).not.toMatch(/TEMP B-TREE/i);
    expect(deadLetterPlan).toContain("runtime_event_trace_dead_letter");
    db.close();
  });
});

function event(input: {
  userId: string;
  eventId: string;
  executionId: string;
  cursor: number;
  kind?: SqliteRuntimeEventInput["kind"];
  createdAt?: number;
}): SqliteRuntimeEventInput {
  return {
    durability: "durable" as const,
    eventId: input.eventId,
    executionId: input.executionId,
    conversationId: "conversation-a",
    tenantId: "tenant-a",
    userId: input.userId,
    traceId: "trace-a",
    requestId: "request-a",
    createdAt: input.createdAt ?? input.cursor,
    kind: input.kind ?? "agent_start",
    data: { cursor: input.cursor },
    cursor: input.cursor
  };
}
