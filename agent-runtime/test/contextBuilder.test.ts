import { describe, expect, it } from "vitest";
import { buildModelContext } from "../src/contextBuilder";
import type { AgentMessage } from "../src/types";
import type { MemoryFact } from "../src/memoryStore";

const msg = (role: AgentMessage["role"], content: string, extra: Partial<AgentMessage> = {}): AgentMessage => ({
  role,
  content,
  ...extra
});

describe("buildModelContext", () => {
  it("retains compressed summary before selected recent messages", () => {
    const messages: AgentMessage[] = [
      msg("user", "summary", { compressedSummary: true } as Partial<AgentMessage>),
      msg("user", "older"),
      msg("assistant", "middle"),
      msg("user", "newest")
    ];

    const result = buildModelContext(messages, { budgetTokens: 1000 });

    expect(result.messages.map(m => m.content)).toEqual(["summary", "older", "middle", "newest"]);
    expect(result.meta.layers).toEqual(["compressed_summary", "recent_messages"]);
    expect(result.meta.truncated).toBe(false);
  });

  it("selects newest stable messages under budget and preserves chronological order", () => {
    const messages: AgentMessage[] = [
      msg("user", "old ".repeat(200)),
      msg("assistant", "middle ".repeat(30)),
      msg("user", "latest question")
    ];

    const result = buildModelContext(messages, { budgetTokens: 20 });

    expect(result.messages.map(m => m.content)).toEqual(["latest question"]);
    expect(result.meta.selectedMessages).toBe(1);
    expect(result.meta.truncated).toBe(true);
    expect(result.meta.estimatedTokens).toBeLessThanOrEqual(result.meta.budgetTokens);
  });

  it("keeps newest oversized message and marks context as truncated", () => {
    const messages: AgentMessage[] = [
      msg("user", "small"),
      msg("assistant", "x".repeat(400))
    ];

    const result = buildModelContext(messages, { budgetTokens: 10 });

    expect(result.messages).toHaveLength(1);
    expect(result.messages[0].content).toBe("x".repeat(400));
    expect(result.meta.truncated).toBe(true);
    expect(result.meta.estimatedTokens).toBeGreaterThan(result.meta.budgetTokens);
  });

  it("adds retrieved memory facts as a system context layer", () => {
    const memories: MemoryFact[] = [
      {
        memoryId: "mem-1",
        tenantId: "tenant-a",
        userId: "user-a",
        content: "User prefers concise Chinese replies.",
        tags: ["preference"],
        createdAt: "2026-06-05T00:00:00.000Z",
        updatedAt: "2026-06-05T00:00:00.000Z"
      }
    ];

    const result = buildModelContext([msg("user", "answer briefly")], {
      budgetTokens: 1000,
      memoryFacts: memories
    });

    expect(result.messages[0].role).toBe("system");
    expect("sessionContext" in result.messages[0]).toBe(false);
    expect(String(result.messages[0].content)).toContain("User prefers concise Chinese replies.");
    expect(result.meta.layers).toEqual(["memory_retrieval", "recent_messages"]);
  });

  it("keeps memory facts inside budget accounting before selecting recent messages", () => {
    const memories: MemoryFact[] = [
      {
        memoryId: "mem-1",
        tenantId: "tenant-a",
        userId: "user-a",
        content: "memory ".repeat(60),
        tags: ["large"],
        createdAt: "2026-06-05T00:00:00.000Z",
        updatedAt: "2026-06-05T00:00:00.000Z"
      }
    ];
    const messages: AgentMessage[] = [
      msg("user", "old ".repeat(100)),
      msg("assistant", "middle ".repeat(50)),
      msg("user", "latest")
    ];

    const result = buildModelContext(messages, {
      budgetTokens: 35,
      memoryFacts: memories
    });

    expect(result.messages[0].role).toBe("system");
    expect(result.messages.map(m => m.content)).not.toContain("old ".repeat(100));
    expect(result.meta.layers).toEqual(["memory_retrieval", "recent_messages"]);
    expect(result.meta.truncated).toBe(true);
  });

  it("does not add memory layer when no memory facts are supplied", () => {
    const result = buildModelContext([msg("user", "hello")], {
      budgetTokens: 1000,
      memoryFacts: []
    });

    expect(result.messages.map(m => m.content)).toEqual(["hello"]);
    expect(result.meta.layers).toEqual(["recent_messages"]);
  });

  it("extracts and retains session context message as static mid-level block", () => {
    const messages: AgentMessage[] = [
      msg("user", "summary", { compressedSummary: true } as Partial<AgentMessage>),
      msg("user", "[Session context: Today is 2026-06-22]"),
      msg("user", "older message that might get truncated due to low budget"),
      msg("user", "newest")
    ];

    // Under extremely low budget, "older message" is truncated but summary and session context remain
    const result = buildModelContext(messages, { budgetTokens: 25 });

    const contents = result.messages.map(m => m.content);
    expect(contents).toContain("summary");
    expect(contents).toContain("[Session context: Today is 2026-06-22]");
    expect(contents).toContain("newest");
    expect(contents).not.toContain("older message that might get truncated due to low budget");
    expect(result.meta.layers).toEqual(["compressed_summary", "session_context", "recent_messages"]);
  });
});

