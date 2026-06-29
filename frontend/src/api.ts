export interface AgentChatResponse {
  conversationId: string;
  answer: string;
  traceId: string;
  requestId: string;
  trace?: Record<string, unknown>;
}

export interface SSEEvent {
  event: string;
  data: Record<string, unknown>;
}

export interface SessionMeta {
  conversationId: string;
  title: string;
  updatedAt: string;
}

export interface SessionMessage {
  role: string;
  content: unknown;
  toolCallId?: string;
  toolCalls?: unknown;
}

export interface PendingApproval {
  askUserId: string;
  executionId: string;
  toolCallId: string;
  toolName: string;
  reason?: string;
}

export interface ActiveExecution {
  executionId: string;
  status: string;
}

export type RuntimeProgressStatus = "running" | "waiting_approval" | "completed" | "aborted" | "errored";
export type RuntimeProgressActivity = "idle" | "model_call" | "tool_call" | "subagent" | "waiting_approval" | "terminal";

export interface RuntimeProgressDetail {
  toolCallId?: string;
  toolName?: string;
  skillName?: string;
  childExecutionId?: string;
  childConversationId?: string;
  askUserId?: string;
  terminalClass?: string;
  reason?: string;
  costUsdMicros?: number;
}

export interface RuntimeProgressRecentEvent {
  kind: string;
  createdAt: number;
  stepIndex?: number;
  status?: string;
  toolName?: string;
}

export interface RuntimeProgressSnapshot {
  conversationId: string;
  executionId: string;
  tenantId: string;
  traceId: string;
  requestId: string;
  status: RuntimeProgressStatus;
  currentActivity: RuntimeProgressActivity;
  startedAt: number;
  updatedAt: number;
  endedAt?: number | null;
  elapsedMs?: number;
  currentStep?: number;
  maxObservedStep: number;
  modelCalls: number;
  toolCalls: number;
  subagentCalls: number;
  detail?: RuntimeProgressDetail;
  recentEvents: RuntimeProgressRecentEvent[];
}

export interface SessionDetail {
  conversationId: string;
  messages: SessionMessage[];
  activeExecution?: ActiveExecution | null;
  pendingApprovals?: PendingApproval[];
  runtimeProgress?: RuntimeProgressSnapshot | null;
}

const agentRuntimeUrl = import.meta.env.VITE_AGENT_RUNTIME_URL ?? "http://localhost:3001";

export async function sendAgentChat(input: {
  conversationId: string;
  message: string;
  traceId: string;
  requestId: string;
  userId: string;
  tenantId: string;
}): Promise<AgentChatResponse> {
  const response = await fetch(`${agentRuntimeUrl}/api/v1/agent/chat`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Trace-Id": input.traceId,
      "X-Request-Id": input.requestId,
      "X-User-Id": input.userId,
      "X-Tenant-Id": input.tenantId
    },
    body: JSON.stringify({ conversationId: input.conversationId, message: input.message })
  });
  if (!response.ok) throw new Error(await response.text());
  return response.json();
}

export async function sendAgentChatStream(
  input: {
    conversationId: string;
    message: string;
    traceId: string;
    requestId: string;
    userId: string;
    tenantId: string;
  },
  onEvent: (event: SSEEvent) => void
): Promise<void> {
  const response = await fetch(`${agentRuntimeUrl}/api/v1/agent/chat/stream`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Trace-Id": input.traceId,
      "X-Request-Id": input.requestId,
      "X-User-Id": input.userId,
      "X-Tenant-Id": input.tenantId
    },
    body: JSON.stringify({ conversationId: input.conversationId, message: input.message })
  });
  if (!response.ok) throw new Error(await response.text());

  const reader = response.body?.getReader();
  if (!reader) return;
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const parts = buffer.split("\n\n");
    buffer = parts.pop() ?? "";
    for (const part of parts) {
      let eventName = "message";
      let data = "";
      for (const line of part.split("\n")) {
        if (line.startsWith("event: ")) eventName = line.slice(7);
        else if (line.startsWith("data: ")) data = line.slice(6);
      }
      if (data) {
        try { onEvent({ event: eventName, data: JSON.parse(data) }); } catch { /* skip */ }
      }
    }
  }
}

export async function replyAskUser(askUserId: string, action: "approve" | "reject"): Promise<unknown> {
  const response = await fetch(`${agentRuntimeUrl}/api/v1/agent/ask-user/${askUserId}/reply`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ askUserId, action, respondedAt: new Date().toISOString() })
  });
  return response.json();
}

export async function replyApproval(input: {
  conversationId: string;
  executionId: string;
  toolCallId: string;
  action: "approve" | "reject" | "revise";
  revisedArguments?: Record<string, unknown>;
  message?: string;
}): Promise<unknown> {
  const response = await fetch(
    `${agentRuntimeUrl}/api/v1/sessions/${encodeURIComponent(input.conversationId)}/executions/${encodeURIComponent(input.executionId)}/approvals/${encodeURIComponent(input.toolCallId)}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: input.action,
        revisedArguments: input.revisedArguments,
        message: input.message,
        respondedAt: new Date().toISOString()
      })
    }
  );
  return response.json();
}


// ── Sessions API ─────────────────────────────────────────────────────────────

function sessionHeaders(userId: string, tenantId: string): HeadersInit {
  return {
    "Content-Type": "application/json",
    "X-User-Id": userId,
    "X-Tenant-Id": tenantId
  };
}

export async function listSessions(userId: string, tenantId: string): Promise<SessionMeta[]> {
  const response = await fetch(`${agentRuntimeUrl}/api/v1/sessions`, {
    method: "GET",
    headers: sessionHeaders(userId, tenantId)
  });
  if (!response.ok) throw new Error(await response.text());
  return response.json();
}

export async function getSession(
  userId: string,
  tenantId: string,
  conversationId: string
): Promise<SessionDetail | null> {
  const response = await fetch(`${agentRuntimeUrl}/api/v1/sessions/${encodeURIComponent(conversationId)}`, {
    method: "GET",
    headers: sessionHeaders(userId, tenantId)
  });
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(await response.text());
  return response.json();
}

export async function deleteSession(
  userId: string,
  tenantId: string,
  conversationId: string
): Promise<void> {
  const response = await fetch(`${agentRuntimeUrl}/api/v1/sessions/${encodeURIComponent(conversationId)}`, {
    method: "DELETE",
    headers: sessionHeaders(userId, tenantId)
  });
  if (!response.ok && response.status !== 204) {
    throw new Error(await response.text());
  }
}
