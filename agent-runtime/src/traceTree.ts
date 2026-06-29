import type { TraceTreeAttributes } from "@openharness/shared-schema";

export const TRACE_SUBAGENT_START = "SUBAGENT_START";
export const TRACE_SUBAGENT_MODEL_CALL = "SUBAGENT_MODEL_CALL";
export const TRACE_SUBAGENT_TOOL_CALL = "SUBAGENT_TOOL_CALL";
export const TRACE_SUBAGENT_SUMMARY = "SUBAGENT_SUMMARY";
export const TRACE_SUBAGENT_END = "SUBAGENT_END";

export interface SubagentTraceInput {
  executionId: string;
  childExecutionId: string;
  childConversationId: string;
  skillName: string;
  toolCallId: string;
  stepIndex?: number;
  terminalClass?: string;
  durationMs?: number;
  costUsdMicros?: number;
  traceIngestionStatus?: "posted" | "failed" | "skipped";
}

export function buildSubagentTraceAttributes(input: SubagentTraceInput): TraceTreeAttributes {
  return withoutUndefined({
    traceNodeKind: "subagent_execution" as const,
    executionId: input.executionId,
    parentExecutionId: input.executionId,
    childExecutionId: input.childExecutionId,
    childConversationId: input.childConversationId,
    skillName: input.skillName,
    toolCallId: input.toolCallId,
    stepIndex: input.stepIndex,
    terminalClass: input.terminalClass,
    durationMs: input.durationMs,
    costUsdMicros: input.costUsdMicros,
    traceIngestionStatus: input.traceIngestionStatus
  });
}

function withoutUndefined<T extends Record<string, unknown>>(input: T): T {
  return Object.fromEntries(
    Object.entries(input).filter(([, value]) => value !== undefined)
  ) as T;
}
