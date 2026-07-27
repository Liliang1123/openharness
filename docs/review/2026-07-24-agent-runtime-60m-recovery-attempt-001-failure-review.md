# Agent Runtime 60 分钟恢复回归 attempt 001 失败 Review

## 结论

**需修改。** attempt 001 在 Runtime 子进程装载 `tsx` 前 fail-close，未进入 migration、seed、continuous workload 或 60 分钟采样。失败属于证据执行环境 cwd 绑定缺失，不是 production Runtime 实现失败；允许在保留全部失败证据的前提下，以新 runId、新输出目录和明确的 `agent-runtime` cwd 执行 attempt 002。

## Review 范围

- [attempt 001 执行计划](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/docs/superpowers/plans/2026-07-24-agent-runtime-60m-recovery-regression.md)
- [attempt 001 preflight Review](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/docs/review/2026-07-24-agent-runtime-60m-recovery-regression-plan-review.md)
- [attempt 001 runner](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/docs/verification/agent-runtime-v1/gate-d/performance-recovery/gate-r4-20260724-001/run-60m-recovery-regression.ts)
- [attempt 001 report](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/docs/verification/agent-runtime-v1/gate-d/performance-recovery/gate-r4-20260724-001/gate-r4-20260724-recovery-001-report.json)
- [attempt 001 journal](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/docs/verification/agent-runtime-v1/gate-d/performance-recovery/gate-r4-20260724-001/gate-r4-20260724-recovery-001-journal.jsonl)
- [attempt 001 SQLite](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/docs/verification/agent-runtime-v1/gate-d/performance-recovery/gate-r4-20260724-001/gate-r4-20260724-recovery-001.sqlite)
- [Runtime child spawn primitive](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/agent-runtime/src/baseline/formalSoakExecution.ts)

## 主要发现

### Critical

无。

### Important

1. **执行 cwd 未绑定。** runner 从项目根目录启动；`buildGateDRuntimeChildSpawnSpec()` 生成 `node --import tsx ...`，Node 从父进程 cwd 解析 loader。项目的 `tsx` 位于 [agent-runtime/node_modules](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/agent-runtime/node_modules)，根目录没有可解析的 `tsx` package，因此 child 以 `ERR_MODULE_NOT_FOUND` 退出。
2. **原 preflight 覆盖不足。** `--validate-only` 成功验证 Java、MCP、端口、权限和哈希，但不实际 spawn Runtime child，所以没有提前暴露 cwd loader resolution。

### 影响判定

- report 正确为 `fail`，只有一个 synthetic failure sample；
- `actualSamplingDurationMs=0`，Java log 没有 workload growth；
- journal 只记录 child loader error 与 final failure；
- production Runtime server、SQLite migration、dispatcher、seed 和 formal-incremental oracle 都未执行；
- attempt 001 的 Runtime/MCP/Java 进程已全部清理，`18084`、`3102` 已释放；
- 失败 SQLite/report/journal/Java log 均保留，不覆盖、不删除、不晋升。

## 最终建议

新建 attempt 002，保持 runner 字节不变并从 [agent-runtime](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/agent-runtime) 作为 cwd 调用，使 child 的 `node --import tsx` 按既有历史 Gate R1 成功路径解析。使用新 runId、新 SQLite、report、journal、Java log 和 MCP config。不得修改或复用 attempt 001 输出。

## 后续门禁

- **OpenSpec proposal：** 不需要；这是证据 harness 执行环境修正，不改变产品行为或契约。
- **Superpowers plan：** 必须创建 attempt 002 delta plan 并通过新 preflight Review。
- **测试：** attempt 002 必须重新执行 Java/MCP/fresh-path/hash preflight；Runtime child 成功 readiness 后才允许 seed 和计时。
- **人工审批：** 本地 attempt 002 不需要 production promotion 审批。
- **归档：** attempt 001 失败证据保持原位；不得归档 active OpenSpec change。
