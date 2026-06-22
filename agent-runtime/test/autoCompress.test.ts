import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createServer } from "../src/server";
import * as compression from "../src/compression";
import type { JavaClient, PolicyEvaluateRequest, PolicyEvaluateResponse } from "../src/javaClient";
import type { AgentMessage, CatalogResponse, ModelChatRequest, ToolCallRequest, TraceEvent } from "../src/types";

class FakeJavaClient implements JavaClient {
  modelRequests: ModelChatRequest[] = [];

  async getCatalog() {
    return { catalogVersion: "v1", catalogHash: "h1", tools: [] } as CatalogResponse;
  }

  async chat(request: ModelChatRequest) {
    this.modelRequests.push(request);
    return {
      requestId: request.requestId,
      conversationId: request.conversationId,
      rawProvider: "mock",
      message: { role: "assistant", content: "reply" } as AgentMessage
    };
  }

  async executeTool(_r: ToolCallRequest) {
    return { requestId: "", conversationId: "", toolCallId: "", toolName: "", result: {}, status: "ok" as const };
  }

  async postTrace(_e: TraceEvent) {}

  async evaluatePolicy(_r: PolicyEvaluateRequest): Promise<PolicyEvaluateResponse> {
    return { requestId: "", conversationId: "", decisions: [] };
  }

  async request(path: string) {
    if (path === "/api/v1/model/compress") return { summary: "compressed summary" };
    return {};
  }
}

describe("auto-compress in agentLoop", () => {
  let fakeClient: FakeJavaClient;

  beforeEach(() => {
    fakeClient = new FakeJavaClient();
    delete process.env.COMPRESSION_AUTO;
    delete process.env.COMPRESSION_THRESHOLD;
    process.env.HISTORY_STORE = "memory";
    process.env.HISTORY_DATA_DIR = "/tmp/openharness-test-autocompress";
  });

  afterEach(() => {
    delete process.env.COMPRESSION_AUTO;
    delete process.env.COMPRESSION_THRESHOLD;
    delete process.env.HISTORY_STORE;
    delete process.env.HISTORY_DATA_DIR;
    vi.restoreAllMocks();
  });

  it("triggers compress exactly once per run when over threshold", async () => {
    // Force shouldCompress to return true so compress fires on the single request
    vi.spyOn(compression, "shouldCompress").mockReturnValue(true);
    const compressSpy = vi.spyOn(compression, "compress").mockResolvedValue(undefined);

    const app = await createServer({ javaClient: fakeClient });
    await app.inject({
      method: "POST",
      url: "/api/v1/agent/chat",
      headers: { "x-user-id": "u1", "x-tenant-id": "t1", "x-trace-id": "tr1", "x-request-id": "r1" },
      payload: { conversationId: "conv-auto", message: "hello" }
    });

    expect(compressSpy).toHaveBeenCalledTimes(1);
  });

  it("does not compress when COMPRESSION_AUTO=false", async () => {
    process.env.COMPRESSION_AUTO = "false";
    vi.spyOn(compression, "shouldCompress").mockReturnValue(true);
    const compressSpy = vi.spyOn(compression, "compress").mockResolvedValue(undefined);

    const app = await createServer({ javaClient: fakeClient });
    await app.inject({
      method: "POST",
      url: "/api/v1/agent/chat",
      headers: { "x-user-id": "u1", "x-tenant-id": "t1", "x-trace-id": "tr1", "x-request-id": "r1" },
      payload: { conversationId: "conv-disabled", message: "hello" }
    });

    expect(compressSpy).not.toHaveBeenCalled();
  });

  it("does not block response when compress fails", async () => {
    vi.spyOn(compression, "shouldCompress").mockReturnValue(true);
    vi.spyOn(compression, "compress").mockRejectedValue(new Error("compress endpoint down"));
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    const app = await createServer({ javaClient: fakeClient });
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/agent/chat",
      headers: { "x-user-id": "u1", "x-tenant-id": "t1", "x-trace-id": "tr1", "x-request-id": "r1" },
      payload: { conversationId: "conv-fail", message: "hello" }
    });

    expect(res.statusCode).toBe(200);
    expect(warnSpy).toHaveBeenCalled();
  });
});
