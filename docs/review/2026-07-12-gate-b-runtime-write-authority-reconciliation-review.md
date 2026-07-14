# Gate B Runtime Write Authority Reconciliation Review

## 结论

需修改：production backup、restore、isolated import、live import、quarantine、permission forward-fix 和 SQLite integrity evidence 已通过，但 Runtime production wiring 尚未把 live SQLite 安装为唯一 lifecycle write authority。当前 `createServer` 默认仍创建 JSON history/memory stores，并继续使用非 SQLite approval、execution 和 runtime-event stores；`openProductionRuntimeStorage` 与 `createSqliteRuntimeRepositories` 只存在于 storage implementation/tests/importer，没有接入 Runtime server startup/lifecycle。

因此 live SQLite 目前是正确的 migrated production database，但不是 Runtime 实际 write authority。由于 production cutover state 已是 `forward_fix_only`、`legacyWritesAllowed=false`，Agent Runtime 必须保持停止；启动当前 server 会重新写 JSON/in-memory authority，违反已批准的 cutover contract。Gate B 继续 BLOCKED，Stage 0 task 2.6/2.7 和 dashboard 不得更新。

## Review 范围

- [Runtime server](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/agent-runtime/src/server.ts)
- [History factory](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/agent-runtime/src/historyFactory.ts)
- [Runtime entrypoint](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/agent-runtime/src/index.ts)
- [Runtime storage](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/agent-runtime/src/storage/runtimeStorage.ts)
- [SQLite repositories](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/agent-runtime/src/storage/sqliteRuntimeRepositories.ts)
- [Lifecycle commands](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/agent-runtime/src/storage/lifecycleCommands.ts)
- [SQLite history store](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/agent-runtime/src/storage/sqliteHistoryStore.ts)
- [SQLite memory store](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/agent-runtime/src/storage/sqliteMemoryStore.ts)
- [SQLite execution store](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/agent-runtime/src/storage/sqliteExecutionStore.ts)
- [SQLite approval store](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/agent-runtime/src/storage/sqliteApprovalStore.ts)
- [SQLite runtime-event store](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/agent-runtime/src/storage/sqliteRuntimeEventStore.ts)
- [Live production SQLite](file:///Users/elvis/file/develop/opensource/openharness/agent-runtime/data/production/sqlite/runtime-v1.sqlite)
- [Production cutover state](file:///Users/elvis/file/develop/opensource/openharness/agent-runtime/data/production/evidence/gate-b/20260712T065413Z/production-cutover-state.json)
- [Sidecar permission re-review](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/docs/review/2026-07-12-gate-b-sqlite-sidecar-permission-rereview.md)
- [Stage 0 active tasks](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/openspec/changes/harden-agent-runtime-single-node-production/tasks.md)
- [Stage 0 final plan](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/docs/superpowers/plans/2026-07-03-agent-runtime-single-node-production-final-plan.md)

## 主要发现

### Critical — Runtime defaults still select JSON/in-memory authorities

`historyFactory.ts` selects `HISTORY_STORE` with default `file` and returns `JsonFileHistoryStore` for every non-memory value. `server.ts` uses that factory for history and directly constructs `JsonFileMemoryStore`; approval, execution and runtime-event defaults are also non-SQLite. No production database path or SQLite repository bundle is passed from `index.ts` into server lifecycle.

### Critical — Implemented SQLite repositories are not server-compatible wiring

`openProductionRuntimeStorage` correctly acquires singleton lock, opens/migrates SQLite and exposes close lifecycle. `createSqliteRuntimeRepositories` correctly constructs history, memory, execution, approval and runtime-event repositories. However these repositories operate through explicit `RuntimeDatabase` transactions and are not installed behind the server's current store interfaces. Importer success proves data compatibility, not request-path write authority.

### Pass — Production data remains safe while Runtime is stopped

Live database counts, integrity, owner-only file modes and forward-fix state are correct. No Runtime process or port 3001 listener is active. JSON source remains hash-identical to the reviewed backup. The safe action is to keep Runtime stopped until SQLite wiring is implemented and reviewed.

### Blocker — Gate B cannot close on migration evidence alone

Gate B requires SQLite to become the sole write authority after cutover. Marking task 2.6/2.7 complete now would create a false production state: data exists in SQLite, but serving traffic would still mutate legacy stores. Dashboard must remain `proposed` and Stage 0 remains active.

## 最终建议

1. Continue within the already-approved `harden-agent-runtime-single-node-production` change; do not create a new OpenSpec or parity plan.
2. Execute the existing plan's production storage-boundary slice with strict TDD: add a server-owned production storage lifecycle, adapters that satisfy current History/Memory/Execution/Approval/RuntimeEvent contracts through one `RuntimeDatabase`, startup reconciliation before readiness, and deterministic close/lock release.
3. Add RED tests proving production mode opens the configured live path, refuses a second instance, never constructs/writes JSON stores, preserves tenant/user scope, reconciles interrupted state before readiness, and closes WAL/SHM with owner-only permissions under `umask 077`.
4. Keep the current live database in place and forward-fix the Runtime wiring against it; do not rerun import, delete SQLite or resume JSON writes.
5. After implementation verification and independent Review PASS, run a controlled production startup/readiness/write probe, then reconcile Gate B tasks and evidence.

## 后续门禁

- OpenSpec：existing active `harden-agent-runtime-single-node-production` already authorizes this persistence/runtime wiring; no new proposal.
- Superpowers：strict TDD + focused verification + distinct implementation Review are required before production startup.
- Production Runtime：must remain stopped until wiring Review PASS and a reviewed startup command establishes `umask 077`.
- Rollback：forward-fix only; no SQLite deletion or JSON write-authority restoration.
- Dashboard/tasks：unchanged; 2.6/2.7 remain open.
- Runtime parity：still forbidden.
- 项目规则：未修改。
