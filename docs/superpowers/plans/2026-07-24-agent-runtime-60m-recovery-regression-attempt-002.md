# Agent Runtime 固定 60 分钟恢复回归 attempt 002

> 模式：OpenSpec 精简模式；这是 attempt 001 的单点执行环境修正版。

## 目标与边界

继续执行 [原固定 60 分钟计划](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/docs/superpowers/plans/2026-07-24-agent-runtime-60m-recovery-regression.md) 的全部 workload、采样、阈值、失败关闭、证据绑定和 `local_verified_only` 约束，只修正 [attempt 001 失败 Review](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/docs/review/2026-07-24-agent-runtime-60m-recovery-attempt-001-failure-review.md) 已确认的 loader cwd。

不修改 production source，不修改 attempt 001 runner，不复用 attempt 001 runId/SQLite/report/journal/Java log，不重跑任何历史 Gate R1 诊断或迁移演练。

## attempt 002 冻结值

| 字段 | 值 |
| --- | --- |
| runId | `gate-r4-20260724-recovery-002` |
| Java URL | `http://127.0.0.1:18084` |
| Runtime URL | `http://127.0.0.1:3102` |
| runner | [attempt 001 runner，read-only reuse](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/docs/verification/agent-runtime-v1/gate-d/performance-recovery/gate-r4-20260724-001/run-60m-recovery-regression.ts) |
| invocation cwd | [agent-runtime](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/agent-runtime) |
| MCP config | [attempt 002 mcp-config.json](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/docs/verification/agent-runtime-v1/gate-d/performance-recovery/gate-r4-20260724-002/mcp-config.json) |

## 单点修正

调用 `tsx` 前必须先进入 [agent-runtime](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/agent-runtime)。runner 随后生成的 Runtime child 继承该 cwd，使 `node --import tsx` 从已安装的 `agent-runtime/node_modules` 解析。除 cwd 外，runner 参数和行为保持不变。

## 执行序列

1. 确认 [attempt 002 preflight Review](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/docs/review/2026-07-24-agent-runtime-60m-recovery-attempt-002-plan-review.md) 为“通过”。
2. 确认 attempt 001 进程已清理、attempt 001 证据未改变、attempt 002 四个输出均不存在。
3. 以固定 Maven 3.9.16 启动唯一 Java Gateway，日志写入 attempt 002 新 Java log。
4. 从 AuthFilter 读取 token 到环境，不打印；进入 `agent-runtime` cwd。
5. 使用 attempt 002 全套路径运行 runner `--validate-only`，核对 source/runner/plan/MCP config SHA。
6. 仍在同一 cwd、使用同一参数去掉 `--validate-only`；Runtime authenticated readiness 成功后 seed 10,000 scopes，再开始 120 × 30 秒固定采样。
7. 执行期间不修改任何冻结输入；每个 checkpoint 观察 hard failure、admission/replay、RSS/FD/WAL、trace backlog/dead-letter。
8. 自然结束后停止 Java，确认端口和子进程清理；执行 report/journal/Java log 负向扫描、结果统计、当前源码全量验证和最终结果 Review。

## attempt 002 新证据

- SQLite：[gate-r4-20260724-recovery-002.sqlite](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/docs/verification/agent-runtime-v1/gate-d/performance-recovery/gate-r4-20260724-002/gate-r4-20260724-recovery-002.sqlite)
- Report：[gate-r4-20260724-recovery-002-report.json](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/docs/verification/agent-runtime-v1/gate-d/performance-recovery/gate-r4-20260724-002/gate-r4-20260724-recovery-002-report.json)
- Journal：[gate-r4-20260724-recovery-002-journal.jsonl](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/docs/verification/agent-runtime-v1/gate-d/performance-recovery/gate-r4-20260724-002/gate-r4-20260724-recovery-002-journal.jsonl)
- Java log：[java-gateway-18084.log](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/docs/verification/agent-runtime-v1/gate-d/performance-recovery/gate-r4-20260724-002/java-gateway-18084.log)

## 完成边界

完成条件与原计划相同：exit `0`、`local_verified`、120 samples、无 failure、冻结哈希一致、负向扫描通过、进程清理完成。attempt 002 仍不能替代正式 24 小时 Gate D、restart schedule、2 小时资源增长窗口或低磁盘/WAL admission contract 复核。
