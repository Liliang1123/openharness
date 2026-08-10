import type { ExecutionId } from "./types";

export type ExecutionStatus = "running" | "waiting_approval" | "completed" | "aborted" | "errored";

export interface ExecutionState {
  executionId: ExecutionId;
  conversationId: string;
  tenantId: string;
  userId: string;
  status: ExecutionStatus;
  startedAt: number;
  updatedAt: number;
  endedAt: number | null;
  endReason?: string;
  abortController: AbortController;
}

export interface ExecutionStateStore {
  create(input: { executionId: ExecutionId; conversationId: string; tenantId: string; userId: string }): ExecutionState;
  get(tenantId: string, userId: string, conversationId: string, executionId: ExecutionId): ExecutionState | null;
  getActive(tenantId: string, userId: string, conversationId: string): ExecutionState | null;
  transition(tenantId: string, userId: string, conversationId: string, executionId: ExecutionId, status: ExecutionStatus, endReason?: string): ExecutionState | null;
  /**
   * Transition a running execution to a terminal state. No-op if already terminal.
   * Returns the (possibly unchanged) state, or null if the execution is unknown.
   */
  transitionToTerminal(
    tenantId: string,
    userId: string,
    conversationId: string,
    executionId: ExecutionId,
    status: Exclude<ExecutionStatus, "running">,
    endReason?: string
  ): ExecutionState | null;
  /**
   * Trigger AbortController and transition to "aborted". Returns true if the call
   * actually changed state, false if no-op (already terminal or unknown).
   */
  abort(tenantId: string, userId: string, conversationId: string, executionId: ExecutionId): boolean;
}

function isTerminal(status: ExecutionStatus): boolean {
  return status === "completed" || status === "aborted" || status === "errored";
}

export class ProcessExecutionStateStore implements ExecutionStateStore {
  private readonly states = new Map<string, ExecutionState>();

  create(input: { executionId: ExecutionId; conversationId: string; tenantId: string; userId: string }): ExecutionState {
    const now = Date.now();
    const state: ExecutionState = {
      executionId: input.executionId,
      conversationId: input.conversationId,
      tenantId: input.tenantId,
      userId: input.userId,
      status: "running",
      startedAt: now,
      updatedAt: now,
      endedAt: null,
      abortController: new AbortController()
    };
    this.states.set(stateKey(input.tenantId, input.userId, input.conversationId, input.executionId), state);
    return state;
  }

  get(tenantId: string, userId: string, conversationId: string, executionId: ExecutionId): ExecutionState | null {
    return this.states.get(stateKey(tenantId, userId, conversationId, executionId)) ?? null;
  }

  getActive(tenantId: string, userId: string, conversationId: string): ExecutionState | null {
    for (const state of this.states.values()) {
      if (
        state.tenantId === tenantId &&
        state.conversationId === conversationId &&
        state.userId === userId &&
        !isTerminal(state.status)
      ) {
        return state;
      }
    }
    return null;
  }

  transition(tenantId: string, userId: string, conversationId: string, executionId: ExecutionId, status: ExecutionStatus, endReason?: string): ExecutionState | null {
    const state = this.get(tenantId, userId, conversationId, executionId);
    if (!state) return null;
    if (isTerminal(state.status)) return state;

    const now = Date.now();
    state.status = status;
    state.updatedAt = now;
    if (isTerminal(status)) state.endedAt = now;
    if (endReason !== undefined) state.endReason = endReason;
    return state;
  }

  transitionToTerminal(
    tenantId: string,
    userId: string,
    conversationId: string,
    executionId: ExecutionId,
    status: Exclude<ExecutionStatus, "running">,
    endReason?: string
  ): ExecutionState | null {
    const state = this.get(tenantId, userId, conversationId, executionId);
    if (!state) return null;
    if (isTerminal(state.status)) return state;
    return this.transition(tenantId, userId, conversationId, executionId, status, endReason);
  }

  abort(tenantId: string, userId: string, conversationId: string, executionId: ExecutionId): boolean {
    const state = this.get(tenantId, userId, conversationId, executionId);
    if (!state) return false;
    if (isTerminal(state.status)) return false;

    const now = Date.now();
    state.status = "aborted";
    state.updatedAt = now;
    state.endedAt = now;
    state.endReason = "EXECUTION_ABORTED";
    state.abortController.abort();
    return true;
  }
}

export { ProcessExecutionStateStore as InMemoryExecutionStateStore };

function stateKey(tenantId: string, userId: string, conversationId: string, executionId: ExecutionId): string {
  return `${tenantId}:${userId}:${conversationId}:${executionId}`;
}
