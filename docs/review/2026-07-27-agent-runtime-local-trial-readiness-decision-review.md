# Agent Runtime Local Trial Readiness Decision Review

## 结论

通过：用户确认的方案 A 已完整落盘。Agent Runtime 当前状态为 `Local Trial Ready`，允许项目所有者自行本地试用并以可复现反馈驱动后续优化；正式 24 小时 Gate D Attempt005 与 production closeout 为 `deferred_by_user`。未执行的 Gate 没有被标记 PASS，Dashboard 保持 `proposed`，active OpenSpec 保持未归档。

## Review 范围

- [Domain glossary](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/CONTEXT.md)
- [Active OpenSpec proposal](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/openspec/changes/harden-agent-runtime-single-node-production/proposal.md)
- [Active OpenSpec design](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/openspec/changes/harden-agent-runtime-single-node-production/design.md)
- [Active OpenSpec tasks](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/openspec/changes/harden-agent-runtime-single-node-production/tasks.md)
- [Local Trial Transition Plan](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/docs/superpowers/plans/2026-07-27-agent-runtime-local-trial-transition.md)
- [Local Trial Transition Plan Review](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/docs/review/2026-07-27-agent-runtime-local-trial-transition-plan-review.md)
- [Production runbook](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/docs/architecture/agent-runtime-v1-production-runbook.md)
- [Deferred Attempt005 Plan](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/docs/superpowers/plans/2026-07-27-agent-runtime-gate-d-attempt-005.md)
- [Deferred Attempt005 Preflight Review](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/docs/review/2026-07-27-agent-runtime-gate-d-attempt-005-preflight-review.md)
- [Dashboard source](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/docs/project-dashboard/development-log.json)
- [Dashboard Markdown](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/docs/project-dashboard/development-log.md)
- [Dashboard HTML](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/docs/project-dashboard/index.html)

## 主要发现

### High

- 无阻塞项。OpenSpec 4.1e 已完成；4.2、4.3、4.5、4.6 与 production closeout/archive 保持 unchecked，并明确记录 deferred owner/resume condition。
- Attempt005 计划和 Preflight Review 均已标记 `deferred_by_user`。`approval.json`、`preflight.json`、`journal.jsonl`、`partial-report.json`、`report.json` 全部不存在。
- Dashboard 中 active change 精确状态仍为 `proposed`，没有使用 `verified` 或 `archived` 代替本地试用状态。
- 本切片没有修改 Runtime、Frontend、Backend、schema、SQLite 或历史 qualification report/journal。

### Medium

- `Local Trial Ready` 与 `Production Verified` 已在领域词表、proposal、design、tasks、runbook、Attempt005 和 Dashboard 使用一致定义。
- 运行手册提供 owner-controlled SQLite 目录、production entrypoint、独立 Java Backend、service token 与端口配置；同时明确禁止将 token 写入仓库或试用证据。
- 后续优化入口为“试用反馈 → 可复现证据 → 小型 OpenSpec/TDD/Review 切片”，没有用无界试错替代变更门禁。
- 若未来恢复 production qualification，旧 runId `gate-d-20260727-005` 不得复用；需要新的决定、runId、packet、active preflight、start approval 与 promotion approval。

## 验证记录

- `npx openspec validate harden-agent-runtime-single-node-production --strict --no-interactive`：PASS。
- `npx openspec validate --all --strict --no-interactive`：PASS，23/23。
- `node docs/project-dashboard/scripts/render-dashboard.mjs`：PASS，36 entries。
- `pnpm dashboard:check`：PASS，生成物 current。
- `git diff --check`：PASS。
- `sh -n agent-runtime/scripts/start-production-runtime.sh` 与 executable check：PASS。
- lifecycle negative scan：PASS；精确 active Dashboard 状态为 `proposed`，production tasks deferred/unchecked，Attempt005 outputs absent，无 Attempt005 PASS/production_verified claim。

## 最终建议

1. 项目所有者按 [Production runbook](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/agent-runtime-completion/docs/architecture/agent-runtime-v1-production-runbook.md) 的 `Local Trial Ready` 小节启动并试用 Runtime。
2. 每个问题记录触发工作流、期望/观察结果、execution/conversation identity、稳定错误码与脱敏日志；先复现，再决定优化。
3. 运行时语义、API、持久化、安全或性能架构变化继续走独立 OpenSpec/TDD/Review。
4. 除非用户未来明确恢复生产资格，否则不再推进 Attempt005、Dashboard `verified`、production contract freeze、closeout 或 archive。

## 后续门禁

- OpenSpec：active `harden-agent-runtime-single-node-production` 保持 active，当前 28/35 tasks；恢复条件为用户重新选择 `Production Verified` 路径。
- Superpowers：Local Trial Transition Plan 完成；后续由具体试用问题触发新的小型计划。
- 测试：本切片无运行时代码变化，因此未重复运行完整 Runtime/Java 测试；既有实现与成熟库证据保持原样，治理变更已完成 fresh strict verification。
- Dashboard：保持 `proposed`。
- Git：未 staging、commit、push、merge 或 tag。
- 项目规则：未修改。
