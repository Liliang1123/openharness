import { describe, expect, it } from "vitest";
import type { SessionEvent } from "../src/types";
import { createSqliteRuntimeRepositories } from "../src/storage/sqliteRuntimeRepositories";
import { RuntimeLifecycleCommands, publishCommittedLifecycleEvents } from "../src/storage/lifecycleCommands";
import { InMemoryRuntimeEventStore } from "../src/runtimeEventStore";
import { openTestRuntimeDatabase } from "./sqliteRepositoryTestUtils";

const scope = {
  tenantId: "tenant-a",
  userId: "user-a",
  conversationId: "conversation-a",
  executionId: "execution-a",
  traceId: "trace-a",
  requestId: "request-a"
};

describe("RuntimeLifecycleCommands", () => {
  it("commits execution start as one unit of work and publishes only after commit", () => {
    const db = openTestRuntimeDatabase();
    const repositories = createSqliteRuntimeRepositories();
    const lifecycle = new RuntimeLifecycleCommands(db, repositories);
    const liveEvents = new InMemoryRuntimeEventStore();
    const observed: string[] = [];
    liveEvents.subscribe(scope.tenantId, scope.conversationId, (event) => observed.push(event.kind));

    const committed = lifecycle.startExecution({
      ...scope,
      message: "hello"
    });

    expect(observed).toEqual([]);
    expect(db.transaction((tx) => repositories.history.get(tx, scope.tenantId, scope.userId, scope.conversationId))).toEqual([
      { role: "user", content: "hello" }
    ]);
    expect(db.transaction((tx) =>
      repositories.execution.get(tx, scope.tenantId, scope.userId, scope.conversationId, scope.executionId)
    )?.status).toBe("running");
    expect(db.transaction((tx) =>
      repositories.runtimeEvent.replayAfter(tx, scope.tenantId, scope.userId, scope.conversationId, null)
    ).map((event) => event.kind)).toEqual(["agent_start"]);

    publishCommittedLifecycleEvents(liveEvents, committed);

    expect(observed).toEqual(["agent_start"]);
    db.close();
  });

  it("keeps committed state authoritative when post-commit publication fails", () => {
    const db = openTestRuntimeDatabase();
    const repositories = createSqliteRuntimeRepositories();
    const lifecycle = new RuntimeLifecycleCommands(db, repositories);
    const committed = lifecycle.startExecution({
      ...scope,
      message: "hello"
    });

    expect(() => publishCommittedLifecycleEvents({
      append(): SessionEvent {
        throw new Error("subscriber transport is down");
      }
    }, committed)).toThrow(/subscriber transport is down/);

    expect(db.transaction((tx) =>
      repositories.runtimeEvent.replayAfter(tx, scope.tenantId, scope.userId, scope.conversationId, null)
    ).map((event) => event.kind)).toEqual(["agent_start"]);
    db.close();
  });
});
