# Agent Runtime 10 分钟成熟数据库回归 Attempt002 Preflight Review

## 结论

通过：允许执行 `gate-r5-20260724-mature-002`。Attempt001 没有进入 Runtime 或 workload；Attempt002 仅修正已证实的 child loader 工作目录契约，继续使用相同源码、runner、MCP、plan、成熟数据库来源、workload、阈值与 oracle 语义。

## Review 范围

- [冻结的核心 runner](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/docs/verification/agent-runtime-v1/gate-d/performance-recovery/gate-r5-20260724-001/run-10m-mature-database-regression.ts)
- [冻结的 MCP 配置](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/docs/verification/agent-runtime-v1/gate-d/performance-recovery/gate-r5-20260724-001/mcp-config.json)
- [Attempt002 evidence 目录](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/docs/verification/agent-runtime-v1/gate-d/performance-recovery/gate-r5-20260724-002/)
- [Attempt001 Failure Review](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/docs/review/2026-07-24-agent-runtime-10m-mature-database-regression-attempt-001-failure-review.md)
- [读路径恢复实施计划](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/docs/superpowers/plans/2026-07-24-agent-runtime-read-path-contention-recovery.md)
- [Attempt002 成熟 clone](file:///private/tmp/openharness-gate-r5.huhLxp/gate-r5-20260724-mature-002.sqlite)，运行结束后按精确 prefix 校验清理。

## 主要发现

### Critical / High

无。

### Medium

1. Attempt002 的唯一调用修正是从 [agent-runtime 工作目录](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/agent-runtime/) 启动；`--project-root` 仍明确绑定 [worktree 根目录](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/)。
2. child loader 预探测 `node --import tsx --eval ...` 在该目录 exit `0`；随后完整 runner `--validate-only` exit `0`。
3. Attempt001 report/journal/runner 未被修改或覆盖；Attempt002 使用新的 run ID、fresh clone、report 与 journal 输出路径。

### Low

1. Java Gateway 沿用同一个已通过 fixture probe 的隔离进程与 [Java 日志](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/docs/verification/agent-runtime-v1/gate-d/performance-recovery/gate-r5-20260724-001/java-gateway-18084.log)。Attempt001 未产生 Java workload 调用，复用不会混入性能样本；report 会从 Attempt002 开始时重新记录日志起始字节。

## Preflight 证据

- Run ID：`gate-r5-20260724-mature-002`
- runner cwd：[agent-runtime](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/agent-runtime/)
- child loader probe：exit `0`
- runner `--validate-only`：exit `0`
- Java health 与固定 fixtures：通过
- MCP fixture 与配置权限 `0600`：通过
- Runtime 端口 `3102`：无监听
- 成熟 clone：`4,092,854,272` bytes
- clone SHA-256：`f4a8e3b227b9947828c19cca45151635e43657e4b1fc22a95e3ff1c2f5a7ec7a`，与 Attempt004 主文件一致
- 精确 10,000 scoped conversations：通过
- `PRAGMA integrity_check = ok`
- dead-letter：0
- Source state SHA-256：`63dc5c97f14670cc282b2f02180d3569adc5678178bbbca4b44affff210025e3`
- Runner SHA-256：`e3ca724fa8a4730c6085f21c3487458b718fba8d65f31cfe19fc249d349bf4d2`
- Plan SHA-256：`9e02b8518903f2cbc7f86eb0e3950b7791e97ad897b5ae5268013de304a8cbef`
- MCP config SHA-256：`c89ad2675d12a2d6376b3eb4b48f5419ef3bd557a75910455fae37ae02c65dfc`

## 最终建议

执行 20 个、每 30 秒一个样本。不得 seed、清空数据库、改变 10,000 scopes / concurrency 20 / 60-20-15-5 workload、修改阈值、禁用 outbox/oracle，或在运行期间修改 source/runner/plan/MCP。运行结束必须验证 Runtime、Java、MCP 子进程清理和 credential negative scan。

## 后续门禁

- 本 Review 只授权 Attempt002，不代表 `local_verified`、正式 24 小时 Gate D、production promotion 或 OpenSpec 归档。
- 本 Review 没有修改项目规则、OpenSpec task 或 Dashboard。
- Attempt002 后必须落盘结果 Review；只有 20/20 样本和全部既定资格通过，才允许推进 Attempt005。
