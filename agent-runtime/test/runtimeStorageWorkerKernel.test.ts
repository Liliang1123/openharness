import { mkdtempSync, rmSync, statSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";
import {
  createRuntimeStorageWorkerKernel,
  type RuntimeStorageWorkerKernel
} from "../src/storage/runtimeStorageWorkerKernel";
import type {
  StorageOperation,
  StoragePayloadMap,
  StorageWorkerRequest
} from "../src/storage/runtimeStorageWorkerProtocol";

const temporaryDirectories: string[] = [];

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe("RuntimeStorageWorkerKernel", () => {
  it("bootstraps exactly one database with migration, integrity, identity, and startup reconciliation", () => {
    const { kernel, databasePath } = createBootstrappedKernel();
    kernel.execute(request("lifecycle.startExecution", startInput("execution-reconcile")));
    kernel.execute(request("lifecycle.enterApproval", {
      ...scope("execution-reconcile"),
      approvalId: "approval-reconcile",
      toolCallId: "tool-call-reconcile",
      toolName: "filesystem.read",
      argumentsRaw: "{}"
    }));
    kernel.execute(request("storage.close", {}));

    const reopened = createRuntimeStorageWorkerKernel();
    const identity = statSync(databasePath);
    const bootstrap = reopened.execute(request("bootstrap", {
      databasePath,
      expectedDatabaseIdentity: { dev: identity.dev, ino: identity.ino }
    }, "p0"));

    expect(bootstrap).toMatchObject({
      schemaVersion: 2,
      integrity: "ok",
      databaseIdentity: { dev: identity.dev, ino: identity.ino },
      reconciliation: {
        interruptedExecutions: 1,
        invalidatedApprovals: 1
      }
    });
    expect(reopened.execute(request("execution.get", {
      tenantId: "tenant-a",
      userId: "user-a",
      conversationId: "conversation-a",
      executionId: "execution-reconcile"
    }))).toMatchObject({
      status: "errored",
      stopReason: "EXECUTION_INTERRUPTED"
    });
    expect(() => reopened.execute(request("bootstrap", { databasePath }, "p0")))
      .toThrow("RUNTIME_STORAGE_ALREADY_BOOTSTRAPPED");
    reopened.execute(request("storage.close", {}));
    expect(() => reopened.execute(request("history.list", {
      tenantId: "tenant-a",
      userId: "user-a"
    }))).toThrow("RUNTIME_STORAGE_CLOSED");
  });

  it("preserves existing lifecycle message, execution, and event ordering", () => {
    const { kernel } = createBootstrappedKernel();
    expect(kernel.execute(request("lifecycle.startExecution", startInput("execution-life"))).events)
      .toMatchObject([{ kind: "agent_start" }]);

    const completed = kernel.execute(request("lifecycle.completeExecution", {
      ...scope("execution-life"),
      assistantMessage: { role: "assistant", content: "done" },
      stopReason: "FINAL_ANSWER"
    }));
    expect(completed.events.map(event => event.kind)).toEqual([
      "final_answer",
      "agent_end",
      "stream_done"
    ]);
    expect(kernel.execute(request("history.get", historyScope()))).toEqual([
      { role: "user", content: "hello" },
      { role: "assistant", content: "done" }
    ]);
    expect(kernel.execute(request("execution.get", {
      ...historyScope(),
      executionId: "execution-life"
    }))).toMatchObject({ status: "completed", stopReason: "FINAL_ANSWER" });
    expect(kernel.execute(request("event.forExecution", {
      ...historyScope(),
      executionId: "execution-life"
    })).map(event => event.kind)).toEqual([
      "agent_start",
      "final_answer",
      "agent_end",
      "stream_done"
    ]);
  });

  it("dispatches scoped history, memory, execution, approval, and event commands", () => {
    const { kernel } = createBootstrappedKernel();
    kernel.execute(request("lifecycle.startExecution", startInput("execution-stores")));
    kernel.execute(request("history.append", {
      ...historyScope(),
      message: { role: "assistant", content: "stored" }
    }));
    expect(kernel.execute(request("history.list", {
      tenantId: "tenant-a",
      userId: "user-a"
    }))).toHaveLength(1);
    kernel.execute(request("history.replace", {
      ...historyScope(),
      messages: [{ role: "user", content: "replacement" }]
    }));
    expect(kernel.execute(request("history.get", historyScope())))
      .toEqual([{ role: "user", content: "replacement" }]);

    const fact = kernel.execute(request("memory.upsert", {
      fact: {
        tenantId: "tenant-a",
        userId: "user-a",
        content: "prefers concise answers",
        tags: ["preference"]
      }
    }));
    expect(kernel.execute(request("memory.list", {
      tenantId: "tenant-a",
      userId: "user-a"
    }))).toEqual([fact]);
    expect(kernel.execute(request("memory.search", {
      tenantId: "tenant-a",
      userId: "user-a",
      query: "concise",
      tags: ["preference"]
    }))).toEqual([fact]);
    expect(kernel.execute(request("memory.delete", {
      tenantId: "tenant-a",
      userId: "user-a",
      memoryId: fact.memoryId
    }))).toBe(true);

    kernel.execute(request("lifecycle.enterApproval", {
      ...scope("execution-stores"),
      approvalId: "approval-stores",
      toolCallId: "tool-call-stores",
      toolName: "shell.exec",
      argumentsRaw: "{\"cmd\":\"pwd\"}",
      reason: "needs approval"
    }));
    expect(kernel.execute(request("execution.getActive", historyScope())))
      .toMatchObject({ executionId: "execution-stores", status: "waiting_approval" });
    expect(kernel.execute(request("execution.listNonTerminal", {})))
      .toHaveLength(1);
    expect(kernel.execute(request("approval.get", {
      ...historyScope(),
      executionId: "execution-stores",
      toolCallId: "tool-call-stores"
    }))).toMatchObject({
      askUserId: "approval-stores",
      toolName: "shell.exec",
      reason: "needs approval"
    });
    expect(kernel.execute(request("approval.listPending", historyScope())))
      .toHaveLength(1);

    const firstEventId = kernel.execute(request("event.latestEventId", historyScope()));
    expect(firstEventId).toBeTypeOf("string");
    expect(kernel.execute(request("event.hasEvent", {
      ...historyScope(),
      eventId: firstEventId!
    }))).toBe(true);
    expect(kernel.execute(request("event.since", {
      ...historyScope(),
      afterEventId: firstEventId
    }))).toEqual([]);
  });

  it("claims trace candidates and applies retry, delivered, and dead-letter outcomes in whole batches", () => {
    const { kernel } = createBootstrappedKernel();
    kernel.execute(request("lifecycle.startExecution", startInput("execution-outbox")));
    for (const suffix of ["retry", "delivered", "dead"]) {
      kernel.execute(request("lifecycle.recordEvent", {
        ...scope("execution-outbox"),
        kind: "trace",
        data: { name: suffix }
      }));
    }

    const claimed = kernel.execute(request("outbox.claim", {
      now: Number.MAX_SAFE_INTEGER,
      limit: 100
    }, "p2"));
    expect(claimed).toHaveLength(3);
    expect(claimed[0]).toMatchObject({
      deliveryAttempts: 0,
      nextAttemptAt: null,
      event: { kind: "trace" }
    });

    const transition = kernel.execute(request("outbox.applyOutcomes", {
      outcomes: [
        { event: eventKey(claimed[0]!.event), transition: "retry", nextAttemptAt: 500 },
        { event: eventKey(claimed[1]!.event), transition: "delivered" },
        { event: eventKey(claimed[2]!.event), transition: "dead_letter" }
      ]
    }, "p2"));
    expect(transition).toEqual({
      processed: 3,
      delivered: 1,
      retried: 1,
      deadLettered: 1,
      readinessDegraded: true
    });
    expect(kernel.execute(request("outbox.claim", { now: 499, limit: 100 }, "p2")))
      .toEqual([]);
    expect(kernel.execute(request("outbox.claim", { now: 500, limit: 100 }, "p2")))
      .toMatchObject([{ deliveryAttempts: 1, nextAttemptAt: 500 }]);
    expect(kernel.execute(request("outbox.hasDeadLetters", {}, "p2"))).toBe(true);
  });

  it("checkpoints WAL and critically drains every accepted non-terminal execution", () => {
    const { kernel } = createBootstrappedKernel();
    kernel.execute(request("lifecycle.startExecution", startInput("execution-drain")));
    const drained = kernel.execute(request("storage.criticalDrain", {
      errorMessage: "runtime stopping"
    }, "p0"));
    expect(drained.interruptedExecutions).toBe(1);
    expect(drained.events).toMatchObject([{ kind: "stream_error" }]);
    expect(kernel.execute(request("execution.listNonTerminal", {}))).toEqual([]);

    expect(kernel.execute(request("storage.checkpoint", {}, "p0"))).toEqual({
      busy: expect.any(Number),
      log: expect.any(Number),
      checkpointed: expect.any(Number)
    });
  });

  it("rejects commands before bootstrap", () => {
    const kernel = createRuntimeStorageWorkerKernel();
    expect(() => kernel.execute(request("history.list", {
      tenantId: "tenant-a",
      userId: "user-a"
    }))).toThrow("RUNTIME_STORAGE_NOT_BOOTSTRAPPED");
  });
});

function createBootstrappedKernel(): {
  kernel: RuntimeStorageWorkerKernel;
  databasePath: string;
} {
  const directory = mkdtempSync(join(tmpdir(), "openharness-storage-kernel-"));
  temporaryDirectories.push(directory);
  const databasePath = join(directory, "runtime.sqlite");
  const kernel = createRuntimeStorageWorkerKernel();
  kernel.execute(request("bootstrap", { databasePath }, "p0"));
  return { kernel, databasePath };
}

function request<O extends StorageOperation>(
  operation: O,
  payload: StoragePayloadMap[O],
  priority: StorageWorkerRequest<O>["priority"] = "p1"
): StorageWorkerRequest<O> {
  return {
    requestId: `request-${operation}-${Math.random()}`,
    priority,
    operation,
    payload
  } as StorageWorkerRequest<O>;
}

function historyScope() {
  return {
    tenantId: "tenant-a",
    userId: "user-a",
    conversationId: "conversation-a"
  };
}

function scope(executionId: string) {
  return {
    ...historyScope(),
    executionId,
    traceId: `trace-${executionId}`,
    requestId: `request-${executionId}`
  };
}

function startInput(executionId: string) {
  return {
    ...scope(executionId),
    message: "hello"
  };
}

function eventKey(event: {
  tenantId: string;
  userId: string;
  conversationId: string;
  eventId: string;
}) {
  return {
    tenantId: event.tenantId,
    userId: event.userId,
    conversationId: event.conversationId,
    eventId: event.eventId
  };
}
