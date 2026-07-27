import { randomUUID } from "node:crypto";
import { existsSync, statSync } from "node:fs";
import { Worker, type WorkerOptions } from "node:worker_threads";
import { RuntimeStorageCommandScheduler } from "./runtimeStorageCommandScheduler";
import {
  isStorageWorkerResult,
  parseStorageWorkerResponse,
  type StorageOperation,
  type StoragePayloadMap,
  type StoragePriority,
  type StorageResultMap,
  type StorageWorkerRequest
} from "./runtimeStorageWorkerProtocol";
import type { RuntimeDatabaseIdentity } from "./runtimeStorage";
import { acquireRuntimeSingletonLock, type RuntimeSingletonLock } from "./singletonLock";

export interface RuntimeStorageWorkerLike {
  postMessage(value: unknown): void;
  on(event: "message", listener: (value: unknown) => void): this;
  on(event: "error", listener: (error: Error) => void): this;
  on(event: "exit", listener: (code: number) => void): this;
  terminate(): Promise<number> | number;
}

export interface RuntimeStorageWorkerClient {
  readonly databasePath: string;
  readonly bootstrapResult: StorageResultMap["bootstrap"];
  execute<O extends StorageOperation>(
    priority: StoragePriority,
    operation: O,
    payload: StoragePayloadMap[O]
  ): Promise<StorageResultMap[O]>;
  readiness(): {
    ready: boolean;
    reason?: "RUNTIME_STORAGE_QUEUE_FULL" | "RUNTIME_STORAGE_UNAVAILABLE";
  };
  close(): Promise<void>;
}

export interface RuntimeStorageWorkerClientOptions {
  workerFactory?: (entrypoint: URL) => RuntimeStorageWorkerLike;
  maximumPending?: number;
  expectedDatabaseIdentity?: RuntimeDatabaseIdentity;
  onUnavailable?: (errorCode: "RUNTIME_STORAGE_UNAVAILABLE") => void | Promise<void>;
}

export function createRuntimeStorageTypeScriptWorker(
  entrypoint: URL,
  options: Pick<WorkerOptions, "workerData"> = {}
): RuntimeStorageWorkerLike {
  const source = [
    'import("tsx/esm/api").then(async ({ register }) => {',
    "  register();",
    `  await import(${JSON.stringify(entrypoint.href)});`,
    "});"
  ].join("\n");
  return new Worker(source, {
    eval: true,
    ...options
  });
}

interface PendingStorageCommand {
  requestId: string;
  request: StorageWorkerRequest;
  resolve(value: unknown): void;
  reject(error: Error): void;
}

type ClientState = "initializing" | "ready" | "closing" | "unavailable" | "closed";

export async function createRuntimeStorageWorkerClient(
  databasePath: string,
  options: RuntimeStorageWorkerClientOptions = {}
): Promise<RuntimeStorageWorkerClient> {
  const singletonLock = acquireRuntimeSingletonLock(`${databasePath}.lock`);
  let worker: RuntimeStorageWorkerLike;
  try {
    worker = (options.workerFactory ?? defaultWorkerFactory)(
      new URL("./runtimeStorageWorker.ts", import.meta.url)
    );
  } catch (error) {
    singletonLock.release();
    throw error;
  }

  const client = new RuntimeStorageWorkerClientImplementation(
    databasePath,
    singletonLock,
    worker,
    options.maximumPending,
    options.expectedDatabaseIdentity,
    options.onUnavailable
  );
  try {
    await client.bootstrap();
    return client;
  } catch (error) {
    await client.closeAfterBootstrapFailure();
    throw error;
  }
}

class RuntimeStorageWorkerClientImplementation implements RuntimeStorageWorkerClient {
  private readonly scheduler: RuntimeStorageCommandScheduler<PendingStorageCommand>;
  private state: ClientState = "initializing";
  private current?: PendingStorageCommand;
  private queueFull = false;
  private closePosted = false;
  private closeAcknowledged = false;
  private released = false;
  private unavailableNotified = false;
  private closePromise?: Promise<void>;
  private resolveClose?: () => void;
  private rejectClose?: (error: Error) => void;
  private shutdownPromise: Promise<unknown> = Promise.resolve();
  private bootstrapped?: StorageResultMap["bootstrap"];

  constructor(
    readonly databasePath: string,
    private readonly singletonLock: RuntimeSingletonLock,
    private readonly worker: RuntimeStorageWorkerLike,
    maximumPending?: number,
    private readonly expectedDatabaseIdentity?: RuntimeDatabaseIdentity,
    private readonly onUnavailable?: RuntimeStorageWorkerClientOptions["onUnavailable"]
  ) {
    this.scheduler = new RuntimeStorageCommandScheduler({ maximumPending });
    worker.on("message", value => this.onMessage(value));
    worker.on("error", () => this.transitionUnavailable(false));
    worker.on("exit", code => this.onExit(code));
  }

  async bootstrap(): Promise<void> {
    const identity = this.expectedDatabaseIdentity ?? (existsSync(this.databasePath)
      ? databaseIdentity(this.databasePath)
      : undefined);
    this.bootstrapped = await this.submit("p0", "bootstrap", {
      databasePath: this.databasePath,
      ...(identity ? { expectedDatabaseIdentity: identity } : {})
    });
    if (this.state !== "initializing") {
      throw new Error("RUNTIME_STORAGE_UNAVAILABLE");
    }
    this.state = "ready";
  }

  get bootstrapResult(): StorageResultMap["bootstrap"] {
    if (!this.bootstrapped) throw new Error("RUNTIME_STORAGE_NOT_BOOTSTRAPPED");
    return this.bootstrapped;
  }

  execute<O extends StorageOperation>(
    priority: StoragePriority,
    operation: O,
    payload: StoragePayloadMap[O]
  ): Promise<StorageResultMap[O]> {
    if (this.state === "unavailable") {
      return Promise.reject(new Error("RUNTIME_STORAGE_UNAVAILABLE"));
    }
    if (this.state !== "ready") {
      return Promise.reject(new Error("RUNTIME_STORAGE_CLOSED"));
    }
    return this.submit(priority, operation, payload);
  }

  readiness(): {
    ready: boolean;
    reason?: "RUNTIME_STORAGE_QUEUE_FULL" | "RUNTIME_STORAGE_UNAVAILABLE";
  } {
    if (this.state === "unavailable") {
      return { ready: false, reason: "RUNTIME_STORAGE_UNAVAILABLE" };
    }
    if (this.state !== "ready") return { ready: false };
    if (this.queueFull) {
      return { ready: false, reason: "RUNTIME_STORAGE_QUEUE_FULL" };
    }
    return { ready: true };
  }

  close(): Promise<void> {
    if (this.state === "closed") return Promise.resolve();
    if (this.state === "unavailable") {
      return this.shutdownPromise.then(() => {
        this.state = "closed";
        this.releaseLock();
      });
    }
    if (this.closePromise) return this.closePromise;
    this.closePromise = new Promise<void>((resolve, reject) => {
      this.resolveClose = resolve;
      this.rejectClose = reject;
    });
    this.state = "closing";
    this.maybeBeginClose();
    return this.closePromise;
  }

  async closeAfterBootstrapFailure(): Promise<void> {
    if (this.state !== "unavailable") this.transitionUnavailable(false);
    await this.shutdownPromise;
    this.releaseLock();
  }

  private submit<O extends StorageOperation>(
    priority: StoragePriority,
    operation: O,
    payload: StoragePayloadMap[O]
  ): Promise<StorageResultMap[O]> {
    const requestId = randomUUID();
    const request = {
      requestId,
      priority,
      operation,
      payload
    } as StorageWorkerRequest<O>;
    return new Promise<StorageResultMap[O]>((resolve, reject) => {
      const command: PendingStorageCommand = {
        requestId,
        request: request as StorageWorkerRequest,
        resolve: value => resolve(value as StorageResultMap[O]),
        reject
      };
      try {
        this.scheduler.enqueue(priority, command);
        this.queueFull = false;
      } catch (error) {
        if (error instanceof Error && error.message === "RUNTIME_STORAGE_QUEUE_FULL") {
          this.queueFull = true;
        }
        reject(error instanceof Error ? error : new Error("RUNTIME_STORAGE_UNAVAILABLE"));
        return;
      }
      this.pump();
    });
  }

  private pump(): void {
    if (this.current || this.state === "unavailable" || this.state === "closed") return;
    const scheduled = this.scheduler.take();
    if (!scheduled) {
      this.maybeBeginClose();
      return;
    }
    this.current = scheduled.value;
    try {
      this.worker.postMessage(scheduled.value.request);
    } catch {
      this.transitionUnavailable(false);
    }
  }

  private onMessage(raw: unknown): void {
    let response;
    try {
      response = parseStorageWorkerResponse(raw);
    } catch {
      this.transitionUnavailable(false);
      return;
    }
    const command = this.current;
    if (!command || command.requestId !== response.requestId) {
      this.transitionUnavailable(false);
      return;
    }
    if (
      response.ok
      && !isStorageWorkerResult(command.request.operation, response.result)
    ) {
      this.transitionUnavailable(false);
      return;
    }

    try {
      this.scheduler.complete(command.requestId);
    } catch {
      this.transitionUnavailable(false);
      return;
    }
    this.current = undefined;
    this.queueFull = false;

    if (!response.ok) {
      const error = new Error(response.error.code);
      command.reject(error);
      if (
        command.request.operation === "bootstrap"
        || command.request.operation === "storage.close"
      ) {
        this.transitionUnavailable(false);
        return;
      }
      this.pump();
      return;
    }

    command.resolve(response.result);
    if (command.request.operation === "storage.close") {
      this.closeAcknowledged = true;
      this.scheduler.close();
      return;
    }
    this.pump();
  }

  private maybeBeginClose(): void {
    if (
      this.state !== "closing"
      || this.closePosted
      || this.current
      || this.scheduler.pendingCount > 0
    ) {
      return;
    }
    this.closePosted = true;
    void this.submit("p0", "storage.close", {}).catch(() => {
      this.transitionUnavailable(false);
    });
  }

  private onExit(code: number): void {
    if (this.state === "closed") return;
    if (this.state === "closing" && this.closeAcknowledged && code === 0) {
      this.state = "closed";
      this.releaseLock();
      this.resolveClose?.();
      return;
    }
    this.transitionUnavailable(true);
  }

  private transitionUnavailable(workerAlreadyExited: boolean): void {
    if (this.state === "unavailable" || this.state === "closed") return;
    this.state = "unavailable";
    const error = new Error("RUNTIME_STORAGE_UNAVAILABLE");
    if (this.current) {
      try {
        this.scheduler.complete(this.current.requestId);
      } catch {
        // The protocol boundary is already failed; all commands are rejected below.
      }
      this.current.reject(error);
      this.current = undefined;
    }
    for (const queued of this.scheduler.close()) {
      queued.value.reject(error);
    }
    this.rejectClose?.(error);
    if (workerAlreadyExited) {
      this.shutdownPromise = Promise.resolve();
    } else {
      this.shutdownPromise = Promise.resolve(this.worker.terminate())
        .catch(() => undefined);
    }
    if (!this.unavailableNotified) {
      this.unavailableNotified = true;
      void this.onUnavailable?.("RUNTIME_STORAGE_UNAVAILABLE");
    }
  }

  private releaseLock(): void {
    if (this.released) return;
    this.released = true;
    this.singletonLock.release();
  }
}

function defaultWorkerFactory(entrypoint: URL): RuntimeStorageWorkerLike {
  return createRuntimeStorageTypeScriptWorker(entrypoint);
}

function databaseIdentity(path: string): {
  dev: number;
  ino: number;
} {
  const stats = statSync(path);
  return { dev: stats.dev, ino: stats.ino };
}
