import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { AgentExecutionRunner } from "../src/agentExecutionRunner";
import { InMemoryExecutionStateStore } from "../src/executionStateStore";
import { InMemoryHistoryStore } from "../src/history";
import type { JavaClient, PolicyEvaluateResponse } from "../src/javaClient";
import { InMemoryRuntimeEventStore, type RuntimeEventPublisher } from "../src/runtimeEventStore";
import { DEFAULT_AGENT_DEFINITION } from "../src/agentDefinitionLoader";
import type { HistoryStore } from "../src/history";
import { openProductionRuntimeContext } from "../src/storage/productionRuntimeContext";
import type { AgentMessage, CatalogResponse, ModelChatRequest, ModelChatResponse, ToolCallRequest, TraceEvent } from "../src/types";

const workspaces: string[] = [];

function databasePath(): string {
  const workspace = mkdtempSync(join(tmpdir(), "openharness-production-runner-"));
  workspaces.push(workspace);
  return join(workspace, "runtime.sqlite");
}

afterEach(() => {
  delete process.env.COMPRESSION_AUTO;
  for (const workspace of workspaces.splice(0)) rmSync(workspace, { recursive: true, force: true });
});

describe("production runner lifecycle persistence", () => {
  it("commits start and final answer through SQLite without writing legacy history", async () => {
    process.env.COMPRESSION_AUTO = "false";
    const context = openProductionRuntimeContext(databasePath());
    const legacyHistory = new InMemoryHistoryStore();
    const legacyEvents = new InMemoryRuntimeEventStore();
    const executionStates = new InMemoryExecutionStateStore();
    const published: string[] = [];
    context.liveEvents.subscribe("tenant-a", "user-a", "conversation-a", event => published.push(event.kind));
    const runner = new AgentExecutionRunner(
      new FinalAnswerJavaClient(),
      legacyHistory,
      undefined,
      legacyEvents,
      executionStates,
      undefined,
      undefined,
      { lifecycle: context.lifecycle, liveEvents: context.liveEvents }
    );

    const final = await runner.start(input()).done;

    expect(final.status).toBe("completed");
    expect(legacyHistory.get("tenant-a", "user-a", "conversation-a")).toEqual([]);
    expect(context.database.transaction(tx => context.repositories.history.get(
      tx,
      "tenant-a",
      "user-a",
      "conversation-a"
    )).map(message => message.content)).toEqual(["hello", "done"]);
    expect(context.database.transaction(tx => context.repositories.execution.get(
      tx,
      "tenant-a",
      "user-a",
      "conversation-a",
      final.executionId
    ))?.status).toBe("completed");
    expect(published.filter(kind => ["agent_start", "final_answer", "agent_end", "stream_done"].includes(kind)))
      .toEqual(["agent_start", "final_answer", "agent_end", "stream_done"]);
    expect(context.events.since("tenant-a", "user-a", "conversation-a", null).find(
      event => event.kind === "final_answer"
    )?.data.usage).toEqual({ costUsdMicros: 42 });
    context.close();
  });

  it("keeps the SQLite commit authoritative when live publication throws", async () => {
    process.env.COMPRESSION_AUTO = "false";
    const context = openProductionRuntimeContext(databasePath());
    const throwingPublisher: RuntimeEventPublisher = {
      publish() {
        throw new Error("subscriber transport is down");
      },
      subscribe() {
        return () => undefined;
      }
    };
    const runner = new AgentExecutionRunner(
      new FinalAnswerJavaClient(),
      new InMemoryHistoryStore(),
      undefined,
      new InMemoryRuntimeEventStore(),
      new InMemoryExecutionStateStore(),
      undefined,
      undefined,
      { lifecycle: context.lifecycle, liveEvents: throwingPublisher }
    );

    const final = await runner.start(input()).done;

    expect(final.status).toBe("completed");
    expect(context.database.transaction(tx => context.repositories.execution.get(
      tx,
      "tenant-a",
      "user-a",
      "conversation-a",
      final.executionId
    ))?.status).toBe("completed");
    context.close();
  });

  it("persists skill injections through Lifecycle UoW without a legacy history write", async () => {
    process.env.OPENHARNESS_SKILLS_ENABLED = "true";
    const context = openProductionRuntimeContext(databasePath());
    const guardedHistory: HistoryStore = {
      ...context.history,
      append() { throw new Error("legacy history append reached"); }
    };
    const runner = new AgentExecutionRunner(
      new SkillJavaClient(),
      guardedHistory,
      undefined,
      new InMemoryRuntimeEventStore(),
      new InMemoryExecutionStateStore(),
      undefined,
      undefined,
      { lifecycle: context.lifecycle, liveEvents: context.liveEvents },
      () => ({
        metadata: {
          name: "production-persistence-skill",
          description: "Production persistence fixture",
          version: "1.0.0",
          tools_required: [],
          parameters: {}
        },
        content: "Only user-a may receive this injection.",
        sourcePath: "/injected/production-persistence-skill/SKILL.md"
      })
    );

    try {
      const final = await runner.start({
        ...input(),
        agentDefinition: {
          ...DEFAULT_AGENT_DEFINITION,
          model: "some-unsupported-model",
          tools: ["invoke_skill"]
        }
      }).done;

      expect(final.status, JSON.stringify(context.events.since("tenant-a", "user-a", "conversation-a", null))).toBe("completed");
      expect(context.events.since("tenant-a", "user-a", "conversation-a", null).filter(
        event => event.kind === "model_call_end"
      )).toHaveLength(2);
      expect(context.history.get("tenant-a", "user-a", "conversation-a").some(
        message => String(message.content).includes("Only user-a may receive this injection.")
      )).toBe(true);
    } finally {
      context.close();
      delete process.env.OPENHARNESS_SKILLS_ENABLED;
    }
  });
});

function input() {
  return {
    tenantId: "tenant-a",
    userId: "user-a",
    conversationId: "conversation-a",
    message: "hello",
    traceId: "trace-a",
    requestId: "request-a",
    headers: { Authorization: "Bearer test" },
    agentDefinition: DEFAULT_AGENT_DEFINITION
  };
}

class FinalAnswerJavaClient implements JavaClient {
  async getCatalog(): Promise<CatalogResponse> {
    return { catalogVersion: "v1", catalogHash: "hash", tools: [] };
  }

  async chat(request: ModelChatRequest): Promise<ModelChatResponse> {
    return {
      requestId: request.requestId,
      conversationId: request.conversationId,
      rawProvider: "fake",
      message: { role: "assistant", content: "done" } as AgentMessage,
      usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2, costUsdMicros: 42 }
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

  async evaluatePolicy(request: Parameters<JavaClient["evaluatePolicy"]>[0]): Promise<PolicyEvaluateResponse> {
    return { requestId: request.requestId, conversationId: request.conversationId, decisions: [] };
  }
}

class SkillJavaClient extends FinalAnswerJavaClient {
  private calls = 0;

  override async chat(request: ModelChatRequest): Promise<ModelChatResponse> {
    this.calls += 1;
    if (this.calls === 1) {
      return {
        requestId: request.requestId,
        conversationId: request.conversationId,
        rawProvider: "fake",
        message: {
          role: "assistant" as const,
          content: "",
          toolCalls: [{
            id: "skill-call",
            name: "invoke_skill",
            argumentsRaw: JSON.stringify({ skill_name: "production-persistence-skill", task: "run" })
          }]
        }
      };
    }
    return super.chat(request);
  }

  override async evaluatePolicy(request: Parameters<JavaClient["evaluatePolicy"]>[0]) {
    return {
      requestId: request.requestId,
      conversationId: request.conversationId,
      decisions: request.toolCalls.map(toolCall => ({
        toolCallId: toolCall.id,
        decision: "ALLOW" as const,
        source: "NONE" as const
      }))
    };
  }
}
