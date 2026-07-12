import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { openProductionRuntimeContext } from "../src/storage/productionRuntimeContext";

const workspaces: string[] = [];

function openContext() {
  const workspace = mkdtempSync(join(tmpdir(), "openharness-sqlite-adapters-"));
  workspaces.push(workspace);
  return openProductionRuntimeContext(join(workspace, "runtime.sqlite"));
}

afterEach(() => {
  for (const workspace of workspaces.splice(0)) rmSync(workspace, { recursive: true, force: true });
});

describe("scoped SQLite Runtime adapters", () => {
  it("pushes history and memory ownership scope into the shared database", async () => {
    const context = openContext();
    context.history.append("tenant-a", "user-a", "conversation-a", { role: "user", content: "alpha" });
    context.history.append("tenant-a", "user-b", "conversation-a", { role: "user", content: "beta" });
    await context.memory.upsert({
      memoryId: "memory-shared",
      tenantId: "tenant-a",
      userId: "user-a",
      content: "alpha-memory",
      tags: []
    });

    expect(context.history.get("tenant-a", "user-a", "conversation-a").map(message => message.content)).toEqual(["alpha"]);
    expect(context.history.get("tenant-a", "user-b", "conversation-a").map(message => message.content)).toEqual(["beta"]);
    expect(await context.history.list("tenant-a", "user-a")).toHaveLength(1);
    expect(await context.memory.list("tenant-a", "user-b")).toEqual([]);
    expect(await context.memory.list("tenant-a", "user-a")).toHaveLength(1);
    context.close();
  });

  it("returns executions, approvals, and events only for the complete owner scope", () => {
    const context = openContext();
    const scope = {
      tenantId: "tenant-a",
      userId: "user-a",
      conversationId: "conversation-a",
      executionId: "execution-a",
      traceId: "trace-a",
      requestId: "request-a"
    };
    context.lifecycle.startExecution({ ...scope, message: "hello" });
    context.lifecycle.enterApproval({
      ...scope,
      approvalId: "approval-a",
      toolCallId: "call-a",
      toolName: "submit_payment",
      argumentsRaw: "{}"
    });

    expect(context.executions.getActive("tenant-a", "user-a", "conversation-a")?.executionId).toBe("execution-a");
    expect(context.executions.getActive("tenant-a", "user-b", "conversation-a")).toBeNull();
    expect(context.approvals.listPending("tenant-a", "user-a", "conversation-a")).toHaveLength(1);
    expect(context.approvals.listPending("tenant-a", "user-b", "conversation-a")).toEqual([]);
    expect(context.approvals.get("tenant-a", "user-a", "conversation-a", "execution-a", "call-a")?.askUserId).toBe("approval-a");
    expect(context.approvals.get("tenant-a", "user-b", "conversation-a", "execution-a", "call-a")).toBeNull();
    expect(context.events.since("tenant-a", "user-a", "conversation-a", null).map(event => event.kind))
      .toEqual(["agent_start", "approval_requested"]);
    expect(context.events.since("tenant-a", "user-b", "conversation-a", null)).toEqual([]);
    context.close();
  });
});
