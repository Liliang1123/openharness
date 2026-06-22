import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { InMemoryMemoryStore, JsonFileMemoryStore } from "../src/memoryStore";

describe("MemoryStore", () => {
  it("isolates memory facts by tenant and user", async () => {
    const store = new InMemoryMemoryStore();
    await store.upsert({
      memoryId: "mem-1",
      tenantId: "tenant-a",
      userId: "user-a",
      content: "prefers short replies",
      tags: ["preference"]
    });
    await store.upsert({
      memoryId: "mem-2",
      tenantId: "tenant-a",
      userId: "user-b",
      content: "prefers detailed replies",
      tags: ["preference"]
    });

    const listed = await store.list("tenant-a", "user-a");

    expect(listed).toHaveLength(1);
    expect(listed[0]?.memoryId).toBe("mem-1");
  });

  it("searches content and tags case-insensitively", async () => {
    const store = new InMemoryMemoryStore();
    await store.upsert({
      memoryId: "mem-1",
      tenantId: "tenant-a",
      userId: "user-a",
      content: "User likes PostgreSQL examples.",
      tags: ["Database"]
    });

    expect((await store.search("tenant-a", "user-a", "postgres")).map((m) => m.memoryId)).toEqual(["mem-1"]);
    expect((await store.search("tenant-a", "user-a", "database")).map((m) => m.memoryId)).toEqual(["mem-1"]);
  });

  it("replaces facts by memoryId and deletes them", async () => {
    const store = new InMemoryMemoryStore();
    await store.upsert({
      memoryId: "mem-1",
      tenantId: "tenant-a",
      userId: "user-a",
      content: "old",
      tags: []
    });
    await store.upsert({
      memoryId: "mem-1",
      tenantId: "tenant-a",
      userId: "user-a",
      content: "new",
      tags: ["current"]
    });

    expect((await store.list("tenant-a", "user-a"))[0]?.content).toBe("new");
    expect(await store.delete("tenant-a", "user-a", "mem-1")).toBe(true);
    expect(await store.list("tenant-a", "user-a")).toEqual([]);
  });

  it("persists memory facts to JSON and reloads them", async () => {
    const dataDir = mkdtempSync(join(tmpdir(), "openharness-memory-"));
    try {
      const first = new JsonFileMemoryStore(dataDir);
      await first.upsert({
        memoryId: "mem-1",
        tenantId: "tenant-a",
        userId: "user-a",
        content: "persisted memory",
        tags: ["persisted"]
      });

      const second = new JsonFileMemoryStore(dataDir);
      const listed = await second.list("tenant-a", "user-a");

      expect(listed).toHaveLength(1);
      expect(listed[0]?.content).toBe("persisted memory");
      expect((await second.search("tenant-a", "user-a", "persisted"))[0]?.memoryId).toBe("mem-1");
    } finally {
      rmSync(dataDir, { recursive: true, force: true });
    }
  });
});
