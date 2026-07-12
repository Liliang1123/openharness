# Agent Runtime SQLite Write Authority Correction Implementation Review

## 结论

通过（PASS）：已批准 correction plan 的 Tasks 1–5 已按 strict TDD 实施，并通过第三轮独立实现 Review。最终实现覆盖 required user scope、单一 production Runtime context、Lifecycle Unit of Work、scoped SQLite reads，以及 server/entrypoint fail-closed lifecycle；未发现未解决的 Critical 或 Important finding。

本 PASS 仅关闭 Tasks 1–5 implementation gate。它不授权创建或执行 production startup wrapper，不授权启动 Runtime、访问 live SQLite、更新 Stage 0 tasks/dashboard，亦不授权开始 Runtime parity。

- 被执行 plan revision SHA-256：`b24bce8dc2e5db705b81296b296f50e1748ab6aeb77dce34f8376f45b2c2f01d`
- 最终 `agent-runtime` implementation diff SHA-256：`c1bccefc5904368b77df10f230dc512a4c91c58bf61c3516b12f27c08f14d589`

## Review 范围

- [Executable correction plan](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/docs/superpowers/plans/2026-07-12-agent-runtime-sqlite-write-authority-correction-plan.md)
- [Plan Preflight Review](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/docs/review/2026-07-12-agent-runtime-sqlite-write-authority-correction-plan-preflight-review.md)
- [Active OpenSpec proposal](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/openspec/changes/harden-agent-runtime-single-node-production/proposal.md)
- [Active OpenSpec design](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/openspec/changes/harden-agent-runtime-single-node-production/design.md)
- [Active OpenSpec spec delta](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/openspec/changes/harden-agent-runtime-single-node-production/specs/agent-runtime/spec.md)
- [Runtime server](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/agent-runtime/src/server.ts)
- [Production entrypoint](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/agent-runtime/src/productionEntrypoint.ts)
- [Entrypoint direct-execution guard](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/agent-runtime/src/index.ts)
- [Agent execution runner](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/agent-runtime/src/agentExecutionRunner.ts)
- [Production Runtime context](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/agent-runtime/src/storage/productionRuntimeContext.ts)
- [Lifecycle commands](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/agent-runtime/src/storage/lifecycleCommands.ts)
- [Scoped SQLite adapters](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/agent-runtime/src/storage/sqliteRuntimeAdapters.ts)
- [SQLite history store](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/agent-runtime/src/storage/sqliteHistoryStore.ts)
- [SQLite approval store](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/agent-runtime/src/storage/sqliteApprovalStore.ts)
- [SQLite Runtime event store](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/agent-runtime/src/storage/sqliteRuntimeEventStore.ts)
- [Production context tests](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/agent-runtime/test/productionRuntimeContext.test.ts)
- [Lifecycle UoW tests](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/agent-runtime/test/lifecycleUnitOfWork.test.ts)
- [Production runner tests](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/agent-runtime/test/productionRunnerPersistence.test.ts)
- [Scoped adapter tests](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/agent-runtime/test/sqliteRuntimeAdapters.test.ts)
- [Production server lifecycle tests](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/agent-runtime/test/productionServerLifecycle.test.ts)
- [Production entrypoint tests](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/agent-runtime/test/productionEntrypoint.test.ts)

## 主要发现

### Critical — 无未解决 finding

Production approval/abort API 均在响应前提交 Lifecycle UoW；runner 的随后重试返回 empty commit，不会重复发布历史事件。Skill pending injection 使用完整 tenant/user/conversation key，production injection messages 通过 lifecycle transaction 写入。Terminal transition 不可逆，所有已提交命令的幂等重试均不重新 live publish durable history。

### Important — 无未解决 finding

- Required user scope：History、RuntimeEvent、Execution、Approval contracts 和 request paths 均要求显式 `userId`；development request 同样拒绝缺失 user header。Process execution key 包含完整 owner scope，可隔离相同 execution ID。
- Single context ownership：production context 独占 lock/database/repositories/lifecycle/adapters，完成 integrity/reconciliation 后才返回；migration、integrity、reconciliation failure 均关闭 storage 并释放 lock，close 幂等。
- Lifecycle sole write authority：execution start、tool plan、approval wait/decision、tool result、success/fail/abort/interruption 和 injected messages 均由 lifecycle boundary 写入 SQLite；post-commit publisher failure 不改变 durable state。
- Tool-plan closure：tool result 使用内部 execution marker 做 SQL 幂等判断；不同 execution 复用相同 `toolCallId` 不会丢结果。全部当前 execution tool results 完成后，provisional plan 在同一 transaction 内稳定化。
- Scoped reads：history/memory/execution/approval/event reads 将 tenant/user/conversation 及 identifier predicates 下推到共享 SQLite connection；approval lookup 不再读取会话全集后过滤。
- Event fidelity：durable event ID 包含 tenant/user/conversation；SQLite replay 保留 trace/request identity 和 usage；live publisher只发布 committed event，不分配 cursor、不写数据库。
- Fail-closed construction：production branch只构造明确的 process-control registries；可观察 development fallback factories 在 production context 下均未调用。Entrypoint要求 production profile、absolute SQLite path、service token和有效 port；listen failure、signal/normal close均释放 context/lock。
- Test isolation：production skill test使用 injected in-memory loader，不创建、覆盖或递归删除项目 skill 目录。

### 独立 Review 迭代

- 第一轮：FAIL，发现 production API durable-before-response、skill scope/UoW、terminal monotonic/idempotent 等阻断项；全部返回 Tasks 1–5 以 RED cases 修正。
- 第二轮：FAIL，确认首轮 Critical 已关闭，新增 execution-scoped tool result、context failure evidence/fallback tripwire、skill fixture isolation 三个 Important；全部补测修正。
- 第三轮：PASS；第二轮 findings 全部关闭，抽查首轮 findings 未回归。独立 reviewer 另行重跑 4 files / 26 tests，结果 PASS。

## 验证记录

- Correction-focused matrix：`pnpm --filter @openharness/agent-runtime test -- history runtimeEventStore executionStateStore approvalStore productionRuntimeContext lifecycleUnitOfWork crashMatrix agentExecutionRunner productionRunnerPersistence approvalRecovery restartReconciliation sessionsApi sessionEventsApi memoryApi approvalApi abortApi activeExecutionLock sqliteRuntimeAdapters productionServerLifecycle productionEntrypoint serviceAuth` → 26 files / 152 tests PASS。
- Full Runtime suite：`pnpm --filter @openharness/agent-runtime test` → 70 files / 365 tests PASS。
- TypeScript：`pnpm --filter @openharness/agent-runtime typecheck` → PASS。
- Repository hygiene：`git diff --check` → PASS。
- OpenSpec：`npx openspec validate harden-agent-runtime-single-node-production --strict --no-interactive` → PASS，输出 `Change 'harden-agent-runtime-single-node-production' is valid`。
- Strict negative searches：无 optional/default request user、无 tenant-wide durable read 后 user filter、无 production preview durability、无第二 production connection；搜索命中的 JSON constructors均位于 lazy development factories，runner direct-write matches均位于显式 development branch或 process-control branch。
- Runtime/live data：未启动 Runtime，未读取或写入 live SQLite，未执行 archive/backup/restore/import/cutover/permission command。
- Scope audit：未修改 active Stage 0 tasks 或 dashboard；worktree 中相关既有 dirty 状态不属于本 implementation。未 staging、commit、push或创建 PR。

## 最终建议

保持当前 Runtime 停止状态。Tasks 1–5 implementation gate 已关闭；若继续，应从 plan Task 7 的 production startup command 创建与独立 Review 开始，但仅在新的明确授权下执行，且创建 wrapper 仍不授权运行它。Task 8 controlled production probe继续要求 exact command/time/evidence path 的单独授权。

## 后续门禁

- OpenSpec：继续沿用 active `harden-agent-runtime-single-node-production`；无需新 proposal，不得在本 gate archive。
- Superpowers：Task 7 wrapper须单独验证和 Review；Task 8须独立 production authorization。
- Production Runtime：保持停止；不得因本 PASS 自动启动或声明 Gate B 完成。
- Live SQLite：原地保留、forward-fix-only；禁止删除、重建、restore/import重跑、JSON dual-write或 authority rollback。
- Stage 0 tasks/dashboard：保持不变，直到后续 production evidence 与对应 Review gate满足。
- Runtime parity：继续 blocked，不得启动。
- 项目规则：未修改。
