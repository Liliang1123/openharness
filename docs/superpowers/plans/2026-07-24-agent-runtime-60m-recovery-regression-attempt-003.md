# Agent Runtime 固定 60 分钟恢复回归 attempt 003

> 模式：OpenSpec 精简模式；这是 attempt 002 的单点观察器 SQL 修正版。

## 目标与边界

继续执行 [原固定 60 分钟计划](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/docs/superpowers/plans/2026-07-24-agent-runtime-60m-recovery-regression.md) 的全部固定 workload、阈值、采样和 `local_verified_only` 约束。依据 [attempt 002 失败 Review](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/docs/review/2026-07-24-agent-runtime-60m-recovery-attempt-002-failure-review.md)，只修正 runner 的两条 trace backlog 只读 SQL。

不修改 production source、schema、partial index、workload、阈值、oracle 或失败语义；不复用 attempt 001/002 的 runId 或任何输出。

## 冻结输入

- runId：`gate-r4-20260724-recovery-003`
- invocation cwd：[agent-runtime](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/agent-runtime)
- runner：[attempt 003 runner](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/docs/verification/agent-runtime-v1/gate-d/performance-recovery/gate-r4-20260724-003/run-60m-recovery-regression.ts)
- MCP config：[attempt 003 mcp-config.json](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/docs/verification/agent-runtime-v1/gate-d/performance-recovery/gate-r4-20260724-003/mcp-config.json)
- Java URL：`http://127.0.0.1:18084`
- Runtime URL：`http://127.0.0.1:3102`

runner 与 attempt 001 版本只能有两处语义差异：pending/retry 查询都显式包含 partial index 的完整 `kind='trace' AND delivery_status IN ('pending','retry')` predicate，再分别附加 `delivery_status='pending'` 或 `delivery_status='retry'`。

## 执行序列

1. 确认 [attempt 003 preflight Review](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/docs/review/2026-07-24-agent-runtime-60m-recovery-attempt-003-plan-review.md) 为“通过”。
2. 确认 attempt 001/002 进程已清理、失败证据未变，attempt 003 SQLite/report/journal/Java log 均不存在。
3. 启动唯一 Java Gateway，写入 attempt 003 新 Java log；验证 actuator health、唯一 PID 与命令指纹。
4. 从 `agent-runtime` cwd 运行 `--validate-only`，绑定 source/runner/plan/MCP SHA、Java fixtures、MCP fixture、端口和权限。
5. 以同一 cwd、同一参数启动正式命令；观察 `runtime_started`、`seed_completed`，随后执行 120 × 30 秒真实样本。
6. 运行期间不修改任何冻结输入；任一 hard failure 按 runner 既有策略 fail-close。
7. 自然结束后停止 Java，完成端口/进程清理、report 结构与统计、token/Bearer/`sk-`/canary 负向扫描、当前源码全量验证和结果 Review。

## attempt 003 新证据

- SQLite：[gate-r4-20260724-recovery-003.sqlite](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/docs/verification/agent-runtime-v1/gate-d/performance-recovery/gate-r4-20260724-003/gate-r4-20260724-recovery-003.sqlite)
- Report：[gate-r4-20260724-recovery-003-report.json](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/docs/verification/agent-runtime-v1/gate-d/performance-recovery/gate-r4-20260724-003/gate-r4-20260724-recovery-003-report.json)
- Journal：[gate-r4-20260724-recovery-003-journal.jsonl](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/docs/verification/agent-runtime-v1/gate-d/performance-recovery/gate-r4-20260724-003/gate-r4-20260724-recovery-003-journal.jsonl)
- Java log：[java-gateway-18084.log](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/docs/verification/agent-runtime-v1/gate-d/performance-recovery/gate-r4-20260724-003/java-gateway-18084.log)

## 完成边界

exit `0`、`local_verified`、120 samples、无 failure、冻结哈希一致、负向扫描通过、进程清理完成才算 attempt 003 通过。结果仍不得替代正式 24 小时 Gate D、restart schedule、首尾各 2 小时资源增长或低磁盘/WAL admission contract。
