import { describe, expect, it } from "vitest";
import { computeCacheHints } from "../src/cacheHints";
import type { AgentMessage } from "../src/types";

describe("computeCacheHints", () => {
  it("returns 2 hints for a normal conversation", () => {
    const messages: AgentMessage[] = [
      { role: "system", content: "You are helpful." },
      { role: "user", content: "Hello" },
      { role: "assistant", content: "Hi there" },
      { role: "user", content: "What time?" },
      { role: "assistant", content: "Let me check" }
    ];
    const hints = computeCacheHints(messages);
    expect(hints).toHaveLength(2);
    expect(hints[0].messageIndexFromTail).toBe(1); // last message
    expect(hints[0].scope).toBe("message");
    expect(hints[1].messageIndexFromTail).toBe(2); // second to last
  });

  it("skips transient messages", () => {
    const messages: AgentMessage[] = [
      { role: "user", content: "Hello" },
      { role: "assistant", content: "Response" },
      { role: "user", content: "transient msg", transient: true } as AgentMessage
    ];
    const hints = computeCacheHints(messages);
    expect(hints).toHaveLength(2);
    // Should skip the transient and pick the previous two
    expect(hints[0].messageIndexFromTail).toBe(2); // "Response"
    expect(hints[1].messageIndexFromTail).toBe(3); // "Hello"
  });

  it("skips systemInjected messages", () => {
    const messages: AgentMessage[] = [
      { role: "user", content: "Hello" },
      { role: "assistant", content: "injected", systemInjected: true } as AgentMessage,
      { role: "user", content: "Real" }
    ];
    const hints = computeCacheHints(messages);
    expect(hints).toHaveLength(2);
    expect(hints[0].messageIndexFromTail).toBe(1); // "Real"
    expect(hints[1].messageIndexFromTail).toBe(3); // "Hello"
  });

  it("returns fewer hints when not enough eligible messages", () => {
    const messages: AgentMessage[] = [
      { role: "user", content: "Only one" }
    ];
    const hints = computeCacheHints(messages);
    expect(hints).toHaveLength(1);
    expect(hints[0].messageIndexFromTail).toBe(1);
  });

  it("uses tool_result_block scope for tool messages", () => {
    const messages: AgentMessage[] = [
      { role: "user", content: "Hello" },
      { role: "assistant", content: "", toolCalls: [{ id: "c1", name: "echo", argumentsRaw: "{}" }] },
      { role: "tool", content: "{\"echo\":\"hi\"}", toolCallId: "c1" }
    ];
    const hints = computeCacheHints(messages);
    expect(hints[0].scope).toBe("tool_result_block");
    expect(hints[0].messageIndexFromTail).toBe(1);
  });

  it("handles CACHE_STRATEGY configurations", () => {
    const messages: AgentMessage[] = [
      { role: "user", content: "Hello" },
      { role: "assistant", content: "Hi" },
      { role: "user", content: "Test" }
    ];

    // off strategy
    expect(computeCacheHints(messages, "off")).toHaveLength(0);

    // single strategy
    const singleHints = computeCacheHints(messages, "single");
    expect(singleHints).toHaveLength(1);
    expect(singleHints[0].messageIndexFromTail).toBe(1);

    // double strategy
    const doubleHints = computeCacheHints(messages, "double");
    expect(doubleHints).toHaveLength(2);
    expect(doubleHints[0].messageIndexFromTail).toBe(1);
    expect(doubleHints[1].messageIndexFromTail).toBe(2);
  });

  it("supports adaptive strategy based on token counts", () => {
    // Under 2000 tokens (adaptive chooses limit=1)
    const shortMessages: AgentMessage[] = [
      { role: "user", content: "Short content" },
      { role: "assistant", content: "Hello" }
    ];
    const adaptiveShort = computeCacheHints(shortMessages, "adaptive");
    expect(adaptiveShort).toHaveLength(1);
    expect(adaptiveShort[0].messageIndexFromTail).toBe(1);

    // Over 2000 tokens (adaptive chooses limit=2)
    // We repeat a message content to exceed 2000 estimated tokens
    const longText = "a".repeat(8000); // 8000 ASCII chars = ~2000 tokens
    const longMessages: AgentMessage[] = [
      { role: "user", content: longText },
      { role: "assistant", content: "This is long" }
    ];
    const adaptiveLong = computeCacheHints(longMessages, "adaptive");
    expect(adaptiveLong).toHaveLength(2);
    expect(adaptiveLong[0].messageIndexFromTail).toBe(1);
    expect(adaptiveLong[1].messageIndexFromTail).toBe(2);
  });
});

