import type { AgentDefinition } from "@openharness/shared-schema";
import type { JavaClient } from "./javaClient";
import { hasUntrustedToolOutputSinceLastUser, type HistoryStore } from "./history";
import { ToolRegistry } from "./toolRegistry";
import type { McpRegistry } from "./mcpRegistry";
import type { RuntimeEventStore } from "./runtimeEventStore";
import type { ExecutionStateStore, ExecutionState } from "./executionStateStore";
import type { ApprovalStore, ApprovalDecision } from "./approvalStore";
import { beforeToolUse } from "./beforeToolUse";
import { computeCacheHints } from "./cacheHints";
import { shouldCompress, compress } from "./compression";
import { buildModelContext } from "./contextBuilder";
import type { MemoryFact, MemoryStore } from "./memoryStore";
import { promptedMessages, injectSessionContextIfNeeded } from "./prompts/registry";
import type { PendingInjection } from "./skills/types";
import { resolveSkillPath, parseSkillMarkdown } from "./skills/loader";
import { resolveProviderCapabilities } from "./skills/capabilities";
import { SubagentDispatcher } from "./subagent/dispatcher";
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
  AgentMessage,
  ExecutionId,
  ModelChatResponse,
  RuntimeTerminalError,
  RuntimeEventKind,
  StopReason,
  ToolCall,
  ToolCallRequest,
  TraceEvent
} from "./types";

const DEFAULT_STEP_BUDGET = 25;
const DEFAULT_APPROVAL_TIMEOUT_MS = 3_600_000;
const DEFAULT_EXECUTION_TIMEOUT_MS = 1_800_000;

type ToolResultProvenance = "trusted" | "untrusted";

class RuntimeTerminalFailure extends Error {
  constructor(
    readonly errorClass: RuntimeTerminalError,
    message: string,
    readonly details: Record<string, unknown> = {}
  ) {
    super(message);
    this.name = errorClass;
  }
}

function resolveStepBudget(perRequest?: number): number {
  if (typeof perRequest === "number" && perRequest > 0) return perRequest;
  const fromEnv = Number(process.env.AGENT_STEP_BUDGET);
  if (Number.isFinite(fromEnv) && fromEnv > 0) return fromEnv;
  return DEFAULT_STEP_BUDGET;
}

function resolveTimeoutMs(envName: string, defaultMs: number): number {
  const fromEnv = Number(process.env[envName]);
  if (Number.isFinite(fromEnv) && fromEnv > 0) return fromEnv;
  return defaultMs;
}

function resolveMemoryContextMaxFacts(): number {
  const fromEnv = Number(process.env.MEMORY_CONTEXT_MAX_FACTS);
  if (Number.isFinite(fromEnv) && fromEnv > 0) return Math.floor(fromEnv);
  return 5;
}

export interface AgentExecutionInput {
  conversationId: string;
  message: string;
  userId: string;
  tenantId: string;
  traceId: string;
  requestId: string;
  headers: Record<string, string>;
  agentDefinition: AgentDefinition;
  stepBudget?: number;
}

export interface AgentExecutionHandle {
  executionId: ExecutionId;
  /** Resolves when the runner reaches a terminal state. */
  done: Promise<ExecutionState>;
}

/**
 * Detached runner that executes an agent turn and writes events to RuntimeEventStore.
 * It does NOT hold any HTTP reply. HTTP adapters subscribe to RuntimeEventStore to forward events.
 *
 * Lifetime is decoupled from HTTP connections: a client disconnect does not cancel the runner.
 * Cancellation is explicit via ExecutionStateStore.abort(executionId).
 */
export class AgentExecutionRunner {
  private readonly toolRegistry: ToolRegistry;
  private readonly pendingInjections = new Map<string, PendingInjection[]>();
  private readonly subagentDispatcher: SubagentDispatcher;

  constructor(
    private readonly javaClient: JavaClient,
    private readonly history: HistoryStore,
    private readonly mcpRegistry: McpRegistry | undefined,
    private readonly runtimeEventStore: RuntimeEventStore,
    private readonly executionStateStore: ExecutionStateStore,
    private readonly approvalStore?: ApprovalStore,
    private readonly memoryStore?: MemoryStore
  ) {
    this.toolRegistry = new ToolRegistry(javaClient, mcpRegistry);
    this.subagentDispatcher = new SubagentDispatcher(javaClient);
  }

  start(input: AgentExecutionInput): AgentExecutionHandle {
    const executionId: ExecutionId = crypto.randomUUID();
    this.executionStateStore.create({
      executionId,
      conversationId: input.conversationId,
      tenantId: input.tenantId
    });
    const done = this.runLoop(executionId, input);
    return { executionId, done };
  }

  // ── Loop ───────────────────────────────────────────────────────────────────

  private async runLoop(executionId: ExecutionId, input: AgentExecutionInput): Promise<ExecutionState> {
    const executionDeadline = Date.now() + resolveTimeoutMs("EXECUTION_TIMEOUT_MS", DEFAULT_EXECUTION_TIMEOUT_MS);

    const send = (kind: RuntimeEventKind, payload: Record<string, unknown> = {}) => {
      this.runtimeEventStore.append(input.tenantId, input.conversationId, {
        executionId,
        conversationId: input.conversationId,
        tenantId: input.tenantId,
        traceId: input.traceId,
        requestId: input.requestId,
        createdAt: Date.now(),
        kind,
        data: payload
      });
    };

    const emit = async (ev: TraceEvent) => {
      send("trace", { ...ev });
      try { await this.javaClient.postTrace(ev, input.headers); } catch { /* trace must not break */ }
    };

    const isAborted = (): boolean => {
      const state = this.executionStateStore.get(executionId);
      return state?.abortController.signal.aborted ?? false;
    };

    try {
      send("agent_start", { traceId: input.traceId, conversationId: input.conversationId });
      await emit(this.ev(input, TRACE_AGENT_START, "agent start"));

      injectSessionContextIfNeeded(this.history, input.tenantId, input.conversationId, this.selectedModel(input));
      this.history.append(input.tenantId, input.conversationId, { role: "user", content: input.message });
      const catalog = await this.withExecutionDeadline(
        executionId,
        executionDeadline,
        this.toolRegistry.getFrozenCatalog(input.tenantId, input.conversationId, input.headers)
      );

      const stepBudget = resolveStepBudget(input.stepBudget);
      let stepIndex = 0;
      let stopReason: StopReason = "STEP_BUDGET_EXHAUSTED";
      let answer = "";
      let usage: { costUsdMicros?: number } | undefined;

      while (stepIndex < stepBudget) {
        if (isAborted()) {
          return this.finalizeAborted(executionId, send, emit, input);
        }

        await this.flushPendingInjections(input);

        stepIndex += 1;
        await emit(this.ev(input, TRACE_STEP_START, "step start", { stepIndex }));

        send("model_call_start", { stepIndex });
        await emit(this.ev(input, TRACE_MODEL_NODE_START, "model call start", { stepIndex }));
        const resp = await this.withExecutionDeadline(
          executionId,
          executionDeadline,
          this.callModel(input, catalog)
        );
        if (typeof resp.usage?.costUsdMicros === "number") {
          usage = { costUsdMicros: resp.usage.costUsdMicros };
        }
        await emit(this.ev(input, TRACE_MODEL_NODE_END, "model call end", { stepIndex }));
        send("model_call_end", { stepIndex, hasToolCalls: !!(resp.message?.toolCalls?.length) });

        if (isAborted()) {
          return this.finalizeAborted(executionId, send, emit, input);
        }

        if (resp.error) {
          throw new RuntimeTerminalFailure("MODEL_ERROR", resp.error.errorMessage, {
            upstreamErrorClass: resp.error.errorClass,
            stepIndex
          });
        }

        if (!resp.message) {
          throw new RuntimeTerminalFailure("EMPTY_MODEL_RESPONSE", "Model response did not include a message", { stepIndex });
        }
        this.history.append(input.tenantId, input.conversationId, resp.message);

        const toolCalls = resp.message.toolCalls ?? [];
        this.assertToolCallsAllowed(input, toolCalls, stepIndex);
        if (toolCalls.length === 0) {
          stopReason = "FINAL_ANSWER";
          answer = String(resp.message.content ?? "");
          break;
        }

        await this.withExecutionDeadline(
          executionId,
          executionDeadline,
          this.runToolBatch(input, catalog, toolCalls, stepIndex, send, emit, isAborted)
        );

        if (isAborted()) {
          return this.finalizeAborted(executionId, send, emit, input);
        }

        await emit(this.ev(input, TRACE_STEP_END, "step end", { stepIndex }));
      }

      if (stepIndex >= stepBudget && stopReason === "STEP_BUDGET_EXHAUSTED") {
        await emit(this.ev(input, TRACE_STEP_BUDGET_EXHAUSTED, "step budget exhausted", { stepBudget }));
        send("step_budget_exhausted", { stepBudget });
        throw new RuntimeTerminalFailure("STEP_BUDGET_EXHAUSTED", `Step budget exhausted: ${stepBudget}`, { stepBudget });
      }

      send("final_answer", usage ? { answer, usage } : { answer });
      await emit(this.ev(input, TRACE_FINAL_ANSWER, "final answer", { stopReason }));
      send("agent_end", { stopReason });
      await emit(this.ev(input, TRACE_AGENT_END, "agent end", { stopReason }));

      await this.withExecutionDeadline(executionId, executionDeadline, this.autoCompress(input));
      await this.withExecutionDeadline(executionId, executionDeadline, this.history.save(input.tenantId, input.conversationId));

      // Transition state to terminal BEFORE the terminal SSE event so that any client
      // reading `stream_done` can immediately observe a consistent terminal state.
      const final = this.executionStateStore.transitionToTerminal(executionId, "completed", stopReason);
      send("stream_done", { stopReason });
      return final ?? this.executionStateStore.get(executionId)!;
    } catch (e) {
      const errorClass = e instanceof RuntimeTerminalFailure
        ? e.errorClass
        : "MODEL_ERROR";
      const errorMessage = e instanceof Error ? e.message : String(e);
      const final = this.executionStateStore.transitionToTerminal(executionId, "errored", errorClass);
      const details = e instanceof RuntimeTerminalFailure ? e.details : {};
      send("stream_error", { errorClass, errorMessage, ...details });
      return final ?? this.executionStateStore.get(executionId)!;
    }
  }

  private finalizeAborted(
    executionId: ExecutionId,
    send: (kind: RuntimeEventKind, payload?: Record<string, unknown>) => void,
    _emit: (ev: TraceEvent) => Promise<void>,
    _input: AgentExecutionInput
  ): ExecutionState {
    // Ensure terminal state BEFORE emitting the SSE terminal event so subscribers
    // observing stream_error see a consistent ExecutionState.
    const current = this.executionStateStore.get(executionId);
    if (current && (current.status === "completed" || current.status === "errored")) {
      return current;
    }
    if (current && current.status === "running") {
      this.executionStateStore.transitionToTerminal(executionId, "aborted", "EXECUTION_ABORTED");
    }
    send("stream_error", {
      errorClass: "EXECUTION_ABORTED",
      errorMessage: "Execution was aborted by client"
    });
    return this.executionStateStore.get(executionId)!;
  }

  // ── Helpers (mostly copied from former AgentStreamLoop, minus reply.raw writes) ──

  private modelVisibleTools(input: AgentExecutionInput, catalog: { tools: unknown[] }): unknown[] {
    if (this.preservesDefaultToolExposure(input)) {
      return catalog.tools.filter(tool => (tool as any).name !== "invoke_skill");
    }
    const allowed = new Set(input.agentDefinition.tools);
    return catalog.tools.filter((tool) => {
      const name = (tool as { name?: unknown }).name;
      return typeof name === "string" && allowed.has(name);
    });
  }

  private preservesDefaultToolExposure(input: AgentExecutionInput): boolean {
    return input.agentDefinition.agentId === "default-agent" && input.agentDefinition.tools.length === 0;
  }

  private agentToolMode(input: AgentExecutionInput): "default_full" | "allow_list" {
    return this.preservesDefaultToolExposure(input) ? "default_full" : "allow_list";
  }

  private selectedModel(input: AgentExecutionInput): string {
    return input.agentDefinition.model ?? "default";
  }

  private agentDefinitionMeta(input: AgentExecutionInput, modelVisibleTools: unknown[]): {
    agentId: string;
    agentPromptRef: string;
    agentToolMode: "default_full" | "allow_list";
    agentAllowedTools: string[];
    modelVisibleTools: string[];
  } {
    return {
      agentId: input.agentDefinition.agentId,
      agentPromptRef: input.agentDefinition.promptRef,
      agentToolMode: this.agentToolMode(input),
      agentAllowedTools: [...input.agentDefinition.tools],
      modelVisibleTools: modelVisibleTools.flatMap((tool) => {
        const name = (tool as { name?: unknown }).name;
        return typeof name === "string" ? [name] : [];
      })
    };
  }

  private assertToolCallsAllowed(input: AgentExecutionInput, toolCalls: ToolCall[], stepIndex: number): void {
    if (this.preservesDefaultToolExposure(input)) {
      return;
    }
    const allowed = new Set(input.agentDefinition.tools);
    for (const toolCall of toolCalls) {
      if (!allowed.has(toolCall.name)) {
        throw new RuntimeTerminalFailure(
          "POLICY_DENY",
          `Tool not allowed by agent definition: ${toolCall.name}`,
          {
            stepIndex,
            agentId: input.agentDefinition.agentId,
            toolName: toolCall.name
          }
        );
      }
    }
  }

  private async callModel(
    input: AgentExecutionInput,
    catalog: { catalogVersion: string; catalogHash: string; tools: unknown[] }
  ): Promise<ModelChatResponse> {
    const memoryFacts = await this.retrieveMemoryFacts(input);
    const context = buildModelContext(this.history.get(input.tenantId, input.conversationId), { memoryFacts });
    const prompted = promptedMessages(context.messages, input.agentDefinition.promptRef);
    const messages = prompted.messages;
    const cacheHints = computeCacheHints(messages);
    const tools = this.modelVisibleTools(input, catalog);
    const agentDefinitionMeta = this.agentDefinitionMeta(input, tools);
    return this.javaClient.chat({
      requestId: input.requestId,
      conversationId: input.conversationId,
      userId: input.userId,
      tenantId: input.tenantId,
      model: this.selectedModel(input),
      stream: false,
      messages,
      tools: tools as never,
      meta: {
        cacheEnabled: true,
        cacheHints,
        catalogVersion: catalog.catalogVersion,
        catalogHash: catalog.catalogHash,
        ...prompted.meta,
        ...agentDefinitionMeta,
        context: context.meta
      }
    }, input.headers);
  }

  private async retrieveMemoryFacts(input: AgentExecutionInput): Promise<MemoryFact[]> {
    if (!this.memoryStore) return [];
    try {
      const facts = await this.memoryStore.search(input.tenantId, input.userId, input.message);
      return facts.slice(0, resolveMemoryContextMaxFacts());
    } catch {
      return [];
    }
  }

  private async runToolBatch(
    input: AgentExecutionInput,
    catalog: { catalogVersion: string; catalogHash: string },
    toolCalls: ToolCall[],
    stepIndex: number,
    send: (event: RuntimeEventKind, data: Record<string, unknown>) => void,
    emit: (ev: TraceEvent) => Promise<void>,
    isAborted: () => boolean
  ): Promise<void> {
    const decisions = await beforeToolUse(toolCalls, {
      requestId: input.requestId,
      conversationId: input.conversationId,
      userId: input.userId,
      tenantId: input.tenantId,
      traceId: input.traceId,
      catalogVersion: catalog.catalogVersion,
      catalogHash: catalog.catalogHash,
      sources: this.toolRegistry.getSources(input.tenantId, input.conversationId),
      untrustedToolOutputSinceLastUser: hasUntrustedToolOutputSinceLastUser(this.history.get(input.tenantId, input.conversationId)),
      toolPermissions: this.toolRegistry.getPermissions(input.tenantId, input.conversationId)
    }, this.javaClient, input.headers);

    const decisionMap = new Map(decisions.map(d => [d.toolCallId, d]));

    for (const toolCall of toolCalls) {
      if (isAborted()) return;

      const decision = decisionMap.get(toolCall.id);
      if (!decision || decision.decision !== "ALLOW") {
        if (decision?.decision === "REQUIRE_APPROVAL" && this.approvalStore) {
          const pending = this.approvalStore.createPending({
            tenantId: input.tenantId,
            conversationId: input.conversationId,
            executionId: this.currentExecutionId(input.tenantId, input.conversationId),
            toolCallId: toolCall.id,
            toolName: toolCall.name,
            argumentsRaw: toolCall.argumentsRaw,
            reason: decision.reason,
            approvalToken: decision.approvalToken
          });
          this.executionStateStore.transition(pending.executionId, "waiting_approval");
          send("approval_requested", {
            askUserId: pending.askUserId,
            toolCallId: toolCall.id,
            toolName: toolCall.name,
            argumentsRaw: toolCall.argumentsRaw,
            reason: decision.reason,
            approvalToken: decision.approvalToken,
            stepIndex
          });
          const approval = await this.withApprovalTimeout(
            this.approvalStore.waitForDecision(pending.executionId, toolCall.id),
            toolCall.id,
            toolCall.name
          );
          this.executionStateStore.transition(pending.executionId, "running");
          if (approval.action === "reject") {
            this.history.append(input.tenantId, input.conversationId, {
              role: "tool",
              toolCallId: toolCall.id,
              toolName: toolCall.name,
              toolResultProvenance: "trusted",
              content: JSON.stringify({ rejected: true, message: approval.message ?? "USER_REJECTED" })
            });
            send("tool_result", { toolCallId: toolCall.id, toolName: toolCall.name, status: "rejected", stepIndex });
            continue;
          }
          const approvedToolCall = withApprovedArguments(toolCall, approval);
          send("tool_call", { toolCallId: approvedToolCall.id, toolName: approvedToolCall.name, stepIndex });
          const toolResult = await this.executeTool(input, catalog, approvedToolCall, stepIndex, emit, pending.approvalToken);
          this.history.append(input.tenantId, input.conversationId, toolResult);
          send("tool_result", { toolCallId: approvedToolCall.id, toolName: approvedToolCall.name, status: "ok", stepIndex });
          continue;
        }
        const status = decision?.decision === "REQUIRE_APPROVAL" ? "pending_approval" : "denied";
        send("tool_result", { toolCallId: toolCall.id, toolName: toolCall.name, status, reason: decision?.reason, stepIndex });
        throw new RuntimeTerminalFailure("POLICY_DENY", decision?.reason ?? "Tool execution denied by policy", {
          toolCallId: toolCall.id,
          toolName: toolCall.name,
          stepIndex
        });
      }
      send("tool_call", { toolCallId: toolCall.id, toolName: toolCall.name, stepIndex });
      const toolResult = await this.executeTool(input, catalog, toolCall, stepIndex, emit);
      this.history.append(input.tenantId, input.conversationId, toolResult);
      send("tool_result", { toolCallId: toolCall.id, toolName: toolCall.name, status: "ok", stepIndex });
    }
  }

  private currentExecutionId(tenantId: string, conversationId: string): ExecutionId {
    const active = this.executionStateStore.getActive(tenantId, conversationId);
    if (!active) throw new Error("No active execution");
    return active.executionId;
  }

  private async executeTool(
    input: AgentExecutionInput,
    catalog: { catalogVersion: string; catalogHash: string },
    toolCall: ToolCall,
    stepIndex: number,
    emit: (ev: TraceEvent) => Promise<void>,
    approvalToken?: string
  ): Promise<AgentMessage> {
    let args: Record<string, unknown>;
    try {
      args = JSON.parse(toolCall.argumentsRaw);
      if (args == null || Array.isArray(args) || typeof args !== "object") throw new Error("not object");
    } catch {
      return toolMessage(toolCall.id, toolCall.name, "MODEL_TOOL_PARSE_ERROR", "trusted");
    }

    await emit(this.ev(input, TRACE_TOOL_EXECUTE_REQUEST, "tool execute request", { toolName: toolCall.name, stepIndex }));

    if (toolCall.name === "invoke_skill") {
      const skillName = String(args.skill_name || "");
      const task = String(args.task || "");
      try {
        const skillPath = resolveSkillPath(skillName);
        const skill = parseSkillMarkdown(skillPath);

        if (skill.metadata.fork_agent === true) {
          const executionId = this.currentExecutionId(input.tenantId, input.conversationId);
          const parentState = this.executionStateStore.get(executionId);
          const subagentResult = await this.subagentDispatcher.run({
            parent: {
              executionId,
              tenantId: input.tenantId,
              conversationId: input.conversationId,
              requestId: input.requestId,
              traceId: input.traceId,
              userId: input.userId,
              headers: input.headers,
              abortSignal: parentState?.abortController.signal ?? new AbortController().signal
            },
            toolCallId: toolCall.id,
            skill,
            task,
            parentCatalog: {
              catalogVersion: catalog.catalogVersion,
              catalogHash: catalog.catalogHash,
              tools: this.toolRegistry.getCatalogTools(input.tenantId, input.conversationId)
            },
            timeoutMs: resolveTimeoutMs("SUBAGENT_TIMEOUT_MS", 300_000),
            stepIndex,
            emitTrace: emit
          });

          if (subagentResult.status === "error") {
            await emit(this.ev(input, TRACE_OBSERVE_TOOL_RESULT, "tool result", {
              toolName: toolCall.name,
              status: "error",
              stepIndex,
              childExecutionId: subagentResult.childExecutionId,
              errorClass: subagentResult.errorClass
            }));
            throw new RuntimeTerminalFailure("TOOL_ERROR", subagentResult.errorMessage ?? "Subagent failed", {
              toolCallId: toolCall.id,
              toolName: toolCall.name,
              stepIndex,
              childExecutionId: subagentResult.childExecutionId,
              errorClass: subagentResult.errorClass
            });
          }

          await emit(this.ev(input, TRACE_OBSERVE_TOOL_RESULT, "tool result", {
            toolName: toolCall.name,
            status: "ok",
            stepIndex,
            childExecutionId: subagentResult.childExecutionId,
            childConversationId: subagentResult.childConversationId,
            subagentCostUsdMicros: subagentResult.usage?.costUsdMicros
          }));
          return toolMessage(toolCall.id, toolCall.name, subagentResult.summary, "trusted");
        }

        const sessionKey = `${input.tenantId}:${input.conversationId}`;
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
        await emit(this.ev(input, TRACE_OBSERVE_TOOL_RESULT, "tool result", { toolName: toolCall.name, status: "ok", stepIndex }));
        return toolMessage(toolCall.id, toolCall.name, content, "trusted");
      } catch (err: any) {
        if (err instanceof RuntimeTerminalFailure) {
          throw err;
        }
        await emit(this.ev(input, TRACE_OBSERVE_TOOL_RESULT, "tool result", { toolName: toolCall.name, status: "error", stepIndex }));
        throw new RuntimeTerminalFailure("TOOL_ERROR", `Failed to load skill: ${err.message}`, {
          toolCallId: toolCall.id,
          toolName: toolCall.name,
          stepIndex
        });
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
      await emit(this.ev(input, TRACE_OBSERVE_TOOL_RESULT, "tool result", { toolName: toolCall.name, status: result.status, source, stepIndex }));
      if (result.status !== "ok") {
        throw new RuntimeTerminalFailure("TOOL_ERROR", "MCP tool execution failed", {
          toolCallId: toolCall.id,
          toolName: toolCall.name,
          source,
          stepIndex
        });
      }
      const content = JSON.stringify(result.result ?? {});
      return toolMessage(toolCall.id, toolCall.name, content, "untrusted");
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
      idempotencyKey: `${input.requestId}:${toolCall.id}`,
      approvalToken
    };
    const result = await this.javaClient.executeTool(request, input.headers);
    await emit(this.ev(input, TRACE_OBSERVE_TOOL_RESULT, "tool result", { toolName: toolCall.name, status: result.status, stepIndex }));
    if (result.status !== "ok") {
      throw new RuntimeTerminalFailure("TOOL_ERROR", result.error.errorMessage, {
        upstreamErrorClass: result.error.errorClass,
        toolCallId: toolCall.id,
        toolName: toolCall.name,
        stepIndex
      });
    }
    const content = JSON.stringify(result.result ?? {});
    const provenance = result.provenance ?? "trusted";
    return toolMessage(toolCall.id, toolCall.name, content, provenance);
  }

  private ev(input: AgentExecutionInput, eventType: string, name: string, attributes?: Record<string, unknown>): TraceEvent {
    return traceEvent({
      traceId: input.traceId,
      requestId: input.requestId,
      conversationId: input.conversationId,
      userId: input.userId,
      tenantId: input.tenantId,
      agentId: input.agentDefinition.agentId,
      eventType,
      name,
      attributes
    });
  }

  private async autoCompress(input: AgentExecutionInput): Promise<void> {
    if (process.env.COMPRESSION_AUTO === "false") return;
    try {
      const messages = this.history.get(input.tenantId, input.conversationId);
      if (shouldCompress(messages)) {
        await compress(input.tenantId, input.conversationId, this.history, this.javaClient, input.headers);
      }
    } catch (e) {
      console.warn("[auto-compress] failed, skipping:", e);
    }
  }

  private async withApprovalTimeout<T>(promise: Promise<T>, toolCallId: string, toolName: string): Promise<T> {
    const timeoutMs = resolveTimeoutMs("APPROVAL_TIMEOUT_MS", DEFAULT_APPROVAL_TIMEOUT_MS);
    return this.withTimeout(promise, timeoutMs, () => new RuntimeTerminalFailure(
      "APPROVAL_TIMEOUT",
      `Approval timed out after ${timeoutMs}ms`,
      { toolCallId, toolName, timeoutMs }
    ));
  }

  private async withExecutionDeadline<T>(executionId: ExecutionId, deadline: number, promise: Promise<T>): Promise<T> {
    const timeoutMs = deadline - Date.now();
    if (timeoutMs <= 0) {
      this.executionStateStore.get(executionId)?.abortController.abort();
      throw new RuntimeTerminalFailure("EXECUTION_TIMEOUT", "Execution timed out", { timeoutMs: 0 });
    }
    return this.withTimeout(promise, timeoutMs, () => {
      this.executionStateStore.get(executionId)?.abortController.abort();
      return new RuntimeTerminalFailure("EXECUTION_TIMEOUT", `Execution timed out after ${timeoutMs}ms`, { timeoutMs });
    });
  }

  private async withTimeout<T>(
    promise: Promise<T>,
    timeoutMs: number,
    onTimeout: () => RuntimeTerminalFailure
  ): Promise<T> {
    let timeout: NodeJS.Timeout | null = null;
    try {
      return await Promise.race([
        promise,
        new Promise<never>((_resolve, reject) => {
          timeout = setTimeout(() => reject(onTimeout()), timeoutMs);
        })
      ]);
    } finally {
      if (timeout) clearTimeout(timeout);
    }
  }

  private async flushPendingInjections(input: AgentExecutionInput): Promise<void> {
    const sessionKey = `${input.tenantId}:${input.conversationId}`;
    const pending = this.pendingInjections.get(sessionKey);
    if (!pending || pending.length === 0) return;

    this.pendingInjections.set(sessionKey, []);

    const modelName = this.selectedModel(input);
    const capabilities = resolveProviderCapabilities(modelName, (input.agentDefinition as any).metadata);

    for (const inj of pending) {
      if (capabilities.supportsSyntheticAssistantInjection) {
        this.history.append(input.tenantId, input.conversationId, {
          role: "assistant",
          content: `[SYSTEM] Skill loaded:\n${inj.expandedContent}`,
          systemInjected: true
        } as AgentMessage);

        this.history.append(input.tenantId, input.conversationId, {
          role: "user",
          content: `[SYSTEM] The skill instructions above have been loaded. Please proceed to execute the task now.`,
          systemInjected: true
        } as AgentMessage);
      } else {
        this.history.append(input.tenantId, input.conversationId, {
          role: "user",
          content: `[SYSTEM] Skill instructions for ${inj.skillName} loaded:\n${inj.expandedContent}\nPlease proceed.`,
          systemInjected: true
        } as AgentMessage);
      }
    }
  }
}

function wrapUntrustedToolOutput(toolName: string, content: string): string {
  return `<tool_output trust="untrusted" tool="${toolName}">\n${content}\n</tool_output>`;
}

function toolMessage(
  toolCallId: string,
  toolName: string,
  content: string,
  provenance: ToolResultProvenance
): AgentMessage {
  return {
    role: "tool",
    toolCallId,
    toolName,
    toolResultProvenance: provenance,
    content: provenance === "untrusted" ? wrapUntrustedToolOutput(toolName, content) : content
  };
}

function withApprovedArguments<T extends ToolCall>(toolCall: T, approval: ApprovalDecision): T {
  if (approval.action !== "revise" || !approval.revisedArguments) return toolCall;
  return {
    ...toolCall,
    argumentsRaw: JSON.stringify(approval.revisedArguments)
  };
}
