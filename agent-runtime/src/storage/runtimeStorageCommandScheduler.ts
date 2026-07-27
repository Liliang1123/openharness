import type { StoragePriority } from "./runtimeStorageWorkerProtocol";

export interface ScheduledStorageCommand<T> {
  priority: StoragePriority;
  value: T;
}

export interface RuntimeStorageCommandSchedulerOptions {
  maximumPending?: number;
  maximumConsecutiveP1?: number;
}

const DEFAULT_MAXIMUM_PENDING = 2_048;
const DEFAULT_MAXIMUM_CONSECUTIVE_P1 = 32;

export class RuntimeStorageCommandScheduler<T extends { requestId: string }> {
  private readonly maximumPending: number;
  private readonly maximumConsecutiveP1: number;
  private readonly p0: Array<ScheduledStorageCommand<T>> = [];
  private readonly p1: Array<ScheduledStorageCommand<T>> = [];
  private readonly p2: Array<ScheduledStorageCommand<T>> = [];
  private current?: ScheduledStorageCommand<T>;
  private consecutiveP1 = 0;
  private exclusive = false;
  private closed = false;

  constructor(options: RuntimeStorageCommandSchedulerOptions = {}) {
    this.maximumPending = positiveInteger(
      options.maximumPending ?? DEFAULT_MAXIMUM_PENDING,
      "maximum pending storage commands"
    );
    this.maximumConsecutiveP1 = positiveInteger(
      options.maximumConsecutiveP1 ?? DEFAULT_MAXIMUM_CONSECUTIVE_P1,
      "maximum consecutive P1 commands"
    );
  }

  get pendingCount(): number {
    return this.p0.length + this.p1.length + this.p2.length;
  }

  enqueue(priority: StoragePriority, value: T): void {
    if (this.closed) throw new Error("RUNTIME_STORAGE_CLOSED");
    if (this.exclusive && priority !== "p0") {
      throw new Error("RUNTIME_STORAGE_EXCLUSIVE");
    }
    if (this.pendingCount >= this.maximumPending) {
      throw new Error("RUNTIME_STORAGE_QUEUE_FULL");
    }
    const scheduled = { priority, value };
    if (priority === "p0") {
      if (this.exclusive || this.p0.length > 0) {
        throw new Error("RUNTIME_STORAGE_EXCLUSIVE");
      }
      this.exclusive = true;
      this.p0.push(scheduled);
    } else if (priority === "p1") {
      this.p1.push(scheduled);
    } else {
      this.p2.push(scheduled);
    }
  }

  take(): ScheduledStorageCommand<T> | undefined {
    if (this.closed || this.current) return undefined;
    const selected = this.selectNext();
    if (!selected) return undefined;
    this.current = selected;
    return selected;
  }

  complete(requestId: string): void {
    if (!this.current || this.current.value.requestId !== requestId) {
      throw new Error("RUNTIME_STORAGE_COMPLETION_MISMATCH");
    }
    const completed = this.current;
    this.current = undefined;
    if (completed.priority === "p0") {
      this.exclusive = this.p0.length > 0;
    }
  }

  close(): Array<ScheduledStorageCommand<T>> {
    if (this.closed) return [];
    this.closed = true;
    const queued = [...this.p0, ...this.p1, ...this.p2];
    this.p0.length = 0;
    this.p1.length = 0;
    this.p2.length = 0;
    return queued;
  }

  private selectNext(): ScheduledStorageCommand<T> | undefined {
    const exclusive = this.p0.shift();
    if (exclusive) return exclusive;

    if (
      this.p2.length > 0
      && (
        this.p1.length === 0
        || this.consecutiveP1 >= this.maximumConsecutiveP1
      )
    ) {
      this.consecutiveP1 = 0;
      return this.p2.shift();
    }

    const foreground = this.p1.shift();
    if (foreground) {
      this.consecutiveP1 += 1;
      return foreground;
    }

    const background = this.p2.shift();
    if (background) this.consecutiveP1 = 0;
    return background;
  }
}

function positiveInteger(value: number, label: string): number {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error(`${label} must be a positive integer`);
  }
  return value;
}
