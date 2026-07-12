# Real Provider Qualification Runner Step 8–16 Attempt 03 Correction Brief

## 项目与必读材料

- 项目：[OpenHarness](file:///Users/elvis/file/develop/opensource/openharness)
- 执行 worktree：[gate-b-real-provider-closeout](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/gate-b-real-provider-closeout)
- 必读 Review：[Attempt 02 Review](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/gate-b-real-provider-closeout/docs/review/2026-07-11-real-provider-runner-step8-16-attempt-02-review.md)
- 必读计划：[Task 10 plan](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/gate-b-real-provider-closeout/docs/superpowers/plans/2026-07-03-agent-runtime-single-node-production-final-plan.md)
- 必读规则：[AGENTS.md](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/gate-b-real-provider-closeout/AGENTS.md)、[OpenSpec AGENTS.md](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/gate-b-real-provider-closeout/openspec/AGENTS.md)
- 批准合同：[harden-agent-runtime-single-node-production](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/gate-b-real-provider-closeout/openspec/changes/harden-agent-runtime-single-node-production)

## 任务目标

只修复 Runner Step 8–16 Attempt 02 剩余的 evidence-integrity 问题：禁止 generic transport 自报 13 行 PASS，并使 raw Provider usage 与 adapter usage 真正独立。

## 必须修复

1. 为 13 个 fixed row 定义 row-specific required evidence/oracle validator。PASS 必须由 matrix/validator 根据 observed evidence 判定，不能直接信任 `RowOutcome.result`。
2. 未实现或未获 provider-backed fixture 授权的 tool/reasoning/retry/timeout/cancel/error rows 必须明确 blocked；generic status/usage 不得使任何 capability row PASS。
3. 至少完成 sync、stream、usage、cost、redaction 的本地可验证 oracle：验证 response/content 或事件顺序、stream observation、usage presence/equality、cost recomputation；redaction 使用固定合成 canary并证明 stdout/stderr/capture/report 不含 canary。
4. OpenAI-compatible 与 Anthropic raw usage 必须在 adapter conversion 前从解析后的原始 response/stream usage 采集；最终 adapter usage 从 `ModelChatResponse.usage` 独立取得。不得从 adapter usage 反向构造 raw usage。
5. TDD 增加：generic 13-row transport 不得 overall PASS；redaction 无 canary/oracle 不得 PASS；人为制造 raw/adapter conversion mismatch 时对应 row 与 report 必须 FAIL。
6. 保留 Attempt 02 已通过的 typed chain、internal budget admission、writer cost/budget validation、hard-link no-overwrite、zero-credential、deadline/cancel/capture cleanup 和 recursive redaction。

## 允许范围

- [Runner](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/gate-b-real-provider-closeout/backend/src/main/java/org/openharness/backend/qualification/RealProviderQualificationRunner.java)
- [Config](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/gate-b-real-provider-closeout/backend/src/main/java/org/openharness/backend/qualification/RealProviderQualificationConfig.java)
- [Matrix](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/gate-b-real-provider-closeout/backend/src/main/java/org/openharness/backend/qualification/RealProviderQualificationMatrix.java)
- [Exchange capture](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/gate-b-real-provider-closeout/backend/src/main/java/org/openharness/backend/qualification/QualificationExchangeCapture.java)
- [Report writer](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/gate-b-real-provider-closeout/backend/src/main/java/org/openharness/backend/qualification/QualificationReportWriter.java)
- [OpenAI-compatible adapter](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/gate-b-real-provider-closeout/backend/src/main/java/org/openharness/backend/service/provider/OpenAiCompatibleAdapter.java)
- [Anthropic adapter](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/gate-b-real-provider-closeout/backend/src/main/java/org/openharness/backend/service/provider/AnthropicAdapter.java)
- [对应 qualification/provider tests](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/gate-b-real-provider-closeout/backend/src/test/java/org/openharness/backend)

## 禁止事项

- 不执行 Step 17–20，不连接真实 endpoint，不读取或打印真实 credential。
- 不把 injected generic transport、loopback fake 或同源 usage 自比较当作 production PASS。
- 不勾 OpenSpec 3.1/3.2，不修改 dashboard，不归档 change。
- 不执行 git add、commit、push、reset、clean 或 archive。
- 不删除或回退本轮已通过的 budget/no-overwrite 修复与 Review 证据。

## Fresh 验证与 Report

完成 RED/GREEN 后运行完整 Step 16、canary scan、OpenSpec strict 和 `git diff --check`。Report 必须包含 generic false-PASS RED/GREEN、真实 raw/adapter mismatch RED/GREEN、redaction canary evidence、actual diff、测试数量/exit code、零真实外呼证明、最终 `git status --short` 和残余风险。最终输出使用 `DONE_WITH_CONCERNS` 或 `BLOCKED`，不得自行声明 Step 8–16 PASS；High 将重新审查 actual diff 并独立攻击 row oracle 与 raw usage provenance。
