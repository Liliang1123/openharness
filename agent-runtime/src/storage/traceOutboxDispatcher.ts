import type {
  TraceOutboxDispatchResult,
  TraceOutboxOptions
} from "./traceOutbox";

export type TraceOutboxDispatcherSchedule = (
  task: () => void,
  delayMs: number
) => () => void;

export interface TraceOutboxDispatcherDependencies {
  dispatchBatch(options: TraceOutboxOptions): Promise<TraceOutboxDispatchResult>;
  hasDeadLetters(): boolean | Promise<boolean>;
  now?: () => number;
  schedule?: TraceOutboxDispatcherSchedule;
  batchSize?: number;
  deliveryConcurrency?: number;
  maxAttempts?: number;
  retryDelayMs?: number;
  idleIntervalMs?: number;
}

export interface TraceOutboxReadiness {
  ready: boolean;
  reason?: "TRACE_OUTBOX_DEAD_LETTER";
}

const DEFAULT_BATCH_SIZE = 100;
const DEFAULT_DELIVERY_CONCURRENCY = 20;
const DEFAULT_MAX_ATTEMPTS = 5;
const DEFAULT_RETRY_DELAY_MS = 1_000;
const DEFAULT_IDLE_INTERVAL_MS = 250;

export class TraceOutboxDispatcher {
  private readonly now: () => number;
  private readonly schedule: TraceOutboxDispatcherSchedule;
  private readonly batchSize: number;
  private readonly deliveryConcurrency: number;
  private readonly maxAttempts: number;
  private readonly retryDelayMs: number;
  private readonly idleIntervalMs: number;
  private started = false;
  private closed = false;
  private readinessDegraded = false;
  private readinessInitialized = false;
  private inFlight?: Promise<void>;
  private cancelScheduled?: () => void;
  private closePromise?: Promise<void>;

  constructor(private readonly dependencies: TraceOutboxDispatcherDependencies) {
    this.now = dependencies.now ?? Date.now;
    this.schedule = dependencies.schedule ?? defaultSchedule;
    this.batchSize = positiveInteger(
      dependencies.batchSize ?? DEFAULT_BATCH_SIZE,
      "trace outbox dispatcher batch size"
    );
    this.deliveryConcurrency = positiveInteger(
      dependencies.deliveryConcurrency ?? DEFAULT_DELIVERY_CONCURRENCY,
      "trace outbox dispatcher delivery concurrency"
    );
    this.maxAttempts = positiveInteger(
      dependencies.maxAttempts ?? DEFAULT_MAX_ATTEMPTS,
      "trace outbox dispatcher maximum attempts"
    );
    this.retryDelayMs = positiveInteger(
      dependencies.retryDelayMs ?? DEFAULT_RETRY_DELAY_MS,
      "trace outbox dispatcher retry delay"
    );
    this.idleIntervalMs = positiveInteger(
      dependencies.idleIntervalMs ?? DEFAULT_IDLE_INTERVAL_MS,
      "trace outbox dispatcher idle interval"
    );
  }

  async start(): Promise<void> {
    if (this.started || this.closed) return;
    this.started = true;
    this.readinessDegraded = await this.dependencies.hasDeadLetters();
    this.readinessInitialized = true;
    if (this.closed) return;
    this.runNow();
  }

  readiness(): TraceOutboxReadiness {
    if (!this.readinessInitialized) return { ready: false };
    return this.readinessDegraded
      ? { ready: false, reason: "TRACE_OUTBOX_DEAD_LETTER" }
      : { ready: true };
  }

  close(): Promise<void> {
    if (this.closePromise) return this.closePromise;
    this.closed = true;
    this.cancelScheduled?.();
    this.cancelScheduled = undefined;
    const inFlight = this.inFlight;
    this.closePromise = inFlight
      ? inFlight.then(() => undefined)
      : Promise.resolve();
    return this.closePromise;
  }

  private runNow(): void {
    if (this.closed || this.inFlight) return;
    const running = this.executeOnce();
    this.inFlight = running;
    void running.finally(() => {
      if (this.inFlight === running) this.inFlight = undefined;
    });
  }

  private async executeOnce(): Promise<void> {
    let nextDelayMs = this.idleIntervalMs;
    try {
      const result = await this.dependencies.dispatchBatch({
        now: this.now(),
        limit: this.batchSize,
        concurrency: this.deliveryConcurrency,
        maxAttempts: this.maxAttempts,
        retryDelayMs: this.retryDelayMs
      });
      if (result.readinessDegraded || result.deadLettered > 0) {
        this.readinessDegraded = true;
      }
      if (result.processed >= this.batchSize) nextDelayMs = 0;
    } catch {
      nextDelayMs = this.idleIntervalMs;
    }
    if (this.closed) return;
    this.cancelScheduled = this.schedule(() => {
      this.cancelScheduled = undefined;
      this.runNow();
    }, nextDelayMs);
  }
}

const defaultSchedule: TraceOutboxDispatcherSchedule = (task, delayMs) => {
  const timer = setTimeout(task, delayMs);
  timer.unref();
  return () => clearTimeout(timer);
};

function positiveInteger(value: number, label: string): number {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error(`${label} must be a positive integer`);
  }
  return value;
}
