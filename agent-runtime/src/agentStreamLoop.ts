import type { FastifyReply } from "fastify";
import type { AgentDefinition } from "@openharness/shared-schema";
import type { AgentExecutionRunner } from "./agentExecutionRunner";
import type { RuntimeChatLifecycleLogger } from "./runtimeChatLifecycleLog";
import type { RuntimeEventStore } from "./runtimeEventStore";
import type { SessionEvent } from "./types";

export interface StreamInput {
  conversationId: string;
  message: string;
  userId: string;
  tenantId: string;
  traceId: string;
  requestId: string;
  headers: Record<string, string>;
  agentDefinition: AgentDefinition;
  stepBudget?: number;
  lifecycleLogger?: RuntimeChatLifecycleLogger;
}

/**
 * SSE adapter: launches a detached AgentExecutionRunner and forwards events
 * from RuntimeEventStore to the HTTP reply. Client disconnect only stops the
 * forwarding; the runner continues to completion.
 */
export class AgentStreamLoop {
  constructor(
    private readonly runner: AgentExecutionRunner,
    private readonly runtimeEventStore: RuntimeEventStore
  ) {}

  async stream(input: StreamInput, reply: FastifyReply): Promise<void> {
    const origin = reply.request.headers.origin ?? "*";

    // Durable admission happens before the client observes HTTP 200. start()
    // commits the execution and its initial lifecycle events.
    const handle = this.runner.start(input);
    await handle.admitted;
    reply.raw.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "Access-Control-Allow-Origin": origin,
      "Access-Control-Expose-Headers": "X-Trace-Id, X-Request-Id"
    });
    reply.raw.flushHeaders();

    let closed = false;
    let closePromise: () => void = () => {};
    const closed$ = new Promise<void>(resolve => { closePromise = resolve; });

    const seen = new Set<string>();
    let unsubscribe: (() => void) | null = null;
    let heartbeat: NodeJS.Timeout | null = null;
    let replaying = true;
    const bufferedLive: SessionEvent[] = [];

    const close = () => {
      if (closed) return;
      closed = true;
      if (unsubscribe) unsubscribe();
      if (heartbeat) clearInterval(heartbeat);
      try { reply.raw.end(); } catch { /* already closed */ }
      closePromise();
    };

    const writeSse = (e: SessionEvent) => {
      if (e.executionId !== handle.executionId) return; // filter: only this run's events
      if (seen.has(e.eventId)) return;
      seen.add(e.eventId);

      const data = {
        durability: e.durability,
        eventId: e.eventId,
        executionId: e.executionId,
        conversationId: e.conversationId,
        tenantId: e.tenantId,
        userId: e.userId,
        traceId: e.traceId,
        requestId: e.requestId,
        createdAt: e.createdAt,
        data: e.data
      };
      try {
        reply.raw.write(`event: ${e.kind}\ndata: ${JSON.stringify(data)}\n\n`);
      } catch {
        // Client gone; will be handled by close().
      }

      if (e.kind === "stream_done" || e.kind === "stream_error") close();
    };

    // Subscribe before async replay. Live events are buffered until replay is emitted,
    // then drained in durable event order with eventId de-duplication in writeSse.
    unsubscribe = this.runtimeEventStore.subscribe(input.tenantId, input.userId, input.conversationId, event => {
      if (replaying) bufferedLive.push(event);
      else writeSse(event);
    });
    const replayed = await this.runtimeEventStore.forExecution(
      input.tenantId,
      input.userId,
      input.conversationId,
      handle.executionId
    );
    for (const e of replayed) {
      if (closed) break;
      writeSse(e);
    }
    replaying = false;
    for (const event of bufferedLive.sort(compareEventOrder)) {
      if (closed) break;
      writeSse(event);
    }

    if (closed) return;

    heartbeat = setInterval(() => {
      if (closed) return;
      try { reply.raw.write(`: heartbeat\n\n`); } catch { /* ignore */ }
    }, 30000);

    // Detect client disconnect via the response socket. We deliberately do NOT listen on
    // `reply.request.raw` ('close' on IncomingMessage fires after the request body is fully
    // consumed for POST requests in Node 18+, which would close the stream prematurely).
    // ServerResponse 'close' fires both on normal end and premature termination; the
    // `closed` guard makes the call idempotent.
    reply.raw.on("close", close);

    await closed$;
  }
}

function compareEventOrder(left: SessionEvent, right: SessionEvent): number {
  const leftCursor = Number(left.eventId.slice(left.eventId.lastIndexOf(":") + 1));
  const rightCursor = Number(right.eventId.slice(right.eventId.lastIndexOf(":") + 1));
  if (Number.isSafeInteger(leftCursor) && Number.isSafeInteger(rightCursor)) {
    return leftCursor - rightCursor;
  }
  return left.createdAt - right.createdAt || left.eventId.localeCompare(right.eventId);
}
