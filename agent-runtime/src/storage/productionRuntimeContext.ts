import { isAbsolute } from "node:path";
import type { HistoryStore } from "../history";
import type { MemoryStore } from "../memoryStore";
import {
  InMemoryRuntimeEventPublisher,
  type RuntimeEventPublisher,
  type RuntimeEventReader
} from "../runtimeEventStore";
import type { RuntimeLifecycleWriter } from "./lifecycleCommands";
import type { ReconcileRuntimeStartupResult } from "./reconcile";
import type { RuntimeDatabaseIdentity } from "./runtimeStorage";
import {
  createRuntimeStorageWorkerAdapters,
  type ScopedApprovalReader,
  type ScopedExecutionReader
} from "./sqliteRuntimeAdapters";
import {
  createRuntimeStorageWorkerClient,
  type RuntimeStorageWorkerClient
} from "./runtimeStorageWorkerClient";

export interface ProductionRuntimeContext {
  readonly databasePath: string;
  readonly storage: RuntimeStorageWorkerClient;
  readonly lifecycle: RuntimeLifecycleWriter;
  readonly history: HistoryStore;
  readonly memory: MemoryStore;
  readonly executions: ScopedExecutionReader;
  readonly approvals: ScopedApprovalReader;
  readonly events: RuntimeEventReader;
  readonly liveEvents: RuntimeEventPublisher;
  readonly reconciliation: ReconcileRuntimeStartupResult;
  close(): Promise<void>;
}

export interface ProductionRuntimeContextDependencies {
  expectedDatabaseIdentity?: RuntimeDatabaseIdentity;
  createStorage?: typeof createRuntimeStorageWorkerClient;
  onUnavailable?: (errorCode: "RUNTIME_STORAGE_UNAVAILABLE") => void | Promise<void>;
}

export async function openProductionRuntimeContext(
  databasePath: string,
  dependencies: ProductionRuntimeContextDependencies = {}
): Promise<ProductionRuntimeContext> {
  if (!isAbsolute(databasePath)) {
    throw new Error("Production Runtime SQLite path must be absolute");
  }

  const storage = await (dependencies.createStorage ?? createRuntimeStorageWorkerClient)(
    databasePath,
    {
      expectedDatabaseIdentity: dependencies.expectedDatabaseIdentity,
      onUnavailable: dependencies.onUnavailable
    }
  );
  const adapters = createRuntimeStorageWorkerAdapters(storage);
  const liveEvents = new InMemoryRuntimeEventPublisher();
  const lifecycle = createWorkerLifecycle(storage);
  let closed = false;

  return {
    databasePath,
    storage,
    lifecycle,
    ...adapters,
    liveEvents,
    reconciliation: storage.bootstrapResult.reconciliation,
    async close() {
      if (closed) return;
      closed = true;
      await storage.close();
    }
  };
}

function createWorkerLifecycle(
  storage: RuntimeStorageWorkerClient
): RuntimeLifecycleWriter {
  return {
    startExecution: input =>
      storage.execute("p1", "lifecycle.startExecution", input),
    enterApproval: input =>
      storage.execute("p1", "lifecycle.enterApproval", input),
    decideApproval: input =>
      storage.execute("p1", "lifecycle.decideApproval", input),
    recordToolPlan: input =>
      storage.execute("p1", "lifecycle.recordToolPlan", input),
    completeTool: input =>
      storage.execute("p1", "lifecycle.completeTool", input),
    completeExecution: input =>
      storage.execute("p1", "lifecycle.completeExecution", input),
    failExecution: input =>
      storage.execute("p1", "lifecycle.failExecution", input),
    abortExecution: input =>
      storage.execute("p1", "lifecycle.abortExecution", input),
    recordEvent: input =>
      storage.execute("p1", "lifecycle.recordEvent", input),
    recordInjectedMessages: input =>
      storage.execute("p1", "lifecycle.recordInjectedMessages", input),
    interruptExecution: input =>
      storage.execute("p1", "lifecycle.interruptExecution", input)
  };
}
