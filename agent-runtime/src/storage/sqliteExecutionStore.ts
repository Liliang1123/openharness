import type { ExecutionStatus } from "../executionStateStore";
import type { RuntimeTransaction } from "./runtimeStorage";

export interface SqliteExecutionRecord {
  executionId: string;
  tenantId: string;
  userId: string;
  conversationId: string;
  status: ExecutionStatus;
  stopReason: string | null;
  createdAt: number;
  updatedAt: number;
}

export interface CreateExecutionInput {
  executionId: string;
  tenantId: string;
  userId: string;
  conversationId: string;
  status?: ExecutionStatus;
}

export interface TransitionExecutionInput {
  tenantId: string;
  userId: string;
  conversationId: string;
  executionId: string;
  status: ExecutionStatus;
  stopReason?: string;
}

interface ExecutionRow {
  execution_id: string;
  tenant_id: string;
  user_id: string;
  conversation_id: string;
  status: ExecutionStatus;
  stop_reason: string | null;
  created_at: number;
  updated_at: number;
}

export class SqliteExecutionStore {
  create(tx: RuntimeTransaction, input: CreateExecutionInput): SqliteExecutionRecord {
    const now = Date.now();
    tx.run(
      `INSERT INTO executions(execution_id,tenant_id,user_id,conversation_id,status,created_at,updated_at)
       VALUES (?,?,?,?,?,?,?)`,
      [input.executionId, input.tenantId, input.userId, input.conversationId, input.status ?? "running", now, now]
    );
    return this.get(tx, input.tenantId, input.userId, input.conversationId, input.executionId)!;
  }

  get(
    tx: RuntimeTransaction,
    tenantId: string,
    userId: string,
    conversationId: string,
    executionId: string
  ): SqliteExecutionRecord | null {
    const row = tx.get<ExecutionRow>(
      `SELECT execution_id,tenant_id,user_id,conversation_id,status,stop_reason,created_at,updated_at
       FROM executions
       WHERE tenant_id = ? AND user_id = ? AND conversation_id = ? AND execution_id = ?`,
      [tenantId, userId, conversationId, executionId]
    );
    return row ? fromRow(row) : null;
  }

  getActive(tx: RuntimeTransaction, tenantId: string, userId: string, conversationId: string): SqliteExecutionRecord | null {
    const row = tx.get<ExecutionRow>(
      `SELECT execution_id,tenant_id,user_id,conversation_id,status,stop_reason,created_at,updated_at
       FROM executions
       WHERE tenant_id = ? AND user_id = ? AND conversation_id = ?
         AND status IN ('running','waiting_approval')
       ORDER BY updated_at DESC
       LIMIT 1`,
      [tenantId, userId, conversationId]
    );
    return row ? fromRow(row) : null;
  }

  listNonTerminal(tx: RuntimeTransaction): SqliteExecutionRecord[] {
    return tx.all<ExecutionRow>(
      `SELECT execution_id,tenant_id,user_id,conversation_id,status,stop_reason,created_at,updated_at
       FROM executions
       WHERE status IN ('running','waiting_approval')
       ORDER BY updated_at ASC`
    ).map(fromRow);
  }

  transition(tx: RuntimeTransaction, input: TransitionExecutionInput): SqliteExecutionRecord | null {
    tx.run(
      `UPDATE executions
       SET status = ?, stop_reason = ?, updated_at = ?
       WHERE tenant_id = ? AND user_id = ? AND conversation_id = ? AND execution_id = ?`,
      [
        input.status,
        input.stopReason ?? null,
        Date.now(),
        input.tenantId,
        input.userId,
        input.conversationId,
        input.executionId
      ]
    );
    return this.get(tx, input.tenantId, input.userId, input.conversationId, input.executionId);
  }
}

function fromRow(row: ExecutionRow): SqliteExecutionRecord {
  return {
    executionId: row.execution_id,
    tenantId: row.tenant_id,
    userId: row.user_id,
    conversationId: row.conversation_id,
    status: row.status,
    stopReason: row.stop_reason,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}
