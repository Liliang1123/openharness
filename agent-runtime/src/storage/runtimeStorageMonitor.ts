import { statfsSync, statSync } from "node:fs";
import {
  evaluateDiskGuard,
  type DiskGuardDecision,
  type DiskSpaceSample
} from "./diskGuard";
import type { RuntimeDatabase } from "./runtimeStorage";

export type RuntimeStorageReadinessReason =
  | "RUNTIME_STORAGE_LOW"
  | "RUNTIME_STORAGE_CRITICAL"
  | "RUNTIME_WAL_CHECKPOINT_BUSY"
  | "RUNTIME_STORAGE_MONITOR_ERROR"
  | "RUNTIME_STORAGE_QUEUE_FULL"
  | "RUNTIME_STORAGE_UNAVAILABLE";

export interface RuntimeStorageReadiness {
  ready: boolean;
  reason?: RuntimeStorageReadinessReason;
}

export interface RuntimeStorageAdmission {
  allowed: boolean;
  reason?: RuntimeStorageReadinessReason;
}

export type RuntimeStorageMonitorSchedule = (
  task: () => void | Promise<void>,
  delayMs: number
) => () => void;

export interface RuntimeStorageMonitorDependencies {
  databasePath: string;
  database?: Pick<RuntimeDatabase, "get">;
  checkpoint?: () => Promise<WalCheckpointResult>;
  sampleDiskSpace?: () => DiskSpaceSample;
  walSizeBytes?: () => number;
  now?: () => number;
  schedule?: RuntimeStorageMonitorSchedule;
  warn?: (code: string) => void;
  onCritical?: () => void | Promise<void>;
}

export interface RuntimeStorageMonitorLifecycle {
  start(): Promise<void>;
  close(): Promise<void>;
  readiness(): RuntimeStorageReadiness;
  admission(): RuntimeStorageAdmission;
}

export interface RuntimeStorageMonitorFactoryDependencies {
  databasePath: string;
  checkpoint: () => Promise<WalCheckpointResult>;
  onCritical: () => void | Promise<void>;
}

export type RuntimeStorageMonitorFactory = (
  dependencies: RuntimeStorageMonitorFactoryDependencies
) => RuntimeStorageMonitorLifecycle;

export interface WalCheckpointResult {
  busy: number;
  log: number;
  checkpointed: number;
}

const MiB = 1024 ** 2;
const WAL_CHECKPOINT_THRESHOLD_BYTES = 256 * MiB;
const OBSERVATION_INTERVAL_MS = 60_000;
const CHECKPOINT_RETRY_INTERVAL_MS = 250;
const CHECKPOINT_RETRY_DEADLINE_MS = 5_000;

export class RuntimeStorageMonitor implements RuntimeStorageMonitorLifecycle {
  private readonly sampleDiskSpace: () => DiskSpaceSample;
  private readonly walSizeBytes: () => number;
  private readonly now: () => number;
  private readonly schedule: RuntimeStorageMonitorSchedule;
  private readonly warn: (code: string) => void;
  private readonly onCritical: () => void | Promise<void>;
  private readonly checkpoint: () => Promise<WalCheckpointResult>;
  private started = false;
  private closed = false;
  private criticalLatched = false;
  private checkpointRetryDeadlineAt?: number;
  private nextDelayMs = OBSERVATION_INTERVAL_MS;
  private cancelScheduled?: () => void;
  private inFlight?: Promise<void>;
  private currentReason: RuntimeStorageReadinessReason | undefined =
    "RUNTIME_STORAGE_MONITOR_ERROR";

  constructor(private readonly dependencies: RuntimeStorageMonitorDependencies) {
    this.sampleDiskSpace = dependencies.sampleDiskSpace
      ?? (() => sampleDiskSpaceFor(dependencies.databasePath));
    this.walSizeBytes = dependencies.walSizeBytes
      ?? (() => readWalSize(`${dependencies.databasePath}-wal`));
    this.now = dependencies.now ?? Date.now;
    this.schedule = dependencies.schedule ?? defaultSchedule;
    this.warn = dependencies.warn ?? defaultWarning;
    this.onCritical = dependencies.onCritical ?? (() => undefined);
    if (dependencies.checkpoint) {
      this.checkpoint = dependencies.checkpoint;
    } else if (dependencies.database) {
      this.checkpoint = async () => {
        const result = dependencies.database!.get<WalCheckpointResult>(
          "PRAGMA wal_checkpoint(TRUNCATE)"
        );
        if (!result) throw new Error("Invalid WAL checkpoint result");
        return result;
      };
    } else {
      throw new Error("Runtime storage monitor checkpoint dependency is required");
    }
  }

  async start(): Promise<void> {
    if (this.started || this.closed) return;
    this.started = true;
    await this.runCycle();
  }

  async close(): Promise<void> {
    if (this.closed) return;
    this.closed = true;
    this.cancelScheduled?.();
    this.cancelScheduled = undefined;
    await this.inFlight;
  }

  readiness(): RuntimeStorageReadiness {
    return this.currentReason
      ? { ready: false, reason: this.currentReason }
      : { ready: true };
  }

  admission(): RuntimeStorageAdmission {
    return this.currentReason
      ? { allowed: false, reason: this.currentReason }
      : { allowed: true };
  }

  async checkNow(): Promise<RuntimeStorageReadiness> {
    if (this.closed || this.criticalLatched) return this.readiness();
    this.nextDelayMs = OBSERVATION_INTERVAL_MS;

    try {
      const disk = evaluateDiskGuard(this.sampleDiskSpace());
      if (disk.state === "critical") {
        await this.enterCritical();
        return this.readiness();
      }

      const walBytes = this.walSizeBytes();
      if (!Number.isFinite(walBytes) || walBytes < 0) {
        throw new Error("Invalid Runtime WAL size");
      }
      if (walBytes >= WAL_CHECKPOINT_THRESHOLD_BYTES) {
        if (!await this.truncateWal()) return this.readiness();
      } else {
        this.checkpointRetryDeadlineAt = undefined;
      }

      this.applyDiskDecision(disk);
    } catch (error) {
      if (isSqliteBusy(error)) {
        this.handleCheckpointBusy();
      } else {
        this.checkpointRetryDeadlineAt = undefined;
        this.currentReason = "RUNTIME_STORAGE_MONITOR_ERROR";
        this.warn("RUNTIME_STORAGE_MONITOR_ERROR");
      }
    }
    return this.readiness();
  }

  private async runCycle(): Promise<void> {
    if (this.closed || this.inFlight) return;
    const running = this.runCheckCycle();
    this.inFlight = running;
    try {
      await running;
    } finally {
      if (this.inFlight === running) this.inFlight = undefined;
    }
  }

  private async runCheckCycle(): Promise<void> {
    if (this.closed) return;
    await this.checkNow();
    if (this.closed || this.criticalLatched) return;
    this.cancelScheduled = this.schedule(() => {
      this.cancelScheduled = undefined;
      return this.runCycle();
    }, this.nextDelayMs);
  }

  private async truncateWal(): Promise<boolean> {
    const checkpoint = await this.checkpoint();
    if (
      !checkpoint
      || !Number.isFinite(checkpoint.busy)
      || !Number.isFinite(checkpoint.log)
      || !Number.isFinite(checkpoint.checkpointed)
    ) {
      throw new Error("Invalid WAL checkpoint result");
    }
    if (checkpoint.busy > 0) {
      this.handleCheckpointBusy();
      return false;
    }
    this.checkpointRetryDeadlineAt = undefined;
    return true;
  }

  private handleCheckpointBusy(): void {
    const now = this.now();
    if (this.checkpointRetryDeadlineAt === undefined) {
      this.checkpointRetryDeadlineAt = now + CHECKPOINT_RETRY_DEADLINE_MS;
      this.warn("RUNTIME_WAL_CHECKPOINT_BUSY");
    }
    this.currentReason = "RUNTIME_WAL_CHECKPOINT_BUSY";
    const remainingMs = this.checkpointRetryDeadlineAt - now;
    if (remainingMs > 0) {
      this.nextDelayMs = Math.min(CHECKPOINT_RETRY_INTERVAL_MS, remainingMs);
      return;
    }
    this.warn("RUNTIME_WAL_CHECKPOINT_BUSY_DEADLINE_EXHAUSTED");
    this.checkpointRetryDeadlineAt = undefined;
    this.nextDelayMs = OBSERVATION_INTERVAL_MS;
  }

  private applyDiskDecision(decision: DiskGuardDecision): void {
    this.checkpointRetryDeadlineAt = undefined;
    if (decision.allowAdmission) {
      this.currentReason = undefined;
      return;
    }
    this.currentReason = decision.state === "critical"
      ? "RUNTIME_STORAGE_CRITICAL"
      : "RUNTIME_STORAGE_LOW";
  }

  private async enterCritical(): Promise<void> {
    this.criticalLatched = true;
    this.currentReason = "RUNTIME_STORAGE_CRITICAL";
    this.warn("RUNTIME_STORAGE_CRITICAL");
    await this.onCritical();
  }
}

function sampleDiskSpaceFor(databasePath: string): DiskSpaceSample {
  const stats = statfsSync(databasePath);
  const blockSize = Number(stats.bsize);
  return {
    freeBytes: Number(stats.bavail) * blockSize,
    totalBytes: Number(stats.blocks) * blockSize
  };
}

function readWalSize(walPath: string): number {
  try {
    return statSync(walPath).size;
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") return 0;
    throw error;
  }
}

function isSqliteBusy(error: unknown): boolean {
  return error instanceof Error
    && "code" in error
    && error.code === "SQLITE_BUSY";
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error;
}

const defaultSchedule: RuntimeStorageMonitorSchedule = (task, delayMs) => {
  const timer = setTimeout(() => void task(), delayMs);
  timer.unref();
  return () => clearTimeout(timer);
};

function defaultWarning(code: string): void {
  console.warn(`[agent-runtime-storage] ${code}`);
}
