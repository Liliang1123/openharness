# Adopt Codex OAuth Regression Qualification Plan Preflight Review

## 结论

通过：经 strict Preflight Review，[实施计划](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/docs/superpowers/plans/2026-07-15-adopt-codex-oauth-regression-qualification.md) 已覆盖获批 OpenSpec 的 required/advisory 资格语义、TDD 顺序、active contract 迁移、不可覆盖证据、敏感信息约束、严格验证和停止条件，可进入实施。

本 PASS 只授权计划内的本地代码、测试、规范、运行手册、dashboard 和新决策证据变更。它不授权真实 Codex/API-key 模型调用、OAuth 登录态变更、Gate D、OpenSpec archive、Git 暂存、commit 或 push。

## Review 范围

- [实施计划](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/docs/superpowers/plans/2026-07-15-adopt-codex-oauth-regression-qualification.md)
- [OpenSpec proposal](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/openspec/changes/adopt-codex-oauth-regression-qualification/proposal.md)
- [OpenSpec design](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/openspec/changes/adopt-codex-oauth-regression-qualification/design.md)
- [OpenSpec tasks](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/openspec/changes/adopt-codex-oauth-regression-qualification/tasks.md)
- [provider-adapter spec delta](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/openspec/changes/adopt-codex-oauth-regression-qualification/specs/provider-adapter/spec.md)
- [proposal Review](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/docs/review/2026-07-15-adopt-codex-oauth-regression-qualification-proposal-review.md)
- [active Runtime proposal](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/openspec/changes/harden-agent-runtime-single-node-production/proposal.md)
- [active Runtime design](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/openspec/changes/harden-agent-runtime-single-node-production/design.md)
- [active Runtime tasks](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/openspec/changes/harden-agent-runtime-single-node-production/tasks.md)
- [active Runtime provider delta](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/openspec/changes/harden-agent-runtime-single-node-production/specs/provider-adapter/spec.md)
- [Stage 0 implementation plan](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/docs/superpowers/plans/2026-07-03-agent-runtime-single-node-production-final-plan.md)
- [production runbook](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/docs/architecture/agent-runtime-v1-production-runbook.md)
- [shared qualification schema](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/packages/shared-schema/src/index.ts)
- [shared schema tests](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/packages/shared-schema/test/schema.test.ts)
- [Agent Runtime package](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/agent-runtime/package.json)
- [Codex production report](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/docs/verification/agent-runtime-v1/providers/2026-07-12-codex-app-server-production.json)
- [Codex client source](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/backend/src/main/java/org/openharness/backend/service/provider/CodexAppServerClient.java)
- [Zhipu advisory report](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/docs/verification/agent-runtime-v1/providers/2026-07-14-zhipu-openai-compatible-production-real-runner-attempt-01.json)
- [dashboard source](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/docs/project-dashboard/development-log.json)

## 主要发现

### Pass — 合同覆盖完整

计划逐项覆盖获批 OpenSpec：六个 Codex production required rows、mock/fallback 拒绝、report/client source SHA 绑定、API-key report advisory 且保留原始结果、active Runtime 合同整体迁移，以及非模型门禁保持独立阻塞。OpenSpec tasks 2.x–5.x 均有对应实施、验证或收口步骤。

### Fixed — 项目根和证据路径边界

初版 CLI 只接受相对输入路径，可能把 `../` 写入决策证据，也没有明确拒绝项目外路径。Preflight 已要求并确认计划增加 `--project-root`：所有输入和输出均在 canonical project root 下解析，越界立即拒绝，证据只存 forward-slash 项目相对路径。

### Fixed — required row canonical order 与既有不可变证据一致

初版计划列举的 canonical order 与现有 Codex report 顺序不一致。计划已改为 `sync → reasoning → usage → stream → cancellation → redaction`，与不可变报告保持一致；仍要求唯一、完整、全 required/PASS，不放松 row 集合约束。

### Pass — TDD、生产接线和错误路径可执行

计划先新增 RED schema/policy/CLI cases，再实现 shared schema、pure evaluator 和 CLI；真实产物由 package script 生成，不依赖手工 JSON。CLI 对未知/重复参数、解析失败、路径越界、existing output 采用 fail-closed，写入使用 `wx` 与 `0600`。PASS、BLOCKED、preflight failure 的退出码与输出边界均明确。

### Pass — 证据、回滚和停止条件严格

计划只读取两份历史报告与当前 Codex client source，不调用模型、不读取 OAuth/API-key/.env。唯一新证据采用固定目标名且禁止覆盖；hash/source/schema/required-row/sensitive scan/test/OpenSpec/dashboard 任一异常都会停止。生成后若回滚，不删除证据，而以新 review/decision 标记 superseded 或 blocked。

### Pass — Git 与跨门禁权限边界清晰

计划明确禁止 `git add`、commit、push、archive、Gate D 和真实模型重跑。active 3.1/3.5/3.6 checkbox 仅在对应证据成立时更新；Gate D、full qualification、contract freeze、closeout 与 archive 不在本次范围。

## 最终建议

1. 按计划使用 TDD 完成 shared schema、pure policy evaluator 和 no-overwrite CLI。
2. 用同一实施切片同步 active Runtime proposal/design/tasks/provider delta、Stage 0 plan、runbook 和 dashboard，避免两个 active change 的 provider 语义冲突。
3. 只从已核验的 immutable Codex report/current client source/Zhipu advisory report 生成新决策证据，不修改源报告。
4. 实施后执行 focused/full TypeScript 与 Java 回归、OpenSpec strict validation、dashboard check、sensitive scan、diff check 和 strict implementation Review；所有 finding 必须修复后重审。

## 后续门禁

| 门禁 | 结论 |
| --- | --- |
| OpenSpec proposal | 已由用户于 2026-07-15 明确批准 |
| Superpowers plan | 已生成，Preflight PASS |
| 实施方式 | executing-plans + TDD，当前窗口内顺序执行 |
| 证据等级 | strict |
| 真实模型调用 | 不授权；本计划不调用 Codex 或 API-key Provider |
| Gate D | 不在范围，继续 pending |
| Git publication | 不授权 add/commit/push |
| OpenSpec archive | 不授权；完成后仍需独立 closeout 决策 |
| 项目规则 | 未修改 |

## 验证记录

- `npx openspec validate adopt-codex-oauth-regression-qualification --strict --no-interactive`：PASS。
- `npx openspec validate harden-agent-runtime-single-node-production --strict --no-interactive`：PASS。
- `node docs/project-dashboard/scripts/render-dashboard.mjs`：PASS，生成 35 entries。
- `pnpm dashboard:check`：PASS，生成物与唯一数据源一致。
- `git diff --check`：PASS。
- plan/OpenSpec placeholder scan：无 `TBD`、`TODO`、`PLACEHOLDER`、`FIXME` 或模糊实现占位语句。
- 新决策目标存在性检查：目标不存在，满足 no-overwrite precondition。
- 只读 SHA-256 复核：Codex report 为 `af2aee9aa03ed1d795599205936fe3f47e25bbfa3bdd3e16e317e6e0769bfad6`；当前 Codex client source 为 `08b2aa0126f78ca45aad239e20981ad06b6e796539a1edc498706f2b81833ddc`；Zhipu advisory source report 为 `46083ae59a285d3d656cd9df2ca35ca9a8cd708e333535460d5e2497dc15b2c2`。
- 计划引用的 Java focused test classes：全部存在。
