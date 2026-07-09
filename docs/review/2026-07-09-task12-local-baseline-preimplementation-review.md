# Task 12 Local Baseline Pre-implementation Review

## 结论

有风险：可以继续推进 Task 12 的本地 deterministic short baseline harness，但本轮只能落在 `local_verified` 支持证据轨道；不得把本地短基线包装成 formal 24-hour soak、不得关闭 Gate B/Gate D、不得标记 production promotion。

## Review 范围

- Active OpenSpec tasks：[tasks.md](file:///Users/elvis/file/develop/opensource/openharness/openspec/changes/harden-agent-runtime-single-node-production/tasks.md)
- Active OpenSpec design：[design.md](file:///Users/elvis/file/develop/opensource/openharness/openspec/changes/harden-agent-runtime-single-node-production/design.md)
- 当前 Superpowers 实施计划：[2026-07-03-agent-runtime-single-node-production-final-plan.md](file:///Users/elvis/file/develop/opensource/openharness/docs/superpowers/plans/2026-07-03-agent-runtime-single-node-production-final-plan.md)
- Runtime server entry：[server.ts](file:///Users/elvis/file/develop/opensource/openharness/agent-runtime/src/server.ts)
- Runtime detached execution：[agentExecutionRunner.ts](file:///Users/elvis/file/develop/opensource/openharness/agent-runtime/src/agentExecutionRunner.ts)
- Runtime SQLite boundary：[runtimeStorage.ts](file:///Users/elvis/file/develop/opensource/openharness/agent-runtime/src/storage/runtimeStorage.ts)
- Runtime event repository：[sqliteRuntimeEventStore.ts](file:///Users/elvis/file/develop/opensource/openharness/agent-runtime/src/storage/sqliteRuntimeEventStore.ts)
- Startup reconciliation：[reconcile.ts](file:///Users/elvis/file/develop/opensource/openharness/agent-runtime/src/storage/reconcile.ts)
- Task 11 local evidence：[task11-java-sandbox-mcp-local.md](file:///Users/elvis/file/develop/opensource/openharness/docs/verification/agent-runtime-v1/tools/task11-java-sandbox-mcp-local.md)

## 主要发现

### Important — Task 12 应拆成本地 harness 切片先行

Task 12 原计划包含 report/oracle、seed generation、metrics、30-minute baseline、threshold verification 和 report hash freeze。若一次性实现并运行完整 30 分钟基线，容易把 harness 实现、环境资源、真实运行时间和门禁语义混在一起。建议本轮先实现：

1. 固定 workload seed generator。
2. 固定 baseline report schema。
3. hard-fail 与 sustained five-minute threshold breach oracle。
4. report hash / environment fingerprint 的 deterministic 计算。

### Important — Formal soak 仍必须隔离

OpenSpec 明确 Stage 3 本地仅允许 deterministic short baseline；formal 24-hour soak、生产 backup/restore rehearsal、production qualification 和最终 freeze 仍需独立人工 promotion。因此本轮文档与代码必须使用 `track=local`，结论最多为 `local_verified`。

### Risk — 当前 Stage 1 生产级证据仍未闭环

Stage 1 的生产 backup/import/quarantine/restore/RPO/RTO 证据仍挂起，Gate B 仍为 `pending_production_evidence`。这不阻塞本地 Task 12 harness 代码实现，但阻塞任何生产 promotion、dashboard verified、OpenSpec archive。

### Risk — 资源指标需可测试且可复现

RSS、FD、WAL、MCP child count、admission/replay p95 等指标需要同时支持真实采样和测试注入。否则容易出现只能在长跑中发现 oracle 错误的问题。

## 最终建议

本轮实施采用 TDD，第一批只做 `Task 12A — local baseline report/oracle/seed harness`：

- 新增 shared schema 的 baseline report contract。
- 新增 Runtime baseline evaluator：固定 workload distribution（60/20/15/5）、tenant/user collision seed、p95 计算、10 个 30 秒采样点代表 5 分钟持续超限、hard-fail 一票否决、canonical report hash。
- 新增测试覆盖：hard failure FAIL、持续 5 分钟阈值超限 FAIL、非持续 spike 不 FAIL、local report 不允许 `pass`、workload mix deterministic。

## 后续门禁

- OpenSpec：沿用已批准 change `harden-agent-runtime-single-node-production`，无需新 proposal。
- Superpowers：执行 TDD；每个行为先 RED 再 GREEN。
- 验证：至少运行 shared-schema focused/full tests、agent-runtime focused tests/typecheck、OpenSpec validate、dashboard check、`git diff --check`。
- 禁止事项：不启动 24-hour soak；不把短基线标记为 formal soak；不触碰生产 SQLite/真实 Provider credential。
