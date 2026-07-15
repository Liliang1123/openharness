# Adopt Codex OAuth Regression Qualification Archive Closeout

## 结论

通过：`adopt-codex-oauth-regression-qualification` 已归档为 `2026-07-15-adopt-codex-oauth-regression-qualification`，正式 `provider-adapter` spec 已切换为 required Codex OAuth / advisory API-key 的模型回归合同。归档后发现并修正 deferred Anthropic 段残留的旧 “OpenAI-compatible Gate C” 口径；current spec、archived delta 和 active Runtime delta 现保持一致。此结论只关闭该 change，不关闭 active Runtime Gate D、最终 qualification、contract freeze 或发布门禁。

## Review 范围

- [archived proposal](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/openspec/changes/archive/2026-07-15-adopt-codex-oauth-regression-qualification/proposal.md)
- [archived design](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/openspec/changes/archive/2026-07-15-adopt-codex-oauth-regression-qualification/design.md)
- [archived tasks](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/openspec/changes/archive/2026-07-15-adopt-codex-oauth-regression-qualification/tasks.md)
- [archived provider-adapter delta](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/openspec/changes/archive/2026-07-15-adopt-codex-oauth-regression-qualification/specs/provider-adapter/spec.md)
- [current provider-adapter spec](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/openspec/specs/provider-adapter/spec.md)
- [active Runtime provider-adapter delta](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/openspec/changes/harden-agent-runtime-single-node-production/specs/provider-adapter/spec.md)
- [archive Preflight Review](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/docs/review/2026-07-15-adopt-codex-oauth-regression-qualification-archive-preflight-review.md)
- [implementation Review](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/docs/review/2026-07-15-adopt-codex-oauth-regression-qualification-implementation-review.md)
- [Gate C provider decision](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/docs/verification/agent-runtime-v1/providers/2026-07-15-gate-c-codex-oauth-provider-decision.json)
- [dashboard source](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/docs/project-dashboard/development-log.json)

## 主要发现

### Pass — archive 与正式 spec 更新成功

`npx openspec archive adopt-codex-oauth-regression-qualification --yes` 正常应用一个 requirement rename 和一个 modified requirement，并将 change 移入带日期的 archive 目录。归档任务 5.4 已在归档副本中核对完成，18/18 tasks 闭环。

### Fixed — deferred Anthropic 旧 Gate C 口径

archive 后的独立 contract scan 发现 current spec 仍保留 “prior OpenAI-compatible Gate C evidence”。该句来自更早的 archived change，虽然不改变 Provider-specific qualification 规则，但会与新的 required Codex Gate C 权威产生歧义。已在同一 archived delta 和 current spec 中改为：Anthropic 仍为 deferred optional family；Codex 或 OpenAI-compatible 成功均不能替代 Anthropic 专属矩阵；后续 Anthropic promotion 不影响 required Codex Gate C decision 或真实历史 Provider evidence。

### Pass — active Runtime 门禁未被误关闭

active `harden-agent-runtime-single-node-production` 继续保持 `proposed`。Gate C 模型轨已闭环，但 formal 24-hour Gate D、production evidence oracle、full production qualification、contract freeze 与 active closeout/archive 仍是独立待办。

### Pass — 历史证据与凭证边界保持不变

Codex、Zhipu 与其他 Provider 历史 reports 均未覆盖或删除。本轮归档没有调用模型、读取 OAuth/API-key credential、启动生产 workload、提交 Git 或推送远端。

## 最终建议

1. Dashboard 将本 change 标记为 `archived`，路径全部切换到 dated archive，并以本 closeout 为入口。
2. 后续只推进 active Runtime Gate D；先完成当次环境探针与 production-start Preflight Review，再请求明确的 24 小时启动授权。
3. 不重跑 Gate C 模型 qualification；只有 Codex client/report binding 变化时才另行进入授权与新 evidence 流程。

## 后续门禁

| 门禁 | 结论 |
| --- | --- |
| 本 change archive | PASS |
| current spec merge | PASS |
| Dashboard archived sync | 需随本 closeout 重新渲染并检查 |
| active Runtime Gate D | BLOCKED，缺当次 preflight 与明确 production start approval |
| full production qualification / contract freeze | 未完成 |
| 真实模型重跑 | 未授权且不需要 |
| Git add/commit/push | 未授权 |
| 项目规则 | 未修改 |

## 验证记录

- archive 前：new/active change strict validation、Dashboard check、`git diff --check` 均 exit 0。
- archive：`npx openspec archive adopt-codex-oauth-regression-qualification --yes` exit 0；正式 spec 完成 rename/modified apply。
- archive 后：`npx openspec validate --all --strict --no-interactive` 为 23 passed、0 failed。
- stale contract negative scan：current specs、active Runtime change、runbook 与 Stage 0 plan 中无旧 required OpenAI-compatible Gate C 口径。
- `git diff --check`：exit 0。
