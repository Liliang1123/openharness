import type {
  RuntimeProgressActivity,
  RuntimeProgressDetail,
  RuntimeProgressRecentEvent,
  RuntimeProgressSnapshot,
  SessionEvent
} from "@openharness/shared-schema";
import type { ExecutionState } from "./executionStateStore";

export interface DeriveRuntimeProgressInput {
  events: SessionEvent[];
  state?: ExecutionState | null;
}

export function deriveRuntimeProgress(input: DeriveRuntimeProgressInput): RuntimeProgressSnapshot | null {
  const events = [...input.events].sort((a, b) => a.createdAt - b.createdAt);
  const first = events[0];
  const last = events[events.length - 1];
  const state = input.state ?? null;
  if (!first && !state) return null;

  const identity = first ?? {
    executionId: state!.executionId,
    conversationId: state!.conversationId,
    tenantId: state!.tenantId,
    traceId: "",
    requestId: "",
    createdAt: state!.startedAt
  };
  const startedAt = state?.startedAt ?? first?.createdAt ?? Date.now();
  const updatedAt = state?.updatedAt ?? last?.createdAt ?? startedAt;
  const endedAt = state?.endedAt ?? terminalEndedAt(last);
  const status = state?.status ?? statusFromEvents(events);
  const activityEvent = latestActivityEvent(events);
  const detailEvent = latestDetailEvent(events, status);
  const activity = currentActivity(status, activityEvent);
  const detail = currentDetail(status, detailEvent, state);
  const currentStep = latestStep(events);

  return {
    conversationId: identity.conversationId,
    executionId: identity.executionId,
    tenantId: identity.tenantId,
    traceId: identity.traceId,
    requestId: identity.requestId,
    status,
    currentActivity: activity,
    startedAt,
    updatedAt,
    ...(endedAt !== undefined ? { endedAt } : {}),
    elapsedMs: Math.max(0, (endedAt ?? updatedAt) - startedAt),
    ...(currentStep !== undefined ? { currentStep } : {}),
    maxObservedStep: maxObservedStep(events),
    modelCalls: events.filter((event) => event.kind === "model_call_start").length,
    toolCalls: events.filter((event) => event.kind === "tool_call").length,
    subagentCalls: countSubagentCalls(events),
    ...(detail ? { detail } : {}),
    recentEvents: recentEvents(events)
  };
}

function statusFromEvents(events: SessionEvent[]): RuntimeProgressSnapshot["status"] {
  const last = events[events.length - 1];
  if (last?.kind === "stream_done") return "completed";
  if (last?.kind === "stream_error") {
    return stringValue(last.data.errorClass) === "EXECUTION_ABORTED" ? "aborted" : "errored";
  }
  return "running";
}

function currentActivity(
  status: RuntimeProgressSnapshot["status"],
  event: SessionEvent | undefined
): RuntimeProgressActivity {
  if (status === "completed" || status === "aborted" || status === "errored") return "terminal";
  if (status === "waiting_approval") return "waiting_approval";
  if (!event) return "idle";
  if (event.kind === "model_call_start") return "model_call";
  if (event.kind === "tool_call" || event.kind === "tool_result") return "tool_call";
  if (isSubagentTrace(event)) return "subagent";
  return "idle";
}

function currentDetail(
  status: RuntimeProgressSnapshot["status"],
  last: SessionEvent | undefined,
  state: ExecutionState | null
): RuntimeProgressDetail | undefined {
  const detail: RuntimeProgressDetail = {};

  if (status === "completed" || status === "aborted" || status === "errored") {
    const terminalClass = stringValue(last?.data.errorClass) ?? state?.endReason;
    if (terminalClass) detail.terminalClass = terminalClass;
    return Object.keys(detail).length > 0 ? detail : undefined;
  }

  const toolCallId = stringValue(last?.data.toolCallId);
  const toolName = stringValue(last?.data.toolName);
  const askUserId = stringValue(last?.data.askUserId);
  const reason = stringValue(last?.data.reason);
  if (toolCallId) detail.toolCallId = toolCallId;
  if (toolName) detail.toolName = toolName;
  if (askUserId) detail.askUserId = askUserId;
  if (reason) detail.reason = reason;

  const attrs = attributes(last);
  const skillName = stringValue(attrs?.skillName);
  const childExecutionId = stringValue(attrs?.childExecutionId);
  const childConversationId = stringValue(attrs?.childConversationId);
  const costUsdMicros = numberValue(attrs?.costUsdMicros ?? last?.data.costUsdMicros);
  if (skillName) detail.skillName = skillName;
  if (childExecutionId) detail.childExecutionId = childExecutionId;
  if (childConversationId) detail.childConversationId = childConversationId;
  if (costUsdMicros !== undefined) detail.costUsdMicros = costUsdMicros;

  return Object.keys(detail).length > 0 ? detail : undefined;
}

function recentEvents(events: SessionEvent[]): RuntimeProgressRecentEvent[] {
  return events.slice(-8).map((event) => {
    const recent: RuntimeProgressRecentEvent = {
      kind: event.kind,
      createdAt: Math.max(0, event.createdAt)
    };
    const stepIndex = numberValue(event.data.stepIndex ?? attributes(event)?.stepIndex);
    const status = stringValue(event.data.status);
    const toolName = stringValue(event.data.toolName);
    if (stepIndex !== undefined && stepIndex > 0) recent.stepIndex = stepIndex;
    if (status) recent.status = status;
    if (toolName) recent.toolName = toolName;
    return recent;
  });
}

function maxObservedStep(events: SessionEvent[]): number {
  return events.reduce((max, event) => Math.max(max, latestEventStep(event) ?? 0), 0);
}

function latestStep(events: SessionEvent[]): number | undefined {
  for (let i = events.length - 1; i >= 0; i -= 1) {
    const step = latestEventStep(events[i]);
    if (step !== undefined && step > 0) return step;
  }
  return undefined;
}

function latestEventStep(event: SessionEvent): number | undefined {
  return numberValue(event.data.stepIndex ?? attributes(event)?.stepIndex);
}

function countSubagentCalls(events: SessionEvent[]): number {
  const childIds = new Set<string>();
  let anonymous = 0;
  for (const event of events) {
    if (!isSubagentTrace(event)) continue;
    const childId = stringValue(attributes(event)?.childExecutionId);
    if (childId) childIds.add(childId);
    else anonymous += 1;
  }
  return childIds.size + anonymous;
}

function latestActivityEvent(events: SessionEvent[]): SessionEvent | undefined {
  for (let i = events.length - 1; i >= 0; i -= 1) {
    const event = events[i];
    if (
      event.kind === "model_call_start" ||
      event.kind === "model_call_end" ||
      event.kind === "tool_call" ||
      event.kind === "tool_result" ||
      event.kind === "approval_requested" ||
      isSubagentTrace(event)
    ) {
      return event;
    }
  }
  return undefined;
}

function latestDetailEvent(
  events: SessionEvent[],
  status: RuntimeProgressSnapshot["status"]
): SessionEvent | undefined {
  if (status === "completed" || status === "aborted" || status === "errored") {
    return [...events].reverse().find((event) => event.kind === "stream_error" || event.kind === "stream_done");
  }
  return latestActivityEvent(events);
}

function isSubagentTrace(event: SessionEvent): boolean {
  return event.kind === "trace" && attributes(event)?.traceNodeKind === "subagent_execution";
}

function attributes(event: SessionEvent | undefined): Record<string, unknown> | undefined {
  const value = event?.data.attributes;
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  return value as Record<string, unknown>;
}

function terminalEndedAt(event: SessionEvent | undefined): number | undefined {
  if (event?.kind === "stream_done" || event?.kind === "stream_error") return event.createdAt;
  return undefined;
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function numberValue(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}
