import { rmSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { createServer } from "../src/server";
import { JsonFileApprovalStore } from "../src/approvalStore";
import { InMemoryExecutionStateStore } from "../src/executionStateStore";
import type { JavaClient, PolicyEvaluateRequest, PolicyEvaluateResponse } from "../src/javaClient";
import type { CatalogResponse, ModelChatRequest, ToolCallRequest, TraceEvent } from "../src/types";

class StubJavaClient implements JavaClient {
  async getCatalog(): Promise<CatalogResponse> {
    return { catalogVersion: "v1", catalogHash: "h1", tools: [] };
  }
  async chat(request: ModelChatRequest) {
    return {
      requestId: request.requestId,
      conversationId: request.conversationId,
      rawProvider: "mock",
      message: { role: "assistant" as const, content: "ok" }
    };
  }
  async executeTool(_request: ToolCallRequest) {
    return { requestId: "", conversationId: "", toolCallId: "", toolName: "", status: "ok" as const, result: {} };
  }
  async postTrace(_event: TraceEvent) {}
  async evaluatePolicy(request: PolicyEvaluateRequest): Promise<PolicyEvaluateResponse> {
    return { requestId: request.requestId, conversationId: request.conversationId, decisions: [] };
  }
}

const TEST_DIR = "/tmp/openharness-approval-api-test";

describe("approval API", () => {
  it("decides a pending approval through the execution-scoped endpoint", async () => {
    rmSync(TEST_DIR, { recursive: true, force: true });
    const approvalStore = new JsonFileApprovalStore(TEST_DIR);
    const executionStateStore = new InMemoryExecutionStateStore();
    executionStateStore.create({ tenantId: "t1", conversationId: "c1", executionId: "exec-1" });
    executionStateStore.transition("exec-1", "waiting_approval");
    approvalStore.createPending({
      tenantId: "t1",
      conversationId: "c1",
      executionId: "exec-1",
      toolCallId: "call-1",
      toolName: "submit_payment",
      argumentsRaw: "{}"
    });
    const app = await createServer({ javaClient: new StubJavaClient(), disableMcp: true, approvalStore, executionStateStore });

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/sessions/c1/executions/exec-1/approvals/call-1",
      headers: { "x-tenant-id": "t1", "content-type": "application/json" },
      payload: { action: "approve" }
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ executionId: "exec-1", toolCallId: "call-1", status: "approved" });
    expect(approvalStore.listPending("t1", "c1")).toEqual([]);
    await app.close();
    rmSync(TEST_DIR, { recursive: true, force: true });
  });

  it("routes the legacy ask-user reply endpoint to ApprovalStore by askUserId", async () => {
    rmSync(TEST_DIR, { recursive: true, force: true });
    const approvalStore = new JsonFileApprovalStore(TEST_DIR);
    const executionStateStore = new InMemoryExecutionStateStore();
    executionStateStore.create({ tenantId: "t1", conversationId: "c1", executionId: "exec-1" });
    executionStateStore.transition("exec-1", "waiting_approval");
    const pending = approvalStore.createPending({
      tenantId: "t1",
      conversationId: "c1",
      executionId: "exec-1",
      toolCallId: "call-legacy",
      toolName: "submit_payment",
      argumentsRaw: "{}"
    });
    const app = await createServer({ javaClient: new StubJavaClient(), disableMcp: true, approvalStore, executionStateStore });

    const res = await app.inject({
      method: "POST",
      url: `/api/v1/agent/ask-user/${pending.askUserId}/reply`,
      headers: { "content-type": "application/json" },
      payload: { askUserId: pending.askUserId, action: "reject", respondedAt: "2026-06-04T00:00:00.000Z" }
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ askUserId: pending.askUserId, status: "rejected" });
    expect(approvalStore.listPending("t1", "c1")).toEqual([]);
    await app.close();
    rmSync(TEST_DIR, { recursive: true, force: true });
  });

  it("rejects same-tenant cross-user approval decisions without leaking existence", async () => {
    rmSync(TEST_DIR, { recursive: true, force: true });
    const approvalStore = new JsonFileApprovalStore(TEST_DIR);
    const executionStateStore = new InMemoryExecutionStateStore();
    executionStateStore.create({ tenantId: "t1", conversationId: "c1", executionId: "exec-1" });
    executionStateStore.transition("exec-1", "waiting_approval");
    approvalStore.createPending({
      tenantId: "t1",
      userId: "u1",
      conversationId: "c1",
      executionId: "exec-1",
      toolCallId: "call-1",
      toolName: "submit_payment",
      argumentsRaw: "{}",
      approvalToken: "raw-secret-token"
    });
    const app = await createServer({ javaClient: new StubJavaClient(), disableMcp: true, approvalStore, executionStateStore });

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/sessions/c1/executions/exec-1/approvals/call-1",
      headers: { "x-tenant-id": "t1", "x-user-id": "u2", "content-type": "application/json" },
      payload: { action: "approve" }
    });

    expect(res.statusCode).toBe(404);
    expect(res.payload).not.toContain("raw-secret-token");
    expect(approvalStore.listPending("t1", "c1")).toHaveLength(1);
    await app.close();
    rmSync(TEST_DIR, { recursive: true, force: true });
  });

  it("does not expose raw approval tokens in pending approval API shapes", async () => {
    rmSync(TEST_DIR, { recursive: true, force: true });
    const approvalStore = new JsonFileApprovalStore(TEST_DIR);
    const executionStateStore = new InMemoryExecutionStateStore();
    executionStateStore.create({ tenantId: "t1", conversationId: "c1", executionId: "exec-1" });
    executionStateStore.transition("exec-1", "waiting_approval");
    approvalStore.createPending({
      tenantId: "t1",
      userId: "u1",
      conversationId: "c1",
      executionId: "exec-1",
      toolCallId: "call-secret",
      toolName: "submit_payment",
      argumentsRaw: "{}",
      approvalToken: "raw-secret-token"
    });
    const app = await createServer({ javaClient: new StubJavaClient(), disableMcp: true, approvalStore, executionStateStore });

    const res = await app.inject({
      method: "GET",
      url: "/api/v1/sessions/c1",
      headers: { "x-tenant-id": "t1", "x-user-id": "u1" }
    });

    expect(res.statusCode).toBe(200);
    expect(res.payload).toContain("call-secret");
    expect(res.payload).not.toContain("raw-secret-token");
    expect(res.payload).not.toContain("approvalToken");
    await app.close();
    rmSync(TEST_DIR, { recursive: true, force: true });
  });
});
