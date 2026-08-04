import { describe, expect, it } from "vitest";
import { createRuntimeChatLifecycleLogger } from "../src/runtimeChatLifecycleLog";

const identity = {
  conversationId: "conv-log",
  requestId: "req-log",
  traceId: "trace-log",
  executionId: "exec-log"
};

describe("RuntimeChatLifecycleLogger", () => {
  it("writes exact allowlisted accepted and terminal JSON lines", () => {
    const lines: string[] = [];
    const logger = createRuntimeChatLifecycleLogger(line => lines.push(line));

    logger.accepted(identity, 1_000);
    logger.terminal(identity, {
      status: "completed",
      stopReason: "FINAL_ANSWER",
      durationMs: 25,
      timestampMs: 1_025
    });

    expect(lines.map(line => JSON.parse(line))).toEqual([
      {
        schemaVersion: 1,
        event: "runtime_chat_accepted",
        timestamp: "1970-01-01T00:00:01.000Z",
        ...identity
      },
      {
        schemaVersion: 1,
        event: "runtime_chat_terminal",
        timestamp: "1970-01-01T00:00:01.025Z",
        ...identity,
        status: "completed",
        stopReason: "FINAL_ANSWER",
        durationMs: 25
      }
    ]);
  });

  it("ignores non-allowlisted canary properties", () => {
    const lines: string[] = [];
    const logger = createRuntimeChatLifecycleLogger(line => lines.push(line));
    const tainted = {
      ...identity,
      message: "MESSAGE-CANARY",
      answer: "ANSWER-CANARY",
      prompt: "PROMPT-CANARY",
      toolArguments: "TOOL-CANARY",
      authorization: "Bearer AUTH-CANARY",
      tenantId: "TENANT-CANARY",
      userId: "USER-CANARY",
      oauth: "OAUTH-CANARY",
      error: "ERROR-CANARY"
    };

    logger.accepted(tainted, 1_000);
    logger.terminal(tainted, {
      status: "errored",
      stopReason: "MODEL_ERROR",
      durationMs: 1,
      timestampMs: 1_001
    });

    const output = lines.join("\n");
    for (const canary of [
      "MESSAGE-CANARY",
      "ANSWER-CANARY",
      "PROMPT-CANARY",
      "TOOL-CANARY",
      "AUTH-CANARY",
      "TENANT-CANARY",
      "USER-CANARY",
      "OAUTH-CANARY",
      "ERROR-CANARY"
    ]) {
      expect(output).not.toContain(canary);
    }
  });

  it("swallows serializer sink failures", () => {
    const logger = createRuntimeChatLifecycleLogger(() => {
      throw new Error("SINK-CANARY");
    });

    expect(() => logger.accepted(identity, 1_000)).not.toThrow();
    expect(() => logger.terminal(identity, {
      status: "completed",
      stopReason: "FINAL_ANSWER",
      durationMs: 0,
      timestampMs: 1_000
    })).not.toThrow();
  });
});
