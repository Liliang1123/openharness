import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { migrateRuntimeDatabase, openRuntimeDatabase } from "../src/storage/runtimeStorage";

const dirs: string[] = [];

function databasePath(): string {
  const dir = mkdtempSync(join(tmpdir(), "openharness-runtime-storage-"));
  dirs.push(dir);
  return join(dir, "runtime.db");
}

afterEach(() => {
  while (dirs.length > 0) rmSync(dirs.pop()!, { recursive: true, force: true });
});

describe("runtime storage schema", () => {
  it("applies ordered migrations idempotently with foreign keys enabled", () => {
    const db = openRuntimeDatabase(databasePath());
    migrateRuntimeDatabase(db);
    migrateRuntimeDatabase(db);

    expect(db.all<{ version: number }>("SELECT version FROM schema_migrations ORDER BY version")).toEqual([
      { version: 1 }
    ]);
    expect(db.get<{ foreign_keys: number }>("PRAGMA foreign_keys")?.foreign_keys).toBe(1);
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
});
