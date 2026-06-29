import type { JavaClient } from "../javaClient";
import type { AgentMessage, CatalogResponse, ToolDefinition, ToolCall, ToolCallRequest, TraceEvent } from "../types";
import type { Skill } from "../skills/types";
import { beforeToolUse } from "../beforeToolUse";
import { traceEvent } from "../trace";
import {
  buildSubagentTraceAttributes,
  TRACE_SUBAGENT_START,
  TRACE_SUBAGENT_MODEL_CALL,
  TRACE_SUBAGENT_TOOL_CALL,
  TRACE_SUBAGENT_SUMMARY,
  TRACE_SUBAGENT_END
} from "../traceTree";

const PRIVILEGED_META_TOOLS = new Set(["invoke_skill"]);

export interface SubagentParentContext {
  executionId: string;
  tenantId: string;
  conversationId: string;
  requestId: string;
  traceId: string;
  userId: string;
  headers: Record<string, string>;
  abortSignal: AbortSignal;
}

export interface SubagentRunInput {
  parent: SubagentParentContext;
  toolCallId: string;
  skill: Skill;
  task: string;
  parentCatalog: CatalogResponse;
  timeoutMs: number;
  stepIndex?: number;
  emitTrace?: (event: TraceEvent) => Promise<void>;
}

export interface SubagentRunResult {
  status: "ok" | "error";
  summary: string;
  childExecutionId: string;
  childConversationId: string;
  usage?: { costUsdMicros?: number };
  errorClass?: "SUBAGENT_ABORTED" | "SUBAGENT_TIMEOUT" | "SUBAGENT_POLICY_DENY" | "SUBAGENT_TOOL_ERROR" | "SUBAGENT_MODEL_ERROR";
  errorMessage?: string;
}

export class SubagentDispatcher {
  constructor(private readonly javaClient: JavaClient) {}

  async run(input: SubagentRunInput): Promise<SubagentRunResult> {
    const childExecutionId = `subagent-${crypto.randomUUID()}`;
    const childConversationId = `${input.parent.conversationId}::${childExecutionId}`;
    const tools = deriveChildTools(input.parentCatalog.tools, input.skill.metadata.forbidden_tools ?? []);

    const startedAt = Date.now();
    const emitSubagentTrace = async (
      eventType: string,
      name: string,
      extra?: { terminalClass?: string; costUsdMicros?: number; status?: "ok" | "error" | "timeout" }
    ) => {
      if (!input.emitTrace) return;
      const durationMs = Date.now() - startedAt;
      await input.emitTrace(traceEvent({
        traceId: input.parent.traceId,
        requestId: input.parent.requestId,
        conversationId: input.parent.conversationId,
        userId: input.parent.userId,
        tenantId: input.parent.tenantId,
        eventType,
        name,
        status: extra?.status,
        attributes: buildSubagentTraceAttributes({
          executionId: input.parent.executionId,
          childExecutionId,
          childConversationId,
          skillName: input.skill.metadata.name,
          toolCallId: input.toolCallId,
          stepIndex: input.stepIndex,
          terminalClass: extra?.terminalClass,
          durationMs,
          costUsdMicros: extra?.costUsdMicros
        })
      }));
    };

    await emitSubagentTrace(TRACE_SUBAGENT_START, "subagent start");

    if (input.parent.abortSignal.aborted) {
      await emitSubagentTrace(TRACE_SUBAGENT_END, "subagent end", { status: "error", terminalClass: "SUBAGENT_ABORTED" });
      return {
        status: "error",
        summary: "",
        childExecutionId,
        childConversationId,
        errorClass: "SUBAGENT_ABORTED",
        errorMessage: "Subagent aborted before start"
      };
    }

    const systemMessage: AgentMessage = {
      role: "system",
      content: [
        `You are an isolated subagent for skill ${input.skill.metadata.name}.`,
        "Use only the provided tools. Return a concise summary for the parent agent.",
        input.skill.content
      ].join("\n\n")
    };
    const userMessage: AgentMessage = { role: "user", content: input.task };

    await emitSubagentTrace(TRACE_SUBAGENT_MODEL_CALL, input.skill.metadata.subagent_model ?? "default");

    let maybeResponse: Awaited<ReturnType<typeof this.javaClient.chat>> | "__timeout__";
    try {
      maybeResponse = await withTimeout(
        this.javaClient.chat({
          requestId: input.parent.requestId,
          conversationId: childConversationId,
          userId: input.parent.userId,
          tenantId: input.parent.tenantId,
          model: input.skill.metadata.subagent_model ?? "default",
          stream: false,
          messages: [systemMessage, userMessage],
          tools,
          meta: {
            cacheEnabled: false
          }
        }, input.parent.headers),
        input.timeoutMs
      );
    } catch (err: any) {
      await emitSubagentTrace(TRACE_SUBAGENT_END, "subagent end", { status: "error", terminalClass: "SUBAGENT_MODEL_ERROR" });
      return {
        status: "error",
        summary: "",
        childExecutionId,
        childConversationId,
        errorClass: "SUBAGENT_MODEL_ERROR",
        errorMessage: err instanceof Error ? err.message : String(err)
      };
    }

    if (maybeResponse === "__timeout__") {
      await emitSubagentTrace(TRACE_SUBAGENT_END, "subagent end", { status: "timeout", terminalClass: "SUBAGENT_TIMEOUT" });
      return {
        status: "error",
        summary: "",
        childExecutionId,
        childConversationId,
        errorClass: "SUBAGENT_TIMEOUT",
        errorMessage: `Subagent timed out after ${input.timeoutMs}ms`
      };
    }

    const response = maybeResponse;
    let aggregatedCost = costOf(response);

    const childToolCalls = response.message?.toolCalls ?? [];
    if (childToolCalls.length === 0) {
      await emitSubagentTrace(TRACE_SUBAGENT_SUMMARY, "subagent summary", { status: "ok" });
      await emitSubagentTrace(TRACE_SUBAGENT_END, "subagent end", { status: "ok", costUsdMicros: aggregatedCost });
      return {
        status: "ok",
        summary: String(response.message?.content ?? ""),
        childExecutionId,
        childConversationId,
        usage: { costUsdMicros: aggregatedCost }
      };
    }

    const allowedToolNames = new Set(tools.map(tool => tool.name));
    for (const toolCall of childToolCalls) {
      if (!allowedToolNames.has(toolCall.name)) {
        await emitSubagentTrace(TRACE_SUBAGENT_END, "subagent end", { status: "error", terminalClass: "SUBAGENT_POLICY_DENY", costUsdMicros: aggregatedCost });
        return {
          status: "error",
          summary: "",
          childExecutionId,
          childConversationId,
          errorClass: "SUBAGENT_POLICY_DENY",
          errorMessage: `Subagent attempted to call unavailable tool: ${toolCall.name}`,
          usage: { costUsdMicros: aggregatedCost }
        };
      }
    }

    const toolPermissions = new Map<string, "safe" | "sensitive" | "destructive">();
    for (const tool of tools) {
      toolPermissions.set(tool.name, tool.permission);
    }

    const auditContext = {
      requestId: input.parent.requestId,
      conversationId: childConversationId,
      userId: input.parent.userId,
      tenantId: input.parent.tenantId,
      traceId: input.parent.traceId,
      catalogVersion: input.parentCatalog.catalogVersion,
      catalogHash: input.parentCatalog.catalogHash,
      toolPermissions
    };

    const decisions = await beforeToolUse(childToolCalls, auditContext, this.javaClient, input.parent.headers);
    const decisionMap = new Map(decisions.map(decision => [decision.toolCallId, decision]));
    for (const toolCall of childToolCalls) {
      const decision = decisionMap.get(toolCall.id);
      if (!decision || decision.decision !== "ALLOW") {
        await emitSubagentTrace(TRACE_SUBAGENT_END, "subagent end", { status: "error", terminalClass: "SUBAGENT_POLICY_DENY", costUsdMicros: aggregatedCost });
        return {
          status: "error",
          summary: "",
          childExecutionId,
          childConversationId,
          errorClass: "SUBAGENT_POLICY_DENY",
          errorMessage: `Subagent tool execution policy evaluation not ALLOWed: ${decision?.decision ?? "MISSING"}`,
          usage: { costUsdMicros: aggregatedCost }
        };
      }
    }

    const childToolResultMessages: AgentMessage[] = [];
    for (const toolCall of childToolCalls) {
      let parsedArgs: Record<string, unknown>;
      try {
        const parsed = JSON.parse(toolCall.argumentsRaw);
        if (parsed == null || Array.isArray(parsed) || typeof parsed !== "object") {
          throw new Error("not object");
        }
        parsedArgs = parsed as Record<string, unknown>;
      } catch {
        await emitSubagentTrace(TRACE_SUBAGENT_END, "subagent end", { status: "error", terminalClass: "SUBAGENT_TOOL_ERROR", costUsdMicros: aggregatedCost });
        return {
          status: "error",
          summary: "",
          childExecutionId,
          childConversationId,
          errorClass: "SUBAGENT_TOOL_ERROR",
          errorMessage: `Failed to parse tool arguments: ${toolCall.name}`,
          usage: { costUsdMicros: aggregatedCost }
        };
      }

      const toolRequest: ToolCallRequest = {
        requestId: input.parent.requestId,
        conversationId: childConversationId,
        userId: input.parent.userId,
        tenantId: input.parent.tenantId,
        toolCallId: toolCall.id,
        toolName: toolCall.name,
        arguments: parsedArgs,
        catalogVersion: input.parentCatalog.catalogVersion,
        catalogHash: input.parentCatalog.catalogHash,
        idempotencyKey: `subagent-tool-${crypto.randomUUID()}`
      };

      await emitSubagentTrace(TRACE_SUBAGENT_TOOL_CALL, toolCall.name);

      let toolResponse;
      try {
        toolResponse = await this.javaClient.executeTool(toolRequest, input.parent.headers);
      } catch (err: any) {
        await emitSubagentTrace(TRACE_SUBAGENT_END, "subagent end", { status: "error", terminalClass: "SUBAGENT_TOOL_ERROR", costUsdMicros: aggregatedCost });
        return {
          status: "error",
          summary: "",
          childExecutionId,
          childConversationId,
          errorClass: "SUBAGENT_TOOL_ERROR",
          errorMessage: err instanceof Error ? err.message : String(err),
          usage: { costUsdMicros: aggregatedCost }
        };
      }
      if (toolResponse.status !== "ok") {
        await emitSubagentTrace(TRACE_SUBAGENT_END, "subagent end", { status: "error", terminalClass: "SUBAGENT_TOOL_ERROR", costUsdMicros: aggregatedCost });
        return {
          status: "error",
          summary: "",
          childExecutionId,
          childConversationId,
          errorClass: "SUBAGENT_TOOL_ERROR",
          errorMessage: `Subagent tool execution failed: ${toolCall.name}`,
          usage: { costUsdMicros: aggregatedCost }
        };
      }

      childToolResultMessages.push({
        role: "tool" as const,
        toolCallId: toolCall.id,
        toolName: toolCall.name,
        content: typeof toolResponse.result === "string" ? toolResponse.result : JSON.stringify(toolResponse.result ?? "")
      } as AgentMessage);
    }

    const assistantMessage: AgentMessage = response.message!;
    const secondMessages: AgentMessage[] = [
      systemMessage,
      userMessage,
      assistantMessage,
      ...childToolResultMessages
    ];

    await emitSubagentTrace(TRACE_SUBAGENT_MODEL_CALL, input.skill.metadata.subagent_model ?? "default");

    let maybeSecondResponse: Awaited<ReturnType<typeof this.javaClient.chat>> | "__timeout__";
    try {
      maybeSecondResponse = await withTimeout(
        this.javaClient.chat({
          requestId: input.parent.requestId,
          conversationId: childConversationId,
          userId: input.parent.userId,
          tenantId: input.parent.tenantId,
          model: input.skill.metadata.subagent_model ?? "default",
          stream: false,
          messages: secondMessages,
          tools,
          meta: {
            cacheEnabled: false
          }
        }, input.parent.headers),
        input.timeoutMs
      );
    } catch (err: any) {
      await emitSubagentTrace(TRACE_SUBAGENT_END, "subagent end", { status: "error", terminalClass: "SUBAGENT_MODEL_ERROR", costUsdMicros: aggregatedCost });
      return {
        status: "error",
        summary: "",
        childExecutionId,
        childConversationId,
        errorClass: "SUBAGENT_MODEL_ERROR",
        errorMessage: err instanceof Error ? err.message : String(err),
        usage: { costUsdMicros: aggregatedCost }
      };
    }

    if (maybeSecondResponse === "__timeout__") {
      await emitSubagentTrace(TRACE_SUBAGENT_END, "subagent end", { status: "timeout", terminalClass: "SUBAGENT_TIMEOUT", costUsdMicros: aggregatedCost });
      return {
        status: "error",
        summary: "",
        childExecutionId,
        childConversationId,
        errorClass: "SUBAGENT_TIMEOUT",
        errorMessage: `Subagent timed out during second response after ${input.timeoutMs}ms`,
        usage: { costUsdMicros: aggregatedCost }
      };
    }

    const secondResponse = maybeSecondResponse;
    aggregatedCost += costOf(secondResponse);

    await emitSubagentTrace(TRACE_SUBAGENT_SUMMARY, "subagent summary", { status: "ok" });
    await emitSubagentTrace(TRACE_SUBAGENT_END, "subagent end", { status: "ok", costUsdMicros: aggregatedCost });

    return {
      status: "ok",
      summary: String(secondResponse.message?.content ?? ""),
      childExecutionId,
      childConversationId,
      usage: { costUsdMicros: aggregatedCost }
    };
  }
}

export function deriveChildTools(tools: ToolDefinition[], forbiddenTools: string[]): ToolDefinition[] {
  const forbidden = new Set(forbiddenTools);
  return tools.filter(tool => !forbidden.has(tool.name) && !PRIVILEGED_META_TOOLS.has(tool.name));
}

function costOf(response: { usage?: { costUsdMicros?: number } }): number {
  return typeof response.usage?.costUsdMicros === "number" ? response.usage.costUsdMicros : 0;
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T | "__timeout__"> {
  let timer: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<"__timeout__">(resolve => {
        timer = setTimeout(() => resolve("__timeout__"), timeoutMs);
      })
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}
