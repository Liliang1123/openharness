# Stage 0 Local Evidence Task Status Review

## 结论

有风险：本轮在隔离 worktree 中复核并确认 [harden-agent-runtime-single-node-production tasks](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/stage0-runtime-production-closeout/openspec/changes/harden-agent-runtime-single-node-production/tasks.md) 的 Stage 1 本地实现证据足以勾选 2.1、2.3、2.4、2.5；随后追加完成 Task 13 formal soak preflight harness 的 TDD 补强，并补齐 4.4 production runbook。Gate B、真实 Provider 资格、正式 24 小时 soak、Runtime v1 freeze 和 archive 仍未完成，不能声明 Stage 0 全部完成，也不能进入 OpenClacky parity Stage 1–9 实现。

## Review 范围

- [Stage 0 worktree](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/stage0-runtime-production-closeout)
- [active change tasks](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/stage0-runtime-production-closeout/openspec/changes/harden-agent-runtime-single-node-production/tasks.md)
- [implementation plan](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/stage0-runtime-production-closeout/docs/superpowers/plans/2026-07-03-agent-runtime-single-node-production-final-plan.md)
- [Stage 1 Gate B evidence](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/stage0-runtime-production-closeout/docs/verification/agent-runtime-v1/stage1-gate-b.md)
- [Task 8 import rehearsal evidence](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/stage0-runtime-production-closeout/docs/verification/agent-runtime-v1/task8-json-import-restore-rehearsal.md)
- [Task 11 local tool qualification evidence](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/stage0-runtime-production-closeout/docs/verification/agent-runtime-v1/tools/task11-java-sandbox-mcp-local.md)
- [Task 12D local short baseline evidence](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/stage0-runtime-production-closeout/docs/verification/agent-runtime-v1/task12d-local-short-baseline-run.md)
- [Task 13 formal soak preflight harness evidence](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/stage0-runtime-production-closeout/docs/verification/agent-runtime-v1/task13-formal-soak-preflight-harness.md)
- [Task 13 formal soak preflight harness review](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/stage0-runtime-production-closeout/docs/review/2026-07-09-task13-formal-soak-preflight-harness-review.md)
- [Agent Runtime v1 production runbook](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/stage0-runtime-production-closeout/docs/architecture/agent-runtime-v1-production-runbook.md)
- [Agent Runtime v1 production runbook review](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/stage0-runtime-production-closeout/docs/review/2026-07-09-agent-runtime-v1-production-runbook-review.md)
- [runtime storage implementation directory](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/stage0-runtime-production-closeout/agent-runtime/src/storage)
- [runtime storage tests](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/stage0-runtime-production-closeout/agent-runtime/test)

## 主要发现

### Pass — 2.1 可勾选

2.1 要求 single-worker SQLite storage boundary、Lifecycle Unit of Work、migration runner、readiness checks、bounded busy retry、WAL checkpoint 和 low-disk protection。

证据：

- [runtimeStorage.ts](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/stage0-runtime-production-closeout/agent-runtime/src/storage/runtimeStorage.ts)
- [singletonLock.ts](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/stage0-runtime-production-closeout/agent-runtime/src/storage/singletonLock.ts)
- [diskGuard.ts](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/stage0-runtime-production-closeout/agent-runtime/src/storage/diskGuard.ts)
- [lifecycleCommands.ts](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/stage0-runtime-production-closeout/agent-runtime/src/storage/lifecycleCommands.ts)
- [runtimeStorage.test.ts](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/stage0-runtime-production-closeout/agent-runtime/test/runtimeStorage.test.ts)
- [singletonLock.test.ts](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/stage0-runtime-production-closeout/agent-runtime/test/singletonLock.test.ts)
- [diskGuard.test.ts](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/stage0-runtime-production-closeout/agent-runtime/test/diskGuard.test.ts)
- [Stage 1 Gate B evidence](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/stage0-runtime-production-closeout/docs/verification/agent-runtime-v1/stage1-gate-b.md)

### Pass — 2.3 可勾选

2.3 要求 deterministic、idempotent JSON import、schema validation、quarantine manifest、backup verification 和 forward-only cutover instructions。

证据：

- [jsonImporter.ts](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/stage0-runtime-production-closeout/agent-runtime/src/storage/jsonImporter.ts)
- [jsonImporter.test.ts](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/stage0-runtime-production-closeout/agent-runtime/test/jsonImporter.test.ts)
- [Task 8 import rehearsal evidence](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/stage0-runtime-production-closeout/docs/verification/agent-runtime-v1/task8-json-import-restore-rehearsal.md)
- [Stage 1 Gate B evidence](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/stage0-runtime-production-closeout/docs/verification/agent-runtime-v1/stage1-gate-b.md)

限制：该证据是 fixture-level/local evidence，不等于 production Gate B promotion。

### Pass — 2.4 可勾选

2.4 要求 startup reconciliation 将 running/waiting executions 终止为 `EXECUTION_INTERRUPTED`，invalidate approvals，且不重建 runners。

证据：

- [reconcile.ts](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/stage0-runtime-production-closeout/agent-runtime/src/storage/reconcile.ts)
- [restartReconciliation.test.ts](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/stage0-runtime-production-closeout/agent-runtime/test/restartReconciliation.test.ts)
- [approvalRecovery.test.ts](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/stage0-runtime-production-closeout/agent-runtime/test/approvalRecovery.test.ts)
- [Stage 1 Gate B evidence](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/stage0-runtime-production-closeout/docs/verification/agent-runtime-v1/stage1-gate-b.md)

### Pass — 2.5 可勾选

2.5 要求 Unit of Work crash matrix、second-instance fencing、provisional-context recovery、transient-stream reconciliation、cursor watermark/replay-live、IDOR、lock contention、WAL、low-disk、migration、outbox crash-before/after-ack/dead-letter 和 restart tests。

证据：

- [crashMatrix.test.ts](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/stage0-runtime-production-closeout/agent-runtime/test/crashMatrix.test.ts)
- [lifecycleUnitOfWork.test.ts](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/stage0-runtime-production-closeout/agent-runtime/test/lifecycleUnitOfWork.test.ts)
- [traceOutbox.test.ts](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/stage0-runtime-production-closeout/agent-runtime/test/traceOutbox.test.ts)
- [serviceAuth.test.ts](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/stage0-runtime-production-closeout/agent-runtime/test/serviceAuth.test.ts)
- [sessionEventsApi.test.ts](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/stage0-runtime-production-closeout/agent-runtime/test/sessionEventsApi.test.ts)
- [memoryApi.test.ts](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/stage0-runtime-production-closeout/agent-runtime/test/memoryApi.test.ts)
- [sqliteRuntimeEventStore.test.ts](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/stage0-runtime-production-closeout/agent-runtime/test/sqliteRuntimeEventStore.test.ts)
- [Stage 1 Gate B evidence](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/stage0-runtime-production-closeout/docs/verification/agent-runtime-v1/stage1-gate-b.md)

### Blocked — Gate B / Gate C / Gate D 仍未关闭

以下任务不得在本轮勾选：

- 2.6 和 2.7：仍缺 production backup/import/quarantine/restore 和 measured production RPO/RTO evidence。
- 3.1 和 3.2：真实 OpenAI-compatible / Anthropic credential matrix 未授权且未运行。
- 3.5 和 3.6：需真实矩阵缺口闭环后再评估。
- 4.2 和 4.3：formal 24-hour soak 未启动，也未产生最终报告。
- 4.5、4.6：需 full gates 和 contract freeze。
- 5.1–5.4：closeout、dashboard verified、archive 均未满足。

### Pass With Boundary — Task 13 preflight harness 已补强但不关闭 4.2 / 4.3

本轮新增 [formalSoakRunner.ts](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/stage0-runtime-production-closeout/agent-runtime/src/baseline/formalSoakRunner.ts) 和 [formalSoakRunner.test.ts](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/stage0-runtime-production-closeout/agent-runtime/test/formalSoakRunner.test.ts)，覆盖 Gate D approval、operator-attested preflight blocked reasons、固定 24 小时 / 30 秒采样 / hour 2、12、22 TS restart schedule、阈值与 workload operations 不可变、unmarked custom delay 阻断、compressed simulation 降为 `local/local_verified`，以及首尾两小时 RSS/FD median growth 硬失败。该能力只是正式 soak 的启动条件，不是实际 24 小时运行结果。

### Pass — 4.4 可勾选

本轮新增 [Agent Runtime v1 production runbook](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/stage0-runtime-production-closeout/docs/architecture/agent-runtime-v1-production-runbook.md)，覆盖 database backup/restore、migration/recovery、provider/tool qualification、private-service deployment、formal soak 和 incident procedures。该文档只满足操作手册交付条件，不授权 Gate B/C/D。

## 验证记录

本轮在 [Stage 0 worktree](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/stage0-runtime-production-closeout) 观察到：

- root workspace tests passed：shared-schema 49 tests、agent-runtime 306 tests、frontend 24 tests、integration 17 tests。
- focused Task 13 tests passed：formal soak runner 1 file / 5 tests。
- agent-runtime full tests after Task 13 harness passed：64 files / 311 tests。
- root typecheck passed：shared-schema、agent-runtime、frontend。
- backend Maven tests passed：45 tests，0 failures，0 errors。
- OpenSpec strict validation passed for [harden-agent-runtime-single-node-production](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/stage0-runtime-production-closeout/openspec/changes/harden-agent-runtime-single-node-production). PostHog telemetry flush failed with `ENOTFOUND edge.openspec.dev`; this is a non-blocking telemetry warning.
- dashboard check passed: generated outputs are current.

## 最终建议

2.1、2.3、2.4、2.5、4.4 可以在 [active change tasks](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/stage0-runtime-production-closeout/openspec/changes/harden-agent-runtime-single-node-production/tasks.md) 中勾选；其余 Stage 0 未完成项必须继续保留 pending，直到真实生产证据、真实 provider authorization、formal 24-hour soak 和 final critical gates 完成。

## 后续门禁

- 需要 OpenSpec proposal：否，本轮只在已批准 active change 内更新任务状态。
- 需要 TDD：已完成。2.1、2.3、2.4、2.5 对应 TDD 证据已在历史 verification 文档中记录；Task 13 preflight harness 的 RED/GREEN 记录见 [task13-formal-soak-preflight-harness.md](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/stage0-runtime-production-closeout/docs/verification/agent-runtime-v1/task13-formal-soak-preflight-harness.md)。
- 需要人工审批：是，后续 Gate B、Gate C、Gate D 均仍需人工审批。
- 需要 Superpowers plan：已有 [approved implementation plan](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/stage0-runtime-production-closeout/docs/superpowers/plans/2026-07-03-agent-runtime-single-node-production-final-plan.md)，本轮不新增计划。
- 是否修改项目规则：否。
