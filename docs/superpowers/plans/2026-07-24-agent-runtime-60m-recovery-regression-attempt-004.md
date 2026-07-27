# Agent Runtime 固定 60 分钟恢复回归 attempt 004

> 模式：OpenSpec 精简模式；这是 transaction batching、storage pressure production wiring 与 Java trace capacity 修复后的唯一最终恢复回归。

## 目标

在当前最终源码上重新执行 attempt 003 的固定真实 workload、120 × 30 秒采样、阈值与 hard-fail oracle，验证：

1. trace outbox batch acknowledgement 是否消除 admission sustained breach；
2. WAL/low-disk production monitor 是否在真实运行中保持健康且不破坏 admission/readiness；
3. Java trace sink 是否保持存活、heap 行为有界且默认日志不再线性输出完整 events；
4. Runtime/Java/MCP/outbox/incremental oracle 是否完整清理并生成不可覆盖证据。

## 依据

- [attempt 003 结果 Review](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/docs/review/2026-07-24-agent-runtime-60m-recovery-result-review.md)
- [Admission batching 实现 Review](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/docs/review/2026-07-24-agent-runtime-admission-write-contention-recovery-implementation-review.md)
- [Storage pressure 实现 Review](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/docs/review/2026-07-24-agent-runtime-storage-pressure-production-wiring-implementation-review.md)
- [Java trace capacity 实现 Review](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/docs/review/2026-07-24-java-trace-sink-capacity-recovery-implementation-review.md)
- [attempt 003 runner](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/docs/verification/agent-runtime-v1/gate-d/performance-recovery/gate-r4-20260724-003/run-60m-recovery-regression.ts)

## 冻结输入

- runId：`gate-r4-20260724-recovery-004`
- invocation cwd：[agent-runtime](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/agent-runtime)
- runner：复用只读 [attempt 003 runner](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/docs/verification/agent-runtime-v1/gate-d/performance-recovery/gate-r4-20260724-003/run-60m-recovery-regression.ts)
- MCP config：[attempt 004 mcp-config.json](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/docs/verification/agent-runtime-v1/gate-d/performance-recovery/gate-r4-20260724-004/mcp-config.json)
- Java URL：`http://127.0.0.1:18084`
- Runtime URL：`http://127.0.0.1:3102`
- Java logging：默认 INFO；禁止启用 `TraceService` DEBUG。

复用 runner 不代表复用结果。runner 自身 hash、当前 source hash、本 plan hash 与 attempt 004 MCP hash 必须由新 preflight 重新绑定；所有输出路径必须不存在。

## 新证据路径

- SQLite：[gate-r4-20260724-recovery-004.sqlite](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/docs/verification/agent-runtime-v1/gate-d/performance-recovery/gate-r4-20260724-004/gate-r4-20260724-recovery-004.sqlite)
- Report：[gate-r4-20260724-recovery-004-report.json](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/docs/verification/agent-runtime-v1/gate-d/performance-recovery/gate-r4-20260724-004/gate-r4-20260724-recovery-004-report.json)
- Journal：[gate-r4-20260724-recovery-004-journal.jsonl](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/docs/verification/agent-runtime-v1/gate-d/performance-recovery/gate-r4-20260724-004/gate-r4-20260724-recovery-004-journal.jsonl)
- Java log：[java-gateway-18084.log](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/docs/verification/agent-runtime-v1/gate-d/performance-recovery/gate-r4-20260724-004/java-gateway-18084.log)

## 执行序列

1. chmod MCP config 为 `0600`，确认四个 output 不存在，端口 `18084`/`3102` 空闲，磁盘 headroom 足够。
2. 计算并在 preflight Review 固定 source/runner/plan/MCP SHA-256；确认当前 full verification、Java 210 与 Integration 17 均为 PASS。
3. 启动唯一 Java Gateway，默认 INFO 写入全新 Java log；验证 actuator health、PID 与命令指纹。
4. 从 `agent-runtime` cwd 执行 runner `--validate-only`，观察 `preflight_completed/result=ok` 与四个 hash 一致。
5. 使用相同参数移除 `--validate-only` 正式执行；观察 `runtime_started`、`seed_completed` 与 120 个真实样本。
6. 运行中禁止修改 SOURCE_TARGETS、runner、plan、MCP config 或阈值；任一 hard failure按 runner fail-close。
7. 自然结束后停止 Java，确认 Runtime/MCP/Java 进程与端口清理；复核 report/journal/SQLite integrity、source start/end hash、credential negative scan、Java log growth和固定 oracle。
8. 仅在 exit `0`、report `local_verified`、120 samples、failures 空、证据完整时写结果 Review。

## 完成边界

attempt 004 PASS 只形成最新 `local_verified` 恢复证据。它不能替代：

- 正式 24 小时 Gate D；
- 2h/12h/22h Runtime restart schedule；
- warm-up 后首尾各 2 小时资源增长；
- Gate D start approval 与 post-result human promotion approval；
- dashboard `verified`、OpenSpec archive 或正式生产推广。
