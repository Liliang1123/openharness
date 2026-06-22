import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { once } from "node:events";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createServer } from "../../agent-runtime/src/server";
import { HttpJavaClient } from "../../agent-runtime/src/javaClient";

const useExternalServices = Boolean(process.env.BACKEND_URL || process.env.AGENT_RUNTIME_URL);
const backendUrl = process.env.BACKEND_URL ?? "http://127.0.0.1:18081";
const agentRuntimeUrl = process.env.AGENT_RUNTIME_URL ?? "http://127.0.0.1:13001";
const backendPort = new URL(backendUrl).port;
const agentRuntimePort = Number(new URL(agentRuntimeUrl).port);
const backendDir = fileURLToPath(new URL("../../backend/", import.meta.url));
let backend: ChildProcessWithoutNullStreams | undefined;
let agentRuntime: Awaited<ReturnType<typeof createServer>> | undefined;
const backendLogs: string[] = [];

const headers = {
  "Content-Type": "application/json",
  Authorization: "Bearer dev-service-token",
  "X-User-Id": "user-001",
  "X-Tenant-Id": "tenant-001",
  "X-Trace-Id": "trace-p0b",
  "X-Request-Id": "req-p0b"
};

describe("P0b policy evaluate", () => {
  beforeAll(async () => {
    if (useExternalServices) return;

    backend = spawn("mvn", ["spring-boot:run", `-Dspring-boot.run.arguments=--server.port=${backendPort}`], {
      cwd: backendDir,
      detached: true
    });
    backend.on("error", (error) => backendLogs.push(error.message));
    backend.stdout.on("data", (chunk) => backendLogs.push(chunk.toString()));
    backend.stderr.on("data", (chunk) => {
      backendLogs.push(chunk.toString());
      process.stderr.write(chunk);
    });
    await waitForHealth();

    agentRuntime = await createServer({
      javaClient: new HttpJavaClient(backendUrl),
      disableMcp: true
    });
    await agentRuntime.listen({ host: "127.0.0.1", port: agentRuntimePort });
  }, 90_000);

  afterAll(async () => {
    if (agentRuntime) await agentRuntime.close();
    if (backend?.pid) {
      try {
        process.kill(-backend.pid, "SIGTERM");
      } catch {
        backend.kill("SIGTERM");
      }
      await Promise.race([once(backend, "exit"), new Promise((resolve) => setTimeout(resolve, 3000))]);
    }
  }, 10_000);

  it("4.1 deny rule: blocked_ tool returns DENY", async () => {
    const res = await fetch(`${backendUrl}/api/v1/policies/tool-review/evaluate`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        requestId: "req-deny",
        conversationId: "conv-deny",
        userId: "user-001",
        tenantId: "tenant-001",
        traceId: "trace-deny",
        toolCalls: [{ id: "call-1", name: "blocked_dangerous", argumentsRaw: "{}" }],
        context: { catalogVersion: "v1", catalogHash: "h1" }
      })
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.decisions).toHaveLength(1);
    expect(body.decisions[0].decision).toBe("DENY");
    expect(body.decisions[0].source).toBe("ORG_POLICY");
  });

  it("4.2 bypass defense: sensitive tool without allow record returns 403", async () => {
    const res = await fetch(`${backendUrl}/api/v1/tools/execute`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        requestId: "req-bypass",
        conversationId: "conv-bypass",
        userId: "user-001",
        tenantId: "tenant-001",
        toolCallId: "call-no-allow",
        toolName: "submit_payment",
        arguments: { amount: 100, to: "bob" },
        catalogVersion: "2026-05-19T10:00:00Z",
        catalogHash: "sha256:p0a-catalog",
        idempotencyKey: "req-bypass:call-no-allow"
      })
    });
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error.errorClass).toBe("POLICY_DENY");
  });

  it("4.3 batch evaluate: multiple toolCalls get independent decisions", async () => {
    const res = await fetch(`${backendUrl}/api/v1/policies/tool-review/evaluate`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        requestId: "req-batch",
        conversationId: "conv-batch",
        userId: "user-001",
        tenantId: "tenant-001",
        traceId: "trace-batch",
        toolCalls: [
          { id: "call-safe", name: "get_current_time", argumentsRaw: "{\"timezone\":\"UTC\"}" },
          { id: "call-blocked", name: "blocked_nuke", argumentsRaw: "{}" }
        ],
        context: { catalogVersion: "v1", catalogHash: "h1" }
      })
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.decisions).toHaveLength(2);
    const safe = body.decisions.find((d: { toolCallId: string }) => d.toolCallId === "call-safe");
    const blocked = body.decisions.find((d: { toolCallId: string }) => d.toolCallId === "call-blocked");
    expect(safe.decision).toBe("ALLOW");
    expect(blocked.decision).toBe("DENY");
  });

  it("4.4 idempotency: duplicate key returns original result", async () => {
    const payload = {
      requestId: "req-idem-p0b",
      conversationId: "conv-idem-p0b",
      userId: "user-001",
      tenantId: "tenant-001",
      toolCallId: "call-idem",
      toolName: "echo",
      arguments: { text: "hello" },
      catalogVersion: "2026-05-19T10:00:00Z",
      catalogHash: "sha256:p0a-catalog",
      idempotencyKey: "req-idem-p0b:call-idem"
    };
    const res1 = await fetch(`${backendUrl}/api/v1/tools/execute`, { method: "POST", headers, body: JSON.stringify(payload) });
    expect(res1.status).toBe(200);
    const body1 = await res1.json();
    expect(body1.status).toBe("ok");

    const res2 = await fetch(`${backendUrl}/api/v1/tools/execute`, { method: "POST", headers, body: JSON.stringify(payload) });
    expect(res2.status).toBe(200);
    const body2 = await res2.json();
    expect(body2.status).toBe("ok");
    expect(body2.idempotentReplay).toBe(true);
    expect(body2.result).toEqual(body1.result);
  });

  it("4.5 SSE stream emits correct event sequence", async () => {
    const res = await fetch(`${agentRuntimeUrl}/api/v1/agent/chat/stream`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Trace-Id": "trace-sse",
        "X-Request-Id": "req-sse",
        "X-User-Id": "user-001",
        "X-Tenant-Id": "tenant-001",
        "X-Mock-Fixture": "plain"
      },
      body: JSON.stringify({ conversationId: "conv-sse-test", message: "你好" })
    });
    expect(res.status).toBe(200);
    const text = await res.text();
    const events = text.split("\n\n").filter(Boolean).map(block => {
      const lines = block.split("\n");
      const eventLine = lines.find(l => l.startsWith("event: "));
      return eventLine?.slice(7) ?? "unknown";
    });
    expect(events[0]).toBe("agent_start");
    expect(events).toContain("model_call_start");
    expect(events).toContain("model_call_end");
    expect(events).toContain("final_answer");
  });
});

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
