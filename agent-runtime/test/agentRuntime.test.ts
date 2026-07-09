import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createServer } from "../src/server";
import type { JavaClient } from "../src/javaClient";
import type {
  AgentMessage,
  CatalogResponse,
  ModelChatRequest,
  ToolCallRequest,
  TraceEvent
} from "../src/types";

class FakeJavaClient implements JavaClient {
  catalogCalls = 0;
  modelRequests: ModelChatRequest[] = [];
  toolRequests: ToolCallRequest[] = [];
  traceEvents: TraceEvent[] = [];
  lastHeaders: Record<string, string> = {};

  catalog: CatalogResponse = {
    catalogVersion: "2026-05-19T10:00:00Z",
    catalogHash: "sha256:p0a-catalog",
    tools: [
      {
        name: "get_current_time",
        description: "Get current time",
        parameters: { type: "object", properties: { timezone: { type: "string" } }, required: ["timezone"] },
        catalogVersion: "2026-05-19T10:00:00Z",
        catalogHash: "sha256:p0a-catalog",
        permission: "safe",
        isReadOnly: true,
        isDestructive: false,
        requiresApproval: false,
        isConcurrencySafe: true
      }
    ]
  };

  async getCatalog(headers: Record<string, string>) {
    this.catalogCalls += 1;
    this.lastHeaders = headers;
    return this.catalog;
  }

  async chat(request: ModelChatRequest, headers: Record<string, string>) {
    this.modelRequests.push(request);
    this.lastHeaders = headers;
    const last = request.messages[request.messages.length - 1];
    if (last?.role === "tool") {
      return {
        requestId: request.requestId,
        conversationId: request.conversationId,
        rawProvider: "mock",
        message: { role: "assistant", content: "当前时间是 2026-05-20T11:00:00+08:00" } as AgentMessage,
        usage: {
          promptTokens: 100,
          completionTokens: 20,
          totalTokens: 120,
          costUsdMicros: 42
        }
      };
    }
    return {
      requestId: request.requestId,
      conversationId: request.conversationId,
      rawProvider: "mock",
      message: {
        role: "assistant",
        content: "",
        toolCalls: [{ id: "call-current-time", name: "get_current_time", argumentsRaw: "{\"timezone\":\"Asia/Shanghai\"}" }],
        reasoningBlocks: [{ type: "thinking", signature: "sig-001", providerExtra: true }]
      } as AgentMessage
    };
  }

  async executeTool(request: ToolCallRequest, headers: Record<string, string>) {
    this.toolRequests.push(request);
    this.lastHeaders = headers;
    return {
      requestId: request.requestId,
      conversationId: request.conversationId,
      toolCallId: request.toolCallId,
      toolName: request.toolName,
      status: "ok" as const,
      result: { isoTime: "2026-05-20T11:00:00+08:00", timezone: request.arguments.timezone }
    };
  }

  async postTrace(event: TraceEvent, headers: Record<string, string>) {
    this.traceEvents.push(event);
    this.lastHeaders = headers;
  }

  async evaluatePolicy(request: unknown, _headers: Record<string, string>) {
    const req = request as { requestId: string; conversationId: string; toolCalls: { id: string }[] };
    return {
      requestId: req.requestId,
      conversationId: req.conversationId,
      decisions: req.toolCalls.map(tc => ({ toolCallId: tc.id, decision: "ALLOW", source: "NONE" }))
    };
  }
}

function tempAgentDefinitionsDir(): string {
  return mkdtempSync(join(tmpdir(), "openharness-agent-runtime-definitions-"));
}

describe("agent runtime", () => {
  afterEach(() => {
    delete process.env.FRONTEND_URL;
  });

  it("completes a synchronous model to tool to final answer loop", async () => {
    const javaClient = new FakeJavaClient();
    const app = await createServer({ javaClient });

    const response = await app.inject({
      method: "POST",
      url: "/api/v1/agent/chat",
      headers: {
        "content-type": "application/json",
        "x-user-id": "user-001",
        "x-tenant-id": "tenant-001",
        "x-trace-id": "trace-001",
        "x-request-id": "req-001"
      },
      payload: { conversationId: "conv-001", message: "现在几点？" }
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers["x-trace-id"]).toBe("trace-001");
    expect(response.json().answer).toContain("当前时间");
    expect(response.json().usage).toEqual({ costUsdMicros: 42 });
    expect(javaClient.toolRequests[0]).toMatchObject({
      toolCallId: "call-current-time",
      toolName: "get_current_time",
      arguments: { timezone: "Asia/Shanghai" },
      catalogVersion: "2026-05-19T10:00:00Z",
      catalogHash: "sha256:p0a-catalog",
      idempotencyKey: "req-001:call-current-time"
    });
    expect(javaClient.modelRequests.length).toBeGreaterThanOrEqual(1);
  });

  it("generates trace id when frontend omits it and reuses provided request id", async () => {
    const javaClient = new FakeJavaClient();
    const app = await createServer({ javaClient });

    const response = await app.inject({
      method: "POST",
      url: "/api/v1/agent/chat",
      headers: { "content-type": "application/json", "x-user-id": "user-001", "x-tenant-id": "tenant-001", "x-request-id": "req-002" },
      payload: { conversationId: "conv-002", message: "现在几点？" }
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers["x-trace-id"]).toBeTruthy();
    expect(response.headers["x-request-id"]).toBe("req-002");
  });

  it("propagates service auth and identity headers to Java", async () => {
    const javaClient = new FakeJavaClient();
    const app = await createServer({ javaClient, serviceToken: "dev-service-token" });

    await app.inject({
      method: "POST",
      url: "/api/v1/agent/chat",
      headers: { "content-type": "application/json", "x-user-id": "user-001", "x-tenant-id": "tenant-001", "x-trace-id": "trace-003", "x-request-id": "req-003" },
      payload: { conversationId: "conv-003", message: "现在几点？" }
    });

    expect(javaClient.lastHeaders).toMatchObject({
      Authorization: "Bearer dev-service-token",
      "X-User-Id": "user-001",
      "X-Tenant-Id": "tenant-001",
      "X-Trace-Id": "trace-003",
      "X-Request-Id": "req-003"
    });
  });

  it("freezes catalog per tenant conversation", async () => {
    const javaClient = new FakeJavaClient();
    const app = await createServer({ javaClient });

    for (const message of ["现在几点？", "再看一次"]) {
      await app.inject({
        method: "POST",
        url: "/api/v1/agent/chat",
        headers: { "content-type": "application/json", "x-user-id": "user-001", "x-tenant-id": "tenant-001", "x-trace-id": "trace-004", "x-request-id": crypto.randomUUID() },
        payload: { conversationId: "conv-004", message }
      });
    }

    expect(javaClient.catalogCalls).toBe(1);
  });

  it("turns invalid argumentsRaw into model visible parse error tool result", async () => {
    const javaClient = new FakeJavaClient();
    javaClient.chat = async (request: ModelChatRequest) => {
      javaClient.modelRequests.push(request);
      if (request.messages[request.messages.length - 1]?.role === "tool") {
        return { requestId: request.requestId, conversationId: request.conversationId, rawProvider: "mock", message: { role: "assistant", content: "参数无法解析。" } };
      }
      return {
        requestId: request.requestId,
        conversationId: request.conversationId,
        rawProvider: "mock",
        message: { role: "assistant", content: "", toolCalls: [{ id: "bad-call", name: "get_current_time", argumentsRaw: "{bad json" }] }
      };
    };
    const app = await createServer({ javaClient });

    await app.inject({
      method: "POST",
      url: "/api/v1/agent/chat",
      headers: { "content-type": "application/json", "x-user-id": "user-001", "x-tenant-id": "tenant-001" },
      payload: { conversationId: "conv-005", message: "现在几点？" }
    });

    expect(javaClient.toolRequests).toHaveLength(0);
    expect(javaClient.modelRequests[1]?.messages.at(-1)).toMatchObject({
      role: "tool",
      toolCallId: "bad-call",
      content: "MODEL_TOOL_PARSE_ERROR"
    });
  });

  it("sends reasoning blocks unchanged on the next Java model request", async () => {
    const javaClient = new FakeJavaClient();
    const app = await createServer({ javaClient });

    await app.inject({
      method: "POST",
      url: "/api/v1/agent/chat",
      headers: { "content-type": "application/json", "x-user-id": "user-001", "x-tenant-id": "tenant-001" },
      payload: { conversationId: "conv-006", message: "现在几点？" }
    });

    const assistantWithReasoning = javaClient.modelRequests[1]?.messages.find(
      (message) => message.role === "assistant" && message.reasoningBlocks !== undefined
    );
    expect(assistantWithReasoning?.reasoningBlocks).toEqual([
      { type: "thinking", signature: "sig-001", providerExtra: true }
    ]);
  });

  it("starts with default agent definition when definitions directory is missing", async () => {
    const dir = join(tempAgentDefinitionsDir(), "missing");
    const app = await createServer({ javaClient: new FakeJavaClient(), disableMcp: true, agentDefinitionsDir: dir });

    try {
      const response = await app.inject({
        method: "POST",
        url: "/api/v1/agent/chat",
        payload: { conversationId: "conv-agent-definition-default", message: "hello" }
      });

      expect(response.statusCode).toBe(200);
      expect(response.json().conversationId).toBe("conv-agent-definition-default");
    } finally {
      await app.close();
    }
  });

  it("fails startup on malformed agent definition", async () => {
    const dir = tempAgentDefinitionsDir();
    try {
      writeFileSync(join(dir, "bad.json"), "{\"agentId\":");

      let startupError: unknown;
      const app = await createServer({ javaClient: new FakeJavaClient(), disableMcp: true, agentDefinitionsDir: dir })
        .catch((error: unknown) => {
          startupError = error;
          return undefined;
        });
      await app?.close();

      expect(startupError).toBeInstanceOf(Error);
      expect(String(startupError)).toMatch(/Failed to parse agent definition/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("uses selected agent definition prompt metadata for sync chat", async () => {
    const javaClient = new FakeJavaClient();
    const dir = tempAgentDefinitionsDir();
    try {
      writeFileSync(join(dir, "support.json"), JSON.stringify({
        agentId: "support-agent",
        promptRef: "openharness-default@v1",
        tools: ["get_current_time"]
      }));
      const app = await createServer({ javaClient, disableMcp: true, agentDefinitionsDir: dir });

      const response = await app.inject({
        method: "POST",
        url: "/api/v1/agent/chat",
        headers: { "content-type": "application/json", "x-user-id": "user-001", "x-tenant-id": "tenant-001" },
        payload: { conversationId: "conv-agent-selection", message: "hello", agentId: "support-agent" }
      });

      expect(response.statusCode).toBe(200);
      expect(javaClient.modelRequests[0]?.messages[0]).toMatchObject({
        role: "system"
      });
      expect(javaClient.modelRequests[0]?.meta).toMatchObject({
        promptId: "openharness-default",
        promptVersion: "v1",
        agentId: "support-agent",
        agentPromptRef: "openharness-default@v1",
        agentToolMode: "allow_list",
        agentAllowedTools: ["get_current_time"],
        modelVisibleTools: ["get_current_time"]
      });
      expect(javaClient.modelRequests[0]?.messages).not.toContainEqual(expect.objectContaining({
        content: expect.stringContaining("support-agent")
      }));
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("preserves default agent definition when sync chat omits agentId", async () => {
    const javaClient = new FakeJavaClient();
    const app = await createServer({ javaClient, disableMcp: true });

    const response = await app.inject({
      method: "POST",
      url: "/api/v1/agent/chat",
      headers: { "content-type": "application/json", "x-user-id": "user-001", "x-tenant-id": "tenant-001" },
      payload: { conversationId: "conv-agent-selection-default", message: "hello" }
    });

    expect(response.statusCode).toBe(200);
    expect(javaClient.modelRequests[0]?.model).toBe("default");
    expect(javaClient.modelRequests[0]?.meta).toMatchObject({
      promptId: "openharness-default",
      promptVersion: "v1",
      agentId: "default-agent",
      agentPromptRef: "openharness-default@v1",
      agentToolMode: "default_full",
      agentAllowedTools: [],
      modelVisibleTools: ["get_current_time"]
    });
  });

  it("uses selected agent definition model for sync chat model requests", async () => {
    const javaClient = new FakeJavaClient();
    javaClient.chat = async (request: ModelChatRequest, headers: Record<string, string>) => {
      javaClient.modelRequests.push(request);
      javaClient.lastHeaders = headers;
      return {
        requestId: request.requestId,
        conversationId: request.conversationId,
        rawProvider: "mock",
        message: { role: "assistant", content: "done" } as AgentMessage
      };
    };
    const dir = tempAgentDefinitionsDir();
    try {
      writeFileSync(join(dir, "fast-model-agent.json"), JSON.stringify({
        agentId: "fast-model-agent",
        promptRef: "openharness-default@v1",
        tools: ["get_current_time"],
        model: "fast-model"
      }));
      const app = await createServer({ javaClient, disableMcp: true, agentDefinitionsDir: dir });

      const response = await app.inject({
        method: "POST",
        url: "/api/v1/agent/chat",
        headers: { "content-type": "application/json", "x-user-id": "user-001", "x-tenant-id": "tenant-001" },
        payload: { conversationId: "conv-agent-model-selection", message: "hello", agentId: "fast-model-agent" }
      });

      expect(response.statusCode).toBe(200);
      expect(javaClient.modelRequests[0]?.model).toBe("fast-model");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("forwards unknown definition model ids to Java without route validation", async () => {
    const javaClient = new FakeJavaClient();
    javaClient.chat = async (request: ModelChatRequest, headers: Record<string, string>) => {
      javaClient.modelRequests.push(request);
      javaClient.lastHeaders = headers;
      return {
        requestId: request.requestId,
        conversationId: request.conversationId,
        rawProvider: "mock",
        message: { role: "assistant", content: "done" } as AgentMessage
      };
    };
    const dir = tempAgentDefinitionsDir();
    try {
      writeFileSync(join(dir, "unknown-model-agent.json"), JSON.stringify({
        agentId: "unknown-model-agent",
        promptRef: "openharness-default@v1",
        tools: ["get_current_time"],
        model: "unknown-logical-model"
      }));
      const app = await createServer({ javaClient, disableMcp: true, agentDefinitionsDir: dir });

      const response = await app.inject({
        method: "POST",
        url: "/api/v1/agent/chat",
        headers: { "content-type": "application/json", "x-user-id": "user-001", "x-tenant-id": "tenant-001" },
        payload: { conversationId: "conv-agent-model-selection-unknown", message: "hello", agentId: "unknown-model-agent" }
      });

      expect(response.statusCode).toBe(200);
      expect(javaClient.modelRequests[0]?.model).toBe("unknown-logical-model");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });


  it("rejects unknown agentId before sync execution starts", async () => {
    const javaClient = new FakeJavaClient();
    const app = await createServer({ javaClient, disableMcp: true });

    const response = await app.inject({
      method: "POST",
      url: "/api/v1/agent/chat",
      headers: { "content-type": "application/json", "x-user-id": "user-001", "x-tenant-id": "tenant-001" },
      payload: { conversationId: "conv-agent-selection-missing", message: "hello", agentId: "missing-agent" }
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({
      error: {
        errorClass: "AGENT_DEFINITION_NOT_FOUND",
        errorMessage: "Unknown agentId: missing-agent"
      }
    });
    expect(javaClient.catalogCalls).toBe(0);
    expect(javaClient.modelRequests).toHaveLength(0);
  });

  it("fails closed before Java model call when selected promptRef is unknown", async () => {
    const javaClient = new FakeJavaClient();
    const dir = tempAgentDefinitionsDir();
    try {
      writeFileSync(join(dir, "unknown-prompt.json"), JSON.stringify({
        agentId: "unknown-prompt-agent",
        promptRef: "missing-prompt@v1",
        tools: []
      }));
      const app = await createServer({ javaClient, disableMcp: true, agentDefinitionsDir: dir });

      const response = await app.inject({
        method: "POST",
        url: "/api/v1/agent/chat",
        headers: { "content-type": "application/json", "x-user-id": "user-001", "x-tenant-id": "tenant-001" },
        payload: { conversationId: "conv-agent-selection-bad-prompt", message: "hello", agentId: "unknown-prompt-agent" }
      });

      expect(response.statusCode).toBe(200);
      expect(response.json().stopReason).toBe("MODEL_ERROR");
      expect(javaClient.modelRequests).toHaveLength(0);
      expect(javaClient.catalogCalls).toBe(1);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("uses selected agent definition prompt metadata for stream chat", async () => {
    const javaClient = new FakeJavaClient();
    const dir = tempAgentDefinitionsDir();
    try {
      writeFileSync(join(dir, "stream-support.json"), JSON.stringify({
        agentId: "stream-support-agent",
        promptRef: "openharness-default@v1",
        tools: ["get_current_time"]
      }));
      const app = await createServer({ javaClient, disableMcp: true, agentDefinitionsDir: dir });

      const response = await app.inject({
        method: "POST",
        url: "/api/v1/agent/chat/stream",
        headers: { "content-type": "application/json", "x-user-id": "user-001", "x-tenant-id": "tenant-001" },
        payload: { conversationId: "conv-agent-selection-stream", message: "hello", agentId: "stream-support-agent" }
      });

      expect(response.statusCode).toBe(200);
      expect(javaClient.modelRequests[0]?.meta).toMatchObject({
        promptId: "openharness-default",
        promptVersion: "v1"
      });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("filters model-visible tools by selected agent definition", async () => {
    const javaClient = new FakeJavaClient();
    javaClient.catalog = {
      ...javaClient.catalog,
      tools: [
        ...javaClient.catalog.tools,
        {
          name: "echo",
          description: "Echo input",
          parameters: { type: "object", properties: {}, required: [] },
          catalogVersion: "2026-05-19T10:00:00Z",
          catalogHash: "sha256:p0a-catalog",
          permission: "safe",
          isReadOnly: true,
          isDestructive: false,
          requiresApproval: false,
          isConcurrencySafe: true
        }
      ]
    };
    javaClient.chat = async (request: ModelChatRequest, headers: Record<string, string>) => {
      javaClient.modelRequests.push(request);
      javaClient.lastHeaders = headers;
      return {
        requestId: request.requestId,
        conversationId: request.conversationId,
        rawProvider: "mock",
        message: { role: "assistant", content: "done" } as AgentMessage
      };
    };
    const dir = tempAgentDefinitionsDir();
    try {
      writeFileSync(join(dir, "echo-agent.json"), JSON.stringify({
        agentId: "echo-agent",
        promptRef: "openharness-default@v1",
        tools: ["echo"]
      }));
      const app = await createServer({ javaClient, disableMcp: true, agentDefinitionsDir: dir });

      const response = await app.inject({
        method: "POST",
        url: "/api/v1/agent/chat",
        headers: { "content-type": "application/json", "x-user-id": "user-001", "x-tenant-id": "tenant-001" },
        payload: { conversationId: "conv-agent-tool-filter", message: "hello", agentId: "echo-agent" }
      });

      expect(response.statusCode).toBe(200);
      expect(javaClient.modelRequests[0]?.tools.map(tool => tool.name)).toEqual(["echo"]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("preserves default-agent model-visible tools when agentId is omitted", async () => {
    const javaClient = new FakeJavaClient();
    javaClient.chat = async (request: ModelChatRequest, headers: Record<string, string>) => {
      javaClient.modelRequests.push(request);
      javaClient.lastHeaders = headers;
      return {
        requestId: request.requestId,
        conversationId: request.conversationId,
        rawProvider: "mock",
        message: { role: "assistant", content: "done" } as AgentMessage
      };
    };
    const app = await createServer({ javaClient, disableMcp: true });

    const response = await app.inject({
      method: "POST",
      url: "/api/v1/agent/chat",
      headers: { "content-type": "application/json", "x-user-id": "user-001", "x-tenant-id": "tenant-001" },
      payload: { conversationId: "conv-agent-tool-filter-default", message: "hello" }
    });

    expect(response.statusCode).toBe(200);
    expect(javaClient.modelRequests[0]?.tools.map(tool => tool.name)).toEqual(["get_current_time"]);
  });

  it("exposes no tools for a selected custom agent with an empty tools list", async () => {
    const javaClient = new FakeJavaClient();
    javaClient.chat = async (request: ModelChatRequest, headers: Record<string, string>) => {
      javaClient.modelRequests.push(request);
      javaClient.lastHeaders = headers;
      return {
        requestId: request.requestId,
        conversationId: request.conversationId,
        rawProvider: "mock",
        message: { role: "assistant", content: "done" } as AgentMessage
      };
    };
    const dir = tempAgentDefinitionsDir();
    try {
      writeFileSync(join(dir, "no-tools-agent.json"), JSON.stringify({
        agentId: "no-tools-agent",
        promptRef: "openharness-default@v1",
        tools: []
      }));
      const app = await createServer({ javaClient, disableMcp: true, agentDefinitionsDir: dir });

      const response = await app.inject({
        method: "POST",
        url: "/api/v1/agent/chat",
        headers: { "content-type": "application/json", "x-user-id": "user-001", "x-tenant-id": "tenant-001" },
        payload: { conversationId: "conv-agent-tool-filter-empty", message: "hello", agentId: "no-tools-agent" }
      });

      expect(response.statusCode).toBe(200);
      expect(javaClient.modelRequests[0]?.tools).toEqual([]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("ignores unknown definition tool names for model visibility", async () => {
    const javaClient = new FakeJavaClient();
    javaClient.chat = async (request: ModelChatRequest, headers: Record<string, string>) => {
      javaClient.modelRequests.push(request);
      javaClient.lastHeaders = headers;
      return {
        requestId: request.requestId,
        conversationId: request.conversationId,
        rawProvider: "mock",
        message: { role: "assistant", content: "done" } as AgentMessage
      };
    };
    const dir = tempAgentDefinitionsDir();
    try {
      writeFileSync(join(dir, "unknown-tool-agent.json"), JSON.stringify({
        agentId: "unknown-tool-agent",
        promptRef: "openharness-default@v1",
        tools: ["unknown_tool"]
      }));
      const app = await createServer({ javaClient, disableMcp: true, agentDefinitionsDir: dir });

      const response = await app.inject({
        method: "POST",
        url: "/api/v1/agent/chat",
        headers: { "content-type": "application/json", "x-user-id": "user-001", "x-tenant-id": "tenant-001" },
        payload: { conversationId: "conv-agent-tool-filter-unknown", message: "hello", agentId: "unknown-tool-agent" }
      });

      expect(response.statusCode).toBe(200);
      expect(javaClient.modelRequests[0]?.tools).toEqual([]);
      expect(javaClient.modelRequests[0]?.meta).toMatchObject({
        agentId: "unknown-tool-agent",
        agentToolMode: "allow_list",
        agentAllowedTools: ["unknown_tool"],
        modelVisibleTools: []
      });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("fails closed before policy and execution when model calls a tool outside selected definition", async () => {
    const javaClient = new FakeJavaClient();
    let policyCalls = 0;
    javaClient.evaluatePolicy = async () => {
      policyCalls += 1;
      return { requestId: "unused", conversationId: "unused", decisions: [] };
    };
    const dir = tempAgentDefinitionsDir();
    try {
      writeFileSync(join(dir, "echo-only-agent.json"), JSON.stringify({
        agentId: "echo-only-agent",
        promptRef: "openharness-default@v1",
        tools: ["echo"]
      }));
      const app = await createServer({ javaClient, disableMcp: true, agentDefinitionsDir: dir });

      const response = await app.inject({
        method: "POST",
        url: "/api/v1/agent/chat",
        headers: { "content-type": "application/json", "x-user-id": "user-001", "x-tenant-id": "tenant-001" },
        payload: { conversationId: "conv-agent-tool-filter-deny", message: "hello", agentId: "echo-only-agent" }
      });

      expect(response.statusCode).toBe(200);
      expect(response.json().stopReason).toBe("POLICY_DENY");
      expect(policyCalls).toBe(0);
      expect(javaClient.toolRequests).toHaveLength(0);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("adds selected agentId to runtime trace events", async () => {
    const javaClient = new FakeJavaClient();
    const dir = tempAgentDefinitionsDir();
    try {
      writeFileSync(join(dir, "trace-agent.json"), JSON.stringify({
        agentId: "trace-agent",
        promptRef: "openharness-default@v1",
        tools: ["get_current_time"]
      }));
      const app = await createServer({ javaClient, disableMcp: true, agentDefinitionsDir: dir });

      const response = await app.inject({
        method: "POST",
        url: "/api/v1/agent/chat",
        headers: { "content-type": "application/json", "x-user-id": "user-001", "x-tenant-id": "tenant-001" },
        payload: { conversationId: "conv-agent-trace", message: "现在几点？", agentId: "trace-agent" }
      });

      expect(response.statusCode).toBe(200);
      expect(javaClient.traceEvents.length).toBeGreaterThan(0);
      expect(javaClient.traceEvents.every(event => event.agentId === "trace-agent")).toBe(true);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

});
