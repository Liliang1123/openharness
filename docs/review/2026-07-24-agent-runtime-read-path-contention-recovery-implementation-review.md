# Agent Runtime Read-Path Contention Recovery Implementation Review

## 结论

**通过。** 两个 TDD 切片均按计划恢复内部读路径：11 个 scoped repository readers 不再进入 `BEGIN IMMEDIATE`，5 个 history/memory mutation adapters 仍保持 transaction；session detail 与同步 chat response 只读取目标 execution 的 durable events，完整 SSE cursor replay 仍使用 `since()`。跨 tenant/user、显式/最新 execution、event order、消息完整性与 production business chain 均通过。

本 Review 只授权执行成熟 4GB 数据库 clone 上的 10 分钟短回归；它不授权 Attempt 005、`local_verified`、正式 Gate D、dashboard 状态变更、OpenSpec 归档或 production promotion。

## Review 范围

- [实施计划](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/docs/superpowers/plans/2026-07-24-agent-runtime-read-path-contention-recovery.md)
- [计划 Preflight Review](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/docs/review/2026-07-24-agent-runtime-read-path-contention-recovery-plan-review.md)
- [Runtime event reader](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/agent-runtime/src/runtimeEventStore.ts)
- [SQLite Runtime event repository](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/agent-runtime/src/storage/sqliteRuntimeEventStore.ts)
- [SQLite Runtime adapters](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/agent-runtime/src/storage/sqliteRuntimeAdapters.ts)
- [server production wiring](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/agent-runtime/src/server.ts)
- [in-memory event tests](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/agent-runtime/test/runtimeEventStore.test.ts)
- [SQLite event tests](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/agent-runtime/test/sqliteRuntimeEventStore.test.ts)
- [adapter transaction tests](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/agent-runtime/test/sqliteRuntimeAdapters.test.ts)
- [session API tests](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/agent-runtime/test/sessionsApi.test.ts)
- [active OpenSpec agent-runtime delta](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/openspec/changes/harden-agent-runtime-single-node-production/specs/agent-runtime/spec.md)

## 主要发现

### Critical

无。

### Important

无未关闭项。

### 通过依据

1. [RuntimeEventReader](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/agent-runtime/src/runtimeEventStore.ts) 第 18–27 行新增内部 `forExecution` read contract；第 144–156 行的 in-memory 实现先取完整 `(tenantId,userId,conversationId)` bucket，再按显式或最新 executionId 过滤，不可能跨 owner scope。
2. [SQLite replayExecution](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/agent-runtime/src/storage/sqliteRuntimeEventStore.ts) 第 80–104 行的 latest-execution lookup 与 event query 都包含 tenant、user、conversation scope，结果固定 `ORDER BY cursor ASC`，只 decode 目标 execution payload。
3. [SQLite adapters](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/agent-runtime/src/storage/sqliteRuntimeAdapters.ts) 第 34、38、46–47、52–55、60–69、74–101 行的 reads 直接使用 `RuntimeDatabase.get/all` 能力；第 33、35、40、45、48 行的 history/memory writes 继续使用 `database.transaction()`。
4. `events.since()` 的 cursor lookup 与 replay 是同一同步 call stack；单 Runtime process 由 singleton lock fencing，better-sqlite3 调用不含 await，未引入跨调用 writer interleave。原实现本来也为每个 reader 建立独立 transaction，不提供跨 history/execution/approval/event 的统一 snapshot，因此此次没有降低既有 route-level一致性。
5. [session detail](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/agent-runtime/src/server.ts) 第 573–586 行把 persisted active executionId 传给 `forExecution`；无 active 时由最后 durable event 选择最近 execution。API 仍返回完整 `toApi(messages)` 与相同 `runtimeProgress` shape。
6. [sync response](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/agent-runtime/src/server.ts) 第 950–974 行按当前 executionId 读取 events，保留 answer、usage、trace event kind 与 stopReason 语义。
7. [session-events SSE](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/agent-runtime/src/server.ts) 第 458–466 行继续读取完整 scoped `since(null)`；cursor gap、replay-after、live subscription 与 terminal close 路径未改。
8. [production event-store wiring](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/agent-runtime/src/server.ts) 第 848–854 行同时保留 `since/latestEventId/hasEvent` 并接入 `forExecution`，没有用测试-only store 冒充生产行为。

### TDD 与验证证据

- Task 1 RED：`sqliteRuntimeAdapters.test.ts` 观察到 11 个纯读调用产生 11 次 transaction；写操作测试同时保持 5/5 transaction。
- Task 1 GREEN：3 files / 12 tests PASS；Runtime typecheck PASS。
- Task 2 RED：in-memory reader、SQLite repository 与 session route 三处分别按预期 FAIL（method missing、method missing、`sinceCalls` 为 1）。
- Task 2 GREEN：5 files / 39 tests PASS；Runtime typecheck PASS。
- workspace tests：shared schema 60、Agent Runtime 644、Frontend 24、Integration 17，共 745 tests PASS。
- workspace typecheck：shared schema、Agent Runtime、Frontend 全部 PASS。
- Java：`mvn -f backend/pom.xml test`，213 tests，0 failures，0 errors，BUILD SUCCESS。
- OpenSpec：`npx openspec validate harden-agent-runtime-single-node-production --strict --no-interactive` PASS。
- Dashboard：`pnpm dashboard:check` PASS，生成物 current。
- Diff：`git diff --check` PASS。
- 独立 production business-chain probe：真实临时 SQLite + production server 连续执行同一 conversation 两个 turns；session detail 返回 4 条 stable messages 和最新 completed progress；完整 durable replay 含 2 个 executions / 24 events，latest projection 为 12 events；跨 user GET 为 404，临时数据库与 lock 已清理。
- 负向搜索：本切片 source/tests 无 debugger、临时 console、Bearer、`OPENHARNESS_SERVICE_TOKEN` 或 `sk-` 残留。

### Advisory

1. 当前 SQLite `replayExecution` 没有新增 execution index；它可避免历史 payload decode，但仍可能扫描该 owner scope 的 event key range。该选择遵守本计划“不先扩 schema”的边界，必须由成熟库短回归决定是否足够。
2. session detail 按 contract 仍返回完整 stable messages；本切片不改变 session API 分页或 history retention。若短回归仍失败，不得在本 slice 追加分页或 schema，应重新进入 OpenSpec 边界判断。
3. session-events SSE 的 gap helper 仍存在一次既有完整 latest lookup；Gate D workload 不走该 SSE route，本切片也没有修改它。可作为非阻塞后续优化候选，但不能和当前 performance claim 混合。
4. Maven 首次验证命令因仓库没有 `./mvnw` 以 exit 127 失败；计划已修订并重新 Preflight，正确命令随后 213/213 PASS。该执行错误未产生源码或证据语义变化。

## 最终建议

按已批准计划创建新的 `gate-r5-20260724-001` 短回归 evidence。只从 Attempt 004 main SQLite 创建临时 APFS clone，禁止再次直接打开原 evidence；使用真实本地 Java、固定 service auth、10,000 scopes / concurrency 20 / 60-20-15-5 workload 运行 10 分钟并自然结束。

只有全部资格线满足，才为 Attempt 005 创建独立计划和 Preflight Review；任何 performance/correctness/readiness/credential/process failure 都必须保留 evidence 并回到诊断。

## 后续门禁

- **OpenSpec proposal：** 当前不需要新增；实现保持 active contract 的读等价语义。
- **Superpowers plan：** 当前 revision 已 Review 通过；短回归按原计划 Task 3 执行。
- **测试：** implementation tests 已通过；仍需成熟库 10 分钟真实短回归，之后才决定 Attempt 005。
- **人工审批：** 本地短回归使用用户既有全程授权；正式 24 小时 Gate D 与 post-result promotion 仍需独立门禁。
- **Dashboard：** 不修改，尚未达到 `verified`。
- **OpenSpec 状态：** change 保持 active，4.2/4.3/4.5/4.6/5.2/5.3/5.4 均不勾选。
- **项目规则：** 本 Review 未修改项目规则。
