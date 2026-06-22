# Implement P0a Skeleton Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the approved `implement-p0a-skeleton` OpenSpec change: a runnable OpenHarness P0a monorepo with shared contracts, Java backend, TypeScript Agent Runtime, frontend chat UI, and P0a acceptance tests.

**Architecture:** The TypeScript Agent Runtime owns Agent loop, MessageHistory, ToolRegistry, beforeToolUse, and step trace. Java Spring Boot owns service auth, mock model gateway, tool catalog, tool execution, idempotency, structured errors, and trace ingestion. The frontend calls only the TS Runtime and never configures or calls Java backend APIs.

**Tech Stack:** pnpm workspace, TypeScript, Zod, Vitest, Fastify, React/Vite, Java 21, Spring Boot, Maven, MockMvc.

---

## Scope Guard

Use these source documents before editing code:

- `openspec/changes/implement-p0a-skeleton/proposal.md`
- `openspec/changes/implement-p0a-skeleton/design.md`
- `openspec/changes/implement-p0a-skeleton/tasks.md`
- `docs/architecture/responsibility_boundary.md`
- `docs/architecture/cross_runtime_contracts.md`
- `docs/architecture/auth_contract.md`
- `docs/architecture/error_taxonomy.md`
- `docs/architecture/trace_schema.md`
- `docs/architecture/tool_catalog_contract.md`
- `docs/architecture/policy_contract.md`

Do not implement P0b/P1/P2 behavior: no SSE, no real Java policy runtime, no MessageHistory persistence, no MCP, no real provider, no frontend conversation list, and no unrelated refactor.

## File Structure

- `package.json`: root workspace scripts for `pnpm test`, module test fan-out, and dev entry points.
- `pnpm-workspace.yaml`: workspace package list.
- `tsconfig.base.json`: shared TypeScript compiler defaults.
- `.gitignore`: generated artifacts only.
- `packages/shared-schema/src/index.ts`: zod schemas and exported types.
- `packages/shared-schema/test/schema.test.ts`: zod roundtrip and union tests.
- `backend/pom.xml`: Spring Boot Maven project.
- `backend/src/main/java/org/openharness/backend/OpenHarnessBackendApplication.java`: Spring Boot entry point.
- `backend/src/main/java/org/openharness/backend/api/*.java`: controllers and auth filter.
- `backend/src/main/java/org/openharness/backend/model/*.java`: DTOs aligned to shared-schema camelCase fields.
- `backend/src/main/java/org/openharness/backend/service/*.java`: mock model, catalog, tool execution, idempotency, trace services.
- `backend/src/main/resources/application.yml`: port and actuator defaults.
- `backend/src/test/java/org/openharness/backend/BackendApiTest.java`: MockMvc coverage.
- `agent-runtime/src/server.ts`: Fastify app factory and route registration.
- `agent-runtime/src/agentLoop.ts`: synchronous model/tool/final loop.
- `agent-runtime/src/history.ts`: in-memory MessageHistory and `toModelMessages()`.
- `agent-runtime/src/toolRegistry.ts`: catalog fetch and per-conversation freeze.
- `agent-runtime/src/javaClient.ts`: TS-to-Java HTTP client with auth/trace headers.
- `agent-runtime/src/beforeToolUse.ts`: pass-through hook with P0b-compatible signature.
- `agent-runtime/src/trace.ts`: trace event creation and Java trace posting.
- `agent-runtime/test/*.test.ts`: Fastify inject and unit tests.
- `frontend/src/App.tsx`: first-screen chat UI.
- `frontend/src/api.ts`: TS Runtime client only.
- `frontend/src/trace.ts`: frontend trace id and debug event helpers.
- `frontend/src/App.css`: compact app styling.
- `frontend/test/*.test.tsx`: UI behavior tests.
- `integration-tests/test/p0a.integration.test.ts`: cross-runtime acceptance tests.

## Task 1: Root Workspace and Shared Schema

**Files:**
- Create: `package.json`
- Create: `pnpm-workspace.yaml`
- Create: `tsconfig.base.json`
- Create: `.gitignore`
- Create: `packages/shared-schema/package.json`
- Create: `packages/shared-schema/tsconfig.json`
- Create: `packages/shared-schema/src/index.ts`
- Create: `packages/shared-schema/test/schema.test.ts`

- [ ] **Step 1.1: Add minimal root workspace config**

Create root package files only. Do not add implementation code outside `packages/shared-schema`.

Run: `pnpm --version`
Expected: prints installed pnpm version.

- [ ] **Step 1.2: Write failing shared-schema tests**

Add tests in `packages/shared-schema/test/schema.test.ts` covering:

- `ToolCall.argumentsRaw` parses as string.
- `ToolCallRequest.arguments` parses as object.
- `ModelChatResponse.usage.costUsdMicros` parses.
- `ToolCallResponse` accepts `status: "ok"` without `error`.
- `ToolCallResponse` rejects `status: "ok"` with `error`.
- `ToolCallResponse` rejects `status: "error"` without `error`.
- `AgentMessage.reasoningBlocks` preserves unknown provider fields.
- Roundtrip parse of `ReviewPolicyEvaluateRequest`, `AskUserRequest`, and `ConversationLifecycle`.

Run: `pnpm --filter @openharness/shared-schema test`
Expected before implementation: FAIL because `packages/shared-schema/src/index.ts` does not export the schemas.

- [ ] **Step 1.3: Implement shared zod schemas**

Implement `packages/shared-schema/src/index.ts` with schemas and inferred types for all approved P0a contract names:

- `AgentMessage`
- `ReasoningBlock`
- `ToolDefinition`
- `ToolCall`
- `ToolResult`
- `CacheHint`
- `ModelChatRequest`
- `ModelChatResponse`
- `ToolCallRequest`
- `ToolCallResponse`
- `StructuredError`
- `TraceEvent`
- `ReviewPolicyEvaluateRequest`
- `ReviewPolicyEvaluateResponse`
- `AskUserRequest`
- `AskUserResponse`
- `ConversationLifecycle`

Use `z.discriminatedUnion("status", ...)` for `ToolCallResponse`. Use `.strict()` for `ToolCallResponseOk` so `error` is rejected when `status` is `ok`. Use `.passthrough()` for content/reasoning blocks where provider fields must survive.

- [ ] **Step 1.4: Verify shared-schema**

Run: `pnpm --filter @openharness/shared-schema test`
Expected after implementation: PASS.

Run: `pnpm --filter @openharness/shared-schema typecheck`
Expected: PASS.

## Task 2: Java Backend

**Files:**
- Create: `backend/pom.xml`
- Create: `backend/src/main/java/org/openharness/backend/OpenHarnessBackendApplication.java`
- Create: `backend/src/main/java/org/openharness/backend/api/AuthFilter.java`
- Create: `backend/src/main/java/org/openharness/backend/api/ModelController.java`
- Create: `backend/src/main/java/org/openharness/backend/api/ToolController.java`
- Create: `backend/src/main/java/org/openharness/backend/api/TraceController.java`
- Create: `backend/src/main/java/org/openharness/backend/api/StructuredErrorHandler.java`
- Create: `backend/src/main/java/org/openharness/backend/model/Contracts.java`
- Create: `backend/src/main/java/org/openharness/backend/service/CatalogService.java`
- Create: `backend/src/main/java/org/openharness/backend/service/MockModelService.java`
- Create: `backend/src/main/java/org/openharness/backend/service/ToolExecutionService.java`
- Create: `backend/src/main/java/org/openharness/backend/service/TraceService.java`
- Create: `backend/src/main/resources/application.yml`
- Create: `backend/src/test/java/org/openharness/backend/BackendApiTest.java`

- [ ] **Step 2.1: Add Spring Boot project config**

Add Spring Boot web, actuator, validation, and test dependencies. Configure Java 21 and port `8080`.

Run: `cd backend && mvn -q -DskipTests compile`
Expected before source files: FAIL until the application class exists.

- [ ] **Step 2.2: Write failing MockMvc tests**

Add `BackendApiTest` with tests named:

- `healthDoesNotRequireServiceHeaders`
- `catalogRequiresUserHeader`
- `catalogReturnsVersionHashAndSafeTools`
- `executeCurrentTimeReturnsOk`
- `executeWithStaleCatalogReturnsCatalogOutdated`
- `duplicateToolExecutionReturnsIdempotentReplay`
- `duplicateToolExecutionDifferentPayloadReturnsConflict`
- `mockModelReturnsToolCallForTimeQuestion`
- `mockModelFixtureReturnsDeterministicResponse`
- `traceEventIsAccepted`

Run: `cd backend && mvn test`
Expected before implementation: FAIL because endpoints/services are missing.

- [ ] **Step 2.3: Implement backend contracts**

Implement:

- `GET /actuator/health` through actuator.
- Auth filter for all `/api/v1/**` paths requiring `Authorization: Bearer dev-service-token`, `X-User-Id`, `X-Tenant-Id`, `X-Trace-Id`, and `X-Request-Id`.
- `GET /api/v1/tools/catalog` returning fixed `catalogVersion`, `catalogHash`, and `get_current_time`/`echo`.
- `POST /api/v1/tools/execute` with catalog validation, tool lookup, execution, structured errors, and in-memory idempotency keyed by `(tenantId, idempotencyKey)`.
- `POST /api/v1/model/chat` with normal answer, time-query `get_current_time` tool call, fixture mode, and reasoning fixture.
- `POST /api/v1/trace/events` storing events in memory and printing JSONL without auth token values.

Use `StructuredError` bodies for at least:

- `AUTH_MISSING_HEADER`
- `AUTH_SERVICE_TOKEN_INVALID`
- `CATALOG_OUTDATED`
- `CATALOG_TOOL_NOT_FOUND`
- `TOOL_USER_ERROR`
- `TOOL_INTERNAL_ERROR`
- `IDEMPOTENCY_CONFLICT`

- [ ] **Step 2.4: Verify backend**

Run: `cd backend && mvn test`
Expected after implementation: PASS.

Run: `cd backend && mvn -q -DskipTests compile`
Expected: PASS.

## Task 3: TypeScript Agent Runtime

**Files:**
- Create: `agent-runtime/package.json`
- Create: `agent-runtime/tsconfig.json`
- Create: `agent-runtime/src/index.ts`
- Create: `agent-runtime/src/server.ts`
- Create: `agent-runtime/src/agentLoop.ts`
- Create: `agent-runtime/src/history.ts`
- Create: `agent-runtime/src/toolRegistry.ts`
- Create: `agent-runtime/src/javaClient.ts`
- Create: `agent-runtime/src/beforeToolUse.ts`
- Create: `agent-runtime/src/trace.ts`
- Create: `agent-runtime/test/agentRuntime.test.ts`
- Create: `agent-runtime/test/history.test.ts`

- [ ] **Step 3.1: Add Fastify package config**

Add dependencies on `fastify`, `@fastify/cors`, `@openharness/shared-schema`, and dev dependencies for TypeScript/Vitest.

Run: `pnpm --filter @openharness/agent-runtime test`
Expected before tests: no tests or FAIL until test files are added.

- [ ] **Step 3.2: Write failing runtime tests**

Add tests covering:

- `POST /api/v1/agent/chat` returns final answer for `现在几点`.
- TS generates `X-Trace-Id` when frontend omits it.
- TS reuses provided `X-Trace-Id`.
- TS propagates service token and identity headers to Java client.
- Catalog is fetched once per `(tenantId, conversationId)` and reused.
- `toModelMessages()` strips internal fields.
- Invalid `argumentsRaw` creates model-visible `MODEL_TOOL_PARSE_ERROR` tool result.
- Reasoning blocks from Java model response are stored and sent unchanged in the next model call.

Run: `pnpm --filter @openharness/agent-runtime test`
Expected before implementation: FAIL.

- [ ] **Step 3.3: Implement runtime modules**

Implement:

- `createServer()` Fastify app factory.
- `POST /api/v1/agent/chat`.
- in-memory `MessageHistoryStore`.
- `toModelMessages()` internal-field stripping.
- `ToolRegistry` with Java catalog fetch and freeze.
- `beforeToolUse()` returning ALLOW for P0a.
- `JavaClient` for `/api/v1/model/chat`, `/api/v1/tools/catalog`, `/api/v1/tools/execute`, `/api/v1/trace/events`.
- synchronous loop: call model, execute allowed tool calls, append tool results, call model again for final answer.
- trace events for at least `AGENT_START`, `MODEL_NODE_START/END`, `TOOL_EXECUTE_REQUEST`, `OBSERVE_TOOL_RESULT`, `FINAL_ANSWER`, and `AGENT_END`.
- CORS allowing only `FRONTEND_URL` and exposing `X-Trace-Id`/`X-Request-Id`.

- [ ] **Step 3.4: Verify agent-runtime**

Run: `pnpm --filter @openharness/agent-runtime test`
Expected after implementation: PASS.

Run: `pnpm --filter @openharness/agent-runtime typecheck`
Expected: PASS.

## Task 4: Frontend

**Files:**
- Create: `frontend/package.json`
- Create: `frontend/tsconfig.json`
- Create: `frontend/vite.config.ts`
- Create: `frontend/index.html`
- Create: `frontend/src/main.tsx`
- Create: `frontend/src/App.tsx`
- Create: `frontend/src/api.ts`
- Create: `frontend/src/trace.ts`
- Create: `frontend/src/App.css`
- Create: `frontend/test/App.test.tsx`
- Create: `frontend/test/setup.ts`

- [ ] **Step 4.1: Add Vite/React package config**

Configure Vitest with jsdom and React Testing Library.

Run: `pnpm --filter @openharness/frontend test`
Expected before tests: no tests or FAIL until test files are added.

- [ ] **Step 4.2: Write failing frontend tests**

Add tests covering:

- First screen contains chat input and send control.
- Submit posts to `/api/v1/agent/chat`.
- Submit includes `X-Trace-Id`, `X-User-Id`, and `X-Tenant-Id`.
- Assistant answer renders after response.
- Trace/debug JSON panel renders response trace data.
- Frontend source/config does not use a Java backend URL variable.

Run: `pnpm --filter @openharness/frontend test`
Expected before implementation: FAIL.

- [ ] **Step 4.3: Implement frontend**

Implement:

- compact first-screen chat UI.
- `VITE_AGENT_RUNTIME_URL` only; no Java backend URL.
- dev default user/tenant headers from env or fixed P0a dev values.
- trace id generated on submit when not already present.
- assistant response rendering.
- trace/debug JSON panel.

Do not create a landing page, hero page, session list, or Java API client.

- [ ] **Step 4.4: Verify frontend**

Run: `pnpm --filter @openharness/frontend test`
Expected after implementation: PASS.

Run: `pnpm --filter @openharness/frontend typecheck`
Expected: PASS.

## Task 5: P0a Integration Tests

**Files:**
- Create: `integration-tests/package.json`
- Create: `integration-tests/tsconfig.json`
- Create: `integration-tests/test/p0a.integration.test.ts`

- [ ] **Step 5.1: Add integration harness**

Use Vitest and child process startup or direct app imports where practical. The tests must cover the real HTTP boundary between TS Agent Runtime and Java backend for P0a acceptance.

- [ ] **Step 5.2: Write failing P0a acceptance tests**

Cover exactly these acceptance cases:

1. `/api/v1/tools/catalog` returns `catalogVersion/catalogHash`.
2. `/api/v1/tools/execute` executes `get_current_time`.
3. `/api/v1/agent/chat` with `现在几点` completes model -> tool -> final answer.
4. Missing `X-User-Id` to Java non-health API returns 401.
5. Duplicate idempotency key returns first result with `idempotentReplay=true`.
6. Stale `catalogVersion` returns 409 `CATALOG_OUTDATED`.
7. `X-Mock-Fixture` fixture mode returns deterministic canonical response.
8. reasoningBlocks roundtrip: mock returns reasoning block and TS next round sends it unchanged to Java.
9. Single chat trace continuity includes at least 1 frontend event, 3 TS events, and 2 Java events sharing one `traceId`.

Run: `pnpm --filter @openharness/integration-tests test`
Expected before implementation wiring: FAIL.

- [ ] **Step 5.3: Implement integration support**

Add test helpers to start backend and agent-runtime on test ports, wait for `/actuator/health`, and tear down processes. Keep helpers inside `integration-tests/test/p0a.integration.test.ts` unless the file becomes unwieldy.

- [ ] **Step 5.4: Verify integration tests**

Run: `pnpm --filter @openharness/integration-tests test`
Expected after implementation: PASS.

## Task 6: Full Verification and Local Run

**Files:**
- Modify only if tests reveal missing scripts: root `package.json`, module `package.json`, or `backend/pom.xml`.

- [ ] **Step 6.1: Run backend verification**

Run: `cd backend && mvn test`
Expected: PASS.

- [ ] **Step 6.2: Run TS workspace verification**

Run: `pnpm test`
Expected: PASS across shared-schema, agent-runtime, frontend, and integration tests.

- [ ] **Step 6.3: Start local services**

Start backend:

```bash
cd backend
mvn spring-boot:run
```

Expected URL: `http://localhost:8080/actuator/health`

Start agent-runtime:

```bash
pnpm --filter @openharness/agent-runtime dev
```

Expected URL: `http://localhost:3001/api/v1/agent/chat`

Start frontend:

```bash
pnpm --filter @openharness/frontend dev
```

Expected URL: `http://localhost:5173`

- [ ] **Step 6.4: Smoke test**

Run:

```bash
curl -s http://localhost:8080/actuator/health
```

Expected: JSON containing health status.

Run:

```bash
curl -s -X POST http://localhost:3001/api/v1/agent/chat \
  -H 'Content-Type: application/json' \
  -H 'X-User-Id: user-001' \
  -H 'X-Tenant-Id: tenant-001' \
  -H 'X-Trace-Id: trace-smoke-001' \
  -H 'X-Request-Id: req-smoke-001' \
  -d '{"conversationId":"conv-smoke-001","message":"现在几点？"}'
```

Expected: JSON assistant answer and trace/debug information using `trace-smoke-001`.

- [ ] **Step 6.5: Update OpenSpec task status**

After all implementation and verification steps pass, update `openspec/changes/implement-p0a-skeleton/tasks.md` checkboxes to reflect completed work.

## Self-Review

- Spec coverage: every approved OpenSpec delta maps to Tasks 1-5, with verification in Task 6.
- Banned-phrase scan: clean.
- Type consistency: canonical schema names match the blueprint and OpenSpec deltas; Java and TypeScript JSON fields must stay camelCase.
- Boundary check: no task asks Java to implement an Agent loop or frontend to call Java APIs.
