# Agent Runtime 60 分钟恢复回归 attempt 002 执行前 Review

## 结论

**通过。** attempt 002 只修正已证实的 Runtime child loader cwd，保持 workload、阈值、runner 和 production source 不变；可以进入新的 Java/MCP/hash/fresh-path preflight，随后执行固定 60 分钟本地回归。

## Review 范围

- [attempt 001 失败 Review](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/docs/review/2026-07-24-agent-runtime-60m-recovery-attempt-001-failure-review.md)
- [attempt 002 delta plan](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/docs/superpowers/plans/2026-07-24-agent-runtime-60m-recovery-regression-attempt-002.md)
- [复用的不可变 runner](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/docs/verification/agent-runtime-v1/gate-d/performance-recovery/gate-r4-20260724-001/run-60m-recovery-regression.ts)
- [attempt 002 MCP config](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/docs/verification/agent-runtime-v1/gate-d/performance-recovery/gate-r4-20260724-002/mcp-config.json)
- [agent-runtime package](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/agent-runtime)
- [attempt 001 report](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/docs/verification/agent-runtime-v1/gate-d/performance-recovery/gate-r4-20260724-001/gate-r4-20260724-recovery-001-report.json)
- [attempt 001 journal](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/docs/verification/agent-runtime-v1/gate-d/performance-recovery/gate-r4-20260724-001/gate-r4-20260724-recovery-001-journal.jsonl)

冻结 SHA-256：

- attempt 002 plan：`79e99f787717dee5c4b71f1911bae9bcc8b528430e7104776652498e459a666d`
- reused runner：`cb97b09a2232b1ad03a76895f235f1761f169ed34a0b93ce95ef7c81a396571d`
- attempt 002 MCP config：`4371e299f1eeb570e70e9d79baf6beaeafdf3637b215d9a819476eee30de3eeb`

## 主要发现

### Critical

无。

### Important

无未关闭项。

### 已关闭项

1. **loader cwd：** 在 [agent-runtime](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/agent-runtime) cwd 实际执行 `node --import tsx` 已成功返回 `tsx_loader=resolved`，与历史 Gate R1 的成功调用边界一致。
2. **失败证据隔离：** attempt 001 report/journal/SQLite/Java log 保留原位；attempt 002 使用新目录、新 runId 和四个新输出。
3. **runner 未漂移：** attempt 002 复用 runner 的 SHA 与 attempt 001 Review 冻结值完全相同，未为重试修改采样或失败语义。
4. **凭据与权限：** attempt 002 MCP config 为 `0600`；service token 继续只通过环境传递。
5. **静态质量：** `git diff --check` 通过；production source 没有因为 attempt 001 失败而发生新修改。

### Advisory

`--validate-only` 本身仍不 spawn Runtime child；因此正式 attempt 002 的首个强制观察点是 `runtime_started` checkpoint。若仍未到达该 checkpoint，则保留新失败证据并停止，不进入 seed 或采样。

## 最终建议

严格从 `agent-runtime` cwd 执行 attempt 002 的 validate-only 和正式命令。先核对新的 plan/runner/MCP/source SHA，再启动正式命令；只有观察到 `runtime_started`、`seed_completed` 后，才把随后的 120 checkpoints 计入 60 分钟恢复回归。

## 后续门禁

- **OpenSpec proposal：** 不需要新 proposal。
- **Superpowers plan：** [attempt 002 plan](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/docs/superpowers/plans/2026-07-24-agent-runtime-60m-recovery-regression-attempt-002.md) 已批准执行。
- **测试：** 必须完成 attempt 002 preflight、120-sample 回归、证据负向扫描、全量验证与结果 Review。
- **人工审批：** 不需要本地执行审批；正式 Gate D promotion 门禁不变。
- **归档：** 不得归档 active OpenSpec change，也不得把 attempt 001 或 attempt 002 直接标记为 Gate D PASS。
