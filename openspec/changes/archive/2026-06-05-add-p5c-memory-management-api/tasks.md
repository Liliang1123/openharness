## 1. Shared schema
- [x] 1.1 Add zod schemas and TypeScript types for memory list/search/upsert/delete API requests and responses.
- [x] 1.2 Add schema tests for valid payloads, missing required fields, and forbidden client-controlled scope/timestamps.

## 2. Runtime API
- [x] 2.1 Add a configurable `MemoryStore` dependency to `createServer`, defaulting to local JSON memory persistence when enabled by existing runtime configuration.
- [x] 2.2 Add `GET /api/v1/memory/facts` for scoped listing with optional literal `query` and repeated/comma-separated `tags` filters.
- [x] 2.3 Add `PUT /api/v1/memory/facts` for scoped upsert using header-derived tenant/user scope.
- [x] 2.4 Add `DELETE /api/v1/memory/facts/:memoryId` for scoped deletion with structured not-found behavior.
- [x] 2.5 Ensure memory management routes do not mutate MessageHistory, do not call Java Backend, and do not trigger agent execution.

## 3. Verification
- [x] 3.1 Add runtime API tests for scope isolation, list/search, upsert update, delete, and not-found behavior.
- [x] 3.2 Run targeted shared-schema and agent-runtime tests.
- [x] 3.3 Run `pnpm typecheck`, `pnpm test`, `mvn test`, and `npx openspec validate --all --strict --no-interactive`.
- [x] 3.4 Archive the OpenSpec change after implementation and verification are complete.
