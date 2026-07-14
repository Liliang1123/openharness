# Gate C Compress Timeout Follow-Up Review

## 结论

通过：外部复核指出的 `/compress` provider timeout 裸 500 风险已按 TDD 补齐。`/compress` 现在与 `/chat` 使用同一 provider timeout / unavailable 分类边界，provider timeout 会抛出结构化 `PROVIDER_TIMEOUT`，不会返回伪摘要，也不会裸 RuntimeException 冒泡为非结构化 500。

本修复不改变 Gate C 状态，不勾选 3.1 / 3.2 / 3.5 / 3.6，不 promotion，不 archive。

## Review 范围

- [Model controller](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/backend/src/main/java/org/openharness/backend/api/ModelController.java)
- [Model controller tests](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/backend/src/test/java/org/openharness/backend/api/ModelControllerTest.java)
- [Structured error handler](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/backend/src/main/java/org/openharness/backend/api/StructuredErrorHandler.java)
- [Backend pom](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/backend/pom.xml)
- [Zhipu timeout structured error review](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/docs/review/2026-07-09-gate-c-zhipu-timeout-structured-error-review.md)
- [Zhipu production matrix review](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/docs/review/2026-07-09-zhipu-openai-compatible-production-matrix-review.md)
- [OpenHarness active tasks](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/openspec/changes/harden-agent-runtime-single-node-production/tasks.md)

## 主要发现

### Critical - `/compress` provider timeout 裸异常已修复

复核反馈成立：修复前 [Model controller](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/backend/src/main/java/org/openharness/backend/api/ModelController.java) 的 `/compress` 路径直接调用 provider adapter，缺少 `/chat` 的 `ProviderUnavailableException` 与 timeout-like `RuntimeException` 分类保护。

本轮先新增 RED 测试 `compressReturnsStructuredProviderTimeoutWhenProviderConnectTimesOut`。RED 结果显示期望 `AppException`，实际为 `RuntimeException: OpenAI-compatible call failed: HTTP connect timed out`。

随后最小实现：

- 抽出 `providerUnavailableError` 与 `providerTimeoutError`，供 `/chat` 和 `/compress` 复用。
- `/compress` 捕获 `ProviderUnavailableException` 并抛结构化 `PROVIDER_UNAVAILABLE`。
- `/compress` 识别 timeout-like exception chain 并抛结构化 `PROVIDER_TIMEOUT`。
- `/compress` 若 provider 返回 `ModelChatResponse.error`，转为结构化 `AppException`，避免把 provider error 伪装成 `"Summary unavailable."`。

### Pass - Gate C 边界未推进

本轮仅修复已证实的 provider timeout 分类缺口。Zhipu matrix 仍因为 retry、terminal_error、cancellation、reasoning blocked 而整体 `blocked`；Anthropic 仍无 key。Gate C 不得关闭。

## 验证记录

- TDD RED：`compressReturnsStructuredProviderTimeoutWhenProviderConnectTimesOut` 先失败，失败原因为 `/compress` 裸 `RuntimeException`。
- TDD GREEN：同一 focused test pass，1 test / 0 failures。
- Backend focused tests：`ModelControllerTest,OpenAiFakeProviderMatrixTest,QualificationReportPromoterTest` pass，10 tests / 0 failures。
- Backend full tests：完整 backend test suite pass，47 tests / 0 failures。
- OpenSpec strict validation：`harden-agent-runtime-single-node-production` valid；PostHog flush 因沙箱 DNS 失败，不影响 OpenSpec validate 结果。

## 最终建议

1. 保留本修复作为 Task 3.5 的 evidence-backed contract gap fix。
2. 不更新 [OpenHarness active tasks](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/openspec/changes/harden-agent-runtime-single-node-production/tasks.md) 勾选状态，直到所有 required provider rows 和 Gate C strict review 完成。
3. 下一步仍优先补正式 real-provider matrix harness，覆盖 retry、terminal_error、cancellation；Anthropic key 缺失期间 Gate C 保持 blocked。

## 后续门禁

- OpenSpec proposal：不需要新 proposal；本轮属于 approved active change 的 Task 3.5 evidence-backed fix。
- Superpowers / TDD：已执行 RED/GREEN。
- 测试门禁：backend focused/full test 已通过；后续若继续改 provider harness，仍需重新跑 affected focused tests、backend full tests、OpenSpec strict validation、report schema/secret scan。
- 人工审批：Gate C 仍需后续人工 review；本轮不得 promotion。
- 是否修改项目规则：否。
- 是否仍需 OpenSpec / 后续实施计划：active change 仍 open；不新增计划。
