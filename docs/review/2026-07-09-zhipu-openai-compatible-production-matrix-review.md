# Zhipu OpenAI-Compatible Production Matrix Review

## 结论

有风险：Zhipu / OpenAI-compatible 真实 Provider 调用已执行并落盘证据；在补充 timeout structured error 修复后，Zhipu matrix 已有 5 个 required row 通过，但本次 production matrix **整体结果仍为 `blocked`**，不能关闭 Gate C，也不能勾选 3.1 / 3.2。

本轮在用户明确授权后，使用 [worktree .env](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/.env) 中的 `ZHIPU_API_KEY` 启动 Java Backend，并对 `zhipu` / `glm-4-flash` 执行真实 OpenAI-compatible matrix。报告落盘为 [Zhipu OpenAI-compatible production report](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/docs/verification/agent-runtime-v1/providers/2026-07-09-zhipu-openai-compatible-production.json)。

通过项：sync、usage/cost、stream、structured tool call、timeout。

未通过 / 阻塞项：retry、terminal error、cancellation、reasoning 为 `blocked`。Anthropic 仍无 key，因此 Gate C overall 仍 blocked。

## Review 范围

- [Zhipu OpenAI-compatible production report](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/docs/verification/agent-runtime-v1/providers/2026-07-09-zhipu-openai-compatible-production.json)
- [OpenHarness Stage 0 approved plan](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/docs/superpowers/plans/2026-07-03-agent-runtime-single-node-production-final-plan.md)
- [OpenHarness active tasks](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/openspec/changes/harden-agent-runtime-single-node-production/tasks.md)
- [Provider adapter spec delta](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/openspec/changes/harden-agent-runtime-single-node-production/specs/provider-adapter/spec.md)
- [Agent Runtime v1 production runbook](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/docs/architecture/agent-runtime-v1-production-runbook.md)
- [OpenAI-compatible adapter](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/backend/src/main/java/org/openharness/backend/service/provider/OpenAiCompatibleAdapter.java)
- [Model controller](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/backend/src/main/java/org/openharness/backend/api/ModelController.java)
- [Model controller tests](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/backend/src/test/java/org/openharness/backend/api/ModelControllerTest.java)
- [Backend application config](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/backend/src/main/resources/application.yml)
- [Shared schema](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/packages/shared-schema/src/index.ts)
- [OpenAI fake matrix tests](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/backend/src/test/java/org/openharness/backend/qualification/OpenAiFakeProviderMatrixTest.java)
- [Qualification promoter tests](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/backend/src/test/java/org/openharness/backend/qualification/QualificationReportPromoterTest.java)

## 主要发现

### Pass — 真实 Zhipu key / endpoint 可用

Java Backend 使用 `zhipu` route 与 `glm-4-flash` 模型真实调用成功。报告记录 `track=production`，`rawProvider=zhipu`，且通过 schema shape 与 shared-schema Zod 解析。

| Row | Capability | Result | 观察结果 |
|---|---|---|---|
| `openai-zhipu-sync` | sync | `pass` | HTTP 200，provider `zhipu`，模型按 oracle 返回 `OH_SYNC_OK` |
| `openai-zhipu-usage-cost` | usage/cost | `pass` | HTTP 200，usage 为正数，`costUsdMicros` 存在 |
| `openai-zhipu-stream` | stream | `pass` | HTTP 200，stream merge 后返回 `OH_STREAM_OK` |
| `openai-zhipu-structured-tool` | tool calls | `pass` | HTTP 200，返回 `lookup` tool call，arguments 含 `id=1` |
| `openai-zhipu-timeout` | timeout | `pass` | HTTP 200 body 内返回 `errorClass=PROVIDER_TIMEOUT`，结构化 `httpStatus=504`，`timeoutSeen=true` |

### Pass — timeout 真实路径已结构化

初次 production matrix 中，`openai-zhipu-timeout` 通过 `timeoutMs=1` 触发后表现为裸 HTTP 500，且未形成可审计的 structured timeout terminal error。

本轮按 TDD 在 [Model controller tests](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/backend/src/test/java/org/openharness/backend/api/ModelControllerTest.java) 增加回归测试，随后在 [Model controller](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/backend/src/main/java/org/openharness/backend/api/ModelController.java) 的 provider 调用边界将 timeout-like provider failure 规范化为 `PROVIDER_TIMEOUT`。复跑真实 Zhipu matrix 后，该 row 为 `pass`。

### Critical — 多个 required rows 仍 blocked

以下 required rows 未被安全地真实执行，因此按规则记录为 `blocked`，没有跳过：

| Row | Capability | Result | Blocked reason |
|---|---|---|---|
| `openai-zhipu-retry` | retry | `blocked` | 当前 harness 没有安全真实 Provider 503 注入路径；fake-provider retry 仍只能算 local evidence |
| `openai-zhipu-terminal-error` | terminal error | `blocked` | 本轮未安全变更 credential/model route 来制造真实 invalid request/auth terminal error |
| `openai-zhipu-cancellation` | cancellation | `blocked` | 当前 public backend chat API 没有 in-flight model request cancel endpoint；adapter-level cancel 需要 in-process real matrix harness |
| `openai-zhipu-reasoning` | reasoning | `blocked` | `glm-4-flash` 本轮未作为 reasoning-capable required model 通过验收 |

### Critical — Gate C 仍 blocked

[Provider adapter spec delta](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/openspec/changes/harden-agent-runtime-single-node-production/specs/provider-adapter/spec.md) 要求 OpenAI-compatible 与 Anthropic 两个 provider family 都完成真实矩阵。当前用户已说明 Anthropic 暂无 key，因此 Anthropic real-provider matrix 必须继续记为 `BLOCKED`。

即使 Zhipu 部分已有 5 个 row 通过，本次 report result 仍为 `blocked`，不得关闭 Gate C。

## 验证记录

- 初次启动 Java Backend：临时端口 `18083`，读取 [worktree .env](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/.env)。
- 修复后启动 Java Backend：临时端口 `18084`，读取 [worktree .env](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/.env)。
- 执行真实 Zhipu/OpenAI-compatible matrix：生成 [Zhipu OpenAI-compatible production report](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/docs/verification/agent-runtime-v1/providers/2026-07-09-zhipu-openai-compatible-production.json)。
- Report SHA-256：`7abe6a2e03f7e290581b94d88e804d97f3e7fc480a3c131da1607e2a94ad8660`。
- Schema shape check：pass，9 rows，result `blocked`。
- Shared schema Zod parse：pass，9 rows，result `blocked`，timeout row `pass`。
- Secret scan：pass，未发现 `ZHIPU_API_KEY` 原文出现在 report。
- TDD RED：Maven 以 [backend pom](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/backend/pom.xml) 为项目文件运行 `ModelControllerTest#chatReturnsStructuredProviderTimeoutWhenProviderConnectTimesOut`，失败原因为 controller 直接抛出 `OpenAI-compatible call failed: HTTP connect timed out`。
- TDD GREEN：同一 focused test pass，1 test / 0 failures。
- Backend focused tests：Maven 以 [backend pom](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/backend/pom.xml) 为项目文件运行 `ModelControllerTest,OpenAiFakeProviderMatrixTest,QualificationReportPromoterTest`，pass，9 tests / 0 failures。
- Backend full tests：Maven 以 [backend pom](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/backend/pom.xml) 为项目文件运行完整 backend test suite，pass，46 tests / 0 failures。
- OpenSpec strict validation：`harden-agent-runtime-single-node-production` valid；PostHog flush 因沙箱 DNS 失败，不影响 OpenSpec validate 结果。
- Shared schema tests：`pnpm --filter @openharness/shared-schema test -- schema` pass，49 tests / 0 failures。
- Diff whitespace check：pass。
- 临时 Java Backend 已 graceful shutdown；端口 `18084` 无监听。

## 最终建议

1. 保留 [Zhipu OpenAI-compatible production report](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/docs/verification/agent-runtime-v1/providers/2026-07-09-zhipu-openai-compatible-production.json) 作为 Gate C 支持证据，但结论必须是 `blocked`，不能 promotion。
2. 后续若继续推进 Zhipu/OpenAI-compatible：优先补正式 real-provider matrix harness，而不是用临时脚本长期替代。该 harness 应能安全制造/观察 retry、terminal error、cancellation，并保留 timeout structured error 回归。
3. Anthropic 没有 key 时继续保持 Gate C blocked；不能用 Zhipu 替代 Anthropic required family。
4. 不修改 [OpenHarness active tasks](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/openspec/changes/harden-agent-runtime-single-node-production/tasks.md) 的 3.1 / 3.2 / 3.5 / 3.6 状态。

## 后续门禁

- OpenSpec proposal：不需要新 proposal；本轮在已批准 active change 的 Gate C evidence 阶段执行。
- Superpowers plan：已有 [OpenHarness Stage 0 approved plan](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/docs/superpowers/plans/2026-07-03-agent-runtime-single-node-production-final-plan.md)，本轮不新增计划。
- TDD / implementation：本轮按 TDD 修改 [Model controller](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/backend/src/main/java/org/openharness/backend/api/ModelController.java) 并新增 [Model controller tests](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/backend/src/test/java/org/openharness/backend/api/ModelControllerTest.java) 回归覆盖。
- 人工审批：Gate C 仍需 Anthropic credential 或 explicit blocked acceptance，以及完整 OpenAI-compatible/Anthropic matrix review 后才能 promotion。
- 是否修改项目规则：否。
- 是否仍需 OpenSpec / 后续实施计划：是。当前 active change 仍 open；后续若实现正式 real-provider matrix CLI 或修复 timeout/cancel/retry 真实 harness，仍在当前 approved Task 10 scope 内，但必须按 TDD/verification 门禁执行。
