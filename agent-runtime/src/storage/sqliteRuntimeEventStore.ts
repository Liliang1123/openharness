import type { SessionEvent } from "../types";
import type { RuntimeTransaction } from "./runtimeStorage";

export type RuntimeEventDeliveryStatus = "pending" | "retry" | "delivered" | "dead_letter";

export type SqliteRuntimeEventInput = SessionEvent & { cursor: number };

export interface RuntimeEventOutboxStatus {
  deliveryStatus: RuntimeEventDeliveryStatus;
  deliveryAttempts: number;
  nextAttemptAt: number | null;
}

interface RuntimeEventRow {
  tenant_id: string;
  user_id: string;
  conversation_id: string;
  event_id: string;
  execution_id: string;
  cursor: number;
  kind: SessionEvent["kind"];
  payload_json: string;
  created_at: number;
  delivery_status: RuntimeEventDeliveryStatus;
  delivery_attempts: number;
  next_attempt_at: number | null;
}

export class SqliteRuntimeEventStore {
  append(tx: RuntimeTransaction, event: SqliteRuntimeEventInput): SessionEvent {
    tx.run(
      `INSERT INTO runtime_events(
         tenant_id,user_id,conversation_id,event_id,execution_id,cursor,kind,payload_json,created_at
       ) VALUES (?,?,?,?,?,?,?,?,?)`,
      [
        event.tenantId,
        event.userId,
        event.conversationId,
        event.eventId,
        event.executionId,
        event.cursor,
        event.kind,
        JSON.stringify(event.data),
        event.createdAt
      ]
    );
    return stripCursor(event);
  }

  replayAfter(
    tx: RuntimeTransaction,
    tenantId: string,
    userId: string,
    conversationId: string,
    afterCursor: number | null
  ): SessionEvent[] {
    return tx.all<RuntimeEventRow>(
      `SELECT tenant_id,user_id,conversation_id,event_id,execution_id,cursor,kind,payload_json,created_at,
              delivery_status,delivery_attempts,next_attempt_at
       FROM runtime_events
       WHERE tenant_id = ? AND user_id = ? AND conversation_id = ? AND cursor > ?
       ORDER BY cursor ASC`,
      [tenantId, userId, conversationId, afterCursor ?? 0]
    ).map(fromRow);
  }

  latestCursor(tx: RuntimeTransaction, tenantId: string, userId: string, conversationId: string): number | null {
    return tx.get<{ cursor: number | null }>(
      `SELECT MAX(cursor) AS cursor FROM runtime_events
       WHERE tenant_id = ? AND user_id = ? AND conversation_id = ?`,
      [tenantId, userId, conversationId]
    )?.cursor ?? null;
  }

  getOutboxStatus(
    tx: RuntimeTransaction,
    tenantId: string,
    userId: string,
    conversationId: string,
    eventId: string
  ): RuntimeEventOutboxStatus | null {
    const row = tx.get<RuntimeEventRow>(
      `SELECT tenant_id,user_id,conversation_id,event_id,execution_id,cursor,kind,payload_json,created_at,
              delivery_status,delivery_attempts,next_attempt_at
       FROM runtime_events
       WHERE tenant_id = ? AND user_id = ? AND conversation_id = ? AND event_id = ?`,
      [tenantId, userId, conversationId, eventId]
    );
    return row ? toOutboxStatus(row) : null;
  }

  claimOutbox(tx: RuntimeTransaction, limit: number): SessionEvent[] {
    return tx.all<RuntimeEventRow>(
      `SELECT tenant_id,user_id,conversation_id,event_id,execution_id,cursor,kind,payload_json,created_at,
              delivery_status,delivery_attempts,next_attempt_at
       FROM runtime_events
       WHERE delivery_status IN ('pending','retry')
       ORDER BY created_at ASC, event_id ASC
       LIMIT ?`,
      [limit]
    ).map(fromRow);
  }

  markRetry(
    tx: RuntimeTransaction,
    tenantId: string,
    userId: string,
    conversationId: string,
    eventId: string,
    nextAttemptAt: number
  ): boolean {
    return tx.run(
      `UPDATE runtime_events
       SET delivery_status = 'retry',
           delivery_attempts = delivery_attempts + 1,
           next_attempt_at = ?
       WHERE tenant_id = ? AND user_id = ? AND conversation_id = ? AND event_id = ?
         AND delivery_status IN ('pending','retry')`,
      [nextAttemptAt, tenantId, userId, conversationId, eventId]
    ).changes === 1;
  }

  markAcknowledged(
    tx: RuntimeTransaction,
    tenantId: string,
    userId: string,
    conversationId: string,
    eventId: string
  ): boolean {
    return tx.run(
      `UPDATE runtime_events
       SET delivery_status = 'delivered',
           delivered_at = ?,
           next_attempt_at = NULL
       WHERE tenant_id = ? AND user_id = ? AND conversation_id = ? AND event_id = ?
         AND delivery_status IN ('pending','retry')`,
      [Date.now(), tenantId, userId, conversationId, eventId]
    ).changes === 1;
  }

  markDeadLettered(
    tx: RuntimeTransaction,
    tenantId: string,
    userId: string,
    conversationId: string,
    eventId: string
  ): boolean {
    return tx.run(
      `UPDATE runtime_events
       SET delivery_status = 'dead_letter',
           dead_letter_at = ?,
           next_attempt_at = NULL
       WHERE tenant_id = ? AND user_id = ? AND conversation_id = ? AND event_id = ?
         AND delivery_status IN ('pending','retry')`,
      [Date.now(), tenantId, userId, conversationId, eventId]
    ).changes === 1;
  }
}

function fromRow(row: RuntimeEventRow): SessionEvent {
  return {
    durability: "durable",
    eventId: row.event_id,
    executionId: row.execution_id,
    conversationId: row.conversation_id,
    tenantId: row.tenant_id,
    userId: row.user_id,
    traceId: "persisted",
    requestId: "persisted",
    createdAt: row.created_at,
    kind: row.kind,
    data: JSON.parse(row.payload_json) as Record<string, unknown>
  };
}

function stripCursor(event: SqliteRuntimeEventInput): SessionEvent {
  const { cursor: _cursor, ...sessionEvent } = event;
  return sessionEvent;
}

function toOutboxStatus(row: RuntimeEventRow): RuntimeEventOutboxStatus {
  return {
    deliveryStatus: row.delivery_status,
    deliveryAttempts: row.delivery_attempts,
    nextAttemptAt: row.next_attempt_at
  };
}
