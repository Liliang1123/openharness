# MCP Stable-Schema Broker Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace model-visible MCP schema merging with one stable `mcp_call` bridge, isolated per-server virtual Skills, and lazy idle-reaped MCP processes while preserving Runtime policy and qualification behavior.

**Architecture:** `McpRegistry` becomes the single owner of configured descriptors, per-server startup/cache state, virtual Skill materialization, target validation, and idle lifecycle. `ToolRegistry` exposes one reserved bridge instead of discovered tools. Parent and forked child execution share a broker envelope and call the same registry API; all ordinary tools keep their existing Java route.

**Tech Stack:** TypeScript 5.8, Node.js, MCP SDK 1.29, Vitest 3, Fastify, OpenSpec, pnpm workspace.

---

## File Map

- `agent-runtime/src/mcpRegistry.ts`: config validation, server descriptors, lazy lifecycle, cached definitions, virtual Skills, broker target validation, direct qualification execution.
- `agent-runtime/src/toolRegistry.ts`: constant bridge definition, reserved-name gate, source map.
- `agent-runtime/src/agentExecutionRunner.ts`: async virtual Skill resolution and parent broker routing.
- `agent-runtime/src/agentLoop.ts`: compatibility loop virtual Skill and broker routing.
- `agent-runtime/src/subagent/dispatcher.ts`: narrow Runtime child executor and server restriction for virtual MCP Skills.
- `agent-runtime/src/baseline/formalSoakExecution.ts`: Gate D approval expectations and broker environment.
- `agent-runtime/src/baseline/formalSoakRuntimeChild.ts`: Gate D qualification readiness check.
- `agent-runtime/test/mcpRegistry.test.ts`: config, lazy startup, virtual Skill, idle reaper, exact-target and restart behavior.
- `agent-runtime/test/toolRegistryMerge.test.ts`: stable bridge schema, zero-config and reserved-name behavior.
- `agent-runtime/test/mcpRouting.test.ts`: parent and legacy loop broker route behavior.
- `agent-runtime/test/subagentDispatcher.test.ts`: isolated child broker routing and cross-server denial.
- `agent-runtime/test/agentExecutionRunner.test.ts`: virtual Skill resolution and untrusted broker result behavior.
- `agent-runtime/test/mcpRequireApproval.test.ts`: `mcp:broker` opt-in approval behavior.
- `agent-runtime/test/formalSoakExecution.test.ts`: Gate D broker fixture contract.
- `docs/architecture/agent-runtime-v1-production-runbook.md`: config and Agent Definition migration.
- OpenSpec, dashboard, and Review artifacts: governance and evidence only.

### Task 1: Registry configuration and lazy lifecycle

**Files:**
- Modify: `agent-runtime/test/mcpRegistry.test.ts`
- Modify: `agent-runtime/src/mcpRegistry.ts`

- [x] **Step 1: Write failing config and zero-start tests**

Add cases showing `description` and positive `idleTimeoutMs` are normalized, invalid values fail, `init()` registers without creating clients, and `hasConfiguredServers()` reports only configuration presence. Use an injected client factory that records server names and returns a test client with `connect`, `listTools`, `callTool`, and `close` seams.

- [x] **Step 2: Run RED**

Run: `pnpm --filter @openharness/agent-runtime test -- test/mcpRegistry.test.ts`

Expected: FAIL because config fields, factory injection, descriptors, and lazy behavior do not exist.

- [x] **Step 3: Implement minimal config and lazy state**

Introduce explicit record states `stopped | starting | ready | failed`, cached `tools`, `lastUsedAt`, and optional `startPromise`. `init()` creates records only. A private `ensureStarted(name)` validates the server, shares `startPromise`, connects, lists tools once, caches normalized definitions, and records a bounded failure. Do not schedule automatic retries.

- [x] **Step 4: Run GREEN**

Run the focused command from Step 2 and require zero failures.

- [x] **Step 5: Write failing idle/restart/shutdown tests**

Cover `reapIdleServers(now)`, default 300,000 ms, per-server override, close/clear cache, later restart, active server retention, and shutdown closing clients and clearing records/timer.

- [x] **Step 6: Run RED, implement, then run GREEN**

Use an injectable `now` function and timer factory or a public deterministic reaper seam. Timer must be `unref()`-safe. Run the focused test before and after implementation and record both outcomes.

### Task 2: Virtual MCP Skills and exact target validation

**Files:**
- Modify: `agent-runtime/test/mcpRegistry.test.ts`
- Modify: `agent-runtime/src/mcpRegistry.ts`
- Modify: `agent-runtime/src/skills/types.ts` only if a typed virtual source marker is required.

- [x] **Step 1: Write failing virtual Skill tests**

Specify `getVirtualSkill("mcp:filesystem")` returning a `fork_agent: true` Skill with `tools_required: ["mcp_call"]`, configured/default description, normalized JSON tool catalog, and no environment values. Unknown names must not start any server.

- [x] **Step 2: Run RED**

Run the focused registry test and confirm failure is the missing virtual Skill API.

- [x] **Step 3: Implement minimal virtual Skill materialization**

Build deterministic instructions from cached definitions after `ensureStarted`. Never interpolate config `env`, command, arguments, or raw transport errors. Sort tools by name for deterministic tests.

- [x] **Step 4: Write failing target tests and implement exact validation**

Add cases for configured server, advertised tool, invalid envelope, missing tool, and optional `restrictedServer`. Implement `executeBroker({server, tool, arguments}, request, {signal, restrictedServer})`; it validates before delegating to preserved `execute(server, tool, ...)`.

- [x] **Step 5: Run GREEN and registry regression**

Run: `pnpm --filter @openharness/agent-runtime test -- test/mcpRegistry.test.ts test/toolQualificationMatrix.test.ts`

Expected: all selected tests pass and direct qualification calls still work.

### Task 3: Constant ToolRegistry bridge

**Files:**
- Modify: `agent-runtime/test/toolRegistryMerge.test.ts`
- Modify: `agent-runtime/src/toolRegistry.ts`

- [x] **Step 1: Replace direct-merge expectations with failing stable-schema tests**

Assert zero config adds no bridge; one or many servers add exactly one `mcp_call`; its parameters require `server`, `tool`, and `arguments`; `refreshToolDefinitions()` is not called; direct MCP names are absent; source is `mcp:broker`; Java `mcp_call` collision rejects catalog freezing.

- [x] **Step 2: Run RED**

Run: `pnpm --filter @openharness/agent-runtime test -- test/toolRegistryMerge.test.ts`

Expected: former direct-merge behavior fails the new assertions.

- [x] **Step 3: Implement the constant bridge**

Use `mcpRegistry.hasConfiguredServers()` only; do not start or discover a server. Add a module constant `MCP_CALL_TOOL` with sensitive permission and stable object schema. Throw a bounded reserved-name error when necessary.

- [x] **Step 4: Run GREEN and approval focus**

Run: `pnpm --filter @openharness/agent-runtime test -- test/toolRegistryMerge.test.ts test/mcpRequireApproval.test.ts`

Expected: all selected tests pass and `mcp:broker` is recognized by existing approval upgrade logic.

### Task 4: Parent Runtime and compatibility loop broker routing

**Files:**
- Modify: `agent-runtime/test/mcpRouting.test.ts`
- Modify: `agent-runtime/test/agentExecutionRunner.test.ts`
- Modify: `agent-runtime/src/agentExecutionRunner.ts`
- Modify: `agent-runtime/src/agentLoop.ts`

- [x] **Step 1: Write failing parent and legacy routing tests**

Model calls `mcp_call` with the broker envelope. Assert registry receives exact server/tool/arguments and abort signal, Java execute is not called, success is wrapped as untrusted output, and invalid/failed targets produce existing Runtime terminal behavior.

- [x] **Step 2: Run RED**

Run: `pnpm --filter @openharness/agent-runtime test -- test/mcpRouting.test.ts test/agentExecutionRunner.test.ts`

Expected: calls currently pass bridge args as a direct MCP tool or route to Java.

- [x] **Step 3: Implement shared parent routing semantics**

For source `mcp:broker`, call `executeBroker(args, request, {signal})`; keep result tool name `mcp_call`, add bounded trace attributes `mcpServer`/`mcpTool`, and use untrusted provenance. Never emit full broker arguments.

- [x] **Step 4: Add async virtual Skill resolution**

In `invoke_skill`, resolve `mcp:` names through `McpRegistry.getVirtualSkill()` and all other names through the existing injected/disk loader. Preserve filesystem Skill tests and error mapping.

- [x] **Step 5: Run GREEN**

Run the focused command from Step 2 plus `test/mcpRequireApproval.test.ts` and require zero failures.

### Task 5: Isolated subagent broker execution

**Files:**
- Modify: `agent-runtime/test/subagentDispatcher.test.ts`
- Modify: `agent-runtime/src/subagent/dispatcher.ts`
- Modify: `agent-runtime/test/agentExecutionRunner.test.ts`
- Modify: `agent-runtime/src/agentExecutionRunner.ts`

- [x] **Step 1: Write failing isolation tests**

For a virtual MCP Skill, assert child tools contain only `mcp_call`, successful broker calls use the Runtime executor rather than Java, and a different `server` is denied before execution. For ordinary forked Skills, assert existing child Java routing remains unchanged.

- [x] **Step 2: Run RED**

Run: `pnpm --filter @openharness/agent-runtime test -- test/subagentDispatcher.test.ts test/agentExecutionRunner.test.ts`

Expected: current dispatcher sends `mcp_call` to Java and has no target restriction.

- [x] **Step 3: Add a narrow child executor contract**

Extend `SubagentRunInput` with an optional Runtime tool executor and a `restrictedMcpServer`. Derive child tools from `skill.metadata.tools_required` plus forbidden/privileged filtering. For `mcp_call`, invoke the Runtime executor only after policy ALLOW and exact server restriction validation; all other tools continue through Java.

- [x] **Step 4: Preserve fail-closed approval semantics**

Pass child source map `mcp_call -> mcp:broker` into `beforeToolUse`. If policy returns `REQUIRE_APPROVAL`, the isolated child must not execute and returns the existing policy terminal result; nested ask-user orchestration is not invented in this change. The parent direct broker path retains the full existing approval workflow.

- [x] **Step 5: Run GREEN and refactor**

Run the focused command from Step 2. Remove duplication only after green, then rerun it.

### Task 6: Gate D fixture and operator documentation migration

**Files:**
- Modify: `agent-runtime/test/formalSoakExecution.test.ts`
- Modify: `agent-runtime/src/baseline/formalSoakExecution.ts`
- Modify: `agent-runtime/src/baseline/formalSoakRuntimeChild.ts`
- Modify: `docs/architecture/agent-runtime-v1-production-runbook.md`

- [x] **Step 1: Write failing Gate D broker assertions**

The deterministic model fixture must emit `mcp_call` with `{server:"qualification",tool:"qualification_echo",arguments:{...}}`; the approval oracle must bind the nested target; readiness must use configured-server/target discovery APIs without restoring global direct schemas.

- [x] **Step 2: Run RED**

Run: `pnpm --filter @openharness/agent-runtime test -- test/formalSoakExecution.test.ts test/formalSoakRunner.test.ts test/formalSoakCli.test.ts`

Expected: current fixture still expects `qualification_echo` directly.

- [x] **Step 3: Implement fixture migration and documentation**

Update only deterministic fixture/preflight code. Document `description`, `idleTimeoutMs`, virtual Skill naming, the `invoke_skill`/`mcp_call` Agent Definition allow-list, direct-name removal, and that no formal Gate D run occurred.

- [x] **Step 4: Run GREEN without starting Gate D**

Run the focused Vitest command only. Do not invoke `qualification:gate-d-run` or a real model.

### Task 7: Full verification, Review, and dashboard closeout

**Files:**
- Modify: `openspec/changes/add-mcp-stable-schema-broker/tasks.md`
- Modify: `docs/project-dashboard/development-log.json`
- Generate: `docs/project-dashboard/development-log.md`
- Generate: `docs/project-dashboard/index.html`
- Create: `docs/review/2026-07-15-mcp-stable-schema-broker-implementation-review.md`

- [x] **Step 1: Run focused and full Runtime evidence**

Run:

```bash
pnpm --filter @openharness/agent-runtime test -- test/mcpRegistry.test.ts test/toolRegistryMerge.test.ts test/mcpRouting.test.ts test/subagentDispatcher.test.ts test/agentExecutionRunner.test.ts test/mcpRequireApproval.test.ts test/formalSoakExecution.test.ts test/productionServerLifecycle.test.ts
pnpm --filter @openharness/agent-runtime test
pnpm --filter @openharness/agent-runtime typecheck
```

- [x] **Step 2: Run workspace evidence**

Run `pnpm test && pnpm typecheck`. Do not call a real model and do not run formal Gate D.

- [x] **Step 3: Run governance and hygiene evidence**

Run:

```bash
npx openspec validate add-mcp-stable-schema-broker --strict --no-interactive
npx openspec validate --all --strict --no-interactive
node docs/project-dashboard/scripts/render-dashboard.mjs
pnpm dashboard:check
git diff --check
```

Search the changed MCP/Review artifacts for credential values and accidental `env` interpolation; record commands and observed counts without printing secrets.

- [x] **Step 4: Complete distinct implementation Review**

Review the actual complete diff against proposal, design, tasks, and test evidence. Record `结论`, `Review 范围`, severity findings, executable recommendations, and future gates. Fix every actionable Critical/Important finding and rerun the critical tests before final Review PASS.

- [x] **Step 5: Reconcile state**

Only after fresh PASS evidence, check completed OpenSpec tasks, set dashboard entry to `verified`, add exact implementation/test files and verification results, render/check again, and keep archive/commit/push/cleanup unexecuted.

## Plan Self-Review

- Spec coverage: every modified/added MCP requirement maps to Tasks 1–6 and final evidence maps to Task 7.
- Placeholder scan: no implementation step delegates unspecified error handling or testing; each behavior has a target file and command.
- Type consistency: `mcp_call`, `mcp:broker`, `getVirtualSkill`, `executeBroker`, `restrictedServer`, `idleTimeoutMs`, and `reapIdleServers(now)` remain consistent across tasks.
- Scope: no real provider call, formal Gate D execution, archive, commit, push, or worktree cleanup.
