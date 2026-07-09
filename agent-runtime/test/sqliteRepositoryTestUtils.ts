import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach } from "vitest";
import { migrateRuntimeDatabase, openRuntimeDatabase, type RuntimeDatabase } from "../src/storage/runtimeStorage";

const dirs: string[] = [];

export function openTestRuntimeDatabase(): RuntimeDatabase {
  const dir = mkdtempSync(join(tmpdir(), "openharness-sqlite-repo-"));
  dirs.push(dir);
  const db = openRuntimeDatabase(join(dir, "runtime.db"));
  migrateRuntimeDatabase(db);
  return db;
}

export function cleanupSqliteRepositoryTestDirs(): void {
  while (dirs.length > 0) rmSync(dirs.pop()!, { recursive: true, force: true });
}

afterEach(cleanupSqliteRepositoryTestDirs);
