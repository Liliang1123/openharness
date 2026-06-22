# OpenHarness Trace Schema

> 状态：v1 草稿  
> 目的：定义 OTel 兼容 TraceEvent 字段和三层 runtime 事件枚举。

## 1. TraceEvent Schema

```ts
interface TraceEvent {
  traceId: string;
  spanId: string;
  parentSpanId?: string;
  requestId: string;
  conversationId: string;
  taskId?: string;
  userId: string;
  tenantId: string;
  agentId?: string;
  runtime: "frontend" | "agent-runtime" | "backend";
  eventType: string;
  name: string;
  attributes?: Record<string, unknown>;
  status: "ok" | "error" | "timeout";
  errorClass?: string;
  errorMessage?: string;
  startTime: number;
  endTime?: number;
  durationMs?: number;
  promptTokens?: number;
  completionTokens?: number;
  cacheReadTokens?: number;
  cacheWriteTokens?: number;
  costUsdMicros?: number;
  redacted?: boolean;
}
```

## 2. Span Rules

1. Frontend creates root `traceId` when the user submits input.
2. Frontend sends the same `X-Trace-Id` to TS; TS must reuse it and must not generate a new traceId in P0b+.
3. P0a dev mode may allow TS-generated traceId when frontend omits it.
4. Frontend events use runtime `frontend`.
5. TS node events use runtime `agent-runtime`.
6. Java model/tool/policy events use runtime `backend`.
7. Java span `parentSpanId` points to the TS client-call span.
8. `traceId` must be identical across all runtimes.
9. Idempotent replay for tool execution emits only `TOOL_CALL_END` with `attributes.idempotentReplay=true`; it must not emit a second `TOOL_CALL_START`.

## 3. Frontend Events

```text
USER_INPUT_SUBMITTED
SSE_CONNECTED
SSE_CHUNK_RECEIVED
SSE_COMPLETED
SSE_ERROR
APPROVAL_RENDERED
APPROVAL_CLICKED
ASK_USER_REPLIED
```

## 4. Agent Runtime Events

```text
AGENT_START
LOAD_CONTEXT_START
LOAD_CONTEXT_END
MODEL_NODE_START
MODEL_NODE_END
TOOL_DECISION
AGENT_POLICY_EVALUATE_START
AGENT_POLICY_EVALUATE_END
ASK_USER_PENDING
ASK_USER_RESUMED
TOOL_EXECUTE_REQUEST
OBSERVE_TOOL_RESULT
FINAL_ANSWER
AGENT_END
STEP_START
STEP_END
STEP_BUDGET_EXHAUSTED
```

### 4.1 STEP Events

Multi-step loop events emitted by `AgentLoop` and `AgentStreamLoop`:

| Event | When emitted | Key attributes |
|-------|-------------|----------------|
| `STEP_START` | At the beginning of every step (model call + optional tool batch) | `stepIndex: number` |
| `STEP_END` | After a tool batch completes within a step. **Not emitted** when the step ends with a final answer (no tool calls). | `stepIndex: number` |
| `STEP_BUDGET_EXHAUSTED` | When the loop exits because `stepIndex >= stepBudget` | `stepBudget: number` |

All events may include `stepIndex: number` in `attributes` to identify which step they belong to.

`FINAL_ANSWER` and `AGENT_END` include `attributes.stopReason`. Normal completion uses `"FINAL_ANSWER"`. Runtime terminal errors use the `RuntimeTerminalError` class listed below.

### 4.2 ContextBuilder Model Metadata

Before `MODEL_NODE_START` / Java model calls, TS Runtime builds selected model context from stable history. The selected context is reported on `ModelChatRequest.meta.context` rather than as a trace event payload:

```ts
interface ContextBuildMeta {
  builder: "default";
  selectedMessages: number;
  estimatedTokens: number;
  budgetTokens: number;
  layers: string[];
  truncated: boolean;
}
```

This metadata is operational telemetry for model-call debugging. It is not prompt content and MUST NOT be persisted as a stable history message.

Model requests may also include `meta.promptId` and `meta.promptVersion`. These fields identify the system prompt selected by TS Runtime for audit and rollback; Java provider adapters must not use them to append or rewrite prompt bytes.

### 4.3 Session Events SSE Names

`RuntimeEventStore` emits wire-level session events for main stream and replay stream:

```text
agent_start
model_call_start
model_call_end
tool_call
tool_result
approval_requested
step_budget_exhausted
final_answer
agent_end
stream_done
stream_error
stream_resync_required
```

Every session event carries `eventId`, `executionId`, `conversationId`, `tenantId`, `traceId`, `requestId`, `createdAt`, and event-specific `data`.

### 4.4 RuntimeTerminalError

Terminal runtime errors are emitted in `stream_error.data.errorClass`, persisted in `ExecutionState.endReason`, and mirrored into trace attributes when applicable:

```text
MODEL_ERROR
TOOL_ERROR
POLICY_DENY
APPROVAL_TIMEOUT
EXECUTION_TIMEOUT
STEP_BUDGET_EXHAUSTED
EVENT_REPLAY_GAP
EXECUTION_ABORTED
EMPTY_MODEL_RESPONSE
```

`stream_done` is reserved for `FINAL_ANSWER`. `stream_resync_required` is reserved for session event cursor gaps.

## 5. Backend Events

```text
MODEL_CALL_START
MODEL_CALL_END
MODEL_CALL_RETRY
PROVIDER_ERROR
TOOL_CALL_START
TOOL_CALL_END
TOOL_PERMISSION_DENY
BACKEND_POLICY_EVALUATE_START
BACKEND_POLICY_EVALUATE_END
AUDIT_ALLOW
AUDIT_DENY
CATALOG_FETCH
CATALOG_MISMATCH
```

Event enum names must not overlap across the three layers. Similar semantic concepts use layer prefixes, then are grouped by `runtime`.

## 6. Redaction

P0:

1. Do not store provider API keys.
2. Do not store Authorization header.
3. Large input/output may be replaced with size metadata.
4. Any `attributes` field value larger than 4KB must be replaced with:

```json
{
  "truncated": true,
  "sizeBytes": 12345,
  "sha256": "..."
}
```

P1:

1. PII redactor before persistence.
2. `redacted=true` when attributes are modified.

## 7. Acceptance Tests

1. Single chat request produces at least frontend + agent-runtime + backend events.
2. All events share same `traceId`.
3. Backend event has parentSpanId equal to TS client-call spanId.
4. Error event includes `errorClass`.
5. No event contains `Authorization` value.
6. Idempotent replay emits one end event with `attributes.idempotentReplay=true` and no duplicate start event.
7. Attributes over 4KB are redacted to `{truncated,sizeBytes,sha256}`.
