import { describe, expect, it } from "vitest";
import {
  dispatchTraceOutboxBatch,
  dispatchTraceOutboxStoreBatch,
  type TraceOutboxStore
} from "../src/storage/traceOutbox";
import { createSqliteRuntimeRepositories } from "../src/storage/sqliteRuntimeRepositories";
import type { RuntimeDatabase } from "../src/storage/runtimeStorage";
import { openTestRuntimeDatabase } from "./sqliteRepositoryTestUtils";
import type { JavaClient } from "../src/javaClient";
import type { CatalogResponse, ModelChatRequest, ToolCallRequest, TraceEvent } from "../src/types";

class RecordingTraceClient implements JavaClient {
  traceEvents: TraceEvent[] = [];
  traceHeaders: Record<string, string>[] = [];
  failuresBeforeSuccess = 0;
  failingEventIds = new Set<string>();
  activeDeliveries = 0;
  maximumActiveDeliveries = 0;

  async getCatalog(): Promise<CatalogResponse> {
    return { catalogVersion: "v1", catalogHash: "h1", tools: [] };
  }
  async chat(_request: ModelChatRequest): Promise<never> {
    throw new Error("not used");
  }
  async executeTool(_request: ToolCallRequest): Promise<never> {
    throw new Error("not used");
  }
  async postTrace(event: TraceEvent, headers: Record<string, string>): Promise<void> {
    this.activeDeliveries += 1;
    this.maximumActiveDeliveries = Math.max(this.maximumActiveDeliveries, this.activeDeliveries);
    await Promise.resolve();
    this.traceHeaders.push(headers);
    const committedEventId = String(event.attributes?.committedEventId ?? "");
    if (this.failuresBeforeSuccess > 0) {
      this.failuresBeforeSuccess -= 1;
      this.activeDeliveries -= 1;
      throw new Error("java unavailable");
    }
    if (this.failingEventIds.has(committedEventId)) {
      this.activeDeliveries -= 1;
      throw new Error("event rejected");
    }
    this.traceEvents.push(event);
    this.activeDeliveries -= 1;
  }
  async evaluatePolicy(): Promise<never> {
    throw new Error("not used");
  }
}

describe("durable trace outbox", () => {
  it("delivers Worker-claimed candidates concurrently and applies one whole semantic outcome batch", async () => {
    const { db, repositories } = seededTraceOutbox(4);
    const candidates = repositories.runtimeEvent.claimOutbox(db, 100, 100).map(event => ({
      event,
      deliveryAttempts: 0,
      nextAttemptAt: null
    }));
    const javaClient = new RecordingTraceClient();
    javaClient.failingEventIds.add("event-trace-3");
    const applied: Parameters<TraceOutboxStore["applyOutcomes"]>[0][] = [];
    const store: TraceOutboxStore = {
      async claim() {
        return candidates;
      },
      async applyOutcomes(outcomes) {
        applied.push(outcomes);
        return {
          processed: outcomes.length,
          delivered: outcomes.filter(outcome => outcome.transition === "delivered").length,
          retried: outcomes.filter(outcome => outcome.transition === "retry").length,
          deadLettered: outcomes.filter(outcome => outcome.transition === "dead_letter").length,
          readinessDegraded: false
        };
      },
      async hasDeadLetters() {
        return false;
      }
    };

    const result = await dispatchTraceOutboxStoreBatch(
      store,
      javaClient,
      traceHeaders,
      {
        now: 100,
        maxAttempts: 3,
        retryDelayMs: 50,
        concurrency: 2
      }
    );

    expect(result).toMatchObject({ processed: 4, delivered: 3, retried: 1 });
    expect(javaClient.maximumActiveDeliveries).toBe(2);
    expect(applied).toHaveLength(1);
    expect(applied[0]!.map(outcome => outcome.event.eventId)).toEqual([
      "event-trace-1",
      "event-trace-2",
      "event-trace-3",
      "event-trace-4"
    ]);
    db.close();
  });

  it("retries a committed trace event after crash before local acknowledgement", async () => {
    const { db, repositories } = seededTraceOutbox();
    const javaClient = new RecordingTraceClient();
    const counted = countTransactions(db);

    await dispatchTraceOutboxBatch(counted.database, repositories, javaClient, traceHeaders, {
      now: 100,
      maxAttempts: 3,
      retryDelayMs: 50
    });
    await dispatchTraceOutboxBatch(counted.database, repositories, javaClient, traceHeaders, {
      now: 150,
      maxAttempts: 3,
      retryDelayMs: 50
    });

    expect(javaClient.traceEvents).toHaveLength(1);
    expect(javaClient.traceEvents[0]).toMatchObject({
      traceId: "trace-1",
      requestId: "request-1",
      conversationId: "conversation-a",
      userId: "user-a",
      tenantId: "tenant-a",
      attributes: { committedEventId: "event-trace-1" }
    });
    expect(javaClient.traceHeaders[0]).toEqual({
      Authorization: "Bearer test-secret",
      "X-Tenant-Id": "tenant-a",
      "X-User-Id": "user-a",
      "X-Trace-Id": "trace-1",
      "X-Request-Id": "request-1"
    });
    expect(JSON.stringify(javaClient.traceEvents)).not.toContain("test-secret");
    expect(counted.count()).toBe(1);
    expect(db.transaction((tx) =>
      repositories.runtimeEvent.getOutboxStatus(tx, "tenant-a", "user-a", "conversation-a", "event-trace-1")
    )).toMatchObject({ deliveryStatus: "delivered" });
    db.close();
  });

  it("persists retry state for Java outage and resumes after restart", async () => {
    const { db, repositories } = seededTraceOutbox();
    const javaClient = new RecordingTraceClient();
    javaClient.failuresBeforeSuccess = 1;

    const first = await dispatchTraceOutboxBatch(db, repositories, javaClient, traceHeaders, {
      now: 100,
      maxAttempts: 3,
      retryDelayMs: 50
    });

    expect(first).toEqual({ processed: 1, delivered: 0, retried: 1, deadLettered: 0, readinessDegraded: false });
    expect(JSON.stringify(first)).not.toContain("test-secret");
    expect(db.transaction((tx) =>
      repositories.runtimeEvent.getOutboxStatus(tx, "tenant-a", "user-a", "conversation-a", "event-trace-1")
    )).toEqual({ deliveryStatus: "retry", deliveryAttempts: 1, nextAttemptAt: 150 });

    const second = await dispatchTraceOutboxBatch(db, repositories, javaClient, traceHeaders, {
      now: 150,
      maxAttempts: 3,
      retryDelayMs: 50
    });

    expect(second).toEqual({ processed: 1, delivered: 1, retried: 0, deadLettered: 0, readinessDegraded: false });
    expect(javaClient.traceEvents).toHaveLength(1);
    db.close();
  });

  it("moves exhausted delivery to durable dead letter and degrades readiness", async () => {
    const { db, repositories } = seededTraceOutbox();
    const javaClient = new RecordingTraceClient();
    javaClient.failuresBeforeSuccess = 10;

    const result = await dispatchTraceOutboxBatch(db, repositories, javaClient, traceHeaders, {
      now: 100,
      maxAttempts: 1,
      retryDelayMs: 50
    });

    expect(result).toEqual({ processed: 1, delivered: 0, retried: 0, deadLettered: 1, readinessDegraded: true });
    expect(db.transaction((tx) =>
      repositories.runtimeEvent.getOutboxStatus(tx, "tenant-a", "user-a", "conversation-a", "event-trace-1")
    )).toMatchObject({ deliveryStatus: "dead_letter" });
    db.close();
  });

  it("uses bounded concurrency and isolates one failed event from the rest of the batch", async () => {
    const { db, repositories } = seededTraceOutbox(5);
    const javaClient = new RecordingTraceClient();
    javaClient.failingEventIds.add("event-trace-3");
    const counted = countTransactions(db);

    const result = await dispatchTraceOutboxBatch(counted.database, repositories, javaClient, traceHeaders, {
      now: 100,
      maxAttempts: 3,
      retryDelayMs: 50,
      concurrency: 2
    });

    expect(result).toEqual({
      processed: 5,
      delivered: 4,
      retried: 1,
      deadLettered: 0,
      readinessDegraded: false
    });
    expect(javaClient.maximumActiveDeliveries).toBe(2);
    expect(javaClient.traceEvents.map(event => event.attributes?.committedEventId)).toEqual([
      "event-trace-1",
      "event-trace-2",
      "event-trace-4",
      "event-trace-5"
    ]);
    expect(counted.count()).toBe(1);
    expect(db.transaction((tx) =>
      repositories.runtimeEvent.getOutboxStatus(tx, "tenant-a", "user-a", "conversation-a", "event-trace-3")
    )).toEqual({ deliveryStatus: "retry", deliveryAttempts: 1, nextAttemptAt: 150 });
    db.close();
  });

  it("rejects one failed transition transaction and leaves the whole delivered batch retryable", async () => {
    const { db, repositories } = seededTraceOutbox(2);
    const javaClient = new RecordingTraceClient();
    let transactionAttempts = 0;
    const failingDatabase: RuntimeDatabase = {
      ...db,
      transaction() {
        transactionAttempts += 1;
        throw new Error("SQLite transition unavailable");
      }
    };

    await expect(dispatchTraceOutboxBatch(
      failingDatabase,
      repositories,
      javaClient,
      traceHeaders,
      {
        now: 100,
        maxAttempts: 3,
        retryDelayMs: 50,
        concurrency: 2
      }
    )).rejects.toThrow("SQLite transition unavailable");

    expect(javaClient.traceEvents).toHaveLength(2);
    expect(transactionAttempts).toBe(1);
    for (const eventId of ["event-trace-1", "event-trace-2"]) {
      expect(db.transaction((tx) =>
        repositories.runtimeEvent.getOutboxStatus(
          tx,
          "tenant-a",
          "user-a",
          "conversation-a",
          eventId
        )
      )).toMatchObject({ deliveryStatus: "pending", deliveryAttempts: 0 });
    }
    db.close();
  });
});

function traceHeaders(event: {
  tenantId: string;
  userId: string;
  traceId: string;
  requestId: string;
}): Record<string, string> {
  return {
    Authorization: "Bearer test-secret",
    "X-Tenant-Id": event.tenantId,
    "X-User-Id": event.userId,
    "X-Trace-Id": event.traceId,
    "X-Request-Id": event.requestId
  };
}

function seededTraceOutbox(eventCount = 1) {
  const db = openTestRuntimeDatabase();
  const repositories = createSqliteRuntimeRepositories();
  db.transaction((tx) => {
    repositories.history.ensureConversation(tx, {
      tenantId: "tenant-a",
      userId: "user-a",
      conversationId: "conversation-a"
    });
    repositories.execution.create(tx, {
      tenantId: "tenant-a",
      userId: "user-a",
      conversationId: "conversation-a",
      executionId: "execution-a",
      status: "running"
    });
    for (let index = 1; index <= eventCount; index += 1) {
      repositories.runtimeEvent.append(tx, {
        durability: "durable",
        eventId: `event-trace-${index}`,
        executionId: "execution-a",
        conversationId: "conversation-a",
        tenantId: "tenant-a",
        userId: "user-a",
        traceId: `trace-${index}`,
        requestId: `request-${index}`,
        createdAt: index,
        kind: "trace",
        data: {
          traceId: `payload-trace-${index}`,
          spanId: `span-${index}`,
          requestId: `payload-request-${index}`,
          conversationId: "payload-conversation",
          userId: "payload-user",
          tenantId: "payload-tenant",
          runtime: "agent-runtime",
          eventType: "MODEL_CALL_END",
          name: "model call end",
          status: "ok",
          startTime: index,
          attributes: {}
        },
        cursor: index
      });
    }
  });
  return { db, repositories };
}

function countTransactions(database: RuntimeDatabase): {
  database: RuntimeDatabase;
  count(): number;
} {
  let transactionCount = 0;
  return {
    database: {
      ...database,
      transaction(work) {
        transactionCount += 1;
        return database.transaction(work);
      }
    },
    count: () => transactionCount
  };
}
