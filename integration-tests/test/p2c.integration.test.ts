import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { existsSync, readdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { createServer } from "../../agent-runtime/src/server";
import type { JavaClient, PolicyEvaluateRequest, PolicyEvaluateResponse } from "../../agent-runtime/src/javaClient";
import type { AgentMessage, CatalogResponse, ModelChatRequest, ToolCallRequest, TraceEvent } from "../../agent-runtime/src/types";

const TMP = "/tmp/openharness-p2c-integration";

class CompressJava implements JavaClient {
  async getCatalog(): Promise<CatalogResponse> { return { catalogVersion: "v", catalogHash: "h", tools: [] }; }
  async chat(req: ModelChatRequest) {
    return {
      requestId: req.requestId, conversationId: req.conversationId, rawProvider: "mock",
      message: { role: "assistant", content: "x".repeat(200) } as AgentMessage
    };
  }
  async executeTool(_r: ToolCallRequest) {
    return { requestId: "", conversationId: "", toolCallId: "", toolName: "", result: {}, status: "ok" as const };
  }
  async postTrace(_e: TraceEvent) {}
  async evaluatePolicy(_r: PolicyEvaluateRequest): Promise<PolicyEvaluateResponse> {
    return { requestId: "", conversationId: "", decisions: [] };
  }
  // compression.ts calls (javaClient as any).request("/api/v1/model/compress", ...)
  async request(_path: string) { return { summary: "compressed via stub" }; }
}

describe("P2c auto-compress integration", () => {
  beforeEach(() => {
    rmSync(TMP, { recursive: true, force: true });
    process.env.HISTORY_STORE = "file";
    process.env.HISTORY_DATA_DIR = TMP;
    process.env.COMPRESSION_AUTO = "true";
    process.env.COMPRESSION_THRESHOLD = "20"; // very low to ensure trigger
    process.env.KEEP_RECENT_MESSAGES = "2";
  });
  afterEach(() => {
    rmSync(TMP, { recursive: true, force: true });
    delete process.env.HISTORY_STORE;
    delete process.env.HISTORY_DATA_DIR;
    delete process.env.COMPRESSION_AUTO;
    delete process.env.COMPRESSION_THRESHOLD;
    delete process.env.KEEP_RECENT_MESSAGES;
  });

  it("creates chunk-1.md after long enough conversation", async () => {
    const app = await createServer({ javaClient: new CompressJava(), disableMcp: true });
    for (let i = 0; i < 6; i++) {
      await app.inject({
        method: "POST",
        url: "/api/v1/agent/chat",
        headers: { "x-user-id": "u", "x-tenant-id": "t-p2c", "x-trace-id": `tr${i}`, "x-request-id": `rq${i}` },
        payload: { conversationId: "conv-p2c", message: `lots of content here ${i} ${"y".repeat(50)}` }
      });
    }

    const tenantDir = join(TMP, "t-p2c");
    expect(existsSync(tenantDir)).toBe(true);
    const files = readdirSync(tenantDir);
    const chunkFiles = files.filter(f => f.startsWith("conv-p2c-chunk-") && f.endsWith(".md"));
    expect(chunkFiles.length).toBeGreaterThanOrEqual(1);
    expect(chunkFiles).toContain("conv-p2c-chunk-1.md");
    await app.close();
  });
});
