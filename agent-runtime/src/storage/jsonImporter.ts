import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { basename, dirname, join, relative } from "node:path";
import { AgentMessageSchema, MemoryFactSchema, type AgentMessage, type MemoryFact } from "@openharness/shared-schema";
import type { RuntimeDatabase } from "./runtimeStorage";
import type { SqliteRuntimeRepositories } from "./sqliteRuntimeRepositories";

export interface LegacyOwnerMapping {
  userId: string;
}

export interface JsonImportOptions {
  historyDir: string;
  memoryDir: string;
  backupManifestPath: string;
  quarantineManifestPath: string;
  cutoverStatePath: string;
  ownerMappings: Record<string, LegacyOwnerMapping>;
  allowCutoverWithQuarantine?: boolean;
}

export interface BackupManifestEntry {
  path: string;
  sha256: string;
}

export interface QuarantineEntry {
  path: string;
  sha256: string;
  error: string;
}

export interface JsonImportReport {
  backup: {
    path: string;
    files: BackupManifestEntry[];
  };
  imported: {
    conversations: number;
    messages: number;
    memoryFacts: number;
  };
  quarantine: {
    path: string;
    items: QuarantineEntry[];
  };
  cutover: {
    automaticCutoverAllowed: boolean;
    legacyWritesAllowed: boolean;
    mode: "pre_cutover" | "forward_fix_only";
    statePath: string;
  };
}

interface LegacyHistoryFile {
  tenantId: string;
  conversationId: string;
  messages: AgentMessage[];
}

interface LegacyMemoryFile {
  tenantId: string;
  userId: string;
  facts: MemoryFact[];
}

export function importLegacyJsonRuntimeData(
  database: RuntimeDatabase,
  repositories: SqliteRuntimeRepositories,
  options: JsonImportOptions
): JsonImportReport {
  const sourceFiles = [
    ...listJsonFiles(options.historyDir).map((path) => ({ kind: "history" as const, path })),
    ...listJsonFiles(options.memoryDir).map((path) => ({ kind: "memory" as const, path }))
  ].sort((a, b) => a.path.localeCompare(b.path));
  const backupFiles = sourceFiles.map(({ path }) => ({ path, sha256: sha256File(path) }));
  writeJson(options.backupManifestPath, {
    createdAt: new Date().toISOString(),
    files: backupFiles
  });

  const quarantine = new Map<string, QuarantineEntry>();
  let conversations = 0;
  let messages = 0;
  let memoryFacts = 0;

  for (const source of sourceFiles) {
    const sourceHash = sha256File(source.path);
    try {
      const parsed = JSON.parse(readFileSync(source.path, "utf-8")) as unknown;
      if (source.kind === "history") {
        const imported = importHistoryFile(database, repositories, options, source.path, parsed);
        conversations += imported.conversations;
        messages += imported.messages;
      } else {
        memoryFacts += importMemoryFile(database, repositories, options, source.path, parsed);
      }
    } catch (error) {
      quarantine.set(source.path, {
        path: source.path,
        sha256: sourceHash,
        error: safeError(error)
      });
    }
  }

  const items = [...quarantine.values()].sort((a, b) => a.path.localeCompare(b.path));
  writeJson(options.quarantineManifestPath, {
    createdAt: new Date().toISOString(),
    items
  });

  const mode = conversations + messages + memoryFacts > 0 ? "forward_fix_only" : "pre_cutover";
  const cutover = {
    mode,
    legacyWritesAllowed: mode !== "forward_fix_only",
    automaticCutoverAllowed: items.length === 0 || options.allowCutoverWithQuarantine === true,
    backupManifestPath: options.backupManifestPath,
    quarantineManifestPath: options.quarantineManifestPath
  };
  writeJson(options.cutoverStatePath, {
    ...cutover,
    updatedAt: new Date().toISOString()
  });

  return {
    backup: {
      path: options.backupManifestPath,
      files: backupFiles
    },
    imported: {
      conversations,
      messages,
      memoryFacts
    },
    quarantine: {
      path: options.quarantineManifestPath,
      items
    },
    cutover: {
      automaticCutoverAllowed: cutover.automaticCutoverAllowed,
      legacyWritesAllowed: cutover.legacyWritesAllowed,
      mode,
      statePath: options.cutoverStatePath
    }
  };
}

function importHistoryFile(
  database: RuntimeDatabase,
  repositories: SqliteRuntimeRepositories,
  options: JsonImportOptions,
  path: string,
  parsed: unknown
): { conversations: number; messages: number } {
  const data = parseHistoryFile(parsed);
  const pathScope = historyPathScope(options.historyDir, path);
  if (!pathScope || data.tenantId !== pathScope.tenantId || data.conversationId !== pathScope.conversationId) {
    throw new Error("history scope does not match source path");
  }
  const owner = options.ownerMappings[`${data.tenantId}/${data.conversationId}`];
  if (!owner?.userId) {
    throw new Error("history record requires explicit owner mapping");
  }

  database.transaction((tx) => {
    repositories.history.replace(tx, data.tenantId, owner.userId, data.conversationId, data.messages as AgentMessage[]);
  });
  return { conversations: 1, messages: data.messages.length };
}

function importMemoryFile(
  database: RuntimeDatabase,
  repositories: SqliteRuntimeRepositories,
  options: JsonImportOptions,
  path: string,
  parsed: unknown
): number {
  const data = parseMemoryFile(parsed);
  const pathScope = memoryPathScope(options.memoryDir, path);
  if (!pathScope || data.tenantId !== pathScope.tenantId || data.userId !== pathScope.userId) {
    throw new Error("memory scope does not match source path");
  }
  for (const fact of data.facts) {
    if (fact.tenantId !== data.tenantId || fact.userId !== data.userId) {
      throw new Error("memory fact scope does not match source file");
    }
  }

  database.transaction((tx) => {
    for (const fact of data.facts as MemoryFact[]) {
      repositories.memory.upsert(tx, fact);
    }
  });
  return data.facts.length;
}

function listJsonFiles(root: string): string[] {
  if (!existsSync(root)) return [];
  const files: string[] = [];
  for (const entry of readdirSync(root)) {
    const path = join(root, entry);
    const stat = statSync(path);
    if (stat.isDirectory()) files.push(...listJsonFiles(path));
    else if (stat.isFile() && path.endsWith(".json")) files.push(path);
  }
  return files;
}

function historyPathScope(root: string, path: string): { tenantId: string; conversationId: string } | null {
  const parts = relative(root, path).split(/[\\/]/);
  if (parts.length !== 2) return null;
  return {
    tenantId: parts[0],
    conversationId: basename(parts[1], ".json")
  };
}

function memoryPathScope(root: string, path: string): { tenantId: string; userId: string } | null {
  const parts = relative(root, path).split(/[\\/]/);
  if (parts.length !== 2) return null;
  return {
    tenantId: decodeURIComponent(parts[0]),
    userId: decodeURIComponent(basename(parts[1], ".json"))
  };
}

function sha256File(path: string): string {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function parseHistoryFile(value: unknown): LegacyHistoryFile {
  if (!isRecord(value)) throw new Error("history record must be an object");
  if (typeof value.tenantId !== "string" || value.tenantId.length === 0) throw new Error("history tenantId is required");
  if (typeof value.conversationId !== "string" || value.conversationId.length === 0) {
    throw new Error("history conversationId is required");
  }
  if (!Array.isArray(value.messages)) throw new Error("history messages must be an array");
  return {
    tenantId: value.tenantId,
    conversationId: value.conversationId,
    messages: value.messages.map((message) => AgentMessageSchema.parse(message))
  };
}

function parseMemoryFile(value: unknown): LegacyMemoryFile {
  if (!isRecord(value)) throw new Error("memory record must be an object");
  if (typeof value.tenantId !== "string" || value.tenantId.length === 0) throw new Error("memory tenantId is required");
  if (typeof value.userId !== "string" || value.userId.length === 0) throw new Error("memory userId is required");
  if (!Array.isArray(value.facts)) throw new Error("memory facts must be an array");
  return {
    tenantId: value.tenantId,
    userId: value.userId,
    facts: value.facts.map((fact) => MemoryFactSchema.parse(fact))
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function safeError(error: unknown): string {
  if (isRecord(error) && Array.isArray(error.issues)) return "schema validation failed";
  if (error instanceof SyntaxError) return "invalid JSON";
  if (error instanceof Error) return error.message;
  return "unknown import error";
}

function writeJson(path: string, value: unknown): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
}
