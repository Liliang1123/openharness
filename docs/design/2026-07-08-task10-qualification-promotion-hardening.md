# Task 10 Qualification Promotion Hardening

- 文档类型：设计记录 / Bug 分析 / 实施收尾
- 日志及版本：2026-07-08 v1，记录 Task 10 fake Provider matrix 第三轮 Review 后的本地证据晋升硬化设计。

## 背景

Task 10 的目标是把 OpenAI-compatible 与 Anthropic fake Provider matrix 在 `local_verified` 轨道跑通。第三轮 Review 发现本地报告生成链路仍存在四类阻塞风险：Promoter 未实际覆盖 Anthropic retry、覆盖写入缺少审计、Outbound request hash tracker 为 production-global side channel、Promoter 写入前未做报告契约验证。

## 设计结论

1. Promoter 使用同一 loopback server 在同一进程内生成两份报告，并用 provider/case 分离的 retry hit counter 断言 `openai:matrix-retry=2` 与 `anthropic:matrix-retry=2`。
2. evidence promotion 改为显式契约：已有文件默认不可覆盖；覆盖必须提供 `--overwrite`、对应文件的 expected old SHA-256 与非空 reason。
3. 覆盖路径写入临时文件，先校验报告契约并计算 new SHA-256，再 atomic move 到目标路径；覆盖后追加 `qualification-report-promotion-audit.jsonl` 审计记录。
4. Outbound request hash capture 只在 qualification capture scope 中启用；普通生产调用不保留 hash。矩阵行通过 consume 语义取走 hash，结束时要求无残留。
5. Java 端 Promoter 内置与共享 Zod 契约对齐的 fail-closed 校验：track、result、row/result 分离、required-row veto、SHA-256 requestHash、usage/cost shape、strict keys。

## 关键文件

- [QualificationReportPromoter.java](file:///Users/elvis/file/develop/opensource/openharness/backend/src/main/java/org/openharness/backend/qualification/QualificationReportPromoter.java)
- [OutboundRequestTracker.java](file:///Users/elvis/file/develop/opensource/openharness/backend/src/main/java/org/openharness/backend/qualification/OutboundRequestTracker.java)
- [OpenAiFakeProviderMatrix.java](file:///Users/elvis/file/develop/opensource/openharness/backend/src/main/java/org/openharness/backend/qualification/OpenAiFakeProviderMatrix.java)
- [AnthropicFakeProviderMatrix.java](file:///Users/elvis/file/develop/opensource/openharness/backend/src/main/java/org/openharness/backend/qualification/AnthropicFakeProviderMatrix.java)
- [QualificationReportPromoterTest.java](file:///Users/elvis/file/develop/opensource/openharness/backend/src/test/java/org/openharness/backend/qualification/QualificationReportPromoterTest.java)
- [OutboundRequestTrackerTest.java](file:///Users/elvis/file/develop/opensource/openharness/backend/src/test/java/org/openharness/backend/qualification/OutboundRequestTrackerTest.java)

## 验证摘要

- RED：新增 Promoter/Tracker tests 首次运行因缺少新契约 API 编译失败。
- GREEN：`mvn -f backend/pom.xml -Dtest=OpenAiFakeProviderMatrixTest,AnthropicFakeProviderMatrixTest,QualificationReportPromoterTest,OutboundRequestTrackerTest test` 通过 12 项测试。
- 全量后端：`mvn -f backend/pom.xml test` 通过 42 项测试。
- TS 分模块测试与 typecheck、OpenSpec strict validation、dashboard check、`git diff --check` 均通过。

## 剩余门禁

- Gate B 仍需生产级 backup/import/quarantine/restore/RPO/RTO 证据后才能关闭。
- Gate C 未授权真实 Provider 凭据；本地 `local_verified` 不得转写为 production qualification。
- 不得将本地短基线冒充 24h soak，不得归档 active OpenSpec change。
