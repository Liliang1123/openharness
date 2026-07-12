import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

export type ApprovalAction = "approve" | "reject" | "revise";

export interface PendingApproval {
  askUserId: string;
  tenantId: string;
  userId?: string;
  conversationId: string;
  executionId: string;
  toolCallId: string;
  toolName: string;
  argumentsRaw: string;
  reason?: string;
  approvalToken?: string;
  createdAt: string;
}

export interface ApprovalDecision {
  action: ApprovalAction;
  revisedArguments?: Record<string, unknown>;
  message?: string;
  respondedAt: string;
}

export interface ApprovalStore {
  createPending(
    input: Omit<PendingApproval, "askUserId" | "createdAt">,
    options?: { persist?: boolean }
  ): PendingApproval;
  listPending(tenantId: string, conversationId: string, userId?: string): PendingApproval[];
  get(executionId: string, toolCallId: string): PendingApproval | null;
  getByAskUserId(askUserId: string): PendingApproval | null;
  waitForDecision(executionId: string, toolCallId: string): Promise<ApprovalDecision>;
  decide(executionId: string, toolCallId: string, decision: ApprovalDecision): boolean;
}

interface ApprovalFile {
  tenantId: string;
  conversationId: string;
  pendingApprovals: PendingApproval[];
}

function key(executionId: string, toolCallId: string): string {
  return `${executionId}:${toolCallId}`;
}

export class JsonFileApprovalStore implements ApprovalStore {
  private readonly pending = new Map<string, PendingApproval>();
  private readonly transient = new Set<string>();
  private readonly waiters = new Map<string, (decision: ApprovalDecision) => void>();
  private readonly decisions = new Map<string, ApprovalDecision>();

  constructor(private readonly dataDir = process.env.HISTORY_DATA_DIR ?? "data/sessions") {}

  createPending(
    input: Omit<PendingApproval, "askUserId" | "createdAt">,
    options?: { persist?: boolean }
  ): PendingApproval {
    this.loadConversation(input.tenantId, input.conversationId);
    const pending: PendingApproval = {
      ...input,
      askUserId: crypto.randomUUID(),
      createdAt: new Date().toISOString()
    };
    const pendingKey = key(pending.executionId, pending.toolCallId);
    this.pending.set(pendingKey, pending);
    if (options?.persist === false) {
      this.transient.add(pendingKey);
    } else {
      this.transient.delete(pendingKey);
    }
    this.saveConversation(input.tenantId, input.conversationId);
    return pending;
  }

  listPending(tenantId: string, conversationId: string, userId?: string): PendingApproval[] {
    this.loadConversation(tenantId, conversationId);
    return [...this.pending.values()].filter(
      (p) => p.tenantId === tenantId && p.conversationId === conversationId && (userId === undefined || p.userId === undefined || p.userId === userId)
    );
  }

  get(executionId: string, toolCallId: string): PendingApproval | null {
    return this.pending.get(key(executionId, toolCallId)) ?? this.scan((p) =>
      p.executionId === executionId && p.toolCallId === toolCallId
    );
  }

  getByAskUserId(askUserId: string): PendingApproval | null {
    for (const pending of this.pending.values()) {
      if (pending.askUserId === askUserId) return pending;
    }
    return this.scan((p) => p.askUserId === askUserId);
  }

  waitForDecision(executionId: string, toolCallId: string): Promise<ApprovalDecision> {
    const existing = this.decisions.get(key(executionId, toolCallId));
    if (existing) {
      this.decisions.delete(key(executionId, toolCallId));
      return Promise.resolve(existing);
    }
    return new Promise((resolve) => {
      this.waiters.set(key(executionId, toolCallId), resolve);
    });
  }

  decide(executionId: string, toolCallId: string, decision: ApprovalDecision): boolean {
    const pending = this.get(executionId, toolCallId);
    if (!pending) return false;

    const pendingKey = key(executionId, toolCallId);
    this.pending.delete(pendingKey);
    this.transient.delete(pendingKey);
    this.saveConversation(pending.tenantId, pending.conversationId);

    const waiter = this.waiters.get(key(executionId, toolCallId));
    if (waiter) {
      this.waiters.delete(key(executionId, toolCallId));
      waiter(decision);
    } else {
      this.decisions.set(key(executionId, toolCallId), decision);
    }
    return true;
  }

  private filePath(tenantId: string, conversationId: string): string {
    return join(this.dataDir, tenantId, `${conversationId}-approvals.json`);
  }

  private tenantDir(tenantId: string): string {
    return join(this.dataDir, tenantId);
  }

  private loadConversation(tenantId: string, conversationId: string): void {
    const filePath = this.filePath(tenantId, conversationId);
    if (!existsSync(filePath)) return;
    try {
      const data = JSON.parse(readFileSync(filePath, "utf-8")) as ApprovalFile;
      for (const pending of data.pendingApprovals ?? []) {
        this.pending.set(key(pending.executionId, pending.toolCallId), pending);
      }
    } catch {
      // Ignore malformed approval state; session history remains the source of truth.
    }
  }

  private saveConversation(tenantId: string, conversationId: string): void {
    const filePath = this.filePath(tenantId, conversationId);
    mkdirSync(dirname(filePath), { recursive: true });
    const pendingApprovals = [...this.pending.values()].filter(
      (p) => p.tenantId === tenantId
        && p.conversationId === conversationId
        && !this.transient.has(key(p.executionId, p.toolCallId))
    );
    const data: ApprovalFile = { tenantId, conversationId, pendingApprovals };
    writeFileSync(filePath, JSON.stringify(data, null, 2));
  }

  private scan(predicate: (pending: PendingApproval) => boolean): PendingApproval | null {
    if (!existsSync(this.dataDir)) return null;
    for (const tenantId of readdirSync(this.dataDir)) {
      const dir = this.tenantDir(tenantId);
      if (!existsSync(dir)) continue;
      for (const file of readdirSync(dir)) {
        if (!file.endsWith("-approvals.json")) continue;
        const conversationId = file.replace(/-approvals\.json$/, "");
        this.loadConversation(tenantId, conversationId);
      }
    }
    for (const pending of this.pending.values()) {
      if (predicate(pending)) return pending;
    }
    return null;
  }
}
