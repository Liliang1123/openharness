import type { RuntimeTransaction } from "./runtimeStorage";

export type SqliteApprovalStatus = "pending" | "approved" | "rejected" | "revised" | "invalidated";

export interface SqliteApprovalRecord {
  approvalId: string;
  tenantId: string;
  userId: string;
  conversationId: string;
  executionId: string;
  status: SqliteApprovalStatus;
  payload: Record<string, unknown>;
  createdAt: number;
  updatedAt: number;
}

export interface CreatePendingApprovalInput {
  approvalId: string;
  tenantId: string;
  userId: string;
  conversationId: string;
  executionId: string;
  payload: Record<string, unknown>;
}

export interface ApprovalCompareAndSetInput {
  tenantId: string;
  userId: string;
  conversationId: string;
  approvalId: string;
  expectedStatus: SqliteApprovalStatus;
  nextStatus: SqliteApprovalStatus;
}

interface ApprovalRow {
  approval_id: string;
  tenant_id: string;
  user_id: string;
  conversation_id: string;
  execution_id: string;
  status: SqliteApprovalStatus;
  payload_json: string;
  created_at: number;
  updated_at: number;
}

export class SqliteApprovalStore {
  createPending(tx: RuntimeTransaction, input: CreatePendingApprovalInput): SqliteApprovalRecord {
    const now = Date.now();
    tx.run(
      `INSERT INTO approvals(approval_id,tenant_id,user_id,conversation_id,execution_id,status,payload_json,created_at,updated_at)
       VALUES (?,?,?,?,?,?,?,?,?)`,
      [
        input.approvalId,
        input.tenantId,
        input.userId,
        input.conversationId,
        input.executionId,
        "pending",
        JSON.stringify(input.payload),
        now,
        now
      ]
    );
    return this.get(tx, input.tenantId, input.userId, input.conversationId, input.approvalId)!;
  }

  get(
    tx: RuntimeTransaction,
    tenantId: string,
    userId: string,
    conversationId: string,
    approvalId: string
  ): SqliteApprovalRecord | null {
    const row = tx.get<ApprovalRow>(
      `SELECT approval_id,tenant_id,user_id,conversation_id,execution_id,status,payload_json,created_at,updated_at
       FROM approvals
       WHERE tenant_id = ? AND user_id = ? AND conversation_id = ? AND approval_id = ?`,
      [tenantId, userId, conversationId, approvalId]
    );
    return row ? fromRow(row) : null;
  }

  listPending(tx: RuntimeTransaction, tenantId: string, userId: string, conversationId: string): SqliteApprovalRecord[] {
    return tx.all<ApprovalRow>(
      `SELECT approval_id,tenant_id,user_id,conversation_id,execution_id,status,payload_json,created_at,updated_at
       FROM approvals
       WHERE tenant_id = ? AND user_id = ? AND conversation_id = ? AND status = 'pending'
       ORDER BY created_at ASC`,
      [tenantId, userId, conversationId]
    ).map(fromRow);
  }

  getPendingByExecutionToolCall(
    tx: RuntimeTransaction,
    tenantId: string,
    userId: string,
    conversationId: string,
    executionId: string,
    toolCallId: string
  ): SqliteApprovalRecord | null {
    const row = tx.get<ApprovalRow>(
      `SELECT approval_id,tenant_id,user_id,conversation_id,execution_id,status,payload_json,created_at,updated_at
       FROM approvals
       WHERE tenant_id = ? AND user_id = ? AND conversation_id = ? AND execution_id = ?
         AND status = 'pending' AND json_extract(payload_json, '$.toolCallId') = ?
       LIMIT 1`,
      [tenantId, userId, conversationId, executionId, toolCallId]
    );
    return row ? fromRow(row) : null;
  }

  compareAndSetStatus(tx: RuntimeTransaction, input: ApprovalCompareAndSetInput): boolean {
    return tx.run(
      `UPDATE approvals
       SET status = ?, updated_at = ?
       WHERE tenant_id = ? AND user_id = ? AND conversation_id = ? AND approval_id = ? AND status = ?`,
      [
        input.nextStatus,
        Date.now(),
        input.tenantId,
        input.userId,
        input.conversationId,
        input.approvalId,
        input.expectedStatus
      ]
    ).changes === 1;
  }
}

function fromRow(row: ApprovalRow): SqliteApprovalRecord {
  return {
    approvalId: row.approval_id,
    tenantId: row.tenant_id,
    userId: row.user_id,
    conversationId: row.conversation_id,
    executionId: row.execution_id,
    status: row.status,
    payload: JSON.parse(row.payload_json) as Record<string, unknown>,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}
