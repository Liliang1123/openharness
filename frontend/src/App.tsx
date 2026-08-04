import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  deleteSession,
  appendSSEWireEvent,
  getSession,
  listSessions,
  sendAgentChatStream,
  type SSEEvent,
  type PendingApproval,
  type RuntimeProgressSnapshot,
  type SessionMeta
} from "./api";
import { ApprovalCard } from "./ApprovalCard";
import { ExecutionActivityGroup } from "./ExecutionActivityGroup";
import { RuntimeProgressPanel } from "./RuntimeProgressPanel";
import { SessionList } from "./SessionList";
import { TraceTreePanel } from "./TraceTreePanel";
import { deriveExecutionActivity } from "./executionActivity";
import { deriveRuntimeProgressFromEvents } from "./runtimeProgress";
import { newId } from "./trace";
import "./App.css";

interface ChatMessage {
  role: "user" | "assistant" | "system";
  content: string;
  approval?: PendingApproval & { conversationId: string };
}

const userId = (import.meta.env.VITE_DEV_USER_ID as string | undefined) ?? "user-001";
const tenantId = (import.meta.env.VITE_DEV_TENANT_ID as string | undefined) ?? "tenant-001";

export function App() {
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [events, setEvents] = useState<SSEEvent[]>([]);
  const [runtimeProgress, setRuntimeProgress] = useState<RuntimeProgressSnapshot | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [sessions, setSessions] = useState<SessionMeta[]>([]);
  const [conversationId, setConversationId] = useState<string>(() => newId("conv"));
  const seenEventIds = useRef(new Set<string>());
  const executionActivity = useMemo(
    () => deriveExecutionActivity(events),
    [events]
  );

  const refreshSessions = useCallback(async () => {
    try {
      const list = await listSessions(userId, tenantId);
      setSessions(list);
    } catch (caught) {
      console.error("[sessions] list failed:", caught);
    }
  }, []);

  useEffect(() => {
    void refreshSessions();
  }, [refreshSessions]);

  const sessionMessagesToChat = useMemo(
    () =>
      (raw: { role: string; content: unknown }[], pendingApprovals: PendingApproval[] = [], id = conversationId): ChatMessage[] => {
        const chat = raw
          .filter((m) => m.role === "user" || m.role === "assistant")
          .map((m) => ({
            role: m.role as "user" | "assistant",
            content: typeof m.content === "string" ? m.content : JSON.stringify(m.content)
          }));
        return [
          ...chat,
          ...pendingApprovals.map((approval) => ({
            role: "system" as const,
            content: "",
            approval: { ...approval, conversationId: id }
          }))
        ];
      },
    [conversationId]
  );

  async function selectSession(id: string) {
    if (busy) return;
    setError("");
    setEvents([]);
    seenEventIds.current.clear();
    setRuntimeProgress(null);
    setConversationId(id);
    try {
      const data = await getSession(userId, tenantId, id);
      setMessages(data ? sessionMessagesToChat(data.messages, data.pendingApprovals ?? [], id) : []);
      setRuntimeProgress(data?.runtimeProgress ?? null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Load failed");
    }
  }

  function newSession() {
    if (busy) return;
    setError("");
    setEvents([]);
    seenEventIds.current.clear();
    setRuntimeProgress(null);
    setMessages([]);
    setConversationId(newId("conv"));
  }

  async function removeSession(id: string) {
    try {
      await deleteSession(userId, tenantId, id);
      if (id === conversationId) newSession();
      await refreshSessions();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Delete failed");
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const text = input.trim();
    if (!text || busy) return;

    setBusy(true);
    setError("");
    setEvents([]);
    seenEventIds.current.clear();
    setRuntimeProgress(null);
    setMessages((m) => [...m, { role: "user", content: text }]);
    setInput("");

    try {
      await sendAgentChatStream(
        {
          conversationId,
          message: text,
          traceId: newId("trace"),
          requestId: newId("req"),
          userId,
          tenantId
        },
        (ev) => {
          if (ev.durability === "durable") {
            if (seenEventIds.current.has(ev.eventId)) return;
            seenEventIds.current.add(ev.eventId);
          }
          setEvents((prev) => {
            const next = appendSSEWireEvent(prev, ev);
            setRuntimeProgress(deriveRuntimeProgressFromEvents(next));
            return next;
          });
          const terminalToolResult = ev.kind === "tool_result"
            && ev.data.status !== "pending_approval"
            && ev.data.status !== "running";
          const terminalExecution = ev.kind === "stream_done" || ev.kind === "stream_error";
          if (terminalToolResult || terminalExecution) {
            const terminalToolCallId = terminalToolResult
              ? String(ev.data.toolCallId ?? "")
              : undefined;
            setMessages((current) => current.filter((message) => {
              const approval = message.approval;
              if (!approval || approval.executionId !== ev.executionId) return true;
              return terminalToolCallId !== undefined
                && approval.toolCallId !== terminalToolCallId;
            }));
          }
          if (ev.kind === "approval_requested" || (ev.kind === "tool_result" && ev.data.status === "pending_approval")) {
            setMessages((m) => [
              ...m,
              {
                role: "system",
                content: "",
                approval: {
                  askUserId: String(ev.data.askUserId ?? ev.data.approvalId ?? ""),
                  conversationId,
                  executionId: ev.executionId,
                  toolCallId: String(ev.data.toolCallId ?? ""),
                  toolName: String(ev.data.toolName ?? ""),
                  reason: ev.data.reason ? String(ev.data.reason) : undefined
                }
              }
            ]);
          } else if (ev.kind === "final_answer") {
            setMessages((m) => [...m, { role: "assistant", content: String(ev.data.answer ?? "") }]);
          }
        }
      );
      await refreshSessions();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Request failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="app-shell">
      <SessionList
        sessions={sessions}
        activeId={conversationId}
        onSelect={selectSession}
        onNew={newSession}
        onDelete={removeSession}
      />
      <section className="chat-pane" aria-label="Chat">
        <div className="messages">
          {messages.length === 0 ? (
            <div className="empty-state">OpenHarness P2</div>
          ) : (
            messages.map((msg, i) => {
              if (msg.approval) {
                return (
                  <ApprovalCard
                    key={`approval-${i}`}
                    askUserId={msg.approval.askUserId}
                    conversationId={msg.approval.conversationId}
                    executionId={msg.approval.executionId}
                    toolCallId={msg.approval.toolCallId}
                    toolName={msg.approval.toolName}
                    reason={msg.approval.reason}
                    onResolved={() => {}}
                  />
                );
              }
              return (
                <div className={`message ${msg.role}`} key={`${msg.role}-${i}`}>
                  <span>{msg.content}</span>
                </div>
              );
            })
          )}
        </div>
        <ExecutionActivityGroup activity={executionActivity} />
        {error && <div className="error">{error}</div>}
        <form className="composer" onSubmit={submit}>
          <label htmlFor="message">Message</label>
          <input
            id="message"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="输入消息"
            autoComplete="off"
          />
          <button type="submit" disabled={busy}>Send</button>
        </form>
      </section>
      <aside className="trace-pane">
        <RuntimeProgressPanel progress={runtimeProgress} />
        <TraceTreePanel events={events} />
      </aside>
    </main>
  );
}
