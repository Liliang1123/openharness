# Adopt Codex OAuth Regression Qualification Archive Preflight Review

## 结论

通过：`adopt-codex-oauth-regression-qualification` 的实现、验证、实施 Review、任务核对和 Dashboard `verified` 记录已形成闭环；本轮用户在被明确告知“archive 仍需独立授权”后回复“继续”，可作为该单一 archive 动作的确认。归档应更新正式 `provider-adapter` spec，并将 Dashboard 状态迁移为 `archived`，但不得启动 Gate D、真实模型重跑、Git 提交或推送。

## Review 范围

- [OpenSpec proposal](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/openspec/changes/adopt-codex-oauth-regression-qualification/proposal.md)
- [OpenSpec design](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/openspec/changes/adopt-codex-oauth-regression-qualification/design.md)
- [OpenSpec tasks](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/openspec/changes/adopt-codex-oauth-regression-qualification/tasks.md)
- [provider-adapter delta](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/openspec/changes/adopt-codex-oauth-regression-qualification/specs/provider-adapter/spec.md)
- [current provider-adapter spec](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/openspec/specs/provider-adapter/spec.md)
- [active Runtime provider-adapter delta](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/openspec/changes/harden-agent-runtime-single-node-production/specs/provider-adapter/spec.md)
- [implementation Review](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/docs/review/2026-07-15-adopt-codex-oauth-regression-qualification-implementation-review.md)
- [dashboard source](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/docs/project-dashboard/development-log.json)

## 主要发现

### Pass — archive 前置证据完整

任务 1.1 至 5.3 已完成，5.4 仅保留 archive 本身；实施 Review 记录了完整 TypeScript、Java、integration、OpenSpec、Dashboard、hash/no-overwrite 与敏感信息验证。本次 archive 不新增运行时行为，也不需要重新调用真实模型。

### Pass — 正式 spec 与 active change 可对齐

本 change 对正式 `provider-adapter` spec 执行一个 requirement rename 和一个 modified requirement，确立 required Codex OAuth / advisory API-key 的模型回归规则。active Runtime change 已提前同步同一语义，且继续独立保留 Java、MCP、安全、持久化、Gate D、最终 qualification 与 contract freeze 门禁；归档不会把 active Runtime 状态误升为 `verified`。

### Pass — 授权边界明确

用户的“继续”紧接“本 change 仅 archive 尚需独立授权”的 closeout 说明，因此只授权该 archive。该确认不满足 Gate D runner 明文要求的独立 production start approval，也不授权真实模型调用、Git add/commit/push 或 worktree 清理。

### Pass — 回滚与停止条件明确

归档前后均运行 strict validation。若 archive 命令、current spec、active change、Dashboard render/check 或 diff/sensitive scan 任一失败，则保留实际状态并停止，不启动 Gate D。尚未提交的工作树允许通过精确 diff 修正，但禁止使用破坏性 Git 回滚。

## 最终建议

1. 运行 `npx openspec archive adopt-codex-oauth-regression-qualification --yes`，不得使用 `--skip-specs` 或 `--no-validate`。
2. archive 成功后，仅在归档副本中核对 5.4，创建 archive closeout，并将 Dashboard source 更新为 `archived`、归档路径与正式 spec 路径。
3. 重新渲染 Dashboard，运行 archived/current/active OpenSpec strict validation、Dashboard check、diff 与敏感信息检查。
4. Gate D 只推进到正式 production-start Preflight Review；获得明确启动授权前不得运行 24 小时 workload。

## 后续门禁

| 门禁 | 结论 |
| --- | --- |
| archive execution | PASS，可执行 |
| current spec update | 必须随 archive 执行并严格校验 |
| Dashboard archived sync | archive 后必须执行 |
| Gate D production start | BLOCKED，仍缺独立明确启动授权与当次环境预检 |
| 真实模型重跑 | 未授权 |
| Git add/commit/push | 未授权 |
| 项目规则 | 不修改 |
