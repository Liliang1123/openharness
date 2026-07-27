import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { once } from "node:events";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createServer } from "../../agent-runtime/src/server";
import { HttpJavaClient } from "../../agent-runtime/src/javaClient";

const backendPort = Number(process.env.P0A_BACKEND_PORT ?? 18080);
const backendUrl = `http://127.0.0.1:${backendPort}`;
const serviceHeaders = {
  Authorization: "Bearer dev-service-token",
  "X-User-Id": "user-001",
  "X-Tenant-Id": "tenant-001",
  "X-Trace-Id": "trace-integration",
  "X-Request-Id": "req-integration"
};

let backend: ChildProcessWithoutNullStreams;
const traceLines: any[] = [];
const backendLogs: string[] = [];
const backendDir = fileURLToPath(new URL("../../backend/", import.meta.url));

describe("P0a integration", () => {
  beforeAll(async () => {
    backend = spawn("mvn", [
      "spring-boot:run",
      `-Dspring-boot.run.arguments=--server.port=${backendPort} --logging.level.org.openharness.backend.service.TraceService=DEBUG`
    ], {
      cwd: backendDir,
      detached: true
    });
    backend.on("error", (error) => {
      backendLogs.push(error.message);
    });
    backend.stdout.on("data", (chunk) => {
      const text = chunk.toString();
      backendLogs.push(text);
      for (const line of text.split(/\r?\n/)) {
        const marker = "trace_event=";
        const markerIndex = line.indexOf(marker);
        if (markerIndex >= 0) {
          try {
            traceLines.push(JSON.parse(line.slice(markerIndex + marker.length)));
          } catch {
            // Ignore non-JSON log lines.
          }
        }
      }
    });
    backend.stderr.on("data", (chunk) => {
      backendLogs.push(chunk.toString());
      process.stderr.write(chunk);
    });
    await waitForHealth();
  }, 90_000);

  afterAll(async () => {
    if (backend?.pid) {
      try {
        process.kill(-backend.pid, "SIGTERM");
      } catch {
        backend.kill("SIGTERM");
      }
      await Promise.race([once(backend, "exit"), new Promise((resolve) => setTimeout(resolve, 3000))]);
    }
  }, 10_000);

  it("catalog returns catalogVersion and catalogHash", async () => {
    const catalog = await getCatalog();

    expect(catalog.catalogVersion).toBeTruthy();
    expect(catalog.catalogHash).toBeTruthy();
  });

  it("executes get_current_time", async () => {
    const catalog = await getCatalog();
    const response = await executeTool("req-it-time", "call-it-time", {
      toolName: "get_current_time",
      arguments: { timezone: "Asia/Shanghai" },
      catalog
    });

    expect(response.status).toBe("ok");
    expect(response.result.isoTime).toBeTruthy();
  });

  it("agent chat completes model to tool to final answer", async () => {
    const app = await createServer({ javaClient: new HttpJavaClient(backendUrl) });
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/agent/chat",
      headers: {
        "content-type": "application/json",
        "x-user-id": "user-001",
        "x-tenant-id": "tenant-001",
        "x-trace-id": "trace-agent-time",
        "x-request-id": "req-agent-time",
        "x-mock-fixture": "tool-time"
      },
      payload: { conversationId: "conv-agent-time", message: "现在几点？" }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().answer).toContain("当前时间工具已返回结果");
  });

  it("missing X-User-Id returns AUTH_MISSING_HEADER", async () => {
    const response = await fetch(`${backendUrl}/api/v1/tools/catalog`, {
      headers: {
        Authorization: "Bearer dev-service-token",
        "X-Tenant-Id": "tenant-001",
        "X-Trace-Id": "trace-missing",
        "X-Request-Id": "req-missing"
      }
    });
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body.error.errorClass).toBe("AUTH_MISSING_HEADER");
  });

  it("replays duplicate idempotency key with the first result", async () => {
    const catalog = await getCatalog();
    const first = await executeTool("req-it-replay", "call-it-replay", {
      toolName: "echo",
      arguments: { text: "first" },
      catalog,
      idempotencyKey: "idem-it-replay"
    });
    const second = await executeTool("req-it-replay", "call-it-replay", {
      toolName: "echo",
      arguments: { text: "first" },
      catalog,
      idempotencyKey: "idem-it-replay"
    });

    expect(first.idempotentReplay).toBeUndefined();
    expect(second.idempotentReplay).toBe(true);
    expect(second.result.echo).toBe("first");
  });

  it("returns CATALOG_OUTDATED for stale catalog", async () => {
    const response = await fetch(`${backendUrl}/api/v1/tools/execute`, {
      method: "POST",
      headers: { ...serviceHeaders, "Content-Type": "application/json" },
      body: JSON.stringify({
        requestId: "req-it-stale",
        conversationId: "conv-it",
        userId: "user-001",
        tenantId: "tenant-001",
        toolCallId: "call-it-stale",
        toolName: "echo",
        arguments: { text: "stale" },
        catalogVersion: "stale",
        catalogHash: "sha256:stale",
        idempotencyKey: "idem-it-stale"
      })
    });
    const body = await response.json();

    expect(response.status).toBe(409);
    expect(body.error.errorClass).toBe("CATALOG_OUTDATED");
  });

  it("fixture mode returns deterministic canonical response", async () => {
    const catalog = await getCatalog();
    const response = await fetch(`${backendUrl}/api/v1/model/chat`, {
      method: "POST",
      headers: { ...serviceHeaders, "Content-Type": "application/json", "X-Mock-Fixture": "tool-time" },
      body: JSON.stringify({
        requestId: "req-it-fixture",
        conversationId: "conv-it-fixture",
        userId: "user-001",
        tenantId: "tenant-001",
        model: "mock",
        stream: false,
        messages: [{ role: "user", content: "fixture" }],
        tools: catalog.tools,
        meta: { cacheEnabled: false }
      })
    });
    const body = await response.json();

    expect(body.message.toolCalls[0].id).toBe("call-fixture-time");
  });

  it("roundtrips reasoningBlocks from Java through TS to the next Java model request", async () => {
    const traceId = "trace-reasoning-roundtrip";
    const app = await createServer({ javaClient: new HttpJavaClient(backendUrl) });
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/agent/chat",
      headers: {
        "content-type": "application/json",
        "x-user-id": "user-001",
        "x-tenant-id": "tenant-001",
        "x-trace-id": traceId,
        "x-request-id": "req-reasoning-roundtrip",
        "x-mock-fixture": "reasoning-tool-time"
      },
      payload: { conversationId: "conv-reasoning-roundtrip", message: "现在几点？" }
    });

    expect(response.statusCode).toBe(200);
    await waitForTrace(() =>
      traceLines.some(
        (event) =>
          event.traceId === traceId &&
          event.runtime === "backend" &&
          event.eventType === "MODEL_CALL_START" &&
          event.attributes?.hasReasoningBlocks === true
      )
    );
  });

  it("keeps one trace id across frontend, TS, and Java events", async () => {
    const traceId = "trace-continuity";
    await fetch(`${backendUrl}/api/v1/trace/events`, {
      method: "POST",
      headers: { ...serviceHeaders, "Content-Type": "application/json", "X-Trace-Id": traceId, "X-Request-Id": "req-continuity" },
      body: JSON.stringify({
        traceId,
        spanId: "span-frontend",
        requestId: "req-continuity",
        conversationId: "conv-continuity",
        userId: "user-001",
        tenantId: "tenant-001",
        runtime: "frontend",
        eventType: "USER_INPUT_SUBMITTED",
        name: "user input submitted",
        status: "ok",
        startTime: Date.now()
      })
    });

    const app = await createServer({ javaClient: new HttpJavaClient(backendUrl) });
    await app.inject({
      method: "POST",
      url: "/api/v1/agent/chat",
      headers: {
        "content-type": "application/json",
        "x-user-id": "user-001",
        "x-tenant-id": "tenant-001",
        "x-trace-id": traceId,
        "x-request-id": "req-continuity"
      },
      payload: { conversationId: "conv-continuity", message: "现在几点？" }
    });

    await waitForTrace(() => traceLines.filter((event) => event.traceId === traceId).length >= 6);
    const events = traceLines.filter((event) => event.traceId === traceId);

    expect(events.filter((event) => event.runtime === "frontend")).toHaveLength(1);
    expect(events.filter((event) => event.runtime === "agent-runtime").length).toBeGreaterThanOrEqual(3);
    expect(events.filter((event) => event.runtime === "backend").length).toBeGreaterThanOrEqual(2);
    expect(new Set(events.map((event) => event.traceId))).toEqual(new Set([traceId]));
  });
});

async function getCatalog() {
  const response = await fetch(`${backendUrl}/api/v1/tools/catalog`, { headers: serviceHeaders });
  expect(response.status).toBe(200);
  return response.json();
}

async function executeTool(
  requestId: string,
  toolCallId: string,
  input: {
    toolName: string;
    arguments: Record<string, unknown>;
    catalog: { catalogVersion: string; catalogHash: string };
    idempotencyKey?: string;
  }
) {
  const response = await fetch(`${backendUrl}/api/v1/tools/execute`, {
    method: "POST",
    headers: { ...serviceHeaders, "Content-Type": "application/json" },
    body: JSON.stringify({
      requestId,
      conversationId: "conv-it",
      userId: "user-001",
      tenantId: "tenant-001",
      toolCallId,
      toolName: input.toolName,
      arguments: input.arguments,
      catalogVersion: input.catalog.catalogVersion,
      catalogHash: input.catalog.catalogHash,
      idempotencyKey: input.idempotencyKey ?? `${requestId}:${toolCallId}`
    })
  });
  expect(response.status).toBe(200);
  return response.json();
}

async function waitForHealth() {
  const deadline = Date.now() + 45_000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${backendUrl}/actuator/health`);
      if (response.ok) return;
    } catch {
      // wait
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`backend health check timed out\n${backendLogs.slice(-20).join("")}`);
}

async function waitForTrace(predicate: () => boolean) {
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    if (predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error("trace condition timed out");
}
