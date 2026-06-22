# ContextBuilder Pipeline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a TS Runtime ContextBuilder that selects model-call messages through explicit layers, enforces a token budget, and reports selection metadata.

**Architecture:** `HistoryStore` remains the durable source of stable messages. `ContextBuilder` builds a model-call view from `compressed_summary` and `recent_messages` layers, then `AgentExecutionRunner` computes cache hints against that selected view. Shared schema accepts optional `meta.context` for cross-runtime observability.

**Tech Stack:** TypeScript, Zod, Vitest, OpenSpec, pnpm workspace.

---

### Task 1: Shared Schema Metadata

**Files:**
- Modify: `packages/shared-schema/src/index.ts`
- Modify: `packages/shared-schema/test/schema.test.ts`

- [ ] **Step 1: Add failing schema test**

Add a test that parses `ModelChatRequestSchema` with `meta.context` containing:

```ts
context: {
  builder: "default",
  selectedMessages: 3,
  estimatedTokens: 120,
  budgetTokens: 8000,
  layers: ["compressed_summary", "recent_messages"],
  truncated: true
}
```

Run: `pnpm --filter @openharness/shared-schema test`
Expected: FAIL because `ModelChatRequestMetaSchema` does not define `context`.

- [ ] **Step 2: Implement schema**

Add `ContextBuildMetaSchema` and optional `context` to `ModelChatRequestMetaSchema`.

- [ ] **Step 3: Verify shared schema**

Run: `pnpm --filter @openharness/shared-schema test`
Expected: PASS.

### Task 2: ContextBuilder Module

**Files:**
- Create: `agent-runtime/src/contextBuilder.ts`
- Create: `agent-runtime/test/contextBuilder.test.ts`

- [ ] **Step 1: Add failing tests**

Cover:
- compressed summary retained before recent messages
- oldest messages truncated under budget while chronological order remains stable
- newest oversized message is still included and marks `truncated: true`

Run: `pnpm --filter @openharness/agent-runtime test -- contextBuilder`
Expected: FAIL because module does not exist.

- [ ] **Step 2: Implement module**

Export:

```ts
export interface ContextBuildResult {
  messages: AgentMessage[];
  meta: {
    builder: "default";
    selectedMessages: number;
    estimatedTokens: number;
    budgetTokens: number;
    layers: string[];
    truncated: boolean;
  };
}

export function buildModelContext(messages: AgentMessage[], options?: { budgetTokens?: number }): ContextBuildResult;
```

Use `toModelMessages`, `stableHistory`, and `estimateTokens` helpers. Default budget reads `MODEL_CONTEXT_BUDGET_TOKENS` or `8000`.

- [ ] **Step 3: Verify ContextBuilder**

Run: `pnpm --filter @openharness/agent-runtime test -- contextBuilder`
Expected: PASS.

### Task 3: Cache Hints and Runner Integration

**Files:**
- Modify: `agent-runtime/src/agentExecutionRunner.ts`
- Modify: `agent-runtime/test/agentExecutionRunner.test.ts`
- Modify: `agent-runtime/test/cacheHints.test.ts`

- [ ] **Step 1: Add failing runner test**

Append older long messages to history, run a normal execution, and assert the first Java `chat` request:
- omits older messages due to a small `MODEL_CONTEXT_BUDGET_TOKENS`
- includes current user message
- has `meta.context.truncated === true`
- has `cacheHints` positions within selected messages

Run: `pnpm --filter @openharness/agent-runtime test -- agentExecutionRunner`
Expected: FAIL because runner still sends full history and no context metadata.

- [ ] **Step 2: Wire ContextBuilder**

In `AgentExecutionRunner.callModel()` replace direct `toModelMessages(history.get(...))` with `buildModelContext(history.get(...))`, compute hints from `context.messages`, and spread `context.meta` into `meta.context`.

- [ ] **Step 3: Verify runner**

Run: `pnpm --filter @openharness/agent-runtime test -- agentExecutionRunner cacheHints`
Expected: PASS.

### Task 4: Docs, OpenSpec Tasks, and Full Verification

**Files:**
- Modify: `CONTEXT.md`
- Modify: `docs/architecture/trace_schema.md`
- Modify: `openspec/changes/add-p4a-context-builder/tasks.md`

- [ ] **Step 1: Update docs**

Add ContextBuilder glossary terms and a short trace/schema note that model requests carry context selection metadata.

- [ ] **Step 2: Validate and test**

Run:

```bash
npx openspec validate add-p4a-context-builder --strict --no-interactive
pnpm --filter @openharness/shared-schema test
pnpm --filter @openharness/agent-runtime test
pnpm typecheck
pnpm test
mvn test
npx openspec validate --all --strict --no-interactive
```

Expected: all pass. OpenSpec telemetry DNS errors are non-blocking when exit code is 0.

- [ ] **Step 3: Archive**

Run:

```bash
npx openspec archive add-p4a-context-builder --yes
npx openspec validate --all --strict --no-interactive
```

Expected: archive succeeds and all specs validate.
