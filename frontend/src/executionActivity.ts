import type { SSEEvent } from "./api";

export type ExecutionActivityStatus = "running" | "completed" | "errored" | "aborted";
export type ExecutionActivityEntryStatus =
  | "running"
  | "ok"
  | "error"
  | "rejected"
  | "timeout"
  | "denied"
  | "completed";

export interface ExecutionActivityEntry {
  id: string;
  kind: "model" | "tool";
  status: ExecutionActivityEntryStatus;
  createdAt: number;
  stepIndex?: number;
  toolCallId?: string;
  toolName?: string;
}

export interface ExecutionActivity {
  executionId: string;
  status: ExecutionActivityStatus;
  modelActive: boolean;
  startedAt: number;
  updatedAt: number;
  elapsedMs: number;
  terminalClass?: string;
  upstreamErrorClass?: string;
  entries: ExecutionActivityEntry[];
  tools: ExecutionActivityEntry[];
}

type DurableSSEEvent = Extract<SSEEvent, { durability: "durable" }>;

const terminalIdentifier = /^[A-Z][A-Z0-9_]{0,127}$/;
const terminalToolStatuses = new Set<ExecutionActivityEntryStatus>([
  "ok",
  "error",
  "rejected",
  "timeout",
  "denied",
  "completed"
]);

function numberValue(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function terminalValue(value: unknown): string | undefined {
  return typeof value === "string" && terminalIdentifier.test(value) ? value : undefined;
}

function toolStatus(value: unknown): ExecutionActivityEntryStatus {
  if (typeof value !== "string") return "error";
  if (value === "pending_approval") return "running";
  return terminalToolStatuses.has(value as ExecutionActivityEntryStatus)
    ? value as ExecutionActivityEntryStatus
    : "error";
}

function durableEvents(events: SSEEvent[]): DurableSSEEvent[] {
  const seen = new Set<string>();
  const durable: DurableSSEEvent[] = [];
  for (const event of events) {
    if (event.durability !== "durable" || seen.has(event.eventId)) continue;
    seen.add(event.eventId);
    durable.push(event);
  }
  return durable;
}

export function deriveExecutionActivity(events: SSEEvent[]): ExecutionActivity | null {
  const durable = durableEvents(events);
  const latestExecutionId = durable.at(-1)?.executionId;
  if (!latestExecutionId) return null;

  const current = durable.filter((event) => event.executionId === latestExecutionId);
  if (current.length === 0) return null;

  const entries: ExecutionActivityEntry[] = [];
  const toolsByCallId = new Map<string, ExecutionActivityEntry>();
  const modelOccurrences = new Map<string, number>();
  let status: ExecutionActivityStatus = "running";
  let terminalClass: string | undefined;
  let upstreamErrorClass: string | undefined;

  for (const event of current) {
    const stepIndex = numberValue(event.data.stepIndex);
    if (event.kind === "model_call_start") {
      const stepKey = String(stepIndex ?? "unknown");
      const occurrence = (modelOccurrences.get(stepKey) ?? 0) + 1;
      modelOccurrences.set(stepKey, occurrence);
      entries.push({
        id: `model:${stepKey}:${occurrence}`,
        kind: "model",
        status: "running",
        createdAt: event.createdAt,
        ...(stepIndex === undefined ? {} : { stepIndex })
      });
      continue;
    }

    if (event.kind === "model_call_end") {
      const matching = [...entries].reverse().find((entry) =>
        entry.kind === "model"
        && entry.status === "running"
        && (stepIndex === undefined || entry.stepIndex === stepIndex)
      );
      if (matching) matching.status = "completed";
      continue;
    }

    if (event.kind === "tool_call" || event.kind === "tool_result") {
      const toolCallId = stringValue(event.data.toolCallId);
      if (!toolCallId) continue;
      const existing = toolsByCallId.get(toolCallId);
      const toolName = stringValue(event.data.toolName) ?? existing?.toolName;
      const nextStatus = event.kind === "tool_call" ? "running" : toolStatus(event.data.status);
      if (existing) {
        existing.status = nextStatus;
        if (!existing.toolName && toolName) existing.toolName = toolName;
        if (existing.stepIndex === undefined && stepIndex !== undefined) existing.stepIndex = stepIndex;
      } else {
        const entry: ExecutionActivityEntry = {
          id: `tool:${toolCallId}`,
          kind: "tool",
          status: nextStatus,
          createdAt: event.createdAt,
          toolCallId,
          ...(toolName ? { toolName } : {}),
          ...(stepIndex === undefined ? {} : { stepIndex })
        };
        entries.push(entry);
        toolsByCallId.set(toolCallId, entry);
      }
      continue;
    }

    if (event.kind === "stream_done") {
      status = "completed";
      terminalClass = terminalValue(event.data.stopReason) ?? "FINAL_ANSWER";
      continue;
    }

    if (event.kind === "stream_error") {
      terminalClass = terminalValue(event.data.errorClass);
      upstreamErrorClass = terminalValue(event.data.upstreamErrorClass);
      status = terminalClass === "EXECUTION_ABORTED" ? "aborted" : "errored";
    }
  }

  const terminal = status !== "running";
  if (terminal) {
    for (const entry of entries) {
      if (entry.status === "running") {
        entry.status = entry.kind === "model" ? "completed" : "error";
      }
    }
  }

  const startedAt = current[0].createdAt;
  const updatedAt = current.at(-1)?.createdAt ?? startedAt;
  const tools = entries.filter((entry) => entry.kind === "tool");
  return {
    executionId: latestExecutionId,
    status,
    modelActive: !terminal && entries.some((entry) =>
      entry.kind === "model" && entry.status === "running"
    ),
    startedAt,
    updatedAt,
    elapsedMs: Math.max(0, updatedAt - startedAt),
    ...(terminalClass ? { terminalClass } : {}),
    ...(upstreamErrorClass ? { upstreamErrorClass } : {}),
    entries,
    tools
  };
}

export function summarizeTools(tools: ExecutionActivityEntry[]): string {
  const counts = new Map<string, number>();
  for (const tool of tools) {
    if (tool.status === "running") continue;
    const name = tool.toolName ?? "unknown_tool";
    counts.set(name, (counts.get(name) ?? 0) + 1);
  }
  return [...counts]
    .map(([name, count]) => count === 1 ? name : `${name} ×${count}`)
    .join(" · ");
}

export function isTerminalActivity(activity: ExecutionActivity): boolean {
  return activity.status !== "running";
}
