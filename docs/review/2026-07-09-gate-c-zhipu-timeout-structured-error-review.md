# Gate C Zhipu/OpenAI-Compatible Timeout Structured Error 修复复核

## 结论

**通过**：timeout 从裸 500 变为结构化 `PROVIDER_TIMEOUT` 的修复在 controller 层实现正确，TDD 回归覆盖充分，production verification report 中 `openai-zhipu-timeout` row 为 `pass`，overall 仍为 `blocked`，符合预期。存在 1 项非阻塞风险（`/compress` 端点缺少同等保护），不影响本次 Gate C timeout 修复结论。

## Review 范围

| 文件 | 角色 |
|---|---|
| [ModelController.java](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/backend/src/main/java/org/openharness/backend/api/ModelController.java) | timeout catch + `isProviderTimeout` 检测逻辑 |
| [ModelControllerTest.java](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/backend/src/test/java/org/openharness/backend/api/ModelControllerTest.java) | TDD 回归测试 |
| [2026-07-09-zhipu-openai-compatible-production.json](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/docs/verification/agent-runtime-v1/providers/2026-07-09-zhipu-openai-compatible-production.json) | Production verification report |
| [2026-07-09-zhipu-openai-compatible-production-matrix-review.md](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/docs/review/2026-07-09-zhipu-openai-compatible-production-matrix-review.md) | 前序 matrix review |
| [tasks.md](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/openspec/changes/harden-agent-runtime-single-node-production/tasks.md) | OpenSpec active change 任务清单 |
| [Contracts.java](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/backend/src/main/java/org/openharness/backend/model/Contracts.java) | `StructuredError` record 定义 |
| [OpenAiCompatibleAdapter.java](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/backend/src/main/java/org/openharness/backend/service/provider/OpenAiCompatibleAdapter.java) | Adapter 层 timeout 抛出路径 |

## 主要发现

### ✅ 核心修复——正确

**修复前行为**：`OpenAiCompatibleAdapter` 在 `timeoutMs=1` 时抛出 `RuntimeException("OpenAI-compatible call failed: HTTP connect timed out", ConnectException)`，`ModelController.chat()` 无 catch，Spring 默认映射为 HTTP 500 裸响应，无 `StructuredError` 输出。

**修复后行为** ([ModelController.java L88-101](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/backend/src/main/java/org/openharness/backend/api/ModelController.java#L88-L101))：

1. `ProviderUnavailableException` → `PROVIDER_UNAVAILABLE` (503, retriable, retryOwner=`ts`, maxRetries=3)
2. `RuntimeException` 且 `isProviderTimeout(e)` 为 true → `PROVIDER_TIMEOUT` (504, retriable, retryOwner=`java`, maxRetries=1, fallbackAllowed=true)
3. 其他 `RuntimeException` → 继续抛出（保持裸 500 行为，不吞未知异常）

**`isProviderTimeout` 检测逻辑** ([ModelController.java L181-197](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/backend/src/main/java/org/openharness/backend/api/ModelController.java#L181-L197))：

- 遍历异常因果链 `getCause()`
- 匹配 `java.net.http.HttpTimeoutException` 类型（直接 `instanceof`）
- 匹配 message 中 `timed out` / `timeout deadline exceeded` / `connect timed out`（case-insensitive）
- 覆盖了 adapter 中全部 3 种 timeout 抛出路径

**评估**：逻辑正确、完整。异常链遍历避免了 `RuntimeException` wrapper 导致漏检。`Locale.ROOT` 用于大小写转换避免了 Turkish-I 问题。

### ✅ TDD 回归测试——充分

[chatReturnsStructuredProviderTimeoutWhenProviderConnectTimesOut](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/backend/src/test/java/org/openharness/backend/api/ModelControllerTest.java#L71-L116)：

- 构造 `RuntimeException` wrapping `ConnectException("HTTP connect timed out")` —— 模拟真实 adapter 抛出场景
- 断言 `response.message() == null`（无业务消息）
- 断言 `response.rawProvider() == "zhipu"`（保留 provider 归属）
- 断言 `response.usage().totalTokens() == 0`（零消耗）
- 断言 `response.error().errorClass() == "PROVIDER_TIMEOUT"`
- 断言 `response.error().httpStatus() == 504`
- 断言 `response.error().retriable() == true`
- 断言 `response.error().retryOwner() == "java"`
- 断言 `response.error().maxRetries() == 1`
- 断言 `response.error().fallbackAllowed() == true`

**评估**：assertion 覆盖了 `StructuredError` 全部 6 个业务字段。测试隔离性好——使用内联 `ProviderAdapter` stub + `MockHttpServletRequest`，不依赖 Spring context。

### ✅ Production Report——timeout row pass，overall blocked

[2026-07-09-zhipu-openai-compatible-production.json](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/docs/verification/agent-runtime-v1/providers/2026-07-09-zhipu-openai-compatible-production.json) 关键数据：

| 字段 | 值 | 预期 | 匹配 |
|---|---|---|---|
| `result` (top-level) | `blocked` | `blocked` | ✅ |
| `openai-zhipu-timeout.result` | `pass` | `pass` | ✅ |
| `openai-zhipu-timeout.observed.errorClass` | `PROVIDER_TIMEOUT` | `PROVIDER_TIMEOUT` | ✅ |
| `openai-zhipu-timeout.observed.structuredStatus` | `504` | `504` | ✅ |
| `openai-zhipu-timeout.observed.timeoutSeen` | `true` | `true` | ✅ |
| `openai-zhipu-timeout.oracle.boundedTimeoutMs` | `1` | ≤ test threshold | ✅ |
| `openai-zhipu-timeout.durationMs` | `6` | 合理 | ✅ |

Overall blocked 原因：`openai-zhipu-retry`、`openai-zhipu-terminal-error`、`openai-zhipu-cancellation`、`openai-zhipu-reasoning` 仍为 `blocked`。

### ✅ OpenSpec tasks.md——3.1/3.2 未勾选

[tasks.md](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/openspec/changes/harden-agent-runtime-single-node-production/tasks.md) 中 3.1、3.2、3.5、3.6 均为 `[ ]`，未被勾选。Gate C 未关闭。符合复核边界要求。

### ⚠️ 非阻塞风险——`/compress` 端点缺少 timeout 保护

[ModelController.java L136-137](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/backend/src/main/java/org/openharness/backend/api/ModelController.java#L136-L137) 的 `compress()` 方法直接调用 `resolved.adapter().chat(chatRequest, resolved.config())`，没有 `try/catch` 保护。如果 provider timeout，仍会以裸 500 返回。

**严重度**：低。`/compress` 不在当前 Gate C timeout matrix 的评审范围内，且当前 matrix review 未对该端点提出 required row。但建议后续补齐，保持 controller 层行为一致。

### ✅ `StructuredError` record 契约与 shared-schema 对齐

[Contracts.java](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/backend/src/main/java/org/openharness/backend/model/Contracts.java) 中 `StructuredError` 包含 `errorClass`、`errorMessage`、`retriable`、`retryOwner`、`maxRetries`、`fallbackAllowed`、`httpStatus`、`recoveryHint`。前序 review 已确认 shared-schema Zod parse 通过（49 tests / 0 failures）。

### ✅ 禁止事项检查

| 禁止事项 | 实际状态 |
|---|---|
| 不勾选 3.1 / 3.2 | ✅ 未勾选 |
| 不关闭 Gate C | ✅ overall = blocked |
| 不 promotion | ✅ 无 promotion 操作 |
| 不 archive/freeze | ✅ active change 仍 open |
| 不用 Zhipu 替代 Anthropic | ✅ report 中无 Anthropic 列，Anthropic 仍缺 key |

## 最终建议

1. **本轮 timeout structured error 修复通过**。代码、测试、evidence 三方一致，可合并。
2. **后续（非本轮）**：建议为 `/compress` 端点补加与 `/chat` 同等的 `ProviderUnavailableException` + timeout catch 保护，保持 controller 层行为一致性。可纳入 Task 3.5 的 evidence-backed contract gap 修复。
3. **Gate C 仍 blocked**，需继续等待 retry / terminal error / cancellation / reasoning 真实 harness 以及 Anthropic credential。

## 后续门禁

- **OpenSpec proposal**：不需要新 proposal，本轮在已批准 active change scope 内。
- **Superpowers plan**：已有 [approved plan](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/add-openclacky-runtime-parity-roadmap/docs/superpowers/plans/2026-07-03-agent-runtime-single-node-production-final-plan.md)，不新增。
- **测试**：前序 review 记录 Maven 46 tests / 0 failures、shared-schema 49 tests / 0 failures，覆盖充分。
- **人工审批**：Gate C 仍需 Anthropic credential 和完整 matrix review 后才能 promotion。
- **是否修改项目规则**：否。
- **是否仍需 OpenSpec / 后续实施计划**：是。active change `harden-agent-runtime-single-node-production` 仍 open。
