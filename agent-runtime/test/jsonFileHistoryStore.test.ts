import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { mkdirSync, rmSync, existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { JsonFileHistoryStore } from "../src/jsonFileHistoryStore";

const TEST_DIR = join(import.meta.dirname, ".tmp-history-test");

describe("JsonFileHistoryStore", () => {
  let store: JsonFileHistoryStore;

  beforeEach(() => {
    rmSync(TEST_DIR, { recursive: true, force: true });
    store = new JsonFileHistoryStore(TEST_DIR);
  });

  afterEach(() => {
    rmSync(TEST_DIR, { recursive: true, force: true });
  });

  it("append and get messages", () => {
    store.append("t1", "c1", { role: "user", content: "hello" });
    store.append("t1", "c1", { role: "assistant", content: "hi" });

    const msgs = store.get("t1", "c1");
    expect(msgs).toHaveLength(2);
    expect(msgs[0].content).toBe("hello");
    expect(msgs[1].content).toBe("hi");
  });

  it("isolates by tenant and conversation", () => {
    store.append("t1", "c1", { role: "user", content: "a" });
    store.append("t2", "c1", { role: "user", content: "b" });

    expect(store.get("t1", "c1")[0].content).toBe("a");
    expect(store.get("t2", "c1")[0].content).toBe("b");
    expect(store.get("t1", "c2")).toHaveLength(0);
  });

  it("save writes JSON file and load restores", async () => {
    store.append("t1", "c1", { role: "user", content: "persisted" });
    await store.save("t1", "c1");

    const filePath = join(TEST_DIR, "t1", "c1.json");
    expect(existsSync(filePath)).toBe(true);

    const data = JSON.parse(readFileSync(filePath, "utf-8"));
    expect(data.tenantId).toBe("t1");
    expect(data.conversationId).toBe("c1");
    expect(data.messages).toHaveLength(1);

    // Load into a fresh store
    const store2 = new JsonFileHistoryStore(TEST_DIR);
    await store2.load("t1", "c1");
    expect(store2.get("t1", "c1")[0].content).toBe("persisted");
  });

  it("replace overwrites messages", async () => {
    store.append("t1", "c1", { role: "user", content: "old" });
    store.replace("t1", "c1", [{ role: "user", content: "new" }]);

    expect(store.get("t1", "c1")).toHaveLength(1);
    expect(store.get("t1", "c1")[0].content).toBe("new");
  });

  it("get returns empty array for non-existent conversation", () => {
    expect(store.get("t1", "nonexistent")).toHaveLength(0);
  });

  it("list returns sessions sorted by updatedAt desc", async () => {
    store.append("t1", "c-old", { role: "user", content: "old" });
    await store.save("t1", "c-old");
    // Ensure timestamps differ
    await new Promise(r => setTimeout(r, 10));
    store.append("t1", "c-new", { role: "user", content: "new content" });
    await store.save("t1", "c-new");

    const sessions = await store.list("t1");
    expect(sessions).toHaveLength(2);
    expect(sessions[0].conversationId).toBe("c-new");
    expect(sessions[0].title).toBe("new content");
    expect(sessions[1].conversationId).toBe("c-old");
  });

  it("list isolates by tenant", async () => {
    store.append("t1", "c1", { role: "user", content: "a" });
    await store.save("t1", "c1");
    store.append("t2", "c2", { role: "user", content: "b" });
    await store.save("t2", "c2");

    expect(await store.list("t1")).toHaveLength(1);
    expect(await store.list("t2")).toHaveLength(1);
    expect((await store.list("t1"))[0].conversationId).toBe("c1");
  });

  it("list returns empty array for tenant with no sessions", async () => {
    expect(await store.list("nobody")).toEqual([]);
  });

  it("delete removes JSON file and chunk files", async () => {
    store.append("t1", "c1", { role: "user", content: "msg" });
    await store.save("t1", "c1");

    // Manually create chunk files to simulate compression
    const tenantDir = join(TEST_DIR, "t1");
    const { writeFileSync, mkdirSync } = await import("node:fs");
    mkdirSync(tenantDir, { recursive: true });
    writeFileSync(join(tenantDir, "c1-chunk-1.md"), "chunk1");
    writeFileSync(join(tenantDir, "c1-chunk-2.md"), "chunk2");

    await store.delete("t1", "c1");

    expect(existsSync(join(tenantDir, "c1.json"))).toBe(false);
    expect(existsSync(join(tenantDir, "c1-chunk-1.md"))).toBe(false);
    expect(existsSync(join(tenantDir, "c1-chunk-2.md"))).toBe(false);
  });

  it("delete is idempotent for missing session", async () => {
    await expect(store.delete("t1", "ghost")).resolves.toBeUndefined();
  });
});
