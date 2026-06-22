# OpenHarness Error Taxonomy

> 状态：v1 草稿  
> 目的：定义跨 TS/Java 边界的结构化错误、retry owner、fallback 规则。

## 1. Error Shape

```ts
interface StructuredError {
  errorClass: string;
  errorMessage: string;
  retriable: boolean;
  retryOwner: "java" | "ts" | "none";
  maxRetries?: number;
  fallbackAllowed?: boolean;
  httpStatus?: number;
}
```

禁止跨边界只返回裸 HTTP status 或自由文本。

## 2. Error Classes

| errorClass | 来源 | HTTP | retriable | retryOwner | 上限 | fallback | 说明 |
|---|---|---:|---|---|---:|---|---|
| `PROVIDER_RATE_LIMIT` | Java model | 429 | true | java | 3 | true | provider 限流 |
| `PROVIDER_OVERLOAD_503` | Java model | 503 | true | java | 3 | true | provider overload |
| `PROVIDER_TIMEOUT` | Java model | 504 | true | java | 1 | true | provider timeout |
| `PROVIDER_NETWORK` | Java model | 502 | true | java | 2 | true | 网络错误 |
| `PROVIDER_INVALID_REQUEST` | Java model | 400 | false | ts | 0 | false | payload/history 错，TS 可修复后重试 |
| `PROVIDER_AUTH` | Java model | 401 | false | none | 0 | false | provider key 错误 |
| `PROVIDER_UNSUPPORTED_FEATURE` | Java model | 400 | false | ts | 0 | false | provider 不支持 tool/cache/vision |
| `MODEL_TOOL_PARSE_ERROR` | TS parser | 400 | false | ts | 0 | false | 模型返回 tool arguments 非法 JSON 或缺 required 参数 |
| `CONTEXT_OVERFLOW` | Java/TS model | 400 | true | ts | 1 | true | provider context_length_exceeded，触发 compression 后重试 |
| `STREAM_DROPPED` | TS/frontend stream | 499 | true | ts | 1 | false | SSE 断线、客户端关闭、runtime stream 中断 |
| `MESSAGE_HISTORY_INVALID_SEQUENCE` | TS history | 500 | false | none | 0 | false | assistant tool_calls 后缺 tool_result 等非法 history 顺序 |
| `TOOL_TIMEOUT` | Java tool | 504 | false | ts | 0 | false | 默认不重试，返回 tool_result timeout |
| `TOOL_USER_ERROR` | Java tool | 400 | false | none | 0 | false | 参数/业务用户错误 |
| `TOOL_INTERNAL_ERROR` | Java tool | 500 | true | ts | 1 | false | 工具内部错误 |
| `TOOL_PERMISSION_DENY` | Java tool | 403 | false | none | 0 | false | 工具权限拒绝 |
| `POLICY_DENY` | Java policy | 403 | false | none | 0 | false | policy 拒绝，TS 返回 rejected |
| `POLICY_REQUIRES_APPROVAL` | Java policy | 200 | false | none | 0 | false | 转 ask_user |
| `POLICY_EVALUATION_ERROR` | Java policy | 500 | true | ts | 1 | false | policy 服务异常 |
| `CATALOG_OUTDATED` | Java catalog/tool | 409 | false | ts | 0 | false | TS 需刷新 catalog 或开新 session |
| `CATALOG_TOOL_NOT_FOUND` | Java catalog/tool | 404 | false | ts | 0 | false | 工具不存在 |
| `AUTH_MISSING_HEADER` | Java auth | 401 | false | none | 0 | false | 缺 identity/trace header |
| `AUTH_SERVICE_TOKEN_INVALID` | Java auth | 401 | false | none | 0 | false | service token 错误 |
| `AUTH_TENANT_FORBIDDEN` | Java auth | 403 | false | none | 0 | false | tenant 权限拒绝 |
| `IDEMPOTENCY_CONFLICT` | Java tool/model | 409 | false | ts | 0 | false | 同 key 不同 payload |

## 3. Retry Ownership

| Owner | 含义 |
|---|---|
| `java` | Java 在返回 TS 前内部 retry；TS 只看到最终结果 |
| `ts` | TS 根据 Agent state/history 决定是否重试 |
| `none` | 不重试，直接失败或转 tool_result |

## 4. Tool Result Mapping

| errorClass | TS 对模型回填 |
|---|---|
| `TOOL_TIMEOUT` | `tool_result(status="timeout")` |
| `TOOL_USER_ERROR` | `tool_result(status="error", errorMessage)` |
| `TOOL_INTERNAL_ERROR` | retry 1 次后仍失败则 `tool_result(status="error")` |
| `POLICY_DENY` | `tool_result(status="rejected")` |
| `POLICY_REQUIRES_APPROVAL` | 不回填 tool_result，进入 `ask_user` pending |
| `CATALOG_OUTDATED` | 停止本轮，提示刷新 catalog/新会话 |
| `MODEL_TOOL_PARSE_ERROR` | `tool_result(status="error", errorMessage)` 回填给模型，让模型修正参数 |
| `CONTEXT_OVERFLOW` | 停止当前 provider call，触发 Insert-then-Compress 后重试一次 |
| `STREAM_DROPPED` | SSE 关闭；TS 继续完成已提交工具或按幂等键恢复 |
| `MESSAGE_HISTORY_INVALID_SEQUENCE` | 停止本轮，写 trace/audit，禁止继续调用模型 |

## 5. Acceptance Tests

1. provider 503 -> Java retries 3 times -> structured error/fallback.
2. provider invalid request -> no Java retry -> TS receives `PROVIDER_INVALID_REQUEST`.
3. tool timeout -> no Java retry -> TS emits timeout tool_result.
4. policy deny -> no tool execute -> TS emits rejected tool_result.
5. catalog mismatch -> 409 `CATALOG_OUTDATED`.
6. duplicate idempotency with different payload -> 409 `IDEMPOTENCY_CONFLICT`.
7. invalid tool arguments -> `MODEL_TOOL_PARSE_ERROR`, TS writes model-visible repair result.
8. provider context overflow -> `CONTEXT_OVERFLOW`, TS compresses then retries once.
9. SSE connection dropped -> `STREAM_DROPPED`, no duplicate tool execution.
10. invalid history sequence -> `MESSAGE_HISTORY_INVALID_SEQUENCE`, no provider call.
