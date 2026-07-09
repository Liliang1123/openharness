import { describe, expect, it } from "vitest";
import { SqliteMemoryStore } from "../src/storage/sqliteMemoryStore";
import { openTestRuntimeDatabase } from "./sqliteRepositoryTestUtils";

describe("SqliteMemoryStore", () => {
  it("upserts, searches, and deletes facts within tenant/user scope", () => {
    const db = openTestRuntimeDatabase();
    const store = new SqliteMemoryStore();

    db.transaction((tx) => {
      store.upsert(tx, {
        memoryId: "mem-a",
        tenantId: "tenant-a",
        userId: "user-a",
        content: "Prefers SQLite examples",
        tags: ["Database"]
      });
      store.upsert(tx, {
        memoryId: "mem-b",
        tenantId: "tenant-a",
        userId: "user-b",
        content: "Prefers Postgres examples",
        tags: ["Database"]
      });
    });

    expect(db.transaction((tx) => store.search(tx, "tenant-a", "user-a", "sqlite")).map((fact) => fact.memoryId)).toEqual(["mem-a"]);
    expect(db.transaction((tx) => store.list(tx, "tenant-a", "user-a")).map((fact) => fact.memoryId)).toEqual(["mem-a"]);
    expect(db.transaction((tx) => store.delete(tx, "tenant-a", "user-a", "mem-a"))).toBe(true);
    expect(db.transaction((tx) => store.list(tx, "tenant-a", "user-a"))).toEqual([]);
    db.close();
  });
});
