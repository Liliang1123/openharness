import { describe, expect, it } from "vitest";
import { hasUntrustedToolOutputSinceLastUser, MessageHistoryStore, toModelMessages } from "../src/history";

describe("MessageHistoryStore", () => {
  it("isolates messages by tenant, user, and conversation", () => {
    const store = new MessageHistoryStore();
    store.append("tenant-a", "user-a", "conv-1", { role: "user", content: "a" });
    store.append("tenant-a", "user-b", "conv-1", { role: "user", content: "b" });
    store.append("tenant-b", "user-a", "conv-1", { role: "user", content: "c" });

    expect(store.get("tenant-a", "user-a", "conv-1")[0]?.content).toBe("a");
    expect(store.get("tenant-a", "user-b", "conv-1")[0]?.content).toBe("b");
    expect(store.get("tenant-b", "user-a", "conv-1")[0]?.content).toBe("c");
  });

  it("strips internal fields before Java model calls", () => {
    const messages = toModelMessages([
      {
        role: "assistant",
        content: "internal",
        requestId: "req-001",
        conversationId: "conv-001",
        systemInjected: true,
        transient: true,
        compressedSummary: true,
        compressionInstruction: true,
        reasoningBlocks: [{ type: "thinking", signature: "sig", providerExtra: true }]
      }
    ]);

    expect(messages[0]).toEqual({
      role: "assistant",
      content: "internal",
      reasoningBlocks: [{ type: "thinking", signature: "sig", providerExtra: true }]
    });
  });

  it("detects untrusted tool output since last user", () => {
    expect(hasUntrustedToolOutputSinceLastUser([
      { role: "user", content: "inspect" },
      {
        role: "tool",
        toolCallId: "call-1",
        toolName: "read_file",
        toolResultProvenance: "untrusted",
        content: "data"
      }
    ])).toBe(true);

    expect(hasUntrustedToolOutputSinceLastUser([
      {
        role: "tool",
        toolCallId: "old",
        toolName: "read_file",
        toolResultProvenance: "untrusted",
        content: "old"
      },
      { role: "user", content: "new instruction" }
    ])).toBe(false);
  });
});
