import { SqliteApprovalStore } from "./sqliteApprovalStore";
import { SqliteExecutionStore } from "./sqliteExecutionStore";
import { SqliteHistoryStore } from "./sqliteHistoryStore";
import { SqliteMemoryStore } from "./sqliteMemoryStore";
import { SqliteRuntimeEventStore } from "./sqliteRuntimeEventStore";

export interface SqliteRuntimeRepositories {
  history: SqliteHistoryStore;
  memory: SqliteMemoryStore;
  execution: SqliteExecutionStore;
  approval: SqliteApprovalStore;
  runtimeEvent: SqliteRuntimeEventStore;
}

export function createSqliteRuntimeRepositories(): SqliteRuntimeRepositories {
  return {
    history: new SqliteHistoryStore(),
    memory: new SqliteMemoryStore(),
    execution: new SqliteExecutionStore(),
    approval: new SqliteApprovalStore(),
    runtimeEvent: new SqliteRuntimeEventStore()
  };
}
