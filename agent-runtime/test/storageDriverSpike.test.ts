import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Database from "better-sqlite3";
import { afterEach, describe, expect, it } from "vitest";
import { openRuntimeDatabase } from "../src/storage/runtimeStorage";

const tempDirs: string[] = [];

function tempDatabase(): { dir: string; path: string } {
  const dir = mkdtempSync(join(tmpdir(), "openharness-sqlite-spike-"));
  tempDirs.push(dir);
  return { dir, path: join(dir, "runtime.db") };
}

afterEach(() => {
  while (tempDirs.length > 0) {
    rmSync(tempDirs.pop()!, { recursive: true, force: true });
  }
});

describe("RuntimeDatabase driver spike", () => {
  it("enables WAL and foreign keys on a real file database", () => {
    const { path } = tempDatabase();
    const db = openRuntimeDatabase(path);

    expect(db.get<{ journal_mode: string }>("PRAGMA journal_mode")?.journal_mode).toBe("wal");
    expect(db.get<{ foreign_keys: number }>("PRAGMA foreign_keys")?.foreign_keys).toBe(1);

    db.close();
  });

  it("rolls back every write when a transaction throws", () => {
    const { path } = tempDatabase();
    const db = openRuntimeDatabase(path);
    db.run("CREATE TABLE items (id INTEGER PRIMARY KEY, value TEXT NOT NULL)");

    expect(() => db.transaction((tx) => {
      tx.run("INSERT INTO items(value) VALUES (?)", ["uncommitted"]);
      throw new Error("rollback-spike");
    })).toThrow("rollback-spike");

    expect(db.get<{ count: number }>("SELECT COUNT(*) AS count FROM items")?.count).toBe(0);
    db.close();
  });

  it("bounds BEGIN IMMEDIATE contention by one wall-clock deadline", () => {
    const { path } = tempDatabase();
    const locker = new Database(path);
    locker.pragma("journal_mode = WAL");
    locker.exec("BEGIN IMMEDIATE");

    const db = openRuntimeDatabase(path, { contentionDeadlineMs: 200 });
    const startedAt = performance.now();
    let busyError: unknown;
    try {
      db.transaction(() => undefined);
    } catch (error) {
      busyError = error;
    }
    const elapsedMs = performance.now() - startedAt;

    expect(busyError).toMatchObject({ code: "SQLITE_BUSY" });
    expect(elapsedMs).toBeGreaterThanOrEqual(150);
    expect(elapsedMs).toBeLessThanOrEqual(700);

    locker.exec("ROLLBACK");
    locker.close();
    db.close();
  });

  it("uses the production five-second contention deadline by default", () => {
    const { path } = tempDatabase();
    const locker = new Database(path);
    locker.pragma("journal_mode = WAL");
    locker.exec("BEGIN IMMEDIATE");

    const db = openRuntimeDatabase(path);
    const startedAt = performance.now();
    try {
      db.transaction(() => undefined);
    } catch {
      // Expected: the locker owns the only write reservation.
    }
    const elapsedMs = performance.now() - startedAt;

    expect(elapsedMs).toBeGreaterThanOrEqual(4_500);
    expect(elapsedMs).toBeLessThanOrEqual(5_500);

    locker.exec("ROLLBACK");
    locker.close();
    db.close();
  }, 7_000);

  it("releases file handles when closed", () => {
    const { dir, path } = tempDatabase();
    const db = openRuntimeDatabase(path);
    db.run("CREATE TABLE close_probe (id INTEGER PRIMARY KEY)");
    db.close();

    expect(() => rmSync(dir, { recursive: true, force: false })).not.toThrow();
    tempDirs.splice(tempDirs.indexOf(dir), 1);
  });
});
