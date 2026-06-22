# Memory Management API Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a TS Runtime Memory Management API for explicit scoped list/search/upsert/delete of long-term memory facts.

**Architecture:** The API lives in `agent-runtime/src/server.ts` and uses the existing `MemoryStore` lifecycle. Scope comes from `X-Tenant-Id` and `X-User-Id` headers; request bodies cannot override tenant/user scope or audit timestamps. Shared schemas define the request/response contracts for memory management payloads.

**Tech Stack:** TypeScript, Fastify, Zod, Vitest, pnpm workspace, OpenSpec.

---

## Files

- Modify: `packages/shared-schema/src/index.ts`
  - Add `MemorySearchQuerySchema`, `MemoryUpsertRequestSchema`, `MemoryListResponseSchema`, and `MemoryDeleteResponseSchema`.
- Modify: `packages/shared-schema/test/schema.test.ts`
  - Add schema tests for memory search/list/upsert/delete contracts and rejected client-controlled scope.
- Modify: `agent-runtime/src/server.ts`
  - Add optional `memoryStore?: MemoryStore` to `CreateServerOptions`.
  - Instantiate a default `JsonFileMemoryStore` for server memory routes and runner memory retrieval.
  - Add `GET /api/v1/memory/facts`, `PUT /api/v1/memory/facts`, and `DELETE /api/v1/memory/facts/:memoryId`.
- Create: `agent-runtime/test/memoryApi.test.ts`
  - Test scoped list/search, scoped upsert, scoped delete, not-found delete, no Java call, and no MessageHistory mutation.
- Modify: `openspec/changes/add-p5c-memory-management-api/tasks.md`
  - Mark completed tasks after implementation and verification.

## Task 1: Shared Schema Memory Management Contracts

**Files:**
- Modify: `packages/shared-schema/test/schema.test.ts`
- Modify: `packages/shared-schema/src/index.ts`

- [ ] **Step 1: Write failing shared-schema tests**

Add these imports to `packages/shared-schema/test/schema.test.ts`:

```ts
  MemoryDeleteResponseSchema,
  MemoryListResponseSchema,
  MemorySearchQuerySchema,
  MemoryUpsertRequestSchema,
```

Add these tests inside `describe("shared schema", () => { ... })`:

```ts
  it("parses memory management list responses", () => {
    const parsed = MemoryListResponseSchema.parse({
      facts: [
        {
          memoryId: "mem-001",
          tenantId: "tenant-001",
          userId: "user-001",
          content: "User prefers concise Chinese replies.",
          tags: ["preference"],
          createdAt: "2026-06-05T00:00:00.000Z",
          updatedAt: "2026-06-05T00:00:00.000Z"
        }
      ]
    });

    expect(parsed.facts[0]?.memoryId).toBe("mem-001");
  });

  it("parses memory management search queries", () => {
    const parsed = MemorySearchQuerySchema.parse({
      query: "postgres",
      tags: ["database", "preference"]
    });

    expect(parsed.query).toBe("postgres");
    expect(parsed.tags).toEqual(["database", "preference"]);
  });

  it("parses memory management upsert requests without scope fields", () => {
    const parsed = MemoryUpsertRequestSchema.parse({
      memoryId: "mem-001",
      agentId: "agent-001",
      content: "User prefers examples in TypeScript.",
      tags: ["preference", "code"]
    });

    expect(parsed.memoryId).toBe("mem-001");
    expect(parsed.tags).toEqual(["preference", "code"]);
  });

  it("rejects memory management upsert requests with client-controlled scope or timestamps", () => {
    expect(() =>
      MemoryUpsertRequestSchema.parse({
        tenantId: "tenant-evil",
        userId: "user-evil",
        content: "bad scope",
        tags: [],
        createdAt: "2026-06-05T00:00:00.000Z",
        updatedAt: "2026-06-05T00:00:00.000Z"
      })
    ).toThrow();
  });

  it("parses memory management delete responses", () => {
    const parsed = MemoryDeleteResponseSchema.parse({
      memoryId: "mem-001",
      deleted: false
    });

    expect(parsed.deleted).toBe(false);
  });
```

- [ ] **Step 2: Run the shared-schema tests and verify RED**

Run:

```bash
pnpm --filter @openharness/shared-schema test -- schema
```

Expected: FAIL because the new schema exports do not exist.

- [ ] **Step 3: Add shared-schema implementation**

In `packages/shared-schema/src/index.ts`, after `MemoryFactSchema` and `MemoryFact`:

```ts
export const MemorySearchQuerySchema = z.object({
  query: z.string().default(""),
  tags: z.array(z.string().min(1)).default([])
}).strict();
export type MemorySearchQuery = z.infer<typeof MemorySearchQuerySchema>;

export const MemoryUpsertRequestSchema = z.object({
  memoryId: z.string().min(1).optional(),
  agentId: z.string().min(1).optional(),
  content: z.string().min(1),
  tags: z.array(z.string().min(1)).default([])
}).strict();
export type MemoryUpsertRequest = z.infer<typeof MemoryUpsertRequestSchema>;

export const MemoryListResponseSchema = z.object({
  facts: z.array(MemoryFactSchema)
}).strict();
export type MemoryListResponse = z.infer<typeof MemoryListResponseSchema>;

export const MemoryDeleteResponseSchema = z.object({
  memoryId: z.string().min(1),
  deleted: z.boolean()
}).strict();
export type MemoryDeleteResponse = z.infer<typeof MemoryDeleteResponseSchema>;
```

- [ ] **Step 4: Run shared-schema tests and typecheck**

Run:

```bash
pnpm --filter @openharness/shared-schema test -- schema
pnpm --filter @openharness/shared-schema typecheck
```

Expected: PASS.

## Task 2: Runtime Memory API Routes

**Files:**
- Create: `agent-runtime/test/memoryApi.test.ts`
- Modify: `agent-runtime/src/server.ts`

- [ ] **Step 1: Write failing runtime API tests**

Create `agent-runtime/test/memoryApi.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { createServer } from "../src/server";
import { InMemoryHistoryStore } from "../src/history";
import { InMemoryMemoryStore } from "../src/memoryStore";
import type { CatalogResponse, ModelChatRequest, ToolCallRequest, TraceEvent } from "../src/types";
import type { JavaClient, PolicyEvaluateRequest, PolicyEvaluateResponse } from "../src/javaClient";

class RecordingJavaClient implements JavaClient {
  calls = { catalog: 0, chat: 0, executeTool: 0, postTrace: 0, evaluatePolicy: 0 };

  async getCatalog(): Promise<CatalogResponse> {
    this.calls.catalog++;
    return { catalogVersion: "v1", catalogHash: "h1", tools: [] };
  }

  async chat(_request: ModelChatRequest) {
    this.calls.chat++;
    return {
      requestId: "req",
      conversationId: "conv",
      rawProvider: "mock",
      message: { role: "assistant", content: "ok" as string }
    };
  }

  async executeTool(_request: ToolCallRequest) {
    this.calls.executeTool++;
    return {
      requestId: "req",
      conversationId: "conv",
      toolCallId: "call",
      toolName: "tool",
      status: "ok" as const,
      result: {}
    };
  }

  async postTrace(_e: TraceEvent) {
    this.calls.postTrace++;
  }

  async evaluatePolicy(_req: PolicyEvaluateRequest): Promise<PolicyEvaluateResponse> {
    this.calls.evaluatePolicy++;
    return { requestId: "req", conversationId: "conv", decisions: [] };
  }
}

describe("Memory Management API", () => {
  it("upserts and lists memory facts using header-derived scope", async () => {
    const memoryStore = new InMemoryMemoryStore();
    const app = await createServer({ javaClient: new RecordingJavaClient(), disableMcp: true, memoryStore });

    const upsert = await app.inject({
      method: "PUT",
      url: "/api/v1/memory/facts",
      headers: { "x-tenant-id": "tenant-a", "x-user-id": "user-a" },
      payload: { content: "User prefers TypeScript examples.", tags: ["preference", "code"] }
    });

    expect(upsert.statusCode).toBe(200);
    const fact = upsert.json();
    expect(fact.tenantId).toBe("tenant-a");
    expect(fact.userId).toBe("user-a");
    expect(fact.content).toBe("User prefers TypeScript examples.");

    const listed = await app.inject({
      method: "GET",
      url: "/api/v1/memory/facts",
      headers: { "x-tenant-id": "tenant-a", "x-user-id": "user-a" }
    });

    expect(listed.statusCode).toBe(200);
    expect(listed.json().facts.map((f: { memoryId: string }) => f.memoryId)).toEqual([fact.memoryId]);
  });

  it("searches scoped memory facts with literal query and tags", async () => {
    const memoryStore = new InMemoryMemoryStore();
    await memoryStore.upsert({
      memoryId: "mem-1",
      tenantId: "tenant-a",
      userId: "user-a",
      content: "User likes PostgreSQL examples.",
      tags: ["database", "preference"]
    });
    await memoryStore.upsert({
      memoryId: "mem-2",
      tenantId: "tenant-a",
      userId: "user-b",
      content: "User likes PostgreSQL examples.",
      tags: ["database"]
    });
    const app = await createServer({ javaClient: new RecordingJavaClient(), disableMcp: true, memoryStore });

    const res = await app.inject({
      method: "GET",
      url: "/api/v1/memory/facts?query=postgres&tags=preference",
      headers: { "x-tenant-id": "tenant-a", "x-user-id": "user-a" }
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().facts.map((f: { memoryId: string }) => f.memoryId)).toEqual(["mem-1"]);
  });

  it("updates and deletes only facts in the caller scope", async () => {
    const memoryStore = new InMemoryMemoryStore();
    await memoryStore.upsert({ memoryId: "mem-1", tenantId: "tenant-a", userId: "user-a", content: "old", tags: [] });
    await memoryStore.upsert({ memoryId: "mem-1", tenantId: "tenant-a", userId: "user-b", content: "other", tags: [] });
    const app = await createServer({ javaClient: new RecordingJavaClient(), disableMcp: true, memoryStore });

    const update = await app.inject({
      method: "PUT",
      url: "/api/v1/memory/facts",
      headers: { "x-tenant-id": "tenant-a", "x-user-id": "user-a" },
      payload: { memoryId: "mem-1", content: "new", tags: ["current"] }
    });
    expect(update.statusCode).toBe(200);
    expect(update.json().content).toBe("new");

    const del = await app.inject({
      method: "DELETE",
      url: "/api/v1/memory/facts/mem-1",
      headers: { "x-tenant-id": "tenant-a", "x-user-id": "user-a" }
    });
    expect(del.statusCode).toBe(200);
    expect(del.json()).toEqual({ memoryId: "mem-1", deleted: true });

    expect(await memoryStore.list("tenant-a", "user-a")).toEqual([]);
    expect((await memoryStore.list("tenant-a", "user-b"))[0]?.content).toBe("other");
  });

  it("returns structured not-found evidence for missing scoped delete", async () => {
    const app = await createServer({
      javaClient: new RecordingJavaClient(),
      disableMcp: true,
      memoryStore: new InMemoryMemoryStore()
    });

    const res = await app.inject({
      method: "DELETE",
      url: "/api/v1/memory/facts/missing",
      headers: { "x-tenant-id": "tenant-a", "x-user-id": "user-a" }
    });

    expect(res.statusCode).toBe(404);
    expect(res.json()).toEqual({ memoryId: "missing", deleted: false });
  });

  it("rejects client-controlled scope and leaves history and Java untouched", async () => {
    const javaClient = new RecordingJavaClient();
    const history = new InMemoryHistoryStore();
    const app = await createServer({
      javaClient,
      disableMcp: true,
      memoryStore: new InMemoryMemoryStore(),
      historyStore: history
    });

    const res = await app.inject({
      method: "PUT",
      url: "/api/v1/memory/facts",
      headers: { "x-tenant-id": "tenant-a", "x-user-id": "user-a" },
      payload: { tenantId: "tenant-b", userId: "user-b", content: "bad", tags: [] }
    });

    expect(res.statusCode).toBe(400);
    expect(history.get("tenant-a", "conv-any")).toEqual([]);
    expect(javaClient.calls).toEqual({ catalog: 0, chat: 0, executeTool: 0, postTrace: 0, evaluatePolicy: 0 });
  });
});
```

- [ ] **Step 2: Run runtime API tests and verify RED**

Run:

```bash
pnpm --filter @openharness/agent-runtime test -- memoryApi
```

Expected: FAIL because `CreateServerOptions` does not yet accept `memoryStore`/`historyStore` and routes do not exist.

- [ ] **Step 3: Add server dependencies and imports**

In `agent-runtime/src/server.ts`:

```ts
import {
  MemoryDeleteResponseSchema,
  MemoryListResponseSchema,
  MemorySearchQuerySchema,
  MemoryUpsertRequestSchema
} from "@openharness/shared-schema";
import { JsonFileMemoryStore, type MemoryStore } from "./memoryStore";
import type { HistoryStore } from "./history";
```

Extend `CreateServerOptions`:

```ts
  /** Optional history store, primarily for API tests and controlled runtime wiring. */
  historyStore?: HistoryStore;
  /** Optional memory store for memory management routes and memory retrieval. */
  memoryStore?: MemoryStore;
```

Change store construction:

```ts
  const history = options.historyStore ?? createHistoryStore();
  const memoryStore = options.memoryStore ?? new JsonFileMemoryStore();
```

Change runner construction:

```ts
  const runner = new AgentExecutionRunner(javaClient, history, mcpRegistry, runtimeEventStore, executionStateStore, approvalStore, memoryStore);
```

- [ ] **Step 4: Add memory management routes**

Insert before the Sessions API section in `agent-runtime/src/server.ts`:

```ts
  // ── Memory Management API ──────────────────────────────────────────────────

  app.get<{
    Querystring: { query?: string; tags?: string | string[] };
  }>("/api/v1/memory/facts", async (request, reply) => {
    const tenantId = header(request.headers["x-tenant-id"]) ?? "tenant-001";
    const userId = header(request.headers["x-user-id"]) ?? "user-001";
    const tags = parseTags(request.query.tags);
    const query = request.query.query ?? "";
    const parsed = MemorySearchQuerySchema.parse({ query, tags });
    const facts = parsed.query.length > 0 || parsed.tags.length > 0
      ? await memoryStore.search(tenantId, userId, parsed.query, parsed.tags)
      : await memoryStore.list(tenantId, userId);
    reply.send(MemoryListResponseSchema.parse({ facts }));
  });

  app.put("/api/v1/memory/facts", async (request, reply) => {
    const tenantId = header(request.headers["x-tenant-id"]) ?? "tenant-001";
    const userId = header(request.headers["x-user-id"]) ?? "user-001";
    const parsed = MemoryUpsertRequestSchema.parse(request.body);
    const fact = await memoryStore.upsert({
      memoryId: parsed.memoryId,
      tenantId,
      userId,
      agentId: parsed.agentId,
      content: parsed.content,
      tags: parsed.tags
    });
    reply.send(fact);
  });

  app.delete<{ Params: { memoryId: string } }>("/api/v1/memory/facts/:memoryId", async (request, reply) => {
    const tenantId = header(request.headers["x-tenant-id"]) ?? "tenant-001";
    const userId = header(request.headers["x-user-id"]) ?? "user-001";
    const { memoryId } = request.params;
    const deleted = await memoryStore.delete(tenantId, userId, memoryId);
    const body = MemoryDeleteResponseSchema.parse({ memoryId, deleted });
    if (!deleted) {
      reply.status(404).send(body);
      return;
    }
    reply.send(body);
  });
```

Add helper after `header()`:

```ts
function parseTags(value: string | string[] | undefined): string[] {
  if (value === undefined) return [];
  const values = Array.isArray(value) ? value : [value];
  return values.flatMap((item) => item.split(",")).map((item) => item.trim()).filter((item) => item.length > 0);
}
```

- [ ] **Step 5: Run runtime API tests and fix minimal compile issues**

Run:

```bash
pnpm --filter @openharness/agent-runtime test -- memoryApi
pnpm --filter @openharness/agent-runtime typecheck
```

Expected: PASS. If Fastify returns 500 for schema parse errors, add minimal `try/catch` around memory route parsing to return `reply.status(400).send({ error: { errorClass: "INVALID_MEMORY_REQUEST", errorMessage: "Invalid memory request" } })`, then re-run.

## Task 3: Targeted Regression and OpenSpec Task Updates

**Files:**
- Modify: `openspec/changes/add-p5c-memory-management-api/tasks.md`

- [ ] **Step 1: Run targeted package tests**

Run:

```bash
pnpm --filter @openharness/shared-schema test -- schema
pnpm --filter @openharness/agent-runtime test -- memoryApi memoryStore agentExecutionRunner
```

Expected: PASS.

- [ ] **Step 2: Update OpenSpec task checklist**

In `openspec/changes/add-p5c-memory-management-api/tasks.md`, mark completed implementation items `1.1` through `3.3` as `- [x]` only after the targeted and full verification commands have passed. Keep `3.4` unchecked until archive completes.

- [ ] **Step 3: Validate active change**

Run:

```bash
npx openspec validate add-p5c-memory-management-api --strict --no-interactive
```

Expected: `Change 'add-p5c-memory-management-api' is valid`.

## Task 4: Full Verification and Archive

**Files:**
- OpenSpec archive path produced by CLI: `openspec/changes/archive/2026-06-05-add-p5c-memory-management-api/`

- [ ] **Step 1: Run full verification**

Run:

```bash
pnpm typecheck
pnpm test
mvn test
npx openspec validate --all --strict --no-interactive
```

Expected:
- `pnpm typecheck`: exit 0
- `pnpm test`: exit 0
- `mvn test`: `BUILD SUCCESS`
- OpenSpec validation: all specs/changes pass

- [ ] **Step 2: Archive the approved and implemented change**

Run:

```bash
npx openspec archive add-p5c-memory-management-api --yes
```

Expected: change moves to `openspec/changes/archive/2026-06-05-add-p5c-memory-management-api/` and specs are updated.

- [ ] **Step 3: Validate after archive**

Run:

```bash
npx openspec validate --all --strict --no-interactive
npx openspec list
```

Expected:
- validation passes
- `npx openspec list` prints `No active changes found.`

## Self-Review

- Spec coverage: `long-term-memory` API list/search/upsert/delete/boundaries map to Task 2 tests/routes. `shared-schema` schemas map to Task 1 tests/exports. Verification/archive maps to Tasks 3 and 4.
- Placeholder scan: no `TBD`, deferred implementation, or unspecified validation steps remain.
- Type consistency: schema names in tests match planned exports; route payloads use existing `MemoryStore` methods and `MemoryFact` fields.
