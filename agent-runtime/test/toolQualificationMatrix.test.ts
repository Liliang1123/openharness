import { afterEach, describe, expect, it } from "vitest";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { McpRegistry } from "../src/mcpRegistry";
import {
  runJavaSandboxQualificationMatrix,
  runMcpQualificationMatrix,
  type JavaSandboxQualificationClient
} from "../src/qualification/toolQualificationMatrix";
import type { CatalogResponse, ToolCallRequest, ToolCallResponse, ToolDefinition, TraceEvent } from "../src/types";

const TMP = "/tmp/openharness-tool-qualification-test";

class DeterministicJavaSandboxClient implements JavaSandboxQualificationClient {
  readonly traceEvents: TraceEvent[] = [];
  readonly catalog: CatalogResponse = {
    catalogVersion: "v-sandbox",
    catalogHash: "h-sandbox",
    tools: [
      tool("read_file", "read_file", "safe"),
      tool("search", "search", "safe"),
      tool("run_command", "run_command", "safe"),
      tool("submit_payment", undefined, "sensitive")
    ]
  };
  private readonly idempotency = new Map<string, ToolCallResponse>();
  private traceSequence = 0;

  async fingerprint() {
    return { implementation: "spring-boot-tool-execution-service", workspaceRoot: TMP, javaVersion: "21" };
  }

  async getCatalog() {
    return this.catalog;
  }

  async executeTool(request: ToolCallRequest): Promise<ToolCallResponse> {
    this.traceEvents.push(trace("TOOL_CALL_START", request.toolCallId, request.toolName, undefined, this.traceSequence++));
    const existing = this.idempotency.get(request.idempotencyKey);
    if (existing) {
      const replay = { ...existing, idempotentReplay: true };
      this.traceEvents.push(trace("TOOL_CALL_END", request.toolCallId, request.toolName, true, this.traceSequence++));
      return replay;
    }

    let response: ToolCallResponse;
    if (request.toolName === "read_file" && request.arguments.path === "note.txt") {
      response = ok(request, { path: "note.txt", content: "alpha\nneedle\nomega\n", truncated: false });
    } else if (request.toolName === "read_file" && request.arguments.path === "big.txt") {
      response = ok(request, { path: "big.txt", content: "x".repeat(4096), truncated: true });
    } else if (request.toolName === "read_file") {
      response = error(request, "TOOL_USER_ERROR", "Path escapes tool workspace.");
    } else if (request.toolName === "search") {
      response = ok(request, { query: request.arguments.query, matches: [{ path: "note.txt", line: 2, text: "needle" }], truncated: false });
    } else if (request.toolName === "run_command" && request.arguments.command === "pwd") {
      response = ok(request, { exitCode: 0, stdout: `${TMP}\n`, stderr: "", truncated: false });
    } else if (request.toolName === "run_command" && request.arguments.command === "sleep") {
      response = error(request, "TOOL_TIMEOUT", "Command timed out.", "timeout");
    } else if (request.toolName === "submit_payment") {
      response = error(request, "POLICY_DENY", "Sensitive tool requires policy approval.");
    } else {
      response = error(request, "TOOL_USER_ERROR", "Unhandled fixture.");
    }
    this.idempotency.set(request.idempotencyKey, response);
    this.traceEvents.push(trace("TOOL_CALL_END", request.toolCallId, request.toolName, false, this.traceSequence++));
    return response;
  }

  async cancelTool(requestId: string, toolCallId: string) {
    return { requestId, toolCallId, cancelled: true };
  }

  async readTraceEvents() {
    return this.traceEvents;
  }
}

describe("tool qualification matrices", () => {
  afterEach(() => {
    rmSync(TMP, { recursive: true, force: true });
  });

  it("builds a local_verified Java sandbox report with containment, timeout, policy, idempotency, cancellation, audit, and trace dedup rows", async () => {
    const client = new DeterministicJavaSandboxClient();
    const report = await runJavaSandboxQualificationMatrix({ client, track: "local" });

    expect(report.track).toBe("local");
    expect(report.result).toBe("local_verified");
    const results = Object.fromEntries(report.rows.map((row) => [row.id, row.result]));
    expect(results).toMatchObject({
      "java-sandbox-fingerprint": "pass",
      "java-sandbox-read-file": "pass",
      "java-sandbox-search": "pass",
      "java-sandbox-run-command-workspace": "pass",
      "java-sandbox-workspace-escape": "pass",
      "java-sandbox-output-cap": "pass",
      "java-sandbox-timeout": "pass",
      "java-sandbox-policy": "pass",
      "java-sandbox-idempotency": "pass",
      "java-sandbox-cancellation": "pass",
      "java-sandbox-audit-evidence": "pass",
      "java-sandbox-trace-dedup": "pass"
    });
    expect(JSON.stringify(report)).not.toContain("dev-service-token");
  });

  it("builds a local_verified MCP report against a real stdio fixture subprocess", async () => {
    mkdirSync(TMP, { recursive: true });
    const fixturePath = join(process.cwd(), "fixtures/mcp/qualification-server.ts");
    writeFileSync(join(TMP, "mcp.json"), JSON.stringify({
      mcpServers: {
        qualification: {
          command: "./node_modules/.bin/tsx",
          args: [fixturePath],
          timeoutMs: 250
        },
        crash: {
          command: "./node_modules/.bin/tsx",
          args: [fixturePath, "--crash-on-call"],
          timeoutMs: 250
        }
      }
    }));

    const registry = new McpRegistry(JSON.parse(readFileSync(join(TMP, "mcp.json"), "utf8")));
    await registry.init();
    try {
      const report = await runMcpQualificationMatrix({ registry, track: "local" });
      expect(report.track).toBe("local");
      expect(report.result).toBe("local_verified");
      const results = Object.fromEntries(report.rows.map((row) => [row.id, row.result]));
      expect(results).toMatchObject({
        "mcp-initialize": "pass",
        "mcp-tools-list": "pass",
        "mcp-catalog-conflict": "pass",
        "mcp-multi-step-call": "pass",
        "mcp-provenance": "pass",
        "mcp-approval-id": "pass",
        "mcp-timeout": "pass",
        "mcp-process-crash": "pass",
        "mcp-cancellation": "pass",
        "mcp-sigterm-shutdown": "pass"
      });
    } finally {
      await registry.shutdown();
    }
  }, 10_000);
});

function tool(name: string, protocol: string | undefined, permission: "safe" | "sensitive"): ToolDefinition {
  return {
    name,
    description: name,
    parameters: { type: "object", properties: {} },
    permission,
    isReadOnly: permission === "safe",
    isDestructive: false,
    requiresApproval: permission !== "safe",
    isConcurrencySafe: true,
    protocol
  } as ToolDefinition;
}

function ok(request: ToolCallRequest, result: Record<string, unknown>): ToolCallResponse {
  return {
    requestId: request.requestId,
    conversationId: request.conversationId,
    toolCallId: request.toolCallId,
    toolName: request.toolName,
    result,
    status: "ok",
    provenance: "trusted"
  };
}

function error(request: ToolCallRequest, errorClass: string, errorMessage: string, status: "error" | "timeout" = "error"): ToolCallResponse {
  return {
    requestId: request.requestId,
    conversationId: request.conversationId,
    toolCallId: request.toolCallId,
    toolName: request.toolName,
    status,
    error: { errorClass, errorMessage, retriable: false, retryOwner: "none", maxRetries: 0, fallbackAllowed: false, httpStatus: 400 }
  };
}

function trace(eventType: string, toolCallId: string, toolName: string, idempotentReplay?: boolean, sequence = 0): TraceEvent {
  return {
    traceId: "trace-tool-qualification",
    spanId: `${eventType}-${toolCallId}-${idempotentReplay ?? "fresh"}`,
    requestId: "req-tool-qualification",
    conversationId: "conv-tool-qualification",
    userId: "user-local",
    tenantId: "tenant-local",
    runtime: "backend",
    eventType,
    name: eventType.toLowerCase(),
    attributes: { toolName, toolCallId, idempotentReplay, committedEventId: `${eventType}:${toolCallId}:${idempotentReplay ?? "fresh"}:${sequence}` },
    status: "ok",
    startTime: 1780000000000
  } as TraceEvent;
}
