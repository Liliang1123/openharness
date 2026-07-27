# Agent Runtime 10 分钟成熟数据库回归 Attempt001 Failure Review

## 结论

需修改：`gate-r5-20260724-mature-001` 未进入 Runtime 或 workload，失败属于 runner 调用工作目录错误，不是读路径实现或成熟数据库性能失败。本次 evidence 必须保留且不得覆盖；允许在修正调用目录并重新通过 preflight 后，以新 run ID 和新 clone 重试。

## Review 范围

- [Attempt001 runner](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/docs/verification/agent-runtime-v1/gate-d/performance-recovery/gate-r5-20260724-001/run-10m-mature-database-regression.ts)
- [Attempt001 report](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/docs/verification/agent-runtime-v1/gate-d/performance-recovery/gate-r5-20260724-001/gate-r5-20260724-mature-001-report.json)
- [Attempt001 journal](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/docs/verification/agent-runtime-v1/gate-d/performance-recovery/gate-r5-20260724-001/gate-r5-20260724-mature-001-journal.jsonl)
- [Attempt001 Preflight Review](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/docs/review/2026-07-24-agent-runtime-10m-mature-database-regression-preflight-review.md)
- [读路径恢复实施计划](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/docs/superpowers/plans/2026-07-24-agent-runtime-read-path-contention-recovery.md)

## 主要发现

### High

1. journal 的唯一 Runtime child stderr 为 `ERR_MODULE_NOT_FOUND: Cannot find package 'tsx'`；child 在加载 `formalSoakRuntimeChild.ts` 前退出。
2. `buildGateDRuntimeChildSpawnSpec` 使用当前 Node 执行 `--import tsx`，且 child 继承 runner 的当前工作目录。Attempt001 从项目根目录启动，而 `tsx` 只安装在 [agent-runtime/node_modules](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/agent-runtime/node_modules/)。
3. 只读对照验证已复现调用边界：
   - 项目根目录执行 `node --import tsx --eval ''`：exit `1`；
   - `agent-runtime` 目录执行相同命令：exit `0`。

### Medium

1. journal 没有 `runtime_started`、`sample_checkpoint` 或 workload 记录。report 中的 1 个 sample 是 runner 为保存 run-level failures 生成的零值占位，不是性能样本。
2. failure codes 仅为：
   - `MATURE_REGRESSION_EXECUTION_FAILURE`
   - `MATURE_REGRESSION_SAMPLE_COUNT_MISMATCH`
   - `MATURE_REGRESSION_DURATION_INCOMPLETE`
3. Runtime 未加载，因此没有打开成熟 clone、没有发起业务请求、没有产生 execution/event/outbox 变更。Java Gateway 继续健康，端口 `3102` 已确认无监听。

### Low

1. Attempt001 preflight 覆盖 Java、MCP、SQLite、hash 与空闲端口，但没有覆盖 Runtime child 的 `tsx` loader 解析目录；后续 preflight 必须显式绑定 runner cwd。

## 最终建议

1. 冻结 Attempt001 runner、report、journal 和原 Preflight Review，不修改、不覆盖。
2. 不改变 runtime source、workload、threshold、oracle 或数据库内容。
3. 创建全新 APFS clone 与 `gate-r5-20260724-mature-002` 输出路径。
4. 从 [agent-runtime 目录](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/agent-runtime/) 启动同一已绑定 runner，同时继续将 `--project-root` 指向 worktree 根目录。
5. 新 preflight 必须包含 root/agent-runtime loader 对照、report/journal 不存在、fresh clone hash、Java/MCP/SQLite 检查，并落盘独立 Review。

## 后续门禁

- 本次失败不授权 Attempt005，也不改变 active OpenSpec change 或 Dashboard。
- 本次没有修改项目规则。
- 只有 Attempt002 完成 20/20 样本并通过既定短回归资格，才允许进入 Attempt005。
- 若 Attempt002 在正确 cwd 下仍出现同类 loader failure，则停止重试，转为修复 Gate D runner 的 production tooling。
