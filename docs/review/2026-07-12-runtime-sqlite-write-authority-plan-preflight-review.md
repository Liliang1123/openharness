# Runtime SQLite Write Authority Plan Preflight Review

## 结论

需修改：现有 Stage 0 OpenSpec 和 final plan 已授权 SQLite sole-write-authority 目标，但当前 wiring slice 不能按“为五个 store 加薄 adapter并接入 server”的简化方案实施。Legacy Runtime interfaces 与 SQLite ownership/transaction contract 不同：`HistoryStore` 不接收 `userId`，Runtime event retrieval 以 tenant/conversation 定位，execution user scope 仍可选；AgentExecutionRunner 又把 history、execution、approval 和 event mutations 分散调用。直接适配会弱化 tenant/user isolation，并无法保证 lifecycle Unit of Work。

因此 Plan/Brief Preflight 结果为 FAIL：生产代码不得开始，必须先把 existing Stage 0 plan 的该 slice 修订为 contract-first、Unit-of-Work-first 的 staged TDD sequence，再重新 Preflight Review。Live SQLite 保持 forward-fix-only，Runtime 保持停止。

## Review 范围

- [Runtime server](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/agent-runtime/src/server.ts)
- [Runtime entrypoint](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/agent-runtime/src/index.ts)
- [Agent execution runner](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/agent-runtime/src/agentExecutionRunner.ts)
- [History interface](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/agent-runtime/src/history.ts)
- [History factory](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/agent-runtime/src/historyFactory.ts)
- [Memory interface](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/agent-runtime/src/memoryStore.ts)
- [Approval interface](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/agent-runtime/src/approvalStore.ts)
- [Execution interface](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/agent-runtime/src/executionStateStore.ts)
- [Runtime-event interface](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/agent-runtime/src/runtimeEventStore.ts)
- [Runtime storage](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/agent-runtime/src/storage/runtimeStorage.ts)
- [SQLite repository bundle](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/agent-runtime/src/storage/sqliteRuntimeRepositories.ts)
- [Lifecycle commands](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/agent-runtime/src/storage/lifecycleCommands.ts)
- [Startup reconciliation](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/agent-runtime/src/storage/reconcile.ts)
- [Restart reconciliation tests](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/agent-runtime/test/restartReconciliation.test.ts)
- [Runtime storage tests](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/agent-runtime/test/runtimeStorage.test.ts)
- [Stage 0 final plan](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/docs/superpowers/plans/2026-07-03-agent-runtime-single-node-production-final-plan.md)
- [Write-authority reconciliation review](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/docs/review/2026-07-12-gate-b-runtime-write-authority-reconciliation-review.md)

## 主要发现

### Critical — Legacy history contract cannot preserve user scope

`HistoryStore` methods accept tenantId and conversationId but not userId. SQLite history rows and repository methods require `(tenantId, userId, conversationId)`. An adapter that guesses or captures one global user would recreate the exact IDOR/ownership weakness the approved schema prevents.

### Critical — Event and execution lookup contracts remain partially scoped

RuntimeEventStore retrieval/subscription methods key by tenantId and conversationId; ExecutionStateStore permits optional userId. SQLite repositories require userId for durable lookups. Production wiring must make userId mandatory across all request-path storage calls and tests, not hide the mismatch behind defaults.

### Critical — Separate store adapters do not create a Lifecycle Unit of Work

AgentExecutionRunner currently performs execution transition, history append, approval mutation and runtime-event append through separate interfaces. Wrapping each call in an independent SQLite transaction would preserve crash windows between lifecycle mutations. The approved contract requires complete lifecycle transitions to share a Unit of Work; existing `RuntimeLifecycleCommands` already models this boundary but is not the runner's write path.

### Pass — Durable primitives and restart reconciliation are reusable

Runtime database migration, singleton lock, repositories, lifecycle commands and startup reconciliation have focused tests and can remain the durable core. The correction should route production execution through these primitives rather than replace them.

## 最终建议

Revise the existing Stage 0 implementation plan with these executable slices:

1. **Required user scope RED/GREEN**：make userId required in HistoryStore, RuntimeEventStore and ExecutionStateStore request-path APIs; migrate implementations/callers/tests without defaults or compatibility aliases.
2. **Production runtime context RED/GREEN**：create one owner for `openProductionRuntimeStorage`, repository bundle, lifecycle commands, startup reconciliation and deterministic close/lock release.
3. **Unit-of-Work runner RED/GREEN**：route execution start, tool-plan persistence, approval wait/decision and terminal completion/error through lifecycle commands so each business transition is atomic; keep transient stream previews outside durable writes.
4. **Read adapter RED/GREEN**：provide scoped history/memory/event/execution/approval reads for server APIs from the same database without opening independent connections.
5. **Server/entrypoint RED/GREEN**：production mode requires an absolute database path, refuses JSON fallback, reconciles before listen/readiness, registers close hooks and enforces `umask 077` in the reviewed startup wrapper.
6. **Strict verification**：focused contract/UoW/restart/second-instance/IDOR/WAL tests, Runtime full suite/typecheck, then distinct implementation Review before controlled production startup.

Do not update dashboard/tasks merely for the plan revision. Do not start Runtime, delete SQLite, rerun import or restore JSON writes.

## 后续门禁

- OpenSpec：existing `harden-agent-runtime-single-node-production` scope remains sufficient; no new proposal.
- Superpowers：existing final plan must be revised, then current-revision Plan Preflight must PASS before TDD implementation.
- Production Runtime：stays stopped; live SQLite remains forward-fix-only evidence.
- Dashboard/tasks：unchanged.
- Runtime parity：still forbidden.
- 人工审批：the user has authorized recommended continuation, but preflight FAIL cannot be bypassed by blanket authorization.
- 项目规则：未修改。
