# Agent Definition Loader Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a JSON-first local Agent Definition Loader for TS Runtime with shared schema validation and default fallback.

**Architecture:** Define `AgentDefinitionSchema` in `@openharness/shared-schema`, then add a focused TS Runtime loader that reads `agent-runtime/agents/*.json`, validates definitions, indexes them by `agentId`, and returns a default definition when the directory is absent or empty. Runtime integration is intentionally minimal: `createServer()` accepts/initializes the registry so startup validates definitions without changing chat API, Java router behavior, SDK, UI, YAML support, or hot reload.

**Tech Stack:** TypeScript, Zod, Vitest, Node.js `fs`/`path`, pnpm workspace, OpenSpec.

---

## Files

- Modify: `packages/shared-schema/src/index.ts`
  - Add `AgentDefinitionSchema` and `AgentDefinition` export.
- Modify: `packages/shared-schema/test/schema.test.ts`
  - Add schema tests for valid/invalid definitions.
- Create: `agent-runtime/src/agentDefinitionLoader.ts`
  - Own default definition, registry type, JSON directory loading, duplicate detection, fail-closed parsing.
- Create: `agent-runtime/test/agentDefinitionLoader.test.ts`
  - Unit tests for fallback, success, malformed JSON, invalid schema, duplicate `agentId`.
- Modify: `agent-runtime/src/server.ts`
  - Add optional `agentDefinitionRegistry` and `agentDefinitionsDir` test hooks; initialize loader during server creation.
- Modify: `agent-runtime/test/agentRuntime.test.ts`
  - Add minimal server initialization tests proving missing/empty definitions do not break default behavior and malformed definitions fail startup.
- Modify: `openspec/changes/add-agent-definition-loader/tasks.md`
  - Mark tasks complete only after matching verification passes.

## Task 1: Shared Schema Contract

**Files:**
- Modify: `packages/shared-schema/src/index.ts`
- Modify: `packages/shared-schema/test/schema.test.ts`

- [ ] **Step 1: Write failing schema tests**

In `packages/shared-schema/test/schema.test.ts`, add `AgentDefinitionSchema` to the import list:

```ts
import {
  AgentDefinitionSchema,
  AgentMessageSchema,
  AskUserRequestSchema,
  ConversationLifecycleSchema,
  EvalCaseSchema,
  MemoryDeleteResponseSchema,
  MemoryFactSchema,
  MemoryListResponseSchema,
  MemorySearchQuerySchema,
  MemoryUpsertRequestSchema,
  ModelChatResponseSchema,
  ModelChatRequestSchema,
  ReviewPolicyEvaluateRequestSchema,
  PromptTemplateSchema,
  RuntimeEventKindSchema,
  SessionEventSchema,
  ToolCallRequestSchema,
  ToolDefinitionSchema,
  ToolCallResponseSchema,
  ToolCallSchema
} from "../src/index";
```

Add these tests inside `describe("shared schema", () => { ... })` after the prompt template test:

```ts
  it("parses agent definitions", () => {
    const parsed = AgentDefinitionSchema.parse({
      agentId: "default-agent",
      promptRef: "openharness-default@v1",
      tools: ["get_current_time", "echo"],
      model: "default"
    });

    expect(parsed.agentId).toBe("default-agent");
    expect(parsed.promptRef).toBe("openharness-default@v1");
    expect(parsed.tools).toEqual(["get_current_time", "echo"]);
    expect(parsed.model).toBe("default");
  });

  it("rejects invalid agent definitions", () => {
    expect(() =>
      AgentDefinitionSchema.parse({
        agentId: "bad space",
        promptRef: "openharness-default@v1",
        tools: []
      })
    ).toThrow();
    expect(() =>
      AgentDefinitionSchema.parse({
        agentId: "default-agent",
        promptRef: "openharness-default",
        tools: []
      })
    ).toThrow();
    expect(() =>
      AgentDefinitionSchema.parse({
        agentId: "default-agent",
        promptRef: "openharness-default@v1",
        tools: ["echo", "echo"]
      })
    ).toThrow();
  });
```

- [ ] **Step 2: Run schema tests and verify RED**

Run:

```bash
pnpm --filter @openharness/shared-schema test -- schema
```

Expected: FAIL because `AgentDefinitionSchema` is not exported.

- [ ] **Step 3: Add minimal schema implementation**

In `packages/shared-schema/src/index.ts`, add this block after `PromptTemplateSchema`:

```ts
const IdentifierSchema = z.string().regex(/^[a-zA-Z][a-zA-Z0-9_-]*$/);
const PromptRefSchema = z.string().regex(/^[a-zA-Z][a-zA-Z0-9_-]*@[a-zA-Z][a-zA-Z0-9_.-]*$/);
const ToolNameSchema = z.string().regex(/^[a-zA-Z][a-zA-Z0-9_.:-]*$/);

export const AgentDefinitionSchema = z
  .object({
    agentId: IdentifierSchema,
    promptRef: PromptRefSchema,
    tools: z.array(ToolNameSchema).default([]).refine((tools) => new Set(tools).size === tools.length, {
      message: "tools must be unique"
    }),
    model: z.string().min(1).optional()
  })
  .strict();
export type AgentDefinition = z.infer<typeof AgentDefinitionSchema>;
```

- [ ] **Step 4: Run schema tests and typecheck**

Run:

```bash
pnpm --filter @openharness/shared-schema test -- schema
pnpm --filter @openharness/shared-schema typecheck
```

Expected: PASS.

## Task 2: Agent Definition Loader

**Files:**
- Create: `agent-runtime/src/agentDefinitionLoader.ts`
- Create: `agent-runtime/test/agentDefinitionLoader.test.ts`

- [ ] **Step 1: Write failing loader tests**

Create `agent-runtime/test/agentDefinitionLoader.test.ts`:

```ts
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { DEFAULT_AGENT_DEFINITION, loadAgentDefinitions } from "../src/agentDefinitionLoader";

function tempDir(): string {
  return mkdtempSync(join(tmpdir(), "openharness-agent-definitions-"));
}

describe("Agent Definition Loader", () => {
  it("returns the default definition when the directory is missing", () => {
    const dir = join(tempDir(), "missing");

    const registry = loadAgentDefinitions(dir);

    expect(registry.get(DEFAULT_AGENT_DEFINITION.agentId)).toEqual(DEFAULT_AGENT_DEFINITION);
    expect(registry.list()).toEqual([DEFAULT_AGENT_DEFINITION]);
  });

  it("returns the default definition when the directory is empty", () => {
    const dir = tempDir();
    try {
      const registry = loadAgentDefinitions(dir);

      expect(registry.get(DEFAULT_AGENT_DEFINITION.agentId)).toEqual(DEFAULT_AGENT_DEFINITION);
      expect(registry.list()).toEqual([DEFAULT_AGENT_DEFINITION]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("loads valid JSON definitions by agentId", () => {
    const dir = tempDir();
    try {
      writeFileSync(join(dir, "support.json"), JSON.stringify({
        agentId: "support-agent",
        promptRef: "openharness-default@v1",
        tools: ["echo"],
        model: "default"
      }));

      const registry = loadAgentDefinitions(dir);

      expect(registry.get("support-agent")?.promptRef).toBe("openharness-default@v1");
      expect(registry.get("support-agent")?.tools).toEqual(["echo"]);
      expect(registry.list().map((definition) => definition.agentId)).toEqual(["support-agent"]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("ignores non-json files", () => {
    const dir = tempDir();
    try {
      writeFileSync(join(dir, "README.md"), "not a definition");

      const registry = loadAgentDefinitions(dir);

      expect(registry.list()).toEqual([DEFAULT_AGENT_DEFINITION]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("fails closed on malformed JSON", () => {
    const dir = tempDir();
    try {
      writeFileSync(join(dir, "bad.json"), "{\"agentId\":");

      expect(() => loadAgentDefinitions(dir)).toThrow(/Failed to parse agent definition/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("fails closed on invalid schema", () => {
    const dir = tempDir();
    try {
      writeFileSync(join(dir, "bad.json"), JSON.stringify({
        agentId: "bad space",
        promptRef: "openharness-default@v1",
        tools: []
      }));

      expect(() => loadAgentDefinitions(dir)).toThrow(/Invalid agent definition/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("fails closed on duplicate agentId", () => {
    const dir = tempDir();
    try {
      mkdirSync(join(dir, "nested"));
      writeFileSync(join(dir, "a.json"), JSON.stringify({
        agentId: "support-agent",
        promptRef: "openharness-default@v1",
        tools: []
      }));
      writeFileSync(join(dir, "b.json"), JSON.stringify({
        agentId: "support-agent",
        promptRef: "openharness-default@v1",
        tools: ["echo"]
      }));

      expect(() => loadAgentDefinitions(dir)).toThrow(/Duplicate agentId/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
```

- [ ] **Step 2: Run loader tests and verify RED**

Run:

```bash
pnpm --filter @openharness/agent-runtime test -- agentDefinitionLoader
```

Expected: FAIL because `agentDefinitionLoader.ts` does not exist.

- [ ] **Step 3: Add minimal loader implementation**

Create `agent-runtime/src/agentDefinitionLoader.ts`:

```ts
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { AgentDefinitionSchema, type AgentDefinition } from "@openharness/shared-schema";

export const DEFAULT_AGENT_DEFINITION: AgentDefinition = {
  agentId: "default-agent",
  promptRef: "openharness-default@v1",
  tools: [],
  model: "default"
};

export interface AgentDefinitionRegistry {
  get(agentId: string): AgentDefinition | undefined;
  list(): AgentDefinition[];
}

export class InMemoryAgentDefinitionRegistry implements AgentDefinitionRegistry {
  private readonly definitions = new Map<string, AgentDefinition>();

  constructor(definitions: AgentDefinition[]) {
    for (const definition of definitions) {
      if (this.definitions.has(definition.agentId)) {
        throw new Error(`Duplicate agentId: ${definition.agentId}`);
      }
      this.definitions.set(definition.agentId, definition);
    }
  }

  get(agentId: string): AgentDefinition | undefined {
    return this.definitions.get(agentId);
  }

  list(): AgentDefinition[] {
    return [...this.definitions.values()];
  }
}

export function loadAgentDefinitions(dir = join(process.cwd(), "agents")): AgentDefinitionRegistry {
  if (!existsSync(dir)) {
    return new InMemoryAgentDefinitionRegistry([DEFAULT_AGENT_DEFINITION]);
  }

  const files = readdirSync(dir)
    .map((name) => join(dir, name))
    .filter((path) => statSync(path).isFile() && path.endsWith(".json"))
    .sort();

  if (files.length === 0) {
    return new InMemoryAgentDefinitionRegistry([DEFAULT_AGENT_DEFINITION]);
  }

  const definitions = files.map((file) => readDefinitionFile(file));
  return new InMemoryAgentDefinitionRegistry(definitions);
}

function readDefinitionFile(file: string): AgentDefinition {
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(file, "utf-8"));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to parse agent definition ${file}: ${message}`);
  }

  const result = AgentDefinitionSchema.safeParse(parsed);
  if (!result.success) {
    throw new Error(`Invalid agent definition ${file}: ${result.error.message}`);
  }
  return result.data;
}
```

- [ ] **Step 4: Run loader tests and typecheck**

Run:

```bash
pnpm --filter @openharness/agent-runtime test -- agentDefinitionLoader
pnpm --filter @openharness/agent-runtime typecheck
```

Expected: PASS.

## Task 3: Runtime Initialization Integration

**Files:**
- Modify: `agent-runtime/src/server.ts`
- Modify: `agent-runtime/test/agentRuntime.test.ts`

- [ ] **Step 1: Write failing runtime initialization tests**

In `agent-runtime/test/agentRuntime.test.ts`, update the `node:fs` import to include `mkdtempSync`, `rmSync`, and `writeFileSync`; update the `node:path` import to include `join`; add `tmpdir` import if absent:

```ts
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
```

If the file already imports from these modules, merge these names into the existing imports instead of adding duplicates.

Add this helper near existing helpers:

```ts
function tempAgentDefinitionsDir(): string {
  return mkdtempSync(join(tmpdir(), "openharness-agent-runtime-definitions-"));
}
```

Add these tests inside `describe("agent runtime", () => { ... })`:

```ts
  it("starts with default agent definition when definitions directory is missing", async () => {
    const dir = join(tempAgentDefinitionsDir(), "missing");
    const app = await createServer({ javaClient: fakeJavaClient(), disableMcp: true, agentDefinitionsDir: dir });

    try {
      const response = await app.inject({
        method: "POST",
        url: "/api/v1/agent/chat",
        payload: { conversationId: "conv-agent-definition-default", message: "hello" }
      });

      expect(response.statusCode).toBe(200);
      expect(response.json().conversationId).toBe("conv-agent-definition-default");
    } finally {
      await app.close();
    }
  });

  it("fails startup on malformed agent definition", async () => {
    const dir = tempAgentDefinitionsDir();
    try {
      writeFileSync(join(dir, "bad.json"), "{\"agentId\":");

      await expect(createServer({ javaClient: fakeJavaClient(), disableMcp: true, agentDefinitionsDir: dir })).rejects.toThrow(/Failed to parse agent definition/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
```

Use the existing fake Java client helper in `agentRuntime.test.ts`. If it is named differently, call the existing helper that returns a Java client capable of answering a simple chat request.

- [ ] **Step 2: Run runtime test and verify RED**

Run:

```bash
pnpm --filter @openharness/agent-runtime test -- agentRuntime
```

Expected: FAIL TypeScript compile or runtime error because `agentDefinitionsDir` is not yet part of `CreateServerOptions`.

- [ ] **Step 3: Wire loader into server initialization**

In `agent-runtime/src/server.ts`, add import:

```ts
import { loadAgentDefinitions, type AgentDefinitionRegistry } from "./agentDefinitionLoader";
```

Add to `CreateServerOptions`:

```ts
  /** Optional preloaded agent definition registry for tests and future embedding. */
  agentDefinitionRegistry?: AgentDefinitionRegistry;
  /** Optional local agent definitions directory. Defaults to process cwd / agents. */
  agentDefinitionsDir?: string;
```

After `const askUserStore = new AskUserStore();`, add:

```ts
  const agentDefinitionRegistry = options.agentDefinitionRegistry ?? loadAgentDefinitions(options.agentDefinitionsDir);
  app.decorate("agentDefinitionRegistry", agentDefinitionRegistry);
```

This validates definitions during startup and keeps them available for later runtime selection without changing existing chat routes.

- [ ] **Step 4: Run runtime tests and typecheck**

Run:

```bash
pnpm --filter @openharness/agent-runtime test -- agentRuntime agentDefinitionLoader
pnpm --filter @openharness/agent-runtime typecheck
```

Expected: PASS.

## Task 4: Task Checklist and Active Change Validation

**Files:**
- Modify: `openspec/changes/add-agent-definition-loader/tasks.md`

- [ ] **Step 1: Mark completed implementation tasks**

After Tasks 1-3 pass targeted tests and typecheck, update `openspec/changes/add-agent-definition-loader/tasks.md`:

```md
## 1. Contract
- [x] 1.1 Add `AgentDefinitionSchema` and exported `AgentDefinition` type to shared schema.
- [x] 1.2 Add schema tests for valid definitions, invalid `agentId`, invalid `promptRef`, duplicate tools, and optional `model`.

## 2. Loader
- [x] 2.1 Add an Agent Definition Loader in the TS Runtime that reads JSON files from `agent-runtime/agents/`.
- [x] 2.2 Add a default definition when the directory is absent or empty.
- [x] 2.3 Fail closed for malformed JSON, invalid schema, and duplicate `agentId`.
- [x] 2.4 Add loader unit tests covering success, fallback, and failure paths.

## 3. Runtime Integration
- [x] 3.1 Wire the loader into runtime initialization without requiring Java Backend, Frontend, SDK, YAML, remote API, or hot reload.
- [x] 3.2 Add a minimal fixture definition under `agent-runtime/agents/` only if needed for tests or dev smoke.
- [x] 3.3 Add targeted runtime tests proving default behavior remains unchanged when no files are present.

## 4. Verification
- [ ] 4.1 Run targeted shared-schema and agent-runtime tests.
- [ ] 4.2 Run `pnpm typecheck`, `pnpm test`, `mvn test -f backend/pom.xml`, and `npx openspec validate --all --strict --no-interactive`.
- [ ] 4.3 Archive the OpenSpec change after implementation and verification are complete.
```

If no fixture file is created because all tests use temp directories, still mark 3.2 complete because the approved task says "only if needed" and no fixture was needed.

- [ ] **Step 2: Run active change validation**

Run:

```bash
npx openspec validate add-agent-definition-loader --strict --no-interactive
```

Expected: `Change 'add-agent-definition-loader' is valid`.

- [ ] **Step 3: Mark targeted verification complete**

After targeted tests from Tasks 1-3 and active change validation pass, mark task `4.1` complete in `openspec/changes/add-agent-definition-loader/tasks.md`.

## Task 5: Full Verification and Archive

**Files:**
- Modify: `openspec/changes/add-agent-definition-loader/tasks.md`
- Archive output: `openspec/changes/archive/YYYY-MM-DD-add-agent-definition-loader/`
- Modify after archive: archived `tasks.md` if `4.3` is still unchecked

- [ ] **Step 1: Run full verification**

Run:

```bash
pnpm typecheck
pnpm test
mvn test -f backend/pom.xml
npx openspec validate --all --strict --no-interactive
```

Expected:
- `pnpm typecheck`: exit 0.
- `pnpm test`: exit 0.
- `mvn test -f backend/pom.xml`: `BUILD SUCCESS`.
- OpenSpec validation: all specs/changes pass.

If `pnpm test` fails only because sandbox blocks local port listening with `listen EPERM`, rerun the same command with escalated sandbox permissions and record both the sandbox failure and the successful authorized run.

- [ ] **Step 2: Mark full verification complete**

Update `openspec/changes/add-agent-definition-loader/tasks.md` to mark `4.2` complete.

- [ ] **Step 3: Archive the change**

Run:

```bash
npx openspec archive add-agent-definition-loader --yes
```

Expected: change archives and `openspec/specs/agent-definition/spec.md` is created.

- [ ] **Step 4: Mark archive task complete if needed**

If archive warns that `4.3` was incomplete, update the archived checklist file:

```md
- [x] 4.3 Archive the OpenSpec change after implementation and verification are complete.
```

- [ ] **Step 5: Validate after archive**

Run:

```bash
npx openspec validate --all --strict --no-interactive
npx openspec list
```

Expected:
- validation passes.
- `npx openspec list` prints `No active changes found.`

## Step Evidence Gate Summary

For each implementation task, report:
- Step goal and allowed files.
- Code facts with `path:line` after reading current source.
- Positive checks: schema exists, loader imports schema, server initializes registry.
- Negative searches: no YAML parser dependency, no SDK package, no frontend UI, no remote CRUD route, no Java router change.
- Verification command output.
- Self-review: no scope drift into SDK/YAML/UI/router/policy enforcement.

## Self-Review

- Spec coverage:
  - Agent Definition Contract → Task 1.
  - Agent Definition Loader → Task 2.
  - Agent Definition Boundaries → Task 3 plus negative searches.
- Placeholder scan: no `TBD`, `TODO`, or unspecified implementation steps remain.
- Type consistency:
  - `AgentDefinitionSchema`, `AgentDefinition`, `AgentDefinitionRegistry`, `DEFAULT_AGENT_DEFINITION`, and `loadAgentDefinitions` are consistently named across tasks.
  - Runtime option names are consistently `agentDefinitionRegistry` and `agentDefinitionsDir`.
