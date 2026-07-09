import { randomUUID } from "node:crypto";
import { MemoryFactSchema, type MemoryFact } from "@openharness/shared-schema";
import type { MemoryFactInput } from "../memoryStore";
import type { RuntimeTransaction } from "./runtimeStorage";

interface MemoryRow {
  tenant_id: string;
  user_id: string;
  memory_id: string;
  content: string;
  metadata_json: string;
  created_at: number;
  updated_at: number;
}

export class SqliteMemoryStore {
  upsert(tx: RuntimeTransaction, input: MemoryFactInput): MemoryFact {
    const existing = input.memoryId ? this.get(tx, input.tenantId, input.userId, input.memoryId) : null;
    const now = Date.now();
    const createdAt = input.createdAt ?? existing?.createdAt ?? new Date(now).toISOString();
    const updatedAt = input.updatedAt ?? new Date(now).toISOString();
    const fact = MemoryFactSchema.parse({
      memoryId: input.memoryId ?? existing?.memoryId ?? randomUUID(),
      tenantId: input.tenantId,
      userId: input.userId,
      agentId: input.agentId,
      content: input.content,
      tags: input.tags ?? [],
      createdAt,
      updatedAt
    });

    tx.run(
      `INSERT INTO memory_facts(tenant_id,user_id,memory_id,content,metadata_json,created_at,updated_at)
       VALUES (?,?,?,?,?,?,?)
       ON CONFLICT(tenant_id,user_id,memory_id)
       DO UPDATE SET content = excluded.content, metadata_json = excluded.metadata_json, updated_at = excluded.updated_at`,
      [
        fact.tenantId,
        fact.userId,
        fact.memoryId,
        fact.content,
        JSON.stringify({ agentId: fact.agentId, tags: fact.tags }),
        Date.parse(fact.createdAt),
        Date.parse(fact.updatedAt)
      ]
    );
    return fact;
  }

  get(tx: RuntimeTransaction, tenantId: string, userId: string, memoryId: string): MemoryFact | null {
    const row = tx.get<MemoryRow>(
      `SELECT tenant_id,user_id,memory_id,content,metadata_json,created_at,updated_at
       FROM memory_facts
       WHERE tenant_id = ? AND user_id = ? AND memory_id = ?`,
      [tenantId, userId, memoryId]
    );
    return row ? fromRow(row) : null;
  }

  list(tx: RuntimeTransaction, tenantId: string, userId: string): MemoryFact[] {
    return tx.all<MemoryRow>(
      `SELECT tenant_id,user_id,memory_id,content,metadata_json,created_at,updated_at
       FROM memory_facts
       WHERE tenant_id = ? AND user_id = ?
       ORDER BY updated_at DESC, memory_id ASC`,
      [tenantId, userId]
    ).map(fromRow);
  }

  search(tx: RuntimeTransaction, tenantId: string, userId: string, query: string, tags: string[] = []): MemoryFact[] {
    const normalizedQuery = normalize(query.trim());
    const normalizedTags = tags.map(normalize);
    return this.list(tx, tenantId, userId).filter((fact) => {
      const factTags = fact.tags.map(normalize);
      const contentMatches = normalizedQuery.length === 0 || normalize(fact.content).includes(normalizedQuery);
      const tagTextMatches = normalizedQuery.length > 0 && factTags.some((tag) => tag.includes(normalizedQuery));
      const explicitTagsMatch = normalizedTags.length === 0 || normalizedTags.every((tag) => factTags.includes(tag));
      return (contentMatches || tagTextMatches) && explicitTagsMatch;
    });
  }

  delete(tx: RuntimeTransaction, tenantId: string, userId: string, memoryId: string): boolean {
    return tx.run(
      "DELETE FROM memory_facts WHERE tenant_id = ? AND user_id = ? AND memory_id = ?",
      [tenantId, userId, memoryId]
    ).changes > 0;
  }
}

function fromRow(row: MemoryRow): MemoryFact {
  const metadata = JSON.parse(row.metadata_json) as { agentId?: string; tags?: string[] };
  return MemoryFactSchema.parse({
    memoryId: row.memory_id,
    tenantId: row.tenant_id,
    userId: row.user_id,
    agentId: metadata.agentId,
    content: row.content,
    tags: metadata.tags ?? [],
    createdAt: new Date(row.created_at).toISOString(),
    updatedAt: new Date(row.updated_at).toISOString()
  });
}

function normalize(value: string): string {
  return value.toLocaleLowerCase();
}
