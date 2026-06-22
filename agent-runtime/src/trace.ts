import type { TraceEvent } from "./types";

// ── Event type constants ─────────────────────────────────────────────────────
// These are the only event types emitted by agent-runtime. Backend and frontend
// emit other event types (e.g. MODEL_CALL_START on backend). Keep names ALL_CAPS.

export const TRACE_AGENT_START = "AGENT_START";
export const TRACE_AGENT_END = "AGENT_END";
export const TRACE_MODEL_NODE_START = "MODEL_NODE_START";
export const TRACE_MODEL_NODE_END = "MODEL_NODE_END";
export const TRACE_TOOL_EXECUTE_REQUEST = "TOOL_EXECUTE_REQUEST";
export const TRACE_OBSERVE_TOOL_RESULT = "OBSERVE_TOOL_RESULT";
export const TRACE_FINAL_ANSWER = "FINAL_ANSWER";
export const TRACE_STEP_START = "STEP_START";
export const TRACE_STEP_END = "STEP_END";
export const TRACE_STEP_BUDGET_EXHAUSTED = "STEP_BUDGET_EXHAUSTED";

export function traceEvent(input: {
  traceId: string;
  requestId: string;
  conversationId: string;
  userId: string;
  tenantId: string;
  agentId?: string;
  eventType: string;
  name: string;
  status?: "ok" | "error" | "timeout";
  attributes?: Record<string, unknown>;
  parentSpanId?: string;
}): TraceEvent {
  return {
    traceId: input.traceId,
    spanId: crypto.randomUUID(),
    parentSpanId: input.parentSpanId,
    requestId: input.requestId,
    conversationId: input.conversationId,
    userId: input.userId,
    tenantId: input.tenantId,
    agentId: input.agentId,
    runtime: "agent-runtime",
    eventType: input.eventType,
    name: input.name,
    attributes: input.attributes,
    status: input.status ?? "ok",
    startTime: Date.now()
  };
}
