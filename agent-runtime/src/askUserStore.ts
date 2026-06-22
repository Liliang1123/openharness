import type { ToolCall } from "./types";

export interface AskUserPending {
  askUserId: string;
  requestId: string;
  conversationId: string;
  userId: string;
  tenantId: string;
  prompt: string;
  pendingToolCall: ToolCall;
  reason?: string;
  approvalToken?: string;
  createdAt: number;
}

export interface AskUserReply {
  askUserId: string;
  action: "approve" | "reject" | "revise" | "answer";
  message?: string;
  revisedArguments?: Record<string, unknown>;
  respondedAt: string;
}

export class AskUserStore {
  // key: tenantId:conversationId (P0b: at most one pending per conversation)
  private pending = new Map<string, AskUserPending>();

  private key(tenantId: string, conversationId: string) {
    return `${tenantId}:${conversationId}`;
  }

  create(p: AskUserPending): void {
    this.pending.set(this.key(p.tenantId, p.conversationId), p);
  }

  get(tenantId: string, conversationId: string): AskUserPending | undefined {
    return this.pending.get(this.key(tenantId, conversationId));
  }

  getById(askUserId: string): AskUserPending | undefined {
    for (const p of this.pending.values()) {
      if (p.askUserId === askUserId) return p;
    }
    return undefined;
  }

  remove(askUserId: string): AskUserPending | undefined {
    for (const [key, p] of this.pending.entries()) {
      if (p.askUserId === askUserId) {
        this.pending.delete(key);
        return p;
      }
    }
    return undefined;
  }

  hasPending(tenantId: string, conversationId: string): boolean {
    return this.pending.has(this.key(tenantId, conversationId));
  }
}
