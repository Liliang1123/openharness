# Defer Anthropic From Gate C — Approval Alignment Review

## 结论

有风险：用户已批准 [defer-anthropic-from-gate-c](file:///Users/elvis/file/develop/opensource/openharness/openspec/changes/defer-anthropic-from-gate-c/proposal.md)，Gate C 合同对齐已完成；**Gate C 仍不能关闭**，因 OpenAI-compatible 真实矩阵 required rows 尚未全部 PASS。

## Review 范围

- [defer-anthropic-from-gate-c proposal](file:///Users/elvis/file/develop/opensource/openharness/openspec/changes/defer-anthropic-from-gate-c/proposal.md)
- [defer-anthropic-from-gate-c design](file:///Users/elvis/file/develop/opensource/openharness/openspec/changes/defer-anthropic-from-gate-c/design.md)
- [defer-anthropic-from-gate-c tasks](file:///Users/elvis/file/develop/opensource/openharness/openspec/changes/defer-anthropic-from-gate-c/tasks.md)
- [harden proposal](file:///Users/elvis/file/develop/opensource/openharness/openspec/changes/harden-agent-runtime-single-node-production/proposal.md)
- [harden design](file:///Users/elvis/file/develop/opensource/openharness/openspec/changes/harden-agent-runtime-single-node-production/design.md)
- [harden tasks](file:///Users/elvis/file/develop/opensource/openharness/openspec/changes/harden-agent-runtime-single-node-production/tasks.md)
- [harden provider-adapter delta](file:///Users/elvis/file/develop/opensource/openharness/openspec/changes/harden-agent-runtime-single-node-production/specs/provider-adapter/spec.md)
- [Stage 0 plan](file:///Users/elvis/file/develop/opensource/openharness/docs/superpowers/plans/2026-07-03-agent-runtime-single-node-production-final-plan.md)
- [production runbook (worktree)](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/docs/architecture/agent-runtime-v1-production-runbook.md)
- [dashboard development-log.json](file:///Users/elvis/file/develop/opensource/openharness/docs/project-dashboard/development-log.json)

## 主要发现

### 已完成对齐

| 项 | 结果 |
|---|---|
| Gate C required family | OpenAI-compatible only |
| Task 3.2 | Deferred / post-Gate-C 文案已写入，未勾选完成 |
| Task 3.1 | 仍为 Gate C required，仍 open |
| AnthropicAdapter / fake matrix | 保留 |
| Zhipu 顶替 Anthropic | 明确禁止 |
| Dual-family harness hard-require | 未发现；矩阵为独立 report |

### 未关闭项（有意）

- Gate C 仍 blocked：既有 Zhipu production matrix overall `blocked`（timeout fail；retry/terminal_error/cancellation/reasoning blocked）。
- 未勾选 3.1 / 3.5 / 3.6；未 archive；未 promotion。
- `add-chatgpt-oauth-auth` 仍为 proposed，本轮未批准实施。

## 验证记录

- `npx openspec validate defer-anthropic-from-gate-c --strict --no-interactive`：pass（main + worktree）
- `npx openspec validate harden-agent-runtime-single-node-production --strict --no-interactive`：pass（main + worktree）
- `npx openspec validate add-chatgpt-oauth-auth --strict --no-interactive`：pass（main；未改）
- 无 runtime/provider 源码改动；qualification harness 无需代码变更

## 最终建议

1. 继续推进 Gate C **OpenAI-compatible** 真实证据路径（timeout 结构化错误、retry/terminal/cancel harness）。
2. Anthropic 仅在有 key 时跑 deferred matrix。
3. ChatGPT OAuth 仍等用户对 B 的批准。

## 后续门禁

- OpenSpec：`defer-anthropic-from-gate-c` 合同对齐完成，可在 Stage 0 closeout 时再 archive。
- 不需要新 proposal 以完成 Anthropic 降级。
- 是否修改项目规则：否。
- 是否仍需 OpenSpec / 后续实施计划：Gate C OpenAI-compatible 证据与可选 ChatGPT OAuth 仍需后续工作。
