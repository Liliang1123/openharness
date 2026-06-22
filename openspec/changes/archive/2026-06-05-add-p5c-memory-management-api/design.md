## Context
P5a introduced `MemoryStore` and JSON-file persistence. P5b introduced read-only memory retrieval into `ContextBuilder`. There is still no network/API entry point for explicit operator or developer management of memory facts.

## Goals / Non-Goals
- Goals: expose scoped list/search/upsert/delete endpoints in TS Runtime, validate payloads through shared schemas, keep scope derived from headers, and preserve deterministic literal memory semantics.
- Non-Goals: frontend memory UI, Java Backend memory storage or writes, automatic memory extraction from conversations, embeddings, vector search, ranking models, bulk import/export, and production storage guarantees.

## Decisions
- Decision: The API is owned by TS Runtime.
  Rationale: TS Runtime already owns `MemoryStore`, memory retrieval, and agent context construction. Java remains the enterprise gateway for model, tool, policy, auth, idempotency, and trace concerns.
- Decision: Tenant/user scope comes from `X-Tenant-Id` and `X-User-Id` headers.
  Rationale: this matches existing runtime request scoping and prevents clients from mutating another scope by embedding tenant/user fields in the body.
- Decision: Search remains deterministic literal search with optional tag filters.
  Rationale: this preserves P5a/P5b semantics and keeps API behavior testable without embeddings or external indexes.
- Decision: Upsert accepts optional `memoryId` for updates and server-stamps timestamps through `MemoryStore`.
  Rationale: this reuses the current lifecycle contract while avoiding client-controlled audit timestamps.
- Decision: Delete returns a structured not-found result instead of silently succeeding.
  Rationale: operators and tests need clear evidence when a memory fact did not exist in the scoped store.

## Risks / Trade-offs
- Direct management APIs can expose sensitive memory contents. Mitigation: scope strictly by headers and keep this as a dev/operator API; broader auth/UI policy is reserved for later changes.
- Upsert can overwrite facts if `memoryId` is reused. Mitigation: this is explicit lifecycle behavior already defined by `MemoryStore`; tests should cover scoped isolation.
- Literal search can miss semantically related facts. Mitigation: preserve deterministic behavior and defer vector retrieval to a future OpenSpec change.

## Migration Plan
No data migration is required. Existing memory files remain valid. The API should use the same configured memory store as retrieval when available.

## Open Questions
- None for P5c proposal.
