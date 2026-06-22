# Agent Runtime 完整性与稳定性提升最终方案

> 来源：对 `docs/superpowers/plans/agent-runtime-stability-plan-2026-05-25.md` 的 review 后修正版。  
> 状态：最终参考方案，尚未 OpenSpec 批准，不能直接作为实施计划执行。  
> 适用范围：`agent-runtime` 后续 execution lifecycle、session event recovery、approval recovery 和运行时稳定性优化。

## 结论

有风险：方向正确，但必须先走 OpenSpec。该方案涉及新增 API、SSE 协议、执行生命周期、审批恢复、HistoryStore 语义和 terminal error 行为，均属于外部可见或架构语义变化。批准前不得把它作为 `docs/superpowers/plans/` 下的可执行计划。

最终目标是在不推翻现有架构边界的前提下补齐 Agent Runtime 的完整性与稳定性：

- Frontend 只调用 TS Runtime。
- TS Runtime 继续拥有 Agent Loop、History、ToolRegistry、beforeToolUse、streaming、step trace。
- Java Backend 继续负责 Model Gateway、Provider Adapter、Tool Catalog、Tool Execution、Policy、Auth、Idempotency、Trace Ingestion。

## Review 范围

- `docs/superpowers/plans/agent-runtime-stability-plan-2026-05-25.md`
- `docs/vision/agent-runtime-stability-implementation-reference-2026-05-25.md`
- `docs/vision/v1-v2-chat-sse-summary-2026-05-25.html`
- `CONTEXT.md`
- `agent-runtime/src/agentLoop.ts`
- `agent-runtime/src/agentStreamLoop.ts`
- `agent-runtime/src/server.ts`

## 主要修正

### 1. 文档位置

未批准方案不得放在 `docs/superpowers/plans/` 冒充可执行计划。Review 后方案应落在 `docs/review/`；OpenSpec 批准后，再生成真正的 `docs/superpowers/plans/YYYY-MM-DD-<change-id>.md`。

### 2. Session Events 必须是 SSE 协议

`GET /api/v1/sessions/:conversationId/events?last_event_id=...` 不能设计成普通 JSON list。它必须是会话事件 SSE：

1. 连接建立。
2. 根据 `last_event_id` replay missed events。
3. replay 完成后继续推 live events。
4. cursor gap 时推 `stream_resync_required`。
5. terminal 时推 `stream_done` 或 `stream_error`。
6. 长连接期间发送 heartbeat。

### 3. RuntimeEventStore 必须支持订阅

仅有 `append/since/latestEventId` 不足以支撑 stream adapter。至少需要：

```typescript
interface RuntimeEventStore {
  append(tenantId: string, conversationId: string, event: SessionEvent): void;
  since(tenantId: string, conversationId: string, afterEventId: EventId): SessionEvent[];
  latestEventId(tenantId: string, conversationId: string): EventId | null;
  subscribe(
    tenantId: string,
    conversationId: string,
    listener: (event: SessionEvent) => void
  ): () => void;
}
```

实现时必须定义 replay 与 live event 的顺序保证：先 replay，再订阅 live，且不能漏掉 replay 与 subscribe 之间的事件。

### 4. OpenSpec 门禁不得低估

以下都必须进入 OpenSpec：

- `executionId` 和 `ExecutionState`。
- active execution lock。
- session events SSE。
- 主 stream 增加 `eventId` 和 `executionId`。
- `stream_snapshot`、`stream_done`、`stream_error`、`stream_resync_required`、`approval_requested`。
- abort API。
- approval recovery API。
- `REQUIRE_APPROVAL` 从写入 `PENDING_APPROVAL` 改为暂停 execution。
- HistoryStore 只保存稳定消息。
- terminal error class。
- approval timeout 和 execution timeout。

## 最终方案

### Phase 0：OpenSpec Gate

先创建 OpenSpec change：

```text
change-id: add-execution-lifecycle-and-stream-recovery
```

OpenSpec 至少覆盖：

- 新增 API：session events SSE、abort execution、approval recovery。
- 修改 API/SSE：主 stream 事件新增 `eventId`、`executionId`。
- 新增状态模型：`ExecutionState`、active execution、terminal status。
- 新增事件模型：`RuntimeEventKind`、`SessionEvent`。
- 修改审批语义：`REQUIRE_APPROVAL` 暂停 execution 并可恢复。
- 修改持久化语义：HistoryStore 只保存稳定消息。
- 修改错误语义：runtime terminal error 和 timeout。

### Phase 1：事件协议与 ID 体系

目标：先把事件协议打稳。

涉及文件使用 repo-relative path：

- `agent-runtime/src/types.ts`
- `agent-runtime/src/agentStreamLoop.ts`
- `agent-runtime/src/server.ts`
- `agent-runtime/src/runtimeEventStore.ts`

实施点：

- 定义 `ExecutionId`、`EventId`、`RuntimeEventKind`、`SessionEvent`。
- 每次 agent turn 生成一个 `executionId`。
- 主 stream 每个事件都带 `eventId`、`executionId`、`conversationId`、`traceId`、`requestId`、`createdAt`。
- 新增 `RuntimeEventStore`，支持 append、since、latestEventId、subscribe。
- 新增 session events SSE endpoint：`GET /api/v1/sessions/:conversationId/events?last_event_id=...`。
- 连接建立后先 replay missed events，再持续推 live events。
- cursor gap 时推 `stream_resync_required`。
- terminal 时推 `stream_done` 或 `stream_error`。
- 增加 heartbeat。

验收：

- 主 stream 事件可关联到同一个 `executionId`。
- session events 能 replay 缺失事件。
- cursor 过旧时收到 `stream_resync_required`。
- session events 是 SSE，不是普通 JSON list。

### Phase 2：Detached Runner

目标：解耦 HTTP 连接和 agent execution 生命周期。

涉及文件：

- `agent-runtime/src/agentExecutionRunner.ts`
- `agent-runtime/src/agentStreamLoop.ts`
- `agent-runtime/src/executionStateStore.ts`
- `agent-runtime/src/server.ts`

实施点：

- 新增 `AgentExecutionRunner`，承载真正 loop 执行逻辑。
- Runner 不持有 `FastifyReply`，只写 `RuntimeEventStore` 和 `HistoryStore`。
- `agentStreamLoop.ts` 退化为 HTTP/SSE adapter。
- 主 stream 断开时只停止写当前连接，不取消 runner。
- 新增 `ExecutionStateStore`，维护 `executionId`、`conversationId`、`tenantId`、`status`、`startedAt`、`updatedAt`、`endedAt`、`abortController`。
- 新增 abort endpoint：`POST /api/v1/sessions/:conversationId/executions/:executionId/abort`。

验收：

- 客户端断开主 stream 后，execution 继续运行。
- 最终 assistant message 仍落入 HistoryStore。
- 客户端重连 session events 能看到后续 terminal event。
- abort 和普通断线能区分。

### Phase 3：运行锁与审批恢复

目标：同会话运行态可控，审批可恢复。

涉及文件：

- `agent-runtime/src/executionStateStore.ts`
- `agent-runtime/src/agentExecutionRunner.ts`
- `agent-runtime/src/approvalStore.ts`
- `agent-runtime/src/server.ts`

实施点：

- 同一 `tenantId + conversationId` 默认只允许一个 active execution。
- 新请求到达时：
  - `running` 返回 `409 Conflict`。
  - `waiting_approval` 返回 `409 pending approval`。
  - terminal 后允许新 execution。
- 新增 `ApprovalStore`。
- `beforeToolUse` 返回 `REQUIRE_APPROVAL` 时：
  - execution 状态变为 `waiting_approval`。
  - 发送 `approval_requested`。
  - runner 暂停等待 approval promise。
- 新增 approval endpoint：`POST /api/v1/sessions/:conversationId/executions/:executionId/approvals/:toolCallId`。
- body 支持 `approve`、`reject`、`revise`。
- 现有 `POST /api/v1/agent/ask-user/:askUserId/reply` 进入兼容期，不直接破坏。

验收：

- approve 后工具执行，loop 继续。
- reject 后写结构化拒绝结果，loop 可继续让模型解释。
- revise 后使用 revised arguments 执行工具。
- 页面刷新后仍能通过 session events 看到 pending approval 并继续处理。

### Phase 4：稳定性治理与收敛

目标：把错误、超时、History 分层和重复 loop 收敛干净。

实施点：

- 定义 `RuntimeTerminalError`：
  - `MODEL_ERROR`
  - `TOOL_ERROR`
  - `POLICY_DENY`
  - `APPROVAL_TIMEOUT`
  - `STEP_BUDGET_EXHAUSTED`
  - `EVENT_REPLAY_GAP`
  - `EXECUTION_ABORTED`
  - `EMPTY_MODEL_RESPONSE`
- approval timeout 和 execution timeout 必须进入 OpenSpec。
- 数据分层：
  - `RuntimeEventStore`：token delta、tool progress、approval event、snapshot。
  - `ExecutionStateStore`：active execution、status、snapshot、lock。
  - `HistoryStore`：稳定 user / assistant / completed tool result。
- `PENDING_APPROVAL` 不再写 HistoryStore。
- 压缩只处理稳定 HistoryStore。
- 合并 `agentLoop.ts` 和 `agentStreamLoop.ts` 重复逻辑：
  - runner 承载公共执行逻辑。
  - non-stream API 是 runner 的同步包装。
  - stream API 是 event adapter。

验收：

- 主 stream 断线不误取消 execution。
- `last_event_id` 可恢复缺失事件。
- cursor gap 有 `stream_resync_required`。
- 同会话不会并发写乱 HistoryStore。
- 审批可暂停、刷新后恢复、继续执行。
- terminal error 可通过 session events 和 trace 观察。
- HistoryStore 不保存运行中草稿。
- trace、compression、非关键事件失败不阻断最终回复。

## 后续门禁

下一步不是直接写代码，而是创建并验证 OpenSpec change：

```bash
openspec validate add-execution-lifecycle-and-stream-recovery --strict --no-interactive
```

OpenSpec 获批后，再生成 `docs/superpowers/plans/YYYY-MM-DD-add-execution-lifecycle-and-stream-recovery.md` 作为真正实施计划。
