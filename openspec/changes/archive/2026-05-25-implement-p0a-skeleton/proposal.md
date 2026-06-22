# Change: Implement P0a Skeleton

## Why
OpenHarness needs a runnable first slice that proves the frozen architecture boundary across Frontend, TypeScript Agent Runtime, Java Spring Boot Backend, and shared contracts.

The current repository only contains architecture contract documents. P0a must establish the monorepo skeleton and deterministic mock behavior before later P0b/P1 work adds streaming, dynamic policy, persistence, MCP, and real providers.

## What Changes
- Add pnpm monorepo workspace structure with `packages/shared-schema`, `backend`, `agent-runtime`, `frontend`, and integration tests.
- Add shared TypeScript/Zod schemas and exported types matching the P0a canonical contracts.
- Add a Java Spring Boot backend with authenticated `/api/v1/**` APIs for mock model chat, tool catalog, tool execution, and trace ingestion.
- Add a TypeScript Agent Runtime with synchronous `/api/v1/agent/chat`, in-memory MessageHistory, catalog freeze, pass-through beforeToolUse hook, model/tool loop, and trace propagation.
- Add a minimal frontend chat UI that only calls the TS Runtime and displays trace/debug JSON.
- Add P0a tests for shared schema, backend behavior, agent loop, frontend behavior, and required cross-runtime acceptance cases.

## Non-Goals
- No SSE or streaming chat endpoint.
- No real Java policy runtime.
- No persistent MessageHistory.
- No MCP.
- No real model provider.
- No frontend conversation list.
- No unrelated refactor outside P0a skeleton.

## Impact
- Affected specs: shared-schema, backend-gateway, agent-runtime, frontend-runtime, p0a-integration.
- Affected code: root monorepo config, `packages/shared-schema`, `backend`, `agent-runtime`, `frontend`, `integration-tests`.
- Existing docs: preserve all files in `docs/architecture`.
