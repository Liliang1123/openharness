import { describe, expect, it } from "vitest";
import { dispatchTraceOutboxBatch } from "../src/storage/traceOutbox";
import { createSqliteRuntimeRepositories } from "../src/storage/sqliteRuntimeRepositories";
import { openTestRuntimeDatabase } from "./sqliteRepositoryTestUtils";
import type { JavaClient } from "../src/javaClient";
import type { CatalogResponse, ModelChatRequest, ToolCallRequest, TraceEvent } from "../src/types";

class RecordingTraceClient implements JavaClient {
  traceEvents: TraceEvent[] = [];

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
    this.traceEvents.push(event);
    expect(headers.Authorization).toBe("Bearer test-secret");
  }

  async evaluatePolicy(): Promise<never> {
    throw new Error("not used");
  }
}

describe("trace outbox correction-only security fixture", () => {
  it("forwards committed identity headers without persisting the authorization value", async () => {
    const { db, repositories } = seededTraceOutbox();
    const javaClient = new RecordingTraceClient();

    await dispatchTraceOutboxBatch(db, repositories, javaClient, traceHeaders, {
      now: 100,
      maxAttempts: 3,
      retryDelayMs: 50
    });
    await dispatchTraceOutboxBatch(db, repositories, javaClient, traceHeaders, {
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
    expect(JSON.stringify(javaClient.traceEvents)).not.toContain("test-secret");
    expect(db.transaction((tx) =>
      repositories.runtimeEvent.getOutboxStatus(tx, "tenant-a", "user-a", "conversation-a", "event-trace-1")
    )).toMatchObject({ deliveryStatus: "delivered" });
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
      traceId: "trace-1",
      requestId: "request-1",
      createdAt: 1,
      kind: "trace",
      data: {
        traceId: "payload-trace-1",
        spanId: "span-1",
        requestId: "payload-request-1",
        conversationId: "payload-conversation",
        userId: "payload-user",
        tenantId: "payload-tenant",
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
