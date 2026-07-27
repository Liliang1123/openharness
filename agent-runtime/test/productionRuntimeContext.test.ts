import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { acquireRuntimeSingletonLock } from "../src/storage/singletonLock";
import { openRuntimeDatabase } from "../src/storage/runtimeStorage";
import { openProductionRuntimeContext } from "../src/storage/productionRuntimeContext";

const workspaces: string[] = [];

function databasePath(): string {
  const workspace = mkdtempSync(join(tmpdir(), "openharness-production-context-"));
  workspaces.push(workspace);
  return join(workspace, "runtime.sqlite");
}

afterEach(() => {
  for (const workspace of workspaces.splice(0)) rmSync(workspace, { recursive: true, force: true });
});

describe("ProductionRuntimeContext", () => {
  it("requires an absolute SQLite path before acquiring resources", async () => {
    await expect(openProductionRuntimeContext("relative/runtime.sqlite"))
      .rejects.toThrow(/absolute/i);
  });

  it("owns one Worker storage client and exposes no raw database handles", async () => {
    const path = databasePath();
    const context = await openProductionRuntimeContext(path);

    expect(context.databasePath).toBe(path);
    expect(context.storage.bootstrapResult).toMatchObject({
      schemaVersion: 2,
      integrity: "ok"
    });
    expect(context.reconciliation).toEqual({
      interruptedExecutions: 0,
      invalidatedApprovals: 0
    });
    expect(context.lifecycle).toBeDefined();
    expect(context.liveEvents).toBeDefined();
    expect("database" in context).toBe(false);
    expect("repositories" in context).toBe(false);

    await expect(context.close()).resolves.toBeUndefined();
    await expect(context.close()).resolves.toBeUndefined();
  });

  it("reconciles interrupted lifecycle state before returning the reopened context", async () => {
    const path = databasePath();
    const first = await openProductionRuntimeContext(path);
    await first.lifecycle.startExecution({
      tenantId: "tenant-a",
      userId: "user-a",
      conversationId: "conversation-a",
      executionId: "execution-a",
      traceId: "trace-a",
      requestId: "request-a",
      message: "hello"
    });
    await first.close();

    const reopened = await openProductionRuntimeContext(path);
    expect(reopened.reconciliation).toEqual({
      interruptedExecutions: 1,
      invalidatedApprovals: 0
    });
    expect(await reopened.executions.get(
      "tenant-a",
      "user-a",
      "conversation-a",
      "execution-a"
    )).toMatchObject({ stopReason: "EXECUTION_INTERRUPTED" });
    await reopened.close();
  });

  it("fences a second production context before it can become ready", async () => {
    const path = databasePath();
    const first = await openProductionRuntimeContext(path);
    await expect(openProductionRuntimeContext(path)).rejects.toThrow(/lock/i);
    await first.close();

    const reopened = await openProductionRuntimeContext(path);
    await reopened.close();
  });

  it("releases the singleton lock when database migration fails", async () => {
    const path = databasePath();
    const database = openRuntimeDatabase(path);
    database.run("CREATE TABLE schema_migrations(version INTEGER PRIMARY KEY, applied_at INTEGER NOT NULL)");
    database.run("INSERT INTO schema_migrations(version, applied_at) VALUES (?, ?)", [999, Date.now()]);
    database.close();

    await expect(openProductionRuntimeContext(path))
      .rejects.toThrow("RUNTIME_STORAGE_OPERATION_FAILED");
    const lock = acquireRuntimeSingletonLock(`${path}.lock`);
    lock.release();
  });

  it("releases the singleton lock when expected identity verification fails", async () => {
    const path = databasePath();
    const database = openRuntimeDatabase(path);
    database.close();

    await expect(openProductionRuntimeContext(path, {
      expectedDatabaseIdentity: { dev: 0, ino: 0 }
    })).rejects.toThrow();
    const reopened = await openProductionRuntimeContext(path);
    await reopened.close();
  });
});
