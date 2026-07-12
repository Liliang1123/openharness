import { describe, expect, it } from "vitest";
import { InMemoryRuntimeEventStore } from "../src/runtimeEventStore";
import type { SessionEvent } from "../src/types";

function makeEvent(partial: Partial<SessionEvent> = {}): Omit<SessionEvent, "eventId" | "durability"> {
  return {
    executionId: partial.executionId ?? "exec-1",
    conversationId: partial.conversationId ?? "conv-1",
    tenantId: partial.tenantId ?? "t1",
    userId: partial.userId ?? "u1",
    traceId: partial.traceId ?? "tr-1",
    requestId: partial.requestId ?? "req-1",
    createdAt: partial.createdAt ?? Date.now(),
    kind: partial.kind ?? "agent_start",
    data: partial.data ?? {}
  };
}

describe("InMemoryRuntimeEventStore", () => {
  it("append assigns monotonically increasing eventId per (tenant, user, conversation)", () => {
    const store = new InMemoryRuntimeEventStore();
    const e1 = store.append("t1", "u1", "conv-1", makeEvent());
    const e2 = store.append("t1", "u1", "conv-1", makeEvent({ kind: "agent_end" }));
    expect(e1.eventId).toBe("t1::u1::conv-1:1");
    expect(e2.eventId).toBe("t1::u1::conv-1:2");
  });

  it("eventId format is tenantId::conversationId:seq", () => {
    const store = new InMemoryRuntimeEventStore();
    const e = store.append("tenant-A", "user-A", "conv-XYZ", makeEvent({ tenantId: "tenant-A", userId: "user-A", conversationId: "conv-XYZ" }));
    expect(e.eventId).toBe("tenant-A::user-A::conv-XYZ:1");
  });

  it("since(null) returns all events for the conversation", () => {
    const store = new InMemoryRuntimeEventStore();
    store.append("t1", "u1", "conv-1", makeEvent());
    store.append("t1", "u1", "conv-1", makeEvent({ kind: "agent_end" }));
    const events = store.since("t1", "u1", "conv-1", null);
    expect(events.length).toBe(2);
    expect(events[0].eventId).toBe("t1::u1::conv-1:1");
  });

  it("since(eventId) returns events strictly after the cursor", () => {
    const store = new InMemoryRuntimeEventStore();
    const e1 = store.append("t1", "u1", "conv-1", makeEvent());
    const e2 = store.append("t1", "u1", "conv-1", makeEvent({ kind: "model_call_start" }));
    const e3 = store.append("t1", "u1", "conv-1", makeEvent({ kind: "agent_end" }));
    const events = store.since("t1", "u1", "conv-1", e1.eventId);
    expect(events.map(e => e.eventId)).toEqual([e2.eventId, e3.eventId]);
  });

  it("since(unknownEventId) returns empty array (gap should be detected via hasEvent)", () => {
    const store = new InMemoryRuntimeEventStore();
    store.append("t1", "u1", "conv-1", makeEvent());
    const events = store.since("t1", "u1", "conv-1", "t1::u1::conv-1:999");
    expect(events).toEqual([]);
  });

  it("hasEvent distinguishes valid empty from gap", () => {
    const store = new InMemoryRuntimeEventStore();
    const e1 = store.append("t1", "u1", "conv-1", makeEvent());
    expect(store.hasEvent("t1", "u1", "conv-1", e1.eventId)).toBe(true);
    expect(store.hasEvent("t1", "u1", "conv-1", "t1::u1::conv-1:999")).toBe(false);
    expect(store.hasEvent("t1", "u1", "conv-other", e1.eventId)).toBe(false);
  });

  it("latestEventId returns null when empty and updates on append", () => {
    const store = new InMemoryRuntimeEventStore();
    expect(store.latestEventId("t1", "u1", "conv-1")).toBeNull();
    const e1 = store.append("t1", "u1", "conv-1", makeEvent());
    expect(store.latestEventId("t1", "u1", "conv-1")).toBe(e1.eventId);
  });

  it("subscribe receives appended events", () => {
    const store = new InMemoryRuntimeEventStore();
    const received: string[] = [];
    const unsubscribe = store.subscribe("t1", "u1", "conv-1", e => received.push(e.eventId));
    store.append("t1", "u1", "conv-1", makeEvent());
    store.append("t1", "u1", "conv-1", makeEvent({ kind: "agent_end" }));
    expect(received).toEqual(["t1::u1::conv-1:1", "t1::u1::conv-1:2"]);
    unsubscribe();
  });

  it("unsubscribe stops further notifications", () => {
    const store = new InMemoryRuntimeEventStore();
    const received: string[] = [];
    const unsubscribe = store.subscribe("t1", "u1", "conv-1", e => received.push(e.eventId));
    store.append("t1", "u1", "conv-1", makeEvent());
    unsubscribe();
    store.append("t1", "u1", "conv-1", makeEvent({ kind: "agent_end" }));
    expect(received).toEqual(["t1::u1::conv-1:1"]);
  });

  it("multiple subscribers all receive live events", () => {
    const store = new InMemoryRuntimeEventStore();
    const a: string[] = [];
    const b: string[] = [];
    store.subscribe("t1", "u1", "conv-1", e => a.push(e.eventId));
    store.subscribe("t1", "u1", "conv-1", e => b.push(e.eventId));
    store.append("t1", "u1", "conv-1", makeEvent());
    expect(a).toEqual(["t1::u1::conv-1:1"]);
    expect(b).toEqual(["t1::u1::conv-1:1"]);
  });

  it("subscriber for one conversation does not receive events for another", () => {
    const store = new InMemoryRuntimeEventStore();
    const received: string[] = [];
    store.subscribe("t1", "u1", "conv-A", e => received.push(e.eventId));
    store.append("t1", "u1", "conv-B", makeEvent({ conversationId: "conv-B" }));
    expect(received).toEqual([]);
  });

  it("isolates events across tenants for the same conversationId", () => {
    const store = new InMemoryRuntimeEventStore();
    store.append("tenant-A", "u1", "conv-1", makeEvent({ tenantId: "tenant-A" }));
    store.append("tenant-B", "u1", "conv-1", makeEvent({ tenantId: "tenant-B" }));
    expect(store.latestEventId("tenant-A", "u1", "conv-1")).toBe("tenant-A::u1::conv-1:1");
    expect(store.latestEventId("tenant-B", "u1", "conv-1")).toBe("tenant-B::u1::conv-1:1");
    expect(store.since("tenant-A", "u1", "conv-1", null).length).toBe(1);
    expect(store.since("tenant-B", "u1", "conv-1", null).length).toBe(1);
  });

  it("isolates same-tenant same-conversation events by user", () => {
    const store = new InMemoryRuntimeEventStore();
    store.append("t1", "user-a", "conv-1", makeEvent({ userId: "user-a" }));
    store.append("t1", "user-b", "conv-1", makeEvent({ userId: "user-b" }));

    expect(store.since("t1", "user-a", "conv-1", null).map(event => event.userId)).toEqual(["user-a"]);
    expect(store.since("t1", "user-b", "conv-1", null).map(event => event.userId)).toEqual(["user-b"]);
  });

  it("subscribe + since invoked synchronously together has no gap (replay+live ordering)", () => {
    const store = new InMemoryRuntimeEventStore();
    const e1 = store.append("t1", "u1", "conv-1", makeEvent());

    // Simulate the HTTP handler: call since first, then subscribe synchronously
    const replayed = store.since("t1", "u1", "conv-1", null);
    const live: string[] = [];
    store.subscribe("t1", "u1", "conv-1", e => live.push(e.eventId));

    // Append after subscribe
    const e2 = store.append("t1", "u1", "conv-1", makeEvent({ kind: "agent_end" }));

    expect(replayed.map(e => e.eventId)).toEqual([e1.eventId]);
    expect(live).toEqual([e2.eventId]); // no duplicate of e1
  });
});
