import Database from "better-sqlite3";
import { statSync } from "node:fs";
import { acquireRuntimeSingletonLock, type RuntimeSingletonLock } from "./singletonLock";

export interface RuntimeTransaction {
  run(sql: string, params?: readonly unknown[]): { changes: number };
  get<T>(sql: string, params?: readonly unknown[]): T | undefined;
  all<T>(sql: string, params?: readonly unknown[]): T[];
}

export interface RuntimeDatabase extends RuntimeTransaction {
  readonly path: string;
  transaction<T>(work: (tx: RuntimeTransaction) => T): T;
  close(): void;
}

export interface RuntimeDatabaseOptions {
  contentionDeadlineMs?: number;
  expectedDatabaseIdentity?: RuntimeDatabaseIdentity;
}

export interface RuntimeDatabaseIdentity {
  dev: number;
  ino: number;
}

export interface ProductionRuntimeStorage {
  readonly database: RuntimeDatabase;
  readonly singletonLock: RuntimeSingletonLock;
  close(): void;
}

const DEFAULT_CONTENTION_DEADLINE_MS = 5_000;
const MAX_BEGIN_ATTEMPTS = 3;
const LATEST_SCHEMA_VERSION = 2;

export function openRuntimeDatabase(
  path: string,
  options: RuntimeDatabaseOptions = {}
): RuntimeDatabase {
  const sqlite = new Database(path);
  if (options.expectedDatabaseIdentity) {
    try {
      verifyOpenedDatabaseIdentity(sqlite, options.expectedDatabaseIdentity);
    } catch {
      sqlite.close();
      throw new Error("Runtime database identity verification failed");
    }
  }
  const contentionDeadlineMs = options.contentionDeadlineMs ?? DEFAULT_CONTENTION_DEADLINE_MS;

  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");
  sqlite.pragma("wal_autocheckpoint = 1000");

  const tx: RuntimeTransaction = {
    run(sql, params = []) {
      return { changes: sqlite.prepare(sql).run(...params).changes };
    },
    get<T>(sql: string, params: readonly unknown[] = []) {
      return sqlite.prepare(sql).get(...params) as T | undefined;
    },
    all<T>(sql: string, params: readonly unknown[] = []) {
      return sqlite.prepare(sql).all(...params) as T[];
    }
  };

  return {
    path,
    ...tx,
    transaction<T>(work: (transaction: RuntimeTransaction) => T): T {
      beginImmediateWithinDeadline(sqlite, contentionDeadlineMs);
      try {
        const result = work(tx);
        sqlite.exec("COMMIT");
        return result;
      } catch (error) {
        if (sqlite.inTransaction) sqlite.exec("ROLLBACK");
        throw error;
      }
    },
    close() {
      sqlite.close();
    }
  };
}

function verifyOpenedDatabaseIdentity(
  sqlite: Database.Database,
  expected: RuntimeDatabaseIdentity
): void {
  if (!isDatabaseIdentity(expected)) throw new Error("invalid expected identity");
  const main = (sqlite.prepare("PRAGMA database_list").all() as Array<{
    name: string;
    file: string;
  }>).find(database => database.name === "main");
  if (!main?.file) throw new Error("missing main database");
  const actual = statSync(main.file);
  if (actual.dev !== expected.dev || actual.ino !== expected.ino) {
    throw new Error("database identity mismatch");
  }
}

function isDatabaseIdentity(value: RuntimeDatabaseIdentity): boolean {
  return Number.isSafeInteger(value.dev)
    && value.dev >= 0
    && Number.isSafeInteger(value.ino)
    && value.ino >= 0;
}

export function openProductionRuntimeStorage(path: string, options: RuntimeDatabaseOptions = {}): ProductionRuntimeStorage {
  const singletonLock = acquireRuntimeSingletonLock(`${path}.lock`);
  try {
    const database = openRuntimeDatabase(path, options);
    migrateRuntimeDatabase(database);
    return {
      database,
      singletonLock,
      close() {
        database.close();
        singletonLock.release();
      }
    };
  } catch (error) {
    singletonLock.release();
    throw error;
  }
}

export function migrateRuntimeDatabase(db: RuntimeDatabase): void {
  db.run("CREATE TABLE IF NOT EXISTS schema_migrations(version INTEGER PRIMARY KEY, applied_at INTEGER NOT NULL)");
  const applied = db.all<{ version: number }>("SELECT version FROM schema_migrations ORDER BY version");
  const highestAppliedVersion = applied.at(-1)?.version ?? 0;
  if (highestAppliedVersion > LATEST_SCHEMA_VERSION) {
    throw new Error(
      `Database has newer schema version ${highestAppliedVersion}; runtime supports ${LATEST_SCHEMA_VERSION}`
    );
  }
  for (let index = 0; index < applied.length; index += 1) {
    if (applied[index]?.version !== index + 1) {
      throw new Error("Runtime schema migration history is not contiguous");
    }
  }
  let current = highestAppliedVersion;
  for (const migration of RUNTIME_MIGRATIONS) {
    if (migration.version <= current) continue;
    if (migration.version !== current + 1) {
      throw new Error(`Missing Runtime schema migration after version ${current}`);
    }
    db.transaction((tx) => {
      for (const sql of migration.statements) tx.run(sql);
      tx.run("INSERT INTO schema_migrations(version, applied_at) VALUES (?, ?)", [migration.version, Date.now()]);
    });
    current = migration.version;
  }
}

const INITIAL_SCHEMA = [
  `CREATE TABLE conversations(
    tenant_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    conversation_id TEXT NOT NULL,
    title TEXT,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    PRIMARY KEY(tenant_id,user_id,conversation_id)
  )`,
  `CREATE TABLE messages(
    tenant_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    conversation_id TEXT NOT NULL,
    seq INTEGER NOT NULL,
    role TEXT NOT NULL,
    content_json TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    PRIMARY KEY(tenant_id,user_id,conversation_id,seq),
    FOREIGN KEY(tenant_id,user_id,conversation_id)
      REFERENCES conversations(tenant_id,user_id,conversation_id) ON DELETE CASCADE
  )`,
  `CREATE TABLE executions(
    execution_id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    conversation_id TEXT NOT NULL,
    status TEXT NOT NULL,
    stop_reason TEXT,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    UNIQUE(tenant_id,user_id,conversation_id,execution_id),
    FOREIGN KEY(tenant_id,user_id,conversation_id)
      REFERENCES conversations(tenant_id,user_id,conversation_id) ON DELETE CASCADE
  )`,
  `CREATE UNIQUE INDEX one_active_execution_per_conversation
    ON executions(tenant_id,user_id,conversation_id)
    WHERE status IN ('running','waiting_approval')`,
  `CREATE TABLE approvals(
    approval_id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    conversation_id TEXT NOT NULL,
    execution_id TEXT NOT NULL,
    status TEXT NOT NULL,
    payload_json TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    UNIQUE(tenant_id,user_id,conversation_id,approval_id),
    FOREIGN KEY(tenant_id,user_id,conversation_id,execution_id)
      REFERENCES executions(tenant_id,user_id,conversation_id,execution_id) ON DELETE CASCADE
  )`,
  `CREATE TABLE runtime_events(
    tenant_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    conversation_id TEXT NOT NULL,
    event_id TEXT NOT NULL,
    execution_id TEXT NOT NULL,
    cursor INTEGER NOT NULL,
    kind TEXT NOT NULL,
    payload_json TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    delivery_status TEXT NOT NULL DEFAULT 'pending',
    delivery_attempts INTEGER NOT NULL DEFAULT 0,
    next_attempt_at INTEGER,
    dead_letter_at INTEGER,
    delivered_at INTEGER,
    PRIMARY KEY(tenant_id,user_id,conversation_id,event_id),
    UNIQUE(tenant_id,user_id,conversation_id,cursor),
    FOREIGN KEY(tenant_id,user_id,conversation_id,execution_id)
      REFERENCES executions(tenant_id,user_id,conversation_id,execution_id) ON DELETE CASCADE
  )`,
  `CREATE INDEX runtime_event_outbox
    ON runtime_events(delivery_status,next_attempt_at)
    WHERE delivery_status IN ('pending','retry')`,
  `CREATE TABLE memory_facts(
    tenant_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    memory_id TEXT NOT NULL,
    content TEXT NOT NULL,
    metadata_json TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    PRIMARY KEY(tenant_id,user_id,memory_id)
  )`
] as const;

const OUTBOX_SCHEMA_V2 = [
  "DROP INDEX IF EXISTS runtime_event_outbox",
  `UPDATE runtime_events
   SET delivery_status = 'not_applicable',
       next_attempt_at = NULL
   WHERE kind <> 'trace' AND delivery_status IN ('pending','retry')`,
  `CREATE INDEX runtime_event_trace_outbox
    ON runtime_events(created_at,event_id)
    WHERE kind = 'trace' AND delivery_status IN ('pending','retry')`,
  `CREATE INDEX runtime_event_trace_dead_letter
    ON runtime_events(dead_letter_at,event_id)
    WHERE kind = 'trace' AND delivery_status = 'dead_letter'`,
  `CREATE TRIGGER runtime_event_non_trace_delivery
   AFTER INSERT ON runtime_events
   WHEN NEW.kind <> 'trace' AND NEW.delivery_status IN ('pending','retry')
   BEGIN
     UPDATE runtime_events
     SET delivery_status = 'not_applicable',
         next_attempt_at = NULL
     WHERE tenant_id = NEW.tenant_id
       AND user_id = NEW.user_id
       AND conversation_id = NEW.conversation_id
       AND event_id = NEW.event_id;
   END`
] as const;

const RUNTIME_MIGRATIONS = [
  { version: 1, statements: INITIAL_SCHEMA },
  { version: 2, statements: OUTBOX_SCHEMA_V2 }
] as const;

function beginImmediateWithinDeadline(sqlite: Database.Database, deadlineMs: number): void {
  const deadlineAt = performance.now() + deadlineMs;
  let lastError: unknown;

  for (let attempt = 1; attempt <= MAX_BEGIN_ATTEMPTS; attempt += 1) {
    const remainingMs = Math.max(1, Math.floor(deadlineAt - performance.now()));
    const attemptsLeft = MAX_BEGIN_ATTEMPTS - attempt + 1;
    sqlite.pragma(`busy_timeout = ${Math.max(1, Math.floor(remainingMs / attemptsLeft))}`);

    try {
      sqlite.exec("BEGIN IMMEDIATE");
      return;
    } catch (error) {
      lastError = error;
      if (!isBusy(error) || performance.now() >= deadlineAt || attempt === MAX_BEGIN_ATTEMPTS) {
        throw error;
      }
    }
  }

  throw lastError;
}

function isBusy(error: unknown): boolean {
  return error instanceof Error && "code" in error && error.code === "SQLITE_BUSY";
}
