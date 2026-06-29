import type { RuntimeProgressSnapshot, SSEEvent } from "./api";

export function deriveRuntimeProgressFromEvents(events: SSEEvent[]): RuntimeProgressSnapshot | null {
  if (events.length === 0) return null;
  const first = events[0];
  const last = events[events.length - 1];
  const status = statusFromEvents(events);
  const activityEvent = latestActivityEvent(events);
  const detailEvent = latestDetailEvent(events, status) ?? last;
  const activity = activityFromEvent(status, activityEvent);
  const currentStep = latestStep(events);
  const startedAt = numberValue(first.data.createdAt) ?? Date.now();
  const updatedAt = numberValue(last.data.createdAt) ?? startedAt;
  const endedAt = activity === "terminal" ? updatedAt : null;

  return {
    conversationId: stringValue(first.data.conversationId) ?? "",
    executionId: stringValue(first.data.executionId) ?? "",
    tenantId: stringValue(first.data.tenantId) ?? "",
    traceId: stringValue(first.data.traceId) ?? "",
    requestId: stringValue(first.data.requestId) ?? "",
    status,
    currentActivity: activity,
    startedAt,
    updatedAt,
    endedAt,
    elapsedMs: Math.max(0, updatedAt - startedAt),
    ...(currentStep ? { currentStep } : {}),
    maxObservedStep: maxStep(events),
    modelCalls: events.filter((event) => event.event === "model_call_start").length,
    toolCalls: events.filter((event) => event.event === "tool_call").length,
    subagentCalls: countSubagents(events),
    detail: detailFromEvent(detailEvent, status),
    recentEvents: events.slice(-8).map((event) => ({
      kind: event.event,
      createdAt: numberValue(event.data.createdAt) ?? 0,
      ...(numberValue(event.data.stepIndex) ? { stepIndex: numberValue(event.data.stepIndex) } : {}),
      ...(stringValue(event.data.status) ? { status: stringValue(event.data.status) } : {}),
      ...(stringValue(event.data.toolName) ? { toolName: stringValue(event.data.toolName) } : {})
    }))
  };
}

function statusFromEvents(events: SSEEvent[]): RuntimeProgressSnapshot["status"] {
  const last = events[events.length - 1];
  if (last.event === "stream_done") return "completed";
  if (last.event === "stream_error") {
    return stringValue(last.data.errorClass) === "EXECUTION_ABORTED" ? "aborted" : "errored";
  }
  if (latestActivityEvent(events)?.event === "approval_requested") return "waiting_approval";
  return "running";
}

function activityFromEvent(
  status: RuntimeProgressSnapshot["status"],
  event: SSEEvent | undefined
): RuntimeProgressSnapshot["currentActivity"] {
  if (status === "completed" || status === "aborted" || status === "errored") return "terminal";
  if (status === "waiting_approval") return "waiting_approval";
  if (!event) return "idle";
  if (event.event === "model_call_start") return "model_call";
  if (event.event === "tool_call" || event.event === "tool_result") return "tool_call";
  if (attributes(event)?.traceNodeKind === "subagent_execution") return "subagent";
  return "idle";
}

function detailFromEvent(event: SSEEvent, status: RuntimeProgressSnapshot["status"]): RuntimeProgressSnapshot["detail"] {
  const attrs = attributes(event);
  if (status === "completed" || status === "aborted" || status === "errored") {
    const terminalClass = stringValue(event.data.errorClass) ?? stringValue(attrs?.terminalClass);
    return terminalClass ? { terminalClass } : undefined;
  }
  return {
    ...(stringValue(event.data.askUserId) ? { askUserId: stringValue(event.data.askUserId) } : {}),
    ...(stringValue(event.data.toolCallId) ? { toolCallId: stringValue(event.data.toolCallId) } : {}),
    ...(stringValue(event.data.toolName) ? { toolName: stringValue(event.data.toolName) } : {}),
    ...(stringValue(event.data.reason) ? { reason: stringValue(event.data.reason) } : {}),
    ...(stringValue(attrs?.skillName) ? { skillName: stringValue(attrs?.skillName) } : {}),
    ...(stringValue(attrs?.childExecutionId) ? { childExecutionId: stringValue(attrs?.childExecutionId) } : {}),
    ...(stringValue(attrs?.childConversationId) ? { childConversationId: stringValue(attrs?.childConversationId) } : {})
  };
}

function latestStep(events: SSEEvent[]): number | undefined {
  for (let i = events.length - 1; i >= 0; i -= 1) {
    const step = numberValue(events[i].data.stepIndex ?? attributes(events[i])?.stepIndex);
    if (step && step > 0) return step;
  }
  return undefined;
}

function maxStep(events: SSEEvent[]): number {
  return events.reduce((max, event) => Math.max(max, numberValue(event.data.stepIndex ?? attributes(event)?.stepIndex) ?? 0), 0);
}

function countSubagents(events: SSEEvent[]): number {
  const childIds = new Set<string>();
  for (const event of events) {
    const attrs = attributes(event);
    if (attrs?.traceNodeKind !== "subagent_execution") continue;
    const childExecutionId = stringValue(attrs.childExecutionId);
    if (childExecutionId) childIds.add(childExecutionId);
  }
  return childIds.size;
}

function latestActivityEvent(events: SSEEvent[]): SSEEvent | undefined {
  for (let i = events.length - 1; i >= 0; i -= 1) {
    const event = events[i];
    if (
      event.event === "model_call_start" ||
      event.event === "model_call_end" ||
      event.event === "tool_call" ||
      event.event === "tool_result" ||
      event.event === "approval_requested" ||
      attributes(event)?.traceNodeKind === "subagent_execution"
    ) {
      return event;
    }
  }
  return undefined;
}

function latestDetailEvent(
  events: SSEEvent[],
  status: RuntimeProgressSnapshot["status"]
): SSEEvent | undefined {
  if (status === "completed" || status === "aborted" || status === "errored") {
    return [...events].reverse().find((event) => event.event === "stream_error" || event.event === "stream_done");
  }
  return latestActivityEvent(events);
}

function attributes(event: SSEEvent): Record<string, unknown> | undefined {
  const value = event.data.attributes;
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  return value as Record<string, unknown>;
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function numberValue(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}
