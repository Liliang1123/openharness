import { describe, expect, it } from "vitest";
import {
  RuntimeStorageMonitor,
  type RuntimeStorageMonitorSchedule
} from "../src/storage/runtimeStorageMonitor";
import type { RuntimeDatabase } from "../src/storage/runtimeStorage";

const GiB = 1024 ** 3;
const MiB = 1024 ** 2;

describe("runtime storage monitor", () => {
  it("samples immediately, allows healthy admission, and schedules the next 60 second check", async () => {
    const scheduled = scheduler();
    const checkpointSql: string[] = [];
    const monitor = new RuntimeStorageMonitor({
      databasePath: "/runtime/runtime.sqlite",
      database: checkpointDatabase(checkpointSql, []),
      sampleDiskSpace: () => ({ freeBytes: 20 * GiB, totalBytes: 100 * GiB }),
      walSizeBytes: () => 0,
      schedule: scheduled.schedule
    });

    await monitor.start();

    expect(monitor.readiness()).toEqual({ ready: true });
    expect(monitor.admission()).toEqual({ allowed: true });
    expect(checkpointSql).toEqual([]);
    expect(scheduled.pending()).toEqual([60_000]);
  });

  it("truncates a 256 MiB WAL, blocks on BUSY, and recovers on a bounded retry", async () => {
    let now = 0;
    const scheduled = scheduler();
    const checkpointSql: string[] = [];
    const warnings: string[] = [];
    const monitor = new RuntimeStorageMonitor({
      databasePath: "/runtime/runtime.sqlite",
      database: checkpointDatabase(checkpointSql, [
        { busy: 1, log: 65_536, checkpointed: 32_768 },
        { busy: 0, log: 0, checkpointed: 0 }
      ]),
      sampleDiskSpace: () => ({ freeBytes: 20 * GiB, totalBytes: 100 * GiB }),
      walSizeBytes: () => 256 * MiB,
      now: () => now,
      schedule: scheduled.schedule,
      warn: code => warnings.push(code)
    });

    await monitor.start();

    expect(checkpointSql).toEqual(["PRAGMA wal_checkpoint(TRUNCATE)"]);
    expect(monitor.readiness()).toEqual({
      ready: false,
      reason: "RUNTIME_WAL_CHECKPOINT_BUSY"
    });
    expect(monitor.admission()).toEqual({
      allowed: false,
      reason: "RUNTIME_WAL_CHECKPOINT_BUSY"
    });
    expect(warnings).toEqual(["RUNTIME_WAL_CHECKPOINT_BUSY"]);
    expect(scheduled.pending()).toEqual([250]);

    now = 250;
    await scheduled.runNext();

    expect(checkpointSql).toEqual([
      "PRAGMA wal_checkpoint(TRUNCATE)",
      "PRAGMA wal_checkpoint(TRUNCATE)"
    ]);
    expect(monitor.readiness()).toEqual({ ready: true });
    expect(monitor.admission()).toEqual({ allowed: true });
    expect(scheduled.pending()).toEqual([60_000]);
  });

  it("exhausts one five second BUSY episode without reopening admission", async () => {
    let now = 0;
    const scheduled = scheduler();
    const monitor = new RuntimeStorageMonitor({
      databasePath: "/runtime/runtime.sqlite",
      database: checkpointDatabase([], [
        { busy: 1, log: 65_536, checkpointed: 0 },
        { busy: 1, log: 65_536, checkpointed: 0 }
      ]),
      sampleDiskSpace: () => ({ freeBytes: 20 * GiB, totalBytes: 100 * GiB }),
      walSizeBytes: () => 256 * MiB,
      now: () => now,
      schedule: scheduled.schedule,
      warn: () => undefined
    });

    await monitor.start();
    now = 5_000;
    await scheduled.runNext();

    expect(monitor.admission()).toEqual({
      allowed: false,
      reason: "RUNTIME_WAL_CHECKPOINT_BUSY"
    });
    expect(scheduled.pending()).toEqual([60_000]);
  });

  it("blocks low disk and latches one critical drain callback", async () => {
    let sample = { freeBytes: 5 * GiB, totalBytes: 100 * GiB };
    const scheduled = scheduler();
    let criticalDrains = 0;
    const monitor = new RuntimeStorageMonitor({
      databasePath: "/runtime/runtime.sqlite",
      database: checkpointDatabase([], []),
      sampleDiskSpace: () => sample,
      walSizeBytes: () => 0,
      schedule: scheduled.schedule,
      warn: () => undefined,
      onCritical: () => { criticalDrains += 1; }
    });

    await monitor.start();

    expect(monitor.readiness()).toEqual({
      ready: false,
      reason: "RUNTIME_STORAGE_LOW"
    });
    expect(monitor.admission()).toEqual({
      allowed: false,
      reason: "RUNTIME_STORAGE_LOW"
    });

    sample = { freeBytes: 400 * MiB, totalBytes: 100 * GiB };
    await scheduled.runNext();
    await monitor.checkNow();

    expect(monitor.readiness()).toEqual({
      ready: false,
      reason: "RUNTIME_STORAGE_CRITICAL"
    });
    expect(monitor.admission()).toEqual({
      allowed: false,
      reason: "RUNTIME_STORAGE_CRITICAL"
    });
    expect(criticalDrains).toBe(1);
    expect(scheduled.pending()).toEqual([]);
  });

  it("fails closed on an observation error and recovers on the next interval", async () => {
    let fail = true;
    const scheduled = scheduler();
    const warnings: string[] = [];
    const monitor = new RuntimeStorageMonitor({
      databasePath: "/runtime/runtime.sqlite",
      database: checkpointDatabase([], []),
      sampleDiskSpace: () => {
        if (fail) throw new Error("statfs unavailable");
        return { freeBytes: 20 * GiB, totalBytes: 100 * GiB };
      },
      walSizeBytes: () => 0,
      schedule: scheduled.schedule,
      warn: code => warnings.push(code)
    });

    await monitor.start();

    expect(monitor.readiness()).toEqual({
      ready: false,
      reason: "RUNTIME_STORAGE_MONITOR_ERROR"
    });
    expect(monitor.admission()).toEqual({
      allowed: false,
      reason: "RUNTIME_STORAGE_MONITOR_ERROR"
    });
    expect(warnings).toEqual(["RUNTIME_STORAGE_MONITOR_ERROR"]);
    expect(scheduled.pending()).toEqual([60_000]);

    fail = false;
    await scheduled.runNext();

    expect(monitor.readiness()).toEqual({ ready: true });
    expect(monitor.admission()).toEqual({ allowed: true });
  });

  it("cancels the scheduled observation on close", async () => {
    let samples = 0;
    const scheduled = scheduler();
    const monitor = new RuntimeStorageMonitor({
      databasePath: "/runtime/runtime.sqlite",
      database: checkpointDatabase([], []),
      sampleDiskSpace: () => {
        samples += 1;
        return { freeBytes: 20 * GiB, totalBytes: 100 * GiB };
      },
      walSizeBytes: () => 0,
      schedule: scheduled.schedule
    });

    await monitor.start();
    await monitor.close();
    await scheduled.runCancelled();

    expect(samples).toBe(1);
    expect(scheduled.pending()).toEqual([]);
  });
});

function checkpointDatabase(
  sql: string[],
  results: Array<{ busy: number; log: number; checkpointed: number }>
): Pick<RuntimeDatabase, "get"> {
  return {
    get<T>(statement: string): T | undefined {
      sql.push(statement);
      return results.shift() as T | undefined;
    }
  };
}

function scheduler(): {
  schedule: RuntimeStorageMonitorSchedule;
  pending(): number[];
  runNext(): Promise<void>;
  runCancelled(): Promise<void>;
} {
  const tasks: Array<{ task: () => void | Promise<void>; delayMs: number; cancelled: boolean }> = [];
  return {
    schedule(task, delayMs) {
      const scheduled = { task, delayMs, cancelled: false };
      tasks.push(scheduled);
      return () => { scheduled.cancelled = true; };
    },
    pending() {
      return tasks.filter(task => !task.cancelled).map(task => task.delayMs);
    },
    async runNext() {
      const next = tasks.find(task => !task.cancelled);
      if (!next) throw new Error("No scheduled task");
      next.cancelled = true;
      await next.task();
    },
    async runCancelled() {
      const cancelled = tasks.find(task => task.cancelled);
      if (!cancelled) throw new Error("No cancelled task");
      await cancelled.task();
    }
  };
}
