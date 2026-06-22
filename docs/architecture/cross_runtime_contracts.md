# OpenHarness Cross Runtime Contracts

> 状态：v1 草稿  
> 范围：TS Runtime 与 Java Backend 之间的 cache hints、trace headers、catalog version、idempotency、API version 契约。

## 1. API Version

所有业务 API 必须使用 `/api/v1/` 前缀。

例外：

```text
GET /actuator/health
```

## 2. Required Headers

TS -> Java 的所有 `/api/v1/**` 请求必须带：

```text
Authorization: Bearer <service-token>
X-Trace-Id: <trace-id>
X-Request-Id: <request-id>
X-User-Id: <user-id>
X-Tenant-Id: <tenant-id>
X-Agent-Id: <agent-id optional>
```

缺失任一必需 header：Java 返回 `401 AUTH_MISSING_HEADER`。

## 3. Cache Hints Contract

### 3.1 决策归属

| 动作 | Owner |
|---|---|
| 选择哪些 canonical messages 作为 cache breakpoint | TS Runtime |
| 判断 provider 是否支持 cache | Java Backend |
| 将 cache hint 渲染成 provider-specific payload | Java Backend |
| usage/cache token 归一化 | Java Backend |

### 3.2 Schema

```ts
interface CacheHint {
  messageIndexFromTail: number; // 1 = last message
  scope: "message" | "tool_result_block";
}

interface ModelChatRequestMeta {
  cacheEnabled: boolean;
  cacheHints?: CacheHint[];
  provider?: string;
  catalogVersion?: string;
  catalogHash?: string;
  promptId?: string;
  promptVersion?: string;
  context?: {
    builder: "default";
    selectedMessages: number;
    estimatedTokens: number;
    budgetTokens: number;
    layers: string[];
    truncated: boolean;
  };
}
```

### 3.3 TS selection rule

1. TS Runtime 先通过 ContextBuilder 生成本次 model call 的 selected messages。
2. 从 selected messages 尾部扫描。
3. 跳过 `systemInjected=true`、`transient=true`、`compressionInstruction=true`。
4. 选择最多 2 条。
5. `role:"tool"` 使用 `scope:"tool_result_block"`。
6. 其它 message 使用 `scope:"message"`。
7. `cacheHints=[]` 时 Java 必须禁用本次 prompt cache，不得报错。
8. TS 不得发送超过 2 条 hints；若超过 2 条，Java 行为未定义，contract test 应拒绝该 payload。

### 3.3.1 ContextBuilder metadata

`meta.context` 是 TS Runtime 对本次 model call 上下文选择的观测字段。Java Backend MUST accept and ignore unknown future context fields; provider adapters MUST NOT use this metadata as prompt content.

`meta.promptId` and `meta.promptVersion` identify the PromptRegistry asset prepended by TS Runtime. Java Backend MUST pass this metadata through observability paths when available, but MUST NOT alter prompt text based on it.

Current fields:

| Field | Meaning |
|---|---|
| `builder` | ContextBuilder implementation name. Current value is `"default"`. |
| `selectedMessages` | Number of messages sent in `ModelChatRequest.messages`. |
| `estimatedTokens` | TS approximate token estimate for selected messages. |
| `budgetTokens` | Configured model context budget. |
| `layers` | Context layers that contributed messages, such as `compressed_summary` and `recent_messages`. |
| `truncated` | Whether stable history was omitted or the selected context exceeded budget due to newest-message fallback. |

### 3.3.2 ContextBuilder selection rule

1. Preserve `compressedSummary=true` messages before recent messages.
2. Fill remaining budget with newest stable non-summary messages.
3. Preserve chronological order in the selected output.
4. If the newest stable message alone exceeds budget, include it and set `truncated=true`.
5. Do not write selected context back into `HistoryStore`.

### 3.4 Java rendering rule

Anthropic：

1. regular message：在最后 content block 上加 `cache_control:{type:"ephemeral"}`。
2. tool result：必须 hoist 到 `tool_result` block 级别。
3. 如果一个 Anthropic user message 内含多个 `tool_result` block，`scope:"tool_result_block"` 标记该 message 内最后一个 `tool_result` block。
4. 禁止把 cache_control 留在 inner text block。
5. Anthropic provider 当前 cache breakpoints 上限为 4；OpenHarness P0/P1 只允许 TS 选择 2 条 hints，给 provider adapter 留 2 个安全余量。

Bedrock：

1. 先 canonical -> Bedrock API message。
2. 再 merge consecutive tool results。
3. 最后将 `cachePoint` 加到 message content 顶层 sibling。
4. 禁止将 `cachePoint` 放入 `toolResult.content`。

## 4. Catalog Version Contract

`GET /api/v1/tools/catalog` 返回：

```json
{
  "catalogVersion": "2026-05-19T10:00:00Z",
  "catalogHash": "sha256:...",
  "tools": []
}
```

TS 每次 `/api/v1/tools/execute` 必须携带：

```json
{
  "catalogVersion": "...",
  "catalogHash": "..."
}
```

Java 执行前校验：

| 情况 | 响应 |
|---|---|
| version/hash 匹配 | 继续 |
| version/hash 不匹配 | `409 CATALOG_OUTDATED` |

## 5. Idempotency Contract

### 5.1 Tool execution key

默认幂等键：

```text
idempotencyKey = requestId + ":" + toolCallId
```

Java 保存 24h 内存/DB 记录：

```text
(tenantId, idempotencyKey) -> ToolCallResponse
```

重复请求返回原结果，并设置：

```json
{ "idempotentReplay": true }
```

### 5.2 Model chat key

模型请求可选幂等键：

```text
requestId + ":model:" + modelCallSequence
```

P0a 只对 tool execute 强制幂等；model chat 重复请求允许重复扣 token，必须在 README/运行日志中标注 dev limitation。P1 扩展到 model chat 防止重复扣费。

## 6. Trace Propagation

1. P0b 起 Frontend 在用户提交输入时生成 root `X-Trace-Id`，并传给 TS。
2. P0a dev 模式可允许 Frontend 不传 `X-Trace-Id`，由 TS 生成；该行为不得进入 staging/prod。
3. TS 调 Java 必须透传同一个 `X-Trace-Id`。
4. Java 生成 backend span 时 parentSpanId 指向 TS span。
5. 所有 TraceEvent 必须带 `traceId/requestId/conversationId/userId/tenantId`。

## 7. CORS Contract

P0a/P0b TS Runtime 必须：

1. 只允许 `FRONTEND_URL` 配置的 origin。
2. 允许 headers：`Content-Type`、`Authorization`、`X-Trace-Id`、`X-Request-Id`、`X-User-Id`、`X-Tenant-Id`、`X-Mock-Fixture`。
3. expose headers：`X-Trace-Id`、`X-Request-Id`。
4. 禁止 `Access-Control-Allow-Origin: *` 搭配 credential。

Java Backend 不向 browser 暴露 CORS；Frontend 不得直连 Java 敏感 API。

## 8. SSE Event Types

P0b `POST /api/v1/agent/chat/stream` 的 SSE message types：

```text
thinking
model_call
tool_call
tool_result
final_answer
ask_user
error
```

SSE event schema：

```ts
interface AgentStreamEvent {
  type: "thinking" | "model_call" | "tool_call" | "tool_result" | "final_answer" | "ask_user" | "error";
  traceId: string;
  requestId: string;
  conversationId: string;
  sequence: number;
  payload: Record<string, unknown>;
}
```

`error` event payload 必须使用 `StructuredError`。

## 9. Contract Tests

1. TS zod schema parse Java example response。
2. Java DTO parse TS fixture JSON。
3. cacheHints fixture 生成 Anthropic tool_result block-level cache_control。
4. duplicate idempotencyKey returns original result。
5. catalog mismatch returns 409.
6. `cacheHints=[]` disables cache without error.
7. SSE event `sequence` monotonically increases within one stream.
