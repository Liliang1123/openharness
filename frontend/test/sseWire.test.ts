import { describe, expect, it } from "vitest";
import { appendSSEWireEvent, parseSSEWireEvent } from "../src/api";

const durablePayload = {
  durability: "durable",
  eventId: "tenant-1::user-1::conv-1:1",
  executionId: "exec-1",
  conversationId: "conv-1",
  tenantId: "tenant-1",
  userId: "user-1",
  traceId: "trace-1",
  requestId: "req-1",
  createdAt: 1,
  data: { answer: "done" }
};

describe("SSE wire parsing", () => {
  it("parses a durable event using the SSE event name as kind", () => {
    const parsed = parseSSEWireEvent("final_answer", durablePayload);

    expect(parsed).toMatchObject({
      durability: "durable",
      kind: "final_answer",
      eventId: durablePayload.eventId
    });
  });

  it("parses transient preview without durable eventId", () => {
    const parsed = parseSSEWireEvent("preview_delta", {
      durability: "transient",
      previewSeq: 1,
      executionId: "exec-1",
      conversationId: "conv-1",
      tenantId: "tenant-1",
      userId: "user-1",
      traceId: "trace-1",
      requestId: "req-1",
      createdAt: 1,
      data: { delta: "hel" }
    });

    expect(parsed).toMatchObject({ durability: "transient", kind: "preview_delta", previewSeq: 1 });
    expect("eventId" in parsed).toBe(false);
  });

  it("rejects preview carrying a durable cursor", () => {
    expect(() => parseSSEWireEvent("preview_delta", {
      ...durablePayload,
      durability: "transient",
      previewSeq: 1,
      data: { delta: "hel" }
    })).toThrow();
  });

  it("deduplicates durable reconnect delivery by eventId", () => {
    const event = parseSSEWireEvent("final_answer", durablePayload);
    const first = appendSSEWireEvent([], event);
    const repeated = appendSSEWireEvent(first, event);

    expect(first).toHaveLength(1);
    expect(repeated).toBe(first);
  });
});
