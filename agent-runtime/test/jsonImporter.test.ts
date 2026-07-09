import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { importLegacyJsonRuntimeData } from "../src/storage/jsonImporter";
import { createSqliteRuntimeRepositories } from "../src/storage/sqliteRuntimeRepositories";
import { openTestRuntimeDatabase } from "./sqliteRepositoryTestUtils";

const dirs: string[] = [];

describe("JSON import and quarantine", () => {
  afterEach(() => {
    while (dirs.length > 0) rmSync(dirs.pop()!, { recursive: true, force: true });
  });

  it("imports valid legacy JSON once, backs up hashes, and writes a forward-fix-only marker", () => {
    const workspace = testWorkspace();
    writeHistory(workspace, "tenant-a", "conversation-a", {
      tenantId: "tenant-a",
      conversationId: "conversation-a",
      updatedAt: "2026-07-06T00:00:00.000Z",
      messages: [
        { role: "user", content: "hello" },
        { role: "assistant", content: "hi" }
      ]
    });
    writeMemory(workspace, "tenant-a", "user-a", {
      tenantId: "tenant-a",
      userId: "user-a",
      updatedAt: "2026-07-06T00:00:00.000Z",
      facts: [
        {
          memoryId: "memory-a",
          tenantId: "tenant-a",
          userId: "user-a",
          content: "prefers terse answers",
          tags: ["preference"],
          createdAt: "2026-07-06T00:00:00.000Z",
          updatedAt: "2026-07-06T00:00:00.000Z"
        }
      ]
    });
    const db = openTestRuntimeDatabase();
    const repositories = createSqliteRuntimeRepositories();

    const first = importLegacyJsonRuntimeData(db, repositories, {
      historyDir: workspace.historyDir,
      memoryDir: workspace.memoryDir,
      backupManifestPath: workspace.backupManifestPath,
      quarantineManifestPath: workspace.quarantineManifestPath,
      cutoverStatePath: workspace.cutoverStatePath,
      ownerMappings: {
        "tenant-a/conversation-a": { userId: "user-a" }
      }
    });
    const second = importLegacyJsonRuntimeData(db, repositories, {
      historyDir: workspace.historyDir,
      memoryDir: workspace.memoryDir,
      backupManifestPath: workspace.backupManifestPath,
      quarantineManifestPath: workspace.quarantineManifestPath,
      cutoverStatePath: workspace.cutoverStatePath,
      ownerMappings: {
        "tenant-a/conversation-a": { userId: "user-a" }
      }
    });

    expect(first.backup.files).toHaveLength(2);
    expect(existsSync(workspace.backupManifestPath)).toBe(true);
    expect(first.imported).toEqual({ conversations: 1, messages: 2, memoryFacts: 1 });
    expect(second.imported).toEqual({ conversations: 1, messages: 2, memoryFacts: 1 });
    expect(db.transaction((tx) => repositories.history.get(tx, "tenant-a", "user-a", "conversation-a"))).toHaveLength(2);
    expect(db.transaction((tx) => repositories.memory.list(tx, "tenant-a", "user-a"))).toHaveLength(1);
    expect(readJson<{ mode: string }>(workspace.cutoverStatePath).mode).toBe("forward_fix_only");
    expect(second.cutover.legacyWritesAllowed).toBe(false);
    db.close();
  });

  it("quarantines malformed, wrong-scope, missing-user, and secret-bearing records without raw content", () => {
    const workspace = testWorkspace();
    mkdirSync(join(workspace.historyDir, "tenant-a"), { recursive: true });
    writeFileSync(join(workspace.historyDir, "tenant-a", "malformed.json"), "{ not json");
    writeHistory(workspace, "tenant-a", "wrong-scope", {
      tenantId: "tenant-b",
      conversationId: "wrong-scope",
      updatedAt: "2026-07-06T00:00:00.000Z",
      messages: [{ role: "user", content: "must not import" }]
    });
    writeHistory(workspace, "tenant-a", "missing-user", {
      tenantId: "tenant-a",
      conversationId: "missing-user",
      updatedAt: "2026-07-06T00:00:00.000Z",
      messages: [{ role: "user", content: "needs owner mapping" }]
    });
    writeMemory(workspace, "tenant-a", "user-a", {
      tenantId: "tenant-a",
      userId: "user-a",
      updatedAt: "2026-07-06T00:00:00.000Z",
      facts: [
        {
          memoryId: "secret-memory",
          tenantId: "tenant-a",
          userId: "user-b",
          content: "sk-test-canary should never appear in quarantine",
          tags: ["secret"],
          createdAt: "2026-07-06T00:00:00.000Z",
          updatedAt: "2026-07-06T00:00:00.000Z"
        }
      ]
    });
    const db = openTestRuntimeDatabase();
    const repositories = createSqliteRuntimeRepositories();

    const report = importLegacyJsonRuntimeData(db, repositories, {
      historyDir: workspace.historyDir,
      memoryDir: workspace.memoryDir,
      backupManifestPath: workspace.backupManifestPath,
      quarantineManifestPath: workspace.quarantineManifestPath,
      cutoverStatePath: workspace.cutoverStatePath,
      ownerMappings: {}
    });

    expect(report.quarantine.items).toHaveLength(4);
    expect(report.cutover.automaticCutoverAllowed).toBe(false);
    const quarantineRaw = readFileSync(workspace.quarantineManifestPath, "utf-8");
    expect(quarantineRaw).not.toContain("sk-test-canary");
    expect(quarantineRaw).not.toContain("must not import");
    expect(quarantineRaw).not.toContain("needs owner mapping");
    expect(report.quarantine.items.every((item) => item.path && item.sha256 && item.error)).toBe(true);
    expect(report.quarantine.items.every((item) => !("content" in item))).toBe(true);
    db.close();
  });
});

function testWorkspace() {
  const root = mkdtempSync(join(tmpdir(), "openharness-json-importer-"));
  dirs.push(root);
  const historyDir = join(root, "history");
  const memoryDir = join(root, "memory");
  return {
    root,
    historyDir,
    memoryDir,
    backupManifestPath: join(root, "backup-manifest.json"),
    quarantineManifestPath: join(root, "quarantine-manifest.json"),
    cutoverStatePath: join(root, "cutover-state.json")
  };
}

function writeHistory(workspace: ReturnType<typeof testWorkspace>, tenantId: string, conversationId: string, data: unknown): void {
  const tenantDir = join(workspace.historyDir, tenantId);
  writeJson(join(tenantDir, `${conversationId}.json`), data);
}

function writeMemory(workspace: ReturnType<typeof testWorkspace>, tenantId: string, userId: string, data: unknown): void {
  writeJson(join(workspace.memoryDir, encodeURIComponent(tenantId), `${encodeURIComponent(userId)}.json`), data);
}

function writeJson(path: string, value: unknown): void {
  rmSync(path, { force: true });
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(value, null, 2));
}

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, "utf-8")) as T;
}
