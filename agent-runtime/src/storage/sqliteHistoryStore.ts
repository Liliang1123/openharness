import type { AgentMessage } from "../types";
import { assertStableHistoryMessage, deriveTitle, stableHistory, type SessionMeta } from "../history";
import type { RuntimeTransaction } from "./runtimeStorage";

export interface SqliteConversationInput {
  tenantId: string;
  userId: string;
  conversationId: string;
  title?: string;
}

interface MessageRow {
  content_json: string;
}

interface SessionRow {
  conversation_id: string;
  title: string | null;
  updated_at: number;
}

export class SqliteHistoryStore {
  ensureConversation(tx: RuntimeTransaction, input: SqliteConversationInput): void {
    const now = Date.now();
    tx.run(
      `INSERT INTO conversations(tenant_id,user_id,conversation_id,title,created_at,updated_at)
       VALUES (?,?,?,?,?,?)
       ON CONFLICT(tenant_id,user_id,conversation_id)
       DO UPDATE SET title = COALESCE(excluded.title, conversations.title), updated_at = excluded.updated_at`,
      [input.tenantId, input.userId, input.conversationId, input.title ?? null, now, now]
    );
  }

  append(
    tx: RuntimeTransaction,
    tenantId: string,
    userId: string,
    conversationId: string,
    message: AgentMessage
  ): void {
    assertStableHistoryMessage(message);
    this.ensureConversation(tx, {
      tenantId,
      userId,
      conversationId,
      title: message.role === "user" && typeof message.content === "string" ? message.content.slice(0, 30) : undefined
    });
    const nextSeq = (tx.get<{ seq: number | null }>(
      `SELECT MAX(seq) AS seq FROM messages
       WHERE tenant_id = ? AND user_id = ? AND conversation_id = ?`,
      [tenantId, userId, conversationId]
    )?.seq ?? 0) + 1;
    const now = Date.now();
    tx.run(
      `INSERT INTO messages(tenant_id,user_id,conversation_id,seq,role,content_json,created_at)
       VALUES (?,?,?,?,?,?,?)`,
      [tenantId, userId, conversationId, nextSeq, message.role, JSON.stringify(message), now]
    );
    tx.run(
      "UPDATE conversations SET updated_at = ? WHERE tenant_id = ? AND user_id = ? AND conversation_id = ?",
      [now, tenantId, userId, conversationId]
    );
  }

  get(tx: RuntimeTransaction, tenantId: string, userId: string, conversationId: string): AgentMessage[] {
    const rows = tx.all<MessageRow>(
      `SELECT content_json FROM messages
       WHERE tenant_id = ? AND user_id = ? AND conversation_id = ?
       ORDER BY seq ASC`,
      [tenantId, userId, conversationId]
    );
    return stableHistory(rows.map((row) => stripLifecycleFields(JSON.parse(row.content_json) as AgentMessage)));
  }

  hasToolResultForExecution(
    tx: RuntimeTransaction,
    tenantId: string,
    userId: string,
    conversationId: string,
    executionId: string,
    toolCallId: string
  ): boolean {
    return tx.get<{ present: number }>(
      `SELECT 1 AS present FROM messages
       WHERE tenant_id = ? AND user_id = ? AND conversation_id = ? AND role = 'tool'
         AND json_extract(content_json, '$.lifecycleExecutionId') = ?
         AND json_extract(content_json, '$.toolCallId') = ?
       LIMIT 1`,
      [tenantId, userId, conversationId, executionId, toolCallId]
    ) != null;
  }

  toolResultIdsForExecution(
    tx: RuntimeTransaction,
    tenantId: string,
    userId: string,
    conversationId: string,
    executionId: string
  ): string[] {
    return tx.all<{ tool_call_id: string }>(
      `SELECT json_extract(content_json, '$.toolCallId') AS tool_call_id FROM messages
       WHERE tenant_id = ? AND user_id = ? AND conversation_id = ? AND role = 'tool'
         AND json_extract(content_json, '$.lifecycleExecutionId') = ?`,
      [tenantId, userId, conversationId, executionId]
    ).map(row => row.tool_call_id);
  }

  replace(
    tx: RuntimeTransaction,
    tenantId: string,
    userId: string,
    conversationId: string,
    messages: AgentMessage[]
  ): void {
    const stableMessages = stableHistory(messages);
    this.ensureConversation(tx, {
      tenantId,
      userId,
      conversationId,
      title: deriveTitle(stableMessages)
    });
    tx.run(
      "DELETE FROM messages WHERE tenant_id = ? AND user_id = ? AND conversation_id = ?",
      [tenantId, userId, conversationId]
    );
    const now = Date.now();
    stableMessages.forEach((message, index) => {
      tx.run(
        `INSERT INTO messages(tenant_id,user_id,conversation_id,seq,role,content_json,created_at)
         VALUES (?,?,?,?,?,?,?)`,
        [tenantId, userId, conversationId, index + 1, message.role, JSON.stringify(message), now]
      );
    });
    tx.run(
      "UPDATE conversations SET title = ?, updated_at = ? WHERE tenant_id = ? AND user_id = ? AND conversation_id = ?",
      [deriveTitle(stableMessages), now, tenantId, userId, conversationId]
    );
  }

  removeProvisionalByExecution(
    tx: RuntimeTransaction,
    tenantId: string,
    userId: string,
    conversationId: string,
    executionId: string
  ): void {
    tx.run(
      `DELETE FROM messages
       WHERE tenant_id = ? AND user_id = ? AND conversation_id = ?
         AND content_json LIKE ?`,
      [tenantId, userId, conversationId, `%"provisionalExecutionId":"${executionId}"%`]
    );
  }

  finalizeProvisionalByExecution(
    tx: RuntimeTransaction,
    tenantId: string,
    userId: string,
    conversationId: string,
    executionId: string
  ): void {
    tx.run(
      `UPDATE messages
       SET content_json = json_remove(content_json, '$.transient', '$.provisionalExecutionId')
       WHERE tenant_id = ? AND user_id = ? AND conversation_id = ?
         AND content_json LIKE ?`,
      [tenantId, userId, conversationId, `%"provisionalExecutionId":"${executionId}"%`]
    );
  }

  list(tx: RuntimeTransaction, tenantId: string, userId: string): SessionMeta[] {
    return tx.all<SessionRow>(
      `SELECT conversation_id, title, updated_at FROM conversations
       WHERE tenant_id = ? AND user_id = ?
       ORDER BY updated_at DESC`,
      [tenantId, userId]
    ).map((row) => ({
      conversationId: row.conversation_id,
      title: row.title ?? "New conversation",
      updatedAt: new Date(row.updated_at).toISOString()
    }));
  }

  delete(tx: RuntimeTransaction, tenantId: string, userId: string, conversationId: string): boolean {
    return tx.run(
      "DELETE FROM conversations WHERE tenant_id = ? AND user_id = ? AND conversation_id = ?",
      [tenantId, userId, conversationId]
    ).changes > 0;
  }
}

function stripLifecycleFields(message: AgentMessage): AgentMessage {
  const { lifecycleExecutionId: _lifecycleExecutionId, ...stable } = message as AgentMessage & {
    lifecycleExecutionId?: string;
  };
  return stable;
}
