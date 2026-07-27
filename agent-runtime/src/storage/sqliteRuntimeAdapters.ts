import type { PendingApproval } from "../approvalStore";
import type { HistoryStore } from "../history";
import type { MemoryStore } from "../memoryStore";
import type { RuntimeEventReader } from "../runtimeEventStore";
import type { EventId, SessionEvent } from "../types";
import type { Awaitable } from "../types";
import type { SqliteExecutionRecord } from "./sqliteExecutionStore";
import type { SqliteRuntimeRepositories } from "./sqliteRuntimeRepositories";
import type { RuntimeDatabase } from "./runtimeStorage";
import type { RuntimeStorageWorkerClient } from "./runtimeStorageWorkerClient";

export interface ScopedExecutionReader {
  get(tenantId: string, userId: string, conversationId: string, executionId: string): Awaitable<SqliteExecutionRecord | null>;
  getActive(tenantId: string, userId: string, conversationId: string): Awaitable<SqliteExecutionRecord | null>;
}

export interface ScopedApprovalReader {
  get(tenantId: string, userId: string, conversationId: string, executionId: string, toolCallId: string): Awaitable<PendingApproval | null>;
  listPending(tenantId: string, userId: string, conversationId: string): Awaitable<PendingApproval[]>;
}

export interface SqliteRuntimeAdapters {
  history: HistoryStore;
  memory: MemoryStore;
  executions: ScopedExecutionReader;
  approvals: ScopedApprovalReader;
  events: RuntimeEventReader;
}

export function createSqliteRuntimeAdapters(
  database: RuntimeDatabase,
  repositories: SqliteRuntimeRepositories
): SqliteRuntimeAdapters {
  const history: HistoryStore = {
    append: (tenantId, userId, conversationId, message) => database.transaction(tx => repositories.history.append(tx, tenantId, userId, conversationId, message)),
    get: (tenantId, userId, conversationId) => repositories.history.get(database, tenantId, userId, conversationId),
    replace: (tenantId, userId, conversationId, messages) => database.transaction(tx => repositories.history.replace(tx, tenantId, userId, conversationId, messages)),
    async save() {},
    async load() {},
    list: async (tenantId, userId) => repositories.history.list(database, tenantId, userId),
    delete: async (tenantId, userId, conversationId) => {
      database.transaction(tx => repositories.history.delete(tx, tenantId, userId, conversationId));
    }
  };

  const memory: MemoryStore = {
    upsert: async fact => database.transaction(tx => repositories.memory.upsert(tx, fact)),
    list: async (tenantId, userId) => repositories.memory.list(database, tenantId, userId),
    search: async (tenantId, userId, query, tags) => repositories.memory.search(database, tenantId, userId, query, tags),
    delete: async (tenantId, userId, memoryId) => database.transaction(tx => repositories.memory.delete(tx, tenantId, userId, memoryId))
  };

  const executions: ScopedExecutionReader = {
    get: (tenantId, userId, conversationId, executionId) =>
      repositories.execution.get(database, tenantId, userId, conversationId, executionId),
    getActive: (tenantId, userId, conversationId) =>
      repositories.execution.getActive(database, tenantId, userId, conversationId)
  };

  const approvals: ScopedApprovalReader = {
    get(tenantId, userId, conversationId, executionId, toolCallId) {
      const record = repositories.approval.getPendingByExecutionToolCall(
        database, tenantId, userId, conversationId, executionId, toolCallId
      );
      return record
        ? pendingApproval(record.approvalId, record.tenantId, record.userId, record.conversationId, record.executionId, record.payload, record.createdAt)
        : null;
    },
    listPending(tenantId, userId, conversationId) {
      return repositories.approval.listPending(database, tenantId, userId, conversationId)
        .map(record => pendingApproval(record.approvalId, record.tenantId, record.userId, record.conversationId, record.executionId, record.payload, record.createdAt));
    }
  };

  const events: RuntimeEventReader = {
    since(tenantId, userId, conversationId, afterEventId) {
      const afterCursor = afterEventId == null
        ? null
        : repositories.runtimeEvent.cursorForEventId(database, tenantId, userId, conversationId, afterEventId);
      if (afterEventId != null && afterCursor == null) return [];
      return repositories.runtimeEvent.replayAfter(database, tenantId, userId, conversationId, afterCursor);
    },
    forExecution(tenantId, userId, conversationId, executionId) {
      return repositories.runtimeEvent.replayExecution(
        database,
        tenantId,
        userId,
        conversationId,
        executionId
      );
    },
    latestEventId(tenantId, userId, conversationId) {
      const events = repositories.runtimeEvent.replayAfter(database, tenantId, userId, conversationId, null);
      return events[events.length - 1]?.eventId ?? null;
    },
    hasEvent(tenantId, userId, conversationId, eventId) {
      return repositories.runtimeEvent.cursorForEventId(
        database,
        tenantId,
        userId,
        conversationId,
        eventId
      ) != null;
    }
  };

  return { history, memory, executions, approvals, events };
}

export function createRuntimeStorageWorkerAdapters(
  storage: RuntimeStorageWorkerClient
): SqliteRuntimeAdapters {
  const history: HistoryStore = {
    append: (tenantId, userId, conversationId, message) =>
      storage.execute("p1", "history.append", { tenantId, userId, conversationId, message }),
    get: (tenantId, userId, conversationId) =>
      storage.execute("p1", "history.get", { tenantId, userId, conversationId }) as Promise<import("../types").AgentMessage[]>,
    replace: (tenantId, userId, conversationId, messages) =>
      storage.execute("p1", "history.replace", { tenantId, userId, conversationId, messages }),
    async save() {},
    async load() {},
    list: (tenantId, userId) =>
      storage.execute("p1", "history.list", { tenantId, userId }),
    delete: (tenantId, userId, conversationId) =>
      storage.execute("p1", "history.delete", { tenantId, userId, conversationId })
  };

  const memory: MemoryStore = {
    upsert: fact => storage.execute("p1", "memory.upsert", { fact }),
    list: (tenantId, userId) => storage.execute("p1", "memory.list", { tenantId, userId }),
    search: (tenantId, userId, query, tags) =>
      storage.execute("p1", "memory.search", { tenantId, userId, query, tags }),
    delete: (tenantId, userId, memoryId) =>
      storage.execute("p1", "memory.delete", { tenantId, userId, memoryId })
  };

  const executions: ScopedExecutionReader = {
    get: (tenantId, userId, conversationId, executionId) =>
      storage.execute("p1", "execution.get", {
        tenantId,
        userId,
        conversationId,
        executionId
      }),
    getActive: (tenantId, userId, conversationId) =>
      storage.execute("p1", "execution.getActive", {
        tenantId,
        userId,
        conversationId
      })
  };

  const approvals: ScopedApprovalReader = {
    get: (tenantId, userId, conversationId, executionId, toolCallId) =>
      storage.execute("p1", "approval.get", {
        tenantId,
        userId,
        conversationId,
        executionId,
        toolCallId
      }),
    listPending: (tenantId, userId, conversationId) =>
      storage.execute("p1", "approval.listPending", {
        tenantId,
        userId,
        conversationId
      })
  };

  const events: RuntimeEventReader = {
    since: (tenantId, userId, conversationId, afterEventId) =>
      storage.execute("p1", "event.since", {
        tenantId,
        userId,
        conversationId,
        afterEventId
      }),
    forExecution: (tenantId, userId, conversationId, executionId) =>
      storage.execute("p1", "event.forExecution", {
        tenantId,
        userId,
        conversationId,
        executionId
      }),
    latestEventId: (tenantId, userId, conversationId) =>
      storage.execute("p1", "event.latestEventId", {
        tenantId,
        userId,
        conversationId
      }),
    hasEvent: (tenantId, userId, conversationId, eventId) =>
      storage.execute("p1", "event.hasEvent", {
        tenantId,
        userId,
        conversationId,
        eventId
      })
  };

  return { history, memory, executions, approvals, events };
}

function pendingApproval(
  approvalId: string,
  tenantId: string,
  userId: string,
  conversationId: string,
  executionId: string,
  payload: Record<string, unknown>,
  createdAt: number
): PendingApproval {
  return {
    askUserId: approvalId,
    tenantId,
    userId,
    conversationId,
    executionId,
    toolCallId: String(payload.toolCallId ?? ""),
    toolName: String(payload.toolName ?? ""),
    argumentsRaw: String(payload.argumentsRaw ?? "{}"),
    ...(typeof payload.reason === "string" ? { reason: payload.reason } : {}),
    createdAt: new Date(createdAt).toISOString()
  };
}
