# Prompt Registry Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add versioned system prompt assets owned by TS Runtime and attach prompt metadata to model calls.

**Architecture:** Shared schema defines prompt templates and metadata. TS Runtime resolves `OPENHARNESS_PROMPT_REF` through an in-code registry, prepends the system prompt to ContextBuilder-selected messages, and sends `meta.promptId/promptVersion` to Java. History remains free of injected prompts.

**Tech Stack:** TypeScript, Zod, Vitest, OpenSpec, pnpm workspace.

---

### Task 1: Schema
- [ ] Add failing shared-schema tests for `PromptTemplateSchema` and model `meta.promptId/promptVersion`.
- [ ] Implement schema and run `pnpm --filter @openharness/shared-schema test`.

### Task 2: Prompt Registry
- [ ] Add failing tests for default prompt resolution, env prompt ref resolution, and unknown prompt failure.
- [ ] Implement `agent-runtime/src/prompts/registry.ts`.
- [ ] Run `pnpm --filter @openharness/agent-runtime test -- promptRegistry`.

### Task 3: Runner Integration
- [ ] Add failing runner test for first `system` message, prompt metadata, and no history pollution.
- [ ] Wire `AgentExecutionRunner` and `AgentLoop` to prepend prompted context.
- [ ] Run `pnpm --filter @openharness/agent-runtime test -- agentExecutionRunner promptRegistry`.

### Task 4: Docs and Archive
- [ ] Update prompt docs and OpenSpec tasks.
- [ ] Run `pnpm typecheck`, `pnpm test`, `mvn test`, and `npx openspec validate --all --strict --no-interactive`.
- [ ] Archive with `npx openspec archive add-p4b-prompt-registry --yes`.
