# `/compress` Timeout TDD Follow-Up 代码审查

## 结论

**通过**：复核指出的 `/compress` provider timeout 裸 500 风险已通过 TDD 正确修复。`/compress` 现在与 `/chat` 共享同一套 `isProviderTimeout` / `providerTimeoutError` / `providerUnavailableError` 分类逻辑，provider timeout 抛结构化 `PROVIDER_TIMEOUT`（504），`ProviderUnavailableException` 抛结构化 `PROVIDER_UNAVAILABLE`（503），provider 返回 `ModelChatResponse.error` 时不会被静默吞为 `"Summary unavailable."`。存在 2 项非阻塞 observation，不影响通过结论。

## Review 范围

| 文件 | 角色 |
|---|---|
| [ModelController.java](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/stage0-runtime-production-closeout/backend/src/main/java/org/openharness/backend/api/ModelController.java) | 被修改——`/compress` 增加 try-catch、`response.error()` 检查、提取共享方法 |
| [ModelControllerTest.java](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/stage0-runtime-production-closeout/backend/src/test/java/org/openharness/backend/api/ModelControllerTest.java) | 被修改——新增 2 个 timeout 测试（chat + compress） |
| [StructuredErrorHandler.java](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/stage0-runtime-production-closeout/backend/src/main/java/org/openharness/backend/api/StructuredErrorHandler.java) | 未修改——确认 `AppException` → `ErrorResponse` 映射链完整 |
| [Contracts.java](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/stage0-runtime-production-closeout/backend/src/main/java/org/openharness/backend/model/Contracts.java) | 未修改——确认 `StructuredError` / `ModelChatResponse` record 定义 |
| [gate-c-compress-timeout-followup-review.md](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/stage0-runtime-production-closeout/docs/review/2026-07-09-gate-c-compress-timeout-followup-review.md) | 被修改——用户自撰 follow-up review |
| [gate-c-zhipu-timeout-structured-error-review.md](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/stage0-runtime-production-closeout/docs/review/2026-07-09-gate-c-zhipu-timeout-structured-error-review.md) | 前序 review——原始指出 `/compress` 缺保护的文档 |

## 主要发现

### ✅ 核心修复——`/compress` timeout 保护正确

[ModelController.java L139-148](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/stage0-runtime-production-closeout/backend/src/main/java/org/openharness/backend/api/ModelController.java#L139-L148)：

```java
try {
  response = resolved.adapter().chat(chatRequest, resolved.config());
} catch (ProviderUnavailableException e) {
  throw appException(providerUnavailableError(e));
} catch (RuntimeException e) {
  if (isProviderTimeout(e)) {
    throw appException(providerTimeoutError());
  }
  throw e;
}
```

**评估**：

1. catch 顺序正确：`ProviderUnavailableException` 优先（它是 checked exception / 具体异常），`RuntimeException` 兜底
2. timeout 识别复用 `isProviderTimeout()`，逻辑与 `/chat` 路径完全一致
3. 非 timeout 的 `RuntimeException` 继续 re-throw，不吞未知异常——正确
4. `/compress` 使用 `throw appException(...)` 而非 `/chat` 的 `return providerErrorResponse(...)`——语义正确：`/compress` 返回 `CompressResponse`（非 `ModelChatResponse`），无法内嵌 `StructuredError`，需通过 `AppException` → `StructuredErrorHandler` → `ErrorResponse` JSON 返回

### ✅ `response.error()` 防伪摘要——正确

[ModelController.java L149-151](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/stage0-runtime-production-closeout/backend/src/main/java/org/openharness/backend/api/ModelController.java#L149-L151)：

```java
if (response.error() != null) {
  throw appException(response.error());
}
```

**修复前行为**：如果 provider adapter 返回了一个带 `error` 字段的 `ModelChatResponse`（例如 rate limit、model not found），`/compress` 会跳过 error 检查，`message` 为 null 时静默返回 `"Summary unavailable."`——把 provider error 伪装成正常摘要。

**修复后行为**：`response.error() != null` 时，直接转为结构化 `AppException`，HTTP status 从 `error.httpStatus()` 取值，保留原始 `errorClass` / `errorMessage`。正确。

### ✅ 共享方法提取——DRY 无语义偏移

| 方法 | 位置 | 调用者 |
|---|---|---|
| `providerUnavailableError()` | [L195-197](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/stage0-runtime-production-closeout/backend/src/main/java/org/openharness/backend/api/ModelController.java#L195-L197) | `/chat` + `/compress` |
| `providerTimeoutError()` | [L199-201](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/stage0-runtime-production-closeout/backend/src/main/java/org/openharness/backend/api/ModelController.java#L199-L201) | `/chat` + `/compress` |
| `providerErrorResponse()` | [L185-193](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/stage0-runtime-production-closeout/backend/src/main/java/org/openharness/backend/api/ModelController.java#L185-L193) | 仅 `/chat`（返回 `ModelChatResponse`） |
| `appException()` | [L203-206](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/stage0-runtime-production-closeout/backend/src/main/java/org/openharness/backend/api/ModelController.java#L203-L206) | 仅 `/compress`（需要 throw） |
| `isProviderTimeout()` | [L208-224](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/stage0-runtime-production-closeout/backend/src/main/java/org/openharness/backend/api/ModelController.java#L208-L224) | `/chat` + `/compress` |

**评估**：提取合理，重构不改变 `/chat` 的外在行为——原来的 inline `new StructuredError(...)` 与提取后 `providerUnavailableError(e)` 参数完全一致（diff 可验证）。`/chat` 原来没有 timeout catch，新增的逻辑也是对称的。

### ✅ TDD 测试——覆盖充分但有扩展空间

**新增测试 1**：[chatReturnsStructuredProviderTimeoutWhenProviderConnectTimesOut](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/stage0-runtime-production-closeout/backend/src/test/java/org/openharness/backend/api/ModelControllerTest.java#L72-L117)

- 验证 `/chat` timeout → `ModelChatResponse` 带 `PROVIDER_TIMEOUT` error
- 断言覆盖 `errorClass`、`httpStatus`、`retriable`、`retryOwner`、`maxRetries`、`fallbackAllowed` 全部 6 个业务字段
- 同时断言 `message() == null`、`rawProvider()` 保留、`usage.totalTokens() == 0`

**新增测试 2**：[compressReturnsStructuredProviderTimeoutWhenProviderConnectTimesOut](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/stage0-runtime-production-closeout/backend/src/test/java/org/openharness/backend/api/ModelControllerTest.java#L119-L157)

- 验证 `/compress` timeout → `AppException`（而非裸 `RuntimeException`）
- 断言 `exception.status() == GATEWAY_TIMEOUT`
- 断言 `error` 字段同上 6 项

**评估**：核心路径覆盖正确。`adapterTimingOut()` 模拟 `RuntimeException("...HTTP connect timed out", ConnectException(...))` 与真实 `OpenAiCompatibleAdapter` 抛出路径匹配。

### ⚠️ 非阻塞 Observation 1——`/compress` 缺少 `ProviderUnavailableException` 和 `response.error()` 的专用测试

当前测试只覆盖了 timeout 路径。以下两条路径有代码实现但无测试覆盖：

1. **`ProviderUnavailableException` → `PROVIDER_UNAVAILABLE`**（[L141-142](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/stage0-runtime-production-closeout/backend/src/main/java/org/openharness/backend/api/ModelController.java#L141-L142)）
2. **`response.error() != null` → `AppException`**（[L149-151](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/stage0-runtime-production-closeout/backend/src/main/java/org/openharness/backend/api/ModelController.java#L149-L151)）

**严重度**：低。代码逻辑简单且与 `/chat` 对称，本轮 TDD 的核心目标是修复 timeout 裸抛，已达成。后续若有 provider matrix 扩展可顺带补充。

### ⚠️ 非阻塞 Observation 2——`appException()` 的 `httpStatus` 为 null 时 fallback 500

[ModelController.java L204](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/stage0-runtime-production-closeout/backend/src/main/java/org/openharness/backend/api/ModelController.java#L204)：

```java
int status = error.httpStatus() != null ? error.httpStatus() : 500;
```

当 `response.error()` 的 `httpStatus` 为 null 时（理论上 adapter 不应产生这种 error，但契约上 `Integer httpStatus` 是 nullable），会 fallback 到 500。行为合理，但没有测试覆盖。非阻塞。

### ✅ 边界合规

| 检查项 | 状态 |
|---|---|
| tasks.md 未勾选 3.1/3.2/3.5/3.6 | ✅ |
| Gate C 未关闭 | ✅ |
| 未 promotion / archive | ✅ |
| 未 commit | ✅ |
| 项目规则未修改 | ✅ |
| active change 仍 open | ✅ |

### ✅ 用户自撰 follow-up review 文档——准确

[gate-c-compress-timeout-followup-review.md](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/stage0-runtime-production-closeout/docs/review/2026-07-09-gate-c-compress-timeout-followup-review.md) 中的描述与实际 diff 一致，验证记录（RED→GREEN→focused→full→OpenSpec→whitespace）与声称匹配，结论和边界声明准确。

## 最终建议

1. **本轮 TDD follow-up 通过**。`/compress` timeout 裸 500 风险已消除，实现与 `/chat` 对齐，TDD RED/GREEN 流程完整。
2. **后续（非阻塞）**：建议补充 `/compress` 的 `ProviderUnavailableException` 和 `response.error()` 两条路径的测试用例，可纳入后续 provider matrix 扩展批次。
3. **Gate C 仍 blocked**，不变。

## 后续门禁

- **OpenSpec proposal**：不需要新 proposal，本轮在 approved active change scope 内。
- **Superpowers plan**：不新增。
- **测试门禁**：backend focused/full test 已通过（47/0）。后续若继续改 provider 相关逻辑，需重跑 affected tests。
- **人工审批**：Gate C 仍需后续人工 review；本轮不得 promotion。
- **是否修改项目规则**：否。
- **是否仍需 OpenSpec / 后续实施计划**：active change 仍 open；不新增计划。
