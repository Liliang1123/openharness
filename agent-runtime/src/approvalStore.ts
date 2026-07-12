import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

export type ApprovalAction = "approve" | "reject" | "revise";

export interface PendingApproval {
  askUserId: string;
  tenantId: string;
  userId: string;
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
  listPending(tenantId: string, userId: string, conversationId: string): PendingApproval[];
  get(tenantId: string, userId: string, conversationId: string, executionId: string, toolCallId: string): PendingApproval | null;
  getByAskUserId(tenantId: string, userId: string, conversationId: string, askUserId: string): PendingApproval | null;
  waitForDecision(tenantId: string, userId: string, conversationId: string, executionId: string, toolCallId: string): Promise<ApprovalDecision>;
  decide(tenantId: string, userId: string, conversationId: string, executionId: string, toolCallId: string, decision: ApprovalDecision): boolean;
}

export class ProcessApprovalStore implements ApprovalStore {
  private readonly pending = new Map<string, PendingApproval>();
  private readonly waiters = new Map<string, (decision: ApprovalDecision) => void>();
  private readonly decisions = new Map<string, ApprovalDecision>();

  createPending(input: Omit<PendingApproval, "askUserId" | "createdAt">): PendingApproval {
    const pending = { ...input, askUserId: crypto.randomUUID(), createdAt: new Date().toISOString() };
    this.pending.set(key(input.tenantId, input.userId, input.conversationId, input.executionId, input.toolCallId), pending);
    return pending;
  }

  listPending(tenantId: string, userId: string, conversationId: string): PendingApproval[] {
    return [...this.pending.values()].filter(
      pending => pending.tenantId === tenantId && pending.userId === userId && pending.conversationId === conversationId
    );
  }

  get(tenantId: string, userId: string, conversationId: string, executionId: string, toolCallId: string): PendingApproval | null {
    return this.pending.get(key(tenantId, userId, conversationId, executionId, toolCallId)) ?? null;
  }

  getByAskUserId(tenantId: string, userId: string, conversationId: string, askUserId: string): PendingApproval | null {
    return this.listPending(tenantId, userId, conversationId).find(pending => pending.askUserId === askUserId) ?? null;
  }

  waitForDecision(tenantId: string, userId: string, conversationId: string, executionId: string, toolCallId: string): Promise<ApprovalDecision> {
    const pendingKey = key(tenantId, userId, conversationId, executionId, toolCallId);
    const existing = this.decisions.get(pendingKey);
    if (existing) {
      this.decisions.delete(pendingKey);
      return Promise.resolve(existing);
    }
    return new Promise(resolve => this.waiters.set(pendingKey, resolve));
  }

  decide(tenantId: string, userId: string, conversationId: string, executionId: string, toolCallId: string, decision: ApprovalDecision): boolean {
    const pendingKey = key(tenantId, userId, conversationId, executionId, toolCallId);
    if (!this.pending.delete(pendingKey)) return false;
    const waiter = this.waiters.get(pendingKey);
    if (waiter) {
      this.waiters.delete(pendingKey);
      waiter(decision);
    } else {
      this.decisions.set(pendingKey, decision);
    }
    return true;
  }
}

export { ProcessApprovalStore as InMemoryApprovalStore };

interface ApprovalFile {
  tenantId: string;
  conversationId: string;
  pendingApprovals: PendingApproval[];
}

function key(tenantId: string, userId: string, conversationId: string, executionId: string, toolCallId: string): string {
  return `${tenantId}:${userId}:${conversationId}:${executionId}:${toolCallId}`;
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
    this.loadConversation(input.tenantId, input.userId, input.conversationId);
    const pending: PendingApproval = {
      ...input,
      askUserId: crypto.randomUUID(),
      createdAt: new Date().toISOString()
    };
    const pendingKey = key(pending.tenantId, pending.userId, pending.conversationId, pending.executionId, pending.toolCallId);
    this.pending.set(pendingKey, pending);
    if (options?.persist === false) {
      this.transient.add(pendingKey);
    } else {
      this.transient.delete(pendingKey);
    }
    this.saveConversation(input.tenantId, input.userId, input.conversationId);
    return pending;
  }

  listPending(tenantId: string, userId: string, conversationId: string): PendingApproval[] {
    this.loadConversation(tenantId, userId, conversationId);
    return [...this.pending.values()].filter(
      (p) => p.tenantId === tenantId && p.userId === userId && p.conversationId === conversationId
    );
  }

  get(tenantId: string, userId: string, conversationId: string, executionId: string, toolCallId: string): PendingApproval | null {
    return this.pending.get(key(tenantId, userId, conversationId, executionId, toolCallId)) ?? this.scan((p) =>
      p.tenantId === tenantId && p.userId === userId && p.conversationId === conversationId && p.executionId === executionId && p.toolCallId === toolCallId
    );
  }

  getByAskUserId(tenantId: string, userId: string, conversationId: string, askUserId: string): PendingApproval | null {
    for (const pending of this.pending.values()) {
      if (pending.tenantId === tenantId && pending.userId === userId && pending.conversationId === conversationId && pending.askUserId === askUserId) return pending;
    }
    return this.scan((p) => p.tenantId === tenantId && p.userId === userId && p.conversationId === conversationId && p.askUserId === askUserId);
  }

  waitForDecision(tenantId: string, userId: string, conversationId: string, executionId: string, toolCallId: string): Promise<ApprovalDecision> {
    const pendingKey = key(tenantId, userId, conversationId, executionId, toolCallId);
    const existing = this.decisions.get(pendingKey);
    if (existing) {
      this.decisions.delete(pendingKey);
      return Promise.resolve(existing);
    }
    return new Promise((resolve) => {
      this.waiters.set(pendingKey, resolve);
    });
  }

  decide(tenantId: string, userId: string, conversationId: string, executionId: string, toolCallId: string, decision: ApprovalDecision): boolean {
    const pending = this.get(tenantId, userId, conversationId, executionId, toolCallId);
    if (!pending) return false;

    const pendingKey = key(tenantId, userId, conversationId, executionId, toolCallId);
    this.pending.delete(pendingKey);
    this.transient.delete(pendingKey);
    this.saveConversation(pending.tenantId, pending.userId, pending.conversationId);

    const waiter = this.waiters.get(pendingKey);
    if (waiter) {
      this.waiters.delete(pendingKey);
      waiter(decision);
    } else {
      this.decisions.set(pendingKey, decision);
    }
    return true;
  }

  private filePath(tenantId: string, userId: string, conversationId: string): string {
    return join(this.dataDir, tenantId, userId, `${conversationId}-approvals.json`);
  }

  private tenantDir(tenantId: string): string {
    return join(this.dataDir, tenantId);
  }

  private loadConversation(tenantId: string, userId: string, conversationId: string): void {
    const filePath = this.filePath(tenantId, userId, conversationId);
    if (!existsSync(filePath)) return;
    try {
      const data = JSON.parse(readFileSync(filePath, "utf-8")) as ApprovalFile;
      for (const pending of data.pendingApprovals ?? []) {
        if (pending.userId !== userId) continue;
        this.pending.set(key(pending.tenantId, pending.userId, pending.conversationId, pending.executionId, pending.toolCallId), pending);
      }
    } catch {
      // Ignore malformed approval state; session history remains the source of truth.
    }
  }

  private saveConversation(tenantId: string, userId: string, conversationId: string): void {
    const filePath = this.filePath(tenantId, userId, conversationId);
    mkdirSync(dirname(filePath), { recursive: true });
    const pendingApprovals = [...this.pending.values()].filter(
      (p) => p.tenantId === tenantId
        && p.userId === userId
        && p.conversationId === conversationId
        && !this.transient.has(key(p.tenantId, p.userId, p.conversationId, p.executionId, p.toolCallId))
    );
    const data: ApprovalFile = { tenantId, conversationId, pendingApprovals: pendingApprovals.map(({ approvalToken: _approvalToken, ...pending }) => pending) };
    writeFileSync(filePath, JSON.stringify(data, null, 2));
  }

  private scan(predicate: (pending: PendingApproval) => boolean): PendingApproval | null {
    if (!existsSync(this.dataDir)) return null;
    for (const tenantId of readdirSync(this.dataDir)) {
      const tenantDir = this.tenantDir(tenantId);
      if (!existsSync(tenantDir)) continue;
      for (const userId of readdirSync(tenantDir)) {
        const userDir = join(tenantDir, userId);
        if (!existsSync(userDir)) continue;
        for (const file of readdirSync(userDir)) {
          if (!file.endsWith("-approvals.json")) continue;
          const conversationId = file.replace(/-approvals\.json$/, "");
          this.loadConversation(tenantId, userId, conversationId);
        }
      }
    }
    for (const pending of this.pending.values()) {
      if (predicate(pending)) return pending;
    }
    return null;
  }
}
