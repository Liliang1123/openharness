import { describe, expect, it } from "vitest";
import { InMemoryExecutionStateStore } from "../src/executionStateStore";

describe("InMemoryExecutionStateStore", () => {
  it("create returns running state with abortController and timestamps", () => {
    const store = new InMemoryExecutionStateStore();
    const state = store.create({ executionId: "exec-1", conversationId: "conv-1", tenantId: "t1" });
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
    expect(store.get("unknown")).toBeNull();
  });

  it("get returns the created state", () => {
    const store = new InMemoryExecutionStateStore();
    store.create({ executionId: "exec-1", conversationId: "conv-1", tenantId: "t1" });
    const got = store.get("exec-1");
    expect(got?.executionId).toBe("exec-1");
  });

  it("transitionToTerminal updates status, endedAt and endReason", () => {
    const store = new InMemoryExecutionStateStore();
    store.create({ executionId: "exec-1", conversationId: "conv-1", tenantId: "t1" });
    const after = store.transitionToTerminal("exec-1", "completed", "FINAL_ANSWER");
    expect(after?.status).toBe("completed");
    expect(after?.endedAt).toBeGreaterThan(0);
    expect(after?.endReason).toBe("FINAL_ANSWER");
  });

  it("transitionToTerminal on terminal state is a no-op", () => {
    const store = new InMemoryExecutionStateStore();
    store.create({ executionId: "exec-1", conversationId: "conv-1", tenantId: "t1" });
    const first = store.transitionToTerminal("exec-1", "completed", "FINAL_ANSWER");
    const firstEndedAt = first!.endedAt;
    // attempt to overwrite
    const second = store.transitionToTerminal("exec-1", "errored", "MODEL_ERROR");
    expect(second?.status).toBe("completed");
    expect(second?.endReason).toBe("FINAL_ANSWER");
    expect(second?.endedAt).toBe(firstEndedAt);
  });

  it("abort on running execution flips status to aborted and signals AbortController", () => {
    const store = new InMemoryExecutionStateStore();
    store.create({ executionId: "exec-1", conversationId: "conv-1", tenantId: "t1" });
    const changed = store.abort("exec-1");
    expect(changed).toBe(true);
    const after = store.get("exec-1");
    expect(after?.status).toBe("aborted");
    expect(after?.abortController.signal.aborted).toBe(true);
    expect(after?.endReason).toBe("EXECUTION_ABORTED");
    expect(after?.endedAt).toBeGreaterThan(0);
  });

  it("abort on terminal execution returns false (no-op)", () => {
    const store = new InMemoryExecutionStateStore();
    store.create({ executionId: "exec-1", conversationId: "conv-1", tenantId: "t1" });
    store.transitionToTerminal("exec-1", "completed", "FINAL_ANSWER");
    const changed = store.abort("exec-1");
    expect(changed).toBe(false);
    expect(store.get("exec-1")?.status).toBe("completed");
  });

  it("abort on unknown executionId returns false", () => {
    const store = new InMemoryExecutionStateStore();
    expect(store.abort("unknown")).toBe(false);
  });
});
