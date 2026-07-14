# Defer Anthropic From Gate C Closeout Review

## 结论

通过：`defer-anthropic-from-gate-c` 的 14/14 tasks 已完成，focused qualification/report smoke 在真实 Provider 凭据变量显式 unset 的前提下 22/22 PASS，两个 policy requirements 已合入 current `provider-adapter` spec，OpenSpec change 已归档，dashboard 已同步为 `archived` 并重新渲染。

该通过仅关闭 Anthropic Gate C policy amendment，不关闭 Stage 0、Gate C 或任何生产资格门禁。`harden-agent-runtime-single-node-production` 仍为 active/proposed；OpenAI-compatible required real rows、Gate B production migration evidence、production Gate D、contract freeze 和 Stage 0 archive 仍未满足。Runtime parity 仍不得创建 proposal、dashboard entry、implementation plan 或代码。

## Review 范围

- [Archived OpenSpec change](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/openspec/changes/archive/2026-07-12-defer-anthropic-from-gate-c/)
- [Archived tasks](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/openspec/changes/archive/2026-07-12-defer-anthropic-from-gate-c/tasks.md)
- [Archived provider-adapter delta](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/openspec/changes/archive/2026-07-12-defer-anthropic-from-gate-c/specs/provider-adapter/spec.md)
- [Current provider-adapter spec](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/openspec/specs/provider-adapter/spec.md)
- [Stage 0 active change](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/openspec/changes/harden-agent-runtime-single-node-production/)
- [Dashboard source](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/docs/project-dashboard/development-log.json)
- [Dashboard Markdown](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/docs/project-dashboard/development-log.md)
- [Dashboard HTML](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/docs/project-dashboard/index.html)
- [OpenAI-compatible matrix tests](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/backend/src/test/java/org/openharness/backend/qualification/OpenAiFakeProviderMatrixTest.java)
- [Anthropic matrix tests](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/backend/src/test/java/org/openharness/backend/qualification/AnthropicFakeProviderMatrixTest.java)
- [Qualification promotion tests](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/backend/src/test/java/org/openharness/backend/qualification/QualificationReportPromoterTest.java)
- [Outbound request tracker tests](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/backend/src/test/java/org/openharness/backend/qualification/OutboundRequestTrackerTest.java)

## 主要发现

### Pass — Optional smoke 已提供 fresh evidence

宿主环境 focused smoke 共运行 22 项测试，结果 22 PASS、0 failures、0 errors、0 skipped。首次沙箱运行因 loopback socket bind 被平台拒绝而未进入相关业务断言；相同命令在获批宿主环境重跑后通过，没有修改测试、放宽断言或启用真实 Provider 凭据。

### Pass — OpenSpec policy amendment 已进入 current spec

归档将 `Gate C OpenAI-Compatible-Only Real Provider Qualification` 与 `Deferred Anthropic Real Provider Qualification` 两个 requirements 合入 current `provider-adapter` spec。Anthropic 缺少凭据不再单独阻塞 Gate C，但 OpenAI-compatible required row 的 FAIL/BLOCKED 仍禁止 Gate C PASS；OpenAI-compatible 成功也不能代表 Anthropic 已获生产资格。

### Pass — Dashboard 与 archive 状态一致

`defer-anthropic-from-gate-c` 已从 `partial` 更新为 `archived`，OpenSpec 路径全部指向 `2026-07-12-defer-anthropic-from-gate-c` archive，记录 14/14 tasks、focused smoke、archive 命令和本 closeout。生成物已从 JSON 单一数据源重新渲染。

### Blocked — Stage 0 与 Runtime parity 边界不变

本 change 的归档只是将已批准的 provider-family policy 固化到 current spec。它没有提供 OpenAI-compatible 真实 required rows、生产迁移、production Gate D、contract freeze 或 Stage 0 final Review，因此不能提升 Stage 0 dashboard 状态，也不能解除 Runtime parity 前置门禁。

## 验证记录

| 命令 | 结果 |
| --- | --- |
| `mvn -f backend/pom.xml -Dtest=OpenAiFakeProviderMatrixTest,AnthropicFakeProviderMatrixTest,QualificationReportPromoterTest,OutboundRequestTrackerTest test` | PASS — 22/22，Provider credential variables unset |
| `npx openspec validate defer-anthropic-from-gate-c --strict --no-interactive` | PASS — archive 前 change valid |
| `npx openspec archive defer-anthropic-from-gate-c --yes` | PASS — 归档并向 current spec 新增 2 requirements |
| `node docs/project-dashboard/scripts/render-dashboard.mjs` | PASS — MD/HTML 已生成，34 entries |
| `npx openspec validate --all --strict --no-interactive` | PASS — 23/23 |
| `pnpm dashboard:check` | PASS — 34 entries，生成物 current |

OpenSpec 命令报告的 PostHog DNS/flush 警告来自离线遥测，不影响命令退出码、归档结果或严格校验结论。

## 最终建议

1. 将 Anthropic 保持为 post-Gate-C deferred family；在获得明确凭据与运行授权前，不宣称 Anthropic production-qualified。
2. 后续只沿 active `harden-agent-runtime-single-node-production` 推进，优先补 Gate B production migration evidence，再按批准顺序处理 Gate C、Gate D、contract freeze 和 archive。
3. 不使用本 change archive 作为 Runtime parity 启动依据；必须等待 Stage 0 完成、Review PASS、dashboard archived 与 OpenSpec archive。

## 后续门禁

- OpenSpec：`defer-anthropic-from-gate-c` 已归档；`harden-agent-runtime-single-node-production` 仍 active。暂不创建 parity change。
- Superpowers：Stage 0 后续生产迁移、真实 Provider 与 Gate D 仍为 strict evidence slices，需要相应授权、fresh verification 和独立 Review。
- 实施计划：不需要新的 Anthropic implementation plan；不得创建 parity implementation plan。
- 人工审批：Gate B production evidence、真实 Provider endpoint/model/cost/credential、Gate D start/promotion、Stage 0 archive 均未由本次授权覆盖。
- 项目规则：未修改。
