# Skill Invocation Sandbox Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Establish the Skill Invocation Sandbox in the TS runtime. Provide a robust parser for skills markdown files, implement the `invoke_skill` metadata tool injection on TS runtime layer, run deferred dual-message injections or fallback user-tagged envelope injections based on target model capabilities, and perform best-effort shredding on commercial skill files.

**Architecture:**
1. **Entry Alignment**: Focus implementation on `AgentExecutionRunner.ts` (the HTTP/SSE main execution path) and keep `AgentLoop.ts` aligned.
2. **Metadata Tool Injection**: Intercept `getFrozenCatalog` in `toolRegistry.ts` to dynamically append the `invoke_skill` schema to `mergedTools`.
3. **TS-side Capabilities Mapping**: Match model names (e.g., `claude-3-5-sonnet`) with their alternating roles support, allow `AgentDefinition.metadata` overrides, and fallback conservatively to single-user message envelopes if capability is unknown.
4. **Best-Effort Shredding**: Overwrite target paths 3 times using pseudorandom/zero bytes, trigger `fsync`, truncate to 0, and `unlink` paths.

**Tech Stack:** TypeScript, Fastify, Vitest, pnpm workspace, OpenSpec.

---

## Approved Change Contract

- OpenSpec change: `openspec/changes/add-skill-invocation-sandbox/`
- Proposal: `openspec/changes/add-skill-invocation-sandbox/proposal.md`
- Design: `openspec/changes/add-skill-invocation-sandbox/design.md`
- Tasks: `openspec/changes/add-skill-invocation-sandbox/tasks.md`

## File Structure

- Modify: `agent-runtime/src/toolRegistry.ts`
  - Append `invoke_skill` schema dynamically to outgoing Catalog response.
- Modify: `agent-runtime/src/agentExecutionRunner.ts` & `agent-runtime/src/agentLoop.ts`
  - Intercept `invoke_skill` tool requests.
  - Delay instruction injection until observer flush stage.
- Create: `agent-runtime/src/skills/types.ts`
  - Define interfaces `SkillMetadata`, `Skill`, `PendingInjection`, and `ProviderMessageCapabilities`.
- Create: `agent-runtime/src/skills/loader.ts`
  - Parse frontmatter YAML and markdown steps.
- Create: `agent-runtime/src/skills/shredder.ts`
  - Overwrite files 3 times, sync, truncate, and delete.

---

### Task 1: TDD tests for loader, shredder, and schema
- [x] **Step 1.1**: Create `agent-runtime/test/skills/loader.test.ts` to test parser correctness.
- [x] **Step 1.2**: Create `agent-runtime/test/skills/shredder.test.ts` to test file content override and delete behavior.
- [x] **Step 1.3**: Add test in `agent-runtime/test/toolRegistryMerge.test.ts` to verify `invoke_skill` is appended to the model-visible schema.

### Task 2: Implement Tool Schema append, loader, and shredder
- [x] **Step 2.1**: Define interfaces in `agent-runtime/src/skills/types.ts`.
- [x] **Step 2.2**: Implement markdown yaml extractor in `agent-runtime/src/skills/loader.ts`.
- [x] **Step 2.3**: Implement physical overwriter in `agent-runtime/src/skills/shredder.ts`.
- [x] **Step 2.4**: Inject `invoke_skill` definition into `ToolRegistry.ts:getFrozenCatalog()`.

### Task 3: Implement Deferred Injection & Alternating Roles
- [x] **Step 3.1**: Implement matching and metadata parsing for `ProviderMessageCapabilities` in TS.
- [x] **Step 3.2**: Modify `AgentExecutionRunner.ts` (and `AgentLoop.ts`) to intercept `invoke_skill` and schedule injection before LLM calls.
- [x] **Step 3.3**: Ensure correct role layout (synthetic assistant + user vs single user envelop) is chosen based on matched capabilities.

### Task 4: Complete Verification
- [x] **Step 4.1**: Verify tests: `pnpm --filter @openharness/agent-runtime test` passes 100% green.
- [x] **Step 4.2**: Verify OpenSpec change validity: `npx openspec validate add-skill-invocation-sandbox --strict --no-interactive`.
