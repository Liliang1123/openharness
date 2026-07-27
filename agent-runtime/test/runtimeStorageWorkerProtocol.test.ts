import { describe, expect, it } from "vitest";
import {
  parseStorageWorkerRequest,
  parseStorageWorkerResponse
} from "../src/storage/runtimeStorageWorkerProtocol";

const startExecution = {
  tenantId: "tenant-a",
  userId: "user-a",
  conversationId: "conversation-a",
  executionId: "execution-a",
  traceId: "trace-a",
  requestId: "business-request-a",
  message: "hello"
};

describe("Runtime storage worker protocol", () => {
  it("accepts closed semantic commands and typed responses", () => {
    expect(parseStorageWorkerRequest({
      requestId: "rpc-1",
      priority: "p1",
      operation: "lifecycle.startExecution",
      payload: startExecution
    })).toEqual({
      requestId: "rpc-1",
      priority: "p1",
      operation: "lifecycle.startExecution",
      payload: startExecution
    });

    expect(parseStorageWorkerRequest({
      requestId: "rpc-2",
      priority: "p2",
      operation: "outbox.applyOutcomes",
      payload: {
        outcomes: [{
          event: {
            tenantId: "tenant-a",
            userId: "user-a",
            conversationId: "conversation-a",
            eventId: "event-a"
          },
          transition: "delivered"
        }]
      }
    }).operation).toBe("outbox.applyOutcomes");

    expect(parseStorageWorkerRequest({
      requestId: "rpc-3",
      priority: "p1",
      operation: "memory.search",
      payload: {
        tenantId: "tenant-a",
        userId: "user-a",
        query: "concise"
      }
    }).operation).toBe("memory.search");

    expect(parseStorageWorkerResponse({
      requestId: "rpc-1",
      ok: true,
      result: { events: [] }
    })).toEqual({
      requestId: "rpc-1",
      ok: true,
      result: { events: [] }
    });
  });

  it.each([
    {
      requestId: "rpc-raw-sql",
      priority: "p1",
      operation: "sql",
      payload: { sql: "SELECT 1" }
    },
    {
      requestId: "rpc-callback",
      priority: "p1",
      operation: "history.get",
      payload: { tenantId: "t", callback: () => undefined }
    },
    {
      requestId: "rpc-nan",
      priority: "p2",
      operation: "storage.checkpoint",
      payload: { now: Number.NaN }
    },
    {
      requestId: "rpc-priority",
      priority: "foreground",
      operation: "history.get",
      payload: { tenantId: "t", userId: "u", conversationId: "c" }
    },
    {
      requestId: "rpc-extra-field",
      priority: "p1",
      operation: "history.get",
      payload: {
        tenantId: "t",
        userId: "u",
        conversationId: "c",
        unexpected: "must not cross the boundary"
      }
    },
    {
      requestId: "rpc-uppercase-sql",
      priority: "p1",
      operation: "history.get",
      payload: {
        tenantId: "t",
        userId: "u",
        conversationId: "c",
        SQL: "SELECT 1"
      }
    },
    {
      priority: "p0",
      operation: "bootstrap",
      payload: { databasePath: "/tmp/runtime.sqlite" }
    }
  ])("rejects malformed or executable request %#", request => {
    expect(() => parseStorageWorkerRequest(request)).toThrow(
      "invalid_storage_worker_request"
    );
  });

  it("rejects malformed responses", () => {
    expect(() => parseStorageWorkerResponse({
      requestId: "rpc-1",
      ok: false,
      error: { code: "bad code with spaces" }
    })).toThrow("invalid_storage_worker_response");
  });

  it.each([
    {
      requestId: "rpc-history-missing-scope",
      priority: "p1",
      operation: "history.get",
      payload: { tenantId: "tenant-a", userId: "user-a" }
    },
    {
      requestId: "rpc-lifecycle-missing-message",
      priority: "p1",
      operation: "lifecycle.startExecution",
      payload: {
        tenantId: "tenant-a",
        userId: "user-a",
        conversationId: "conversation-a",
        executionId: "execution-a",
        traceId: "trace-a",
        requestId: "request-a"
      }
    },
    {
      requestId: "rpc-lifecycle-invalid-crash",
      priority: "p1",
      operation: "lifecycle.startExecution",
      payload: {
        ...startExecution,
        crash: "execute-arbitrary-hook"
      }
    },
    {
      requestId: "rpc-memory-invalid-tags",
      priority: "p1",
      operation: "memory.search",
      payload: {
        tenantId: "tenant-a",
        userId: "user-a",
        query: "concise",
        tags: ["valid", 42]
      }
    },
    {
      requestId: "rpc-outbox-invalid-outcome",
      priority: "p2",
      operation: "outbox.applyOutcomes",
      payload: {
        outcomes: [{
          event: {
            tenantId: "tenant-a",
            userId: "user-a",
            conversationId: "conversation-a"
          },
          transition: "retry"
        }]
      }
    }
  ])("rejects incomplete semantic payload %#", request => {
    expect(() => parseStorageWorkerRequest(request))
      .toThrow("invalid_storage_worker_request");
  });
});
