# 2026-07-10 实施复核：Batch 04 闭环修正

## 结论

**PASS**：完成 cancellation 本地并发复测闭环修正，所有 step_critical 命令已通过；`OpenAiFakeProviderMatrix` 相关批次测试回归不再阻塞。仍需明确的真实生产 evidence 才可推进 Gate C promotion。

## Review 范围

- 主要修改文件：
  - [OpenAiFakeProviderMatrixTest](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/stage0-runtime-production-closeout/backend/src/test/java/org/openharness/backend/qualification/OpenAiFakeProviderMatrixTest.java)
  - [OpenAiCompatibleFormalMatrix](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/stage0-runtime-production-closeout/backend/src/main/java/org/openharness/backend/qualification/OpenAiCompatibleFormalMatrix.java)
- 关键验证命令：
  - [mvn -f backend/pom.xml -Dtest=OpenAiFakeProviderMatrixTest,QualificationReportPromoterTest,ModelControllerTest test](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/stage0-runtime-production-closeout/backend/target/surefire-reports/org.openharness.backend.qualification.OpenAiFakeProviderMatrixTest.txt)
  - [pnpm --filter @openharness/shared-schema test -- schema](file:///Users/elvis/file/develop/opensource/openharness/packages/shared-schema)
  - openspec validate（harden/defer）

## 主要发现

1. **Severity: 高**
   先前 `formalProductionHarnessPassesCancellationRowWhenBackendProvidesPublicCancelEndpoint` 未通过的根因已确认：该测试中的 `HttpServer` 默认使用单线程执行器，`/api/v1/model/chat` 阻塞期间未并发处理 `/api/v1/model/cancel`，导致即使返回 `cancelRequestSent=true` 也拿不到 `PROVIDER_CANCELLED` 结构化错误。

2. **风险点修复验证通过**
   为该测试服务端设置 `backendServer.setExecutor(Executors.newCachedThreadPool())` 后，取消 probe 可被并发处理，`/api/v1/model/cancel` 与 `/api/v1/model/chat` 形成真实顺序可观测链路。`OpenAiFakeProviderMatrixTest` 该场景恢复通过。

3. **边界一致性**
   - 未修改 `tasks` 复选项或 `Gate C`。
   - 本轮没有读取 `.env`、没有 commit、没有 archive/freeze。
   - 仍保持 `OpenAI-compatible` 为 required 路径，`retry / cancellation / reasoning` 关键合同结论不变：无真实生产闭环仍不满足 required-blocked。

## 最终建议

建议保持当前实现不扩大影响范围：先将该闭环结果用于 `Governor review`，由主控方根据本地可证据和 batch03 production JSON 做最终判定是否继续推进下一 minimal batch。

## 后续门禁

- 本地实现门禁：✅ step_critical 全部通过。
- 产品门禁：❌ Gate C 仍不能 close，因 `retry / cancellation / reasoning` 在 production required 轨迹仍 blocked（真实证据不足）。
- 变更管理门禁：当前轮次不涉及 OpenSpec proposal/amendment 变更，若要降级任何行需走 OpenSpec amendment。
