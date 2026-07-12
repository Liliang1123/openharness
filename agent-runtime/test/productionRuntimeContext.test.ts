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
  it("requires an absolute SQLite path before acquiring resources", () => {
    expect(() => openProductionRuntimeContext("relative/runtime.sqlite")).toThrow(/absolute/i);
  });

  it("owns one database, repositories, lifecycle, reconciliation, and idempotent close", () => {
    const path = databasePath();
    const context = openProductionRuntimeContext(path);

    expect(context.databasePath).toBe(path);
    expect(context.database.path).toBe(path);
    expect(context.reconciliation).toEqual({ interruptedExecutions: 0, invalidatedApprovals: 0 });
    expect(context.repositories.history).toBeDefined();
    expect(context.lifecycle).toBeDefined();
    expect(context.liveEvents).toBeDefined();

    expect(() => context.close()).not.toThrow();
    expect(() => context.close()).not.toThrow();
  });

  it("reconciles interrupted lifecycle state before returning the reopened context", () => {
    const path = databasePath();
    const first = openProductionRuntimeContext(path);
    first.lifecycle.startExecution({
      tenantId: "tenant-a",
      userId: "user-a",
      conversationId: "conversation-a",
      executionId: "execution-a",
      traceId: "trace-a",
      requestId: "request-a",
      message: "hello"
    });
    first.close();

    const reopened = openProductionRuntimeContext(path);
    expect(reopened.reconciliation).toEqual({ interruptedExecutions: 1, invalidatedApprovals: 0 });
    expect(reopened.database.transaction((tx) => reopened.repositories.execution.get(
      tx,
      "tenant-a",
      "user-a",
      "conversation-a",
      "execution-a"
    ))?.stopReason).toBe("EXECUTION_INTERRUPTED");
    reopened.close();
  });

  it("fences a second production context before it can become ready", () => {
    const path = databasePath();
    const first = openProductionRuntimeContext(path);
    expect(() => openProductionRuntimeContext(path)).toThrow(/lock/i);
    first.close();

    const reopened = openProductionRuntimeContext(path);
    reopened.close();
  });

  it("releases the singleton lock when database migration fails", () => {
    const path = databasePath();
    const database = openRuntimeDatabase(path);
    database.run("CREATE TABLE schema_migrations(version INTEGER PRIMARY KEY, applied_at INTEGER NOT NULL)");
    database.run("INSERT INTO schema_migrations(version, applied_at) VALUES (?, ?)", [999, Date.now()]);
    database.close();

    expect(() => openProductionRuntimeContext(path)).toThrow(/newer schema version/i);
    const lock = acquireRuntimeSingletonLock(`${path}.lock`);
    lock.release();
  });

  it.each(["integrity", "reconciliation"] as const)("closes storage and releases the lock when %s fails", (phase) => {
    const path = databasePath();
    expect(() => openProductionRuntimeContext(path, phase === "integrity"
      ? { verifyIntegrity: () => { throw new Error("integrity failure"); } }
      : { reconcile: () => { throw new Error("reconciliation failure"); } }
    )).toThrow(new RegExp(`${phase} failure`));

    const reopened = openProductionRuntimeContext(path);
    reopened.close();
  });
});
