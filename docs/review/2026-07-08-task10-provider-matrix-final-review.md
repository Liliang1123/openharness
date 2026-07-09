# Task 10 Provider Matrix Final Review

## 结论

通过（本地 Task 10 阻塞已关闭，状态可维持 `local_verified`）。

本轮只确认 fake Provider matrix 与 qualification evidence promotion 在本地轨道可接受；不关闭 Gate B，不打开 Gate C，不授权真实 Provider credential 或生产 cutover。

## Review 范围

- [第三轮 Review](file:///Users/elvis/file/develop/opensource/openharness/docs/review/2026-07-06-task10-provider-matrix-third-review.md)
- [QualificationReportPromoter.java](file:///Users/elvis/file/develop/opensource/openharness/backend/src/main/java/org/openharness/backend/qualification/QualificationReportPromoter.java)
- [OutboundRequestTracker.java](file:///Users/elvis/file/develop/opensource/openharness/backend/src/main/java/org/openharness/backend/qualification/OutboundRequestTracker.java)
- [OpenAiFakeProviderMatrix.java](file:///Users/elvis/file/develop/opensource/openharness/backend/src/main/java/org/openharness/backend/qualification/OpenAiFakeProviderMatrix.java)
- [AnthropicFakeProviderMatrix.java](file:///Users/elvis/file/develop/opensource/openharness/backend/src/main/java/org/openharness/backend/qualification/AnthropicFakeProviderMatrix.java)
- [QualificationReportPromoterTest.java](file:///Users/elvis/file/develop/opensource/openharness/backend/src/test/java/org/openharness/backend/qualification/QualificationReportPromoterTest.java)
- [OutboundRequestTrackerTest.java](file:///Users/elvis/file/develop/opensource/openharness/backend/src/test/java/org/openharness/backend/qualification/OutboundRequestTrackerTest.java)
- [Task 10 证据](file:///Users/elvis/file/develop/opensource/openharness/docs/verification/agent-runtime-v1/task10-fake-provider-matrix.md)
- [OpenAI local report](file:///Users/elvis/file/develop/opensource/openharness/docs/verification/agent-runtime-v1/providers/2026-07-06-openai-compatible-local.json)
- [Anthropic local report](file:///Users/elvis/file/develop/opensource/openharness/docs/verification/agent-runtime-v1/providers/2026-07-06-anthropic-local.json)

## 主要发现

### 阻塞 1：Promoter retry 覆盖不足 — 已修复

- `generateReportsWithLoopbackServer` 在同一 loopback server 中运行 OpenAI 与 Anthropic 两份 matrix，并用 provider/case key 分离 retry counter。
- 测试 `loopbackPromotionExercisesRetryOncePerProviderInSameProcess` 断言 `openai:matrix-retry=2` 和 `anthropic:matrix-retry=2`，避免共享 counter 导致 Anthropic 未经历 503 的 false PASS。

### 阻塞 2：`--overwrite` 缺少审计 — 已修复

- Promoter 默认拒绝覆盖已有报告。
- 覆盖必须显式提供 expected old SHA-256 与 reason；old hash mismatch 时拒绝且保留旧文件。
- 覆盖路径写入临时文件、校验、计算 new SHA-256、atomic move，并追加包含 file/oldSha256/newSha256/reason 的 audit JSONL。

### 阻塞 3：Outbound tracker 为全局 side channel — 已修复

- `OutboundRequestTracker` 改为 `InheritableThreadLocal` capture scope；capture 外的普通请求不保留 hash。
- capture 内同一 requestId 不允许写入不同 hash，矩阵行通过 `consumeRequestHash` 移除 hash，矩阵结束要求无残留。
- 测试覆盖生产调用无残留、consume 后清空、requestId collision fail-closed。

### 阻塞 4：Promoter 写入前未验证共享契约 — 已修复

- Promoter 在写入前、临时文件写入后均执行 Java contract validation。
- 校验覆盖 track、report result、row result、local/production 组合、required-row veto、strict keys、SHA-256 requestHash、usage/cost shape。
- 测试证明 invalid report 在替换现有 evidence 前被拒绝，旧文件不变且不产生 audit。

## 验证记录

- `mvn -f backend/pom.xml -Dtest=QualificationReportPromoterTest,OutboundRequestTrackerTest test`：RED 首次失败，缺失新契约 API。
- `mvn -f backend/pom.xml -Dtest=OpenAiFakeProviderMatrixTest,AnthropicFakeProviderMatrixTest,QualificationReportPromoterTest,OutboundRequestTrackerTest test`：通过，12 tests。
- `mvn -f backend/pom.xml test`：通过，42 tests。
- `/opt/homebrew/bin/pnpm --filter @openharness/shared-schema test`：通过，47 tests。
- `/opt/homebrew/bin/pnpm --filter @openharness/agent-runtime test`：通过，58 files / 292 tests。
- `/opt/homebrew/bin/pnpm --filter @openharness/frontend test`：通过，6 files / 24 tests。
- `/opt/homebrew/bin/pnpm --filter @openharness/integration-tests test`：通过，5 files / 17 tests。
- `/opt/homebrew/bin/pnpm --filter @openharness/shared-schema typecheck`：通过。
- `/opt/homebrew/bin/pnpm --filter @openharness/agent-runtime typecheck`：通过。
- `/opt/homebrew/bin/pnpm --filter @openharness/frontend typecheck`：通过。
- `openspec validate harden-agent-runtime-single-node-production --strict --no-interactive`：通过；PostHog DNS flush warning 不影响 validation 结论。
- `/opt/homebrew/bin/pnpm dashboard:check`：通过。
- `git diff --check`：通过。
- `mvn -f backend/pom.xml compile exec:java -Dexec.mainClass=org.openharness.backend.qualification.QualificationReportPromoter`：按预期 exit 2，拒绝覆盖已有 immutable reports。
- `shasum -a 256 ...providers/*.json`：OpenAI `7cfc2b94e1e28caf510ac1acc841e9343b35e25d1fc9aab81415d253c8cecbcf`；Anthropic `ea1c7c1b693259e5f8ac76b82ce285a4e2329b454b2472277f76bc615d983916`，验证前后保持不变。

## 最终建议

1. 接受 Task 10 本地 fake Provider matrix 为 `local_verified`。
2. 后续 Task 11 可继续做真实本地 Java sandbox / MCP qualification preflight。
3. 保持 Gate B 为 `pending_production_evidence`，Gate C 保持关闭；真实凭据与生产 cutover 仍需独立人工授权。

## 后续门禁

- OpenSpec：active change [harden-agent-runtime-single-node-production](file:///Users/elvis/file/develop/opensource/openharness/openspec/changes/harden-agent-runtime-single-node-production/) 继续开启，不归档。
- Superpowers：继续遵循现行实施计划 [2026-07-03-agent-runtime-single-node-production-final-plan.md](file:///Users/elvis/file/develop/opensource/openharness/docs/superpowers/plans/2026-07-03-agent-runtime-single-node-production-final-plan.md)。
- 生产门禁：Gate B/C/D 均不能由本地 `local_verified` 证据关闭。
