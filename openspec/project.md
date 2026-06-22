# Project Context

## Purpose
OpenHarness is a new Agent Harness monorepo. It validates a three-layer runtime boundary:
Frontend -> TypeScript Agent Runtime -> Java Spring Boot Enterprise Gateway.

The TypeScript runtime owns the Agent loop and harness state. The Java backend owns enterprise gateway concerns such as model gateway, tool catalog, tool execution, auth, idempotency, and trace ingestion. The frontend is only an interaction and observability surface.

## Tech Stack
- TypeScript, pnpm workspace, Zod, Vitest
- Node.js with Fastify for the Agent Runtime
- Java 21, Spring Boot, Maven for the backend
- React/Vite for the frontend

## Project Conventions

### Code Style
- Use camelCase JSON fields across TypeScript and Java DTOs.
- Keep P0a code small and explicit; avoid P0b/P1/P2 behavior unless the interface must be reserved.
- Preserve provider reasoning blocks as structured data; do not stringify or rewrite them.

### Architecture Patterns
- TS Agent Runtime is the Agent Harness Owner: Agent loop, MessageHistory, ToolRegistry, beforeToolUse hook, ask_user reservation, and step trace.
- Java Spring Boot is the Enterprise Gateway Owner: Model Gateway, provider adapter mock, Tool Catalog, Tool Execution, Auth, Idempotency, and Trace.
- Frontend calls only the TS Runtime and must not configure or call the Java backend URL.
- All business APIs use `/api/v1/`; `GET /actuator/health` is the only exception.

### Testing Strategy
- Write tests before implementation.
- P0a requires shared-schema zod tests, backend controller/service tests, agent-runtime unit/integration tests, frontend tests, and cross-runtime integration tests.
- Validation evidence is required before claiming completion.

### Git Workflow
- This repository is currently a new working tree. Do not modify any read-only reference repositories.
- Do not delete existing `docs/architecture` contract documents.

## Domain Context
- Agent decides how to complete tasks; Harness decides what cannot be bypassed.
- Policy in prompt is a hint; policy in hook is law.
- Java must not implement a second Agent loop.
- Provider keys must not enter TS Runtime or Frontend.

## Important Constraints
- P0a Skeleton excludes SSE, real Java policy runtime, MessageHistory persistence, MCP, real provider integration, frontend session list, and unrelated refactors.
- Service-to-service Java APIs require `Authorization: Bearer dev-service-token`, `X-User-Id`, `X-Tenant-Id`, `X-Trace-Id`, and `X-Request-Id`.
- Tool execution must validate catalog version/hash and support 24h in-memory idempotency for `(tenantId, idempotencyKey)`.

## External Dependencies
- No real LLM provider in P0a. Java uses a deterministic mock model gateway and mock fixture mode.
- Java owns future provider credentials and provider adapters.
