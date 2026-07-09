import { describe, expect, it } from "vitest";
import { SqliteHistoryStore } from "../src/storage/sqliteHistoryStore";
import { SqliteMemoryStore } from "../src/storage/sqliteMemoryStore";
import { createSqliteRuntimeRepositories } from "../src/storage/sqliteRuntimeRepositories";
import { openTestRuntimeDatabase } from "./sqliteRepositoryTestUtils";

describe("SqliteHistoryStore", () => {
  it("reads messages chronologically within the tenant/user conversation scope", () => {
    const db = openTestRuntimeDatabase();
    const store = new SqliteHistoryStore();

    db.transaction((tx) => {
      store.ensureConversation(tx, {
        tenantId: "tenant-a",
        userId: "user-a",
        conversationId: "conversation-a",
        title: "Conversation A"
      });
      store.append(tx, "tenant-a", "user-a", "conversation-a", { role: "assistant", content: "second" });
      store.append(tx, "tenant-a", "user-a", "conversation-a", { role: "user", content: "first" });
    });

    const messages = db.transaction((tx) => store.get(tx, "tenant-a", "user-a", "conversation-a"));

    expect(messages.map((message) => message.content)).toEqual(["second", "first"]);
    db.close();
  });

  it("does not leak same-tenant same-conversation history across users", () => {
    const db = openTestRuntimeDatabase();
    const store = new SqliteHistoryStore();

    db.transaction((tx) => {
      for (const userId of ["user-a", "user-b"]) {
        store.ensureConversation(tx, { tenantId: "tenant-a", userId, conversationId: "conversation-a" });
      }
      store.append(tx, "tenant-a", "user-a", "conversation-a", { role: "user", content: "private-a" });
      store.append(tx, "tenant-a", "user-b", "conversation-a", { role: "user", content: "private-b" });
    });

    expect(db.transaction((tx) => store.get(tx, "tenant-a", "user-a", "conversation-a"))).toEqual([
      { role: "user", content: "private-a" }
    ]);
    expect(db.transaction((tx) => store.get(tx, "tenant-a", "user-b", "conversation-a"))).toEqual([
      { role: "user", content: "private-b" }
    ]);
    db.close();
  });

  it("rolls back multi-repository writes bound to one RuntimeTransaction", () => {
    const db = openTestRuntimeDatabase();
    const history = new SqliteHistoryStore();
    const memory = new SqliteMemoryStore();

    expect(() => db.transaction((tx) => {
      history.ensureConversation(tx, { tenantId: "tenant-a", userId: "user-a", conversationId: "conversation-a" });
      history.append(tx, "tenant-a", "user-a", "conversation-a", { role: "user", content: "uncommitted" });
      memory.upsert(tx, {
        memoryId: "mem-a",
        tenantId: "tenant-a",
        userId: "user-a",
        content: "uncommitted memory",
        tags: []
      });
      throw new Error("force rollback");
    })).toThrow("force rollback");

    expect(db.transaction((tx) => history.get(tx, "tenant-a", "user-a", "conversation-a"))).toEqual([]);
    expect(db.transaction((tx) => memory.list(tx, "tenant-a", "user-a"))).toEqual([]);
    db.close();
  });

  it("creates one injectable SQLite repository bundle", () => {
    const repositories = createSqliteRuntimeRepositories();

    expect(repositories.history).toBeInstanceOf(SqliteHistoryStore);
    expect(repositories.memory).toBeInstanceOf(SqliteMemoryStore);
    expect(repositories.execution).toBeDefined();
    expect(repositories.approval).toBeDefined();
    expect(repositories.runtimeEvent).toBeDefined();
  });
});
