# Agent Runtime SQLite Write Authority Correction Plan Preflight Review

## 结论

通过（PASS）：current-revision correction plan 已覆盖前次 Preflight 的全部 Critical finding，并把已批准的 SQLite sole-write-authority correction 拆为 required user scope、production Runtime context、Lifecycle Unit of Work、scoped reads、server/entrypoint lifecycle、strict verification 与独立 production authorization 七个可执行门禁。

本次 PASS 只授权在既有 active `harden-agent-runtime-single-node-production` 范围内按 RED → GREEN 开始 Tasks 1–5 的 correction implementation。它不代表实现 Review、Gate B PASS、production Runtime 启动授权、live SQLite 写入授权、Stage 0 tasks/dashboard 更新授权或 Runtime parity 授权。

被评审 plan revision SHA-256：`b24bce8dc2e5db705b81296b296f50e1748ab6aeb77dce34f8376f45b2c2f01d`。

## Review 范围

- [Current correction plan](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/docs/superpowers/plans/2026-07-12-agent-runtime-sqlite-write-authority-correction-plan.md)
- [Parent Stage 0 final plan](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/docs/superpowers/plans/2026-07-03-agent-runtime-single-node-production-final-plan.md)
- [Active Stage 0 proposal](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/openspec/changes/harden-agent-runtime-single-node-production/proposal.md)
- [Active Stage 0 design](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/openspec/changes/harden-agent-runtime-single-node-production/design.md)
- [Active Stage 0 tasks](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/openspec/changes/harden-agent-runtime-single-node-production/tasks.md)
- [Agent Runtime spec delta](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/openspec/changes/harden-agent-runtime-single-node-production/specs/agent-runtime/spec.md)
- [Message history spec delta](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/openspec/changes/harden-agent-runtime-single-node-production/specs/message-history/spec.md)
- [Long-term memory spec delta](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/openspec/changes/harden-agent-runtime-single-node-production/specs/long-term-memory/spec.md)
- [Gate B write-authority reconciliation review](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/docs/review/2026-07-12-gate-b-runtime-write-authority-reconciliation-review.md)
- [Previous blocked plan preflight](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/docs/review/2026-07-12-runtime-sqlite-write-authority-plan-preflight-review.md)
- [Runtime server](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/agent-runtime/src/server.ts)
- [Runtime entrypoint](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/agent-runtime/src/index.ts)
- [Agent execution runner](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/agent-runtime/src/agentExecutionRunner.ts)
- [History contract](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/agent-runtime/src/history.ts)
- [Execution state contract](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/agent-runtime/src/executionStateStore.ts)
- [Approval contract](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/agent-runtime/src/approvalStore.ts)
- [Runtime event contract](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/agent-runtime/src/runtimeEventStore.ts)
- [Runtime storage](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/agent-runtime/src/storage/runtimeStorage.ts)
- [SQLite repository bundle](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/agent-runtime/src/storage/sqliteRuntimeRepositories.ts)
- [Lifecycle commands](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/agent-runtime/src/storage/lifecycleCommands.ts)
- [Startup reconciliation](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/agent-runtime/src/storage/reconcile.ts)

## 主要发现

### Critical — 无未解决 finding

前次 Preflight 的三个 Critical finding 均已由可验证机制覆盖：所有 request-path durable contracts 先强制 `userId`；runner durable mutations 统一进入 lifecycle command；production construction 由一个 context 拥有 storage/repositories/reconciliation/close，而不是给 legacy stores 增加猜测 scope 的薄 adapter。

### Pass — Required user scope 是 contract-first correction

Task 1 先以类型和同 tenant 跨 user RED cases 修改 History、RuntimeEvent、Execution 和 Approval contract，再迁移实现/callers。Plan 明确禁止 optional parameter、captured global user、`user-001` default、compatibility overload 和“tenant-wide read 后内存过滤”，符合 approved ownership contract。

### Pass — Durable commit 与 live publication 已分离

Plan 没有把 existing `publishCommittedLifecycleEvents()` 直接接到 SQLite-backed event adapter。Task 3 引入只做 `publish(event)`/scoped subscribe 的 non-durable publisher，保留 committed `eventId` 且不得分配 cursor 或写 SQLite；durable replay 只从同一 context database 读取。这消除了二次 append、重复 event/cursor 和 post-commit notifier failure 回滚 durable state 的风险。

### Pass — Production context 覆盖完整 startup/close lifecycle

Task 2/5 明确顺序为 lock → open/migrate → integrity → reconciliation → ready/listen，并覆盖 failure cleanup、second-instance fencing、listen failure、idempotent close 和 database-before-lock-release。Production factory 拒绝 individually injected legacy stores，entrypoint 必须要求 absolute SQLite path，不能再走 default `createServer()`。

### Pass — Lifecycle Unit of Work 覆盖完整 business transitions

Task 3 覆盖 execution start、provisional tool plan、approval wait/decision、tool result、terminal success/error/abort 和 restart interruption，要求每个 lifecycle input 带完整 tenant/user/conversation/execution/trace/request identity。Crash matrix 同时覆盖 before/after commit，live publisher failure 作为 adversarial probe，transient preview 明确不进入 stable history 或 durable events。

### Pass — Scoped reads 不会重新打开连接或弱化隔离

Task 4 要求 SQLite adapters 复用 context 的唯一 `RuntimeDatabase`，把所有 ownership predicate 下推到 repository/SQL；server session、SSE cursor、approval、abort、active conflict 和 memory APIs 均有 same-tenant cross-user/跨 tenant IDOR cases。Plan 禁止 adapter 自己 open connection 或自行拥有 lifecycle transaction。

### Pass — Strict evidence、stop conditions 与生产授权分层明确

Task 6 要求 focused/full Runtime tests、typecheck、negative searches、OpenSpec strict validation、diff/status audit 和 distinct High Review。Task 7 只有 implementation Review PASS 后才能创建 `umask 077` startup wrapper，且不得执行；Task 8 另需 exact production authorization。Scope leak、dual-write、integrity failure、second-instance readiness、pre-readiness traffic、lock leak 和 secret/content leak 均是 immediate FAIL/stop，rollback 仍为 forward-fix only。

### Pass — Scope、worktree 与 Git authority 合规

Plan 固定在 integration worktree，引用 approved active change 和 parent plan；没有新增 OpenSpec、没有 executable parity scope、没有 task/dashboard promotion，也没有 Git staging/commit/push step。已完成的 archive/backup/restore/import/cutover/permission work被明确列为禁止重复。

## 验证记录

- Plan structure：487 lines，required Superpowers header、Goal/Architecture/Tech Stack、8 个 executable tasks、Execution Gates、Stop/Forward-Fix Rules、Plan Self-Review 均存在。
- Placeholder scan：PASS；无 unresolved placeholder、模糊“照 Task N”或未指定 test step。
- Unauthorized Git step scan：PASS；仅 authority prohibition 中出现命令名，没有执行步骤。
- `npx openspec validate harden-agent-runtime-single-node-production --strict --no-interactive`：PASS，输出 `Change 'harden-agent-runtime-single-node-production' is valid`。
- `git diff --check`：PASS。
- Scope audit：本轮没有修改 production source/tests、active Stage 0 tasks 或 dashboard；新增范围仅为 correction plan 和本 Preflight Review。
- OpenSpec telemetry flush：出现 `edge.openspec.dev` DNS/PostHog warning，但 local strict validation 已退出并返回 valid；该 warning 不影响 schema/spec validation 结果。
- Runtime/live data：未启动 Runtime，未读取或写入 raw live rows，未执行 import/cutover/restore/permission command。

## 最终建议

按 current plan revision 从 Task 1 开始 strict TDD correction。推荐一次只完成一个 business slice，并在每个 slice 后记录 Step Evidence Gate。Tasks 1–5 全部 verified 后执行 distinct implementation Review；Review PASS 前不得创建 startup wrapper或启动 Runtime。任何 plan 内容修改都会改变 revision hash，必须重新做 Preflight Review。

## 后续门禁

- OpenSpec：继续沿用 active `harden-agent-runtime-single-node-production`；不需要新 proposal，不得 archive。
- Superpowers：implementation 必须使用 TDD；未解释失败使用 systematic debugging；Tasks 1–5 后需要 distinct implementation Review；最终结论前使用 verification-before-completion。
- Production Runtime：保持停止。Implementation Review PASS 后才允许创建并 review startup wrapper；wrapper Review PASS 和用户 exact authorization 后才允许 controlled probe。
- Live SQLite：原地保留、forward-fix-only；禁止删除、重建、导入、恢复 JSON authority 或 dual-write。
- Stage 0 tasks/dashboard：保持不变；本 Preflight PASS 不满足 2.6/2.7 promotion evidence。
- Runtime parity：继续 blocked，不得创建或推进。
- 项目规则：未修改。
