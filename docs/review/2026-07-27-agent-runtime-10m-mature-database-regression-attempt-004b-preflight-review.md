# Agent Runtime 10 分钟成熟数据库回归 Attempt004b Preflight Review

## 结论

通过。允许执行唯一一次 `gate-r5-20260727-mature-004b`：readiness window 修复已 Review，fresh clone/outputs、Java/MCP、端口、权限、磁盘、10,000 scopes、integrity、dead-letter 与五项绑定均通过。不得覆盖 Attempt004 失败证据，不得自动重试。

## Review 范围

- [Attempt004b plan](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/docs/superpowers/plans/2026-07-27-agent-runtime-10m-mature-database-regression-attempt-004b.md)
- [Attempt004b runner](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/docs/verification/agent-runtime-v1/gate-d/performance-recovery/gate-r5-20260727-004b/run-10m-mature-database-regression.ts)
- [Readiness fix Review](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/docs/review/2026-07-27-gate-d-worker-startup-readiness-window-implementation-review.md)
- [Fresh clone](file:///private/tmp/openharness-gate-r5.nF6znF/gate-r5-20260727-mature-004b.sqlite)
- [Evidence directory](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/docs/verification/agent-runtime-v1/gate-d/performance-recovery/gate-r5-20260727-004b)
- [Java log](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/docs/verification/agent-runtime-v1/gate-d/performance-recovery/gate-r5-20260727-004b/java-gateway-18084.log)

## 主要发现

- Critical / High：无。
- Fresh clone 为 4,092,854,272 bytes、0600、hash 与 mature source 相同。
- Java PID 19752 在 18084 healthy；Runtime 3102 空闲；MCP config 0600。
- report/journal 不存在，Java log 为新文件。
- `--validate-only` exit 0，并验证 Java fixtures、MCP stdio、10,000 scopes、integrity 与 dead-letter。
- 当前 Runner/plan/source 均已冻结，运行期间不得编辑。

## 绑定证据

- Source SHA-256：`a362f2cd1f264dbf1449e51fbb87bc347ef7980506c5585e76aeb3c09d64de69`
- Runner SHA-256：`6bdfa8e6b6e5d15631e779e749ebcf181851641a81730f909edb0d3eb1a12460`
- Plan SHA-256：`204d794452c7ae94a17c187c0cff8c78706cc374ff07be06efd6616960b65550`
- MCP SHA-256：`c89ad2675d12a2d6376b3eb4b48f5419ef3bd557a75910455fae37ae02c65dfc`
- Clone SHA-256：`f4a8e3b227b9947828c19cca45151635e43657e4b1fc22a95e3ff1c2f5a7ec7a`

## 最终建议

从固定 agent-runtime cwd 使用相同参数移除 `--validate-only` 运行；等待 Worker 完成成熟库 bootstrap，不在旧 30 秒窗口人工中断。

## 后续门禁

结果必须 20/20 且全部冻结资格通过后才能完成 4.1d；Attempt005、Dashboard verified、正式 Gate D 和 archive 当前仍阻塞。
