import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { existsSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { createServer } from "../../agent-runtime/src/server";
import type { JavaClient, PolicyEvaluateRequest, PolicyEvaluateResponse } from "../../agent-runtime/src/javaClient";
import type { AgentMessage, CatalogResponse, ModelChatRequest, ToolCallRequest, TraceEvent } from "../../agent-runtime/src/types";

const TMP = "/tmp/openharness-p1b-integration";

class StubJava implements JavaClient {
  async getCatalog(): Promise<CatalogResponse> { return { catalogVersion: "v", catalogHash: "h", tools: [] }; }
  async chat(req: ModelChatRequest) {
    return {
      requestId: req.requestId, conversationId: req.conversationId, rawProvider: "mock",
      message: { role: "assistant", content: "persisted reply" } as AgentMessage
    };
  }
  async executeTool(_r: ToolCallRequest) {
    return { requestId: "", conversationId: "", toolCallId: "", toolName: "", result: {}, status: "ok" as const };
  }
  async postTrace(_e: TraceEvent) {}
  async evaluatePolicy(_r: PolicyEvaluateRequest): Promise<PolicyEvaluateResponse> {
    return { requestId: "", conversationId: "", decisions: [] };
  }
}

describe("P1b persistence integration", () => {
  beforeEach(() => {
    rmSync(TMP, { recursive: true, force: true });
    process.env.HISTORY_STORE = "file";
    process.env.HISTORY_DATA_DIR = TMP;
    process.env.COMPRESSION_AUTO = "false";
  });
  afterEach(() => {
    rmSync(TMP, { recursive: true, force: true });
    delete process.env.HISTORY_STORE;
    delete process.env.HISTORY_DATA_DIR;
    delete process.env.COMPRESSION_AUTO;
  });

  it("writes history JSON file after a chat completes", async () => {
    const app = await createServer({ javaClient: new StubJava(), disableMcp: true });
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/agent/chat",
      headers: { "x-user-id": "u", "x-tenant-id": "t-p1b", "x-trace-id": "tr", "x-request-id": "rq" },
      payload: { conversationId: "conv-p1b", message: "first user message" }
    });
    expect(res.statusCode).toBe(200);

    const path = join(TMP, "t-p1b", "u", "conv-p1b.json");
    expect(existsSync(path)).toBe(true);

    const data = JSON.parse(readFileSync(path, "utf-8"));
    expect(data.tenantId).toBe("t-p1b");
    expect(data.userId).toBe("u");
    expect(data.conversationId).toBe("conv-p1b");
    expect(data.messages.length).toBeGreaterThanOrEqual(2);
    expect(data.messages[0].role).toBe("user");
    expect(data.messages[0].content).toBe("first user message");
    await app.close();
  });

  it("isolates same-tenant same-conversation history in both directions without existence leakage", async () => {
    const app = await createServer({ javaClient: new StubJava(), disableMcp: true });
    const request = (userId: string, message: string) => app.inject({
      method: "POST",
      url: "/api/v1/agent/chat",
      headers: {
        "x-user-id": userId,
        "x-tenant-id": "t-p1b-isolation",
        "x-trace-id": `trace-${userId}`,
        "x-request-id": `request-${userId}`
      },
      payload: { conversationId: "shared-conversation", message }
    });

    expect((await request("user-a", "message from user a")).statusCode).toBe(200);

    const userBBeforeWrite = await app.inject({
      method: "GET",
      url: "/api/v1/sessions/shared-conversation",
      headers: {
        "x-user-id": "user-b",
        "x-tenant-id": "t-p1b-isolation",
        "x-trace-id": "trace-user-b-read",
        "x-request-id": "request-user-b-read"
      }
    });
    expect(userBBeforeWrite.statusCode).toBe(404);
    expect(userBBeforeWrite.json().error.errorClass).toBe("SESSION_NOT_FOUND");

    expect((await request("user-b", "message from user b")).statusCode).toBe(200);

    const userAPath = join(TMP, "t-p1b-isolation", "user-a", "shared-conversation.json");
    const userBPath = join(TMP, "t-p1b-isolation", "user-b", "shared-conversation.json");
    expect(existsSync(userAPath)).toBe(true);
    expect(existsSync(userBPath)).toBe(true);

    const userAData = JSON.parse(readFileSync(userAPath, "utf-8"));
    const userBData = JSON.parse(readFileSync(userBPath, "utf-8"));
    expect(userAData).toMatchObject({ tenantId: "t-p1b-isolation", userId: "user-a", conversationId: "shared-conversation" });
    expect(userBData).toMatchObject({ tenantId: "t-p1b-isolation", userId: "user-b", conversationId: "shared-conversation" });
    expect(userAData.messages.map((message: { content: string }) => message.content)).not.toContain("message from user b");
    expect(userBData.messages.map((message: { content: string }) => message.content)).not.toContain("message from user a");

    const userARead = await app.inject({
      method: "GET",
      url: "/api/v1/sessions/shared-conversation",
      headers: {
        "x-user-id": "user-a",
        "x-tenant-id": "t-p1b-isolation",
        "x-trace-id": "trace-user-a-read",
        "x-request-id": "request-user-a-read"
      }
    });
    const userBRead = await app.inject({
      method: "GET",
      url: "/api/v1/sessions/shared-conversation",
      headers: {
        "x-user-id": "user-b",
        "x-tenant-id": "t-p1b-isolation",
        "x-trace-id": "trace-user-b-read-after-write",
        "x-request-id": "request-user-b-read-after-write"
      }
    });
    expect(userARead.statusCode).toBe(200);
    expect(userBRead.statusCode).toBe(200);
    expect(userARead.json().messages.map((message: { content: string }) => message.content)).not.toContain("message from user b");
    expect(userBRead.json().messages.map((message: { content: string }) => message.content)).not.toContain("message from user a");
    await app.close();
  });
});
