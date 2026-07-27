# Agent Runtime 60 分钟恢复回归 attempt 004 执行前 Review

## 结论

**通过。** attempt 004 当前 source、runner、plan、MCP config、Java Gateway、端口、磁盘与 fresh output preflight 均已通过，可以启动唯一一次固定 60 分钟正式恢复回归。

## Review 范围

- [attempt 004 plan](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/docs/superpowers/plans/2026-07-24-agent-runtime-60m-recovery-regression-attempt-004.md)
- [复用的 attempt 003 runner](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/docs/verification/agent-runtime-v1/gate-d/performance-recovery/gate-r4-20260724-003/run-60m-recovery-regression.ts)
- [attempt 004 MCP config](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/docs/verification/agent-runtime-v1/gate-d/performance-recovery/gate-r4-20260724-004/mcp-config.json)
- [attempt 004 evidence directory](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/docs/verification/agent-runtime-v1/gate-d/performance-recovery/gate-r4-20260724-004)
- [Admission batching Review](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/docs/review/2026-07-24-agent-runtime-admission-write-contention-recovery-implementation-review.md)
- [Storage pressure Review](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/docs/review/2026-07-24-agent-runtime-storage-pressure-production-wiring-implementation-review.md)
- [Java trace capacity Review](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/docs/review/2026-07-24-java-trace-sink-capacity-recovery-implementation-review.md)
- [Java service token Review](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/docs/review/2026-07-24-java-service-token-production-wiring-implementation-review.md)

## 冻结哈希

- source state：`134d14a6757b2e9da3fb0197dbf1cc68412133a46c6d7ab536dd6de0fe3958c3`
- runner：`b213db1ba6cafae81274e3f9b0d96ecedb01bab3da2fd2c28d284e22c5962636`
- plan：`e61483e7b898b275726a18c0e809aeacc0520a123716ff7617d68e0c8395ed06`
- MCP config：`05dfe50604bb56e4498f051cdf11016d2d93411a24ac06152776841dd60da0ad`

## 主要发现

### Critical

无。

### Important

无未关闭项。

### 已关闭项

1. 第一次 `--validate-only` 使用非默认本地 token 时，被旧 Java hardcoded development token fail-close。SQLite/report/journal 均未创建，旧 source hash 不得使用。
2. Java token production wiring 已按 TDD 修复并通过 Java 213 tests 与 Integration 17 tests；旧 Java 启动日志保留为 [preflight auth mismatch log](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/docs/verification/agent-runtime-v1/gate-d/performance-recovery/gate-r4-20260724-004/preflight-auth-mismatch-java-gateway-18084.log)，没有覆盖或混入正式 Java log。
3. 修复后以非默认本地 token 重启唯一 Java Gateway，`actuator/health=UP`，listener PID `7458`，命令行仅包含 `--server.port=18084`，未在 argv 暴露 token。
4. fresh `--validate-only` 返回 `preflight_completed/result=ok`，四个 hash 与本 Review 一致；Java deterministic fixtures 与真实 MCP stdio fixture均通过。
5. MCP config mode 为 `0600`；正式 Java log 未启用 `TraceService` DEBUG，也不存在 `trace_event=` marker。
6. Runtime port `3102` 空闲；attempt 004 SQLite/report/journal 均不存在。
7. 可用磁盘约 `145 GiB`，高于当前文件系统 10% low watermark；attempt 003 一小时 SQLite 增长约 4 GiB，当前 headroom 满足本次固定回归。
8. 当前源码验证：workspace 741 tests PASS、workspace typecheck PASS、Java 213 tests PASS、Integration 17 tests PASS、OpenSpec strict PASS、dashboard check PASS、`git diff --check` PASS。

### Advisory

正式 runner 会再次在启动时计算 hash 和 fresh-path preflight；本 Review 不绕过 runner 内部门禁。任何源文件、runner、plan、MCP config 或输出路径变化都必须阻止启动。

## 最终建议

从 [agent-runtime](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/agent-runtime) cwd 使用相同参数启动正式命令。运行期间保持 Java INFO、禁止修改冻结输入；只在自然结束后做证据与结果 Review。

## 后续门禁

- **OpenSpec proposal：** 不需要新增。
- **Superpowers plan：** attempt 004 plan 已批准。
- **测试：** 120 samples、固定 oracle、证据完整性、负向扫描与清理均必须通过。
- **人工审批：** 本地回归无需；正式 24 小时 Gate D start/promotion approval 不变。
- **归档 / dashboard：** 不得因本轮自动归档或同步为 `verified`。
