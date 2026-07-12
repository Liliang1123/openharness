# Real Provider Qualification Runner Step 8–16 Attempt 05 Review

## 结论

有风险：`DONE_WITH_CONCERNS`。Attempt 05 correction 的独立复审无 High/Medium finding，但本结论不声明 Runner Step 8–16 overall PASS。两类 loopback 已证明正式 adapter/parser capture；受本轮禁止真实 endpoint/credential 约束，尚未通过 private production main issuer 完成正向端到端晋升。Step 17–20、OpenSpec 3.1/3.2、dashboard、archive 继续禁止。

## Review 范围

- [Attempt 04 Review](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/gate-b-real-provider-closeout/docs/review/2026-07-11-real-provider-runner-step8-16-attempt-04-review.md)
- [Attempt 05 Correction Brief](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/gate-b-real-provider-closeout/docs/review/2026-07-11-real-provider-runner-step8-16-attempt-05-correction-brief.md)
- [Task 10 plan](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/gate-b-real-provider-closeout/docs/superpowers/plans/2026-07-03-agent-runtime-single-node-production-final-plan.md)
- [Runner](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/gate-b-real-provider-closeout/backend/src/main/java/org/openharness/backend/qualification/RealProviderQualificationRunner.java)
- [Matrix](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/gate-b-real-provider-closeout/backend/src/main/java/org/openharness/backend/qualification/RealProviderQualificationMatrix.java)
- [Exchange capture](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/gate-b-real-provider-closeout/backend/src/main/java/org/openharness/backend/qualification/QualificationExchangeCapture.java)
- [Writer](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/gate-b-real-provider-closeout/backend/src/main/java/org/openharness/backend/qualification/QualificationReportWriter.java)
- [Adapters](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/gate-b-real-provider-closeout/backend/src/main/java/org/openharness/backend/service/provider)
- [Qualification tests](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/gate-b-real-provider-closeout/backend/src/test/java/org/openharness/backend/qualification)

## Actual diff

- Public injected `TransportFactory` 固定进入 untrusted matrix execution；stream/redaction 在缺少 private production boundary 时强制 BLOCKED。
- 正式路径使用 private `ProductionTransport`；redaction surface 由 request-bound immutable `ProductionCloseoutSurface(requestId,response,capture)` record 表示，并通过 `AtomicReference.compareAndSet` 单次签发。
- Matrix 丢弃 injected outcome 中 `_actualResponseSurface/_actualCaptureSurface`；writer 只接受 report 外 `CloseoutEvidence`。
- Stream oracle 绑定 provider-specific parser tag、当前 request identity、真实事件序列、正 delta count 与 merge completion。
- `WrittenReport` 返回 defensive-copy final bytes、这些 bytes 的 SHA-256 与 closeout 后 final result；runner 仅用该 result/hash 生成 stdout 和 exit。
- 新增/强化 Attempt 04 双攻击、两类 loopback parser、五 surface canary、published bytes/hash/result/stdout/exit 一致性回归。

## RED / GREEN

- RED：临时取消 matrix production-boundary veto 后，`injectedTransportCannotForgeProductionStreamOrRedactionEvidence` 在 stream 断言处观察到 `expected blocked but was pass`，2 tests / 1 failure。
- GREEN：恢复 veto 后，双攻击与 writer closeout/canary focused 3/3 PASS；review 修复后的 runner/writer 13/13 PASS。

## Provenance 设计与攻击复跑

- injected transport 可调用 public capture API、提交完整 `openai-sse` tag、当前 request id、三段事件、delta、merge 及两个旧 surface 字段，但不能获得 private production issuer/boundary/carrier。
- 攻击结果：stream=`blocked`、redaction=`blocked`、report=`blocked`；exit 精确等于 final report result 的映射；stdout result 与 SHA-256 绑定 published bytes；report/stdout 无 legacy surface 字段。
- Writer 扫描 response、capture、stdout candidate、stderr、final report bytes；任一固定 canary 命中均拒绝发布，temp cleanup 保持通过。

## Fresh Step 16

- 显式 unset 两 credential 的 focused Maven：44/44 PASS。
- 显式 unset 两 credential 的 backend full：78/78 PASS。
- OpenAI loopback 6/6、Anthropic loopback 5/5；均绑定 `127.0.0.1` fixture，验证 provider-specific SSE parser capture。
- shared-schema：49/49 PASS；shared typecheck PASS。
- runtime qualification：5/5 PASS；runtime typecheck PASS。
- `DO_NOT_TRACK=1 npx openspec validate harden-agent-runtime-single-node-production --strict --no-interactive`：valid。
- `git diff --check`：PASS。

## Canary scan 与零真实外呼证明

- credential canary 仅命中指定测试源码；verification reports 无命中。
- legacy surface 仅命中 matrix 丢弃逻辑与攻击测试；未进入发布 report/stdout。
- 所有验证命令均显式 unset `OPENAI_COMPATIBLE_API_KEY`、`ANTHROPIC_API_KEY`；网络型测试只绑定 `127.0.0.1` 本地 fixture。injected High probe 使用 synthetic credential 与 in-process transport，未构造真实 adapter、DNS、外部 socket 或 HTTP 请求。

## 主要发现

### Concern：production issuer 正向端到端证据留待授权阶段

两类 loopback 已证明正式 adapter 的 parser identity/request/events/merge capture，但未通过 private production `main` 入口晋升 stream PASS。为补测试开放 production issuer 或把 injected loopback 当 production 会破坏本次信任边界；在禁止真实 endpoint/credential 的 Attempt 05 内保持该项为 concern。

## 最终建议

保留 private production transport、immutable request-bound carrier、matrix production veto、writer final-result contract 与攻击回归。当前只接受 Attempt 05 correction；不得据此自行声明 Step 8–16 overall PASS。

## 后续门禁

- 无需新增 OpenSpec proposal 或实施计划；继续使用 active change `harden-agent-runtime-single-node-production`。
- 不进入 Step 17–20，不勾 OpenSpec 3.1/3.2，不修改 dashboard，不 archive。
- 八个未授权 capability rows 继续 BLOCKED。
- 未修改项目规则；未执行 git add、commit、push、reset 或 clean。

## Final `git status --short`

```text
 M backend/src/main/java/org/openharness/backend/service/provider/AnthropicAdapter.java
 M backend/src/main/java/org/openharness/backend/service/provider/OpenAiCompatibleAdapter.java
 M backend/src/test/java/org/openharness/backend/qualification/AnthropicFakeProviderMatrixTest.java
 M backend/src/test/java/org/openharness/backend/qualification/OpenAiFakeProviderMatrixTest.java
 M docs/superpowers/plans/2026-07-03-agent-runtime-single-node-production-final-plan.md
?? backend/src/main/java/org/openharness/backend/qualification/QualificationExchangeCapture.java
?? backend/src/main/java/org/openharness/backend/qualification/QualificationReportWriter.java
?? backend/src/main/java/org/openharness/backend/qualification/RealProviderQualificationConfig.java
?? backend/src/main/java/org/openharness/backend/qualification/RealProviderQualificationMatrix.java
?? backend/src/main/java/org/openharness/backend/qualification/RealProviderQualificationRunner.java
?? backend/src/test/java/org/openharness/backend/qualification/QualificationReportWriterTest.java
?? backend/src/test/java/org/openharness/backend/qualification/RealProviderQualificationConfigTest.java
?? backend/src/test/java/org/openharness/backend/qualification/RealProviderQualificationMatrixTest.java
?? backend/src/test/java/org/openharness/backend/qualification/RealProviderQualificationRunnerTest.java
?? backend/src/test/java/org/openharness/backend/qualification/TestConfigs.java
?? docs/review/2026-07-11-gate-b-real-provider-evidence-review.md
?? docs/review/2026-07-11-real-provider-runner-plan-preflight-review.md
?? docs/review/2026-07-11-real-provider-runner-step8-16-attempt-02-review.md
?? docs/review/2026-07-11-real-provider-runner-step8-16-attempt-03-correction-brief.md
?? docs/review/2026-07-11-real-provider-runner-step8-16-attempt-03-review.md
?? docs/review/2026-07-11-real-provider-runner-step8-16-attempt-04-correction-brief.md
?? docs/review/2026-07-11-real-provider-runner-step8-16-attempt-04-review.md
?? docs/review/2026-07-11-real-provider-runner-step8-16-attempt-05-correction-brief.md
?? docs/review/2026-07-11-real-provider-runner-step8-16-attempt-05-review.md
?? docs/review/2026-07-11-real-provider-runner-step8-16-correction-brief.md
?? docs/review/2026-07-11-real-provider-runner-step8-16-implementation-review.md
```
