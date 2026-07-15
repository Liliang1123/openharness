import { mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createProductionServer } from "../src/server";
import { createServer } from "../src/server";
import { openProductionRuntimeContext } from "../src/storage/productionRuntimeContext";
import { main } from "../src/productionEntrypoint";
import { acquireRuntimeSingletonLock } from "../src/storage/singletonLock";
import type { JavaClient } from "../src/javaClient";
import type { AgentMessage, CatalogResponse, ModelChatRequest, ToolCallRequest, TraceEvent } from "../src/types";
import { InMemoryHistoryStore } from "../src/history";
import { InMemoryMemoryStore } from "../src/memoryStore";
import { InMemoryRuntimeEventStore } from "../src/runtimeEventStore";
import { InMemoryExecutionStateStore } from "../src/executionStateStore";
import { InMemoryApprovalStore } from "../src/approvalStore";
import { McpRegistry } from "../src/mcpRegistry";

const workspaces: string[] = [];

function workspace() {
  const path = mkdtempSync(join(tmpdir(), "openharness-production-server-"));
  workspaces.push(path);
  return { path, databasePath: join(path, "runtime.sqlite") };
}

afterEach(() => {
  for (const path of workspaces.splice(0)) rmSync(path, { recursive: true, force: true });
});

describe("production server lifecycle", () => {
  it("requires an absolute database path and service token", async () => {
    await expect(createProductionServer({
      databasePath: "relative/runtime.sqlite",
      serviceToken: "service-token",
      javaClient: new FinalAnswerJavaClient()
    })).rejects.toThrow(/absolute/i);
    await expect(createProductionServer({
      databasePath: workspace().databasePath,
      serviceToken: "",
      javaClient: new FinalAnswerJavaClient()
    })).rejects.toThrow(/service token/i);
  });

  it("uses SQLite as sole production authority and releases the lock on close", async () => {
    const target = workspace();
    const app = await createProductionServer({
      databasePath: target.databasePath,
      serviceToken: "service-token",
      javaClient: new FinalAnswerJavaClient(),
      disableMcp: true
    });

    const response = await app.inject({
      method: "POST",
      url: "/api/v1/agent/chat",
      headers: {
        authorization: "Bearer service-token",
        "x-tenant-id": "tenant-a",
        "x-user-id": "user-a",
        "x-trace-id": "trace-a",
        "x-request-id": "request-a"
      },
      payload: { conversationId: "conversation-a", message: "hello" }
    });

    expect(response.statusCode).toBe(200);
    expect(readdirSync(target.path).filter(name => name.endsWith(".json"))).toEqual([]);
    await app.close();

    const lock = acquireRuntimeSingletonLock(`${target.databasePath}.lock`);
    lock.release();
  });

  it("refuses a second production server for the same database", async () => {
    const target = workspace();
    const first = await createProductionServer({
      databasePath: target.databasePath,
      serviceToken: "service-token",
      javaClient: new FinalAnswerJavaClient(),
      disableMcp: true
    });
    await expect(createProductionServer({
      databasePath: target.databasePath,
      serviceToken: "service-token",
      javaClient: new FinalAnswerJavaClient(),
      disableMcp: true
    })).rejects.toThrow(/lock/i);
    await first.close();
  });

  it("commits approval and abort API mutations before returning", async () => {
    const target = workspace();
    const context = openProductionRuntimeContext(target.databasePath);
    const approvalScope = {
      tenantId: "tenant-a",
      userId: "user-a",
      conversationId: "approval-conversation",
      executionId: "approval-execution",
      traceId: "trace-a",
      requestId: "request-a"
    };
    context.lifecycle.startExecution({ ...approvalScope, message: "hello" });
    context.lifecycle.enterApproval({
      ...approvalScope,
      approvalId: "approval-a",
      toolCallId: "tool-a",
      toolName: "submit_payment",
      argumentsRaw: "{}"
    });
    const abortScope = {
      ...approvalScope,
      conversationId: "abort-conversation",
      executionId: "abort-execution"
    };
    context.lifecycle.startExecution({ ...abortScope, message: "hello" });
    context.lifecycle.enterApproval({
      ...abortScope,
      approvalId: "approval-abort",
      toolCallId: "tool-abort",
      toolName: "qualification_echo",
      argumentsRaw: "{}"
    });
    const app = await createServer({
      runtimeContext: context,
      serviceToken: "service-token",
      requireServiceAuth: true,
      javaClient: new FinalAnswerJavaClient(),
      disableMcp: true
    });
    const headers = {
      authorization: "Bearer service-token",
      "x-tenant-id": "tenant-a",
      "x-user-id": "user-a",
      "x-trace-id": "trace-a",
      "x-request-id": "request-a"
    };

    const approval = await app.inject({
      method: "POST",
      url: "/api/v1/sessions/approval-conversation/executions/approval-execution/approvals/tool-a",
      headers,
      payload: { action: "approve" }
    });
    expect(approval.statusCode).toBe(200);
    expect(context.database.transaction(tx => context.repositories.approval.get(
      tx, "tenant-a", "user-a", "approval-conversation", "approval-a"
    ))?.status).toBe("approved");

    const abort = await app.inject({
      method: "POST",
      url: "/api/v1/sessions/abort-conversation/executions/abort-execution/abort",
      headers
    });
    expect(abort.statusCode).toBe(200);
    expect(context.database.transaction(tx => context.repositories.execution.get(
      tx, "tenant-a", "user-a", "abort-conversation", "abort-execution"
    ))?.status).toBe("aborted");
    expect(context.database.transaction(tx => context.repositories.approval.get(
      tx, "tenant-a", "user-a", "abort-conversation", "approval-abort"
    ))?.status).toBe("invalidated");

    await app.close();
    context.close();
  });

  it("releases the production lock when listen fails", async () => {
    const target = workspace();
    await expect(main({
      env: {
        AGENT_RUNTIME_PROFILE: "production",
        AGENT_RUNTIME_SQLITE_PATH: target.databasePath,
        OPENHARNESS_SERVICE_TOKEN: "service-token"
      },
      createApp: async options => {
        const app = await createProductionServer({
          ...options,
          javaClient: new FinalAnswerJavaClient(),
          disableMcp: true
        });
        app.listen = async () => { throw new Error("listen failed"); };
        return app;
      },
      registerSignal: () => undefined
    })).rejects.toThrow("listen failed");

    const lock = acquireRuntimeSingletonLock(`${target.databasePath}.lock`);
    lock.release();
  });

  it("uses development fallback factories only outside production context", async () => {
    const calls: string[] = [];
    const factories = {
      history: () => { calls.push("history"); return new InMemoryHistoryStore(); },
      memory: () => { calls.push("memory"); return new InMemoryMemoryStore(); },
      events: () => { calls.push("events"); return new InMemoryRuntimeEventStore(); },
      executions: () => { calls.push("executions"); return new InMemoryExecutionStateStore(); },
      approvals: () => { calls.push("approvals"); return new InMemoryApprovalStore(); }
    };
    const development = await createServer({
      javaClient: new FinalAnswerJavaClient(),
      disableMcp: true,
      developmentStoreFactories: factories
    });
    expect(calls).toEqual(["history", "memory", "events", "executions", "approvals"]);
    await development.close();

    const target = workspace();
    const context = openProductionRuntimeContext(target.databasePath);
    const production = await createServer({
      runtimeContext: context,
      javaClient: new FinalAnswerJavaClient(),
      disableMcp: true,
      developmentStoreFactories: {
        history: () => { throw new Error("history fallback reached"); },
        memory: () => { throw new Error("memory fallback reached"); },
        events: () => { throw new Error("event fallback reached"); },
        executions: () => { throw new Error("execution fallback reached"); },
        approvals: () => { throw new Error("approval fallback reached"); }
      }
    });
    await production.close();
    context.close();
  });

  it("owns an explicitly injected Gate D MCP registry in production", async () => {
    const target = workspace();
    let shutdownCount = 0;
    class GateDMcpRegistry extends McpRegistry {
      override async shutdown(): Promise<void> {
        shutdownCount += 1;
        await super.shutdown();
      }
    }
    const registry = new GateDMcpRegistry({ mcpServers: {} });
    await registry.init();
    const app = await createProductionServer({
      databasePath: target.databasePath,
      serviceToken: "service-token",
      javaClient: new FinalAnswerJavaClient(),
      mcpRegistry: registry
    });

    await app.close();

    expect(shutdownCount).toBe(1);
  });
});

class FinalAnswerJavaClient implements JavaClient {
  async getCatalog(): Promise<CatalogResponse> {
    return { catalogVersion: "v1", catalogHash: "hash", tools: [] };
  }
  async chat(request: ModelChatRequest) {
    return {
      requestId: request.requestId,
      conversationId: request.conversationId,
      rawProvider: "fake",
      message: { role: "assistant", content: "done" } as AgentMessage
    };
  }
  async executeTool(request: ToolCallRequest) {
    return {
      requestId: request.requestId,
      conversationId: request.conversationId,
      toolCallId: request.toolCallId,
      toolName: request.toolName,
      status: "ok" as const,
      result: {}
    };
  }
  async postTrace(_event: TraceEvent) {}
  async evaluatePolicy(request: Parameters<JavaClient["evaluatePolicy"]>[0]) {
    return { requestId: request.requestId, conversationId: request.conversationId, decisions: [] };
  }
}
