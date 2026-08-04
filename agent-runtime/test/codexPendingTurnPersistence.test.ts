import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type {
  CodexToolResultSubmission,
  CodexTurnCancelRequest
} from "@openharness/shared-schema";
import { afterEach, describe, expect, it } from "vitest";
import { DEFAULT_AGENT_DEFINITION } from "../src/agentDefinitionLoader";
import { AgentExecutionRunner } from "../src/agentExecutionRunner";
import { ProcessApprovalStore, type ApprovalStore } from "../src/approvalStore";
import { InMemoryExecutionStateStore } from "../src/executionStateStore";
import { InMemoryHistoryStore } from "../src/history";
import type { JavaClient, PolicyEvaluateRequest } from "../src/javaClient";
import { InMemoryRuntimeEventStore } from "../src/runtimeEventStore";
import {
  openProductionRuntimeContext,
  type ProductionRuntimeContext
} from "../src/storage/productionRuntimeContext";
import type {
  CatalogResponse,
  ModelChatRequest,
  ModelChatResponse,
  ToolCallRequest,
  TraceEvent
} from "../src/types";

const workspaces: string[] = [];

function databasePath(): string {
  const workspace = mkdtempSync(join(tmpdir(), "openharness-codex-persistence-"));
  workspaces.push(workspace);
  return join(workspace, "runtime.sqlite");
}

afterEach(() => {
  delete process.env.COMPRESSION_AUTO;
  delete process.env.APPROVAL_TIMEOUT_MS;
  for (const workspace of workspaces.splice(0)) {
    rmSync(workspace, { recursive: true, force: true });
  }
});

function input() {
  return {
    tenantId: "tenant-a",
    userId: "user-a",
    conversationId: "conversation-a",
    message: "run five tools",
    traceId: "trace-a",
    requestId: "request-a",
    headers: { Authorization: "Bearer AUTH-CANARY" },
    agentDefinition: DEFAULT_AGENT_DEFINITION
  };
}

function pending(call: number) {
  return {
    bridgeId: "BRIDGE-CANARY",
    threadId: "thread-a",
    turnId: "turn-a",
    callId: `call-${call}`,
    toolName: "read_file",
    argumentsRaw: "{\"path\":\"ARG-CANARY\"}",
    expiresAt: "2026-07-30T10:00:00Z"
  };
}

class FivePendingJavaClient implements JavaClient {
  completions = 0;
  executions = 0;
  failContinuation = false;
  maxCalls = 5;
  policyDecision: "ALLOW" | "REQUIRE_APPROVAL" = "ALLOW";
  beforeNextPending?: (completedCall: number) => Promise<void> | void;

  async getCatalog(): Promise<CatalogResponse> {
    return {
      catalogVersion: "v1",
      catalogHash: "hash",
      tools: [{
        name: "read_file",
        description: "Read",
        parameters: { type: "object", properties: {}, required: [] },
        permission: "safe",
        isReadOnly: true,
        isDestructive: false,
        requiresApproval: false,
        isConcurrencySafe: true
      }]
    };
  }

  async chat(request: ModelChatRequest): Promise<ModelChatResponse> {
    return {
      requestId: request.requestId,
      conversationId: request.conversationId,
      pendingTurn: pending(1),
      rawProvider: "codex-app-server"
    };
  }

  async completeCodexToolCall(
    _bridgeId: string,
    request: CodexToolResultSubmission
  ): Promise<ModelChatResponse> {
    this.completions += 1;
    if (this.failContinuation) {
      return {
        requestId: request.requestId,
        conversationId: request.conversationId,
        error: {
          errorClass: "PROTOCOL_FAILURE",
          errorMessage: "Codex app-server protocol failure",
          retriable: false
        },
        rawProvider: "codex-app-server"
      };
    }
    if (this.completions < this.maxCalls) {
      await this.beforeNextPending?.(this.completions);
      return {
        requestId: request.requestId,
        conversationId: request.conversationId,
        pendingTurn: pending(this.completions + 1),
        rawProvider: "codex-app-server"
      };
    }
    return {
      requestId: request.requestId,
      conversationId: request.conversationId,
      message: { role: "assistant", content: "done" },
      rawProvider: "codex-app-server"
    };
  }

  async cancelCodexTurn(
    _bridgeId: string,
    request: CodexTurnCancelRequest
  ): Promise<ModelChatResponse> {
    return {
      requestId: request.requestId,
      conversationId: request.conversationId,
      error: {
        errorClass: "BRIDGE_TURN_GONE",
        errorMessage: "gone",
        retriable: false
      },
      rawProvider: "codex-app-server"
    };
  }

  async executeTool(request: ToolCallRequest) {
    this.executions += 1;
    return {
      requestId: request.requestId,
      conversationId: request.conversationId,
      toolCallId: request.toolCallId,
      toolName: request.toolName,
      status: "ok" as const,
      result: { content: "RESULT-CANARY" }
    };
  }

  async evaluatePolicy(request: PolicyEvaluateRequest) {
    return {
      requestId: request.requestId,
      conversationId: request.conversationId,
      decisions: request.toolCalls.map((call) => ({
        toolCallId: call.id,
        decision: this.policyDecision
      }))
    };
  }

  async postTrace(_event: TraceEvent) {}
}

function productionRunner(
  context: ProductionRuntimeContext,
  java: JavaClient,
  approvals?: ApprovalStore
): AgentExecutionRunner {
  return new AgentExecutionRunner(
    java,
    new InMemoryHistoryStore(),
    undefined,
    new InMemoryRuntimeEventStore(),
    new InMemoryExecutionStateStore(),
    approvals,
    undefined,
    { lifecycle: context.lifecycle, liveEvents: context.liveEvents }
  );
}

describe("Codex pending turn persistence", () => {
  it("commits five safe paired pending-tool results without transport history", async () => {
    process.env.COMPRESSION_AUTO = "false";
    const context = await openProductionRuntimeContext(databasePath());
    const java = new FivePendingJavaClient();
    const durableBeforeNextPending: string[] = [];
    java.beforeNextPending = async (completedCall) => {
      const events = await context.events.since(
        "tenant-a",
        "user-a",
        "conversation-a",
        null
      );
      const result = events.find((event) =>
        event.kind === "tool_result"
        && event.data.toolCallId === `call-${completedCall}`
      );
      if (result) durableBeforeNextPending.push(String(result.data.toolCallId));
    };
    const runner = productionRunner(context, java);

    try {
      const final = await runner.start(input()).done;
      const events = await context.events.since(
        "tenant-a",
        "user-a",
        "conversation-a",
        null
      );
      const calls = events.filter((event) => event.kind === "tool_call");
      const results = events.filter((event) => event.kind === "tool_result");

      expect(final.status).toBe("completed");
      expect(java.executions).toBe(5);
      expect(calls.map((event) => event.data.toolCallId))
        .toEqual(["call-1", "call-2", "call-3", "call-4", "call-5"]);
      expect(results.map((event) => [event.data.toolCallId, event.data.status]))
        .toEqual([
          ["call-1", "ok"],
          ["call-2", "ok"],
          ["call-3", "ok"],
          ["call-4", "ok"],
          ["call-5", "ok"]
        ]);
      expect(events.filter((event) =>
        event.kind === "tool_call" || event.kind === "tool_result"
      ).map((event) => `${event.kind}:${String(event.data.toolCallId)}`))
        .toEqual([
          "tool_call:call-1", "tool_result:call-1",
          "tool_call:call-2", "tool_result:call-2",
          "tool_call:call-3", "tool_result:call-3",
          "tool_call:call-4", "tool_result:call-4",
          "tool_call:call-5", "tool_result:call-5"
        ]);
      expect(durableBeforeNextPending)
        .toEqual(["call-1", "call-2", "call-3", "call-4"]);
      const kinds = events.map((event) => event.kind);
      expect(kinds.indexOf("stream_done"))
        .toBeGreaterThan(kinds.lastIndexOf("tool_result"));
      expect((await context.history.get(
        "tenant-a",
        "user-a",
        "conversation-a"
      )).map((message) => message.role)).toEqual(["user", "assistant"]);
      expect(JSON.stringify(events)).not.toMatch(
        /ARG-CANARY|RESULT-CANARY|BRIDGE-CANARY|AUTH-CANARY/
      );
    } finally {
      await context.close();
    }
  });

  it("keeps transient approval raw arguments only in the process owner", async () => {
    process.env.COMPRESSION_AUTO = "false";
    const context = await openProductionRuntimeContext(databasePath());
    const java = new FivePendingJavaClient();
    java.policyDecision = "REQUIRE_APPROVAL";
    java.maxCalls = 1;
    const approvals = new ProcessApprovalStore();
    const runner = productionRunner(context, java, approvals);
    const handle = runner.start(input());

    try {
      await waitFor(async () => (await context.events.since(
        "tenant-a",
        "user-a",
        "conversation-a",
        null
      )).some((event) => event.kind === "approval_requested"));

      const transient = approvals.get(
        "tenant-a",
        "user-a",
        "conversation-a",
        handle.executionId,
        "call-1"
      );
      const durableApproval = await context.approvals.get(
        "tenant-a",
        "user-a",
        "conversation-a",
        handle.executionId,
        "call-1"
      );
      const durableEvents = await context.events.since(
        "tenant-a",
        "user-a",
        "conversation-a",
        null
      );

      expect(transient?.argumentsRaw).toContain("ARG-CANARY");
      expect(durableApproval).toMatchObject({
        executionId: handle.executionId,
        toolCallId: "call-1",
        toolName: "read_file",
        argumentsRaw: "{}",
        reason: "POLICY_REQUIRE_APPROVAL"
      });
      expect(durableEvents.find((event) => event.kind === "approval_requested")?.data)
        .toMatchObject({
          toolCallId: "call-1",
          toolName: "read_file",
          argumentsRaw: "{}",
          reason: "POLICY_REQUIRE_APPROVAL"
        });
      expect(JSON.stringify({ durableApproval, durableEvents }))
        .not.toContain("ARG-CANARY");

      expect(approvals.decide(
        "tenant-a",
        "user-a",
        "conversation-a",
        handle.executionId,
        "call-1",
        { action: "reject", respondedAt: new Date().toISOString() }
      )).toBe(true);
      expect((await handle.done).status).toBe("completed");
      expect(JSON.stringify(await context.events.since(
        "tenant-a",
        "user-a",
        "conversation-a",
        null
      ))).not.toContain("ARG-CANARY");
    } finally {
      await context.close();
    }
  });

  it("clears transient and durable pending approval state after approval timeout", async () => {
    process.env.COMPRESSION_AUTO = "false";
    process.env.APPROVAL_TIMEOUT_MS = "10";
    const context = await openProductionRuntimeContext(databasePath());
    const java = new FivePendingJavaClient();
    java.policyDecision = "REQUIRE_APPROVAL";
    java.maxCalls = 1;
    const approvals = new ProcessApprovalStore();
    const runner = productionRunner(context, java, approvals);
    const handle = runner.start(input());

    try {
      const final = await handle.done;
      const durableEvents = await context.events.since(
        "tenant-a",
        "user-a",
        "conversation-a",
        null
      );

      expect(final.status).toBe("completed");
      expect(approvals.get(
        "tenant-a",
        "user-a",
        "conversation-a",
        handle.executionId,
        "call-1"
      )).toBeNull();
      expect(await context.approvals.listPending(
        "tenant-a",
        "user-a",
        "conversation-a"
      )).toEqual([]);
      expect(durableEvents.filter((event) => event.kind === "tool_result"))
        .toEqual([expect.objectContaining({
          data: expect.objectContaining({ toolCallId: "call-1", status: "timeout" })
        })]);
      expect(JSON.stringify(durableEvents)).not.toContain("ARG-CANARY");
    } finally {
      await context.close();
    }
  });

  it("commits the safe tool result before one structured continuation error", async () => {
    process.env.COMPRESSION_AUTO = "false";
    const context = await openProductionRuntimeContext(databasePath());
    const java = new FivePendingJavaClient();
    java.failContinuation = true;
    const runner = productionRunner(context, java);

    try {
      const final = await runner.start(input()).done;
      const events = await context.events.since(
        "tenant-a",
        "user-a",
        "conversation-a",
        null
      );
      const resultIndexes = events.flatMap((event, index) =>
        event.kind === "tool_result" ? [index] : []
      );
      const errorIndexes = events.flatMap((event, index) =>
        event.kind === "stream_error" ? [index] : []
      );

      expect(final.status).toBe("errored");
      expect(java.executions).toBe(1);
      expect(java.completions).toBe(1);
      expect(resultIndexes).toHaveLength(1);
      expect(errorIndexes).toHaveLength(1);
      expect(resultIndexes[0]).toBeLessThan(errorIndexes[0]);
      expect(events[errorIndexes[0]]?.data).toMatchObject({
        errorClass: "MODEL_ERROR",
        upstreamErrorClass: "PROTOCOL_FAILURE"
      });
      expect(JSON.stringify(events)).not.toMatch(
        /ARG-CANARY|RESULT-CANARY|BRIDGE-CANARY|AUTH-CANARY/
      );
    } finally {
      await context.close();
    }
  });
});

async function waitFor(
  predicate: () => Promise<boolean>,
  timeoutMs = 1_000
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!(await predicate())) {
    if (Date.now() >= deadline) throw new Error("Timed out waiting for condition");
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
}
