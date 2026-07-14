# Real Provider Qualification Runner Step 8–16 Attempt 03 Review

## 结论

需修改。Attempt 03 已修复 generic evidence 令 13 行全 PASS、raw/adapter usage 同源自比较及无 oracle redaction 直接 PASS；全部 fresh Step 16 也通过。但 High 独立攻击 probe 证明 `stream` 与 `redaction` 的新 oracle 仍只校验 transport/runner 自报字段，不校验证据来源：零实际 stream event 可令 `stream` PASS，包含固定 canary 明文的报告可令 `redaction` PASS 并被 writer 发布。Step 8–16 仍不得 PASS，Step 17–20 与真实 Provider 执行继续禁止开始。

## Review 范围

- [Task 10 plan](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/docs/superpowers/plans/2026-07-03-agent-runtime-single-node-production-final-plan.md)
- [Attempt 02 Review](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/docs/review/2026-07-11-real-provider-runner-step8-16-attempt-02-review.md)
- [Attempt 03 Correction Brief](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/docs/review/2026-07-11-real-provider-runner-step8-16-attempt-03-correction-brief.md)
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

### 高：stream oracle 验证声明形状，不验证实际 SSE 事件

[Runner](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/backend/src/main/java/org/openharness/backend/qualification/RealProviderQualificationRunner.java) 在 adapter 返回后无条件写入 `streamObserved=true` 与固定 `stream-start/delta/stream-end` 序列。[Matrix](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/backend/src/main/java/org/openharness/backend/qualification/RealProviderQualificationMatrix.java) 只比较这些字段，没有要求它们来自 adapter SSE parser/capture。

High probe 的 transport 没有执行网络、没有产生 capture，也明确附带空 `actualTransportEvents`，仅提交上述三个声明字段；matrix 仍将 `stream` 判为 PASS。当前 oracle 因而无法证明收到过 delta、完成过 stream merge 或观察到 stream end。

### 高：redaction oracle 可谎报负扫描，writer 仍会发布 canary 明文

[Runner](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/backend/src/main/java/org/openharness/backend/qualification/RealProviderQualificationRunner.java) 实际只拼接检查 response 与 capture，却将 `response/capture/stdout/stderr/report` 五个 surface 全部写入 `scanSurfaces`。此时 stdout、stderr 与最终 report 尚未形成，不可能已经完成相应负扫描。[Matrix](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/backend/src/main/java/org/openharness/backend/qualification/RealProviderQualificationMatrix.java) 只信任 `canaryHash`、`negativeScan=true` 和 surface 名称列表。

High probe 提交一份同时包含以下内容的 redaction evidence：正确 canary hash、`negativeScan=true`、五个 surface 名称，以及 `leakedPayload=oh-qualification-redaction-canary-v1`。结果：

- `redaction` row 为 PASS；
- report writer 校验通过并发布目标；
- 已发布 JSON 确实包含固定 canary 明文。

[Report writer](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/backend/src/main/java/org/openharness/backend/qualification/QualificationReportWriter.java) 的字节拒绝规则检查 `qualification-canary`，但实际固定 canary 为 `qualification-redaction-canary`，该子串不连续，因而未形成最终兜底。报告中的 `negativeScan` 不是可验证事实。

## 已确认修复

- generic-only evidence 现在产生 0 个 PASS rows，unsupported 8 行默认 BLOCKED。
- OpenAI-compatible 与 Anthropic raw usage 均在 DTO 转为最终 `Contracts.Usage` 前采集；最终 adapter usage 独立来自 `ModelChatResponse.usage`。
- fake-provider tests 已覆盖两类 Provider 的 raw counters，raw/adapter mismatch 会令 row/report FAIL。
- typed chain、内部 budget admission、cost 重算、hard-link create-if-absent、零凭据零 transport、deadline/cancel/capture cleanup 均保持通过。
- actual diff 未执行 Step 17–20，未修改 OpenSpec 3.1/3.2、dashboard 或项目规则。

## Fresh 验证

- 显式 unset 两个 credential 的 focused Maven：37/37 PASS，exit 0。
- 显式 unset 两个 credential的 backend full：71/71 PASS，exit 0。
- shared-schema：49/49 PASS；全仓 typecheck PASS。
- runtime qualification：5/5 PASS；runtime typecheck PASS。
- `npx openspec validate harden-agent-runtime-single-node-production --strict --no-interactive`：valid，exit 0；仅 PostHog DNS telemetry warning。
- `git diff --check`：无输出，exit 0。
- High evidence attack probe：`stream=pass redaction=pass published=true containsCanary=true`，证明两个 oracle 均可伪造。
- 所有 High 临时 probe 源码、class、classpath 与报告目录均已删除。

## 最终建议

只执行 Step 8–16 Attempt 04 evidence-provenance correction：stream evidence 必须由 SSE parser/capture 的实际事件生成；redaction 必须在最终候选 report 与待输出 stdout/stderr 已形成后重新扫描真实字节，再决定 redaction row。matrix/writer 不得接受 transport 提交的 `negativeScan` 或 surface 名称作为最终证明。任何无法在当前生命周期真实观察的 row 必须 BLOCKED。

## 后续门禁

- 继续使用 active OpenSpec change `harden-agent-runtime-single-node-production`，无需新增 proposal。
- Step 8–16 Attempt 03 Review FAIL；不得进入 Step 17–20，不得讨论或执行真实 Provider qualification。
- OpenSpec 3.1/3.2、dashboard `verified` 与 archive 继续 BLOCKED。
- 不读取真实 credential，不执行真实 Provider 外呼。
- 不执行 git add、commit、push、reset、clean 或 archive。
- 本次仅新增 Review 与 correction brief；未修改项目规则、OpenSpec tasks、dashboard 或实现文件。
