# Agent Runtime Read-Path Contention Recovery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. 本计划由当前 Codex 窗口串行执行，禁止 dispatch subagent，禁止 Git 暂存、提交、推送或合并。

**Goal:** 在不改变 API、schema、durable replay、scope、workload 或 Gate D 阈值的前提下，移除 SQLite 纯读 adapter 的写锁获取，并让 session progress 只读取目标 execution 的 durable events，恢复成熟数据库上的 admission/replay 延迟。

**Architecture:** 继续保持所有 lifecycle mutation 使用 `database.transaction()` / `BEGIN IMMEDIATE`；所有同步纯读 repository 调用直接使用 `RuntimeDatabase` 已暴露的 `get/all`。为内部 `RuntimeEventReader` 增加按 execution 读取方法：显式 executionId 时读取该 execution，未提供时读取当前 scope 最后一条 durable event 所属 execution。Session detail 和 sync response 使用该方法，SSE cursor replay 继续使用完整 `since()`。

**Tech Stack:** TypeScript、Fastify、better-sqlite3、Vitest、OpenSpec。

---

## Gate 1

- **Evidence gathered:** Attempt 004 完成 120/120 样本，唯一 hard failure 为 admission sustained breach；admission/replay correlation `0.902`，admission/database-size correlation `0.740`，admission/oracle correlation `-0.526`。成熟 SQLite 上当前 session read chain 为 624 events + 104 messages，median/p95 `1.751/2.011ms`；只读取最近 execution 的 12 events 时为 `0.187/0.234ms`。
- **Root cause candidate:** session detail 在每个 poll 中同步读取并 JSON decode 整个 conversation event history，随后只保留最新 execution；同时所有 reader 通过 `BEGIN IMMEDIATE` 获取单写锁。两个成本随持续 workload 叠加并阻塞同一 Node event loop。
- **Approved contract:** [active agent-runtime delta](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/openspec/changes/harden-agent-runtime-single-node-production/specs/agent-runtime/spec.md) 要求 lifecycle writes 使用 Unit of Work / `BEGIN IMMEDIATE`，但不要求纯读获取写锁；session progress 与 durable replay scope/顺序语义保持不变。
- **Evidence profile:** strict。
- **Rollback:** 本切片只修改下列 TypeScript source/tests/docs；若行为或短回归不满足门槛，保留失败 evidence 并用精确反向 patch 撤销本切片 source/test，不触碰既有修复、OpenSpec、dashboard 或历史 evidence。
- **Stop condition:** 任一 RED 不能证明目标缺口、跨 tenant/user scope 失败、完整 SSE replay 被改写、写 adapter 不再使用 transaction、session/runtimeProgress payload 改变、SQLite schema/index 被修改、或成熟库短回归没有 material improvement，立即停止进入新的根因诊断，不执行 Attempt 005。

## Task 1：纯读 adapter 不再进入写事务

**Files:**

- Modify: [sqliteRuntimeAdapters.ts](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/agent-runtime/src/storage/sqliteRuntimeAdapters.ts)
- Modify: [sqliteRuntimeAdapters.test.ts](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/agent-runtime/test/sqliteRuntimeAdapters.test.ts)

- [ ] **Step 1: 写 RED 测试**

在真实临时 SQLite 上完成 seed 后 spy `database.transaction`，依次调用：

```ts
context.history.get(...)
await context.history.list(...)
await context.memory.list(...)
await context.memory.search(...)
context.executions.get(...)
context.executions.getActive(...)
context.approvals.get(...)
context.approvals.listPending(...)
context.events.since(...)
context.events.latestEventId(...)
context.events.hasEvent(...)
```

断言纯读集合不调用 `database.transaction`；另用独立测试断言 `history.append/replace/delete` 与 `memory.upsert/delete` 仍调用 transaction。

- [ ] **Step 2: 运行 RED**

Run:

```bash
pnpm --dir agent-runtime test -- sqliteRuntimeAdapters.test.ts
```

Expected: FAIL，纯读集合观察到一个或多个 transaction；既有 scope 行为测试仍通过。

- [ ] **Step 3: 最小 GREEN 实现**

将纯读 adapter 从：

```ts
database.transaction(tx => repositories.<store>.<read>(tx, ...))
```

改为：

```ts
repositories.<store>.<read>(database, ...)
```

写 adapter 保持原 transaction boundary。events 的 cursor lookup 与 replay 保持同一同步 call stack，禁止加入 await、fallback、cache 或第二连接。

- [ ] **Step 4: 运行 GREEN**

Run:

```bash
pnpm --dir agent-runtime test -- sqliteRuntimeAdapters.test.ts sqliteRuntimeEventStore.test.ts sqliteHistoryStore.test.ts
pnpm --dir agent-runtime typecheck
```

Expected: PASS；纯读 transaction count 为 0，写操作仍进入 transaction，类型检查通过。

## Task 2：Session progress 只读取目标 execution events

**Files:**

- Modify: [runtimeEventStore.ts](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/agent-runtime/src/runtimeEventStore.ts)
- Modify: [sqliteRuntimeEventStore.ts](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/agent-runtime/src/storage/sqliteRuntimeEventStore.ts)
- Modify: [sqliteRuntimeAdapters.ts](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/agent-runtime/src/storage/sqliteRuntimeAdapters.ts)
- Modify: [server.ts](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/agent-runtime/src/server.ts)
- Modify: [runtimeEventStore.test.ts](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/agent-runtime/test/runtimeEventStore.test.ts)
- Modify: [sqliteRuntimeEventStore.test.ts](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/agent-runtime/test/sqliteRuntimeEventStore.test.ts)
- Modify: [sessionsApi.test.ts](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/agent-runtime/test/sessionsApi.test.ts)

- [ ] **Step 1: 写 RED 测试**

覆盖以下行为：

1. session detail 的 Counting store 断言 `sinceCalls === 0`，并通过预置的按 execution reader 返回最新 execution events；
2. 同一 conversation 两个 terminal executions 时，未指定 executionId 返回后一 execution 的全部有序 events；
3. 指定 active executionId 时，即使它不是最后一条 event 所属 execution，也只返回显式 execution；
4. 相同 conversationId 的跨 user/tenant events 永远不返回；
5. SSE `since()` 既有完整 cursor replay 测试不变。

- [ ] **Step 2: 运行 RED**

Run:

```bash
pnpm --dir agent-runtime test -- sessionsApi.test.ts runtimeEventStore.test.ts sqliteRuntimeEventStore.test.ts
```

Expected: FAIL，session detail 仍调用完整 `since()`，且内部 reader 尚无按 execution 能力。

- [ ] **Step 3: 最小 GREEN 实现**

为 `RuntimeEventReader` 增加：

```ts
forExecution(
  tenantId: string,
  userId: string,
  conversationId: string,
  executionId?: string
): SessionEvent[];
```

语义：

- 显式 `executionId`：返回完整 owner scope 中该 execution 的有序 events；
- 未提供：先按 scoped cursor 取得最后 event 的 executionId，再返回该 execution events；
- 无 event 或跨 scope：返回 `[]`。

SQLite repository 使用 scoped SQL，并继续按 cursor ASC；只 decode 返回 execution 的 payload。In-memory store 用相同 owner scope/filter 语义。`GET /api/v1/sessions/:conversationId` 将 `active?.executionId` 传入；同步 chat response 传入当前 executionId。完整 SSE cursor replay、latestEventId 与 hasEvent 不改。

- [ ] **Step 4: 运行 GREEN**

Run:

```bash
pnpm --dir agent-runtime test -- sessionsApi.test.ts runtimeEventStore.test.ts sqliteRuntimeEventStore.test.ts sqliteRuntimeAdapters.test.ts streamEventIds.test.ts
pnpm --dir agent-runtime typecheck
```

Expected: PASS；runtimeProgress payload、消息完整性、scope isolation 与 SSE replay 保持。

## Task 3：切片验证与成熟库短回归资格

**Files:**

- Create only if execution is authorized by prior steps: [short-regression evidence directory](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/docs/verification/agent-runtime-v1/gate-d/performance-recovery/gate-r5-20260724-001/)
- Create: [implementation Review](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/docs/review/2026-07-24-agent-runtime-read-path-contention-recovery-implementation-review.md)

- [ ] **Step 1: 受影响与全量验证**

Run:

```bash
pnpm --dir agent-runtime test
pnpm --dir agent-runtime typecheck
pnpm test
pnpm typecheck
mvn -f backend/pom.xml test
pnpm --dir integration-tests test
npx openspec validate harden-agent-runtime-single-node-production --strict --no-interactive
pnpm dashboard:check
git diff --check
```

Expected: 全部 PASS。已有最新且未被本切片影响的 Java/integration evidence 可用于中途切片判断，但 Attempt 005 前的最终矩阵必须按此列表刷新。

- [ ] **Step 2: High Review**

Review 必须检查：

- 纯读与写 transaction boundary；
- `forExecution` 的 owner scope、latest/explicit execution 语义；
- session detail 与 sync response production wiring；
- 完整 SSE replay 未变；
- 无 schema/index、API、OpenSpec、dashboard、workload/threshold 变更；
- diff 无 credential、临时 profile、debug logging 或无关编辑。

- [ ] **Step 3: 成熟数据库短回归**

仅在 implementation Review PASS 后：

1. 用 `mktemp -d /private/tmp/openharness-gate-r5.XXXXXX` 创建精确临时目录；
2. 用 APFS clone 复制 Attempt 004 SQLite main file，禁止再次打开原 evidence；
3. 使用当前源码、真实本地 Java Gateway、固定 service auth 与原 10,000 scopes / concurrency 20 / 60-20-15-5 workload，在 clone 上运行 10 分钟、30 秒采样；不 seed、不改正式 runner/threshold；
4. 输出独立 report/journal 到上方 `gate-r5-20260724-001`，记录 source hash、clone source hash、20 samples、admission/replay、RSS/FD/WAL/outbox/oracle、process cleanup 与 credential negative scan；
5. 关闭全部进程后仅删除通过 prefix 验证的 `/private/tmp/openharness-gate-r5.*` 临时 clone，项目 evidence 保留。

Attempt 005 资格：

- 20/20 samples，无 correctness/readiness/process/credential hard failure；
- admission p95 median ≤100ms，超过 100ms 的最长连续样本不超过 2；
- replay p95 median ≤250ms，超过 250ms 的最长连续样本不超过 2；
- 相对 Attempt 004 末四分位 admission median `182.760ms` 至少改善 30%；
- 没有通过降低 workload、禁用 outbox/oracle、修改 threshold 或清空成熟数据取得结果。

未满足任一项：结论为 FAIL，停止 Attempt 005，保留 evidence 并重新诊断。

## 完成边界

本计划 PASS 只授权 Attempt 005；不等于 `local_verified`，不勾选 OpenSpec 4.2/4.3/4.5/4.6/5.2/5.3/5.4，不同步 dashboard，不归档 change，不授权正式 24 小时 Gate D 或 production promotion。
