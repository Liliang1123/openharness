# Agent Runtime Formal Gate D Attempt005 Plan

> OpenSpec 精简模式。此计划只冻结正式 Gate D Attempt005 的 runId、输入、输出、执行顺序与审批边界；在精确启动审批和 active preflight PASS 前不得启动 Runtime child 或 24 小时 workload。

## 状态

`deferred_by_user`（2026-07-27）：用户选择先自行试用 Runtime 并持续打磨，不再执行本 Attempt005。已准备的 packet 输入作为历史准备制品保留；不得生成 approval、active preflight、journal、partial report 或 report。

恢复条件：用户未来明确恢复 `Production Verified` 路径时，本 runId 与 packet 不得复用。必须创建新的 runId、fresh no-overwrite packet、Plan/Preflight Review，并重新取得 start 与 promotion approvals。

## 目标

使用 dedicated SQLite Worker 完成唯一一次正式 production-track 24 小时 Gate D：10,000 seeded conversations、20 concurrent executions、60/20/15/5 固定 workload、每 30 秒采样，并在小时 2/12/22 仅重启 TypeScript Runtime。所有既有 oracle、资源阈值、no-overwrite、fail-closed 与 promotion 边界保持不变。

## 依据

- [Active OpenSpec design](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/openspec/changes/harden-agent-runtime-single-node-production/design.md)
- [Active Agent Runtime spec delta](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/openspec/changes/harden-agent-runtime-single-node-production/specs/agent-runtime/spec.md)
- [OpenSpec tasks](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/openspec/changes/harden-agent-runtime-single-node-production/tasks.md)
- [Gate D production executor plan](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/docs/superpowers/plans/2026-07-15-agent-runtime-gate-d-production-executor.md)
- [Production runbook](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/docs/architecture/agent-runtime-v1-production-runbook.md)
- [Attempt004b Result Review](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/docs/review/2026-07-27-agent-runtime-10m-mature-database-regression-attempt-004b-result-review.md)

## 冻结绑定

- runId：`gate-d-20260727-005`
- packet：[gate-d-20260727-005](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/docs/verification/agent-runtime-v1/gate-d/gate-d-20260727-005)
- approval：[approval.json](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/docs/verification/agent-runtime-v1/gate-d/gate-d-20260727-005/approval.json)
- MCP config：[mcp-config.json](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/docs/verification/agent-runtime-v1/gate-d/gate-d-20260727-005/mcp-config.json)
- monitoring：[monitoring-evidence.md](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/docs/verification/agent-runtime-v1/gate-d/gate-d-20260727-005/monitoring-evidence.md)
- interruption：[interruption-procedure.md](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/docs/verification/agent-runtime-v1/gate-d/gate-d-20260727-005/interruption-procedure.md)
- SQLite：[runtime.sqlite](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/docs/verification/agent-runtime-v1/gate-d/gate-d-20260727-005/runtime.sqlite)
- preflight：[preflight.json](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/docs/verification/agent-runtime-v1/gate-d/gate-d-20260727-005/preflight.json)
- journal：[journal.jsonl](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/docs/verification/agent-runtime-v1/gate-d/gate-d-20260727-005/journal.jsonl)
- FAIL partial：[partial-report.json](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/docs/verification/agent-runtime-v1/gate-d/gate-d-20260727-005/partial-report.json)
- PASS report：[report.json](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/docs/verification/agent-runtime-v1/gate-d/gate-d-20260727-005/report.json)
- Gate D approval 绑定的 plan：现有 [Gate D production executor plan](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/docs/superpowers/plans/2026-07-15-agent-runtime-gate-d-production-executor.md)，SHA-256 `cf809f4286b82c71b377e26e4d66742dea1bfc895ef1369151b632c1511de3ca`。

## 执行步骤

- [x] 1. Worker 全仓验证、High Review 与成熟库 Attempt004b 已 PASS；OpenSpec 4.1d 已完成。
- [x] 2. 创建新的 no-overwrite packet 输入、固定路径和本计划；不复用 Attempt001/002 或短回归输出。
- [x] 3. 完成静态 packet Preflight Review；确认 approval/preflight/journal/partial/report 均未生成。
- [ ] 4. **DEFERRED；本 runId 不再执行。** 若未来恢复生产资格，先创建全新 Attempt 与 packet，不得为 `gate-d-20260727-005` 生成 approval。
- [ ] 5. **DEFERRED。** 新 Attempt 获得独立批准后，才启动唯一、独立管理的 Java Gateway 并执行 active preflight。
- [ ] 6. **DEFERRED。** 只有新 Attempt immutable preflight PASS 且 credential scan 通过，才允许启动一次正式运行。
- [ ] 7. **DEFERRED。** 新 Attempt 仍须保留 append-only journal、fail-closed partial report 与 no-retry 语义。
- [ ] 8. **DEFERRED。** 新 Attempt 完整 PASS 后仍须独立 Result Review 与 promotion approval。

## 不可变运行合同

- Duration：24 小时。
- Sampling：30 秒，期望 2,880 samples。
- Workload：10,000 seeded conversations、20 concurrent executions、60% no-tool、20% Java sandbox、15% MCP、5% approval interruption。
- Restart：仅 TypeScript Runtime，小时 2/12/22；Java Gateway 与 supervisor 不重启。
- Threshold：admission p95 `<=100ms`、durable replay p95 `<=250ms`、RSS `<=1.5GiB`、FD `<=1024`、WAL `<=256MiB`，持续 5 分钟超阈值即 fail-closed。
- Correctness：零跨 tenant/user 泄漏、零 Runtime-caused duplicate side effect、零 event-order/store corruption、零 dead letter、零 unexpected child exit。
- Worker：readiness fail-closed；queue full、Worker unavailable、protocol corruption 均为 hard failure，不允许进程内 replacement。

## 停止条件

- 缺失、过期或不匹配的 approval；plan SHA、runId 或路径漂移。
- Java/MCP active probe、磁盘、监控、interruption、SQLite target 或 no-overwrite 检查失败。
- 任何人尝试改变 duration、sample interval、workload mix、restart schedule、threshold 或 oracle。
- 任何 partial/report/journal/preflight 目标已存在。
- 任一 runtime hard failure；保留证据，不自动重试。

## 授权边界

本计划已由用户延期，不再作为 start approval 请求对象。它不授权 Gate D start、promotion、OpenSpec archive、Dashboard `verified`、Git staging/commit/push、merge、tag 或工作树清理。未来恢复生产资格必须创建新的 Attempt 计划并重新批准。
