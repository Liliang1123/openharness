# Agent Runtime 10 分钟成熟数据库回归 Attempt004 Preflight Review

## 结论

通过。允许对 `gate-r5-20260727-mature-004` 执行唯一一次固定 10 分钟正式回归。当前 clone、source/runner/plan/MCP binding、Java/MCP fixtures、端口、权限、fresh outputs、磁盘、10,000 scopes、integrity 与 dead-letter preflight 全部通过；本结论不授权 Attempt005 或正式 24 小时 Gate D。

## Review 范围

- [Attempt004 plan](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/docs/superpowers/plans/2026-07-27-agent-runtime-10m-mature-database-regression-attempt-004.md)
- [Attempt004 Plan Review](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/docs/review/2026-07-27-agent-runtime-10m-mature-database-regression-attempt-004-plan-review.md)
- [Attempt004 runner](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/docs/verification/agent-runtime-v1/gate-d/performance-recovery/gate-r5-20260727-004/run-10m-mature-database-regression.ts)
- [Attempt004 evidence directory](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/docs/verification/agent-runtime-v1/gate-d/performance-recovery/gate-r5-20260727-004)
- [Frozen MCP config](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/docs/verification/agent-runtime-v1/gate-d/performance-recovery/gate-r5-20260724-001/mcp-config.json)
- [Mature source database](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/docs/verification/agent-runtime-v1/gate-d/performance-recovery/gate-r4-20260724-004/gate-r4-20260724-recovery-004.sqlite)
- [Fresh mature clone](file:///private/tmp/openharness-gate-r5.enkEvJ/gate-r5-20260727-mature-004.sqlite)
- [Java log](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/docs/verification/agent-runtime-v1/gate-d/performance-recovery/gate-r5-20260727-004/java-gateway-18084.log)

## 主要发现

### Critical / High

无。

### Medium

1. Fresh APFS clone 为 `4,092,854,272` bytes、mode `0600`，SHA 与只读 mature source 完全一致；runner 内部确认精确 10,000 scoped conversations、integrity `ok`、dead-letter 0。
2. 唯一 Java Gateway PID `4170`，只在 18084 监听，命令行只含 `--server.port=18084`，service token 只通过环境传递；actuator health 为 `UP`。
3. Runtime 3102 无 listener；report/journal 不存在；Java log 为本 attempt 新文件；MCP config mode `0600`。
4. Runner `--validate-only` exit 0，真实 Java fixed fixtures 与 MCP stdio fixture 通过；未创建 report/journal 或 Runtime child。
5. 可用磁盘约 125 GiB，满足 clone runner 的 2 GiB headroom 和当前文件系统约束。

### Low

1. 全量实现门禁已在 Worker Implementation Review 中通过；本 preflight 未修改 source、runner、plan、MCP config 或阈值。
2. 运行完成后必须停止 Java session、确认 18084/3102 与 MCP fixture 无残留，并删除精确临时目录 [openharness-gate-r5.enkEvJ](file:///private/tmp/openharness-gate-r5.enkEvJ)。

## Preflight 证据

- Run ID：`gate-r5-20260727-mature-004`
- Source state SHA-256：`e5df7b28643917fe5b6190c3f61d55eac0c44f0323782fde762b490a3f2bf978`
- Runner SHA-256：`6bdfa8e6b6e5d15631e779e749ebcf181851641a81730f909edb0d3eb1a12460`
- Plan SHA-256：`290f42270187e9f72daf755c186d0357fde35e81a2b349fcfb597fb36753aba5`
- MCP config SHA-256：`c89ad2675d12a2d6376b3eb4b48f5419ef3bd557a75910455fae37ae02c65dfc`
- Clone/source SHA-256：`f4a8e3b227b9947828c19cca45151635e43657e4b1fc22a95e3ff1c2f5a7ec7a`
- `--validate-only`：`preflight_completed/result=ok`

## 最终建议

保持 Java PID 4170 与所有 frozen inputs 不变，从 [agent-runtime cwd](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/agent-runtime) 使用相同参数移除 `--validate-only` 启动一次。自然结束前不修改任何 SOURCE_TARGET、runner、plan、MCP config、clone 或 evidence path。

## 后续门禁

- OpenSpec：4.1d 仍未完成。
- Superpowers：运行后必须落盘独立 Result Review。
- Dashboard：保持 `proposed`，只有结果满足全部冻结资格才评估后续状态。
- 正式 Gate D：仍需独立 Attempt005 Plan/Preflight 与明确 start approval。
