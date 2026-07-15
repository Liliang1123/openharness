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
    expect(data.conversationId).toBe("conv-p1b");
    expect(data.messages.length).toBeGreaterThanOrEqual(2);
    expect(data.messages[0].role).toBe("user");
    expect(data.messages[0].content).toBe("first user message");
    await app.close();
  });
});
