# Agent Runtime Main Stream Admission Recovery Plan

> **执行约束：** 当前 Codex 窗口串行执行；禁止 subagent、Git 暂存/提交/推送/合并。继续使用 active OpenSpec change `harden-agent-runtime-single-node-production`，不新增 API、schema、workload 或阈值。

**Goal:** 让 main SSE stream 的 HTTP admission 只包含 durable execution start，并只 drain 当前 execution 的 buffered events，移除成熟 conversation 全量 replay 成本。

**Architecture:** `runner.start()` 先同步创建 durable execution；随后发送并显式 flush `200 text/event-stream` headers；再 subscribe 当前 conversation 并通过 `forExecution(..., handle.executionId)` drain 当前 execution 已提交 events。独立 session events SSE 继续负责完整 cursor replay。

## Gate 1

- **Evidence:** [Attempt002 Result Review](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/docs/review/2026-07-24-agent-runtime-10m-mature-database-regression-attempt-002-result-review.md) 已确认 20/20 correctness 通过，但 admission median `137.242ms`、连续超限 20；admission/replay correlation `0.9917`。
- **Root cause candidate:** [AgentStreamLoop](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/agent-runtime/src/agentStreamLoop.ts) 对 main stream 调用完整 `since(..., null)` 后才按 execution 过滤，且 headers 未显式 flush。
- **Contract:** main stream 只发送当前 execution；完整 conversation cursor replay 由 session events SSE 保持。
- **Evidence profile:** strict。
- **Rollback:** 仅反向 patch 本计划列出的 source/test；保留所有失败 evidence。
- **Stop condition:** durable start 不在 header flush 前完成、current execution buffered events 丢失/重复、session events replay 被修改、scope isolation 失败，或成熟库短回归仍未达到原资格。

## Task 1：用 RED 固化 admission 与 replay 边界

**Files:**

- Create: [agentStreamLoop.test.ts](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/agent-runtime/test/agentStreamLoop.test.ts)

- [ ] 构造 counting `RuntimeEventStore`、同步写入当前 execution buffered events 的 fake runner 和可观察 `writeHead/flushHeaders/write/end` 的 fake reply。
- [ ] 断言：
  - `runner.start` 先于 `writeHead/flushHeaders`；
  - `flushHeaders` 先于 buffered-event drain；
  - main stream `sinceCalls === 0`；
  - `forExecution` 只调用一次且传入 `handle.executionId`；
  - 历史 execution events 不进入响应，当前 execution 的 `agent_start`、`stream_done` 顺序保持。
- [ ] Run：`pnpm --dir agent-runtime test -- agentStreamLoop.test.ts`
- [ ] Expected：现有实现因没有 flush、调用 `since()` 且 writeHead 早于 start 而 FAIL。

## Task 2：最小 GREEN

**Files:**

- Modify: [agentStreamLoop.ts](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/agent-runtime/src/agentStreamLoop.ts)
- Modify: [agentStreamLoop.test.ts](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/agent-runtime/test/agentStreamLoop.test.ts)

- [ ] 将 `runner.start(input)` 移到 header commit 前；start 返回后写入 SSE headers 并调用 `reply.raw.flushHeaders()`。
- [ ] subscribe 仍先于 drain；drain 改为 `runtimeEventStore.forExecution(..., handle.executionId)`。
- [ ] 不修改 `GET /api/v1/sessions/:conversationId/events` 的 `since()` cursor replay。
- [ ] Run：
  - `pnpm --dir agent-runtime test -- agentStreamLoop.test.ts detachedStream.test.ts streamEventIds.test.ts sessionEventsApi.test.ts`
  - `pnpm --dir agent-runtime typecheck`
- [ ] Expected：PASS。

## Task 3：验证与 Implementation Review

- [ ] Run：
  - `pnpm test`
  - `pnpm typecheck`
  - `mvn -f backend/pom.xml test`
  - `npx openspec validate harden-agent-runtime-single-node-production --strict --no-interactive`
  - `pnpm dashboard:check`
  - `git diff --check`
- [ ] 运行 production server + real SQLite 的双 execution 业务探针，验证 main stream 当前 execution、session full replay、跨 user 404 与 durable terminal。
- [ ] 落盘 Review：
  [Implementation Review](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/docs/review/2026-07-24-agent-runtime-stream-admission-recovery-implementation-review.md)。

## Task 4：成熟库短回归

- [ ] 仅在 Implementation Review 通过后，创建 fresh APFS clone 和新 run ID；runner 固定从 [agent-runtime 工作目录](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/agent-runtime/) 启动。
- [ ] 使用相同真实 Java、固定 MCP、10,000 scopes、concurrency 20、60-20-15-5 workload、原阈值、outbox 与增量 oracle，运行 10 分钟/20 样本。
- [ ] 资格保持不变：
  - 20/20，无 correctness/readiness/process/credential hard failure；
  - admission median `<=100ms` 且连续超限 `<=2`；
  - replay median `<=250ms` 且连续超限 `<=2`；
  - 相对 Attempt004 末四分位 `182.760ms` 改善至少 30%。
- [ ] 失败则停止 Attempt005；通过只授权 Attempt005 plan/preflight，不等于正式 Gate D 或 production promotion。

## 完成边界

不勾选 OpenSpec 4.2/4.3/4.5/4.6/5.2/5.3/5.4，不同步 Dashboard，不归档 change，不批准正式 24 小时 Gate D。
