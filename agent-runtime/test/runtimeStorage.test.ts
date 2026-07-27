import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, realpathSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Database from "better-sqlite3";
import { afterEach, describe, expect, it, vi } from "vitest";
import { migrateRuntimeDatabase, openRuntimeDatabase } from "../src/storage/runtimeStorage";

const databaseMock = vi.hoisted(() => ({
  databaseListRows: undefined as unknown[] | undefined,
  trackClose: false,
  closeCalls: 0
}));

const fileSystemMock = vi.hoisted(() => ({
  failStatPath: undefined as string | undefined
}));

vi.mock("better-sqlite3", async importOriginal => {
  const actual = await importOriginal<Record<string, unknown>>();
  const ActualDatabase = actual.default as typeof Database;
  function WrappedDatabase(...args: ConstructorParameters<typeof ActualDatabase>) {
    const database = new ActualDatabase(...args);
    const prepare = database.prepare.bind(database);
    const close = database.close.bind(database);
    Object.defineProperty(database, "prepare", {
      configurable: true,
      value(sql: string) {
        if (databaseMock.databaseListRows !== undefined && sql.trim().toUpperCase() === "PRAGMA DATABASE_LIST") {
          return { all: () => databaseMock.databaseListRows };
        }
        return prepare(sql);
      }
    });
    Object.defineProperty(database, "close", {
      configurable: true,
      value() {
        if (databaseMock.trackClose) databaseMock.closeCalls += 1;
        close();
      }
    });
    return database;
  }
  Object.setPrototypeOf(WrappedDatabase, ActualDatabase);
  WrappedDatabase.prototype = ActualDatabase.prototype;
  return { ...actual, default: WrappedDatabase };
});

vi.mock("node:fs", async importOriginal => {
  const actual = await importOriginal<typeof import("node:fs")>();
  return {
    ...actual,
    statSync(...args: Parameters<typeof actual.statSync>) {
      if (fileSystemMock.failStatPath !== undefined && args[0] === fileSystemMock.failStatPath) {
        throw new Error("stat-sensitive-detail");
      }
      return actual.statSync(...args);
    }
  };
});

const dirs: string[] = [];

function databasePath(): string {
  const dir = mkdtempSync(join(tmpdir(), "openharness-runtime-storage-"));
  dirs.push(dir);
  return join(dir, "runtime.db");
}

afterEach(() => {
  databaseMock.databaseListRows = undefined;
  databaseMock.trackClose = false;
  databaseMock.closeCalls = 0;
  fileSystemMock.failStatPath = undefined;
  while (dirs.length > 0) rmSync(dirs.pop()!, { recursive: true, force: true });
});

describe("runtime storage schema", () => {
  it("applies ordered migrations idempotently with foreign keys enabled", () => {
    const db = openRuntimeDatabase(databasePath());
    migrateRuntimeDatabase(db);
    migrateRuntimeDatabase(db);

    expect(db.all<{ version: number }>("SELECT version FROM schema_migrations ORDER BY version")).toEqual([
      { version: 1 },
      { version: 2 }
    ]);
    expect(db.get<{ foreign_keys: number }>("PRAGMA foreign_keys")?.foreign_keys).toBe(1);
    expect(db.get<{ integrity_check: string }>("PRAGMA integrity_check")?.integrity_check).toBe("ok");
    db.close();
  });

  it("migrates version-one outbox rows to trace-only eligibility with ordered indexes", () => {
    const db = openRuntimeDatabase(databasePath());
    migrateRuntimeDatabase(db);
    db.run("DROP INDEX IF EXISTS runtime_event_trace_outbox");
    db.run("DROP INDEX IF EXISTS runtime_event_trace_dead_letter");
    db.run("DROP TRIGGER IF EXISTS runtime_event_non_trace_delivery");
    db.run(`CREATE INDEX IF NOT EXISTS runtime_event_outbox
      ON runtime_events(delivery_status,next_attempt_at)
      WHERE delivery_status IN ('pending','retry')`);
    db.run("DELETE FROM schema_migrations WHERE version > 1");
    db.run(
      "INSERT INTO conversations(tenant_id,user_id,conversation_id,created_at,updated_at) VALUES (?,?,?,?,?)",
      ["t1", "u1", "c1", 1, 1]
    );
    db.run(
      `INSERT INTO executions(
         execution_id,tenant_id,user_id,conversation_id,status,created_at,updated_at
       ) VALUES (?,?,?,?,?,?,?)`,
      ["e1", "t1", "u1", "c1", "completed", 1, 1]
    );
    for (const [eventId, cursor, kind, status] of [
      ["event-non-trace", 1, "agent_start", "pending"],
      ["event-non-trace-retry", 2, "agent_end", "retry"],
      ["event-trace", 3, "trace", "pending"]
    ] as const) {
      db.run(
        `INSERT INTO runtime_events(
           tenant_id,user_id,conversation_id,event_id,execution_id,cursor,kind,payload_json,created_at,
           delivery_status,next_attempt_at
         ) VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
        ["t1", "u1", "c1", eventId, "e1", cursor, kind, "{}", cursor, status, status === "retry" ? 10 : null]
      );
    }

    migrateRuntimeDatabase(db);

    expect(db.all<{ version: number }>("SELECT version FROM schema_migrations ORDER BY version")).toEqual([
      { version: 1 },
      { version: 2 }
    ]);
    expect(db.all<{ event_id: string; delivery_status: string; next_attempt_at: number | null }>(
      "SELECT event_id,delivery_status,next_attempt_at FROM runtime_events ORDER BY cursor"
    )).toEqual([
      { event_id: "event-non-trace", delivery_status: "not_applicable", next_attempt_at: null },
      { event_id: "event-non-trace-retry", delivery_status: "not_applicable", next_attempt_at: null },
      { event_id: "event-trace", delivery_status: "pending", next_attempt_at: null }
    ]);
    expect(db.all<{ name: string }>(
      "SELECT name FROM sqlite_master WHERE type = 'index' AND name LIKE 'runtime_event_%' ORDER BY name"
    ).map(row => row.name)).toEqual([
      "runtime_event_trace_dead_letter",
      "runtime_event_trace_outbox"
    ]);
    expect(db.get<{ integrity_check: string }>("PRAGMA integrity_check")?.integrity_check).toBe("ok");
    db.close();
  });

  it("enforces scoped conversation ownership and message sequence uniqueness", () => {
    const db = openRuntimeDatabase(databasePath());
    migrateRuntimeDatabase(db);
    db.run("INSERT INTO conversations(tenant_id,user_id,conversation_id,created_at,updated_at) VALUES (?,?,?,?,?)", ["t1", "u1", "c1", 1, 1]);
    db.run("INSERT INTO messages(tenant_id,user_id,conversation_id,seq,role,content_json,created_at) VALUES (?,?,?,?,?,?,?)", ["t1", "u1", "c1", 1, "user", "{}", 1]);

    expect(() => db.run("INSERT INTO messages(tenant_id,user_id,conversation_id,seq,role,content_json,created_at) VALUES (?,?,?,?,?,?,?)", ["t1", "u1", "c1", 1, "assistant", "{}", 2])).toThrow();
    expect(() => db.run("INSERT INTO messages(tenant_id,user_id,conversation_id,seq,role,content_json,created_at) VALUES (?,?,?,?,?,?,?)", ["t1", "u2", "c1", 2, "user", "{}", 2])).toThrow();
    db.close();
  });

  it("allows at most one active execution per scoped conversation", () => {
    const db = openRuntimeDatabase(databasePath());
    migrateRuntimeDatabase(db);
    db.run("INSERT INTO conversations(tenant_id,user_id,conversation_id,created_at,updated_at) VALUES (?,?,?,?,?)", ["t1", "u1", "c1", 1, 1]);
    db.run("INSERT INTO executions(execution_id,tenant_id,user_id,conversation_id,status,created_at,updated_at) VALUES (?,?,?,?,?,?,?)", ["e1", "t1", "u1", "c1", "running", 1, 1]);

    expect(() => db.run("INSERT INTO executions(execution_id,tenant_id,user_id,conversation_id,status,created_at,updated_at) VALUES (?,?,?,?,?,?,?)", ["e2", "t1", "u1", "c1", "waiting_approval", 2, 2])).toThrow();
    db.run("UPDATE executions SET status = 'completed', updated_at = 3 WHERE execution_id = 'e1'");
    expect(() => db.run("INSERT INTO executions(execution_id,tenant_id,user_id,conversation_id,status,created_at,updated_at) VALUES (?,?,?,?,?,?,?)", ["e2", "t1", "u1", "c1", "running", 3, 3])).not.toThrow();
    db.close();
  });

  it("refuses a database created by a newer runtime", () => {
    const db = openRuntimeDatabase(databasePath());
    db.run("CREATE TABLE schema_migrations(version INTEGER PRIMARY KEY, applied_at INTEGER NOT NULL)");
    db.run("INSERT INTO schema_migrations(version, applied_at) VALUES (?, ?)", [999, 1]);

    expect(() => migrateRuntimeDatabase(db)).toThrow(/newer schema version/i);
    db.close();
  });

  it("fails closed when the applied migration history is not contiguous", () => {
    const db = openRuntimeDatabase(databasePath());
    db.run("CREATE TABLE schema_migrations(version INTEGER PRIMARY KEY, applied_at INTEGER NOT NULL)");
    db.run("INSERT INTO schema_migrations(version, applied_at) VALUES (?, ?)", [2, 1]);

    expect(() => migrateRuntimeDatabase(db)).toThrow(/migration history/i);
    db.close();
  });

  it("allows a matching claimed zero-byte database identity to initialize and migrate", () => {
    const path = databasePath();
    writeFileSync(path, "", { mode: 0o600 });
    const claimed = statSync(path);

    const db = openRuntimeDatabase(path, {
      expectedDatabaseIdentity: { dev: claimed.dev, ino: claimed.ino }
    });
    migrateRuntimeDatabase(db);

    expect(db.get<{ version: number }>("SELECT MAX(version) AS version FROM schema_migrations")?.version).toBe(2);
    db.close();
  });

  it("closes on identity mismatch before changing sentinel bytes, hash, size, or mtime", () => {
    const path = databasePath();
    const sentinel = new Database(path);
    sentinel.exec("CREATE TABLE sentinel(value TEXT); INSERT INTO sentinel(value) VALUES ('unchanged')");
    sentinel.close();
    const before = databaseInvariant(path);
    databaseMock.trackClose = true;

    const result = captureIdentityOpen(path, {
      dev: before.dev + 1,
      ino: before.ino + 1
    });

    expect(result.error?.message).toBe("Runtime database identity verification failed");
    expect(result.error?.message).not.toContain(path);
    expect(result.error?.message).not.toContain(String(before.dev + 1));
    expect(result.error?.message).not.toContain(String(before.ino + 1));
    expect(databaseMock.closeCalls).toBe(1);
    expect(databaseInvariant(path)).toEqual(before);
  });

  it("closes with the same fixed error when database_list has no main database", () => {
    const path = databasePath();
    writeFileSync(path, "", { mode: 0o600 });
    const claimed = statSync(path);
    databaseMock.databaseListRows = [];
    databaseMock.trackClose = true;

    const result = captureIdentityOpen(path, { dev: claimed.dev, ino: claimed.ino });

    expect(result.error?.message).toBe("Runtime database identity verification failed");
    expect(result.error?.message).not.toContain(path);
    expect(databaseMock.closeCalls).toBe(1);
  });

  it("closes with the same fixed error when the opened main database cannot be statted", () => {
    const path = databasePath();
    writeFileSync(path, "", { mode: 0o600 });
    const claimed = statSync(path);
    fileSystemMock.failStatPath = realpathSync(path);
    databaseMock.trackClose = true;

    const result = captureIdentityOpen(path, { dev: claimed.dev, ino: claimed.ino });

    expect(result.error?.message).toBe("Runtime database identity verification failed");
    expect(result.error?.message).not.toContain("stat-sensitive-detail");
    expect(result.error?.message).not.toContain(path);
    expect(databaseMock.closeCalls).toBe(1);
  });
});

function captureIdentityOpen(
  path: string,
  expectedDatabaseIdentity: { dev: number; ino: number }
): { error?: Error } {
  let database: ReturnType<typeof openRuntimeDatabase> | undefined;
  try {
    database = openRuntimeDatabase(path, { expectedDatabaseIdentity });
    return {};
  } catch (error) {
    return { error: error as Error };
  } finally {
    database?.close();
  }
}

function databaseInvariant(path: string): {
  bytes: Buffer;
  sha256: string;
  size: number;
  mtimeMs: number;
  dev: number;
  ino: number;
} {
  const bytes = readFileSync(path);
  const metadata = statSync(path);
  return {
    bytes,
    sha256: createHash("sha256").update(bytes).digest("hex"),
    size: metadata.size,
    mtimeMs: metadata.mtimeMs,
    dev: metadata.dev,
    ino: metadata.ino
  };
}
