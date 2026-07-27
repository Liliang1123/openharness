import type { JavaClient } from "../javaClient";
import type { SessionEvent, TraceEvent } from "../types";
import type { RuntimeDatabase } from "./runtimeStorage";
import type { SqliteRuntimeRepositories } from "./sqliteRuntimeRepositories";
import type {
  TraceOutboxCandidate,
  TraceOutboxTransition,
  TraceOutboxTransitionResult
} from "./runtimeStorageWorkerProtocol";

export interface TraceOutboxOptions {
  limit?: number;
  concurrency?: number;
  maxAttempts: number;
  retryDelayMs: number;
  now: number;
}

export interface TraceOutboxDispatchResult {
  processed: number;
  delivered: number;
  retried: number;
  deadLettered: number;
  readinessDegraded: boolean;
}

export type TraceOutboxHeadersForEvent = (event: SessionEvent) => Record<string, string>;

export type TraceOutboxDeliveryOutcome =
  | { event: SessionEvent; transition: "delivered" }
  | { event: SessionEvent; transition: "retry"; nextAttemptAt: number }
  | { event: SessionEvent; transition: "dead_letter" };

export interface TraceOutboxStore {
  claim(now: number, limit: number): Promise<TraceOutboxCandidate[]>;
  applyOutcomes(outcomes: TraceOutboxTransition[]): Promise<TraceOutboxTransitionResult>;
  hasDeadLetters(): Promise<boolean>;
}

export async function dispatchTraceOutboxStoreBatch(
  store: TraceOutboxStore,
  javaClient: Pick<JavaClient, "postTrace">,
  headersFor: TraceOutboxHeadersForEvent,
  options: TraceOutboxOptions
): Promise<TraceOutboxDispatchResult> {
  const limit = positiveInteger(options.limit ?? 100, "trace outbox batch limit");
  const concurrency = positiveInteger(options.concurrency ?? 20, "trace outbox delivery concurrency");
  positiveInteger(options.maxAttempts, "trace outbox maximum attempts");
  positiveInteger(options.retryDelayMs, "trace outbox retry delay");
  if (!Number.isFinite(options.now)) throw new Error("Trace outbox current time must be finite");

  const candidates = await store.claim(options.now, limit);
  const outcomes = await mapWithConcurrency(candidates, concurrency, async candidate => {
    const event = candidate.event;
    try {
      await javaClient.postTrace(toCommittedTraceEvent(event), headersFor(event));
      return {
        event: eventKey(event),
        transition: "delivered"
      } satisfies TraceOutboxTransition;
    } catch {
      if (candidate.deliveryAttempts + 1 >= options.maxAttempts) {
        return {
          event: eventKey(event),
          transition: "dead_letter"
        } satisfies TraceOutboxTransition;
      }
      return {
        event: eventKey(event),
        transition: "retry",
        nextAttemptAt: options.now + options.retryDelayMs
      } satisfies TraceOutboxTransition;
    }
  });
  if (outcomes.length === 0) {
    return {
      processed: 0,
      delivered: 0,
      retried: 0,
      deadLettered: 0,
      readinessDegraded: await store.hasDeadLetters()
    };
  }
  return store.applyOutcomes(outcomes);
}

export async function dispatchTraceOutboxBatch(
  database: RuntimeDatabase,
  repositories: SqliteRuntimeRepositories,
  javaClient: Pick<JavaClient, "postTrace">,
  headersFor: TraceOutboxHeadersForEvent,
  options: TraceOutboxOptions
): Promise<TraceOutboxDispatchResult> {
  const limit = positiveInteger(options.limit ?? 100, "trace outbox batch limit");
  const concurrency = positiveInteger(options.concurrency ?? 20, "trace outbox delivery concurrency");
  positiveInteger(options.maxAttempts, "trace outbox maximum attempts");
  positiveInteger(options.retryDelayMs, "trace outbox retry delay");
  if (!Number.isFinite(options.now)) throw new Error("Trace outbox current time must be finite");
  const candidates = repositories.runtimeEvent.claimOutbox(database, options.now, limit);
  const result: TraceOutboxDispatchResult = {
    processed: 0,
    delivered: 0,
    retried: 0,
    deadLettered: 0,
    readinessDegraded: false
  };

  const outcomes = (await mapWithConcurrency<
    SessionEvent,
    TraceOutboxDeliveryOutcome | undefined
  >(candidates, concurrency, async (event) => {
    const status = repositories.runtimeEvent.getOutboxStatus(
      database,
      event.tenantId,
      event.userId,
      event.conversationId,
      event.eventId
    );
    if (
      !status
      || !["pending", "retry"].includes(status.deliveryStatus)
      || (status.nextAttemptAt != null && status.nextAttemptAt > options.now)
    ) {
      return;
    }

    try {
      await javaClient.postTrace(toCommittedTraceEvent(event), headersFor(event));
      return { event, transition: "delivered" } satisfies TraceOutboxDeliveryOutcome;
    } catch {
      if (status.deliveryAttempts + 1 >= options.maxAttempts) {
        return { event, transition: "dead_letter" } satisfies TraceOutboxDeliveryOutcome;
      }
      return {
        event,
        transition: "retry",
        nextAttemptAt: options.now + options.retryDelayMs
      } satisfies TraceOutboxDeliveryOutcome;
    }
  })).filter((outcome): outcome is TraceOutboxDeliveryOutcome => outcome !== undefined);

  if (outcomes.length > 0) {
    database.transaction((tx) => {
      for (const outcome of outcomes) {
        const event = outcome.event;
        if (outcome.transition === "delivered") {
          repositories.runtimeEvent.markAcknowledged(
            tx,
            event.tenantId,
            event.userId,
            event.conversationId,
            event.eventId
          );
        } else if (outcome.transition === "dead_letter") {
          repositories.runtimeEvent.markDeadLettered(
            tx,
            event.tenantId,
            event.userId,
            event.conversationId,
            event.eventId
          );
        } else {
          repositories.runtimeEvent.markRetry(
            tx,
            event.tenantId,
            event.userId,
            event.conversationId,
            event.eventId,
            outcome.nextAttemptAt
          );
        }
      }
    });
  }

  result.processed = outcomes.length;
  for (const outcome of outcomes) {
    if (outcome.transition === "delivered") result.delivered += 1;
    else if (outcome.transition === "retry") result.retried += 1;
    else {
      result.deadLettered += 1;
      result.readinessDegraded = true;
    }
  }

  return result;
}

async function mapWithConcurrency<T, R>(
  values: readonly T[],
  concurrency: number,
  work: (value: T) => Promise<R>
): Promise<R[]> {
  let nextIndex = 0;
  const results = new Array<R>(values.length);
  const workers = Array.from({ length: Math.min(concurrency, values.length) }, async () => {
    while (true) {
      const index = nextIndex;
      if (index >= values.length) return;
      nextIndex += 1;
      results[index] = await work(values[index]!);
    }
  });
  await Promise.all(workers);
  return results;
}

function positiveInteger(value: number, label: string): number {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error(`${label} must be a positive integer`);
  }
  return value;
}

function toCommittedTraceEvent(event: SessionEvent): TraceEvent {
  const data = event.data as Partial<TraceEvent> & { attributes?: Record<string, unknown> };
  return {
    traceId: event.traceId,
    spanId: data.spanId ?? event.eventId,
    parentSpanId: data.parentSpanId,
    requestId: event.requestId,
    conversationId: event.conversationId,
    taskId: data.taskId,
    userId: event.userId,
    tenantId: event.tenantId,
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

function eventKey(event: SessionEvent): Pick<
  SessionEvent,
  "tenantId" | "userId" | "conversationId" | "eventId"
> {
  return {
    tenantId: event.tenantId,
    userId: event.userId,
    conversationId: event.conversationId,
    eventId: event.eventId
  };
}
