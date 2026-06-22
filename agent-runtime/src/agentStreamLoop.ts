import type { FastifyReply } from "fastify";
import type { AgentDefinition } from "@openharness/shared-schema";
import type { AgentExecutionRunner } from "./agentExecutionRunner";
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
    reply.raw.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "Access-Control-Allow-Origin": origin,
      "Access-Control-Expose-Headers": "X-Trace-Id, X-Request-Id"
    });

    // Start the detached runner. It synchronously emits agent_start to the store.
    const handle = this.runner.start(input);

    let closed = false;
    let closePromise: () => void = () => {};
    const closed$ = new Promise<void>(resolve => { closePromise = resolve; });

    const seen = new Set<string>();
    let unsubscribe: (() => void) | null = null;
    let heartbeat: NodeJS.Timeout | null = null;

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
        ...e.data,
        eventId: e.eventId,
        executionId: e.executionId,
        conversationId: e.conversationId,
        tenantId: e.tenantId,
        traceId: e.traceId,
        requestId: e.requestId,
        createdAt: e.createdAt
      };
      try {
        reply.raw.write(`event: ${e.kind}\ndata: ${JSON.stringify(data)}\n\n`);
      } catch {
        // Client gone; will be handled by close().
      }

      if (e.kind === "stream_done" || e.kind === "stream_error") close();
    };

    // Subscribe first, then drain any events already emitted synchronously by runner.start().
    unsubscribe = this.runtimeEventStore.subscribe(input.tenantId, input.conversationId, writeSse);
    for (const e of this.runtimeEventStore.since(input.tenantId, input.conversationId, null)) {
      if (closed) break;
      writeSse(e);
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
