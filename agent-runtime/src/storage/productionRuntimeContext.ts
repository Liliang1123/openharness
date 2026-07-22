import { isAbsolute } from "node:path";
import { InMemoryRuntimeEventPublisher, type RuntimeEventPublisher } from "../runtimeEventStore";
import { RuntimeLifecycleCommands } from "./lifecycleCommands";
import { reconcileRuntimeStartup, type ReconcileRuntimeStartupResult } from "./reconcile";
import { createSqliteRuntimeRepositories, type SqliteRuntimeRepositories } from "./sqliteRuntimeRepositories";
import { createSqliteRuntimeAdapters, type ScopedApprovalReader, type ScopedExecutionReader } from "./sqliteRuntimeAdapters";
import type { HistoryStore } from "../history";
import type { MemoryStore } from "../memoryStore";
import type { RuntimeEventReader } from "../runtimeEventStore";
import {
  openProductionRuntimeStorage,
  type ProductionRuntimeStorage,
  type RuntimeDatabase,
  type RuntimeDatabaseIdentity
} from "./runtimeStorage";

export interface ProductionRuntimeContext {
  readonly databasePath: string;
  readonly database: RuntimeDatabase;
  readonly repositories: SqliteRuntimeRepositories;
  readonly lifecycle: RuntimeLifecycleCommands;
  readonly history: HistoryStore;
  readonly memory: MemoryStore;
  readonly executions: ScopedExecutionReader;
  readonly approvals: ScopedApprovalReader;
  readonly events: RuntimeEventReader;
  readonly liveEvents: RuntimeEventPublisher;
  readonly reconciliation: ReconcileRuntimeStartupResult;
  close(): void;
}

export interface ProductionRuntimeContextDependencies {
  expectedDatabaseIdentity?: RuntimeDatabaseIdentity;
  verifyIntegrity?(database: RuntimeDatabase): void;
  reconcile?: typeof reconcileRuntimeStartup;
}

export function openProductionRuntimeContext(
  databasePath: string,
  dependencies: ProductionRuntimeContextDependencies = {}
): ProductionRuntimeContext {
  if (!isAbsolute(databasePath)) {
    throw new Error("Production Runtime SQLite path must be absolute");
  }

  let storage: ProductionRuntimeStorage | undefined;
  try {
    storage = openProductionRuntimeStorage(databasePath, {
      expectedDatabaseIdentity: dependencies.expectedDatabaseIdentity
    });
    (dependencies.verifyIntegrity ?? verifyRuntimeIntegrity)(storage.database);

    const repositories = createSqliteRuntimeRepositories();
    const lifecycle = new RuntimeLifecycleCommands(storage.database, repositories);
    const reconciliation = (dependencies.reconcile ?? reconcileRuntimeStartup)(storage.database, repositories);
    const adapters = createSqliteRuntimeAdapters(storage.database, repositories);
    const liveEvents = new InMemoryRuntimeEventPublisher();
    let closed = false;

    return {
      databasePath,
      database: storage.database,
      repositories,
      lifecycle,
      ...adapters,
      liveEvents,
      reconciliation,
      close() {
        if (closed) return;
        closed = true;
        storage!.close();
      }
    };
  } catch (error) {
    storage?.close();
    throw error;
  }
}

function verifyRuntimeIntegrity(database: RuntimeDatabase): void {
  const integrity = database.get<Record<string, string>>("PRAGMA integrity_check");
  if (integrity?.integrity_check !== "ok") {
    throw new Error(`SQLite integrity check failed: ${integrity?.integrity_check ?? "missing result"}`);
  }
}
