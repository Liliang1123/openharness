import type { AgentMessage } from "./types";

const RUNTIME_SENTINELS = new Set(["PENDING_APPROVAL", "POLICY_DENY"]);

const INTERNAL_FIELDS = new Set([
  "requestId", "conversationId", "taskId",
  "systemInjected", "sessionContext", "compressedSummary",
  "compressionInstruction", "transient", "chunkPath",
  "toolName", "toolResultProvenance"
]);

// ── Types ────────────────────────────────────────────────────────────────────

export interface SessionMeta {
  conversationId: string;
  title: string;
  updatedAt: string;
}

// ── Interface ────────────────────────────────────────────────────────────────

export interface HistoryStore {
  append(tenantId: string, conversationId: string, message: AgentMessage): void;
  get(tenantId: string, conversationId: string): AgentMessage[];
  replace(tenantId: string, conversationId: string, messages: AgentMessage[]): void;
  save(tenantId: string, conversationId: string): Promise<void>;
  load(tenantId: string, conversationId: string): Promise<void>;
  list(tenantId: string): Promise<SessionMeta[]>;
  delete(tenantId: string, conversationId: string): Promise<void>;
}

// ── Views ────────────────────────────────────────────────────────────────────

export function toApi(messages: AgentMessage[]): AgentMessage[] {
  return stableHistory(messages).map((msg) => {
    const out: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(msg)) {
      if (value !== undefined && !INTERNAL_FIELDS.has(key)) out[key] = value;
    }
    return out as AgentMessage;
  });
}

export function toReplay(messages: AgentMessage[]): AgentMessage[] {
  return stableHistory(messages).filter((msg) => !(msg as Record<string, unknown>).transient);
}

// Keep backward compat alias
export const toModelMessages = toApi;

export function isRuntimeSentinelMessage(message: AgentMessage): boolean {
  return message.role === "tool" &&
    typeof message.content === "string" &&
    RUNTIME_SENTINELS.has(message.content);
}

export function stableHistory(messages: AgentMessage[]): AgentMessage[] {
  return messages.filter((message) => !isRuntimeSentinelMessage(message));
}

export function hasUntrustedToolOutputSinceLastUser(messages: AgentMessage[]): boolean {
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const message = messages[i] as AgentMessage & { toolResultProvenance?: string };
    if (message.role === "user") return false;
    if (message.role === "tool" && message.toolResultProvenance === "untrusted") return true;
  }
  return false;
}

export function assertStableHistoryMessage(message: AgentMessage): void {
  if (isRuntimeSentinelMessage(message)) {
    throw new Error(`Runtime sentinel message cannot be written to stable history: ${message.content}`);
  }
}

// ── Title derivation ─────────────────────────────────────────────────────────

export function deriveTitle(messages: AgentMessage[]): string {
  for (const msg of messages) {
    if (msg.role === "user" && typeof msg.content === "string" && msg.content.trim()) {
      return msg.content.trim().slice(0, 30);
    }
  }
  return "New conversation";
}

// ── InMemoryHistoryStore ─────────────────────────────────────────────────────

interface InMemoryEntry {
  messages: AgentMessage[];
  updatedAt: string;
}

export class InMemoryHistoryStore implements HistoryStore {
  private readonly histories = new Map<string, InMemoryEntry>();

  private key(tenantId: string, conversationId: string) {
    return `${tenantId}:${conversationId}`;
  }

  append(tenantId: string, conversationId: string, message: AgentMessage): void {
    assertStableHistoryMessage(message);
    const k = this.key(tenantId, conversationId);
    const entry = this.histories.get(k) ?? { messages: [], updatedAt: new Date().toISOString() };
    entry.messages.push(message);
    entry.updatedAt = new Date().toISOString();
    this.histories.set(k, entry);
  }

  get(tenantId: string, conversationId: string): AgentMessage[] {
    return stableHistory(this.histories.get(this.key(tenantId, conversationId))?.messages ?? []);
  }

  replace(tenantId: string, conversationId: string, messages: AgentMessage[]): void {
    this.histories.set(this.key(tenantId, conversationId), {
      messages: stableHistory(messages),
      updatedAt: new Date().toISOString()
    });
  }

  async save(_tenantId: string, _conversationId: string): Promise<void> {
    // no-op for in-memory
  }

  async load(_tenantId: string, _conversationId: string): Promise<void> {
    // no-op for in-memory
  }

  async list(tenantId: string): Promise<SessionMeta[]> {
    const prefix = `${tenantId}:`;
    const result: SessionMeta[] = [];
    for (const [key, entry] of this.histories.entries()) {
      if (!key.startsWith(prefix)) continue;
      const conversationId = key.slice(prefix.length);
      result.push({
        conversationId,
        title: deriveTitle(stableHistory(entry.messages)),
        updatedAt: entry.updatedAt
      });
    }
    result.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    return result;
  }

  async delete(tenantId: string, conversationId: string): Promise<void> {
    this.histories.delete(this.key(tenantId, conversationId));
  }
}

// Backward compat export
export { InMemoryHistoryStore as MessageHistoryStore };
