import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { InMemoryHistoryStore, toApi, toReplay } from "../src/history";
import { JsonFileHistoryStore } from "../src/jsonFileHistoryStore";
import type { AgentMessage } from "../src/types";

const TEST_DIR = join(import.meta.dirname, ".tmp-history-layering");

describe("stable history layering", () => {
  beforeEach(() => {
    rmSync(TEST_DIR, { recursive: true, force: true });
  });

  afterEach(() => {
    rmSync(TEST_DIR, { recursive: true, force: true });
  });

  it("rejects runtime sentinel writes at the HistoryStore boundary", () => {
    const store = new InMemoryHistoryStore();

    expect(() => store.append("t1", "u1", "c1", sentinel("PENDING_APPROVAL"))).toThrow(/stable history/i);
    expect(() => store.append("t1", "u1", "c1", sentinel("POLICY_DENY"))).toThrow(/stable history/i);

    store.append("t1", "u1", "c1", { role: "user", content: "stable" });
    expect(store.get("t1", "u1", "c1")).toEqual([{ role: "user", content: "stable" }]);
  });

  it("filters legacy runtime sentinels when reading persisted history", async () => {
    const userDir = join(TEST_DIR, "t1", "u1");
    mkdirSync(userDir, { recursive: true });
    writeFileSync(join(userDir, "c1.json"), JSON.stringify({
      tenantId: "t1",
      userId: "u1",
      conversationId: "c1",
      updatedAt: "2026-06-04T00:00:00.000Z",
      messages: [
        { role: "user", content: "hello" },
        sentinel("PENDING_APPROVAL"),
        { role: "assistant", content: "world" },
        sentinel("POLICY_DENY")
      ]
    }));

    const store = new JsonFileHistoryStore(TEST_DIR);

    expect(store.get("t1", "u1", "c1")).toEqual([
      { role: "user", content: "hello" },
      { role: "assistant", content: "world" }
    ]);
    await expect(store.list("t1", "u1")).resolves.toEqual([
      { conversationId: "c1", title: "hello", updatedAt: "2026-06-04T00:00:00.000Z" }
    ]);
  });

  it("filters sentinels from model and replay views during the migration window", () => {
    const messages: AgentMessage[] = [
      { role: "user", content: "hello" },
      sentinel("PENDING_APPROVAL"),
      { role: "assistant", content: "world" },
      sentinel("POLICY_DENY")
    ];

    expect(toApi(messages).map((m) => m.content)).toEqual(["hello", "world"]);
    expect(toReplay(messages).map((m) => m.content)).toEqual(["hello", "world"]);
  });
});

function sentinel(content: "PENDING_APPROVAL" | "POLICY_DENY"): AgentMessage {
  return { role: "tool", toolCallId: `call-${content}`, content };
}
