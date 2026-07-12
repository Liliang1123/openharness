# OpenClacky Runtime Parity Worktree Intake Review

## 结论

需修改。Runtime parity 隔离 worktree 已正确创建且 baseline 全绿，可以作为只读 intake/占位工作区；ChatGPT OAuth 23/23 archive 已由远端 commit `26f4ebb68de83468b5ee068fbbb7596e07c89014` 持久化，但当前 parity 基线尚未整合该 commit，且 `harden-agent-runtime-single-node-production` 仍为 11/30 active。依据既有 roadmap 的 P0 顺序门禁，暂不允许创建 parity proposal 或实施代码。

## Review 范围

- [Runtime parity worktree](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/)
- [Runtime parity handoff](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/docs/handoffs/2026-07-12-1238-openclacky-runtime-parity-roadmap.md)
- [Runtime parity backlog final plan](file:///Users/elvis/file/develop/opensource/openharness/docs/review/2026-07-09-openclacky-runtime-parity-development-backlog-final-plan.md)
- [Runtime parity backlog plan Review](file:///Users/elvis/file/develop/opensource/openharness/docs/review/2026-07-09-openclacky-runtime-parity-development-backlog-final-plan-review.md)
- [OAuth completed commit](https://github.com/Liliang1123/openharness/commit/26f4ebb68de83468b5ee068fbbb7596e07c89014)

## 主要发现

### Pass：隔离与基线

- worktree 位于已忽略的 `.worktrees/`，分支为 `add-openclacky-runtime-parity-roadmap`。
- 基线 commit 为 `98d52c849b6067283b5439e6699173c66dee68b2`。
- offline install、Java、Node 全量测试和 typecheck 均通过。

### Important：OAuth integration point 已建立但尚未进入 parity 基线

OAuth archive 与 dashboard archived 已提交并推送，commit 为 `26f4ebb68de83468b5ee068fbbb7596e07c89014`，完成 worktree 已删除。当前 parity worktree 尚未整合该 commit，因此 `openspec list` 仍显示旧 `add-chatgpt-oauth-auth` 13/23 active；不得重复实施或重复 archive。

### Blocker：single-node production 前置未关闭

现有 parity final plan 明确要求先归档 `harden-agent-runtime-single-node-production`；当前基线仍为 11/30。除 docs-only discovery 外，不得并行推进 parity change。

### Important：roadmap 输入本身仍需修订

既有 plan Review 记录 Stage 编号错位与 change mapping 未完全闭合。即使前置归档完成，也应先修订 roadmap 输入，再创建 spec-only proposal。

## 最终建议

1. 将已推送的 OAuth commit 合规整合到 parity 基线，或从包含该 commit 的集成分支重建 worktree。
2. 完成并归档 single-node production active change，同时明确 defer-anthropic active change 状态。
3. 更新后重跑 parity baseline。
4. 修订 roadmap 输入后，仅创建 `add-openclacky-runtime-parity-roadmap` OpenSpec proposal；独立审批前不实施。

## 后续门禁

- 需要新的 OpenSpec proposal：是，但当前前置 blocker 关闭后才能创建。
- 需要 Superpowers plan：最终需要；roadmap/具体 implementation change 批准前不得生成。
- 需要人工审批：后续 terminal、browser、write/edit、network、media、BYOK、MCP credential、extension hooks 与 channels 仍各自保留人工门禁。
- 本 Review 未修改项目规则或生产代码，未执行 Git add/commit/push/reset/clean。
