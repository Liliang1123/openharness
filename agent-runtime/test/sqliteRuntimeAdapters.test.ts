import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { openProductionRuntimeContext } from "../src/storage/productionRuntimeContext";

const workspaces: string[] = [];

async function openContext() {
  const workspace = mkdtempSync(join(tmpdir(), "openharness-sqlite-adapters-"));
  workspaces.push(workspace);
  return openProductionRuntimeContext(join(workspace, "runtime.sqlite"));
}

afterEach(() => {
  vi.restoreAllMocks();
  for (const workspace of workspaces.splice(0)) rmSync(workspace, { recursive: true, force: true });
});

describe("scoped SQLite Runtime worker adapters", () => {
  it("pushes history and memory ownership scope into Worker semantic commands", async () => {
    const context = await openContext();
    await context.history.append("tenant-a", "user-a", "conversation-a", { role: "user", content: "alpha" });
    await context.history.append("tenant-a", "user-b", "conversation-a", { role: "user", content: "beta" });
    await context.memory.upsert({
      memoryId: "memory-shared",
      tenantId: "tenant-a",
      userId: "user-a",
      content: "alpha-memory",
      tags: []
    });

    expect((await context.history.get("tenant-a", "user-a", "conversation-a"))
      .map(message => message.content)).toEqual(["alpha"]);
    expect((await context.history.get("tenant-a", "user-b", "conversation-a"))
      .map(message => message.content)).toEqual(["beta"]);
    expect(await context.history.list("tenant-a", "user-a")).toHaveLength(1);
    expect(await context.memory.list("tenant-a", "user-b")).toEqual([]);
    expect(await context.memory.list("tenant-a", "user-a")).toHaveLength(1);
    await context.close();
  });

  it("returns executions, approvals, and events only for the complete owner scope", async () => {
    const context = await openContext();
    const scope = {
      tenantId: "tenant-a",
      userId: "user-a",
      conversationId: "conversation-a",
      executionId: "execution-a",
      traceId: "trace-a",
      requestId: "request-a"
    };
    await context.lifecycle.startExecution({ ...scope, message: "hello" });
    await context.lifecycle.enterApproval({
      ...scope,
      approvalId: "approval-a",
      toolCallId: "call-a",
      toolName: "submit_payment",
      argumentsRaw: "{}"
    });

    expect(await context.executions.getActive("tenant-a", "user-a", "conversation-a"))
      .toMatchObject({ executionId: "execution-a" });
    expect(await context.executions.getActive("tenant-a", "user-b", "conversation-a")).toBeNull();
    expect(await context.approvals.listPending("tenant-a", "user-a", "conversation-a")).toHaveLength(1);
    expect(await context.approvals.listPending("tenant-a", "user-b", "conversation-a")).toEqual([]);
    expect(await context.approvals.get(
      "tenant-a",
      "user-a",
      "conversation-a",
      "execution-a",
      "call-a"
    )).toMatchObject({ askUserId: "approval-a" });
    expect(await context.events.since("tenant-a", "user-a", "conversation-a", null))
      .toMatchObject([{ kind: "agent_start" }, { kind: "approval_requested" }]);
    await context.close();
  });

  it("uses only named domain operations and never exposes raw database capabilities", async () => {
    const context = await openContext();
    const execute = vi.spyOn(context.storage, "execute");
    try {
      await context.history.append("tenant-a", "user-a", "conversation-a", {
        role: "user",
        content: "alpha"
      });
      await context.history.get("tenant-a", "user-a", "conversation-a");
      await context.memory.list("tenant-a", "user-a");
      await context.executions.getActive("tenant-a", "user-a", "conversation-a");
      await context.approvals.listPending("tenant-a", "user-a", "conversation-a");
      await context.events.since("tenant-a", "user-a", "conversation-a", null);

      expect(execute.mock.calls.map(call => call[1])).toEqual([
        "history.append",
        "history.get",
        "memory.list",
        "execution.getActive",
        "approval.listPending",
        "event.since"
      ]);
      expect("database" in context).toBe(false);
      expect("repositories" in context).toBe(false);
    } finally {
      await context.close();
    }
  });
});
