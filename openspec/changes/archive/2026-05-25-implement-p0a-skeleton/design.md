# Design: P0a Skeleton

## Context
The architecture contracts define three owners:

- TypeScript Agent Runtime owns Agent loop, MessageHistory, ToolRegistry, beforeToolUse, ask_user reservation, and step trace.
- Java Spring Boot Backend owns model gateway, mock provider adapter, tool catalog, tool execution, service auth, idempotency, and trace ingestion.
- Frontend owns interaction and trace/debug visualization and calls only the TS Runtime.

## Phase 0 Discovery
Existing blueprint and architecture contracts define the domain language and runtime boundaries for P0a. No new glossary terms were resolved during discovery, so no `CONTEXT.md` update is required.

No ADR is required for P0a. The durable architecture decisions are already captured in the approved contract documents, and this change implements only the first skeleton slice within those boundaries.

## Goals
- Prove the monorepo layout and cross-runtime JSON contracts.
- Prove a synchronous mock-model -> tool-call -> tool-result -> final-answer loop.
- Prove service auth, catalog version/hash validation, idempotent replay, structured errors, fixture mode, reasoning block roundtrip, and trace continuity.

## Non-Goals
- Streaming/SSE, ask_user resume endpoints, Java policy evaluate, persisted state, MCP, real provider adapters, and frontend session navigation.

## Decisions
- Use TypeScript/Zod in `packages/shared-schema` as the canonical schema source for TS-side tests and runtime validation.
- Use Java DTO records/classes with camelCase JSON fields aligned to shared-schema.
- Use Fastify for the TS Runtime because P0a needs a small HTTP API and `inject`-friendly tests.
- Use Spring Boot MockMvc for backend API tests.
- Use deterministic mock fixture mode via `X-Mock-Fixture` instead of real provider calls.
- Use in-memory stores for MessageHistory, catalog freeze, Java idempotency, and trace events because P0a explicitly excludes persistence.

## Risks / Trade-offs
- In-memory state is lost on process restart. This is acceptable for P0a and must not be described as production behavior.
- Model chat idempotency is not enforced in P0a; tool execution idempotency is required.
- P0a pass-through beforeToolUse validates hook shape only; dynamic policy law is deferred to P0b.

## Migration Plan
No migration. This is the first implementation in a new repository.

## Open Questions
- None blocking. Existing blueprint and architecture contracts define P0a scope and boundaries.
