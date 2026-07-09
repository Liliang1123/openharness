import { describe, expect, it } from "vitest";
import { dispatchTraceOutboxBatch } from "../src/storage/traceOutbox";
import { createSqliteRuntimeRepositories } from "../src/storage/sqliteRuntimeRepositories";
import { openTestRuntimeDatabase } from "./sqliteRepositoryTestUtils";
import type { JavaClient } from "../src/javaClient";
import type { CatalogResponse, ModelChatRequest, ToolCallRequest, TraceEvent } from "../src/types";

class RecordingTraceClient implements JavaClient {
  traceEvents: TraceEvent[] = [];
  failuresBeforeSuccess = 0;

  async getCatalog(): Promise<CatalogResponse> {
    return { catalogVersion: "v1", catalogHash: "h1", tools: [] };
  }
  async chat(_request: ModelChatRequest): Promise<never> {
    throw new Error("not used");
  }
  async executeTool(_request: ToolCallRequest): Promise<never> {
    throw new Error("not used");
  }
  async postTrace(event: TraceEvent): Promise<void> {
    if (this.failuresBeforeSuccess > 0) {
      this.failuresBeforeSuccess -= 1;
      throw new Error("java unavailable");
    }
    this.traceEvents.push(event);
  }
  async evaluatePolicy(): Promise<never> {
    throw new Error("not used");
  }
}

describe("durable trace outbox", () => {
  it("retries a committed trace event after crash before local acknowledgement", async () => {
    const { db, repositories } = seededTraceOutbox();
    const javaClient = new RecordingTraceClient();

    await dispatchTraceOutboxBatch(db, repositories, javaClient, { Authorization: "Bearer test" }, {
      now: 100,
      maxAttempts: 3,
      retryDelayMs: 50
    });
    await dispatchTraceOutboxBatch(db, repositories, javaClient, { Authorization: "Bearer test" }, {
      now: 150,
      maxAttempts: 3,
      retryDelayMs: 50
    });

    expect(javaClient.traceEvents).toHaveLength(1);
    expect(javaClient.traceEvents[0].attributes).toMatchObject({ committedEventId: "event-trace-1" });
    expect(db.transaction((tx) =>
      repositories.runtimeEvent.getOutboxStatus(tx, "tenant-a", "user-a", "conversation-a", "event-trace-1")
    )).toMatchObject({ deliveryStatus: "delivered" });
    db.close();
  });

  it("persists retry state for Java outage and resumes after restart", async () => {
    const { db, repositories } = seededTraceOutbox();
    const javaClient = new RecordingTraceClient();
    javaClient.failuresBeforeSuccess = 1;

    const first = await dispatchTraceOutboxBatch(db, repositories, javaClient, { Authorization: "Bearer test" }, {
      now: 100,
      maxAttempts: 3,
      retryDelayMs: 50
    });

    expect(first).toEqual({ delivered: 0, retried: 1, deadLettered: 0, readinessDegraded: false });
    expect(db.transaction((tx) =>
      repositories.runtimeEvent.getOutboxStatus(tx, "tenant-a", "user-a", "conversation-a", "event-trace-1")
    )).toEqual({ deliveryStatus: "retry", deliveryAttempts: 1, nextAttemptAt: 150 });

    const second = await dispatchTraceOutboxBatch(db, repositories, javaClient, { Authorization: "Bearer test" }, {
      now: 150,
      maxAttempts: 3,
      retryDelayMs: 50
    });

    expect(second).toEqual({ delivered: 1, retried: 0, deadLettered: 0, readinessDegraded: false });
    expect(javaClient.traceEvents).toHaveLength(1);
    db.close();
  });

  it("moves exhausted delivery to durable dead letter and degrades readiness", async () => {
    const { db, repositories } = seededTraceOutbox();
    const javaClient = new RecordingTraceClient();
    javaClient.failuresBeforeSuccess = 10;

    const result = await dispatchTraceOutboxBatch(db, repositories, javaClient, { Authorization: "Bearer test" }, {
      now: 100,
      maxAttempts: 1,
      retryDelayMs: 50
    });

    expect(result).toEqual({ delivered: 0, retried: 0, deadLettered: 1, readinessDegraded: true });
    expect(db.transaction((tx) =>
      repositories.runtimeEvent.getOutboxStatus(tx, "tenant-a", "user-a", "conversation-a", "event-trace-1")
    )).toMatchObject({ deliveryStatus: "dead_letter" });
    db.close();
  });
});

function seededTraceOutbox() {
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
    repositories.runtimeEvent.append(tx, {
      durability: "durable",
      eventId: "event-trace-1",
      executionId: "execution-a",
      conversationId: "conversation-a",
      tenantId: "tenant-a",
      userId: "user-a",
      traceId: "trace-a",
      requestId: "request-a",
      createdAt: 1,
      kind: "trace",
      data: {
        traceId: "trace-a",
        spanId: "span-a",
        requestId: "request-a",
        conversationId: "conversation-a",
        userId: "user-a",
        tenantId: "tenant-a",
        runtime: "agent-runtime",
        eventType: "MODEL_CALL_END",
        name: "model call end",
        status: "ok",
        startTime: 1,
        attributes: {}
      },
      cursor: 1
    });
  });
  return { db, repositories };
}
