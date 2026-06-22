import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { MemoryFactSchema, type MemoryFact } from "@openharness/shared-schema";

export type { MemoryFact };

export type MemoryFactInput = Omit<MemoryFact, "memoryId" | "createdAt" | "updatedAt"> &
  Partial<Pick<MemoryFact, "memoryId" | "createdAt" | "updatedAt">>;

export interface MemoryStore {
  upsert(fact: MemoryFactInput): Promise<MemoryFact>;
  list(tenantId: string, userId: string): Promise<MemoryFact[]>;
  search(tenantId: string, userId: string, query: string, tags?: string[]): Promise<MemoryFact[]>;
  delete(tenantId: string, userId: string, memoryId: string): Promise<boolean>;
}

function scopeKey(tenantId: string, userId: string): string {
  return `${tenantId}:${userId}`;
}

function normalize(value: string): string {
  return value.toLocaleLowerCase();
}

function matches(fact: MemoryFact, query: string, tags?: string[]): boolean {
  const normalizedQuery = normalize(query.trim());
  const normalizedTags = (tags ?? []).map(normalize);
  const contentMatches = normalizedQuery.length === 0 || normalize(fact.content).includes(normalizedQuery);
  const factTags = fact.tags.map(normalize);
  const tagTextMatches = normalizedQuery.length > 0 && factTags.some((tag) => tag.includes(normalizedQuery));
  const explicitTagsMatch =
    normalizedTags.length === 0 || normalizedTags.every((tag) => factTags.includes(tag));
  return (contentMatches || tagTextMatches) && explicitTagsMatch;
}

function stamp(input: MemoryFactInput, existing?: MemoryFact): MemoryFact {
  const now = new Date().toISOString();
  return MemoryFactSchema.parse({
    memoryId: input.memoryId ?? existing?.memoryId ?? crypto.randomUUID(),
    tenantId: input.tenantId,
    userId: input.userId,
    agentId: input.agentId,
    content: input.content,
    tags: input.tags ?? [],
    createdAt: input.createdAt ?? existing?.createdAt ?? now,
    updatedAt: input.updatedAt ?? now
  });
}

export class InMemoryMemoryStore implements MemoryStore {
  protected readonly facts = new Map<string, MemoryFact[]>();

  async upsert(input: MemoryFactInput): Promise<MemoryFact> {
    const key = scopeKey(input.tenantId, input.userId);
    const current = this.facts.get(key) ?? [];
    const existingIndex = input.memoryId ? current.findIndex((fact) => fact.memoryId === input.memoryId) : -1;
    const existing = existingIndex >= 0 ? current[existingIndex] : undefined;
    const fact = stamp(input, existing);
    const next = [...current];
    if (existingIndex >= 0) next[existingIndex] = fact;
    else next.push(fact);
    this.facts.set(key, next);
    await this.persist(input.tenantId, input.userId);
    return fact;
  }

  async list(tenantId: string, userId: string): Promise<MemoryFact[]> {
    await this.load(tenantId, userId);
    return [...(this.facts.get(scopeKey(tenantId, userId)) ?? [])];
  }

  async search(tenantId: string, userId: string, query: string, tags?: string[]): Promise<MemoryFact[]> {
    const facts = await this.list(tenantId, userId);
    return facts.filter((fact) => matches(fact, query, tags));
  }

  async delete(tenantId: string, userId: string, memoryId: string): Promise<boolean> {
    await this.load(tenantId, userId);
    const key = scopeKey(tenantId, userId);
    const current = this.facts.get(key) ?? [];
    const next = current.filter((fact) => fact.memoryId !== memoryId);
    if (next.length === current.length) return false;
    this.facts.set(key, next);
    await this.persist(tenantId, userId);
    return true;
  }

  protected async load(_tenantId: string, _userId: string): Promise<void> {}

  protected async persist(_tenantId: string, _userId: string): Promise<void> {}
}

interface MemoryFile {
  tenantId: string;
  userId: string;
  updatedAt: string;
  facts: MemoryFact[];
}

export class JsonFileMemoryStore extends InMemoryMemoryStore {
  constructor(private readonly dataDir = process.env.MEMORY_DATA_DIR ?? "data/memory") {
    super();
  }

  private filePath(tenantId: string, userId: string): string {
    return join(this.dataDir, encodeURIComponent(tenantId), `${encodeURIComponent(userId)}.json`);
  }

  protected override async load(tenantId: string, userId: string): Promise<void> {
    const key = scopeKey(tenantId, userId);
    if (this.facts.has(key)) return;
    const filePath = this.filePath(tenantId, userId);
    if (!existsSync(filePath)) {
      this.facts.set(key, []);
      return;
    }
    try {
      const parsed = JSON.parse(readFileSync(filePath, "utf-8")) as Partial<MemoryFile>;
      const facts = (parsed.facts ?? []).map((fact) => MemoryFactSchema.parse(fact));
      this.facts.set(key, facts);
    } catch {
      this.facts.set(key, []);
    }
  }

  protected override async persist(tenantId: string, userId: string): Promise<void> {
    const facts = this.facts.get(scopeKey(tenantId, userId)) ?? [];
    const filePath = this.filePath(tenantId, userId);
    if (facts.length === 0) {
      if (existsSync(filePath)) rmSync(filePath, { force: true });
      return;
    }
    mkdirSync(dirname(filePath), { recursive: true });
    const data: MemoryFile = {
      tenantId,
      userId,
      updatedAt: new Date().toISOString(),
      facts
    };
    writeFileSync(filePath, JSON.stringify(data, null, 2));
  }
}
