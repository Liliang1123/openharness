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

const TEST_DIR = "/tmp/openharness-approval-recovery-test";

describe("approval recovery via session GET", () => {
  it("returns activeExecution and pendingApprovals for a waiting approval session", async () => {
    rmSync(TEST_DIR, { recursive: true, force: true });
    process.env.HISTORY_STORE = "file";
    process.env.HISTORY_DATA_DIR = TEST_DIR;
    process.env.COMPRESSION_AUTO = "false";

    const approvalStore = new JsonFileApprovalStore(TEST_DIR);
    const executionStateStore = new InMemoryExecutionStateStore();
    const app = await createServer({ javaClient: new StubJavaClient(), disableMcp: true, approvalStore, executionStateStore });
    await app.inject({
      method: "POST",
      url: "/api/v1/agent/chat",
      headers: { "x-tenant-id": "t1", "x-user-id": "u1" },
      payload: { conversationId: "c1", message: "hello" }
    });

    executionStateStore.create({ tenantId: "t1", conversationId: "c1", executionId: "exec-1" });
    executionStateStore.transition("exec-1", "waiting_approval");
    approvalStore.createPending({
      tenantId: "t1",
      conversationId: "c1",
      executionId: "exec-1",
      toolCallId: "call-1",
      toolName: "submit_payment",
      argumentsRaw: "{\"amount\":100}",
      reason: "needs approval"
    });

    const res = await app.inject({
      method: "GET",
      url: "/api/v1/sessions/c1",
      headers: { "x-tenant-id": "t1" }
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().activeExecution).toMatchObject({ executionId: "exec-1", status: "waiting_approval" });
    expect(res.json().pendingApprovals).toHaveLength(1);
    expect(res.json().pendingApprovals[0]).toMatchObject({ toolCallId: "call-1", toolName: "submit_payment" });

    await app.close();
    delete process.env.HISTORY_STORE;
    delete process.env.HISTORY_DATA_DIR;
    delete process.env.COMPRESSION_AUTO;
    rmSync(TEST_DIR, { recursive: true, force: true });
  });
});
