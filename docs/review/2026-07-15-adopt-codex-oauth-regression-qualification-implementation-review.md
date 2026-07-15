# Adopt Codex OAuth Regression Qualification Implementation Review

## 结论

通过：`adopt-codex-oauth-regression-qualification` 已按获批合同和 strict implementation plan 完成实现与本地正式验证。官方 Codex CLI/app-server + ChatGPT/Codex OAuth 现为 Gate C 唯一 required real-model family；既有 Codex production report 经 immutable SHA、六个 required PASS rows、authorization metadata、redaction 与当前 client source SHA 绑定复核后，新的 no-overwrite provider decision 为 PASS。Zhipu source report 仍保持原始 `blocked`，只以 advisory reference 进入决策，没有修改或伪造任何 row。

本 Review 支持完成本 change 除 archive 外的 implementation tasks，并支持 active Runtime tasks 3.1、3.2、3.5、3.6 按现有证据核对完成。它不关闭 Gate D、formal 24-hour production workload、full production qualification、contract freeze、active Runtime closeout 或 archive，也不授权真实模型重跑、Git commit/push。

## Review 范围

- [OpenSpec proposal](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/openspec/changes/adopt-codex-oauth-regression-qualification/proposal.md)
- [OpenSpec design](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/openspec/changes/adopt-codex-oauth-regression-qualification/design.md)
- [OpenSpec tasks](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/openspec/changes/adopt-codex-oauth-regression-qualification/tasks.md)
- [provider-adapter spec delta](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/openspec/changes/adopt-codex-oauth-regression-qualification/specs/provider-adapter/spec.md)
- [strict implementation plan](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/docs/superpowers/plans/2026-07-15-adopt-codex-oauth-regression-qualification.md)
- [plan Preflight Review](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/docs/review/2026-07-15-adopt-codex-oauth-regression-qualification-plan-preflight-review.md)
- [shared qualification schema](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/packages/shared-schema/src/index.ts)
- [shared schema tests](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/packages/shared-schema/test/schema.test.ts)
- [Gate C provider policy](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/agent-runtime/src/qualification/gateCProviderPolicy.ts)
- [Gate C reconciliation CLI](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/agent-runtime/src/qualification/gateCProviderReconcileCli.ts)
- [Gate C policy/CLI tests](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/agent-runtime/test/gateCProviderPolicy.test.ts)
- [Agent Runtime package scripts](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/agent-runtime/package.json)
- [p1b persistence integration](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/integration-tests/test/p1b.integration.test.ts)
- [Codex production report](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/docs/verification/agent-runtime-v1/providers/2026-07-12-codex-app-server-production.json)
- [Codex client source](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/backend/src/main/java/org/openharness/backend/service/provider/CodexAppServerClient.java)
- [Zhipu advisory source report](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/docs/verification/agent-runtime-v1/providers/2026-07-14-zhipu-openai-compatible-production-real-runner-attempt-01.json)
- [Gate C provider decision](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/docs/verification/agent-runtime-v1/providers/2026-07-15-gate-c-codex-oauth-provider-decision.json)
- [active Runtime proposal](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/openspec/changes/harden-agent-runtime-single-node-production/proposal.md)
- [active Runtime design](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/openspec/changes/harden-agent-runtime-single-node-production/design.md)
- [active Runtime tasks](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/openspec/changes/harden-agent-runtime-single-node-production/tasks.md)
- [active Runtime provider delta](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/openspec/changes/harden-agent-runtime-single-node-production/specs/provider-adapter/spec.md)
- [Stage 0 plan](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/docs/superpowers/plans/2026-07-03-agent-runtime-single-node-production-final-plan.md)
- [production runbook](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/docs/architecture/agent-runtime-v1-production-runbook.md)
- [dashboard source](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/docs/project-dashboard/development-log.json)

## 主要发现

### Pass — required/advisory 决策不可被 advisory FAIL/BLOCKED 否决

shared report schema 的 observed row result 仍只有 PASS/FAIL/BLOCKED，没有引入含义混杂的 `advisory` result。新增 regression 明确证明：production report 中 `required:false` 的 FAIL/BLOCKED 不否决 overall PASS，而 required BLOCKED 继续否决。Gate C decision 进一步把 source report authority 分成 `required` 与 `advisory`，Zhipu report 的 `reportResult=blocked` 被原样保留。

### Pass — required Codex evidence fail-closed

pure evaluator 固定 authorized Codex report SHA-256 和 canonical six-row set，要求 production/PASS、row unique/order/required/PASS、`provider=codex-app-server`、`qualificationAuthorization=granted`、`credentialState=not-read`、current client source SHA binding、redaction canary evidence以及无 credential-bearing content。local/mock provider、required row 缺失/增加/失败、authorization/credential/source drift 或 secret-bearing report 均返回 BLOCKED；不调用 API-key 或 mock fallback。

### Pass — CLI 边界、不可覆盖与输出约束成立

CLI 只接受列明参数，可兼容 pnpm 传入的单个首部 `--`；unknown/missing/duplicate singleton flag 均 fail-closed。输入/output 均在 canonical project root 内解析，symlink-resolved input 越界和 output parent 越界被拒绝，artifact 只存 forward-slash project-relative path。写入使用 `wx`/`0600`，PASS 输出只含 result/policy/basename/hash；BLOCKED 输出只含 blocker count/classes；preflight failure 只含 error class。

首次生产执行生成 decision SHA-256 `47bd881cdc0875136ec137b7392f83fcecb9539c010cd5fc931d0720bc623b5a`、mode `0600`、`result=pass`、0 blockers。第二次同命令内部退出 2 且报告 `output_exists`；前后 hash 完全一致。

### Fixed — Review 发现的 schema trust gaps

初版 decision schema 只关联 result 与 blockers，可能接受 `result=pass` 但 required report 为 local/blocked 的矛盾对象，也只要求 evidence path 非空。adversarial RED tests 复现后已修复：PASS 现在强制 required `track=production/reportResult=pass`；absolute、Windows drive、backslash、empty/dot/dot-dot segment path 均被拒绝。修复后 shared schema/full Runtime tests 和 fresh artifact parse 全部 PASS。

### Fixed — pnpm 参数和旧 integration 断言

实际 package script 运行表明当前 pnpm 会把分隔符 `--` 传给 `tsx`。新增真实调用形态 RED test 后，CLI 只剥离一个首部 separator，重复/其他未知 flag 仍被拒绝。

全 workspace 验证同时暴露 [p1b persistence integration](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/integration-tests/test/p1b.integration.test.ts) 仍断言旧 `<tenant>/<conversation>.json` 路径，而现行 user-isolated contract 为 `<tenant>/<user>/<conversation>.json`。该既有测试先稳定失败，再仅把期望路径加入 user `u`；focused 和 full integration 均 PASS，没有修改生产持久化行为。

### Pass — active contract 与非模型门禁没有漂移

active Runtime proposal/design/provider delta/tasks、Stage 0 plan、runbook 和 dashboard 已统一为 required Codex OAuth / advisory API-key / independently required non-model gates。旧 Java API-key adapters、fake/local tests、real runner 和历史 reports 全部保留。Java sandbox、MCP、OAuth/pending-turn safety、tenant/user isolation、SQLite persistence/recovery、Gate D、final qualification、contract freeze 和 archive 没有被 advisory policy 降级。

### Pass — 本轮没有真实模型或凭证访问

本轮 decision 只读取已存在的 redacted reports 和当前 Java source。首次/二次 CLI、测试、Maven 与文档渲染均没有启动 Codex、读取 OAuth credential path、读取 `.env`、使用 API key 或访问真实 Provider endpoint。

## 最终建议

1. 将本 change 2.x–5.3 标记完成，保留 5.4 archive pending；dashboard 状态更新为 `verified` 并记录 implementation/verification/closeout。
2. 将 active Runtime 3.1、3.2、3.5、3.6 标记完成：required Codex decision、advisory Provider retention、required gap 修复和 full Stage 2 security/integration 均已有证据。
3. active Runtime dashboard 继续保持 `proposed`，因为 Gate D 4.2/4.3、full qualification 4.5、contract freeze 4.6 与 5.x 尚未完成。
4. 后续优先推进 Gate D formal 24-hour production workload；不得把本 decision 当作 Gate D、final release 或 archive 证据。
5. 若 Codex client source/report binding 未来变化，禁止覆盖本 decision；恢复 reviewed source 或另行授权 fresh Codex qualification，并创建新的 reviewed decision artifact。

## 后续门禁

| 门禁 | 结论 |
| --- | --- |
| 新 change implementation | PASS，可设 `verified` |
| 新 change archive | 未授权，5.4 保持 pending |
| active Runtime Stage 2 | PASS，可核对 3.1/3.2/3.5/3.6 |
| active Runtime Gate D | 未运行，继续 blocking |
| final qualification / contract freeze | 未完成 |
| 真实模型重跑 | 未授权且本轮未执行 |
| Git add/commit/push | 未授权且本轮未执行 |
| 项目规则 | 未修改 |

## 验证记录

- TDD RED：decision schema 未实现时 shared schema 59 PASS / 1 expected FAIL；policy module 缺失时 Agent Runtime suite expected FAIL；pnpm separator 和 contradictory decision tests 均先观察到预期 RED。
- focused GREEN：Gate C policy/CLI 7 tests PASS；shared schema 60 tests PASS；两包 typecheck PASS。
- `pnpm test`：PASS；shared schema 60、Agent Runtime 373、Frontend 24、integration 17 tests 全部通过。
- `pnpm typecheck`：PASS；shared schema、Agent Runtime、Frontend 全部通过。
- `mvn -f backend/pom.xml test`：PASS；200 tests，0 failure/error/skip。
- Java focused qualification/Codex matrix：PASS；94 tests，0 failure/error/skip。
- `npx openspec validate adopt-codex-oauth-regression-qualification --strict --no-interactive`：PASS。
- `npx openspec validate harden-agent-runtime-single-node-production --strict --no-interactive`：PASS。
- `pnpm dashboard:check`：PASS（task/dashboard reconciliation 后须再运行一次）。
- decision fresh `GateCProviderDecisionSchema.parse`：PASS，`result=pass`、0 blockers、advisory `blocked`。
- immutable input hashes：Codex report `af2aee9aa03ed1d795599205936fe3f47e25bbfa3bdd3e16e317e6e0769bfad6`；client source `08b2aa0126f78ca45aad239e20981ad06b6e796539a1edc498706f2b81833ddc`；Zhipu source `46083ae59a285d3d656cd9df2ca35ca9a8cd708e333535460d5e2497dc15b2c2`，均未改变。
- decision sensitive scan：无 access/refresh token、Authorization/Bearer、credential path、bridge/correlation id 或 app-server payload match。
- active normative stale-claim scan：无 required OpenAI-compatible Gate C 旧口径 match；历史 reviews/reports 保持不可变。
- `git diff --check`：PASS。
