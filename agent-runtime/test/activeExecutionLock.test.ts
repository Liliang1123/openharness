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
      message: { role: "assistant" as const, content: "done" }
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

describe("active execution lock", () => {
  it("getActive returns the running execution for the same tenant and conversation", () => {
    const store = new InMemoryExecutionStateStore();
    const state = store.create({ tenantId: "t1", conversationId: "c1", executionId: "exec-1" });

    expect(store.getActive("t1", "c1")).toEqual(state);
    expect(store.getActive("t1", "other")).toBeNull();

    store.transitionToTerminal("exec-1", "completed", "FINAL_ANSWER");
    expect(store.getActive("t1", "c1")).toBeNull();
  });

  it("rejects a second stream request for a running conversation with EXECUTION_ALREADY_RUNNING", async () => {
    const executionStateStore = new InMemoryExecutionStateStore();
    executionStateStore.create({ tenantId: "t1", conversationId: "c1", executionId: "exec-running" });
    const app = await createServer({
      javaClient: new StubJavaClient(),
      disableMcp: true,
      executionStateStore
    });

    const second = await app.inject({
      method: "POST",
      url: "/api/v1/agent/chat/stream",
      headers: { "x-tenant-id": "t1", "x-user-id": "u1" },
      payload: { conversationId: "c1", message: "second" }
    });

    expect(second.statusCode).toBe(409);
    const body = second.json();
    expect(body.error.errorClass).toBe("EXECUTION_ALREADY_RUNNING");
    expect(body.executionId).toBe("exec-running");

    await app.close();
  });

  it("rejects a new request for a waiting approval conversation with pending approvals", async () => {
    const executionStateStore = new InMemoryExecutionStateStore();
    executionStateStore.create({ tenantId: "t1", conversationId: "c1", executionId: "exec-waiting" });
    executionStateStore.transition("exec-waiting", "waiting_approval");
    const approvalStore = new JsonFileApprovalStore("/tmp/openharness-active-lock-approval-test");
    approvalStore.createPending({
      tenantId: "t1",
      conversationId: "c1",
      executionId: "exec-waiting",
      toolCallId: "call-1",
      toolName: "submit_payment",
      argumentsRaw: "{}"
    });
    const app = await createServer({
      javaClient: new StubJavaClient(),
      disableMcp: true,
      executionStateStore,
      approvalStore
    });

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/agent/chat",
      headers: { "x-tenant-id": "t1", "x-user-id": "u1" },
      payload: { conversationId: "c1", message: "new turn" }
    });

    expect(res.statusCode).toBe(409);
    expect(res.json().error.errorClass).toBe("EXECUTION_WAITING_APPROVAL");
    expect(res.json().executionId).toBe("exec-waiting");
    expect(res.json().pendingApprovals).toHaveLength(1);
    await app.close();
  });
});
