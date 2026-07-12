import type { EventId, SessionEvent } from "./types";

export type SessionEventListener = (event: SessionEvent) => void;

/**
 * Per-conversation event log used for SSE replay & live subscription.
 *
 * EventId format: `${tenantId}::${conversationId}:${seq}` (seq is per-(tenant,conv) monotonic).
 *
 * JS single-threaded execution guarantees that synchronous calls to `since()` followed by
 * `subscribe()` cannot have an `append()` interleaved between them — callers can safely:
 *
 *   const replayed = store.since(t, c, lastEventId);
 *   const unsub = store.subscribe(t, c, (e) => sendSSE(e));
 *
 * with no gap between the replay slice and the first live event.
 */
export interface RuntimeEventReader {
  since(tenantId: string, userId: string, conversationId: string, afterEventId: EventId | null): SessionEvent[];
  latestEventId(tenantId: string, userId: string, conversationId: string): EventId | null;
  hasEvent(tenantId: string, userId: string, conversationId: string, eventId: EventId): boolean;
}

export interface RuntimeEventPublisher {
  publish(event: SessionEvent): void;
  subscribe(tenantId: string, userId: string, conversationId: string, listener: SessionEventListener): () => void;
}

export interface RuntimeEventStore extends RuntimeEventReader, RuntimeEventPublisher {
  append(
    tenantId: string,
    userId: string,
    conversationId: string,
    event: Omit<SessionEvent, "eventId" | "durability">
  ): SessionEvent;
}

export class InMemoryRuntimeEventPublisher implements RuntimeEventPublisher {
  private readonly listeners = new Map<string, Set<SessionEventListener>>();

  publish(event: SessionEvent): void {
    const scoped = this.listeners.get(key(event.tenantId, event.userId, event.conversationId));
    if (!scoped) return;
    for (const listener of scoped) {
      try {
        listener(event);
      } catch {
        // Listener errors must not change committed durable state.
      }
    }
  }

  subscribe(
    tenantId: string,
    userId: string,
    conversationId: string,
    listener: SessionEventListener
  ): () => void {
    const scopedKey = key(tenantId, userId, conversationId);
    const scoped = this.listeners.get(scopedKey) ?? new Set<SessionEventListener>();
    scoped.add(listener);
    this.listeners.set(scopedKey, scoped);
    return () => {
      const current = this.listeners.get(scopedKey);
      current?.delete(listener);
      if (current?.size === 0) this.listeners.delete(scopedKey);
    };
  }
}

function key(tenantId: string, userId: string, conversationId: string): string {
  return `${tenantId}::${userId}::${conversationId}`;
}

export class InMemoryRuntimeEventStore implements RuntimeEventStore {
  private readonly events = new Map<string, SessionEvent[]>();
  private readonly listeners = new Map<string, Set<SessionEventListener>>();
  private readonly nextSeq = new Map<string, number>();

  append(
    tenantId: string,
    userId: string,
    conversationId: string,
    event: Omit<SessionEvent, "eventId" | "durability">
  ): SessionEvent {
    const k = key(tenantId, userId, conversationId);
    const seq = (this.nextSeq.get(k) ?? 0) + 1;
    this.nextSeq.set(k, seq);
    const stamped: SessionEvent = {
      ...event,
      durability: "durable",
      eventId: `${tenantId}::${userId}::${conversationId}:${seq}`
    };

    let bucket = this.events.get(k);
    if (!bucket) {
      bucket = [];
      this.events.set(k, bucket);
    }
    bucket.push(stamped);

    this.notify(stamped);
    return stamped;
  }

  publish(event: SessionEvent): void {
    this.notify(event);
  }

  private notify(event: SessionEvent): void {
    const ls = this.listeners.get(key(event.tenantId, event.userId, event.conversationId));
    if (ls) {
      for (const listener of ls) {
        try {
          listener(event);
        } catch {
          // Listener errors must not break the append path.
        }
      }
    }

  }

  since(
    tenantId: string,
    userId: string,
    conversationId: string,
    afterEventId: EventId | null
  ): SessionEvent[] {
    const bucket = this.events.get(key(tenantId, userId, conversationId));
    if (!bucket) return [];
    if (afterEventId == null) return [...bucket];
    const idx = bucket.findIndex(e => e.eventId === afterEventId);
    if (idx === -1) return [];
    return bucket.slice(idx + 1);
  }

  latestEventId(tenantId: string, userId: string, conversationId: string): EventId | null {
    const bucket = this.events.get(key(tenantId, userId, conversationId));
    if (!bucket || bucket.length === 0) return null;
    return bucket[bucket.length - 1].eventId;
  }

  hasEvent(tenantId: string, userId: string, conversationId: string, eventId: EventId): boolean {
    const bucket = this.events.get(key(tenantId, userId, conversationId));
    if (!bucket) return false;
    return bucket.some(e => e.eventId === eventId);
  }

  subscribe(
    tenantId: string,
    userId: string,
    conversationId: string,
    listener: SessionEventListener
  ): () => void {
    const k = key(tenantId, userId, conversationId);
    let ls = this.listeners.get(k);
    if (!ls) {
      ls = new Set();
      this.listeners.set(k, ls);
    }
    ls.add(listener);
    return () => {
      const cur = this.listeners.get(k);
      if (cur) {
        cur.delete(listener);
        if (cur.size === 0) this.listeners.delete(k);
      }
    };
  }
}
