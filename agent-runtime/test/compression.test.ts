import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { rmSync } from "node:fs";
import { join } from "node:path";
import { estimateTokens, shouldCompress, compress } from "../src/compression";
import { InMemoryHistoryStore } from "../src/history";
import type { AgentMessage } from "../src/types";

describe("estimateTokens", () => {
  it("estimates ASCII text at ~4 chars per token", () => {
    const msgs: AgentMessage[] = [{ role: "user", content: "a".repeat(400) }];
    // 400 ASCII / 4 = 100 + 4 overhead = 104
    expect(estimateTokens(msgs)).toBe(104);
  });

  it("estimates CJK text at ~1.5 chars per token", () => {
    const msgs: AgentMessage[] = [{ role: "user", content: "你".repeat(150) }];
    // 150 CJK / 1.5 = 100 + 4 overhead = 104
    expect(estimateTokens(msgs)).toBe(104);
  });

  it("handles mixed content", () => {
    const msgs: AgentMessage[] = [{ role: "user", content: "hello你好" }];
    // 5 ASCII / 4 + 2 CJK / 1.5 = 1.25 + 1.33 = ceil(2.58) = 3 + 4 overhead = 7
    const tokens = estimateTokens(msgs);
    expect(tokens).toBeGreaterThan(4); // at least overhead
    expect(tokens).toBeLessThan(20);
  });

  it("returns 0 for empty messages", () => {
    expect(estimateTokens([])).toBe(0);
  });
});

describe("shouldCompress", () => {
  it("returns false when under threshold", () => {
    const msgs: AgentMessage[] = [{ role: "user", content: "short" }];
    expect(shouldCompress(msgs, 100)).toBe(false);
  });

  it("returns true when over threshold", () => {
    const msgs: AgentMessage[] = [{ role: "user", content: "x".repeat(4000) }];
    // ~1000 tokens + overhead > 100
    expect(shouldCompress(msgs, 100)).toBe(true);
  });

  it("defensively ignores runtime sentinel messages", () => {
    const msgs: AgentMessage[] = [
      { role: "tool", toolCallId: "call-approval", content: "PENDING_APPROVAL" },
      { role: "tool", toolCallId: "call-deny", content: "POLICY_DENY" }
    ];

    expect(estimateTokens(msgs)).toBe(0);
    expect(shouldCompress(msgs, 1)).toBe(false);
  });
});

describe("compress", () => {
  const TEST_DIR = join(import.meta.dirname, ".tmp-compress-test");

  beforeEach(() => {
    rmSync(TEST_DIR, { recursive: true, force: true });
    // Set env for data dir
    process.env.HISTORY_DATA_DIR = TEST_DIR;
  });

  afterEach(() => {
    rmSync(TEST_DIR, { recursive: true, force: true });
    delete process.env.HISTORY_DATA_DIR;
  });

  it("compresses old messages and keeps recent ones", async () => {
    const history = new InMemoryHistoryStore();
    const tenantId = "t1";
    const convId = "c1";

    // Add 10 messages
    for (let i = 0; i < 10; i++) {
      history.append(tenantId, convId, { role: "user", content: `msg-${i}` });
    }

    const mockJavaClient = {
      request: vi.fn().mockResolvedValue({ summary: "compressed summary" })
    };

    await compress(tenantId, convId, history, mockJavaClient as any, {});

    const msgs = history.get(tenantId, convId);
    // KEEP_RECENT defaults to 6, so 10 - 6 = 4 compressed, result = 1 summary + 6 kept = 7
    expect(msgs).toHaveLength(7);
    expect((msgs[0] as any).compressedSummary).toBe(true);
    expect(msgs[0].content).toBe("compressed summary");
  });

  it("does nothing when messages <= KEEP_RECENT", async () => {
    const history = new InMemoryHistoryStore();
    history.append("t1", "c1", { role: "user", content: "only one" });

    const mockJavaClient = { request: vi.fn() };
    await compress("t1", "c1", history, mockJavaClient as any, {});

    expect(mockJavaClient.request).not.toHaveBeenCalled();
    expect(history.get("t1", "c1")).toHaveLength(1);
  });
});
