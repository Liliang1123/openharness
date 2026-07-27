import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  createRuntimeStorageTypeScriptWorker,
  createRuntimeStorageWorkerClient,
  type RuntimeStorageWorkerLike
} from "../src/storage/runtimeStorageWorkerClient";

const temporaryDirectories: string[] = [];

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe("RuntimeStorageWorkerClient", () => {
  it("boots the real TypeScript Worker before readiness and correlates concurrent RPC calls", async () => {
    const databasePath = temporaryDatabasePath();
    const client = await createRuntimeStorageWorkerClient(databasePath);
    expect(client.readiness()).toEqual({ ready: true });

    const [sessions, facts] = await Promise.all([
      client.execute("p1", "history.list", {
        tenantId: "tenant-a",
        userId: "user-a"
      }),
      client.execute("p1", "memory.list", {
        tenantId: "tenant-a",
        userId: "user-a"
      })
    ]);
    expect(sessions).toEqual([]);
    expect(facts).toEqual([]);
    await client.close();
  });

  it("owns the singleton lock until close joins the Worker", async () => {
    const databasePath = temporaryDatabasePath();
    const first = await createRuntimeStorageWorkerClient(databasePath);
    await expect(createRuntimeStorageWorkerClient(databasePath))
      .rejects.toThrow(/already held/i);

    await first.close();
    const replacement = await createRuntimeStorageWorkerClient(databasePath);
    await replacement.close();
  });

  it("drains accepted work before close and rejects new admission", async () => {
    const databasePath = temporaryDatabasePath();
    const worker = new RecordingWorker();
    const client = await createRuntimeStorageWorkerClient(databasePath, {
      workerFactory: () => worker
    });
    const accepted = client.execute("p1", "history.list", {
      tenantId: "tenant-a",
      userId: "user-a"
    });
    const closing = client.close();

    await expect(client.execute("p1", "history.list", {
      tenantId: "tenant-a",
      userId: "user-a"
    })).rejects.toThrow("RUNTIME_STORAGE_CLOSED");
    await expect(accepted).resolves.toEqual([]);
    await closing;
    expect(worker.operations).toEqual([
      "bootstrap",
      "history.list",
      "storage.close"
    ]);
    expect(worker.maximumInFlight).toBe(1);
  });

  it.each(["exit", "malformed"] as const)(
    "becomes unavailable without replacement after an unexpected Worker %s",
    async mode => {
      const databasePath = temporaryDatabasePath();
      let spawnCount = 0;
      const client = await createRuntimeStorageWorkerClient(databasePath, {
        workerFactory: () => {
          spawnCount += 1;
          return createRuntimeStorageTypeScriptWorker(
            new URL("./fixtures/runtimeStorageWorkerCrashFixture.ts", import.meta.url),
            {
              workerData: { mode }
            }
          );
        }
      });

      await expect(client.execute("p1", "history.list", {
        tenantId: "tenant-a",
        userId: "user-a"
      })).rejects.toThrow("RUNTIME_STORAGE_UNAVAILABLE");
      expect(client.readiness()).toEqual({
        ready: false,
        reason: "RUNTIME_STORAGE_UNAVAILABLE"
      });
      await expect(client.execute("p1", "history.list", {
        tenantId: "tenant-a",
        userId: "user-a"
      })).rejects.toThrow("RUNTIME_STORAGE_UNAVAILABLE");
      expect(spawnCount).toBe(1);
      await expect(createRuntimeStorageWorkerClient(databasePath))
        .rejects.toThrow(/already held/i);
      await client.close();
      const replacement = await createRuntimeStorageWorkerClient(databasePath);
      await replacement.close();
    }
  );

  it("fails closed when a Worker returns a wrong semantic result shape", async () => {
    const databasePath = temporaryDatabasePath();
    const worker = new RecordingWorker("history.list");
    const client = await createRuntimeStorageWorkerClient(databasePath, {
      workerFactory: () => worker
    });

    await expect(client.execute("p1", "history.list", {
      tenantId: "tenant-a",
      userId: "user-a"
    })).rejects.toThrow("RUNTIME_STORAGE_UNAVAILABLE");
    expect(client.readiness()).toEqual({
      ready: false,
      reason: "RUNTIME_STORAGE_UNAVAILABLE"
    });
    await client.close();
  });
});

class RecordingWorker implements RuntimeStorageWorkerLike {
  readonly operations: string[] = [];
  maximumInFlight = 0;
  private inFlight = 0;
  private readonly listeners = {
    message: [] as Array<(value: unknown) => void>,
    error: [] as Array<(error: Error) => void>,
    exit: [] as Array<(code: number) => void>
  };

  constructor(private readonly wrongResultOperation?: string) {}

  postMessage(value: unknown): void {
    const request = value as { requestId: string; operation: string };
    this.operations.push(request.operation);
    this.inFlight += 1;
    this.maximumInFlight = Math.max(this.maximumInFlight, this.inFlight);
    setTimeout(() => {
      this.inFlight -= 1;
      const result = request.operation === this.wrongResultOperation
        ? { malformed: true }
        : request.operation === "bootstrap"
        ? {
            schemaVersion: 2,
            integrity: "ok",
            databaseIdentity: { dev: 1, ino: 1 },
            reconciliation: {
              interruptedExecutions: 0,
              invalidatedApprovals: 0
            }
          }
        : request.operation === "history.list"
          ? []
          : undefined;
      this.emit("message", {
        requestId: request.requestId,
        ok: true,
        result
      });
      if (request.operation === "storage.close") this.emit("exit", 0);
    }, 5);
  }

  on(event: "message", listener: (value: unknown) => void): this;
  on(event: "error", listener: (error: Error) => void): this;
  on(event: "exit", listener: (code: number) => void): this;
  on(
    event: "message" | "error" | "exit",
    listener: ((value: unknown) => void) | ((error: Error) => void) | ((code: number) => void)
  ): this {
    (this.listeners[event] as Array<(value: unknown) => void>)
      .push(listener as (value: unknown) => void);
    return this;
  }

  terminate(): Promise<number> {
    this.emit("exit", 1);
    return Promise.resolve(1);
  }

  private emit(event: "message", value: unknown): void;
  private emit(event: "error", value: Error): void;
  private emit(event: "exit", value: number): void;
  private emit(event: "message" | "error" | "exit", value: unknown): void {
    for (const listener of this.listeners[event] as Array<(value: unknown) => void>) {
      listener(value);
    }
  }
}

function temporaryDatabasePath(): string {
  const directory = mkdtempSync(join(tmpdir(), "openharness-storage-client-"));
  temporaryDirectories.push(directory);
  return join(directory, "runtime.sqlite");
}
