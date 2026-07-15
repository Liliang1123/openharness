# Agent Runtime Gate D Production Executor Plan Preflight Review

## 结论

通过：Gate D production executor 的 implementation Preflight 为 PASS，可以在现有 `harden-agent-runtime-single-node-production` 获批合同内实施 supervisor/worker/probe/journal 切片。正式 24 小时 workload 的 production start 仍为 BLOCKED：只有实现、测试、strict Review 与本机 active preflight 全部通过后，用户对 exact runId、plan hash、report/journal paths 的明确启动批准才能解除该门禁。

## Review 范围

- [Gate D production executor plan](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/docs/superpowers/plans/2026-07-15-agent-runtime-gate-d-production-executor.md)
- [Stage 0 final plan](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/docs/superpowers/plans/2026-07-03-agent-runtime-single-node-production-final-plan.md)
- [active proposal](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/openspec/changes/harden-agent-runtime-single-node-production/proposal.md)
- [active design](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/openspec/changes/harden-agent-runtime-single-node-production/design.md)
- [active agent-runtime spec delta](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/openspec/changes/harden-agent-runtime-single-node-production/specs/agent-runtime/spec.md)
- [active tasks](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/openspec/changes/harden-agent-runtime-single-node-production/tasks.md)
- [formal runner](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/agent-runtime/src/baseline/formalSoakRunner.ts)
- [existing local execution](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/agent-runtime/src/baseline/localShortBaselineExecution.ts)
- [production Runtime entrypoint](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/agent-runtime/src/productionEntrypoint.ts)
- [production server wiring](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/agent-runtime/src/server.ts)
- [Java deterministic model fixture](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/backend/src/main/java/org/openharness/backend/service/MockModelService.java)
- [MCP qualification fixture](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/agent-runtime/fixtures/mcp/qualification-server.ts)
- [production runbook](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/docs/architecture/agent-runtime-v1-production-runbook.md)

## 主要发现

### Pass — 与获批 OpenSpec 合同完全对应

Plan 只实现 Design Decision 8/9 已固定的机制：deterministic local model/tool fixtures、Java Gateway 常驻、真实 TS Runtime child restart、10,000 scoped conversations、20 workers、60/20/15/5 mix、30 秒独立采样、固定 threshold 与 hard-failure oracle。没有引入 real Provider、fallback、多节点或新产品 API。

### Fixed — 原计划缺少 production caller

原 `formalSoakRunner` 只有 dependency-injected `sample`/`onRestart` library，仓库 caller 全在 unit tests；不存在 production CLI、Runtime child supervisor、20-worker driver、active probe、journal 或 partial report persistence。新计划已把该缺口作为 Task 13 的前置 implementation slice，禁止再用 operator boolean 或 compressed local report冒充 Gate D。

### Pass — production wiring 可证伪

Plan 要求单独 TS child PID、scheduled-vs-unexpected exit 区分、新 PID 证明、Java 不重启、Runtime 公共 HTTP seed/workload、read-only SQLite oracle、真实 MCP stdio child、Java MockModelService deterministic fixture、独立 30 秒 clock。in-process close/reopen、DB-only sampler 与手工 shell 均不能满足测试。

### Pass — evidence 与失败语义闭环

每个 observation 先进入 `wx`/`0600` append-only JSONL journal；hard failure、checkpoint failure 或 operator interruption 均写 no-overwrite FAIL partial report，完整 24 小时才允许 final report。既有 target、路径逃逸、unknown/duplicate flag、可调 duration/schedule/threshold、凭证出现在 argv 或缺 approval binding 均在 spawn 前 fail-closed。

### Pass — TDD、验证、回滚和 Git 边界完整

每个模块都有明确 RED/GREEN、focused/full verification、negative scans、strict OpenSpec 与 Dashboard checks。回滚不触碰 production evidence；formal run 后禁止删除 journal/partial/final。Plan 明确禁止 Git add/commit/push/reset/clean/worktree cleanup。

### BLOCKED — 正式 production start 尚未授权

当前只有 implementation authorization。Gate D run 必须绑定实现完成后的 plan SHA、exact runId、approval artifact、preflight artifact 和 no-overwrite output paths；任何实现 revision 都会改变 plan/source binding并使旧批准无效。因此现在不得生成伪 approval 或调用 run script。

## 最终建议

1. 按计划 inline TDD 实现 Task 1–7，先达到 `preflight_ready`。
2. implementation Review PASS 后运行不启动 child 的 active preflight，保留 redacted artifact/hash。
3. 将 exact runId、plan hash、paths、预计 24 小时窗口和 stop procedure 提交用户明确批准。
4. 只有批准后运行一次 formal workload；FAIL/中断保留 partial evidence且不重试，PASS 后仍需独立 promotion approval。

## 后续门禁

| 门禁 | 结论 |
| --- | --- |
| implementation execution | PASS |
| 新 OpenSpec proposal | 不需要；复用已批准 active change |
| Gate D production start | BLOCKED，缺实现/Review/active preflight 与 exact user approval |
| Gate D promotion | BLOCKED，缺 24 小时结果与 post-result approval |
| active task 4.2/4.3 | 保持 pending |
| Dashboard verified/archive | 禁止 |
| Git publication | 未授权 |
| 项目规则 | 不修改 |

## Preflight 验证记录

- `npx openspec validate harden-agent-runtime-single-node-production --strict --no-interactive`：PASS。
- Plan SHA-256：`27877d70aa81a055c62d39f3e38106b3174139b56756613416c0cb85290e9ab5`。
- placeholder scan：无 `TBD` / `TODO` / `fill in` / “similar to” implementation placeholder。
- `git diff --check`：PASS。
- Worktree safety：当前分支位于 ignored `.worktrees/`；未创建新 worktree，未修改 main worktree。
