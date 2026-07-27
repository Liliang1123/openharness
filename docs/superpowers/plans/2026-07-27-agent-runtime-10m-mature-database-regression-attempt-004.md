# Agent Runtime 10 分钟成熟数据库回归 Attempt004

> 模式：OpenSpec 精简模式。本 packet 只验证 dedicated SQLite Worker 实现后的成熟库资格；不重复 R6–R9，也不授权 Attempt005 正式运行。

## 目标

在 Attempt003 冻结的成熟数据库、真实 Runtime workload、20 × 30 秒采样、admission/replay threshold、incremental correctness oracle、source/evidence binding 与 cleanup 约束上运行一次全新回归，验证 SQLite 全部移入 Worker 后：

1. admission median/p95 和连续超限满足冻结门槛；
2. durable replay、tenant scope、event order、outbox、integrity 与资源 oracle 保持 clean；
3. Worker readiness 不出现 unavailable，队列不出现 full；
4. 复用既有每样本 readiness probe，额外记录其 HTTP round-trip 作为 main-thread heartbeat metric，不增加采样请求、不改变业务 workload 或 admission/replay threshold。

## 依据

- [Worker Implementation Review](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/docs/review/2026-07-27-agent-runtime-sqlite-storage-worker-implementation-review.md)
- [Attempt003 Preflight Review](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/docs/review/2026-07-24-agent-runtime-10m-mature-database-regression-attempt-003-preflight-review.md)
- [Attempt003 Result Review](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/docs/review/2026-07-24-agent-runtime-10m-mature-database-regression-attempt-003-result-review.md)
- [Attempt004 mature source database](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/docs/verification/agent-runtime-v1/gate-d/performance-recovery/gate-r4-20260724-004/gate-r4-20260724-recovery-004.sqlite)
- [Attempt004 runner](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/docs/verification/agent-runtime-v1/gate-d/performance-recovery/gate-r5-20260727-004/run-10m-mature-database-regression.ts)
- [Frozen MCP config](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/docs/verification/agent-runtime-v1/gate-d/performance-recovery/gate-r5-20260724-001/mcp-config.json)

## 冻结输入

- runId：`gate-r5-20260727-mature-004`
- invocation cwd：[agent-runtime](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/agent-runtime)
- Java URL：`http://127.0.0.1:18084`
- Runtime URL：`http://127.0.0.1:3102`
- duration/sample：`600000ms` / `30000ms`，共 20 samples
- workload：10,000 seeded conversations、20 concurrency、60/20/15/5 mix，不 seed、不清空
- source database SHA-256：`f4a8e3b227b9947828c19cca45151635e43657e4b1fc22a95e3ff1c2f5a7ec7a`
- Attempt004 recovery last-quartile admission median：`182.760ms`
- improvement floor：30%

新 runner 从 Attempt003 runner 复制并只增加 readiness response reason 与该既有 probe 的 round-trip heartbeat 记录。它不得修改 DURATION、sample interval、workload、threshold、outbox、oracle、source targets、fail-close 或 no-overwrite 语义。

## 冻结资格

必须同时满足：

1. 20/20 samples，实际 sampling duration 不短于 10 分钟；
2. admission median `<=100ms`，最长连续 `>100ms` 不超过 2；
3. durable replay median `<=250ms`，最长连续 `>250ms` 不超过 2；
4. 相对 `182.760ms` 改善至少 30%；
5. 每个 sample 无 correctness/readiness/process/credential hard failure；
6. Worker unavailable samples = 0，queue-full samples = 0；
7. heartbeat 20/20 可读取并落盘；它是观测指标，不修改冻结 admission/replay threshold；
8. final outbox pending/retry/dead-letter clean、SQLite integrity `ok`；
9. Runtime/Java/MCP/clone cleanup 完成，source/runner/plan/MCP hash start/end 不漂移。

## 新证据

- Evidence directory：[gate-r5-20260727-004](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/docs/verification/agent-runtime-v1/gate-d/performance-recovery/gate-r5-20260727-004)
- Report：[gate-r5-20260727-mature-004-report.json](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/docs/verification/agent-runtime-v1/gate-d/performance-recovery/gate-r5-20260727-004/gate-r5-20260727-mature-004-report.json)
- Journal：[gate-r5-20260727-mature-004-journal.jsonl](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/docs/verification/agent-runtime-v1/gate-d/performance-recovery/gate-r5-20260727-004/gate-r5-20260727-mature-004-journal.jsonl)
- Java log：[java-gateway-18084.log](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/docs/verification/agent-runtime-v1/gate-d/performance-recovery/gate-r5-20260727-004/java-gateway-18084.log)
- 成熟 SQLite clone：Preflight 创建后以精确 `file:///private/tmp/openharness-gate-r5.<suffix>/gate-r5-20260727-mature-004.sqlite` 路径写入 Review；运行后删除该精确临时目录。

## 执行序列

1. Review runner diff，只允许 Worker/queue/heartbeat evidence 增量；运行 loader probe。
2. 创建全新的 APFS clone，校验 source/clone hash、4,092,854,272 bytes、10,000 scoped conversations、integrity 与 dead-letter。
3. 确认 report/journal/Java log 不存在，MCP mode `0600`，端口 18084/3102 空闲且磁盘 headroom 足够。
4. 启动唯一 Java Gateway，使用非默认本地 service token，日志写入新路径；验证 health、fixture 与命令指纹。
5. 从固定 cwd 执行 `--validate-only`；把 source/runner/plan/MCP/clone hash 与 clone 精确路径写入 Preflight Review。
6. Preflight Review 结论为“通过”后，使用完全相同参数移除 `--validate-only`，只运行一次。
7. 每 30 秒报告 admission/replay、resource/oracle/outbox 与 Worker/queue/heartbeat metrics；任何 hard failure fail-close。
8. 自然结束后停止 Java，校验 report/journal/hash/integrity/credential scan 与全部 cleanup，落盘 Result Review。

## 状态边界

- PASS 只允许完成 OpenSpec 4.1d、把本地 implementation qualification 记为已通过，并准备 Attempt005 Plan/Preflight。
- 当前 active change 仍包含正式 24 小时 Gate D、promotion、全生产资格、freeze 与 archive，Dashboard 不因本计划自动升级。
- FAIL 时保持 4.1d 未完成和 Dashboard `proposed`，不得准备或启动 Attempt005。
- Git add/commit/push/reset/clean、PR、发布和正式 Gate D 均不在本计划授权范围。
