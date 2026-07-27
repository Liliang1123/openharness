import { EventEmitter } from "node:events";
import type { AgentDefinition } from "@openharness/shared-schema";
import type { FastifyReply } from "fastify";
import { describe, expect, it } from "vitest";
import type { AgentExecutionRunner } from "../src/agentExecutionRunner";
import { AgentStreamLoop } from "../src/agentStreamLoop";
import { InMemoryRuntimeEventStore } from "../src/runtimeEventStore";
import type { EventId, RuntimeEventKind, SessionEvent } from "../src/types";

class CountingRuntimeEventStore extends InMemoryRuntimeEventStore {
  sinceCalls = 0;
  forExecutionCalls: Array<{
    tenantId: string;
    userId: string;
    conversationId: string;
    executionId?: string;
  }> = [];

  override since(
    tenantId: string,
    userId: string,
    conversationId: string,
    afterEventId: EventId | null
  ): SessionEvent[] {
    this.sinceCalls += 1;
    return super.since(tenantId, userId, conversationId, afterEventId);
  }

  override forExecution(
    tenantId: string,
    userId: string,
    conversationId: string,
    executionId?: string
  ): SessionEvent[] {
    this.forExecutionCalls.push({ tenantId, userId, conversationId, executionId });
    return super.forExecution(tenantId, userId, conversationId, executionId);
  }
}

class ObservableRawReply extends EventEmitter {
  readonly chunks: string[] = [];

  constructor(private readonly order: string[]) {
    super();
  }

  writeHead(): this {
    this.order.push("writeHead");
    return this;
  }

  flushHeaders(): void {
    this.order.push("flushHeaders");
  }

  write(chunk: string): boolean {
    this.order.push("write");
    this.chunks.push(chunk);
    return true;
  }

  end(): this {
    this.order.push("end");
    return this;
  }
}

describe("AgentStreamLoop", () => {
  it("does not expose HTTP 200 before durable admission resolves", async () => {
    const order: string[] = [];
    const store = new CountingRuntimeEventStore();
    let resolveAdmission!: () => void;
    const admitted = new Promise<void>(resolve => {
      resolveAdmission = resolve;
    });
    const runner = {
      start() {
        order.push("start");
        return {
          executionId: "exec-deferred",
          admitted,
          done: Promise.resolve({})
        };
      }
    } as unknown as AgentExecutionRunner;
    const raw = new ObservableRawReply(order);
    const reply = {
      request: { headers: {} },
      raw
    } as unknown as FastifyReply;

    const streaming = new AgentStreamLoop(runner, store).stream({
      conversationId: "conv-1",
      message: "hello",
      userId: "user-1",
      tenantId: "tenant-1",
      traceId: "trace-deferred",
      requestId: "req-deferred",
      headers: {},
      agentDefinition: {} as AgentDefinition
    }, reply);

    await Promise.resolve();
    expect(order).toEqual(["start"]);
    append(store, "exec-deferred", "stream_done", "req-deferred");
    resolveAdmission();
    await streaming;
    expect(order.indexOf("writeHead")).toBeGreaterThan(order.indexOf("start"));
  });

  it("flushes only after durable start and drains only the current execution", async () => {
    const order: string[] = [];
    const store = new CountingRuntimeEventStore();
    append(store, "exec-old", "agent_start", "req-old");
    append(store, "exec-old", "stream_done", "req-old");

    const runner = {
      start() {
        order.push("start");
        append(store, "exec-current", "agent_start", "req-current");
        append(store, "exec-current", "stream_done", "req-current");
        return {
          executionId: "exec-current",
          admitted: Promise.resolve(),
          done: Promise.resolve({})
        };
      }
    } as unknown as AgentExecutionRunner;
    const raw = new ObservableRawReply(order);
    const reply = {
      request: { headers: {} },
      raw
    } as unknown as FastifyReply;

    await new AgentStreamLoop(runner, store).stream({
      conversationId: "conv-1",
      message: "hello",
      userId: "user-1",
      tenantId: "tenant-1",
      traceId: "trace-current",
      requestId: "req-current",
      headers: {},
      agentDefinition: {} as AgentDefinition
    }, reply);

    expect(order.indexOf("start")).toBeLessThan(order.indexOf("writeHead"));
    expect(order.indexOf("writeHead")).toBeLessThan(order.indexOf("flushHeaders"));
    expect(order.indexOf("flushHeaders")).toBeLessThan(order.indexOf("write"));
    expect(store.sinceCalls).toBe(0);
    expect(store.forExecutionCalls).toEqual([{
      tenantId: "tenant-1",
      userId: "user-1",
      conversationId: "conv-1",
      executionId: "exec-current"
    }]);

    const body = raw.chunks.join("");
    expect(body).toContain("req-current");
    expect(body).not.toContain("req-old");
    expect(body.match(/event: agent_start/g)).toHaveLength(1);
    expect(body.match(/event: stream_done/g)).toHaveLength(1);
  });
});

function append(
  store: InMemoryRuntimeEventStore,
  executionId: string,
  kind: RuntimeEventKind,
  requestId: string
): void {
  store.append("tenant-1", "user-1", "conv-1", {
    executionId,
    conversationId: "conv-1",
    tenantId: "tenant-1",
    userId: "user-1",
    traceId: `trace-${executionId}`,
    requestId,
    createdAt: Date.now(),
    kind,
    data: {}
  });
}
