# Change: Add memory management API

## Why
P5a/P5b established scoped memory storage and deterministic memory retrieval, but memory facts can only be exercised through internal store APIs and tests. Operators and developers need an explicit TS Runtime API to list, search, upsert, and delete scoped memory facts so memory behavior can be managed and regression-tested without adding frontend UI or Java-owned storage.

## What Changes
- Add a TS Runtime `Memory Management API` under `/api/v1/memory/facts`.
- Scope all operations by request headers `X-Tenant-Id` and `X-User-Id`; request bodies must not override tenant/user scope.
- Support list, literal search with optional tag filters, upsert, and delete using the existing `MemoryStore` lifecycle.
- Add shared-schema request/response contracts for memory management API payloads.
- Keep automatic memory extraction, vector retrieval, frontend UI, and Java Backend memory writes out of scope.

## Impact
- Affected specs: `long-term-memory`, `shared-schema`
- Affected code: `agent-runtime/src/server.ts`, `agent-runtime/src/memoryStore.ts`, `agent-runtime/test/*memory*`, `packages/shared-schema/src/index.ts`, `packages/shared-schema/test/schema.test.ts`
