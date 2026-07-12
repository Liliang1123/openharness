import { existsSync, readFileSync, rmSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { JsonFileApprovalStore } from "../src/approvalStore";

const TEST_DIR = "/tmp/openharness-approval-store-test";

describe("JsonFileApprovalStore", () => {
  it("creates, lists, decides, and persists pending approvals", async () => {
    rmSync(TEST_DIR, { recursive: true, force: true });
    const store = new JsonFileApprovalStore(TEST_DIR);

    const pending = store.createPending({
      tenantId: "t1",
      userId: "u1",
      conversationId: "c1",
      executionId: "exec-1",
      toolCallId: "call-1",
      toolName: "submit_payment",
      argumentsRaw: "{\"amount\":100}",
      reason: "sensitive",
      approvalToken: "token-1"
    });

    expect(pending.askUserId).toBeTruthy();
    expect(store.listPending("t1", "u1", "c1")).toHaveLength(1);
    expect(store.getByAskUserId("t1", "u1", "c1", pending.askUserId)?.toolCallId).toBe("call-1");

    const reloaded = new JsonFileApprovalStore(TEST_DIR);
    const reloadedPending = reloaded.listPending("t1", "u1", "c1");
    expect(reloadedPending).toHaveLength(1);
    expect(reloadedPending[0].toolName).toBe("submit_payment");

    const decisionPromise = store.waitForDecision("t1", "u1", "c1", "exec-1", "call-1");
    expect(store.decide("t1", "u1", "c1", "exec-1", "call-1", { action: "approve", respondedAt: "2026-06-04T00:00:00.000Z" })).toBe(true);
    await expect(decisionPromise).resolves.toMatchObject({ action: "approve" });
    expect(store.listPending("t1", "u1", "c1")).toEqual([]);

    const afterDecisionReload = new JsonFileApprovalStore(TEST_DIR);
    expect(afterDecisionReload.listPending("t1", "u1", "c1")).toEqual([]);
    rmSync(TEST_DIR, { recursive: true, force: true });
  });

  it("keeps Codex pending approval payload in memory only", async () => {
    rmSync(TEST_DIR, { recursive: true, force: true });
    const store = new JsonFileApprovalStore(TEST_DIR);
    const pending = store.createPending({
      tenantId: "t1",
      userId: "u1",
      conversationId: "codex",
      executionId: "exec-codex",
      toolCallId: "call-codex",
      toolName: "submit_payment",
      argumentsRaw: "{\"secret\":\"ARG-CANARY\"}",
      approvalToken: "APPROVAL-CANARY"
    }, { persist: false });

    expect(store.listPending("t1", "u1", "codex")).toHaveLength(1);
    const approvalFile = `${TEST_DIR}/t1/u1/codex-approvals.json`;
    if (existsSync(approvalFile)) {
      expect(readFileSync(approvalFile, "utf-8")).not.toContain("ARG-CANARY");
      expect(readFileSync(approvalFile, "utf-8")).not.toContain("APPROVAL-CANARY");
    }
    expect(new JsonFileApprovalStore(TEST_DIR).listPending("t1", "u1", "codex")).toEqual([]);

    const decision = store.waitForDecision("t1", "u1", "codex", "exec-codex", "call-codex");
    expect(store.decide("t1", "u1", "codex", "exec-codex", "call-codex", {
      action: "reject",
      respondedAt: "2026-07-12T00:00:00.000Z"
    })).toBe(true);
    await expect(decision).resolves.toMatchObject({ action: "reject" });
    expect(store.getByAskUserId("t1", "u1", "codex", pending.askUserId)).toBeNull();
    rmSync(TEST_DIR, { recursive: true, force: true });
  });

  it("does not reveal or decide another user's pending approval", () => {
    rmSync(TEST_DIR, { recursive: true, force: true });
    const store = new JsonFileApprovalStore(TEST_DIR);
    const pending = store.createPending({
      tenantId: "t1",
      userId: "u1",
      conversationId: "c1",
      executionId: "exec-1",
      toolCallId: "call-1",
      toolName: "submit_payment",
      argumentsRaw: "{}"
    });

    expect(store.listPending("t1", "u2", "c1")).toEqual([]);
    expect(store.getByAskUserId("t1", "u2", "c1", pending.askUserId)).toBeNull();
    expect(store.decide("t1", "u2", "c1", "exec-1", "call-1", {
      action: "reject",
      respondedAt: "2026-07-12T00:00:00.000Z"
    })).toBe(false);
    expect(store.listPending("t1", "u1", "c1")).toHaveLength(1);
    rmSync(TEST_DIR, { recursive: true, force: true });
  });
});
