import type { JavaClient } from "./javaClient";
import { type HistoryStore } from "./history";
import { ToolRegistry } from "./toolRegistry";
import type { McpRegistry } from "./mcpRegistry";
import { beforeToolUse } from "./beforeToolUse";
import { computeCacheHints } from "./cacheHints";
import { shouldCompress, compress } from "./compression";
import { buildModelContext } from "./contextBuilder";
import { promptedMessages, injectSessionContextIfNeeded } from "./prompts/registry";
import type { PendingInjection } from "./skills/types";
import { resolveSkillPath, parseSkillMarkdown } from "./skills/loader";
import { resolveProviderCapabilities } from "./skills/capabilities";
import {
  TRACE_AGENT_START,
  TRACE_AGENT_END,
  TRACE_MODEL_NODE_START,
  TRACE_MODEL_NODE_END,
  TRACE_TOOL_EXECUTE_REQUEST,
  TRACE_OBSERVE_TOOL_RESULT,
  TRACE_FINAL_ANSWER,
  TRACE_STEP_START,
  TRACE_STEP_END,
  TRACE_STEP_BUDGET_EXHAUSTED,
  traceEvent
} from "./trace";
import type {
  AgentChatResponse,
  AgentMessage,
  ModelChatResponse,
  StopReason,
  ToolCall,
  ToolCallRequest,
  TraceEvent
} from "./types";

const DEFAULT_STEP_BUDGET = 25;

function resolveStepBudget(perRequest?: number): number {
  if (typeof perRequest === "number" && perRequest > 0) return perRequest;
  const fromEnv = Number(process.env.AGENT_STEP_BUDGET);
  if (Number.isFinite(fromEnv) && fromEnv > 0) return fromEnv;
  return DEFAULT_STEP_BUDGET;
}

export interface AgentLoopInput {
  conversationId: string;
  message: string;
  userId: string;
  tenantId: string;
  traceId: string;
  requestId: string;
  headers: Record<string, string>;
  stepBudget?: number;
}

export class AgentLoop {
  private readonly toolRegistry: ToolRegistry;
  private readonly pendingInjections = new Map<string, PendingInjection[]>();

  constructor(
    private readonly javaClient: JavaClient,
    private readonly history: HistoryStore,
    private readonly mcpRegistry?: McpRegistry
  ) {
    this.toolRegistry = new ToolRegistry(javaClient, mcpRegistry);
  }

  async run(input: AgentLoopInput): Promise<AgentChatResponse> {
    const emitted: string[] = [];
    const emit = async (event: TraceEvent) => {
      emitted.push(event.eventType);
      try {
        await this.javaClient.postTrace(event, input.headers);
      } catch {
        // Trace must not break the chat path.
      }
    };

    await emit(this.event(input, TRACE_AGENT_START, "agent start"));

    injectSessionContextIfNeeded(this.history, input.tenantId, input.userId, input.conversationId);
    this.history.append(input.tenantId, input.userId, input.conversationId, { role: "user", content: input.message });


    const catalog = await this.toolRegistry.getFrozenCatalog(input.tenantId, input.conversationId, input.headers);

    const stepBudget = resolveStepBudget(input.stepBudget);
    let stepIndex = 0;
    let stopReason: StopReason = "STEP_BUDGET_EXHAUSTED";
    let answer = "";
    let usage: { costUsdMicros?: number } | undefined;

    while (stepIndex < stepBudget) {
      await this.flushPendingInjections(input);

      stepIndex += 1;
      await emit(this.event(input, TRACE_STEP_START, "step start", { stepIndex }));

      const resp = await this.callModel(input, catalog, stepIndex, emit);
      if (typeof resp.usage?.costUsdMicros === "number") {
        usage = { costUsdMicros: resp.usage.costUsdMicros };
      }

      if (!resp.message) {
        stopReason = "EMPTY_MODEL_RESPONSE";
        break;
      }
      this.history.append(input.tenantId, input.userId, input.conversationId, resp.message);

      const toolCalls = resp.message.toolCalls ?? [];
      if (toolCalls.length === 0) {
        stopReason = "FINAL_ANSWER";
        answer = String(resp.message.content ?? "");
        break;
      }

      await this.runToolBatch(input, catalog, toolCalls, stepIndex, emit);
      await emit(this.event(input, TRACE_STEP_END, "step end", { stepIndex }));
    }

    if (stepIndex >= stepBudget && stopReason === "STEP_BUDGET_EXHAUSTED") {
      await emit(this.event(input, TRACE_STEP_BUDGET_EXHAUSTED, "step budget exhausted", { stepBudget }));
    }
    await emit(this.event(input, TRACE_FINAL_ANSWER, "final answer", { stopReason }));
    await emit(this.event(input, TRACE_AGENT_END, "agent end", { stopReason }));
    await this.autoCompress(input);
    await this.history.save(input.tenantId, input.userId, input.conversationId);
    return this.response(input, answer, emitted, stopReason, usage);
  }

  // ── Private helpers ────────────────────────────────────────────────────────

  private async callModel(
    input: AgentLoopInput,
    catalog: { catalogVersion: string; catalogHash: string; tools: unknown[] },
    stepIndex: number,
    emit: (event: TraceEvent) => Promise<void>
  ): Promise<ModelChatResponse> {
    await emit(this.event(input, TRACE_MODEL_NODE_START, "model call start", { stepIndex }));
    const context = buildModelContext(this.history.get(input.tenantId, input.userId, input.conversationId));
    const prompted = promptedMessages(context.messages);
    const messages = prompted.messages;
    const cacheHints = computeCacheHints(messages);
    const resp = await this.javaClient.chat(
      {
        requestId: input.requestId,
        conversationId: input.conversationId,
        userId: input.userId,
        tenantId: input.tenantId,
        model: "default",
        stream: false,
        messages,
        tools: catalog.tools as never,
        meta: {
          cacheEnabled: true,
          cacheHints,
          catalogVersion: catalog.catalogVersion,
          catalogHash: catalog.catalogHash,
          ...prompted.meta,
          context: context.meta
        }
      },
      input.headers
    );
    await emit(this.event(input, TRACE_MODEL_NODE_END, "model call end", { stepIndex }));
    return resp;
  }

  private async runToolBatch(
    input: AgentLoopInput,
    catalog: { catalogVersion: string; catalogHash: string },
    toolCalls: ToolCall[],
    stepIndex: number,
    emit: (event: TraceEvent) => Promise<void>
  ): Promise<void> {
    const decisions = await beforeToolUse(toolCalls, {
      requestId: input.requestId,
      conversationId: input.conversationId,
      userId: input.userId,
      tenantId: input.tenantId,
      traceId: input.traceId,
      catalogVersion: catalog.catalogVersion,
      catalogHash: catalog.catalogHash,
      sources: this.toolRegistry.getSources(input.tenantId, input.conversationId)
    }, this.javaClient, input.headers);

    const decisionMap = new Map(decisions.map(d => [d.toolCallId, d]));

    for (const toolCall of toolCalls) {
      const decision = decisionMap.get(toolCall.id);
      if (!decision || decision.decision !== "ALLOW") {
        const errorClass = decision?.decision === "REQUIRE_APPROVAL" ? "APPROVAL_REQUIRED" : "POLICY_DENY";
        this.history.append(input.tenantId, input.userId, input.conversationId, {
          role: "tool",
          toolCallId: toolCall.id,
          content: JSON.stringify({
            status: "rejected",
            errorClass,
            errorMessage: decision?.reason ?? errorClass
          })
        });
        continue;
      }
      const toolResult = await this.executeTool(input, catalog, toolCall, stepIndex, emit);
      this.history.append(input.tenantId, input.userId, input.conversationId, toolResult);
    }
  }

  private async executeTool(
    input: AgentLoopInput,
    catalog: { catalogVersion: string; catalogHash: string },
    toolCall: ToolCall,
    stepIndex: number,
    emit: (event: TraceEvent) => Promise<void>
  ): Promise<AgentMessage> {
    let args: Record<string, unknown>;
    try {
      args = JSON.parse(toolCall.argumentsRaw);
      if (args == null || Array.isArray(args) || typeof args !== "object") {
        throw new Error("argumentsRaw must parse to an object");
      }
    } catch {
      return { role: "tool", toolCallId: toolCall.id, content: "MODEL_TOOL_PARSE_ERROR" };
    }

    await emit(this.event(input, TRACE_TOOL_EXECUTE_REQUEST, "tool execute request", { toolName: toolCall.name, stepIndex }));

    if (toolCall.name === "invoke_skill") {
      const skillName = String(args.skill_name || "");
      const task = String(args.task || "");
      try {
        const skillPath = resolveSkillPath(skillName);
        const skill = parseSkillMarkdown(skillPath);

        const sessionKey = `${input.tenantId}:${input.userId}:${input.conversationId}`;
        let pending = this.pendingInjections.get(sessionKey);
        if (!pending) {
          pending = [];
          this.pendingInjections.set(sessionKey, pending);
        }
        pending.push({
          skillName,
          expandedContent: skill.content,
          task
        });

        const content = `Skill ${skillName} instructions expanded. Please proceed.`;
        await emit(this.event(input, TRACE_OBSERVE_TOOL_RESULT, "tool result", { toolName: toolCall.name, status: "ok", stepIndex }));
        return { role: "tool", toolCallId: toolCall.id, content };
      } catch (err: any) {
        await emit(this.event(input, TRACE_OBSERVE_TOOL_RESULT, "tool result", { toolName: toolCall.name, status: "error", stepIndex }));
        return {
          role: "tool",
          toolCallId: toolCall.id,
          content: JSON.stringify({ error: `Failed to load skill: ${err.message}` })
        };
      }
    }

    const source = this.toolRegistry.resolveSource(input.tenantId, input.conversationId, toolCall.name);

    if (source && source.startsWith("mcp:") && this.mcpRegistry) {
      const serverName = source.slice("mcp:".length);
      const result = await this.mcpRegistry.execute(serverName, toolCall.name, args, {
        requestId: input.requestId,
        conversationId: input.conversationId,
        toolCallId: toolCall.id
      });
      await emit(this.event(input, TRACE_OBSERVE_TOOL_RESULT, "tool result", { toolName: toolCall.name, status: result.status, source, stepIndex }));
      const content = result.status === "ok" ? JSON.stringify(result.result ?? {}) : JSON.stringify(result.error);
      return { role: "tool", toolCallId: toolCall.id, content };
    }

    const request: ToolCallRequest = {
      requestId: input.requestId,
      conversationId: input.conversationId,
      userId: input.userId,
      tenantId: input.tenantId,
      toolCallId: toolCall.id,
      toolName: toolCall.name,
      arguments: args,
      catalogVersion: catalog.catalogVersion,
      catalogHash: catalog.catalogHash,
      idempotencyKey: `${input.requestId}:${toolCall.id}`
    };
    const result = await this.javaClient.executeTool(request, input.headers);
    await emit(this.event(input, TRACE_OBSERVE_TOOL_RESULT, "tool result", { toolName: toolCall.name, status: result.status, stepIndex }));
    const content = result.status === "ok" ? JSON.stringify(result.result ?? {}) : JSON.stringify(result.error);
    return { role: "tool", toolCallId: toolCall.id, content };
  }

  private event(input: AgentLoopInput, eventType: string, name: string, attributes?: Record<string, unknown>): TraceEvent {
    return traceEvent({
      traceId: input.traceId,
      requestId: input.requestId,
      conversationId: input.conversationId,
      userId: input.userId,
      tenantId: input.tenantId,
      eventType,
      name,
      attributes
    });
  }

  private response(
    input: AgentLoopInput,
    answer: string,
    events: string[],
    stopReason: StopReason,
    usage?: { costUsdMicros?: number }
  ): AgentChatResponse {
    return {
      conversationId: input.conversationId,
      answer,
      ...(usage ? { usage } : {}),
      traceId: input.traceId,
      requestId: input.requestId,
      trace: { events },
      stopReason
    };
  }

  private async autoCompress(input: AgentLoopInput): Promise<void> {
    if (process.env.COMPRESSION_AUTO === "false") return;
    try {
      const messages = this.history.get(input.tenantId, input.userId, input.conversationId);
      if (shouldCompress(messages)) {
        await compress(input.tenantId, input.userId, input.conversationId, this.history, this.javaClient, input.headers);
      }
    } catch (e) {
      console.warn("[auto-compress] failed, skipping:", e);
    }
  }

  private async flushPendingInjections(input: AgentLoopInput): Promise<void> {
    const sessionKey = `${input.tenantId}:${input.userId}:${input.conversationId}`;
    const pending = this.pendingInjections.get(sessionKey);
    if (!pending || pending.length === 0) return;

    this.pendingInjections.set(sessionKey, []);

    const capabilities = resolveProviderCapabilities("default");

    for (const inj of pending) {
      if (capabilities.supportsSyntheticAssistantInjection) {
        this.history.append(input.tenantId, input.userId, input.conversationId, {
          role: "assistant",
          content: `[SYSTEM] Skill loaded:\n${inj.expandedContent}`,
          systemInjected: true
        } as AgentMessage);

        this.history.append(input.tenantId, input.userId, input.conversationId, {
          role: "user",
          content: `[SYSTEM] The skill instructions above have been loaded. Please proceed to execute the task now.`,
          systemInjected: true
        } as AgentMessage);
      } else {
        this.history.append(input.tenantId, input.userId, input.conversationId, {
          role: "user",
          content: `[SYSTEM] Skill instructions for ${inj.skillName} loaded:\n${inj.expandedContent}\nPlease proceed.`,
          systemInjected: true
        } as AgentMessage);
      }
    }
  }
}
