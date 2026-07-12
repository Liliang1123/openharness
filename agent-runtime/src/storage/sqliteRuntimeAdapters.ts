import type { PendingApproval } from "../approvalStore";
import type { HistoryStore } from "../history";
import type { MemoryStore } from "../memoryStore";
import type { RuntimeEventReader } from "../runtimeEventStore";
import type { EventId, SessionEvent } from "../types";
import type { SqliteExecutionRecord } from "./sqliteExecutionStore";
import type { SqliteRuntimeRepositories } from "./sqliteRuntimeRepositories";
import type { RuntimeDatabase } from "./runtimeStorage";

export interface ScopedExecutionReader {
  get(tenantId: string, userId: string, conversationId: string, executionId: string): SqliteExecutionRecord | null;
  getActive(tenantId: string, userId: string, conversationId: string): SqliteExecutionRecord | null;
}

export interface ScopedApprovalReader {
  get(tenantId: string, userId: string, conversationId: string, executionId: string, toolCallId: string): PendingApproval | null;
  listPending(tenantId: string, userId: string, conversationId: string): PendingApproval[];
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
    get: (tenantId, userId, conversationId) => database.transaction(tx => repositories.history.get(tx, tenantId, userId, conversationId)),
    replace: (tenantId, userId, conversationId, messages) => database.transaction(tx => repositories.history.replace(tx, tenantId, userId, conversationId, messages)),
    async save() {},
    async load() {},
    list: async (tenantId, userId) => database.transaction(tx => repositories.history.list(tx, tenantId, userId)),
    delete: async (tenantId, userId, conversationId) => {
      database.transaction(tx => repositories.history.delete(tx, tenantId, userId, conversationId));
    }
  };

  const memory: MemoryStore = {
    upsert: async fact => database.transaction(tx => repositories.memory.upsert(tx, fact)),
    list: async (tenantId, userId) => database.transaction(tx => repositories.memory.list(tx, tenantId, userId)),
    search: async (tenantId, userId, query, tags) => database.transaction(tx => repositories.memory.search(tx, tenantId, userId, query, tags)),
    delete: async (tenantId, userId, memoryId) => database.transaction(tx => repositories.memory.delete(tx, tenantId, userId, memoryId))
  };

  const executions: ScopedExecutionReader = {
    get: (tenantId, userId, conversationId, executionId) => database.transaction(tx => repositories.execution.get(tx, tenantId, userId, conversationId, executionId)),
    getActive: (tenantId, userId, conversationId) => database.transaction(tx => repositories.execution.getActive(tx, tenantId, userId, conversationId))
  };

  const approvals: ScopedApprovalReader = {
    get(tenantId, userId, conversationId, executionId, toolCallId) {
      const record = database.transaction(tx => repositories.approval.getPendingByExecutionToolCall(
        tx, tenantId, userId, conversationId, executionId, toolCallId
      ));
      return record
        ? pendingApproval(record.approvalId, record.tenantId, record.userId, record.conversationId, record.executionId, record.payload, record.createdAt)
        : null;
    },
    listPending(tenantId, userId, conversationId) {
      return database.transaction(tx => repositories.approval.listPending(tx, tenantId, userId, conversationId))
        .map(record => pendingApproval(record.approvalId, record.tenantId, record.userId, record.conversationId, record.executionId, record.payload, record.createdAt));
    }
  };

  const events: RuntimeEventReader = {
    since(tenantId, userId, conversationId, afterEventId) {
      const afterCursor = afterEventId == null
        ? null
        : database.transaction(tx => repositories.runtimeEvent.cursorForEventId(tx, tenantId, userId, conversationId, afterEventId));
      if (afterEventId != null && afterCursor == null) return [];
      return database.transaction(tx => repositories.runtimeEvent.replayAfter(tx, tenantId, userId, conversationId, afterCursor));
    },
    latestEventId(tenantId, userId, conversationId) {
      const events = database.transaction(tx => repositories.runtimeEvent.replayAfter(tx, tenantId, userId, conversationId, null));
      return events[events.length - 1]?.eventId ?? null;
    },
    hasEvent(tenantId, userId, conversationId, eventId) {
      return database.transaction(tx => repositories.runtimeEvent.cursorForEventId(tx, tenantId, userId, conversationId, eventId)) != null;
    }
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
