# Agent Runtime 10 分钟成熟数据库回归 Attempt004 Plan Review

## 结论

通过。Attempt004 packet 完整复用 Attempt003 的成熟库 workload、20 × 30 秒采样、资格阈值、incremental oracle、source binding、fail-close 与 cleanup 语义；runner 差异仅扩展既有 readiness probe 的 reason/round-trip evidence，不增加请求、不修改 admission/replay threshold，可进入 clone、Java 与 `--validate-only` Preflight。

## Review 范围

- [Attempt004 plan](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/docs/superpowers/plans/2026-07-27-agent-runtime-10m-mature-database-regression-attempt-004.md)
- [Attempt004 runner](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/docs/verification/agent-runtime-v1/gate-d/performance-recovery/gate-r5-20260727-004/run-10m-mature-database-regression.ts)
- [Attempt003 frozen runner](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/docs/verification/agent-runtime-v1/gate-d/performance-recovery/gate-r5-20260724-001/run-10m-mature-database-regression.ts)
- [Frozen MCP config](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/docs/verification/agent-runtime-v1/gate-d/performance-recovery/gate-r5-20260724-001/mcp-config.json)
- [Mature source database](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/docs/verification/agent-runtime-v1/gate-d/performance-recovery/gate-r4-20260724-004/gate-r4-20260724-recovery-004.sqlite)
- [Worker Implementation Review](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/docs/review/2026-07-27-agent-runtime-sqlite-storage-worker-implementation-review.md)

## 主要发现

### Critical / High

无。

### Medium

1. Runner diff 未修改 `DURATION_MS=600000`、`SAMPLE_INTERVAL_MS=30000`、10,000/20/60-20-15-5 workload、100ms/250ms thresholds、30% improvement floor、oracle SQL、no-overwrite、credential scan 或 cleanup。
2. 新增的 `storageWorkerReady/storageWorkerReason/mainThreadHeartbeatMs` 来自原 runner 已有的每样本 authenticated readiness request；不添加额外探针流量。
3. `RUNTIME_STORAGE_QUEUE_FULL` 或 `RUNTIME_STORAGE_UNAVAILABLE` 会保留具体 hard failure，同时继续保留原 `RUNTIME_READINESS_DEGRADED`，符合 4.1d 的 no worker/queue failure 资格。
4. Report environment 新增 20-sample Worker/queue count 和 heartbeat median/max；heartbeat 仅作观测，不放宽或替代 frozen admission/replay threshold。

### Low

1. Runner loader import probe exit 0。
2. 输出路径使用新的 `gate-r5-20260727-004` 目录；未复用 Attempt001–003 report/journal/log。
3. 本计划不运行正式 24 小时 Gate D，不修改项目规则，不授权 Git 或发布。

## 冻结哈希

- Runner SHA-256：`6bdfa8e6b6e5d15631e779e749ebcf181851641a81730f909edb0d3eb1a12460`
- Plan SHA-256：`290f42270187e9f72daf755c186d0357fde35e81a2b349fcfb597fb36753aba5`
- MCP config SHA-256：`c89ad2675d12a2d6376b3eb4b48f5419ef3bd557a75910455fae37ae02c65dfc`
- Mature source database SHA-256：`f4a8e3b227b9947828c19cca45151635e43657e4b1fc22a95e3ff1c2f5a7ec7a`
- `git diff --check`：通过。

## 最终建议

创建全新的 APFS clone，启动唯一 Java Gateway，然后使用最终 plan hash 执行一次 `--validate-only`。只有精确 clone path、hash、10,000 scopes、integrity、ports、Java/MCP fixtures、fresh outputs 与 source binding 全部通过后，才落盘 Preflight Review 并运行。

## 后续门禁

- OpenSpec：无需新增 proposal；4.1d 仍未完成。
- Superpowers：Preflight Review 必须为“通过”。
- 测试：正式运行只能一次；失败不得自动重试。
- Dashboard：保持 `proposed`。
