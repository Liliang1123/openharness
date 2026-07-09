import type { ExecutionId } from "./types";

export type ExecutionStatus = "running" | "waiting_approval" | "completed" | "aborted" | "errored";

export interface ExecutionState {
  executionId: ExecutionId;
  conversationId: string;
  tenantId: string;
  userId?: string;
  status: ExecutionStatus;
  startedAt: number;
  updatedAt: number;
  endedAt: number | null;
  endReason?: string;
  abortController: AbortController;
}

export interface ExecutionStateStore {
  create(input: { executionId: ExecutionId; conversationId: string; tenantId: string; userId?: string }): ExecutionState;
  get(executionId: ExecutionId): ExecutionState | null;
  getActive(tenantId: string, conversationId: string, userId?: string): ExecutionState | null;
  transition(executionId: ExecutionId, status: ExecutionStatus, endReason?: string): ExecutionState | null;
  /**
   * Transition a running execution to a terminal state. No-op if already terminal.
   * Returns the (possibly unchanged) state, or null if the execution is unknown.
   */
  transitionToTerminal(
    executionId: ExecutionId,
    status: Exclude<ExecutionStatus, "running">,
    endReason?: string
  ): ExecutionState | null;
  /**
   * Trigger AbortController and transition to "aborted". Returns true if the call
   * actually changed state, false if no-op (already terminal or unknown).
   */
  abort(executionId: ExecutionId): boolean;
}

function isTerminal(status: ExecutionStatus): boolean {
  return status === "completed" || status === "aborted" || status === "errored";
}

export class InMemoryExecutionStateStore implements ExecutionStateStore {
  private readonly states = new Map<ExecutionId, ExecutionState>();

  create(input: { executionId: ExecutionId; conversationId: string; tenantId: string; userId?: string }): ExecutionState {
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
    this.states.set(input.executionId, state);
    return state;
  }

  get(executionId: ExecutionId): ExecutionState | null {
    return this.states.get(executionId) ?? null;
  }

  getActive(tenantId: string, conversationId: string, userId?: string): ExecutionState | null {
    for (const state of this.states.values()) {
      if (
        state.tenantId === tenantId &&
        state.conversationId === conversationId &&
        (userId === undefined || state.userId === undefined || state.userId === userId) &&
        !isTerminal(state.status)
      ) {
        return state;
      }
    }
    return null;
  }

  transition(executionId: ExecutionId, status: ExecutionStatus, endReason?: string): ExecutionState | null {
    const state = this.states.get(executionId);
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
    executionId: ExecutionId,
    status: Exclude<ExecutionStatus, "running">,
    endReason?: string
  ): ExecutionState | null {
    const state = this.states.get(executionId);
    if (!state) return null;
    if (isTerminal(state.status)) return state;
    return this.transition(executionId, status, endReason);
  }

  abort(executionId: ExecutionId): boolean {
    const state = this.states.get(executionId);
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
