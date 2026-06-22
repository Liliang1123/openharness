## 1. Shared Schema
- [x] 1.1 Add root pnpm workspace config without removing `docs/architecture`.
- [x] 1.2 Add `packages/shared-schema` package config.
- [x] 1.3 Write failing zod parse, roundtrip, reasoningBlocks, and `ToolCallResponse` discriminated union tests.
- [x] 1.4 Implement exported zod schemas and TypeScript types for all P0a contract types.
- [x] 1.5 Run shared-schema tests.

## 2. Java Backend
- [x] 2.1 Add Spring Boot Maven project.
- [x] 2.2 Write failing backend tests for health, required auth headers, catalog, tool execution, idempotency, catalog mismatch, mock fixture mode, and trace ingest.
- [x] 2.3 Implement `GET /actuator/health`.
- [x] 2.4 Implement auth enforcement for all non-health `/api/v1/**` endpoints.
- [x] 2.5 Implement `POST /api/v1/model/chat` mock model with normal, tool-call, fixture, and reasoning-block responses.
- [x] 2.6 Implement `GET /api/v1/tools/catalog` with `get_current_time` and `echo` definitions.
- [x] 2.7 Implement `POST /api/v1/tools/execute` with catalog validation, tools, structured errors, and 24h in-memory idempotency.
- [x] 2.8 Implement `POST /api/v1/trace/events` stdout JSONL or in-memory trace storage.
- [x] 2.9 Run `mvn test`.

## 3. TypeScript Agent Runtime
- [x] 3.1 Add Fastify TypeScript package config.
- [x] 3.2 Write failing tests for `/api/v1/agent/chat`, trace/request headers, tool loop, catalog freeze, tool argument parse error, and reasoning block roundtrip.
- [x] 3.3 Implement in-memory MessageHistory by `(tenantId, conversationId)`.
- [x] 3.4 Implement `toModelMessages()` stripping TS internal fields before Java model calls.
- [x] 3.5 Implement ToolRegistry fetching Java catalog and freezing it per conversation.
- [x] 3.6 Implement pass-through `beforeToolUse` hook with P0b-compatible signature.
- [x] 3.7 Implement synchronous model/tool/final Agent loop.
- [x] 3.8 Implement TS-to-Java trace propagation and CORS restricted to `FRONTEND_URL`.
- [x] 3.9 Run agent-runtime tests.

## 4. Frontend
- [x] 4.1 Add Vite/React frontend package config.
- [x] 4.2 Write failing tests for chat submit, assistant answer render, trace header generation/propagation, trace debug panel, and absence of Java backend URL usage.
- [x] 4.3 Implement first-screen chat UI only.
- [x] 4.4 Configure frontend to call only TS Runtime `POST /api/v1/agent/chat`.
- [x] 4.5 Run frontend tests.

## 5. P0a Integration
- [x] 5.1 Add integration test package and fixtures.
- [x] 5.2 Cover catalog returns `catalogVersion/catalogHash`.
- [x] 5.3 Cover `get_current_time` tool execution.
- [x] 5.4 Cover `/api/v1/agent/chat` input `现在几点` completing model -> tool -> final answer.
- [x] 5.5 Cover missing `X-User-Id` returns 401 `AUTH_MISSING_HEADER` from Java non-health API.
- [x] 5.6 Cover duplicate idempotency key returns first result with `idempotentReplay=true`.
- [x] 5.7 Cover stale catalog returns 409 `CATALOG_OUTDATED`.
- [x] 5.8 Cover `X-Mock-Fixture` deterministic canonical response.
- [x] 5.9 Cover reasoningBlocks roundtrip from Java to TS next Java request.
- [x] 5.10 Cover single chat trace continuity with at least 1 frontend event, 3 TS events, and 2 Java events sharing one `traceId`.

## 6. Verification and Handoff
- [x] 6.1 Run root `pnpm test`.
- [x] 6.2 Run `cd backend && mvn test`.
- [x] 6.3 Start backend, agent-runtime, and frontend locally.
- [x] 6.4 Smoke test `GET /actuator/health` and `/api/v1/agent/chat`.
- [x] 6.5 Provide URLs and verification evidence.
