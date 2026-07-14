# Real Provider Qualification Runner Step 8–16 Attempt 02 Review

## 结论

需修改。Attempt 02 已修复 typed orchestration、内部 budget admission、写前 usage/cost/budget 校验和非协作 no-overwrite；fresh Step 16 全部通过，High 独立 probe 也确认 hard-link race 与 forged budget 均 fail closed。但 production matrix 仍允许无 row-specific oracle 的通用结果将 13 个 required rows 全部标记为 PASS，且两个 Provider adapter 的 `rawProviderUsage` 实际由已经转换后的 adapter `Usage` 反向构造。Step 8–16 仍不得 PASS，Step 17–20 禁止开始，OpenSpec 3.1/3.2 保持未完成。

## Review 范围

- [Task 10 plan](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/docs/superpowers/plans/2026-07-03-agent-runtime-single-node-production-final-plan.md)
- [Attempt 01 Implementation Review](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/docs/review/2026-07-11-real-provider-runner-step8-16-implementation-review.md)
- [Attempt 02 Correction Brief](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/docs/review/2026-07-11-real-provider-runner-step8-16-correction-brief.md)
- [Runtime production OpenSpec change](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/openspec/changes/harden-agent-runtime-single-node-production)
- [Runner](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/backend/src/main/java/org/openharness/backend/qualification/RealProviderQualificationRunner.java)
- [Config](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/backend/src/main/java/org/openharness/backend/qualification/RealProviderQualificationConfig.java)
- [Matrix](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/backend/src/main/java/org/openharness/backend/qualification/RealProviderQualificationMatrix.java)
- [Exchange capture](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/backend/src/main/java/org/openharness/backend/qualification/QualificationExchangeCapture.java)
- [Report writer](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/backend/src/main/java/org/openharness/backend/qualification/QualificationReportWriter.java)
- [OpenAI-compatible adapter](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/backend/src/main/java/org/openharness/backend/service/provider/OpenAiCompatibleAdapter.java)
- [Anthropic adapter](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/backend/src/main/java/org/openharness/backend/service/provider/AnthropicAdapter.java)
- [qualification tests](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/backend/src/test/java/org/openharness/backend/qualification)

## 主要发现

### 高：通用 status/usage 可让全部 13 个 production rows 伪 PASS

[RealProviderQualificationMatrix.java](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/backend/src/main/java/org/openharness/backend/qualification/RealProviderQualificationMatrix.java) 第 33–45 行允许 transport 直接声明任意 row 为 `pass`；第 73–90 行只验证 raw/adapter usage 相等和 cost/budget，没有按 row id 验证 capability-specific observed sequence 或 oracle。第 168–188 行的 writer validation 同样只复核 usage/cost/budget。

High 独立 probe 对每个 row 返回同一个 `status=generic-only` 和相同 usage，实际观察 `exit=0`、`calls=13`、`overallPass=true`；报告中 `containsCanary=false`、`containsRowOracle=false`、`containsObservedSequence=false`。因此 `single-tool-call`、`multi-step-tool-call`、`structured-arguments`、`reasoning`、`503-retry`、`timeout`、`cancellation`、`terminal-error`、`redaction` 等 required rows 都可以在没有业务证据时被 injected transport 伪造为 PASS。

生产默认 transport 虽然把其中八行 fail closed 为 blocked，但 [Runner](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/backend/src/main/java/org/openharness/backend/qualification/RealProviderQualificationRunner.java) 第 66–78 行会把 `sync`、`stream`、`usage`、`cost`、`redaction` 的任意成功响应直接标为 PASS；所有行共用普通 prompt。特别是 `redaction` 没有 canary、负扫描或泄漏 oracle，却可 PASS。修复必须让 PASS 由 row-specific oracle 产生并在写前再次验证；未实现或未授权的 row 必须 blocked，不能依赖 transport 自报结果。

### 高：`rawProviderUsage` 是 adapter usage 的同源副本，不是原始 Provider 证据

[OpenAI-compatible adapter](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/backend/src/main/java/org/openharness/backend/service/provider/OpenAiCompatibleAdapter.java) 第 96–105 行先把 Provider response 转为 `Contracts.Usage`，再从该 `usage` 构造 `rawProviderUsage`。[Anthropic adapter](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/backend/src/main/java/org/openharness/backend/service/provider/AnthropicAdapter.java) 第 71–80 行也从 `modelResponse.usage()` 反向构造所谓 raw usage。

因此 matrix 中的 `rawProviderUsage == adapterUsage` 是同一转换结果与自身比较，无法发现字段映射、cache usage、stream aggregation 或 adapter conversion 错误。修复必须在转换前从解析后的原始 Provider response/stream usage 采集 sanitized raw counters，再与最终 `ModelChatResponse.usage` 独立对账；测试必须人为制造 raw/adapter conversion mismatch 并证明 production row FAIL。

## 已确认修复

- credential-present typed chain 已能执行 13 次 injected dispatch、生成 13 行 immutable report，并按整体 result 返回 exit code。
- 4 KiB conservative fixture bound、`maxOutputTokens` 与配置价格在 dispatch 前内部计算 admission；不再接受 caller-supplied worst-case cost。
- writer 已复核 PASS 行 raw/adapter/published usage、逐行 cost 与累计预算；High forged 13,000/1,000 budget probe 被拒绝且未发布目标。
- sibling temp fsync 后使用 hard-link create-if-absent；High 非协作竞争 probe 返回 `failedClosed=true`、`byteIdentical=true`。
- 缺凭据路径继续生成固定 13 行 production/BLOCKED 报告且 transport construction 为 0。
- timeout/cancel cooperative cleanup、capture clear、recursive redaction 与 canary fixture 边界继续通过。

## Fresh 验证

- `env -u OPENAI_COMPATIBLE_API_KEY -u ANTHROPIC_API_KEY mvn -f backend/pom.xml -Dtest=RealProviderQualificationRunnerTest,RealProviderQualificationConfigTest,RealProviderQualificationMatrixTest,QualificationReportWriterTest,OpenAiFakeProviderMatrixTest,AnthropicFakeProviderMatrixTest,OutboundRequestTrackerTest,QualificationRedactorTest test`：32/32 PASS。
- `env -u OPENAI_COMPATIBLE_API_KEY -u ANTHROPIC_API_KEY mvn -f backend/pom.xml test`：66/66 PASS。
- `pnpm --filter @openharness/shared-schema test`：49/49 PASS；typecheck PASS。
- `pnpm --filter @openharness/agent-runtime test -- qualificationReport qualificationRedaction`：5/5 PASS；typecheck PASS。
- `npx openspec validate harden-agent-runtime-single-node-production --strict --no-interactive`：valid，exit 0；仅 PostHog DNS telemetry warning。
- `git diff --check`：PASS。
- canary scan：仅命中 4 处指定 Java test fixture，生成报告与 evidence 目录零命中。
- High 独立 probe：generic 13-row false PASS 已复现；hard-link race 与 forged budget 均正确 fail closed。
- 所有 High 临时 probe 源码、class、classpath、报告和目录均已删除。

## 最终建议

只执行 Step 8–16 Attempt 03 correction：为每个 fixed row 定义可验证的 required evidence/oracle；默认 transport 未实现或未获授权的 row 必须 blocked；至少为 sync、stream、usage、cost、redaction 建立真实 row-specific oracle，redaction 使用固定合成 canary与负扫描。将 raw usage capture 移到 Provider response 转换之前，并增加 raw/adapter conversion mismatch 测试。保留本轮 typed chain、budget 和 hard-link 修复。

## 后续门禁

- 继续使用 active OpenSpec change `harden-agent-runtime-single-node-production`，无需新增 proposal。
- Step 8–16 Attempt 02 Review FAIL；不得进入 Step 17–20。
- OpenSpec 3.1/3.2、dashboard `verified`、真实 Provider execution 与 archive 继续 BLOCKED。
- 不读取真实 credential，不执行真实 Provider 外呼。
- 不执行 git add、commit、push、reset、clean 或 archive。
- 本次未修改项目规则、OpenSpec tasks、dashboard 或实现文件。
