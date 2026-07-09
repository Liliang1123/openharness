export type {
  AgentMessage,
  ModelChatRequest,
  ModelChatResponse,
  RuntimeEventKind,
  SessionEvent,
  ToolCancelRequest,
  ToolCancelResponse,
  ToolCall,
  ToolCallRequest,
  ToolCallResponse,
  ToolDefinition,
  TraceEvent,
  Usage
} from "@openharness/shared-schema";

import type { ToolDefinition } from "@openharness/shared-schema";

/** Unique identifier for one agent execution turn. */
export type ExecutionId = string;

/** Per-conversation monotonic event identifier in form `${tenantId}::${conversationId}:${seq}`. */
export type EventId = string;

export type { ExecutionStatus, ExecutionState } from "./executionStateStore";

export interface CatalogResponse {
  catalogVersion: string;
  catalogHash: string;
  tools: ToolDefinition[];
}

export type StopReason =
  | "FINAL_ANSWER"
  | RuntimeTerminalError;

export type RuntimeTerminalError =
  | "MODEL_ERROR"
  | "TOOL_ERROR"
  | "POLICY_DENY"
  | "APPROVAL_TIMEOUT"
  | "EXECUTION_TIMEOUT"
  | "STEP_BUDGET_EXHAUSTED"
  | "EVENT_REPLAY_GAP"
  | "EXECUTION_ABORTED"
  | "EXECUTION_INTERRUPTED"
  | "EMPTY_MODEL_RESPONSE";

export interface AgentChatRequest {
  conversationId: string;
  message: string;
  agentId?: string;
  stepBudget?: number;
}

export interface AgentChatResponse {
  conversationId: string;
  answer: string;
  usage?: {
    costUsdMicros?: number;
  };
  traceId: string;
  requestId: string;
  trace: {
    events: string[];
  };
  stopReason?: StopReason;
}
