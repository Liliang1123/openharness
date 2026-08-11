import { statSync } from "node:fs";
import type { PendingApproval } from "../approvalStore";
import type { AgentMessage, SessionEvent } from "../types";
import {
  RuntimeLifecycleCommands,
  type LifecycleCommit
} from "./lifecycleCommands";
import { reconcileRuntimeStartup } from "./reconcile";
import {
  migrateRuntimeDatabase,
  openRuntimeDatabase,
  type RuntimeDatabase
} from "./runtimeStorage";
import { createSqliteRuntimeRepositories, type SqliteRuntimeRepositories } from "./sqliteRuntimeRepositories";
import type {
  StorageOperation,
  StoragePayloadMap,
  StorageResultMap,
  StorageWorkerRequest,
  TraceOutboxTransitionResult
} from "./runtimeStorageWorkerProtocol";

export interface RuntimeStorageWorkerKernel {
  execute<O extends StorageOperation>(
    request: StorageWorkerRequest<O>
  ): StorageResultMap[O];
}

type KernelState = "new" | "open" | "closed";

export function createRuntimeStorageWorkerKernel(): RuntimeStorageWorkerKernel {
  let state: KernelState = "new";
  let database: RuntimeDatabase | undefined;
  let repositories: SqliteRuntimeRepositories | undefined;
  let lifecycle: RuntimeLifecycleCommands | undefined;

  function open(payload: StoragePayloadMap["bootstrap"]): StorageResultMap["bootstrap"] {
    if (state === "open") throw new Error("RUNTIME_STORAGE_ALREADY_BOOTSTRAPPED");
    if (state === "closed") throw new Error("RUNTIME_STORAGE_CLOSED");

    const opened = openRuntimeDatabase(payload.databasePath, {
      expectedDatabaseIdentity: payload.expectedDatabaseIdentity
    });
    try {
      migrateRuntimeDatabase(opened);
      const integrity = opened.get<{ integrity_check: string }>("PRAGMA integrity_check")?.integrity_check;
      if (integrity !== "ok") throw new Error("RUNTIME_STORAGE_INTEGRITY_CHECK_FAILED");
      const schemaVersion = opened.get<{ version: number | null }>(
        "SELECT MAX(version) AS version FROM schema_migrations"
      )?.version ?? 0;
      const stats = statSync(opened.path);
      const createdRepositories = createSqliteRuntimeRepositories();
      const reconciliation = reconcileRuntimeStartup(opened, createdRepositories);

      database = opened;
      repositories = createdRepositories;
      lifecycle = new RuntimeLifecycleCommands(opened, createdRepositories);
      state = "open";
      return {
        schemaVersion,
        integrity: "ok",
        databaseIdentity: { dev: stats.dev, ino: stats.ino },
        reconciliation
      };
    } catch (error) {
      opened.close();
      throw error;
    }
  }

  function requireOpen(): {
    database: RuntimeDatabase;
    repositories: SqliteRuntimeRepositories;
    lifecycle: RuntimeLifecycleCommands;
  } {
    if (state === "closed") throw new Error("RUNTIME_STORAGE_CLOSED");
    if (state !== "open" || !database || !repositories || !lifecycle) {
      throw new Error("RUNTIME_STORAGE_NOT_BOOTSTRAPPED");
    }
    return { database, repositories, lifecycle };
  }

  function dispatch(request: StorageWorkerRequest): unknown {
    if (request.operation === "bootstrap") return open(request.payload);
    const storage = requireOpen();

    switch (request.operation) {
      case "lifecycle.startExecution":
        return storage.lifecycle.startExecution(request.payload);
      case "lifecycle.enterApproval":
        return storage.lifecycle.enterApproval(request.payload);
      case "lifecycle.decideApproval":
        return storage.lifecycle.decideApproval(request.payload);
      case "lifecycle.recordToolPlan":
        return storage.lifecycle.recordToolPlan(request.payload);
      case "lifecycle.completeTool":
        return storage.lifecycle.completeTool(request.payload);
      case "lifecycle.completeExecution":
        return storage.lifecycle.completeExecution(request.payload);
      case "lifecycle.failExecution":
        return storage.lifecycle.failExecution(request.payload);
      case "lifecycle.abortExecution":
        return storage.lifecycle.abortExecution(request.payload);
      case "lifecycle.recordEvent":
        return storage.lifecycle.recordEvent(request.payload);
      case "lifecycle.recordInjectedMessages":
        return storage.lifecycle.recordInjectedMessages(request.payload);
      case "lifecycle.interruptExecution":
        return storage.lifecycle.interruptExecution(request.payload);
      case "history.get":
        return storage.repositories.history.get(
          storage.database,
          request.payload.tenantId,
          request.payload.userId,
          request.payload.conversationId
        );
      case "history.append":
        storage.database.transaction(tx => storage.repositories.history.append(
          tx,
          request.payload.tenantId,
          request.payload.userId,
          request.payload.conversationId,
          request.payload.message as AgentMessage
        ));
        return undefined;
      case "history.replace":
        storage.database.transaction(tx => storage.repositories.history.replace(
          tx,
          request.payload.tenantId,
          request.payload.userId,
          request.payload.conversationId,
          request.payload.messages as AgentMessage[]
        ));
        return undefined;
      case "history.list":
        return storage.repositories.history.list(
          storage.database,
          request.payload.tenantId,
          request.payload.userId
        );
      case "history.delete":
        storage.database.transaction(tx => storage.repositories.history.delete(
          tx,
          request.payload.tenantId,
          request.payload.userId,
          request.payload.conversationId
        ));
        return undefined;
      case "memory.upsert":
        return storage.database.transaction(tx =>
          storage.repositories.memory.upsert(tx, request.payload.fact)
        );
      case "memory.list":
        return storage.repositories.memory.list(
          storage.database,
          request.payload.tenantId,
          request.payload.userId
        );
      case "memory.search":
        return storage.repositories.memory.search(
          storage.database,
          request.payload.tenantId,
          request.payload.userId,
          request.payload.query,
          request.payload.tags
        );
      case "memory.delete":
        return storage.database.transaction(tx => storage.repositories.memory.delete(
          tx,
          request.payload.tenantId,
          request.payload.userId,
          request.payload.memoryId
        ));
      case "execution.get":
        return storage.repositories.execution.get(
          storage.database,
          request.payload.tenantId,
          request.payload.userId,
          request.payload.conversationId,
          request.payload.executionId
        );
      case "execution.getActive":
        return storage.repositories.execution.getActive(
          storage.database,
          request.payload.tenantId,
          request.payload.userId,
          request.payload.conversationId
        );
      case "execution.listNonTerminal":
        return storage.repositories.execution.listNonTerminal(storage.database);
      case "approval.get": {
        const record = storage.repositories.approval.getPendingByExecutionToolCall(
          storage.database,
          request.payload.tenantId,
          request.payload.userId,
          request.payload.conversationId,
          request.payload.executionId,
          request.payload.toolCallId
        );
        return record ? toPendingApproval(record) : null;
      }
      case "approval.listPending":
        return storage.repositories.approval.listPending(
          storage.database,
          request.payload.tenantId,
          request.payload.userId,
          request.payload.conversationId
        ).map(toPendingApproval);
      case "event.since": {
        const afterCursor = request.payload.afterEventId == null
          ? null
          : storage.repositories.runtimeEvent.cursorForEventId(
              storage.database,
              request.payload.tenantId,
              request.payload.userId,
              request.payload.conversationId,
              request.payload.afterEventId
            );
        if (request.payload.afterEventId != null && afterCursor == null) return [];
        return storage.repositories.runtimeEvent.replayAfter(
          storage.database,
          request.payload.tenantId,
          request.payload.userId,
          request.payload.conversationId,
          afterCursor
        );
      }
      case "event.forExecution":
        return storage.repositories.runtimeEvent.replayExecution(
          storage.database,
          request.payload.tenantId,
          request.payload.userId,
          request.payload.conversationId,
          request.payload.executionId
        );
      case "event.latestEventId": {
        const events = storage.repositories.runtimeEvent.replayAfter(
          storage.database,
          request.payload.tenantId,
          request.payload.userId,
          request.payload.conversationId,
          null
        );
        return events.at(-1)?.eventId ?? null;
      }
      case "event.hasEvent":
        return storage.repositories.runtimeEvent.cursorForEventId(
          storage.database,
          request.payload.tenantId,
          request.payload.userId,
          request.payload.conversationId,
          request.payload.eventId
        ) != null;
      case "outbox.claim":
        return storage.repositories.runtimeEvent.claimOutbox(
          storage.database,
          request.payload.now,
          request.payload.limit
        ).map(event => {
          const status = storage.repositories.runtimeEvent.getOutboxStatus(
            storage.database,
            event.tenantId,
            event.userId,
            event.conversationId,
            event.eventId
          );
          if (!status) throw new Error("RUNTIME_STORAGE_OUTBOX_STATUS_MISSING");
          return {
            event,
            deliveryAttempts: status.deliveryAttempts,
            nextAttemptAt: status.nextAttemptAt
          };
        });
      case "outbox.applyOutcomes":
        return applyOutboxOutcomes(storage.database, storage.repositories, request.payload.outcomes);
      case "outbox.hasDeadLetters":
        return storage.repositories.runtimeEvent.hasDeadLetters(storage.database);
      case "storage.checkpoint": {
        const checkpoint = storage.database.get<{
          busy: number;
          log: number;
          checkpointed: number;
        }>("PRAGMA wal_checkpoint(TRUNCATE)");
        if (!checkpoint) throw new Error("RUNTIME_STORAGE_CHECKPOINT_FAILED");
        return checkpoint;
      }
      case "storage.criticalDrain": {
        const nonTerminal = storage.repositories.execution.listNonTerminal(storage.database);
        const events: SessionEvent[] = [];
        let interruptedExecutions = 0;
        for (const execution of nonTerminal) {
          const commit: LifecycleCommit = storage.lifecycle.interruptExecution({
            tenantId: execution.tenantId,
            userId: execution.userId,
            conversationId: execution.conversationId,
            executionId: execution.executionId,
            traceId: "critical-drain",
            requestId: "critical-drain",
            errorMessage: request.payload.errorMessage
          });
          if (commit.events.length > 0) {
            interruptedExecutions += 1;
            events.push(...commit.events);
          }
        }
        return { interruptedExecutions, events };
      }
      case "storage.close":
        storage.database.get("PRAGMA wal_checkpoint(TRUNCATE)");
        storage.database.close();
        database = undefined;
        repositories = undefined;
        lifecycle = undefined;
        state = "closed";
        return undefined;
    }
  }

  return {
    execute<O extends StorageOperation>(
      request: StorageWorkerRequest<O>
    ): StorageResultMap[O] {
      return dispatch(request as StorageWorkerRequest) as StorageResultMap[O];
    }
  };
}

function applyOutboxOutcomes(
  database: RuntimeDatabase,
  repositories: SqliteRuntimeRepositories,
  outcomes: StoragePayloadMap["outbox.applyOutcomes"]["outcomes"]
): TraceOutboxTransitionResult {
  const counts = database.transaction(tx => {
    const result = {
      processed: 0,
      delivered: 0,
      retried: 0,
      deadLettered: 0
    };
    for (const outcome of outcomes) {
      const event = outcome.event;
      let changed: boolean;
      if (outcome.transition === "retry") {
        changed = repositories.runtimeEvent.markRetry(
          tx,
          event.tenantId,
          event.userId,
          event.conversationId,
          event.eventId,
          outcome.nextAttemptAt
        );
      } else if (outcome.transition === "delivered") {
        changed = repositories.runtimeEvent.markAcknowledged(
          tx,
          event.tenantId,
          event.userId,
          event.conversationId,
          event.eventId
        );
      } else {
        changed = repositories.runtimeEvent.markDeadLettered(
          tx,
          event.tenantId,
          event.userId,
          event.conversationId,
          event.eventId
        );
      }
      if (!changed) continue;
      result.processed += 1;
      if (outcome.transition === "delivered") result.delivered += 1;
      else if (outcome.transition === "retry") result.retried += 1;
      else result.deadLettered += 1;
    }
    return result;
  });
  return {
    ...counts,
    readinessDegraded: repositories.runtimeEvent.hasDeadLetters(database)
  };
}

function toPendingApproval(record: {
  approvalId: string;
  tenantId: string;
  userId: string;
  conversationId: string;
  executionId: string;
  payload: Record<string, unknown>;
  createdAt: number;
}): PendingApproval {
  return {
    askUserId: record.approvalId,
    tenantId: record.tenantId,
    userId: record.userId,
    conversationId: record.conversationId,
    executionId: record.executionId,
    toolCallId: String(record.payload.toolCallId ?? ""),
    toolName: String(record.payload.toolName ?? ""),
    argumentsRaw: String(record.payload.argumentsRaw ?? "{}"),
    ...(typeof record.payload.reason === "string" ? { reason: record.payload.reason } : {}),
    createdAt: new Date(record.createdAt).toISOString()
  };
}
