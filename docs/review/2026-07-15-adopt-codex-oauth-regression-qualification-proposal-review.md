# Adopt Codex OAuth Regression Qualification Proposal Review

## 结论

通过：`adopt-codex-oauth-regression-qualification` proposal 已完整表达用户在 2026-07-15 批准的设计边界，可进入具体 OpenSpec 合同审批。它把官方 Codex CLI/app-server + ChatGPT/Codex OAuth 设为 OpenHarness 回归与 Gate C 模型调用的唯一 required 真实模型轨，把 Zhipu、Anthropic 和其他 API-key Provider 降为 advisory compatibility/optimization 证据，同时明确禁止把未执行的旧 Provider row 伪造成 PASS。

本 PASS 仅表示 proposal/design/spec delta 自洽、可供用户审批；不授权实现、不关闭 Gate C、不修改 active task checkbox，也不削弱 Java sandbox、MCP、OAuth security、tenant isolation、persistence/recovery、Gate D、full qualification、contract freeze 或 archive 门禁。

## Review 范围

- [OpenSpec proposal](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/openspec/changes/adopt-codex-oauth-regression-qualification/proposal.md)
- [OpenSpec design](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/openspec/changes/adopt-codex-oauth-regression-qualification/design.md)
- [OpenSpec tasks](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/openspec/changes/adopt-codex-oauth-regression-qualification/tasks.md)
- [provider-adapter spec delta](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/openspec/changes/adopt-codex-oauth-regression-qualification/specs/provider-adapter/spec.md)
- [current provider-adapter spec](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/openspec/specs/provider-adapter/spec.md)
- [active Runtime production proposal](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/openspec/changes/harden-agent-runtime-single-node-production/proposal.md)
- [active Runtime production design](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/openspec/changes/harden-agent-runtime-single-node-production/design.md)
- [active Runtime provider delta](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/openspec/changes/harden-agent-runtime-single-node-production/specs/provider-adapter/spec.md)
- [active Runtime tasks](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/openspec/changes/harden-agent-runtime-single-node-production/tasks.md)
- [archived Codex OAuth change](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/openspec/changes/archive/2026-07-12-add-chatgpt-oauth-auth)
- [Codex production qualification report](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/docs/verification/agent-runtime-v1/providers/2026-07-12-codex-app-server-production.json)
- [Codex OAuth final verification review](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/docs/review/2026-07-12-chatgpt-oauth-final-verification-review.md)
- [Zhipu advisory source report](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/docs/verification/agent-runtime-v1/providers/2026-07-14-zhipu-openai-compatible-production-real-runner-attempt-01.json)
- [dashboard source](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/docs/project-dashboard/development-log.json)
- [dashboard Markdown](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/docs/project-dashboard/development-log.md)
- [dashboard HTML](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/docs/project-dashboard/index.html)

## 主要发现

### Pass — required/advisory 边界准确

proposal 没有采用“Codex 通过即把所有旧 API row 改成 PASS”的失真方案，而是把资格权威拆成两层：

- Codex OAuth 六个 production rows 是 global model-regression required set；任一 required FAIL/BLOCKED、登录缺失、mock、证据绑定或 redaction 失败均否决模型门禁。
- API-key Provider 保留真实 PASS/FAIL/BLOCKED 结果，但以 `required: false` 或 required aggregate 之外的 advisory report 参与兼容性/优化记录，不否决 global model-regression PASS。
- 某个 advisory Provider 若要宣称自身 protocol production-qualified，仍需自己的 real matrix PASS；Codex evidence 不越权证明第三方协议。

这与用户批准的“回归真实模型统一使用 Codex OAuth；其他商业 API 阻塞作为优化记录”一致。

### Pass — 复用现有机制而非扩张 schema

[shared qualification schema](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/packages/shared-schema/src/index.ts) 已规定只有 `required: true` 的 FAIL/BLOCKED row 会否决 production PASS，因此 design 正确选择增加 required/advisory 回归测试和 Gate C policy evaluator，而不是引入含义混杂的新 row result。

[Codex production qualification report](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/docs/verification/agent-runtime-v1/providers/2026-07-12-codex-app-server-production.json) 当前是 production PASS、6/6 required PASS。报告 SHA-256 为 `af2aee9aa03ed1d795599205936fe3f47e25bbfa3bdd3e16e317e6e0769bfad6`，记录的 Codex client implementation SHA-256 为 `08b2aa0126f78ca45aad239e20981ad06b6e796539a1edc498706f2b81833ddc`；现场只读核对当前 client source hash 相同。proposal 仍要求实施时重新做 schema/hash/source/redaction reconciliation，未把历史证据自动晋升为当前 Gate C closeout。

### Important — 与 active Runtime provider delta 存在预期重叠

[active Runtime provider delta](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/openspec/changes/harden-agent-runtime-single-node-production/specs/provider-adapter/spec.md) 仍要求 OpenAI-compatible API-key matrix 全部 required PASS；[active Runtime tasks](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/openspec/changes/harden-agent-runtime-single-node-production/tasks.md) 的 3.1/3.5/3.6 仍未完成。

这不是 proposal 缺陷，而是本 change 必须解决的合同迁移面。实施时必须同时更新 active proposal/design/spec delta/tasks、已批准 plan、runbook 和 dashboard，并在新 Gate C decision artifact 与 strict Review PASS 后才可核对 checkbox。只 archive 新 spec delta、却保留 active old delta，会在后续 archive 产生互相冲突的 Provider 资格语义，因此 tasks 3.1–3.3 必须作为一个完整合同切片执行。

### Pass — 非模型门禁未被误降级

proposal/design/spec delta 均明确保留以下独立 hard gates：Codex OAuth secret boundary、pending-turn/tool bridge safety、Java sandbox、MCP、approval、tenant/user isolation、SQLite lifecycle/recovery、Stage 2 security/integration、Gate D formal workload、full qualification、contract freeze 与 archive。

因此本 change 只能消除“未使用 API-key Provider 的资格否决权”，不能把 active Runtime change 直接从 proposed 提升为 verified/archived。

### Medium — 已知权衡可接受

API-key Provider 的真实回归从 global release blocker 降为 advisory 后，其协议兼容性退化不会阻塞 Runtime 发布。proposal 通过三项约束控制风险：保留 adapters/deterministic tests/history evidence；保留真实 FAIL/BLOCKED；禁止在没有 dedicated real matrix PASS 时声明该 Provider 自身 production-qualified。

## 最终建议

1. 用户审阅并明确批准 `adopt-codex-oauth-regression-qualification` 的 proposal/design/tasks/spec delta。
2. 批准后使用 Superpowers writing-plans 生成 strict staged implementation plan，并先完成 Plan Preflight Review。
3. 第一实施切片做 executable policy + TDD；第二切片一次性对齐 active Runtime 合同；第三切片生成 no-overwrite Gate C decision artifact并做严格证据复核。
4. 只有 required Codex evidence 与 Stage 2 strict security/integration 全部 PASS 后，才核对 active tasks 3.1/3.5/3.6；Gate D 和后续 closeout 继续独立推进。
5. 不删除、不覆盖任何历史 Codex/Zhipu/Anthropic qualification report。

## 后续门禁

| 项 | 结论 |
| --- | --- |
| OpenSpec 是否创建 | 是，`adopt-codex-oauth-regression-qualification` |
| OpenSpec 是否严格有效 | 是 |
| 是否已授权实现 | 否；仍需用户对具体 OpenSpec 合同明确批准 |
| 是否需要 Superpowers plan | 是；批准后创建并做 Preflight Review |
| 实施证据等级 | strict |
| 是否关闭 Gate C | 否 |
| 是否修改 active Runtime checkbox | 否 |
| 是否修改项目规则 | 否 |
| dashboard 状态 | 新 change 为 `proposed`；active Runtime 仍为 `proposed` |

## 验证记录

- `npx openspec validate adopt-codex-oauth-regression-qualification --strict --no-interactive`：PASS，change valid。
- `npx openspec show adopt-codex-oauth-regression-qualification --json --deltas-only`：PASS，解析到 1 个 RENAMED 与 1 个 MODIFIED provider-adapter delta，6 个 scenarios 完整。
- `npx openspec validate harden-agent-runtime-single-node-production --strict --no-interactive`：PASS，active change 在迁移实施前仍保持原合同有效。
- `node` dashboard renderer：PASS，生成 35 entries。
- `pnpm dashboard:check`：PASS，dashboard generated outputs current。
- proposal/design/tasks/spec delta placeholder scan：无 `TBD`、`TODO`、`PLACEHOLDER`、`FIXME`。
- 新 OpenSpec artifacts trailing-whitespace scan：4 files，0 findings。
- `git diff --check`：PASS，无 whitespace diagnostics。
- 本轮未运行 Runtime/Java test suite：proposal-only 未修改源码、schema 或运行时行为；实现批准后按 strict plan 运行。
