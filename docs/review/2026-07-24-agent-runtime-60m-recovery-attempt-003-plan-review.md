# Agent Runtime 60 分钟恢复回归 attempt 003 执行前 Review

## 结论

**通过。** attempt 003 runner 与已评审版本相比仅补全两条 partial-index 查询谓词；RED、GREEN、query-plan、runner 装载和静态 diff 均已验证。可进入新的真实 preflight 与固定 60 分钟回归。

## Review 范围

- [attempt 002 失败 Review](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/docs/review/2026-07-24-agent-runtime-60m-recovery-attempt-002-failure-review.md)
- [attempt 003 delta plan](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/docs/superpowers/plans/2026-07-24-agent-runtime-60m-recovery-regression-attempt-003.md)
- [attempt 003 runner](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/docs/verification/agent-runtime-v1/gate-d/performance-recovery/gate-r4-20260724-003/run-60m-recovery-regression.ts)
- [attempt 003 MCP config](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/docs/verification/agent-runtime-v1/gate-d/performance-recovery/gate-r4-20260724-003/mcp-config.json)
- [attempt 002 SQLite RED/GREEN fixture](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/docs/verification/agent-runtime-v1/gate-d/performance-recovery/gate-r4-20260724-002/gate-r4-20260724-recovery-002.sqlite)
- [trace outbox index migration](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/agent-runtime/src/storage/runtimeStorage.ts)

冻结 SHA-256：

- attempt 003 plan：`52a9d502b5c23614ec3dcbdd821992ee979191ad3e688489794600dd98afec19`
- attempt 003 runner：`b213db1ba6cafae81274e3f9b0d96ecedb01bab3da2fd2c28d284e22c5962636`
- attempt 003 MCP config：`f9c1889b9def330ad57cdc1cfe8efd1325ad3f1651c4c302f29fc7c220490701`

## 主要发现

### Critical

无。

### Important

无未关闭项。

### 已关闭项

1. **RED：** attempt 002 的真实 v2 SQLite 对旧 pending/retry 强制索引 SQL 均返回 `no query solution`。
2. **GREEN：** 同一不可变数据库上的修正版 pending/retry 查询都返回 `0`；`EXPLAIN QUERY PLAN` 都显示 `SCAN runtime_events USING INDEX runtime_event_trace_outbox`。
3. **最小 diff：** attempt 003 runner 相对 attempt 001 runner 只有两处 predicate 增补，没有修改时长、样本数、workload、阈值、process lifecycle、凭据或 report 语义。
4. **Runtime 装载：** 从 `agent-runtime` cwd 使用 `node --import tsx` 实际装载 attempt 003 runner，按无参数预期返回脱敏 blocked 结果；语法与 loader resolution 正常。
5. **权限与静态检查：** MCP config 为 `0600`，`git diff --check` 通过。

### Advisory

attempt 002 第一批 formal-incremental oracle 读取 218,225 events、耗时约 452 ms，这是 observer timing 而不是 admission/replay threshold；attempt 003 将继续记录后续增量批次，最终 Review 必须同时报告 oracle peak 与 workload latency。

## 最终建议

按 [attempt 003 plan](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/docs/superpowers/plans/2026-07-24-agent-runtime-60m-recovery-regression-attempt-003.md) 从 `agent-runtime` cwd 执行。只有新的 Java/MCP/hash/fresh-path preflight 全部通过才启动正式命令；运行中不得继续修改 runner 或源码。

## 后续门禁

- **OpenSpec proposal：** 不需要新 proposal。
- **Superpowers plan：** attempt 003 plan 已批准执行。
- **测试：** 必须完成 120-sample 回归、证据结构/阈值复核、负向扫描、进程清理、当前源码全量验证与最终结果 Review。
- **人工审批：** 本地执行不需要额外审批；正式 Gate D promotion 仍受既有人工门禁约束。
- **归档：** 不得归档 active OpenSpec change，不得把本轮直接视为正式 Gate D PASS。
