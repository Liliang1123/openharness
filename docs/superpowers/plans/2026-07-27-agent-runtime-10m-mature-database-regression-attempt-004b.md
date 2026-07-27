# Agent Runtime 10 分钟成熟数据库回归 Attempt004b

> OpenSpec 精简模式；Attempt004 因旧 30 秒 supervisor readiness 窗口在 workload 前误判。本计划在已 TDD 修复为 180 秒后使用全新证据重跑一次，不复用 Attempt004 输出。

## 依据

- [Attempt004 Result Review](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/docs/review/2026-07-27-agent-runtime-10m-mature-database-regression-attempt-004-result-review.md)
- [Readiness window Implementation Review](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/docs/review/2026-07-27-gate-d-worker-startup-readiness-window-implementation-review.md)
- [Attempt004 Plan](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/docs/superpowers/plans/2026-07-27-agent-runtime-10m-mature-database-regression-attempt-004.md)
- [Attempt004b runner](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/docs/verification/agent-runtime-v1/gate-d/performance-recovery/gate-r5-20260727-004b/run-10m-mature-database-regression.ts)

## 冻结合同

- runId：`gate-r5-20260727-mature-004b`
- runner SHA-256：`6bdfa8e6b6e5d15631e779e749ebcf181851641a81730f909edb0d3eb1a12460`
- mature source SHA-256：`f4a8e3b227b9947828c19cca45151635e43657e4b1fc22a95e3ff1c2f5a7ec7a`
- MCP SHA-256：`c89ad2675d12a2d6376b3eb4b48f5419ef3bd557a75910455fae37ae02c65dfc`
- Java/Runtime：`127.0.0.1:18084` / `127.0.0.1:3102`
- workload、20 × 30 秒、100ms admission、250ms replay、连续超限 2、30% improvement、oracle/outbox/integrity/cleanup：与 Attempt004 完全相同。
- 唯一生产源码差异：supervisor pre-workload readiness default 由 30 秒扩大为 180 秒；不得再改 source、runner、threshold 或 output。

## 新证据

- [Evidence directory](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/docs/verification/agent-runtime-v1/gate-d/performance-recovery/gate-r5-20260727-004b)
- [Report](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/docs/verification/agent-runtime-v1/gate-d/performance-recovery/gate-r5-20260727-004b/gate-r5-20260727-mature-004b-report.json)
- [Journal](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/docs/verification/agent-runtime-v1/gate-d/performance-recovery/gate-r5-20260727-004b/gate-r5-20260727-mature-004b-journal.jsonl)
- [Java log](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/docs/verification/agent-runtime-v1/gate-d/performance-recovery/gate-r5-20260727-004b/java-gateway-18084.log)
- Fresh clone：由 Preflight 写入新的精确 `file:///private/tmp/openharness-gate-r5.<suffix>/gate-r5-20260727-mature-004b.sqlite`。

## 执行

1. Fresh clone/hash/integrity/10,000 scopes/dead-letter、fresh outputs、ports、MCP 0600、disk 检查。
2. 启动唯一 Java，执行完全绑定的 `--validate-only`，落盘 Preflight Review。
3. 使用相同参数移除 `--validate-only`，只运行一次；不得自动重试。
4. PASS 需要 20/20、所有冻结性能/correctness/resource/Worker/queue/heartbeat oracle、source bindings 和 cleanup。
5. PASS 后才完成 4.1d 并准备正式 Attempt005；FAIL 则保持 Dashboard `proposed`。

Git、正式 Gate D、promotion、archive 不在本计划授权范围。
