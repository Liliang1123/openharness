# Agent Runtime 固定 60 分钟恢复回归执行计划

> 模式：OpenSpec 精简模式；适用 change：`harden-agent-runtime-single-node-production`

## 目标

在不修改已通过实现 Review 的生产源代码、不复用任何历史运行证据的前提下，以真实 Java Gateway、真实 production Runtime、真实 stdio MCP fixture 和新建 SQLite 完成一次固定 60 分钟连续恢复回归，验证性能恢复实现可以进入本地 `local_verified` 状态。

本轮不是正式 24 小时 Gate D，不执行 restart schedule，不产生 production promotion，也不勾选 OpenSpec Gate D 剩余任务。

## 冻结输入

- 项目 worktree：[agent-runtime-completion](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion)
- OpenSpec change：[harden-agent-runtime-single-node-production](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/openspec/changes/harden-agent-runtime-single-node-production)
- 已通过的实现 Review：[performance recovery implementation review](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/docs/review/2026-07-24-agent-runtime-performance-recovery-implementation-review.md)
- 本轮执行器：[run-60m-recovery-regression.ts](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/docs/verification/agent-runtime-v1/gate-d/performance-recovery/gate-r4-20260724-001/run-60m-recovery-regression.ts)
- 本轮 MCP 配置：[mcp-config.json](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/docs/verification/agent-runtime-v1/gate-d/performance-recovery/gate-r4-20260724-001/mcp-config.json)
- Java URL：`http://127.0.0.1:18084`
- Runtime URL：`http://127.0.0.1:3102`
- runId：`gate-r4-20260724-recovery-001`

执行器在开始与结束时分别计算 production Runtime、shared schema、MCP fixture、Java source、构建清单和自身文件的 SHA-256；任一冻结输入在运行期间变化即硬失败。

## 固定 workload 与采样

| 参数 | 固定值 |
| --- | ---: |
| sampling duration | 3,600,000 ms |
| sample interval | 30,000 ms |
| required samples | 120 |
| seeded scoped conversations | 10,000 |
| concurrency | 20 |
| no-tool | 60% |
| Java sandbox | 20% |
| MCP | 15% |
| approval interruption | 5% |
| database oracle | `formal-incremental` |

60 分钟从 continuous workload 启动后计时，不包含 Java 启动、Runtime migration/readiness 和 seed 时间。

## 固定准入与失败策略

1. Java actuator health、Java deterministic fixtures、MCP qualification fixture、端口唯一性、MCP 配置权限和所有新输出路径先完成 preflight。
2. SQLite、journal、report、Java log 均使用新路径；任何已存在文件都阻断执行，不覆盖、不续写、不删除失败证据。
3. 使用 Runtime production profile，dispatcher 是 trace 的唯一生产投递者。
4. 每个样本采集 admission p95、durable replay p95、Runtime RSS、open FD、WAL、MCP child count、authenticated readiness、scope isolation、formal-incremental oracle、trace outbox backlog/dead-letter、数据库 rowid 高水位和 Java log bytes。
5. 标准 Runtime 阈值沿用当前固定值：
   - admission p95 ≤ 100 ms；
   - durable replay p95 ≤ 250 ms；
   - RSS ≤ 1.5 GiB；
   - open FD ≤ 1,024；
   - WAL ≤ 256 MiB；
   - MCP child count ≤ 1（本轮配置只有一个 server）。
6. 性能/资源阈值连续 10 个样本超限才构成 5 分钟 sustained failure；trace pending + retry backlog 连续 10 个样本超过 1,000 也构成本地恢复硬失败。
7. dead-letter、readiness degraded、Runtime/Java 退出、scope isolation、event ordering、secret canary、SQLite busy exhaustion、孤儿 approval、重复 durable event、采样缺失和证据绑定变化为立即硬失败。
8. 任一立即硬失败后停止采样并安全关闭 workload、Runtime 与 MCP 子进程；仍写入不可覆盖的失败 report/journal。

## 执行步骤

### 1. 静态与 preflight

1. 确认 [preflight Review](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/docs/review/2026-07-24-agent-runtime-60m-recovery-regression-plan-review.md) 结论为“通过”。
2. 确认 `18084`、`3102` 无监听者，151 GiB 级可用空间未显著下降，历史 Gate R1 目录保持只读语义。
3. 用固定 Maven 3.9.16 在 `18084` 启动 Java Gateway，并将 stdout/stderr 写入本轮新 Java log。
4. 从本地 Java AuthTokenFilter 读取 service token 到进程环境；不得打印、写入参数或证据。
5. 运行执行器 `--validate-only`；只有 exit `0` 才进入正式回归。

### 2. 固定 60 分钟回归

以相同参数去掉 `--validate-only` 启动执行器。执行期间：

- 不修改 production source、shared schema、MCP fixture、Java source、本计划、执行器或 MCP 配置；
- 不启动第二个诊断/回归/Runtime；
- 不运行会写入本轮 SQLite 的外部命令；
- 每 30 秒观察执行器的脱敏 checkpoint；
- Java 或 Runtime ownership 不匹配时立即停止。

### 3. 收口与验收

1. 执行器必须自然退出 `0`，report 必须为 `local_verified`、恰好 120 samples、无 failure。
2. 停止 Java Gateway，确认 `18084`、`3102` 均释放且无遗留 Runtime/MCP 子进程。
3. 对 report、journal、Java log 进行 token、Bearer、`sk-` 和 canary 负向扫描；真实 token 不得输出到终端。
4. 记录 Java log 总增长、outbox 最大/末值、RSS/FD/WAL 首末与峰值、admission/replay 首尾窗口中位数。
5. 运行当前源码全量验证；只验证，不重跑历史诊断或迁移演练。
6. 在 [docs/review](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/docs/review) 落盘最终 60 分钟结果 Review。

## 本轮证据

- SQLite：[gate-r4-20260724-recovery-001.sqlite](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/docs/verification/agent-runtime-v1/gate-d/performance-recovery/gate-r4-20260724-001/gate-r4-20260724-recovery-001.sqlite)
- Report：[gate-r4-20260724-recovery-001-report.json](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/docs/verification/agent-runtime-v1/gate-d/performance-recovery/gate-r4-20260724-001/gate-r4-20260724-recovery-001-report.json)
- Journal：[gate-r4-20260724-recovery-001-journal.jsonl](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/docs/verification/agent-runtime-v1/gate-d/performance-recovery/gate-r4-20260724-001/gate-r4-20260724-recovery-001-journal.jsonl)
- Java log：[java-gateway-18084.log](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/docs/verification/agent-runtime-v1/gate-d/performance-recovery/gate-r4-20260724-001/java-gateway-18084.log)

## 完成边界

本计划完成只证明性能恢复实现通过一次固定本地真实边界回归。正式 24 小时 Gate D、restart schedule、2 小时资源增长窗口、低磁盘/WAL admission contract 复核和最终 production promotion 仍保持未完成，必须继续遵守既有 OpenSpec 与人工 promotion 门禁。
