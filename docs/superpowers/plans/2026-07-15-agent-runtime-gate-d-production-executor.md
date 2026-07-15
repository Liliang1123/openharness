# Agent Runtime Gate D Production Executor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans` to implement this plan task-by-task. This repository session does not authorize subagents or Git publication. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 补齐正式 Gate D 24 小时 deterministic production soak 的可执行 supervisor、真实 TS Runtime 进程重启、并发工作负载、主动预检和可审计 partial/final evidence；本计划只使执行器达到 `preflight_ready`，不授权启动 24 小时生产负载。

**Architecture:** 一个独立 Gate D supervisor CLI 管理真实 production Runtime 子进程，Java Gateway 始终由 operator 独立保持运行。Supervisor 在计时前通过 Runtime 公共 HTTP API seed 10,000 conversations，随后维持 20 个 worker 并按固定 60/20/15/5 operation kind 循环；另一个独立的 30 秒 sampler 采集 latency、RSS、FD、WAL、SQLite integrity、event/order/scope 与 child/process 状态。小时 2、12、22 只重启 Runtime child。每个 observation 先写 mode `0600` 的 append-only JSONL journal；hard failure 立即停止并以 no-overwrite 写 partial report，完整 PASS 才写 final report。

**Tech Stack:** TypeScript、Node child process/fetch/fs/statfs、Fastify production Runtime、SQLite read-only probe、Spring Boot deterministic mock fixtures、MCP stdio qualification fixture、Vitest、JUnit 5、OpenSpec strict validation。

**Design authority:** [approved OpenSpec design Decision 8/9](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/openspec/changes/harden-agent-runtime-single-node-production/design.md) 与 [agent-runtime fixed qualification delta](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/openspec/changes/harden-agent-runtime-single-node-production/specs/agent-runtime/spec.md)。本计划不增加新产品能力或放宽 oracle。

**Git boundary:** 不执行 `git add`、`git commit`、`git push`、破坏性 reset/clean 或 worktree 清理。

---

## File Map

- Modify [formalSoakRunner.ts](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/agent-runtime/src/baseline/formalSoakRunner.ts)：固定 schedule/oracle、sample checkpoint、hard-failure early stop。
- Create [formalSoakRuntimeChild.ts](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/agent-runtime/src/baseline/formalSoakRuntimeChild.ts)：仅供 Gate D 使用的 production Runtime child entrypoint；显式 MCP config，真实 SQLite authority 与 service auth。
- Create [formalSoakExecution.ts](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/agent-runtime/src/baseline/formalSoakExecution.ts)：child supervisor、seed/workers、approval/abort、metric/read-only DB probes、journal/report writer。
- Create [formalSoakCli.ts](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/agent-runtime/src/baseline/formalSoakCli.ts)：参数解析、approval/preflight artifact 验证、凭证边界、唯一入口与稳定退出码。
- Modify [mcpRegistry.ts](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/agent-runtime/src/mcpRegistry.ts)：增加显式 absolute config file loader，不改变默认 discovery。
- Modify [server.ts](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/agent-runtime/src/server.ts)：允许 production server 显式注入已初始化的 MCP registry，仅供受控 wiring 使用。
- Modify [MockModelService.java](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/backend/src/main/java/org/openharness/backend/service/MockModelService.java)：增加 deterministic `mcp-qualification-echo` fixture；不访问真实模型。
- Modify [agent-runtime package.json](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/agent-runtime/package.json)：增加 `qualification:gate-d-preflight` 与 `qualification:gate-d-run`，二者均由 approval artifact fail-closed。
- Modify [production runbook](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/docs/architecture/agent-runtime-v1-production-runbook.md)：记录 exact commands、artifact fields、stop/rollback、promotion boundary。
- Tests：[formalSoakRunner.test.ts](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/agent-runtime/test/formalSoakRunner.test.ts)、[formalSoakExecution.test.ts](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/agent-runtime/test/formalSoakExecution.test.ts)、[formalSoakCli.test.ts](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/agent-runtime/test/formalSoakCli.test.ts)、[ModelControllerTest.java](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/backend/src/test/java/org/openharness/backend/api/ModelControllerTest.java)。

## Task 1: Make The Fixed Runner Stop And Checkpoint Truthfully

- [x] **Step 1: write RED tests** in [formalSoakRunner.test.ts](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/agent-runtime/test/formalSoakRunner.test.ts) for these exact behaviors:

```ts
it("checkpoints every sample and stops immediately after a hard failure", async () => {
  const checkpoints: RuntimeBaselineReport[] = [];
  const report = await runFixedTwentyFourHourSoak(compressedConfig({
    onCheckpoint: value => checkpoints.push(value),
    sample: ({ sampleIndex, sampledAt }) => sample(sampledAt, {
      hardFailures: sampleIndex === 1 ? ["CROSS_SCOPE_LEAKAGE"] : []
    })
  }));
  expect(report.result).toBe("fail");
  expect(report.samples).toHaveLength(2);
  expect(checkpoints).toHaveLength(2);
});
```

Also prove a sustained threshold breach stops at the first five-minute-complete sample and a checkpoint callback failure becomes `EVIDENCE_CHECKPOINT_FAILURE`, never a production PASS.

- [x] **Step 2: observe RED.** Run:

```bash
pnpm --filter @openharness/agent-runtime test -- formalSoakRunner
```

Expected: FAIL because `onCheckpoint` is not accepted and the runner currently always executes all 2,880 samples.

- [x] **Step 3: implement minimum behavior** by adding:

```ts
onCheckpoint?: (report: RuntimeBaselineReport) => void | Promise<void>;
```

After each collected sample, build the current report, call `onCheckpoint`, and return immediately when the current report is `fail`. If checkpoint persistence throws, append a synthetic sample hard failure `EVIDENCE_CHECKPOINT_FAILURE`, build a FAIL report, and return it. Do not change fixed duration, interval, workload, restarts, thresholds, track rules, or compressed-test isolation.

- [x] **Step 4: observe GREEN.** Re-run focused tests and Agent Runtime typecheck.

## Task 2: Add The Deterministic MCP Model Fixture

- [x] **Step 1: write RED JUnit coverage** in [ModelControllerTest.java](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/backend/src/test/java/org/openharness/backend/api/ModelControllerTest.java): `X-Mock-Fixture=mcp-qualification-echo` returns exactly one tool call named `qualification_echo`; a request containing the resulting tool message returns a final assistant response and no second tool call.

- [x] **Step 2: observe RED.** Run:

```bash
mvn -f backend/pom.xml -Dtest=ModelControllerTest test
```

Expected: the first response has no `qualification_echo` tool call.

- [x] **Step 3: add one bounded branch** in [MockModelService.java](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/backend/src/main/java/org/openharness/backend/service/MockModelService.java):

```java
} else if ("mcp-qualification-echo".equals(fixtureName)) {
  message = new AgentMessage(
      "assistant", "",
      List.of(new ToolCall("call-mcp-qualification-echo", "qualification_echo", "{}")),
      null, null, null, null, null, null, null, null, null, null);
```

The existing `lastToolMessage` branch remains first so the second model step terminates. No Provider credential or network call is added.

- [x] **Step 4: observe GREEN.** Re-run focused JUnit.

## Task 3: Build An Explicit Production Runtime Child

- [x] **Step 1: write RED tests** in [formalSoakExecution.test.ts](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/agent-runtime/test/formalSoakExecution.test.ts) proving:

```ts
expect(() => loadMcpConfigFile("relative/mcp.json")).toThrow(/absolute/);
await expect(createGateDRuntimeChild({ mcpConfigPath: missing, ...valid })).rejects.toThrow(/MCP config/);
```

Also prove `createProductionServer` uses an injected registry and does not run default MCP discovery.

- [x] **Step 2: observe RED.** Run focused MCP/production lifecycle/new tests; expect missing exports.

- [x] **Step 3: implement explicit wiring.** Add `loadMcpConfigFile(absolutePath)` to [mcpRegistry.ts](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/agent-runtime/src/mcpRegistry.ts) with JSON parse and schema-shape validation. Extend `CreateProductionServerOptions` with `mcpRegistry?: McpRegistry` and pass it to `createServer`. [formalSoakRuntimeChild.ts](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/agent-runtime/src/baseline/formalSoakRuntimeChild.ts) SHALL:

```ts
const registry = new McpRegistry(loadMcpConfigFile(config.mcpConfigPath));
await registry.init();
const app = await createProductionServer({
  databasePath: config.databasePath,
  serviceToken: config.serviceToken,
  javaBaseUrl: config.javaBaseUrl,
  mcpRegistry: registry
});
await app.listen({ host: "127.0.0.1", port: config.port });
```

It accepts secrets only via environment, prints no config values, uses signal handlers to close exactly once, and exits non-zero on startup/reconciliation/MCP failure.

- [x] **Step 4: observe GREEN.** Run focused tests and typecheck.

## Task 4: Implement The Child Supervisor And Independent Sampler

- [x] **Step 1: write RED unit tests** for a dependency-injected `GateDRuntimeSupervisor`:

```ts
expect(supervisor.observedRestarts()).toEqual([2 * HOUR_MS, 12 * HOUR_MS, 22 * HOUR_MS]);
expect(events).toEqual(["start", "scheduled-stop", "start", "scheduled-stop", "start", "scheduled-stop", "start"]);
```

Required negative cases: child exits without a scheduled-stop marker; restart child fails readiness; Java health/catalog probe fails; PID changes are absent across scheduled restart; workload worker remains alive during restart; process RSS/FD probe targets the child PID rather than supervisor PID.

- [x] **Step 2: observe RED.** Run new focused tests; expect missing supervisor.

- [x] **Step 3: implement `GateDRuntimeSupervisor`.** It SHALL spawn the reviewed child command as an argv array without shell evaluation, capture redacted stdout/stderr into the journal, poll authenticated `GET /api/v1/sessions` until ready, distinguish scheduled from unexpected exits, require a new PID after each restart, and terminate the child on any stop condition. It SHALL never spawn or restart Java Gateway.

- [x] **Step 4: implement independent monitoring.** The sampler clock is monotonic and targets `start + n*30s`; it does not sleep for `30s + workload duration`. RSS and FD are measured for the active child PID; WAL bytes and SQLite integrity use a read-only database connection. Any failed probe produces a stable hard-failure code.

- [x] **Step 5: observe GREEN.** Run focused execution tests and typecheck.

## Task 5: Implement Seed, 20-Worker Load, Approval, And Isolation Probes

- [x] **Step 1: write RED tests** with a loopback Runtime fixture/transport for:

```ts
expect(maxObservedConcurrency).toBe(20);
expect(counts).toEqual({ no_tool: 6000, java_sandbox: 2000, mcp: 1500, approval_interruption: 500 });
expect(seedConversationCount).toBe(10_000);
```

Also prove same `conversationId` under different tenant/user scopes remains isolated; MCP operations approve exactly one pending `qualification_echo`; deterministic approval/interruption operations alternate approve/abort; scheduled Runtime restart does not replay the interrupted request; duplicate operation/event identity, wrong-scope visibility, terminal mismatch, orphaned approval, exhausted busy, or secret canary yields a stable hard failure.

- [x] **Step 2: observe RED.** Run focused execution tests; expect missing workload driver.

- [x] **Step 3: implement seed phase through public Runtime HTTP.** Before `generatedAt`, send one deterministic no-tool fixture request per 10,000 scoped conversations with at most 20 concurrent requests. Query the read-only DB/public sessions to prove the exact scoped conversation count before starting the 24-hour clock. Direct supervisor writes to production SQLite are forbidden.

- [x] **Step 4: implement 20 long-lived workers.** Workers round-robin the fixed workload operations until stopped. Fixture mapping is fixed:

```ts
const fixtureByKind = {
  no_tool: "gate-d-no-tool",
  java_sandbox: "tool-time",
  mcp: "mcp-qualification-echo",
  approval_interruption: "mcp-qualification-echo"
} as const;
```

For MCP, poll scoped session detail, approve the exact pending call, and await terminal completion. For `approval_interruption`, deterministically alternate approve/abort from operation index. Never use a real Provider or API-key/OAuth fallback.

- [x] **Step 5: implement metrics/oracles.** Maintain per-window admission and durable replay latency observations excluding model/tool time; use scoped session/SSE/read-only DB evidence for event ordering, duplicate identity, integrity, outbox/dead-letter, cross-scope and reconciliation. `collectRuntimeBaselineSample` remains the report normalizer.

- [x] **Step 6: observe GREEN.** Run focused tests and full Agent Runtime tests.

## Task 6: Add Fail-Closed Approval/Preflight CLI And Evidence Writers

- [x] **Step 1: write RED CLI tests** proving missing/expired/mismatched approval, absent Java/MCP/monitoring/interruption evidence, insufficient disk, pre-existing journal/report/partial target, unknown/duplicate flags, relative or escaping paths, service token in argv, and any configurable duration/interval/restart/threshold are rejected before child spawn.

- [x] **Step 2: define local artifact schemas** in [formalSoakCli.ts](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/agent-runtime/src/baseline/formalSoakCli.ts):

```ts
const GateDStartApprovalSchema = z.object({
  schemaVersion: z.literal(1),
  changeId: z.literal("harden-agent-runtime-single-node-production"),
  approved: z.literal(true),
  approvedBy: z.string().min(1),
  approvedAt: z.string().datetime(),
  runId: z.string().regex(/^[a-z0-9-]+$/),
  planSha256: z.string().regex(/^[a-f0-9]{64}$/),
  reason: z.string().min(1)
}).strict();
```

The approval binds the exact current Gate D plan SHA and runId. A changed plan/runId invalidates it. The CLI reads `OPENHARNESS_SERVICE_TOKEN` only after approval and preflight file validation; output/reviews never contain it.

- [x] **Step 3: implement active preflight.** Probe Java actuator health, Java catalog and all three mock fixtures, parse/init the explicit MCP qualification config, check `statfs` headroom (minimum 2 GiB and 10%), validate fixed report/journal/partial paths inside the canonical project root, prove monitoring/interruption evidence files exist, and confirm no target exists. Persist a no-overwrite mode `0600` preflight artifact with only redacted basenames/hashes/results.

- [x] **Step 4: implement append-only journal and report closeout.** Create JSONL journal with `wx`/`0600`, append every sample/restart/probe/stop observation with fsync, and never rewrite prior rows. On hard failure or operator interruption, write one schema-valid FAIL partial report with `wx`/`0600`; on full completion, write one final report with `wx`/`0600`. Existing target is always a hard stop.

- [x] **Step 5: add package scripts** to [package.json](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/agent-runtime/package.json):

```json
"qualification:gate-d-preflight": "tsx src/baseline/formalSoakCli.ts preflight",
"qualification:gate-d-run": "tsx src/baseline/formalSoakCli.ts run"
```

Preflight never starts a Runtime child. Run requires the immutable PASS preflight artifact plus matching approval artifact and rechecks environment/hash/path binding immediately before spawn.

- [x] **Step 6: observe GREEN.** Run focused CLI/execution/runner tests and typecheck.

## Task 7: Documentation, Preflight Evidence, And Strict Review

- [x] **Step 1: update the production runbook** with exact operator flow: start/verify Java Gateway; prepare fixed MCP config; choose runId and no-overwrite paths; generate approval only after explicit user authorization; run preflight; run formal workload; preserve journal/partial report; hash/final scan; request separate post-result promotion approval.

- [x] **Step 2: generate a local `preflight_ready` evidence packet only.** It SHALL contain focused/full test outputs, command hashes, plan/client source hashes, active probe results against local deterministic fixtures where safe, and an explicit statement that no 24-hour run or production promotion occurred.

- [x] **Step 3: strict implementation Review.** Review actual source/diff, process wiring, workload mix/count, 20-concurrency mechanism, child PID restarts, sample clock, journal durability, no-overwrite, approval binding, credentials, cross-scope/adversarial probes, and claim-to-mechanism trace. Any finding returns to the same task for fix -> verification -> Review.

- [x] **Step 4: final verification.** Run:

```bash
pnpm --filter @openharness/agent-runtime test -- formalSoakRunner formalSoakExecution formalSoakCli productionServerLifecycle mcpRegistry
pnpm --filter @openharness/agent-runtime test
pnpm --filter @openharness/agent-runtime typecheck
mvn -f backend/pom.xml -Dtest=ModelControllerTest test
mvn -f backend/pom.xml test
npx openspec validate harden-agent-runtime-single-node-production --strict --no-interactive
npx openspec validate --all --strict --no-interactive
node docs/project-dashboard/scripts/render-dashboard.mjs
pnpm dashboard:check
git diff --check
```

Run negative searches for secret/token/Authorization leakage, real Provider fallback, configurable thresholds/schedule, `delayMs` on production track, report overwrite, shell command interpolation, direct supervisor SQLite writes, in-process-only restart claims, and stale current spec links.

- [x] **Step 5: stop at the production authorization gate.** After Review PASS, report `preflight_ready`; do not check active OpenSpec tasks 4.2/4.3, do not mark Dashboard verified, and do not invoke `qualification:gate-d-run` until the user explicitly approves the exact runId/report paths/plan hash and 24-hour start.

## Stop Conditions

- Active OpenSpec design/spec or this plan requires a material revision.
- A test fails for an unexplained reason; switch to systematic debugging.
- Java Gateway, deterministic fixture, MCP child, disk, monitoring, interruption procedure, report/journal path, or approval binding is not provably ready.
- Any real model/provider call would be required; Gate D must remain deterministic and separate from Gate C.
- A process, SQLite, event/order/isolation, resource, secret, or evidence persistence hard failure is observed.
- User has not explicitly authorized the exact formal run.

## Rollback

Before any formal run, rollback is deletion/reversion of only the new executor code and local test artifacts through a reviewed non-destructive patch; production data is untouched. During/after a formal run, never delete or overwrite journal/partial/final evidence. Stop workers, terminate only the Runtime child, keep Java running for incident inspection, preserve SQLite/WAL/logs, and resume only with a new runId plus new explicit start approval.
