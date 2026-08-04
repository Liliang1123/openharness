import type { ExecutionStatus } from "./executionStateStore";

export interface RuntimeChatLifecycleIdentity {
  conversationId: string;
  requestId: string;
  traceId: string;
  executionId: string;
}

export interface RuntimeChatLifecycleLogger {
  accepted(identity: RuntimeChatLifecycleIdentity, timestampMs: number): void;
  terminal(
    identity: RuntimeChatLifecycleIdentity,
    terminal: {
      status: ExecutionStatus;
      stopReason?: string;
      durationMs: number;
      timestampMs: number;
    }
  ): void;
}

export function createRuntimeChatLifecycleLogger(
  writeLine: (line: string) => void = line => process.stdout.write(`${line}\n`)
): RuntimeChatLifecycleLogger {
  const safeWrite = (record: Record<string, unknown>) => {
    try {
      writeLine(JSON.stringify(record));
    } catch {
      // Operator logging must never alter execution semantics.
    }
  };

  return {
    accepted(identity, timestampMs) {
      safeWrite({
        schemaVersion: 1,
        event: "runtime_chat_accepted",
        timestamp: new Date(timestampMs).toISOString(),
        conversationId: identity.conversationId,
        requestId: identity.requestId,
        traceId: identity.traceId,
        executionId: identity.executionId
      });
    },
    terminal(identity, terminal) {
      safeWrite({
        schemaVersion: 1,
        event: "runtime_chat_terminal",
        timestamp: new Date(terminal.timestampMs).toISOString(),
        conversationId: identity.conversationId,
        requestId: identity.requestId,
        traceId: identity.traceId,
        executionId: identity.executionId,
        status: terminal.status,
        ...(terminal.stopReason ? { stopReason: terminal.stopReason } : {}),
        durationMs: Math.max(0, Math.floor(terminal.durationMs))
      });
    }
  };
}
