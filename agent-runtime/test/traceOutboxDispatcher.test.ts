import { describe, expect, it } from "vitest";
import {
  TraceOutboxDispatcher,
  type TraceOutboxDispatcherSchedule
} from "../src/storage/traceOutboxDispatcher";
import type { TraceOutboxDispatchResult } from "../src/storage/traceOutbox";

describe("TraceOutboxDispatcher", () => {
  it("runs immediately, continues full batches without overlap, and waits for in-flight close", async () => {
    const scheduler = new ManualScheduler();
    const first = deferred<TraceOutboxDispatchResult>();
    const second = deferred<TraceOutboxDispatchResult>();
    const batches = [first, second];
    let calls = 0;
    let active = 0;
    let maximumActive = 0;
    const dispatcher = new TraceOutboxDispatcher({
      batchSize: 2,
      schedule: scheduler.schedule,
      hasDeadLetters: () => false,
      dispatchBatch: async () => {
        const batch = batches[calls]!;
        calls += 1;
        active += 1;
        maximumActive = Math.max(maximumActive, active);
        try {
          return await batch.promise;
        } finally {
          active -= 1;
        }
      }
    });

    await dispatcher.start();
    await dispatcher.start();
    expect(calls).toBe(1);
    expect(maximumActive).toBe(1);

    first.resolve(result({ processed: 2, delivered: 2 }));
    await flushMicrotasks();
    expect(scheduler.delays()).toEqual([0]);

    scheduler.runNext();
    expect(calls).toBe(2);
    expect(maximumActive).toBe(1);
    expect(scheduler.runNext()).toBe(false);

    let closeSettled = false;
    const closing = dispatcher.close().then(() => { closeSettled = true; });
    await flushMicrotasks();
    expect(closeSettled).toBe(false);

    second.resolve(result({ processed: 0 }));
    await closing;
    expect(closeSettled).toBe(true);
    expect(scheduler.delays()).toEqual([]);
    await expect(dispatcher.close()).resolves.toBeUndefined();
  });

  it("uses the idle interval after an error or partial batch and zero delay after a full batch", async () => {
    const scheduler = new ManualScheduler();
    const outcomes: Array<TraceOutboxDispatchResult | Error> = [
      new Error("temporary dispatcher failure"),
      result({ processed: 0 }),
      result({ processed: 3, delivered: 3 })
    ];
    const dispatcher = new TraceOutboxDispatcher({
      batchSize: 3,
      idleIntervalMs: 250,
      schedule: scheduler.schedule,
      hasDeadLetters: () => false,
      dispatchBatch: async () => {
        const outcome = outcomes.shift()!;
        if (outcome instanceof Error) throw outcome;
        return outcome;
      }
    });

    await dispatcher.start();
    await flushMicrotasks();
    expect(scheduler.delays()).toEqual([250]);

    scheduler.runNext();
    await flushMicrotasks();
    expect(scheduler.delays()).toEqual([250]);

    scheduler.runNext();
    await flushMicrotasks();
    expect(scheduler.delays()).toEqual([0]);
    await dispatcher.close();
  });

  it("degrades readiness for existing or newly exhausted dead letters but not retry", async () => {
    const existing = new TraceOutboxDispatcher({
      hasDeadLetters: () => true,
      dispatchBatch: async () => result({ processed: 0 })
    });
    await existing.start();
    expect(existing.readiness()).toEqual({
      ready: false,
      reason: "TRACE_OUTBOX_DEAD_LETTER"
    });
    await existing.close();

    const retryScheduler = new ManualScheduler();
    const retrying = new TraceOutboxDispatcher({
      schedule: retryScheduler.schedule,
      hasDeadLetters: () => false,
      dispatchBatch: async () => result({ processed: 1, retried: 1 })
    });
    await retrying.start();
    await flushMicrotasks();
    expect(retrying.readiness()).toEqual({ ready: true });
    await retrying.close();

    const deadLetterScheduler = new ManualScheduler();
    const exhausted = new TraceOutboxDispatcher({
      schedule: deadLetterScheduler.schedule,
      hasDeadLetters: () => false,
      dispatchBatch: async () => result({
        processed: 1,
        deadLettered: 1,
        readinessDegraded: true
      })
    });
    await exhausted.start();
    await flushMicrotasks();
    expect(exhausted.readiness()).toEqual({
      ready: false,
      reason: "TRACE_OUTBOX_DEAD_LETTER"
    });
    await exhausted.close();
  });
});

class ManualScheduler {
  private readonly tasks: Array<{ task: () => void; delayMs: number; cancelled: boolean }> = [];

  readonly schedule: TraceOutboxDispatcherSchedule = (task, delayMs) => {
    const scheduled = { task, delayMs, cancelled: false };
    this.tasks.push(scheduled);
    return () => { scheduled.cancelled = true; };
  };

  delays(): number[] {
    return this.tasks.filter(task => !task.cancelled).map(task => task.delayMs);
  }

  runNext(): boolean {
    const index = this.tasks.findIndex(task => !task.cancelled);
    if (index < 0) return false;
    const [scheduled] = this.tasks.splice(index, 1);
    scheduled!.task();
    return true;
  }
}

function result(overrides: Partial<TraceOutboxDispatchResult>): TraceOutboxDispatchResult {
  return {
    processed: 0,
    delivered: 0,
    retried: 0,
    deadLettered: 0,
    readinessDegraded: false,
    ...overrides
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(complete => { resolve = complete; });
  return { promise, resolve };
}

async function flushMicrotasks(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}
