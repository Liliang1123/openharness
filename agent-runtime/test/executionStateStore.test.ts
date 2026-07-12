import { describe, expect, it } from "vitest";
import { InMemoryExecutionStateStore } from "../src/executionStateStore";

describe("InMemoryExecutionStateStore", () => {
  const scope = { executionId: "exec-1", conversationId: "conv-1", tenantId: "t1", userId: "u1" };

  it("create returns running state with abortController and timestamps", () => {
    const store = new InMemoryExecutionStateStore();
    const state = store.create(scope);
    expect(state.status).toBe("running");
    expect(state.executionId).toBe("exec-1");
    expect(state.conversationId).toBe("conv-1");
    expect(state.tenantId).toBe("t1");
    expect(state.abortController).toBeInstanceOf(AbortController);
    expect(state.abortController.signal.aborted).toBe(false);
    expect(state.startedAt).toBeGreaterThan(0);
    expect(state.endedAt).toBeNull();
  });

  it("get returns null for unknown executionId", () => {
    const store = new InMemoryExecutionStateStore();
    expect(store.get("t1", "u1", "conv-1", "unknown")).toBeNull();
  });

  it("get returns the created state", () => {
    const store = new InMemoryExecutionStateStore();
    store.create(scope);
    const got = store.get("t1", "u1", "conv-1", "exec-1");
    expect(got?.executionId).toBe("exec-1");
  });

  it("transitionToTerminal updates status, endedAt and endReason", () => {
    const store = new InMemoryExecutionStateStore();
    store.create(scope);
    const after = store.transitionToTerminal("t1", "u1", "conv-1", "exec-1", "completed", "FINAL_ANSWER");
    expect(after?.status).toBe("completed");
    expect(after?.endedAt).toBeGreaterThan(0);
    expect(after?.endReason).toBe("FINAL_ANSWER");
  });

  it("transitionToTerminal on terminal state is a no-op", () => {
    const store = new InMemoryExecutionStateStore();
    store.create(scope);
    const first = store.transitionToTerminal("t1", "u1", "conv-1", "exec-1", "completed", "FINAL_ANSWER");
    const firstEndedAt = first!.endedAt;
    // attempt to overwrite
    const second = store.transitionToTerminal("t1", "u1", "conv-1", "exec-1", "errored", "MODEL_ERROR");
    expect(second?.status).toBe("completed");
    expect(second?.endReason).toBe("FINAL_ANSWER");
    expect(second?.endedAt).toBe(firstEndedAt);
  });

  it("abort on running execution flips status to aborted and signals AbortController", () => {
    const store = new InMemoryExecutionStateStore();
    store.create(scope);
    const changed = store.abort("t1", "u1", "conv-1", "exec-1");
    expect(changed).toBe(true);
    const after = store.get("t1", "u1", "conv-1", "exec-1");
    expect(after?.status).toBe("aborted");
    expect(after?.abortController.signal.aborted).toBe(true);
    expect(after?.endReason).toBe("EXECUTION_ABORTED");
    expect(after?.endedAt).toBeGreaterThan(0);
  });

  it("abort on terminal execution returns false (no-op)", () => {
    const store = new InMemoryExecutionStateStore();
    store.create(scope);
    store.transitionToTerminal("t1", "u1", "conv-1", "exec-1", "completed", "FINAL_ANSWER");
    const changed = store.abort("t1", "u1", "conv-1", "exec-1");
    expect(changed).toBe(false);
    expect(store.get("t1", "u1", "conv-1", "exec-1")?.status).toBe("completed");
  });

  it("abort on unknown executionId returns false", () => {
    const store = new InMemoryExecutionStateStore();
    expect(store.abort("t1", "u1", "conv-1", "unknown")).toBe(false);
  });

  it("does not reveal an execution to another user in the same tenant", () => {
    const store = new InMemoryExecutionStateStore();
    store.create(scope);
    expect(store.get("t1", "u2", "conv-1", "exec-1")).toBeNull();
    expect(store.getActive("t1", "u2", "conv-1")).toBeNull();
    expect(store.abort("t1", "u2", "conv-1", "exec-1")).toBe(false);
  });

  it("keeps identical execution ids isolated by complete owner scope", () => {
    const store = new InMemoryExecutionStateStore();
    store.create(scope);
    store.create({ ...scope, userId: "u2" });

    expect(store.get("t1", "u1", "conv-1", "exec-1")?.userId).toBe("u1");
    expect(store.get("t1", "u2", "conv-1", "exec-1")?.userId).toBe("u2");
  });
});
