import { describe, expect, it } from "vitest";
import {
  RuntimeStorageCommandScheduler
} from "../src/storage/runtimeStorageCommandScheduler";

interface Command {
  requestId: string;
}

function command(requestId: string): Command {
  return { requestId };
}

function take(
  scheduler: RuntimeStorageCommandScheduler<Command>
): Command {
  const scheduled = scheduler.take();
  expect(scheduled).toBeDefined();
  scheduler.complete(scheduled!.value.requestId);
  return scheduled!.value;
}

describe("RuntimeStorageCommandScheduler", () => {
  it("preserves FIFO within a priority lane", () => {
    const scheduler = new RuntimeStorageCommandScheduler<Command>();
    scheduler.enqueue("p1", command("first"));
    scheduler.enqueue("p1", command("second"));

    expect(take(scheduler).requestId).toBe("first");
    expect(take(scheduler).requestId).toBe("second");
  });

  it("selects one waiting P2 after at most 32 consecutive P1 commands", () => {
    const scheduler = new RuntimeStorageCommandScheduler<Command>();
    for (let index = 0; index < 33; index += 1) {
      scheduler.enqueue("p1", command(`p1-${index + 1}`));
    }
    scheduler.enqueue("p2", command("p2-1"));

    const selected = Array.from({ length: 33 }, () => take(scheduler).requestId);

    expect(selected.slice(0, 32)).toEqual(
      Array.from({ length: 32 }, (_, index) => `p1-${index + 1}`)
    );
    expect(selected[32]).toBe("p2-1");
  });

  it("allows P0 only as an exclusive command", () => {
    const scheduler = new RuntimeStorageCommandScheduler<Command>();
    scheduler.enqueue("p0", command("bootstrap"));

    expect(() => scheduler.enqueue("p1", command("admission"))).toThrow(
      "RUNTIME_STORAGE_EXCLUSIVE"
    );
    const scheduled = scheduler.take();
    expect(scheduled?.value.requestId).toBe("bootstrap");
    expect(scheduler.take()).toBeUndefined();
    scheduler.complete("bootstrap");

    scheduler.enqueue("p1", command("admission"));
    expect(take(scheduler).requestId).toBe("admission");
  });

  it("allows only one in-flight command", () => {
    const scheduler = new RuntimeStorageCommandScheduler<Command>();
    scheduler.enqueue("p1", command("first"));
    scheduler.enqueue("p1", command("second"));

    expect(scheduler.take()?.value.requestId).toBe("first");
    expect(scheduler.take()).toBeUndefined();
    scheduler.complete("first");
    expect(scheduler.take()?.value.requestId).toBe("second");
  });

  it("fails closed at the 2,048 pending-command bound", () => {
    const scheduler = new RuntimeStorageCommandScheduler<Command>();
    for (let index = 0; index < 2_048; index += 1) {
      scheduler.enqueue("p1", command(`request-${index}`));
    }

    expect(() => scheduler.enqueue("p1", command("overflow"))).toThrow(
      "RUNTIME_STORAGE_QUEUE_FULL"
    );
  });

  it("closes by returning queued work and rejecting new work", () => {
    const scheduler = new RuntimeStorageCommandScheduler<Command>();
    scheduler.enqueue("p1", command("first"));
    scheduler.enqueue("p2", command("second"));

    expect(scheduler.close().map(item => item.value.requestId)).toEqual([
      "first",
      "second"
    ]);
    expect(() => scheduler.enqueue("p1", command("late"))).toThrow(
      "RUNTIME_STORAGE_CLOSED"
    );
  });
});
