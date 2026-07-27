import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { openProductionRuntimeContext } from "../src/storage/productionRuntimeContext";
import {
  createRuntimeStorageTypeScriptWorker,
  createRuntimeStorageWorkerClient
} from "../src/storage/runtimeStorageWorkerClient";

const workspaces: string[] = [];

afterEach(() => {
  for (const workspace of workspaces.splice(0)) {
    rmSync(workspace, { recursive: true, force: true });
  }
});

describe("Runtime storage Worker crash boundaries", () => {
  it("leaves no lifecycle state when the Worker exits before commit", async () => {
    const databasePath = temporaryDatabasePath();
    const unavailable: string[] = [];
    const client = await crashingClient(databasePath, unavailable);

    await expect(client.execute("p1", "lifecycle.startExecution", {
      ...scope("execution-before"),
      message: "before",
      crash: "before_commit"
    })).rejects.toThrow("RUNTIME_STORAGE_UNAVAILABLE");
    await client.close();
    expect(unavailable).toEqual(["RUNTIME_STORAGE_UNAVAILABLE"]);

    const reopened = await openProductionRuntimeContext(databasePath);
    expect(await reopened.executions.get(
      "tenant-a",
      "user-a",
      "conversation-before",
      "execution-before"
    )).toBeNull();
    expect(await reopened.history.get(
      "tenant-a",
      "user-a",
      "conversation-before"
    )).toEqual([]);
    await reopened.close();
  });

  it("preserves commit, rejects the outstanding RPC, and reconciles after exit before response", async () => {
    const databasePath = temporaryDatabasePath();
    const unavailable: string[] = [];
    const client = await crashingClient(databasePath, unavailable);

    await expect(client.execute("p1", "lifecycle.startExecution", {
      ...scope("execution-after"),
      message: "after",
      crash: "after_commit"
    })).rejects.toThrow("RUNTIME_STORAGE_UNAVAILABLE");
    await client.close();
    expect(unavailable).toEqual(["RUNTIME_STORAGE_UNAVAILABLE"]);

    const reopened = await openProductionRuntimeContext(databasePath);
    expect(reopened.reconciliation).toEqual({
      interruptedExecutions: 1,
      invalidatedApprovals: 0
    });
    expect(await reopened.executions.get(
      "tenant-a",
      "user-a",
      "conversation-after",
      "execution-after"
    )).toMatchObject({
      status: "errored",
      stopReason: "EXECUTION_INTERRUPTED"
    });
    expect((await reopened.history.get(
      "tenant-a",
      "user-a",
      "conversation-after"
    )).map(message => message.content)).toEqual(["after"]);
    expect((await reopened.events.forExecution(
      "tenant-a",
      "user-a",
      "conversation-after",
      "execution-after"
    )).map(event => event.kind)).toEqual([
      "agent_start",
      "stream_error"
    ]);
    await reopened.close();
  });
});

async function crashingClient(databasePath: string, unavailable: string[]) {
  return createRuntimeStorageWorkerClient(databasePath, {
    workerFactory: () => createRuntimeStorageTypeScriptWorker(
      new URL("./fixtures/runtimeStorageWorkerCrashBoundaryFixture.ts", import.meta.url)
    ),
    onUnavailable: code => {
      unavailable.push(code);
    }
  });
}

function temporaryDatabasePath(): string {
  const workspace = mkdtempSync(join(tmpdir(), "openharness-worker-crash-"));
  workspaces.push(workspace);
  return join(workspace, "runtime.sqlite");
}

function scope(executionId: string) {
  const suffix = executionId.replace("execution-", "");
  return {
    tenantId: "tenant-a",
    userId: "user-a",
    conversationId: `conversation-${suffix}`,
    executionId,
    traceId: `trace-${suffix}`,
    requestId: `request-${suffix}`
  };
}
