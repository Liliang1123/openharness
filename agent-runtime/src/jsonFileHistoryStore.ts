import { mkdirSync, readFileSync, writeFileSync, existsSync, readdirSync, rmSync } from "node:fs";
import { join, dirname } from "node:path";
import type { AgentMessage } from "./types";
import {
  assertStableHistoryMessage,
  type HistoryStore,
  type SessionMeta,
  deriveTitle,
  stableHistory,
  toReplay
} from "./history";

export class JsonFileHistoryStore implements HistoryStore {
  private readonly histories = new Map<string, AgentMessage[]>();
  private readonly dataDir: string;

  constructor(dataDir?: string) {
    this.dataDir = dataDir ?? process.env.HISTORY_DATA_DIR ?? "data/sessions";
  }

  private key(tenantId: string, userId: string, conversationId: string) {
    return `${tenantId}:${userId}:${conversationId}`;
  }

  private filePath(tenantId: string, userId: string, conversationId: string): string {
    return join(this.dataDir, tenantId, userId, `${conversationId}.json`);
  }

  private userDir(tenantId: string, userId: string): string {
    return join(this.dataDir, tenantId, userId);
  }

  private appendInMemory(tenantId: string, userId: string, conversationId: string, message: AgentMessage) {
    const k = this.key(tenantId, userId, conversationId);
    const current = this.histories.get(k) ?? [];
    current.push(message);
    this.histories.set(k, current);
  }

  append(tenantId: string, userId: string, conversationId: string, message: AgentMessage): void {
    assertStableHistoryMessage(message);
    const k = this.key(tenantId, userId, conversationId);
    if (!this.histories.has(k)) {
      this.loadSync(tenantId, userId, conversationId);
    }
    this.appendInMemory(tenantId, userId, conversationId, message);
  }

  get(tenantId: string, userId: string, conversationId: string): AgentMessage[] {
    const k = this.key(tenantId, userId, conversationId);
    if (!this.histories.has(k)) {
      this.loadSync(tenantId, userId, conversationId);
    }
    return stableHistory(this.histories.get(k) ?? []);
  }

  replace(tenantId: string, userId: string, conversationId: string, messages: AgentMessage[]): void {
    this.histories.set(this.key(tenantId, userId, conversationId), stableHistory(messages));
  }

  async save(tenantId: string, userId: string, conversationId: string): Promise<void> {
    const messages = this.histories.get(this.key(tenantId, userId, conversationId));
    if (!messages) return;

    const filePath = this.filePath(tenantId, userId, conversationId);
    const dir = dirname(filePath);
    mkdirSync(dir, { recursive: true });

    // 只保留符合 replay 契约的历史消息并持久化，过滤 transient
    const data = {
      tenantId,
      userId,
      conversationId,
      updatedAt: new Date().toISOString(),
      messages: toReplay(messages)
    };
    writeFileSync(filePath, JSON.stringify(data, null, 2));
  }

  async load(tenantId: string, userId: string, conversationId: string): Promise<void> {
    this.loadSync(tenantId, userId, conversationId);
  }

  async list(tenantId: string, userId: string): Promise<SessionMeta[]> {
    const dir = this.userDir(tenantId, userId);
    if (!existsSync(dir)) return [];

    const files = readdirSync(dir).filter((f) => f.endsWith(".json") && !f.endsWith("-approvals.json"));
    const result: SessionMeta[] = [];
    for (const file of files) {
      const filePath = join(dir, file);
      try {
        const raw = readFileSync(filePath, "utf-8");
        const data = JSON.parse(raw) as { conversationId?: string; updatedAt?: string; messages?: AgentMessage[] };
        const conversationId = data.conversationId ?? file.replace(/\.json$/, "");
        const messages = toReplay(data.messages ?? []);
        result.push({
          conversationId,
          title: deriveTitle(messages),
          updatedAt: data.updatedAt ?? ""
        });
      } catch {
        // Skip unreadable files
      }
    }
    result.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    return result;
  }

  async delete(tenantId: string, userId: string, conversationId: string): Promise<void> {
    // Remove main JSON file
    const filePath = this.filePath(tenantId, userId, conversationId);
    if (existsSync(filePath)) rmSync(filePath, { force: true });

    // Remove all chunk files: {conversationId}-chunk-N.md
    const dir = this.userDir(tenantId, userId);
    if (existsSync(dir)) {
      const chunkPrefix = `${conversationId}-chunk-`;
      for (const file of readdirSync(dir)) {
        if (file.startsWith(chunkPrefix) && file.endsWith(".md")) {
          rmSync(join(dir, file), { force: true });
        }
      }
    }

    // Remove from in-memory cache
    this.histories.delete(this.key(tenantId, userId, conversationId));
  }

  private loadSync(tenantId: string, userId: string, conversationId: string): void {
    const k = this.key(tenantId, userId, conversationId);
    const filePath = this.filePath(tenantId, userId, conversationId);
    if (existsSync(filePath)) {
      try {
        const raw = readFileSync(filePath, "utf-8");
        const data = JSON.parse(raw);
        this.histories.set(k, toReplay(data.messages ?? []));
      } catch {
        this.histories.set(k, []);
      }
    } else {
      this.histories.set(k, []);
    }
  }
}
