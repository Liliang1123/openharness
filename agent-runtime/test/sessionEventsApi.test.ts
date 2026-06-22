import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createServer } from "../src/server";
import { InMemoryRuntimeEventStore } from "../src/runtimeEventStore";
import type { JavaClient } from "../src/javaClient";
import type { CatalogResponse } from "../src/types";

// Stub Java client (this endpoint does not call Java).
class StubJavaClient implements JavaClient {
  async getCatalog(): Promise<CatalogResponse> {
    return { catalogVersion: "v1", catalogHash: "h1", tools: [] };
  }
  async chat(): Promise<never> { throw new Error("not used"); }
  async executeTool(): Promise<never> { throw new Error("not used"); }
  async postTrace() {}
  async evaluatePolicy(req: { requestId: string; conversationId: string; toolCalls: { id: string }[] }) {
    return { requestId: req.requestId, conversationId: req.conversationId, decisions: [] };
  }
}

function parseSse(body: string): Array<{ event: string; data: Record<string, unknown> }> {
  const result: Array<{ event: string; data: Record<string, unknown> }> = [];
  const blocks = body.split("\n\n").filter(b => b.trim());
  for (const block of blocks) {
    let event = "";
    let dataLine = "";
    for (const line of block.split("\n")) {
      if (line.startsWith("event: ")) event = line.slice(7);
      else if (line.startsWith("data: ")) dataLine = line.slice(6);
    }
    if (event && dataLine) {
      try { result.push({ event, data: JSON.parse(dataLine) }); } catch { /* ignore */ }
    }
  }
  return result;
}

function seedEvents(store: InMemoryRuntimeEventStore, tenantId: string, conversationId: string, kinds: string[]) {
  for (const kind of kinds) {
    store.append(tenantId, conversationId, {
      executionId: "exec-seed",
      conversationId,
      tenantId,
      traceId: "tr-seed",
      requestId: "req-seed",
      createdAt: Date.now(),
      kind: kind as "agent_start",
      data: { seed: true }
    });
  }
}

describe("session events SSE endpoint", () => {
  let store: InMemoryRuntimeEventStore;

  beforeEach(() => {
    store = new InMemoryRuntimeEventStore();
    process.env.HISTORY_STORE = "memory";
    process.env.HISTORY_DATA_DIR = "/tmp/openharness-test-sse";
  });

  afterEach(() => {
    delete process.env.HISTORY_STORE;
    delete process.env.HISTORY_DATA_DIR;
  });

  it("replays all events when last_event_id is omitted, then closes on stream_done", async () => {
    seedEvents(store, "t1", "conv-replay-all", ["agent_start", "model_call_start", "model_call_end", "final_answer", "agent_end", "stream_done"]);
    const app = await createServer({ javaClient: new StubJavaClient(), runtimeEventStore: store });

    const res = await app.inject({
      method: "GET",
      url: "/api/v1/sessions/conv-replay-all/events",
      headers: { "x-tenant-id": "t1" }
    });

    expect(res.statusCode).toBe(200);
    const events = parseSse(res.body);
    expect(events.map(e => e.event)).toEqual([
      "agent_start", "model_call_start", "model_call_end", "final_answer", "agent_end", "stream_done"
    ]);
  });

  it("replays only events after last_event_id", async () => {
    seedEvents(store, "t1", "conv-cursor", ["agent_start", "model_call_start", "model_call_end", "final_answer", "agent_end", "stream_done"]);
    const app = await createServer({ javaClient: new StubJavaClient(), runtimeEventStore: store });

    // last_event_id points to model_call_start (eventId :2)
    const res = await app.inject({
      method: "GET",
      url: "/api/v1/sessions/conv-cursor/events?last_event_id=t1::conv-cursor:2",
      headers: { "x-tenant-id": "t1" }
    });

    const events = parseSse(res.body);
    expect(events.map(e => e.event)).toEqual([
      "model_call_end", "final_answer", "agent_end", "stream_done"
    ]);
  });

  it("emits stream_resync_required when last_event_id is unknown and store has events", async () => {
    seedEvents(store, "t1", "conv-gap", ["agent_start", "stream_done"]);
    const app = await createServer({ javaClient: new StubJavaClient(), runtimeEventStore: store });

    const res = await app.inject({
      method: "GET",
      url: "/api/v1/sessions/conv-gap/events?last_event_id=t1::conv-gap:999",
      headers: { "x-tenant-id": "t1" }
    });

    const events = parseSse(res.body);
    expect(events.map(e => e.event)).toEqual(["stream_resync_required"]);
    expect(events[0].data.lastAvailableEventId).toBe("t1::conv-gap:2");
  });

  it("isolates events across tenants for the same conversationId", async () => {
    seedEvents(store, "tenant-A", "conv-shared", ["agent_start", "stream_done"]);
    seedEvents(store, "tenant-B", "conv-shared", ["agent_start", "model_call_start", "stream_done"]);

    const app = await createServer({ javaClient: new StubJavaClient(), runtimeEventStore: store });

    const resA = await app.inject({
      method: "GET",
      url: "/api/v1/sessions/conv-shared/events",
      headers: { "x-tenant-id": "tenant-A" }
    });
    const resB = await app.inject({
      method: "GET",
      url: "/api/v1/sessions/conv-shared/events",
      headers: { "x-tenant-id": "tenant-B" }
    });

    expect(parseSse(resA.body).map(e => e.event)).toEqual(["agent_start", "stream_done"]);
    expect(parseSse(resB.body).map(e => e.event)).toEqual(["agent_start", "model_call_start", "stream_done"]);
  });

  it("delivers live events appended after subscription", async () => {
    const app = await createServer({ javaClient: new StubJavaClient(), runtimeEventStore: store });

    // Launch the inject WITHOUT awaiting; handler will subscribe and wait for events.
    const responseP = app.inject({
      method: "GET",
      url: "/api/v1/sessions/conv-live/events",
      headers: { "x-tenant-id": "t1" }
    });

    // Yield once so handler runs and subscribes.
    await new Promise(resolve => setImmediate(resolve));

    // Append live events. Last one is stream_done so the handler closes.
    seedEvents(store, "t1", "conv-live", ["agent_start", "final_answer", "agent_end", "stream_done"]);

    const res = await responseP;
    const events = parseSse(res.body);
    expect(events.map(e => e.event)).toEqual(["agent_start", "final_answer", "agent_end", "stream_done"]);
  });

  it("each emitted event data carries the standard 7 fields", async () => {
    seedEvents(store, "t1", "conv-fields", ["agent_start", "stream_done"]);
    const app = await createServer({ javaClient: new StubJavaClient(), runtimeEventStore: store });

    const res = await app.inject({
      method: "GET",
      url: "/api/v1/sessions/conv-fields/events",
      headers: { "x-tenant-id": "t1" }
    });

    const events = parseSse(res.body);
    for (const ev of events) {
      expect(ev.data).toMatchObject({
        eventId: expect.any(String),
        executionId: expect.any(String),
        conversationId: "conv-fields",
        tenantId: "t1",
        traceId: expect.any(String),
        requestId: expect.any(String),
        createdAt: expect.any(Number)
      });
    }
  });
});
