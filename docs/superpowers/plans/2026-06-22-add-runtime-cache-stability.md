# Runtime Cache Stability Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Address prompt cache stability, dynamic visibility, and static system prompt alignment within the OpenHarness runtime, ensuring a stable prefix matching rate (target 90%+) and preventing memory/persistence leaks.

**Architecture:** 
1. **Rolling Double Buffer Caching**: Refactor `cacheHints.ts` to compute two eligible breakpoints instead of one under `double` or `adaptive` strategies, yielding fallback buffer security.
2. **Double Path Context Injection**: Inject dynamic variables (`[session context]`) at both `agentLoop.ts` and `agentExecutionRunner.ts` entry points as transient assistant/user-synthetic messages to freeze the global system prompt.
3. **Persistence Isolation**: Filter out messages marked with `transient: true` in `jsonFileHistoryStore.ts` read/write cycles to prevent obsolete session context leakage across process boundaries.
4. **Memory Leak Safeguards & Test Isolation**: Bound static session locks in `toolRegistry.ts` to a maximum of 500 active sessions (FIFO eviction), and isolate Vitest test instances using `localEntries` when running under test runner environments.

**Tech Stack:** TypeScript, Fastify, Vitest, pnpm workspace, OpenSpec.

---

## Approved Change Contract

- OpenSpec change: `openspec/changes/add-runtime-cache-stability/`
- Proposal: `openspec/changes/add-runtime-cache-stability/proposal.md`
- Design: `openspec/changes/add-runtime-cache-stability/design.md`
- Tasks: `openspec/changes/add-runtime-cache-stability/tasks.md`

## File Structure

- Modify: `agent-runtime/src/cacheHints.ts`
  - Implement rolling double buffer strategy support (`off | single | double | adaptive`).
- Modify: `agent-runtime/src/toolRegistry.ts`
  - Maintain static session catalog freeze with a 500-session FIFO capacity check.
  - Implement `process.env.VITEST` runtime local entries fallback.
- Modify: `agent-runtime/src/contextBuilder.ts`
  - Remove dynamic variable inclusion from global System Prompts.
- Modify: `agent-runtime/src/prompts/registry.ts`
  - Provide `injectSessionContextIfNeeded` helper to build user-synthetic system context message.
- Modify: `agent-runtime/src/agentLoop.ts` & `agent-runtime/src/agentExecutionRunner.ts`
  - Hook context injection before prompt assembly.
- Modify: `agent-runtime/src/jsonFileHistoryStore.ts`
  - Prevent serialization/deserialization of `transient: true` messages.

---

### Task 1: Refactor Prompt cache markers & strategy
- [x] **Step 1.1**: Update `cacheHints.ts` to process `cacheStrategy` configurations and compute two distinct markers when executing `double` or adaptive threshold paths.
- [x] **Step 1.2**: Write target tests validating index computation of the dual buffer markers.

### Task 2: Freeze System Prompt & Inject Transient Context
- [x] **Step 2.1**: Extract date, directory, and workspace variables out of global system templates in `contextBuilder.ts` and `prompts/registry.ts`.
- [x] **Step 2.2**: Integrate `injectSessionContextIfNeeded` into both execution path loops (`agentLoop.ts` and `agentExecutionRunner.ts`).
- [x] **Step 2.3**: Exclude `transient: true` messages from `jsonFileHistoryStore.ts` file storage.

### Task 3: Lock Tools Catalog & Limit Memory Footprint
- [x] **Step 3.1**: Implement static `entries` in `toolRegistry.ts` with FIFO eviction mechanism limiting catalog history to 500 active sessions.
- [x] **Step 3.2**: Resolve testing environmental pollution using instances-isolated `localEntries` when `VITEST === "true"`.

### Task 4: Spec Scope Alignment & Verification
- [x] **Step 4.1**: Remove Provider Message Capabilities gate tasks and defer to subsequent OpenSpec iterations.
- [x] **Step 4.2**: Verify runtime tests: `pnpm --filter @openharness/agent-runtime test` passes successfully.
- [x] **Step 4.3**: Confirm OpenSpec conformity: `npx openspec validate add-runtime-cache-stability --strict --no-interactive` passes validation.
