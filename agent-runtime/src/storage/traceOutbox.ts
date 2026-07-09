import type { JavaClient } from "../javaClient";
import type { SessionEvent, TraceEvent } from "../types";
import type { RuntimeDatabase } from "./runtimeStorage";
import type { SqliteRuntimeRepositories } from "./sqliteRuntimeRepositories";

export interface TraceOutboxOptions {
  limit?: number;
  maxAttempts: number;
  retryDelayMs: number;
  now: number;
}

export interface TraceOutboxDispatchResult {
  delivered: number;
  retried: number;
  deadLettered: number;
  readinessDegraded: boolean;
}

export async function dispatchTraceOutboxBatch(
  database: RuntimeDatabase,
  repositories: SqliteRuntimeRepositories,
  javaClient: Pick<JavaClient, "postTrace">,
  headers: Record<string, string>,
  options: TraceOutboxOptions
): Promise<TraceOutboxDispatchResult> {
  const candidates = database.transaction((tx) => repositories.runtimeEvent.claimOutbox(tx, options.limit ?? 100))
    .filter((event) => event.kind === "trace");
  const result: TraceOutboxDispatchResult = {
    delivered: 0,
    retried: 0,
    deadLettered: 0,
    readinessDegraded: false
  };

  for (const event of candidates) {
    const status = database.transaction((tx) =>
      repositories.runtimeEvent.getOutboxStatus(tx, event.tenantId, event.userId, event.conversationId, event.eventId)
    );
    if (!status || (status.nextAttemptAt != null && status.nextAttemptAt > options.now)) continue;

    try {
      await javaClient.postTrace(toCommittedTraceEvent(event), headers);
      database.transaction((tx) =>
        repositories.runtimeEvent.markAcknowledged(tx, event.tenantId, event.userId, event.conversationId, event.eventId)
      );
      result.delivered += 1;
    } catch {
      if (status.deliveryAttempts + 1 >= options.maxAttempts) {
        database.transaction((tx) =>
          repositories.runtimeEvent.markDeadLettered(tx, event.tenantId, event.userId, event.conversationId, event.eventId)
        );
        result.deadLettered += 1;
        result.readinessDegraded = true;
      } else {
        database.transaction((tx) =>
          repositories.runtimeEvent.markRetry(
            tx,
            event.tenantId,
            event.userId,
            event.conversationId,
            event.eventId,
            options.now + options.retryDelayMs
          )
        );
        result.retried += 1;
      }
    }
  }

  return result;
}

function toCommittedTraceEvent(event: SessionEvent): TraceEvent {
  const data = event.data as Partial<TraceEvent> & { attributes?: Record<string, unknown> };
  return {
    traceId: data.traceId ?? event.traceId,
    spanId: data.spanId ?? event.eventId,
    parentSpanId: data.parentSpanId,
    requestId: data.requestId ?? event.requestId,
    conversationId: data.conversationId ?? event.conversationId,
    taskId: data.taskId,
    userId: data.userId ?? event.userId,
    tenantId: data.tenantId ?? event.tenantId,
    agentId: data.agentId,
    runtime: data.runtime ?? "agent-runtime",
    eventType: data.eventType ?? event.kind,
    name: data.name ?? event.kind,
    attributes: {
      ...(data.attributes ?? {}),
      committedEventId: event.eventId
    },
    status: data.status ?? "ok",
    errorClass: data.errorClass,
    errorMessage: data.errorMessage,
    startTime: data.startTime ?? event.createdAt,
    endTime: data.endTime,
    durationMs: data.durationMs,
    promptTokens: data.promptTokens,
    completionTokens: data.completionTokens,
    cacheReadTokens: data.cacheReadTokens,
    cacheWriteTokens: data.cacheWriteTokens,
    costUsdMicros: data.costUsdMicros,
    redacted: data.redacted
  };
}
