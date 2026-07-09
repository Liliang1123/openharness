import type { AgentMessage, RuntimeEventKind, SessionEvent, StopReason } from "../types";
import type { RuntimeEventStore } from "../runtimeEventStore";
import type { RuntimeDatabase, RuntimeTransaction } from "./runtimeStorage";
import type { SqliteApprovalStatus } from "./sqliteApprovalStore";
import type { SqliteRuntimeRepositories } from "./sqliteRuntimeRepositories";

export type LifecycleBoundary =
  | "execution_start"
  | "approval_wait"
  | "approval_decision"
  | "model_tool_plan"
  | "tool_result"
  | "terminal_closure";

type CrashPoint = "before_commit" | "after_commit";

interface LifecycleScope {
  tenantId: string;
  userId: string;
  conversationId: string;
  executionId: string;
  traceId: string;
  requestId: string;
  crash?: CrashPoint;
}

export interface StartExecutionInput extends LifecycleScope {
  message: string;
}

export interface EnterApprovalInput extends LifecycleScope {
  approvalId: string;
  toolCallId: string;
  toolName: string;
  argumentsRaw: string;
  reason?: string;
}

export interface DecideApprovalInput extends LifecycleScope {
  approvalId: string;
  nextStatus: Exclude<SqliteApprovalStatus, "pending" | "invalidated">;
}

export interface RecordToolPlanInput extends LifecycleScope {
  assistantMessage: AgentMessage;
  stepIndex: number;
}

export interface CompleteToolInput extends LifecycleScope {
  toolResult: AgentMessage;
  stepIndex: number;
}

export interface CompleteExecutionInput extends LifecycleScope {
  assistantMessage: AgentMessage;
  stopReason: StopReason;
}

export interface InterruptExecutionInput extends LifecycleScope {
  errorMessage: string;
}

export interface LifecycleCommit {
  events: SessionEvent[];
}

export class RuntimeLifecycleCommands {
  constructor(
    private readonly database: RuntimeDatabase,
    private readonly repositories: SqliteRuntimeRepositories
  ) {}

  startExecution(input: StartExecutionInput): LifecycleCommit {
    return this.runBoundary(input, (tx) => {
      const existing = this.repositories.execution.get(tx, input.tenantId, input.userId, input.conversationId, input.executionId);
      if (existing) return this.replayAll(tx, input);

      this.repositories.history.ensureConversation(tx, input);
      this.repositories.history.append(tx, input.tenantId, input.userId, input.conversationId, {
        role: "user",
        content: input.message
      });
      this.repositories.execution.create(tx, input);
      return [this.appendEvent(tx, input, "agent_start", {
        traceId: input.traceId,
        conversationId: input.conversationId
      })];
    });
  }

  enterApproval(input: EnterApprovalInput): LifecycleCommit {
    return this.runBoundary(input, (tx) => {
      const existing = this.repositories.approval.get(tx, input.tenantId, input.userId, input.conversationId, input.approvalId);
      if (existing) return this.replayAll(tx, input);

      this.repositories.approval.createPending(tx, {
        approvalId: input.approvalId,
        tenantId: input.tenantId,
        userId: input.userId,
        conversationId: input.conversationId,
        executionId: input.executionId,
        payload: {
          toolCallId: input.toolCallId,
          toolName: input.toolName,
          argumentsRaw: input.argumentsRaw,
          reason: input.reason
        }
      });
      this.repositories.execution.transition(tx, {
        ...input,
        status: "waiting_approval"
      });
      return [this.appendEvent(tx, input, "approval_requested", {
        approvalId: input.approvalId,
        toolCallId: input.toolCallId,
        toolName: input.toolName,
        argumentsRaw: input.argumentsRaw,
        reason: input.reason
      })];
    });
  }

  decideApproval(input: DecideApprovalInput): LifecycleCommit {
    return this.runBoundary(input, (tx) => {
      const approval = this.repositories.approval.get(tx, input.tenantId, input.userId, input.conversationId, input.approvalId);
      if (!approval || approval.status === input.nextStatus) return this.replayAll(tx, input);
      const changed = this.repositories.approval.compareAndSetStatus(tx, {
        tenantId: input.tenantId,
        userId: input.userId,
        conversationId: input.conversationId,
        approvalId: input.approvalId,
        expectedStatus: "pending",
        nextStatus: input.nextStatus
      });
      if (!changed) return this.replayAll(tx, input);
      this.repositories.execution.transition(tx, {
        ...input,
        status: "running"
      });
      return [this.appendEvent(tx, input, "tool_result", {
        approvalId: input.approvalId,
        status: input.nextStatus
      })];
    });
  }

  recordToolPlan(input: RecordToolPlanInput): LifecycleCommit {
    return this.runBoundary(input, (tx) => {
      const messages = this.repositories.history.get(tx, input.tenantId, input.userId, input.conversationId);
      if (messages.some((message) => hasProvisionalExecution(message, input.executionId))) {
        return this.replayAll(tx, input);
      }
      this.repositories.history.append(tx, input.tenantId, input.userId, input.conversationId, markProvisional(input.assistantMessage, input.executionId));
      return [this.appendEvent(tx, input, "model_call_end", {
        stepIndex: input.stepIndex,
        hasToolCalls: true
      })];
    });
  }

  completeTool(input: CompleteToolInput): LifecycleCommit {
    return this.runBoundary(input, (tx) => {
      const messages = this.repositories.history.get(tx, input.tenantId, input.userId, input.conversationId);
      const toolCallId = input.toolResult.toolCallId;
      if (toolCallId && messages.some((message) => message.role === "tool" && message.toolCallId === toolCallId)) {
        return this.replayAll(tx, input);
      }
      this.repositories.history.append(tx, input.tenantId, input.userId, input.conversationId, input.toolResult);
      return [this.appendEvent(tx, input, "tool_result", {
        toolCallId: input.toolResult.toolCallId,
        toolName: input.toolResult.toolName,
        status: "ok",
        stepIndex: input.stepIndex
      })];
    });
  }

  completeExecution(input: CompleteExecutionInput): LifecycleCommit {
    return this.runBoundary(input, (tx) => {
      const execution = this.repositories.execution.get(tx, input.tenantId, input.userId, input.conversationId, input.executionId);
      if (execution?.status === "completed") return this.replayAll(tx, input);

      this.repositories.history.append(tx, input.tenantId, input.userId, input.conversationId, input.assistantMessage);
      this.repositories.execution.transition(tx, {
        ...input,
        status: "completed",
        stopReason: input.stopReason
      });
      return [
        this.appendEvent(tx, input, "final_answer", { answer: input.assistantMessage.content }),
        this.appendEvent(tx, input, "agent_end", { stopReason: input.stopReason }),
        this.appendEvent(tx, input, "stream_done", { stopReason: input.stopReason })
      ];
    });
  }

  interruptExecution(input: InterruptExecutionInput): LifecycleCommit {
    return this.runBoundary(input, (tx) => {
      const execution = this.repositories.execution.get(tx, input.tenantId, input.userId, input.conversationId, input.executionId);
      if (execution?.status === "errored" && execution.stopReason === "EXECUTION_INTERRUPTED") return this.replayAll(tx, input);

      this.repositories.history.removeProvisionalByExecution(tx, input.tenantId, input.userId, input.conversationId, input.executionId);
      for (const approval of this.repositories.approval.listPending(tx, input.tenantId, input.userId, input.conversationId)) {
        this.repositories.approval.compareAndSetStatus(tx, {
          tenantId: input.tenantId,
          userId: input.userId,
          conversationId: input.conversationId,
          approvalId: approval.approvalId,
          expectedStatus: "pending",
          nextStatus: "invalidated"
        });
      }
      this.repositories.execution.transition(tx, {
        ...input,
        status: "errored",
        stopReason: "EXECUTION_INTERRUPTED"
      });
      return [this.appendEvent(tx, input, "stream_error", {
        errorClass: "EXECUTION_INTERRUPTED",
        errorMessage: input.errorMessage
      })];
    });
  }

  private runBoundary(input: LifecycleScope, work: (tx: RuntimeTransaction) => SessionEvent[]): LifecycleCommit {
    const events = this.database.transaction((tx) => {
      const committed = work(tx);
      if (input.crash === "before_commit") throw new Error("crash before commit");
      return committed;
    });
    if (input.crash === "after_commit") throw new Error("crash after commit");
    return { events };
  }

  private appendEvent(
    tx: RuntimeTransaction,
    input: LifecycleScope,
    kind: RuntimeEventKind,
    data: Record<string, unknown>
  ): SessionEvent {
    const cursor = (this.repositories.runtimeEvent.latestCursor(tx, input.tenantId, input.userId, input.conversationId) ?? 0) + 1;
    return this.repositories.runtimeEvent.append(tx, {
      durability: "durable",
      eventId: `${input.tenantId}::${input.conversationId}:${cursor}`,
      executionId: input.executionId,
      conversationId: input.conversationId,
      tenantId: input.tenantId,
      userId: input.userId,
      traceId: input.traceId,
      requestId: input.requestId,
      createdAt: Date.now(),
      kind,
      data,
      cursor
    });
  }

  private replayAll(tx: RuntimeTransaction, input: LifecycleScope): SessionEvent[] {
    return this.repositories.runtimeEvent.replayAfter(tx, input.tenantId, input.userId, input.conversationId, null);
  }
}

export function publishCommittedLifecycleEvents(
  store: Pick<RuntimeEventStore, "append">,
  commit: LifecycleCommit
): void {
  for (const event of commit.events) {
    store.append(event.tenantId, event.conversationId, event);
  }
}

function markProvisional(message: AgentMessage, executionId: string): AgentMessage {
  return {
    ...message,
    transient: true,
    provisionalExecutionId: executionId
  } as AgentMessage;
}

function hasProvisionalExecution(message: AgentMessage, executionId: string): boolean {
  return (message as AgentMessage & { provisionalExecutionId?: string }).provisionalExecutionId === executionId;
}
