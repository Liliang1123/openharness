import { rmSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { JsonFileApprovalStore } from "../src/approvalStore";

const TEST_DIR = "/tmp/openharness-approval-store-test";

describe("JsonFileApprovalStore", () => {
  it("creates, lists, decides, and persists pending approvals", async () => {
    rmSync(TEST_DIR, { recursive: true, force: true });
    const store = new JsonFileApprovalStore(TEST_DIR);

    const pending = store.createPending({
      tenantId: "t1",
      conversationId: "c1",
      executionId: "exec-1",
      toolCallId: "call-1",
      toolName: "submit_payment",
      argumentsRaw: "{\"amount\":100}",
      reason: "sensitive",
      approvalToken: "token-1"
    });

    expect(pending.askUserId).toBeTruthy();
    expect(store.listPending("t1", "c1")).toHaveLength(1);
    expect(store.getByAskUserId(pending.askUserId)?.toolCallId).toBe("call-1");

    const reloaded = new JsonFileApprovalStore(TEST_DIR);
    const reloadedPending = reloaded.listPending("t1", "c1");
    expect(reloadedPending).toHaveLength(1);
    expect(reloadedPending[0].toolName).toBe("submit_payment");

    const decisionPromise = store.waitForDecision("exec-1", "call-1");
    expect(store.decide("exec-1", "call-1", { action: "approve", respondedAt: "2026-06-04T00:00:00.000Z" })).toBe(true);
    await expect(decisionPromise).resolves.toMatchObject({ action: "approve" });
    expect(store.listPending("t1", "c1")).toEqual([]);

    const afterDecisionReload = new JsonFileApprovalStore(TEST_DIR);
    expect(afterDecisionReload.listPending("t1", "c1")).toEqual([]);
    rmSync(TEST_DIR, { recursive: true, force: true });
  });
});
