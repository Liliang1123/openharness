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
import type {
  RuntimeStorageMonitorFactory,
  RuntimeStorageMonitorLifecycle,
  RuntimeStorageReadinessReason
} from "../src/storage/runtimeStorageMonitor";

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

  it("exposes authenticated readiness and degrades it for durable trace dead letters", async () => {
    const healthyTarget = workspace();
    const healthy = await createProductionServer({
      databasePath: healthyTarget.databasePath,
      serviceToken: "service-token",
      javaClient: new FinalAnswerJavaClient(),
      disableMcp: true
    });
    const healthyResponse = await healthy.inject({
      method: "GET",
      url: "/api/v1/health/ready",
      headers: productionHeaders()
    });
    expect(healthyResponse.statusCode).toBe(200);
    expect(healthyResponse.json()).toEqual({ status: "ready" });
    await healthy.close();

    const degradedTarget = workspace();
    await seedTraceEvent(degradedTarget.databasePath, true);
    const degraded = await createProductionServer({
      databasePath: degradedTarget.databasePath,
      serviceToken: "service-token",
      javaClient: new FinalAnswerJavaClient(),
      disableMcp: true
    });
    const degradedResponse = await degraded.inject({
      method: "GET",
      url: "/api/v1/health/ready",
      headers: productionHeaders()
    });
    expect(degradedResponse.statusCode).toBe(503);
    expect(degradedResponse.json()).toEqual({
      status: "not_ready",
      reason: "TRACE_OUTBOX_DEAD_LETTER"
    });
    await degraded.close();
  });

  it("waits for an in-flight trace dispatch before closing SQLite and releasing the lock", async () => {
    const target = workspace();
    await seedTraceEvent(target.databasePath, false);
    const javaClient = new DeferredTraceJavaClient();
    const app = await createProductionServer({
      databasePath: target.databasePath,
      serviceToken: "service-token",
      javaClient,
      disableMcp: true
    });
    await javaClient.started;
    expect(javaClient.headers).toEqual({
      Authorization: "Bearer service-token",
      "X-Tenant-Id": "tenant-a",
      "X-User-Id": "user-a",
      "X-Trace-Id": "trace-a",
      "X-Request-Id": "request-a"
    });

    let closeSettled = false;
    const closing = app.close().then(() => { closeSettled = true; });
    await Promise.resolve();
    expect(closeSettled).toBe(false);

    javaClient.release();
    await closing;
    expect(closeSettled).toBe(true);
    const lock = acquireRuntimeSingletonLock(`${target.databasePath}.lock`);
    lock.release();
  });

  it("owns the storage monitor, exposes its readiness, and blocks only external mutations", async () => {
    const target = workspace();
    const monitor = new ControlledStorageMonitor("RUNTIME_STORAGE_LOW");
    const app = await createProductionServer({
      databasePath: target.databasePath,
      serviceToken: "service-token",
      javaClient: new FinalAnswerJavaClient(),
      disableMcp: true,
      storageMonitorFactory: () => monitor
    });

    expect(monitor.startCount).toBe(1);
    const readiness = await app.inject({
      method: "GET",
      url: "/api/v1/health/ready",
      headers: productionHeaders()
    });
    expect(readiness.statusCode).toBe(503);
    expect(readiness.json()).toEqual({
      status: "not_ready",
      reason: "RUNTIME_STORAGE_LOW"
    });

    const read = await app.inject({
      method: "GET",
      url: "/api/v1/sessions",
      headers: productionHeaders()
    });
    expect(read.statusCode).toBe(200);

    const mutation = await app.inject({
      method: "POST",
      url: "/api/v1/agent/chat",
      headers: productionHeaders(),
      payload: { conversationId: "conversation-a", message: "hello" }
    });
    expect(mutation.statusCode).toBe(503);
    expect(mutation.json()).toEqual({
      error: {
        errorClass: "RUNTIME_STORAGE_LOW",
        errorMessage: "Runtime is not accepting external mutations"
      }
    });

    await app.close();
    expect(monitor.closeCount).toBe(1);
    const lock = acquireRuntimeSingletonLock(`${target.databasePath}.lock`);
    lock.release();
  });

  it("drains an in-flight execution and closes production resources on critical disk", async () => {
    const target = workspace();
    const javaClient = new DeferredChatJavaClient();
    let monitor!: ControlledStorageMonitor;
    const storageMonitorFactory: RuntimeStorageMonitorFactory = dependencies => {
      monitor = new ControlledStorageMonitor(undefined, dependencies.onCritical);
      return monitor;
    };
    const app = await createProductionServer({
      databasePath: target.databasePath,
      serviceToken: "service-token",
      javaClient,
      disableMcp: true,
      storageMonitorFactory
    });

    const request = app.inject({
      method: "POST",
      url: "/api/v1/agent/chat",
      headers: productionHeaders(),
      payload: { conversationId: "critical-conversation", message: "hello" }
    });
    await javaClient.started;

    monitor.triggerCritical();
    javaClient.release();
    await request;
    await app.close();

    expect(monitor.closeCount).toBe(1);
    const context = await openProductionRuntimeContext(target.databasePath);
    const criticalEvents = await context.events.since(
      "tenant-a", "user-a", "critical-conversation", null
    );
    const criticalExecutionId = criticalEvents.find(event => event.kind === "agent_start")?.executionId;
    expect(criticalExecutionId).toBeTypeOf("string");
    expect(await context.executions.getActive(
      "tenant-a", "user-a", "critical-conversation"
    )).toBeNull();
    expect(await context.executions.get(
      "tenant-a", "user-a", "critical-conversation", criticalExecutionId!
    )).toMatchObject({
      status: "errored",
      stopReason: "EXECUTION_INTERRUPTED"
    });
    expect(criticalEvents.some(event =>
      event.kind === "stream_error"
      && event.data.errorClass === "EXECUTION_INTERRUPTED"
    )).toBe(true);
    await context.close();
  });

  it("fails initial critical storage preflight and releases the production lock", async () => {
    const target = workspace();
    let monitor!: ControlledStorageMonitor;

    await expect(createProductionServer({
      databasePath: target.databasePath,
      serviceToken: "service-token",
      javaClient: new FinalAnswerJavaClient(),
      disableMcp: true,
      storageMonitorFactory: dependencies => {
        monitor = new ControlledStorageMonitor(
          "RUNTIME_STORAGE_CRITICAL",
          dependencies.onCritical,
          true
        );
        return monitor;
      }
    })).rejects.toThrow(/critically low/i);

    expect(monitor.startCount).toBe(1);
    expect(monitor.closeCount).toBe(1);
    const lock = acquireRuntimeSingletonLock(`${target.databasePath}.lock`);
    lock.release();
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
    const context = await openProductionRuntimeContext(target.databasePath);
    const approvalScope = {
      tenantId: "tenant-a",
      userId: "user-a",
      conversationId: "approval-conversation",
      executionId: "approval-execution",
      traceId: "trace-a",
      requestId: "request-a"
    };
    await context.lifecycle.startExecution({ ...approvalScope, message: "hello" });
    await context.lifecycle.enterApproval({
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
    await context.lifecycle.startExecution({ ...abortScope, message: "hello" });
    await context.lifecycle.enterApproval({
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
    expect(await context.approvals.listPending(
      "tenant-a", "user-a", "approval-conversation"
    )).toEqual([]);

    const abort = await app.inject({
      method: "POST",
      url: "/api/v1/sessions/abort-conversation/executions/abort-execution/abort",
      headers
    });
    expect(abort.statusCode).toBe(200);
    expect(await context.executions.get(
      "tenant-a", "user-a", "abort-conversation", "abort-execution"
    )).toMatchObject({ status: "aborted" });
    expect(await context.approvals.listPending(
      "tenant-a", "user-a", "abort-conversation"
    )).toEqual([]);

    await app.close();
    await context.close();
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
    const context = await openProductionRuntimeContext(target.databasePath);
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
    await context.close();
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
  async postTrace(_event: TraceEvent, _headers: Record<string, string>) {}
  async evaluatePolicy(request: Parameters<JavaClient["evaluatePolicy"]>[0]) {
    return { requestId: request.requestId, conversationId: request.conversationId, decisions: [] };
  }
}

class DeferredTraceJavaClient extends FinalAnswerJavaClient {
  headers?: Record<string, string>;
  private signalStarted!: () => void;
  private signalReleased!: () => void;
  readonly started = new Promise<void>(resolve => { this.signalStarted = resolve; });
  private readonly released = new Promise<void>(resolve => { this.signalReleased = resolve; });

  override async postTrace(_event: TraceEvent, headers: Record<string, string>): Promise<void> {
    this.headers = headers;
    this.signalStarted();
    await this.released;
  }

  release(): void {
    this.signalReleased();
  }
}

class DeferredChatJavaClient extends FinalAnswerJavaClient {
  private signalStarted!: () => void;
  private signalReleased!: () => void;
  readonly started = new Promise<void>(resolve => { this.signalStarted = resolve; });
  private readonly released = new Promise<void>(resolve => { this.signalReleased = resolve; });

  override async chat(request: ModelChatRequest) {
    this.signalStarted();
    await this.released;
    return super.chat(request);
  }

  release(): void {
    this.signalReleased();
  }
}

class ControlledStorageMonitor implements RuntimeStorageMonitorLifecycle {
  startCount = 0;
  closeCount = 0;

  constructor(
    private reason?: RuntimeStorageReadinessReason,
    private readonly onCritical: () => void | Promise<void> = () => undefined,
    private readonly criticalOnStart = false
  ) {}

  async start(): Promise<void> {
    this.startCount += 1;
    if (this.criticalOnStart) await this.onCritical();
  }

  async close(): Promise<void> {
    this.closeCount += 1;
  }

  readiness() {
    return this.reason
      ? { ready: false as const, reason: this.reason }
      : { ready: true as const };
  }

  admission() {
    return this.reason
      ? { allowed: false as const, reason: this.reason }
      : { allowed: true as const };
  }

  triggerCritical(): void {
    this.reason = "RUNTIME_STORAGE_CRITICAL";
    void this.onCritical();
  }
}

function productionHeaders(): Record<string, string> {
  return {
    authorization: "Bearer service-token",
    "x-tenant-id": "tenant-a",
    "x-user-id": "user-a",
    "x-trace-id": "trace-a",
    "x-request-id": "request-a"
  };
}

async function seedTraceEvent(databasePath: string, deadLetter: boolean): Promise<void> {
  const context = await openProductionRuntimeContext(databasePath);
  try {
    const scope = {
      tenantId: "tenant-a",
      userId: "user-a",
      conversationId: "conversation-a",
      executionId: "execution-a",
      traceId: "trace-a",
      requestId: "request-a"
    };
    await context.lifecycle.startExecution({ ...scope, message: "hello" });
    await context.lifecycle.recordEvent({
      ...scope,
      kind: "trace",
      data: {
        traceId: "trace-a",
        spanId: "span-a",
        runtime: "agent-runtime",
        eventType: "MODEL_CALL_END",
        name: "model call end",
        status: "ok",
        startTime: 1
      }
    });
    if (deadLetter) {
      const [candidate] = await context.storage.execute("p2", "outbox.claim", {
        now: Number.MAX_SAFE_INTEGER,
        limit: 1
      });
      if (!candidate) throw new Error("missing seeded trace candidate");
      await context.storage.execute("p2", "outbox.applyOutcomes", {
        outcomes: [{
          event: {
            tenantId: candidate.event.tenantId,
            userId: candidate.event.userId,
            conversationId: candidate.event.conversationId,
            eventId: candidate.event.eventId
          },
          transition: "dead_letter"
        }]
      });
    }
  } finally {
    await context.close();
  }
}
