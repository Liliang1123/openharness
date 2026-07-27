import { mkdirSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import type { AgentMessage } from "./types";
import { stableHistory, type HistoryStore } from "./history";
import type { JavaClient } from "./javaClient";

const KEEP_RECENT = Number(process.env.KEEP_RECENT_MESSAGES ?? 6);

function getDataDir() {
  return process.env.HISTORY_DATA_DIR ?? "data/sessions";
}

// ── Token estimation ─────────────────────────────────────────────────────────

export function estimateTokens(messages: AgentMessage[]): number {
  return stableHistory(messages).reduce((sum, msg) => sum + estimateMessageTokens(msg), 0);
}

function estimateMessageTokens(msg: AgentMessage): number {
  let tokens = 4; // role overhead
  tokens += estimateContentTokens(msg.content);
  if (msg.toolCalls) {
    for (const tc of msg.toolCalls) {
      tokens += estimateContentTokens(tc.name);
      tokens += estimateContentTokens(tc.argumentsRaw);
    }
  }
  return tokens;
}

function estimateContentTokens(content: unknown): number {
  if (typeof content === "string") {
    const ascii = content.replace(/[^\x20-\x7e]/g, "").length;
    const multibyte = content.length - ascii;
    return Math.ceil(ascii / 4 + multibyte / 1.5);
  }
  if (Array.isArray(content)) {
    return content.reduce((sum, block) => {
      if (typeof block === "object" && block && "text" in block) {
        return sum + estimateContentTokens((block as { text: string }).text);
      }
      return sum;
    }, 0);
  }
  return 0;
}

// ── Compression decision ─────────────────────────────────────────────────────

export function shouldCompress(messages: AgentMessage[], threshold?: number): boolean {
  const t = threshold ?? Number(process.env.COMPRESSION_THRESHOLD ?? 8000);
  return estimateTokens(messages) > t;
}

// ── Compress flow ────────────────────────────────────────────────────────────

export async function compress(
  tenantId: string,
  userId: string,
  conversationId: string,
  history: HistoryStore,
  javaClient: JavaClient,
  headers: Record<string, string>
): Promise<void> {
  const messages = stableHistory(await history.get(tenantId, userId, conversationId));
  if (messages.length <= KEEP_RECENT) return;

  const toCompress = messages.slice(0, messages.length - KEEP_RECENT);
  const toKeep = messages.slice(messages.length - KEEP_RECENT);
  const compressionInstruction: AgentMessage = {
    role: "user",
    content: "Compress the preceding conversation into a durable continuation summary. Preserve decisions, constraints, unfinished work, identifiers, file paths, observed errors, and the next concrete actions. Do not invent facts.",
    compressionInstruction: true
  };

  // Insert the instruction into the request-local conversation so the
  // compression model sees the original history and the compression intent in
  // one call. It is never appended to stable HistoryStore state.
  const summary = await callCompress([...toCompress, compressionInstruction], javaClient, headers);

  // Archive old messages as chunk MD
  const chunkIndex = nextChunkIndex(tenantId, conversationId);
  const chunkPath = writeChunk(tenantId, conversationId, chunkIndex, toCompress);

  // Build new message list: summary + kept messages
  const summaryMessage: AgentMessage = {
    role: "user",
    content: summary,
    compressedSummary: true,
    chunkPath
  } as AgentMessage & { compressedSummary: boolean; chunkPath: string };

  const newMessages = [summaryMessage, ...toKeep];
  await history.replace(tenantId, userId, conversationId, newMessages);
  await history.save(tenantId, userId, conversationId);
}

async function callCompress(
  messages: AgentMessage[],
  javaClient: JavaClient,
  headers: Record<string, string>
): Promise<string> {
  if (typeof javaClient.compress === "function") {
    return javaClient.compress(messages, headers);
  }

  // Fallback to legacy mock request method if present in tests
  const legacyClient = javaClient as unknown as { request?<T>(path: string, init: RequestInit): Promise<T> };
  if (typeof legacyClient.request === "function") {
    const response = await legacyClient.request<{ summary: string }>("/api/v1/model/compress", {
      method: "POST",
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify({ messages })
    });
    return response.summary;
  }

  throw new Error("Java client does not provide compression capability");
}

function nextChunkIndex(tenantId: string, conversationId: string): number {
  const { readdirSync, existsSync } = require("node:fs") as typeof import("node:fs");
  const dir = join(getDataDir(), tenantId);
  if (!existsSync(dir)) return 1;
  const files = readdirSync(dir).filter((f: string) => f.startsWith(`${conversationId}-chunk-`) && f.endsWith(".md"));
  if (files.length === 0) return 1;
  const indices = files.map((f: string) => {
    const m = f.match(/-chunk-(\d+)\.md$/);
    return m ? Number(m[1]) : 0;
  });
  return Math.max(...indices) + 1;
}

function writeChunk(tenantId: string, conversationId: string, index: number, messages: AgentMessage[]): string {
  const dir = join(getDataDir(), tenantId);
  mkdirSync(dir, { recursive: true });
  const filename = `${conversationId}-chunk-${index}.md`;
  const filePath = join(dir, filename);

  const lines = [
    "---",
    `archived_at: ${new Date().toISOString()}`,
    `message_count: ${messages.length}`,
    "---",
    ""
  ];

  for (const msg of messages) {
    const role = msg.role.charAt(0).toUpperCase() + msg.role.slice(1);
    lines.push(`## ${role}`);
    lines.push(typeof msg.content === "string" ? msg.content : JSON.stringify(msg.content));
    lines.push("");
  }

  writeFileSync(filePath, lines.join("\n"));
  return filePath;
}
